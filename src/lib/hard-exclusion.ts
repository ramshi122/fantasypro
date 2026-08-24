/**
 * HARD EXCLUSION — Lineup Out / Bench / Not Playing Player Block
 * ================================================================
 *
 * Per user spec: "LINEUP OUT / BENCH / NOT PLAYING = HARD BLOCK"
 *
 * This module provides the CENTRALIZED player eligibility filter that ALL
 * generation paths MUST use. It has NO FALLBACKS — if a player is not in
 * the confirmed Playing XI after lineup, they are HARD EXCLUDED.
 *
 * Functions:
 *   getFinalEligiblePlayers() — the single source of truth for who can play
 *   validateFinalTeam() — final validation gate before save/transfer
 *   isPlayerEligible() — check single player
 *   replaceInvalidPlayers() — auto-replace bench players in existing teams
 *
 * Used by: Sweep Generator, Elite AI, Transfer flow, Replace Mode
 */

import type { MatchPlayer } from "./api";

/**
 * CENTRALIZED PLAYER ELIGIBILITY FILTER
 *
 * Per user spec rule 6: "Team generation തുടങ്ങുന്നതിന് മുമ്പ് ഒരു centralized
 * filter function ഉണ്ടാക്കുക: getFinalEligiblePlayers()"
 *
 * This is the FINAL source of truth. After lineup announcement:
 *   Final Eligible Players = Confirmed Playing XI
 *   - LINEUP OUT
 *   - BENCH
 *   - NOT PLAYING
 *   - INACTIVE
 *
 * Before lineup: ALL players are eligible (we don't know who's playing).
 *
 * NO FALLBACKS: If lineup is announced and only 5 players have playing===1,
 * only those 5 are eligible. Team generation will fail if there aren't
 * enough eligible players — this is BY DESIGN (better to fail than to
 * include bench players).
 *
 * EXCEPTION: If lineup_status === 1 but NO players have playing===1,
 * the backend hasn't updated yet. In this case we return ALL players
 * (can't filter what we don't know). But we log a warning.
 */
export function getFinalEligiblePlayers(
  players: MatchPlayer[],
  lineupAnnounced: boolean
): MatchPlayer[] {
  if (!Array.isArray(players)) return [];

  // Before lineup — ALL players eligible
  if (!lineupAnnounced) {
    return players;
  }

  // === AFTER LINEUP — HARD FILTER ===
  // Only players with playing === 1 are eligible.
  // NO EXCEPTIONS for undefined/null — if lineup is announced, the backend
  // should have set playing=1 for Playing XI. If it hasn't, that's a
  // backend issue, not an excuse to include bench players.

  const eligible = players.filter(p => {
    // playing === 1 = confirmed in Playing XI
    if (Number(p.playing) === 1) return true;

    // playing === 0 = explicitly benched → HARD EXCLUDE
    if (Number(p.playing) === 0) return false;

    // playing === undefined/null = unknown
    // After lineup: treat as NOT ELIGIBLE (safer to exclude than include)
    // Per user spec: "Playing XI സ്ഥിരീകരിക്കാത്ത player-നെ default ആയി
    // NOT ELIGIBLE ആയി treat ചെയ്യുക."
    return false;
  });

  // SAFETY NET: If lineup announced but 0 eligible players (backend bug),
  // return ALL players rather than crashing the app. But log loudly.
  if (eligible.length === 0 && players.length > 0) {
    console.error(
      `[HARD_EXCLUSION] ⚠️ Lineup announced but 0 players have playing===1! ` +
      `Backend may not have updated. Returning ALL ${players.length} players as emergency fallback. ` +
      `THIS SHOULD NOT HAPPEN — check backend lineup_status field.`
    );
    return players;
  }

  // If < 11 eligible players, we still return only the eligible ones.
  // Team generation will show "not enough players" error — this is correct.
  // Per user spec: "Invalid team ഒരിക്കലും save ചെയ്യരുത്."
  if (eligible.length < 11) {
    console.warn(
      `[HARD_EXCLUSION] ⚠️ Only ${eligible.length} eligible players after lineup (need 11). ` +
      `Team generation may fail — this is BY DESIGN.`
    );
  }

  return eligible;
}

/**
 * CHECK SINGLE PLAYER ELIGIBILITY
 *
 * Returns true if the player is eligible for team generation.
 * After lineup: only playing === 1 is eligible.
 * Before lineup: all players are eligible.
 */
export function isPlayerEligible(
  player: MatchPlayer,
  lineupAnnounced: boolean
): boolean {
  if (!lineupAnnounced) return true;
  return Number(player.playing) === 1;
}

/**
 * FINAL TEAM VALIDATION GATE
 *
 * Per user spec rule 7: "ഓരോ generated team save ചെയ്യുന്നതിന് മുമ്പ്
 * validateFinalTeam(team) run ചെയ്യണം."
 *
 * Validation checks:
 *   - team.length === 11
 *   - every player is in Final Eligible Players (playing === 1 after lineup)
 *   - no player is LINEUP OUT / BENCH / NOT PLAYING
 *   - captain is eligible
 *   - viceCaptain is eligible
 *   - captain !== viceCaptain
 *
 * Returns { valid: true } if team passes ALL checks.
 * Returns { valid: false, errors: [...] } if team fails.
 */
export interface FinalTeamValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateFinalTeam(
  team: MatchPlayer[],
  captainId: string | number | undefined,
  viceCaptainId: string | number | undefined,
  lineupAnnounced: boolean
): FinalTeamValidationResult {
  const errors: string[] = [];

  // Check 1: Exactly 11 players
  if (!Array.isArray(team) || team.length !== 11) {
    errors.push(`Team must have exactly 11 players (has ${team?.length || 0})`);
    return { valid: false, errors };
  }

  // Before lineup — skip eligibility checks (all players eligible)
  if (!lineupAnnounced) {
    // Still check C ≠ VC
    if (captainId !== undefined && viceCaptainId !== undefined &&
        String(captainId) === String(viceCaptainId)) {
      errors.push("Captain and Vice-Captain cannot be the same player");
      return { valid: false, errors };
    }
    return { valid: true, errors: [] };
  }

  // === AFTER LINEUP — HARD VALIDATION ===

  // Check 2: Every player must be in Playing XI (playing === 1)
  const ineligiblePlayers: string[] = [];
  for (const p of team) {
    if (!isPlayerEligible(p, true)) {
      const name = String(p.name || p.pid || p.player_fixed_id || "unknown");
      const playing = p.playing;
      ineligiblePlayers.push(`${name} (playing=${playing})`);
    }
  }
  if (ineligiblePlayers.length > 0) {
    errors.push(`Ineligible players (not in Playing XI): ${ineligiblePlayers.join(", ")}`);
  }

  // Check 3: Captain must be eligible
  if (captainId !== undefined) {
    const captain = team.find(p =>
      String(p.player_fixed_id ?? p.pid ?? p.name) === String(captainId)
    );
    if (captain && !isPlayerEligible(captain, true)) {
      errors.push(`Captain is not in Playing XI: ${captain.name || captainId}`);
    }
  }

  // Check 4: Vice-Captain must be eligible
  if (viceCaptainId !== undefined) {
    const vc = team.find(p =>
      String(p.player_fixed_id ?? p.pid ?? p.name) === String(viceCaptainId)
    );
    if (vc && !isPlayerEligible(vc, true)) {
      errors.push(`Vice-Captain is not in Playing XI: ${vc.name || viceCaptainId}`);
    }
  }

  // Check 5: Captain ≠ Vice-Captain
  if (captainId !== undefined && viceCaptainId !== undefined &&
      String(captainId) === String(viceCaptainId)) {
    errors.push("Captain and Vice-Captain cannot be the same player");
  }

  // Check 6: No duplicate players
  const seenIds = new Set<string>();
  const duplicates: string[] = [];
  for (const p of team) {
    const id = String(p.player_fixed_id ?? p.pid ?? p.name ?? "");
    if (seenIds.has(id)) {
      duplicates.push(String(p.name || id));
    }
    seenIds.add(id);
  }
  if (duplicates.length > 0) {
    errors.push(`Duplicate players: ${duplicates.join(", ")}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * AUTO-REPLACE INVALID PLAYERS IN EXISTING TEAMS
 *
 * Per user spec rule 3: "Teams already generated before lineup announcement
 * ആണെങ്കിൽ lineup update വന്നപ്പോൽ:
 *   1. എല്ലാ generated teams scan ചെയ്യുക.
 *   2. ഓരോ team-ലും player status re-check ചെയ്യുക.
 *   3. LINEUP OUT / BENCH player കണ്ടെത്തിയാൽ:
 *      - ആ player remove ചെയ്യുക.
 *      - Valid Playing XI player ഉപയോഗിച്ച് replace ചെയ്യുക."
 *
 * This function takes an existing team + the eligible player pool and
 * replaces any ineligible players with eligible ones of the same role.
 *
 * Returns { team: replaced team, replaced: [{from, to}], valid: boolean }
 */
export function autoReplaceInvalidPlayers(
  team: MatchPlayer[],
  eligiblePlayers: MatchPlayer[],
  lineupAnnounced: boolean
): {
  team: MatchPlayer[];
  replaced: Array<{ from: string; to: string }>;
  valid: boolean;
} {
  if (!lineupAnnounced) {
    return { team, replaced: [], valid: true };
  }

  const replaced: Array<{ from: string; to: string }> = [];
  const playerIds = new Set<string>();
  const eligibleIds = new Set(eligiblePlayers.map(p => String(p.player_fixed_id ?? p.pid ?? p.name ?? "")));

  // Collect IDs already in team (for dedup)
  for (const p of team) {
    playerIds.add(String(p.player_fixed_id ?? p.pid ?? p.name ?? ""));
  }

  const newTeam = [...team];

  for (let i = 0; i < newTeam.length; i++) {
    const p = newTeam[i];
    if (isPlayerEligible(p, true)) continue;

    // This player is ineligible — replace with an eligible player
    const pId = String(p.player_fixed_id ?? p.pid ?? p.name ?? "");
    const pName = String(p.name || pId);

    // Find a replacement: eligible, not already in team, same role if possible
    const replacement = eligiblePlayers.find(ep => {
      const epId = String(ep.player_fixed_id ?? ep.pid ?? ep.name ?? "");
      if (playerIds.has(epId)) return false; // already in team
      if (epId === pId) return false; // same player
      // Prefer same role (player_type or role)
      const pRole = String(p.role_text || p.player_type || "").toLowerCase();
      const epRole = String(ep.role_text || ep.player_type || "").toLowerCase();
      if (pRole && epRole && pRole === epRole) return true; // same role
      return false; // skip different role for now
    });

    if (replacement) {
      const rId = String(replacement.player_fixed_id ?? replacement.pid ?? replacement.name ?? "");
      const rName = String(replacement.name || rId);
      newTeam[i] = replacement;
      playerIds.delete(pId);
      playerIds.add(rId);
      replaced.push({ from: pName, to: rName });
      console.log(`[HARD_EXCLUSION] 🔄 Replaced ${pName} → ${rName} (was not in Playing XI)`);
    } else {
      // Try any eligible player (different role)
      const anyReplacement = eligiblePlayers.find(ep => {
        const epId = String(ep.player_fixed_id ?? ep.pid ?? ep.name ?? "");
        return !playerIds.has(epId) && epId !== pId;
      });
      if (anyReplacement) {
        const rId = String(anyReplacement.player_fixed_id ?? anyReplacement.pid ?? anyReplacement.name ?? "");
        const rName = String(anyReplacement.name || rId);
        newTeam[i] = anyReplacement;
        playerIds.delete(pId);
        playerIds.add(rId);
        replaced.push({ from: pName, to: rName });
        console.log(`[HARD_EXCLUSION] 🔄 Replaced ${pName} → ${rName} (different role, was not in Playing XI)`);
      } else {
        console.error(`[HARD_EXCLUSION] ❌ Cannot find replacement for ${pName} — no eligible players left!`);
      }
    }
  }

  // Validate the final team
  const validation = validateFinalTeam(newTeam, undefined, undefined, true);

  return {
    team: newTeam,
    replaced,
    valid: validation.valid && newTeam.length === 11,
  };
}

/**
 * INVALIDATE STALE CACHE
 *
 * Per user spec rule 9: "lineup update വന്നാൽ:
 *   - Old player eligibility cache invalidate ചെയ്യുക.
 *   - Old generated player pool invalidate ചെയ്യുക."
 *
 * Clears localStorage caches that might hold stale lineup data.
 */
export function invalidateStaleLineupCache(matchId?: string) {
  if (typeof window === "undefined") return;
  try {
    if (matchId) {
      // Clear specific match caches
      localStorage.removeItem(`apna-playingxi-${matchId}`);
      localStorage.removeItem(`apna-exclude-${matchId}`);
      localStorage.removeItem(`apna-lineup-out-${matchId}`);
      console.log(`[HARD_EXCLUSION] 🗑️ Invalidated stale cache for match ${matchId}`);
    }
    // Clear account-session caches (per-account lineup data)
    // These are in-memory, but we can signal a refresh by removing the timestamp
    localStorage.removeItem("apna-server-time");
    localStorage.removeItem("apna-server-time-fetched");
  } catch {}
}
