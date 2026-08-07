/**
 * Post-Lineup Strict Player Filter
 * =================================
 *
 * Per user spec (Malayalam):
 *   "ലൈൻഅപ്പിന് ശേഷം (After Lineup) – കർശന നിയമങ്ങൾ"
 *
 * Rules:
 *   1. Only officially confirmed Playing XI after lineup
 *   2. NEVER include players from these categories:
 *      - Low Chance
 *      - Impact Sub Only
 *      - Bench Player
 *      - Reserve Player
 *      - Doubtful
 *      - Injured
 *      - Unconfirmed Player
 *   3. Don't add Low Chance or doubtful players to any team
 *   4. C/VC selection: confirmed XI + good form + consistency + good role +
 *      participation probability + highest fantasy points potential
 *   5. If even small doubt about a player, exclude from ALL teams
 *   6. Quality over quantity — generate high-success-probability teams only
 *   7. Final validation: reject any team containing uncertain players and
 *      regenerate
 *
 * This module checks MULTIPLE possible field names from the backend (since
 * different APIs use different naming conventions) and excludes any player
 * whose status indicates uncertainty.
 *
 * Used by Elite AI generator when lineupAnnounced === true.
 */

import type { MatchPlayer } from "./api";

/**
 * Strict post-lineup player filter.
 *
 * Returns TRUE if the player is SAFE to include in a team (confirmed Playing XI,
 * no risk flags). Returns FALSE if the player should be EXCLUDED.
 *
 * Checks multiple possible field names — backend APIs use different conventions:
 *   - playing (0/1)
 *   - playing_status / playingStatus (string)
 *   - chance / playing_chance (string like "Low", "Medium", "High")
 *   - impact_sub / impactSub (boolean/string)
 *   - is_bench / isBench / bench (boolean)
 *   - is_reserve / isReserve / reserve (boolean)
 *   - is_injured / isInjured / injured (boolean)
 *   - is_doubtful / isDoubtful / doubtful (boolean)
 *   - status / player_status (string)
 *   - last_play (0 = didn't play last match)
 *   - last_play_text (string description)
 */
export function isPlayerSafeForPostLineup(p: MatchPlayer): boolean {
  if (!p) return false;

  // === CHECK 1: playing field (0/1) ===
  // 0 = benched/not playing (after lineup), 1 = in Playing XI
  // undefined/null = unknown (before lineup) — assume safe, will be filtered elsewhere
  const playingNum = Number(p.playing);
  if (playingNum === 0) {
    // Explicitly marked as not playing — exclude
    return false;
  }

  // === CHECK 2: playing_status / playingStatus (string) ===
  const playingStatus = String(
    (p as any).playing_status || (p as any).playingStatus || (p as any).playingStatusText || ""
  ).toLowerCase().trim();
  if (EXCLUDE_STATUS_KEYWORDS.some(kw => playingStatus.includes(kw))) {
    return false;
  }

  // === CHECK 3: chance / playing_chance (string like "Low", "Medium", "High") ===
  const chance = String(
    (p as any).chance || (p as any).playing_chance || (p as any).playingChance || (p as any).selection_chance || ""
  ).toLowerCase().trim();
  if (EXCLUDE_CHANCE_KEYWORDS.some(kw => chance.includes(kw))) {
    return false;
  }

  // === CHECK 4: impact_sub / impactSub (Impact Sub Only) ===
  const impactSub = (p as any).impact_sub ?? (p as any).impactSub ?? (p as any).is_impact_sub ?? (p as any).isImpactSub;
  if (impactSub === true || impactSub === 1 || impactSub === "true" || impactSub === "1" ||
      String(impactSub).toLowerCase() === "yes" || String(impactSub).toLowerCase() === "impact sub only") {
    return false;
  }

  // === CHECK 5: bench / reserve flags ===
  const isBench = (p as any).is_bench ?? (p as any).isBench ?? (p as any).bench ?? (p as any).on_bench ?? (p as any).onBench;
  if (isBench === true || isBench === 1 || isBench === "true" || isBench === "1") {
    return false;
  }
  const isReserve = (p as any).is_reserve ?? (p as any).isReserve ?? (p as any).reserve ?? (p as any).is_reserve_player;
  if (isReserve === true || isReserve === 1 || isReserve === "true" || isReserve === "1") {
    return false;
  }

  // === CHECK 6: injured flag ===
  const isInjured = (p as any).is_injured ?? (p as any).isInjured ?? (p as any).injured ?? (p as any).injury;
  if (isInjured === true || isInjured === 1 || isInjured === "true" || isInjured === "1" ||
      String(isInjured).toLowerCase() === "yes") {
    return false;
  }

  // === CHECK 7: doubtful flag ===
  const isDoubtful = (p as any).is_doubtful ?? (p as any).isDoubtful ?? (p as any).doubtful ?? (p as any).doubt;
  if (isDoubtful === true || isDoubtful === 1 || isDoubtful === "true" || isDoubtful === "1" ||
      String(isDoubtful).toLowerCase() === "yes") {
    return false;
  }

  // === CHECK 8: unconfirmed flag ===
  const isUnconfirmed = (p as any).is_unconfirmed ?? (p as any).isUnconfirmed ?? (p as any).unconfirmed;
  if (isUnconfirmed === true || isUnconfirmed === 1 || isUnconfirmed === "true" || isUnconfirmed === "1") {
    return false;
  }

  // === CHECK 9: status / player_status (string) ===
  const status = String(
    (p as any).status || (p as any).player_status || (p as any).playerStatus || (p as any).selection_status || ""
  ).toLowerCase().trim();
  if (EXCLUDE_STATUS_KEYWORDS.some(kw => status.includes(kw))) {
    return false;
  }

  // === CHECK 10: last_play_text (description of last match status) ===
  const lastPlayText = String(p.last_play_text || "").toLowerCase().trim();
  if (EXCLUDE_STATUS_KEYWORDS.some(kw => lastPlayText.includes(kw))) {
    return false;
  }

  // === CHECK 11: name contains risk indicators (rare but possible) ===
  // Some backends append "(D)" for doubtful, "(I)" for injured in the name field
  const name = String(p.name || "").toLowerCase();
  if (/\(d\)|\(i\)|\(n\)|\(s\)/.test(name) || name.includes("doubtful") || name.includes("injured")) {
    return false;
  }

  // All checks passed — player is safe
  return true;
}

/**
 * Keywords that indicate a player should be EXCLUDED from teams.
 * Matches against playing_status, status, last_play_text fields.
 */
const EXCLUDE_STATUS_KEYWORDS = [
  "low chance",
  "low-chance",
  "low_chance",
  "impact sub only",
  "impact-sub-only",
  "bench player",
  "bench-player",
  "bench",
  "benched",
  "reserve player",
  "reserve-player",
  "reserve",
  "doubtful",
  "doubt",
  "injured",
  "injury",
  "unconfirmed",
  "uncertain",
  "not playing",
  "not-playing",
  "out",
  "unavailable",
  "ruled out",
  "ruled-out",
];

/**
 * Keywords that indicate LOW chance of selection — exclude.
 * Matches against chance / playing_chance / selection_chance fields.
 */
const EXCLUDE_CHANCE_KEYWORDS = [
  "low",
  "unlikely",
  "doubtful",
  "rare",
  "minimal",
];

/**
 * Filter an array of players to only those safe for post-lineup team generation.
 *
 * Per user spec rule 5: "ലൈൻഅപ്പിന് ശേഷം ഒരു കളിക്കാരനെക്കുറിച്ച് ചെറിയ സംശയം പോലും
 * ഉണ്ടെങ്കിൽ, ആ കളിക്കാരനെ എല്ലാ ടീമുകളിൽ നിന്നും ഒഴിവാക്കുക."
 * (If there's even small doubt about a player after lineup, exclude from all teams.)
 *
 * FALLBACK: If filtering leaves fewer than 11 players (backend hasn't set
 * playing=1 for the Playing XI yet), return ALL players. This prevents the
 * "all players locked, no teams generated" issue.
 *
 * @param players - All players from the match data
 * @param lineupAnnounced - Whether the official Playing XI has been announced
 * @returns Filtered array of only safe players
 */
export function filterPlayersForPostLineup(
  players: MatchPlayer[],
  lineupAnnounced: boolean
): MatchPlayer[] {
  if (!Array.isArray(players)) return [];

  // Before lineup — return all players (we can't filter what we don't know)
  if (!lineupAnnounced) {
    return players;
  }

  // After lineup — apply STRICT filtering
  const safe = players.filter(isPlayerSafeForPostLineup);
  const excluded = players.length - safe.length;

  if (excluded > 0) {
    console.log(
      `[PostLineupFilter] 🚫 Excluded ${excluded}/${players.length} players (Low Chance, Bench, Injured, Doubtful, Impact Sub, etc.) — ${safe.length} safe players remaining`
    );
  }

  // === FALLBACK: If fewer than 11 safe players, the backend may not have
  // updated the playing field yet. Return ALL players rather than blocking
  // team generation entirely.
  // Per user spec: "After linup all plyer are loked avoid plyer team not genereting"
  if (safe.length < 11 && players.length >= 11) {
    console.warn(
      `[PostLineupFilter] ⚠️ Only ${safe.length} safe players (need 11) — ` +
      `backend may not have set playing=1 yet. Returning all ${players.length} players as fallback.`
    );
    return players;
  }

  return safe;
}

/**
 * Final validation: check if a generated team contains ANY uncertain player.
 *
 * Per user spec rule 12: "Low Chance അല്ലെങ്കിൽ Uncertain Player ഉൾപ്പെട്ട ഏതൊരു ടീമും
 * ഉടൻ നിരസിച്ച് (Reject) വീണ്ടും പുതിയ ടീം ജനറേറ്റ് ചെയ്യുക."
 * (Reject any team with Low Chance or Uncertain Player and regenerate.)
 *
 * Returns { valid: true } if team is safe, { valid: false, reason } if it should be rejected.
 */
export function validateTeamForPostLineup(
  team: MatchPlayer[],
  lineupAnnounced: boolean
): { valid: boolean; reason?: string; unsafePlayers?: string[] } {
  if (!lineupAnnounced) {
    // Before lineup — no validation (we can't know)
    return { valid: true };
  }

  if (!Array.isArray(team) || team.length === 0) {
    return { valid: false, reason: "Empty team" };
  }

  const unsafePlayers: string[] = [];
  for (const p of team) {
    if (!isPlayerSafeForPostLineup(p)) {
      unsafePlayers.push(String(p.name || p.pid || "unknown"));
    }
  }

  if (unsafePlayers.length > 0) {
    return {
      valid: false,
      reason: `Team contains ${unsafePlayers.length} unsafe player(s): ${unsafePlayers.join(", ")}`,
      unsafePlayers,
    };
  }

  return { valid: true };
}

/**
 * Score a player's suitability for Captain/Vice-Captain after lineup.
 *
 * Per user spec rule 4 & 11: C/VC must be selected based on:
 *   - Confirmed Playing XI (already filtered)
 *   - മികച്ച സമീപകാല ഫോം (Good recent form)
 *   - സ്ഥിരതയുള്ള ഫാന്റസി പ്രകടനം (Consistent fantasy performance)
 *   - നല്ല Batting/Bowling Role (Good batting/bowling role)
 *   - മത്സരത്തിൽ കൂടുതൽ പങ്കാളിത്ത സാധ്യത (More participation probability)
 *   - ഏറ്റവും ഉയർന്ന Fantasy Points നേടാനുള്ള സാധ്യത (Highest fantasy points potential)
 *
 * Returns a score 0-100. Higher = better C/VC candidate.
 */
export function scorePlayerForCaptaincy(p: MatchPlayer): number {
  if (!p) return 0;

  let score = 0;

  // 1. Recent form — use points field if available (higher = better recent form)
  const points = Number(p.points ?? 0);
  score += Math.min(30, points / 5); // up to 30 points for form

  // 2. Consistency — use selected_by % (higher = more popular = more consistent)
  const selBy = Number(p.selected_by ?? p.sel ?? 0);
  score += Math.min(20, selBy / 5); // up to 20 points for consistency

  // 3. Role bonus — all-rounders get bonus (they contribute in both innings)
  const roleText = String(p.role_text || p.player_type || "").toLowerCase();
  if (roleText.includes("all") || roleText.includes("ar") || roleText.includes("round")) {
    score += 15; // all-rounders are best C/VC candidates
  } else if (roleText.includes("bat") || roleText.includes("wk")) {
    score += 10; // batters and keepers are good C/VC
  } else if (roleText.includes("bowl")) {
    score += 8; // bowlers slightly less ideal but still viable
  }

  // 4. Captain percentage from backend (if available) — indicates community trust
  const capPct = Number(p.captain_percentage ?? 0);
  score += Math.min(15, capPct / 5); // up to 15 points for captain popularity

  // 5. Vice-captain percentage (backup indicator)
  const vcPct = Number(p.vice_captain_percentage ?? 0);
  score += Math.min(10, vcPct / 5); // up to 10 points

  // 6. Credits — higher credits usually mean higher fantasy points potential
  const credits = Number(p.credits ?? 0);
  score += Math.min(10, credits); // up to 10 points for high-value players

  // 7. Last play bonus — if player played last match, they're more likely to play this one
  if (Number(p.last_play) === 1) {
    score += 5; // bonus for confirmed last-match participation
  } else if (Number(p.last_play) === 0) {
    score -= 5; // penalty for missing last match
  }

  return Math.max(0, Math.min(100, score));
}
