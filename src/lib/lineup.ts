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
 * Filter players to only show confirmed playing XI after lineup is announced.
 * Before lineup, returns all players.
 */
export function filterPlayingPlayers(
  players: MatchPlayer[],
  lineupAnnounced: boolean
): MatchPlayer[] {
  if (!lineupAnnounced) return players;
  // After lineup: only show players with playing === 1
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
 */
export function getNonPlayingPlayersInTeam(
  team: TeamRow,
  lineupAnnounced: boolean,
  playingPlayerIds: Set<string>
): MatchPlayer[] {
  if (!lineupAnnounced) return [];
  const players = (team.players || []) as unknown as MatchPlayer[];
  return players.filter((p) => {
    const id = String(p.player_fixed_id ?? p.pl_id ?? p.pid ?? p.name);
    return !playingPlayerIds.has(id);
  });
}

/**
 * Get the player ID string from a MatchPlayer.
 */
export function playerId(p: MatchPlayer): string {
  return String(p.player_fixed_id ?? p.pl_id ?? p.pid ?? p.name ?? "");
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
 */
export function autoReplaceNonPlaying(
  team: TeamRow,
  allPlayers: MatchPlayer[],
  lineupAnnounced: boolean
): { updatedTeam: TeamRow; replaced: Array<{ from: string; to: string }> } {
  if (!lineupAnnounced) {
    return { updatedTeam: team, replaced: [] };
  }

  const playingPool = allPlayers.filter((p) => Number(p.playing) === 1);
  const playingIds = new Set(playingPool.map(playerId));
  const teamPlayers = (team.players || []) as unknown as MatchPlayer[];
  const teamPlayerIds = new Set(teamPlayers.map(playerId));

  const replaced: Array<{ from: string; to: string }> = [];
  const newPlayers: MatchPlayer[] = [];

  for (const p of teamPlayers) {
    const id = playerId(p);
    if (playingIds.has(id)) {
      // Player is confirmed playing — keep
      newPlayers.push(p);
    } else {
      // Non-playing — find replacement of same role
      const role = (p as any).role || (p as any).role_num;
      const candidates = playingPool.filter(
        (c) => !teamPlayerIds.has(playerId(c)) && (c as any).role === role
      );
      let replacement = candidates[0];
      if (!replacement) {
        // Fallback: any available confirmed player
        replacement = playingPool.find((c) => !teamPlayerIds.has(playerId(c)));
      }
      if (replacement) {
        newPlayers.push(replacement);
        teamPlayerIds.add(playerId(replacement));
        replaced.push({ from: String(p.name || id), to: String(replacement.name || playerId(replacement)) });
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

  if (!playingIds.has(captainId) && newPlayers.length > 0) {
    newCaptain = playerId(newPlayers[0]);
  }
  if (!playingIds.has(viceCaptainId) && newPlayers.length > 1) {
    newViceCaptain = playerId(newPlayers[1]);
    if (newViceCaptain === newCaptain && newPlayers.length > 2) {
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
