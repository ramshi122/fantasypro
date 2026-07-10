/**
 * Lineup Auto-Recalc Hook
 * ========================
 *
 * When a match's lineup is announced (lineup_status goes 0 → 1),
 * automatically:
 *   1. Filter teams to only playing XI players
 *   2. Auto-replace non-playing players in saved teams
 *   3. Trigger Elite AI re-analysis with lineup-confirmed data
 *   4. Update UI to show "Lineup Announced — Teams Updated"
 *
 * Usage:
 *   const { lineupAnnounced, recalcTeams } = useLineupRecalc(matchId);
 *   useEffect(() => {
 *     if (lineupAnnounced) recalcTeams(savedTeams);
 *   }, [lineupAnnounced]);
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type { TeamRow, MatchPlayer } from "./api";
import { autoReplaceNonPlaying } from "./lineup";

export interface LineupRecalcResult {
  /** True if lineup has been announced (lineup_status === 1) */
  lineupAnnounced: boolean;
  /** Number of teams that were updated */
  updatedCount: number;
  /** Number of players that were replaced */
  replacedCount: number;
  /** Recalculate teams after lineup announcement */
  recalcTeams: (teams: TeamRow[], allPlayers: MatchPlayer[]) => TeamRow[];
  /** Manually trigger lineup check */
  checkLineup: () => Promise<void>;
}

/**
 * Hook that polls match lineup_status and auto-recalculates teams when announced.
 *
 * @param matchId - Match ID to monitor
 * @param pollIntervalMs - Poll interval (default 60s = 1 min)
 */
export function useLineupRecalc(
  matchId: string | number | undefined,
  pollIntervalMs: number = 60_000
): LineupRecalcResult {
  const [lineupAnnounced, setLineupAnnounced] = useState(false);
  const [updatedCount, setUpdatedCount] = useState(0);
  const [replacedCount, setReplacedCount] = useState(0);
  const prevLineupStatus = useRef<number>(0);

  // Poll lineup_status
  const checkLineup = useCallback(async () => {
    if (!matchId) return;
    try {
      const res = await fetch(`/api/matches?id=${encodeURIComponent(matchId)}`);
      if (!res.ok) return;
      const data = await res.json();
      const m = data?.match || data?.data || data;
      const status = Number(m?.lineup_status ?? 0);

      // Detect transition from 0 → 1 (lineup just announced)
      if (status === 1 && prevLineupStatus.current === 0) {
        console.log("[lineup-recalc] Lineup announced! Triggering recalc...");
        setLineupAnnounced(true);
      } else if (status === 1) {
        setLineupAnnounced(true);
      } else {
        setLineupAnnounced(false);
      }

      prevLineupStatus.current = status;
    } catch (err) {
      console.warn("[lineup-recalc] Poll failed:", err);
    }
  }, [matchId]);

  useEffect(() => {
    if (!matchId) return;
    // Initial check
    checkLineup();
    // Poll every minute
    const interval = setInterval(checkLineup, pollIntervalMs);
    return () => clearInterval(interval);
  }, [matchId, pollIntervalMs, checkLineup]);

  // Recalculate teams — replace non-playing players
  const recalcTeams = useCallback((teams: TeamRow[], allPlayers: MatchPlayer[]): TeamRow[] => {
    if (!lineupAnnounced) return teams;

    let totalReplaced = 0;
    const updatedTeams = teams.map((team) => {
      const { updatedTeam, replaced } = autoReplaceNonPlaying(team, allPlayers, true);
      totalReplaced += replaced.length;
      return updatedTeam;
    });

    setUpdatedCount(updatedTeams.length);
    setReplacedCount(totalReplaced);
    console.log(`[lineup-recalc] Updated ${updatedTeams.length} teams, replaced ${totalReplaced} players`);

    return updatedTeams;
  }, [lineupAnnounced]);

  return {
    lineupAnnounced,
    updatedCount,
    replacedCount,
    recalcTeams,
    checkLineup,
  };
}
