/**
 * Multi-Match Team Generator
 * ==========================
 * Generates teams for MULTIPLE matches at once, in batch.
 *
 * For each match in the input list:
 *   - Fetches match details (player pool + team names)
 *   - Calls the existing `generateSweep()` from sweep-generator.ts
 *   - Reports progress via a callback (per-match + per-batch)
 *
 * This is an ADDITIVE module — it wraps the existing single-match generator
 * with a batch loop. It does NOT modify `generateSweep()` itself.
 *
 * Public API:
 *   - generateMultiMatch(opts): Promise<MultiMatchResult>
 *
 * Example:
 *   const result = await generateMultiMatch({
 *     matchIds: ["123", "456"],
 *     count: 20,
 *     mode: "smart",
 *     onProgress: (p) => console.log(p),
 *   });
 */

import type { MatchPlayer, TeamRow } from "./api";
import {
  generateSweep,
  type SweepCount,
  type SweepProgress,
} from "./sweep-generator";

/* ---------- Types ---------- */

export type MultiMatchMode = "smart" | "gl" | "advanced" | "combination";

export interface MultiMatchInput {
  matchId: string;
  matchName?: string;
  players?: MatchPlayer[]; // preloaded players; if absent, fetched from /api/matches
  team1Name?: string;
  team2Name?: string;
}

export interface MultiMatchProgress {
  type: "match_start" | "match_progress" | "match_done" | "match_failed" | "batch_done";
  matchId: string;
  matchName?: string;
  index: number;
  total: number;
  generated?: number;
  requested?: number;
  message?: string;
  error?: string;
  overallPct: number; // 0-100
}

export interface MultiMatchResultEntry {
  matchId: string;
  matchName?: string;
  ok: boolean;
  teams: TeamRow[];
  count: number;
  durationMs: number;
  error?: string;
}

export interface MultiMatchResult {
  ok: boolean;
  totalMatches: number;
  succeeded: number;
  failed: number;
  totalTeamsGenerated: number;
  durationMs: number;
  entries: MultiMatchResultEntry[];
}

export interface GenerateMultiMatchOpts {
  matches: MultiMatchInput[];
  count: SweepCount;
  mode?: MultiMatchMode;
  onProgress?: (p: MultiMatchProgress) => void;
  /** Optional override for fetching match details (for tests). */
  fetchMatchDetail?: (matchId: string) => Promise<{
    players?: MatchPlayer[];
    team1Name?: string;
    team2Name?: string;
  }>;
}

/* ---------- Default match-detail fetcher ---------- */

async function defaultFetchMatchDetail(matchId: string): Promise<{
  players?: MatchPlayer[];
  team1Name?: string;
  team2Name?: string;
}> {
  try {
    const res = await fetch(
      `/api/match-detail?matchId=${encodeURIComponent(matchId)}`
    );
    if (!res.ok) return {};
    const data = await res.json();
    const m = data?.match || data?.data || data;
    const players: MatchPlayer[] =
      m?.left_team_players || m?.right_team_players
        ? [
            ...((m?.left_team_players as MatchPlayer[]) || []),
            ...((m?.right_team_players as MatchPlayer[]) || []),
          ]
        : (m?.players as MatchPlayer[]) || [];
    return {
      players,
      team1Name:
        (m?.team1Short as string) ||
        (m?.left_team_name as string) ||
        (typeof m?.team1 === "string" ? m.team1 : (m?.team1 as any)?.name) ||
        "T1",
      team2Name:
        (m?.team2Short as string) ||
        (m?.right_team_name as string) ||
        (typeof m?.team2 === "string" ? m.team2 : (m?.team2 as any)?.name) ||
        "T2",
    };
  } catch {
    return {};
  }
}

/* ---------- Core batch generator ---------- */

/**
 * Generate teams for multiple matches at once.
 *
 * Iterates over `matches` sequentially (so the progress callback fires in
 * order). Each match runs `generateSweep()` with the supplied count + mode.
 *
 * Returns a summary with per-match entries.
 */
export async function generateMultiMatch(
  opts: GenerateMultiMatchOpts
): Promise<MultiMatchResult> {
  const {
    matches,
    count,
    mode = "smart",
    onProgress,
    fetchMatchDetail = defaultFetchMatchDetail,
  } = opts;

  const startedAt = Date.now();
  const total = matches.length;
  const entries: MultiMatchResultEntry[] = [];
  let succeeded = 0;
  let failed = 0;
  let totalTeamsGenerated = 0;

  for (let i = 0; i < total; i++) {
    const m = matches[i];
    const matchStartedAt = Date.now();

    onProgress?.({
      type: "match_start",
      matchId: m.matchId,
      matchName: m.matchName,
      index: i,
      total,
      overallPct: (i / total) * 100,
      message: `Starting generation for ${m.matchName || m.matchId}`,
    });

    try {
      // Resolve players: prefer the ones passed in, else fetch
      let players = m.players;
      let team1Name = m.team1Name;
      let team2Name = m.team2Name;

      if (!players || players.length === 0) {
        const detail = await fetchMatchDetail(m.matchId);
        players = players || detail.players;
        team1Name = team1Name || detail.team1Name;
        team2Name = team2Name || detail.team2Name;
      }

      if (!players || players.length < 11) {
        throw new Error(
          `Insufficient players (${players?.length || 0}) for match ${m.matchId}`
        );
      }

      // Run the existing single-match generator
      const sweepProgressCb = (p: SweepProgress) => {
        onProgress?.({
          type: "match_progress",
          matchId: m.matchId,
          matchName: m.matchName,
          index: i,
          total,
          generated: p.generated,
          requested: p.total,
          overallPct: ((i + p.generated / p.total) / total) * 100,
          message: p.message,
        });
      };

      const result = await generateSweep(
        players,
        count,
        team1Name || "T1",
        team2Name || "T2",
        sweepProgressCb,
        mode
      );

      const entry: MultiMatchResultEntry = {
        matchId: m.matchId,
        matchName: m.matchName,
        ok: true,
        teams: result.teams,
        count: result.teams.length,
        durationMs: Date.now() - matchStartedAt,
      };
      entries.push(entry);
      succeeded += 1;
      totalTeamsGenerated += entry.count;

      onProgress?.({
        type: "match_done",
        matchId: m.matchId,
        matchName: m.matchName,
        index: i,
        total,
        generated: entry.count,
        requested: count,
        overallPct: ((i + 1) / total) * 100,
        message: `Generated ${entry.count} teams for ${m.matchName || m.matchId}`,
      });
    } catch (err: any) {
      const errMsg = String(err?.message || err || "Unknown error");
      failed += 1;
      entries.push({
        matchId: m.matchId,
        matchName: m.matchName,
        ok: false,
        teams: [],
        count: 0,
        durationMs: Date.now() - matchStartedAt,
        error: errMsg,
      });

      onProgress?.({
        type: "match_failed",
        matchId: m.matchId,
        matchName: m.matchName,
        index: i,
        total,
        overallPct: ((i + 1) / total) * 100,
        error: errMsg,
        message: `Failed: ${errMsg}`,
      });
    }

    // Yield to the event loop between matches so the UI can paint
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }

  onProgress?.({
    type: "batch_done",
    matchId: "",
    index: total,
    total,
    overallPct: 100,
    message: `Batch complete — ${succeeded}/${total} matches, ${totalTeamsGenerated} teams`,
  });

  return {
    ok: failed === 0,
    totalMatches: total,
    succeeded,
    failed,
    totalTeamsGenerated,
    durationMs: Date.now() - startedAt,
    entries,
  };
}
