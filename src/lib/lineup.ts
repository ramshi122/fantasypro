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
 * CRITICAL: Tries ALL fields and returns the first non-empty one.
 * This ensures team players (saved with pid) match fresh players (with player_fixed_id).
 */
export function playerId(p: MatchPlayer | any): string {
  // Try player_fixed_id first (most reliable)
  if (p?.player_fixed_id !== undefined && p?.player_fixed_id !== null && String(p?.player_fixed_id).trim() !== "") {
    return String(p.player_fixed_id);
  }
  // Try pl_id
  if (p?.pl_id !== undefined && p?.pl_id !== null && String(p?.pl_id).trim() !== "") {
    return String(p.pl_id);
  }
  // Try pid
  if (p?.pid !== undefined && p?.pid !== null && String(p?.pid).trim() !== "") {
    return String(p.pid);
  }
  // Try id
  if (p?.id !== undefined && p?.id !== null && String(p?.id).trim() !== "") {
    return String(p.id);
  }
  // Try _id
  if (p?._id !== undefined && p?._id !== null && String(p?._id).trim() !== "") {
    return String(p._id);
  }
  // Last resort: name
  return String(p?.name ?? "");
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
 * Before lineup, returns ALL players (playing field is not reliable pre-lineup).
 *
 * IMPORTANT: Before lineup, the API often sets playing===0 for ALL players.
 * If we filter them out, we get 0 players → button disabled → can't generate.
 * So before lineup, we return ALL players regardless of playing field.
 *
 * After lineup: ONLY playing===1 (confirmed Playing XI).
 *
 * FALLBACK: If lineup is announced (lineup_status===1) but NO players have
 * playing===1 (backend may not have updated the field yet), return ALL players
 * instead of 0. This prevents the "all players locked" issue where the user
 * can't generate teams after lineup because the backend hasn't set playing=1.
 */
export function filterPlayingPlayers(
  players: MatchPlayer[],
  lineupAnnounced: boolean
): MatchPlayer[] {
  if (!lineupAnnounced) {
    // Pre-lineup: return ALL players
    // (playing field is unreliable — API may set all to 0 before lineup)
    return players;
  }
  // After lineup: try to filter to ONLY playing === 1
  const playingXI = players.filter((p) => Number(p.playing) === 1);

  // FALLBACK: If lineup is announced but 0 players have playing===1,
  // the backend hasn't updated the playing field yet. Return ALL players
  // rather than 0 — the user can still generate teams.
  if (playingXI.length === 0 && players.length > 0) {
    console.warn(
      `[lineup] ⚠️ Lineup announced but 0 players have playing===1 — ` +
      `backend may not have updated. Returning all ${players.length} players as fallback.`
    );
    return players;
  }

  // If we have very few playing XI players (< 11), also include undefined/null
  // playing field players (they might be playing but the field wasn't set)
  if (playingXI.length < 11) {
    const undefinedPlayers = players.filter(
      (p) => p.playing === undefined || p.playing === null
    );
    if (undefinedPlayers.length > 0) {
      console.warn(
        `[lineup] ⚠️ Only ${playingXI.length} players with playing===1 — ` +
        `including ${undefinedPlayers.length} players with undefined playing field.`
      );
      return [...playingXI, ...undefinedPlayers];
    }
  }

  return playingXI;
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
 * Get the role of a player — handles ALL field name variations.
 * Team players from localStorage may have different field names than
 * match detail players.
 */
function getPlayerRole(p: any): string {
  // Check role field (string like "WK", "BAT", "AR", "BOWL")
  if (p.role && typeof p.role === "string") return p.role.toUpperCase();
  // Check role_num (0=WK, 1=BAT, 2=AR, 3=BOWL)
  if (p.role_num !== undefined) {
    const rn = Number(p.role_num);
    if (rn === 0) return "WK";
    if (rn === 1) return "BAT";
    if (rn === 2) return "AR";
    if (rn === 3) return "BOWL";
  }
  // Check player_type (string like "Wicket Keeper", "Batter", etc.)
  if (p.player_type) {
    const pt = String(p.player_type).toLowerCase();
    if (pt.includes("keep") || pt.includes("wk")) return "WK";
    if (pt.includes("all")) return "AR";
    if (pt.includes("bowl") || pt.includes("pacer")) return "BOWL";
    if (pt.includes("bat")) return "BAT";
  }
  return ""; // Unknown role
}

/**
 * Auto-replace non-playing players in a team with the best available
 * confirmed playing alternatives.
 *
 * Original Workflow (matching teamgeneration.in):
 *  1. Check each player in team against confirmed Playing XI
 *  2. If player NOT in Playing XI → find replacement
 *  3. Replacement priority: same role + same team → same role → same team → any
 *  4. Sort replacements by credits (descending) — pick best available
 *  5. Update captain/VC if they were replaced
 *  6. Return updated team + list of replacements
 *
 * BUGS FIXED:
 *  - Role matching: now handles role, role_num, AND player_type fields
 *  - ID comparison: uses playerId() + normalizeId() consistently
 *  - Captain/VC: properly picks from NEW team (not old)
 *  - No mutation of original team object
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

  // Build normalized ID sets for fast lookup
  const playingIdsNormalized = new Set(playingPool.map((p) => normalizeId(playerId(p))));
  // ALSO build a name-based set as fallback (ID matching can fail if formats differ)
  const playingNamesNormalized = new Set(playingPool.map((p) => normalizeId(String((p as any).name || ""))));

  const teamPlayers = ((team.players || []) as unknown as MatchPlayer[]).map(p => ({ ...p })); // clone
  const teamPlayerIds = new Set(teamPlayers.map((p) => normalizeId(playerId(p))));
  const teamPlayerNames = new Set(teamPlayers.map((p) => normalizeId(String((p as any).name || ""))));

  const replaced: Array<{ from: string; to: string }> = [];
  const newPlayers: MatchPlayer[] = [];

  // Sort playing pool by credits (descending) for best replacements first
  const sortedPool = [...playingPool].sort((a, b) => {
    const ca = Number((a as any).credits || 0);
    const cb = Number((b as any).credits || 0);
    return cb - ca;
  });

  for (const p of teamPlayers) {
    const id = playerId(p);
    const normalized = normalizeId(id);
    const playerName = normalizeId(String((p as any).name || ""));

    // Check if player is playing: try ID match FIRST, then name match
    const isPlaying = playingIdsNormalized.has(normalized) || playingNamesNormalized.has(playerName);

    if (isPlaying) {
      // Player IS confirmed playing — keep in team
      newPlayers.push(p);
    } else {
      // Player is NOT in confirmed Playing XI — REPLACE
      const playerRole = getPlayerRole(p);
      const playerTeam = String((p as any).team_name || (p as any).team || "");

      console.log(`[AutoReplace] ❌ Non-playing: ${((p as any).name || id)} (role=${playerRole}, team=${playerTeam}) → finding replacement`);

      // Priority 1: same role + same team (check both ID and name to avoid dupes)
      let candidates = sortedPool.filter((c) => {
        const cId = normalizeId(playerId(c));
        const cName = normalizeId(String((c as any).name || ""));
        return !teamPlayerIds.has(cId) && !teamPlayerNames.has(cName) &&
               getPlayerRole(c) === playerRole &&
               String((c as any).team_name || (c as any).team || "") === playerTeam;
      });

      // Priority 2: same role, any team
      if (candidates.length === 0 && playerRole) {
        candidates = sortedPool.filter((c) => {
          const cId = normalizeId(playerId(c));
          const cName = normalizeId(String((c as any).name || ""));
          return !teamPlayerIds.has(cId) && !teamPlayerNames.has(cName) && getPlayerRole(c) === playerRole;
        });
      }

      // Priority 3: same team, any role
      if (candidates.length === 0 && playerTeam) {
        candidates = sortedPool.filter((c) => {
          const cId = normalizeId(playerId(c));
          const cName = normalizeId(String((c as any).name || ""));
          return !teamPlayerIds.has(cId) && !teamPlayerNames.has(cName) &&
                 String((c as any).team_name || (c as any).team || "") === playerTeam;
        });
      }

      // Priority 4: any available confirmed playing player
      if (candidates.length === 0) {
        candidates = sortedPool.filter((c) => {
          const cId = normalizeId(playerId(c));
          const cName = normalizeId(String((c as any).name || ""));
          return !teamPlayerIds.has(cId) && !teamPlayerNames.has(cName);
        });
      }

      const replacement = candidates[0];
      if (replacement) {
        const repClone = { ...replacement };
        newPlayers.push(repClone);
        teamPlayerIds.add(normalizeId(playerId(repClone)));
        teamPlayerNames.add(normalizeId(String((repClone as any).name || "")));
        const fromName = String((p as any).name || id);
        const toName = String((repClone as any).name || playerId(repClone));
        replaced.push({ from: fromName, to: toName });
        console.log(`[AutoReplace] ✅ Replaced: ${fromName} → ${toName} (role=${playerRole}→${getPlayerRole(repClone)})`);
      } else {
        // No replacement available — keep original player (will be flagged)
        console.warn(`[AutoReplace] ⚠️ No replacement found for ${((p as any).name || id)} — keeping original`);
        newPlayers.push(p);
      }
    }
  }

  // Update captain/vice-captain if they were replaced
  const captainId = String(team.captain ?? team.c ?? "");
  const viceCaptainId = String(team.viceCaptain ?? team.vc ?? team.vicecaptain ?? "");

  // Build set of NEW team player IDs
  const newTeamIds = new Set(newPlayers.map((p) => normalizeId(playerId(p))));

  let newCaptain = captainId;
  let newViceCaptain = viceCaptainId;

  // If captain is not in new team, pick replacement from new players
  if (!newTeamIds.has(normalizeId(captainId)) && newPlayers.length > 0) {
    // Pick the highest-credit player as new captain
    const sortedNew = [...newPlayers].sort((a, b) => Number((b as any).credits || 0) - Number((a as any).credits || 0));
    newCaptain = playerId(sortedNew[0]);
    console.log(`[AutoReplace] 👑 New captain: ${((sortedNew[0] as any).name || newCaptain)}`);
  }

  // If VC is not in new team, pick replacement (different from captain)
  if (!newTeamIds.has(normalizeId(viceCaptainId)) && newPlayers.length > 1) {
    const sortedNew = [...newPlayers]
      .filter((p) => normalizeId(playerId(p)) !== normalizeId(newCaptain))
      .sort((a, b) => Number((b as any).credits || 0) - Number((a as any).credits || 0));
    if (sortedNew.length > 0) {
      newViceCaptain = playerId(sortedNew[0]);
      console.log(`[AutoReplace] 👑 New VC: ${((sortedNew[0] as any).name || newViceCaptain)}`);
    }
  }

  // Ensure C ≠ VC
  if (normalizeId(newCaptain) === normalizeId(newViceCaptain) && newPlayers.length > 1) {
    const alt = newPlayers.find((p) => normalizeId(playerId(p)) !== normalizeId(newCaptain));
    if (alt) {
      newViceCaptain = playerId(alt);
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
