/**
 * Lineup Management Helpers
 * -------------------------
 * Handles pre-lineup vs post-lineup states:
 *  - Before lineup: all players visible, no restrictions
 *  - After lineup: only confirmed playing XI shown, non-playing hidden
 */

import type { MatchInfo, MatchPlayer, TeamRow } from "./api";

/**
 * Check if the official lineup has been announced for a match.
 * lineup_status: 0 = not announced, 1 = announced
 */
export function isLineupAnnounced(match: MatchInfo | null): boolean {
  if (!match) return false;
  return (match as any).lineup_status === 1;
}

/**
 * Get the player ID string from a MatchPlayer.
 * Handles multiple ID field names: player_fixed_id, pl_id, pid, id, _id
 */
export function playerId(p: MatchPlayer | any): string {
  return String(
    p?.player_fixed_id ??
    p?.pl_id ??
    p?.pid ??
    p?.id ??
    p?._id ??
    p?.name ??
    ""
  );
}

/**
 * Normalize a player ID for comparison (lowercase, trim).
 * This handles cases where same player has different ID formats in team vs match detail.
 */
function normalizeId(id: string): string {
  return String(id || "").trim().toLowerCase();
}

/**
 * Filter players to only show confirmed playing XI after lineup is announced.
 * Before lineup, returns all players EXCEPT those explicitly marked as not playing.
 *
 * SECURITY: Even before lineup, if a player has playing === 0 or playing === -1,
 * they are EXCLUDED. This prevents offline/injured/dropped players from being
 * included in generated teams.
 */
export function filterPlayingPlayers(
  players: MatchPlayer[],
  lineupAnnounced: boolean
): MatchPlayer[] {
  if (!lineupAnnounced) {
    // Pre-lineup: exclude players EXPLICITLY marked as not playing
    // playing === 0, -1, "false", "no" → excluded
    // playing === undefined → kept (unknown status, might play)
    // playing === 1 → kept (confirmed playing)
    return players.filter((p) => {
      const playing = p.playing;
      if (playing === 0 || playing === -1 || playing === "false" || playing === "no") {
        return false; // Explicitly not playing
      }
      return true;
    });
  }
  // After lineup: ONLY playing === 1 — NO EXCEPTIONS
  return players.filter((p) => Number(p.playing) === 1);
}

/**
 * Check if a player is confirmed playing (after lineup).
 * Before lineup, all players are considered "available".
 */
export function isPlayerConfirmed(p: MatchPlayer, lineupAnnounced: boolean): boolean {
  if (!lineupAnnounced) return true; // all available before lineup
  return Number(p.playing) === 1;
}

/**
 * Check if a team contains any non-playing players (after lineup).
 * Returns the list of non-playing players in the team.
 *
 * FIX: Uses normalized ID comparison to handle ID format mismatches
 * between team players and match detail players.
 */
export function getNonPlayingPlayersInTeam(
  team: TeamRow,
  lineupAnnounced: boolean,
  playingPlayerIds: Set<string>
): MatchPlayer[] {
  if (!lineupAnnounced) return [];

  // Build normalized set of playing IDs for fast lookup
  const playingIdsNormalized = new Set(
    Array.from(playingPlayerIds).map(normalizeId)
  );

  const players = (team.players || []) as unknown as MatchPlayer[];
  return players.filter((p) => {
    const id = playerId(p);
    const normalized = normalizeId(id);
    // Player is "non-playing" if NOT in the playing set
    return !playingIdsNormalized.has(normalized);
  });
}

/**
 * Build a set of confirmed playing player IDs from the full player list.
 */
export function buildPlayingPlayerSet(players: MatchPlayer[], lineupAnnounced: boolean): Set<string> {
  if (!lineupAnnounced) {
    // Before lineup, all players are "available"
    return new Set(players.map(playerId));
  }
  return new Set(
    players.filter((p) => Number(p.playing) === 1).map(playerId)
  );
}

/**
 * Auto-replace non-playing players in a team with the best available
 * confirmed playing alternatives.
 *
 * Strategy:
 *  - For each non-playing player, find a replacement of the SAME ROLE
 *    from the confirmed playing pool (not already in the team)
 *  - If no same-role replacement, pick any available confirmed player
 *
 * FIX: Uses normalized ID comparison + role fallback + credits fallback
 * to ensure non-playing players are always replaced when possible.
 */
export function autoReplaceNonPlaying(
  team: TeamRow,
  allPlayers: MatchPlayer[],
  lineupAnnounced: boolean
): { updatedTeam: TeamRow; replaced: Array<{ from: string; to: string }> } {
  if (!lineupAnnounced) {
    return { updatedTeam: team, replaced: [] };
  }

  // Get all confirmed playing players
  const playingPool = allPlayers.filter((p) => Number(p.playing) === 1);

  // Build normalized ID sets
  const playingIdsNormalized = new Set(playingPool.map((p) => normalizeId(playerId(p))));
  const teamPlayers = (team.players || []) as unknown as MatchPlayer[];
  const teamPlayerIdsNormalized = new Set(teamPlayers.map((p) => normalizeId(playerId(p))));

  const replaced: Array<{ from: string; to: string }> = [];
  const newPlayers: MatchPlayer[] = [];

  // Sort playing pool by credits (descending) for better replacements
  const sortedPool = [...playingPool].sort((a, b) => {
    const ca = Number((a as any).credits || 0);
    const cb = Number((b as any).credits || 0);
    return cb - ca;
  });

  for (const p of teamPlayers) {
    const id = playerId(p);
    const normalized = normalizeId(id);

    if (playingIdsNormalized.has(normalized)) {
      // Player is confirmed playing — keep
      newPlayers.push(p);
    } else {
      // Non-playing — find replacement of same role
      const role = (p as any).role ?? (p as any).role_num;
      const teamIndex = (p as any).team_index;

      // Try same role + same team first
      let candidates = sortedPool.filter(
        (c) =>
          !teamPlayerIdsNormalized.has(normalizeId(playerId(c))) &&
          (c as any).role === role &&
          (c as any).team_index === teamIndex
      );

      // Fallback 1: same role, any team
      if (candidates.length === 0) {
        candidates = sortedPool.filter(
          (c) =>
            !teamPlayerIdsNormalized.has(normalizeId(playerId(c))) &&
            (c as any).role === role
        );
      }

      // Fallback 2: same team, any role
      if (candidates.length === 0) {
        candidates = sortedPool.filter(
          (c) =>
            !teamPlayerIdsNormalized.has(normalizeId(playerId(c))) &&
            (c as any).team_index === teamIndex
        );
      }

      // Fallback 3: any available confirmed player
      if (candidates.length === 0) {
        candidates = sortedPool.filter(
          (c) => !teamPlayerIdsNormalized.has(normalizeId(playerId(c)))
        );
      }

      const replacement = candidates[0];
      if (replacement) {
        newPlayers.push(replacement);
        teamPlayerIdsNormalized.add(normalizeId(playerId(replacement)));
        replaced.push({
          from: String((p as any).name || id),
          to: String((replacement as any).name || playerId(replacement)),
        });
      } else {
        // No replacement available — keep original (will be flagged)
        newPlayers.push(p);
      }
    }
  }

  // If captain/vice-captain were replaced, pick new ones from the team
  const captainId = String(team.captain ?? team.c ?? "");
  const viceCaptainId = String(team.viceCaptain ?? team.vc ?? team.vicecaptain ?? "");
  let newCaptain = captainId;
  let newViceCaptain = viceCaptainId;

  if (!playingIdsNormalized.has(normalizeId(captainId)) && newPlayers.length > 0) {
    newCaptain = playerId(newPlayers[0]);
  }
  if (!playingIdsNormalized.has(normalizeId(viceCaptainId)) && newPlayers.length > 1) {
    newViceCaptain = playerId(newPlayers[1]);
    if (normalizeId(newViceCaptain) === normalizeId(newCaptain) && newPlayers.length > 2) {
      newViceCaptain = playerId(newPlayers[2]);
    }
  }

  return {
    updatedTeam: {
      ...team,
      players: newPlayers as any,
      captain: newCaptain,
      viceCaptain: newViceCaptain,
      c: newCaptain,
      vc: newViceCaptain,
      vicecaptain: newViceCaptain,
    },
    replaced,
  };
}
