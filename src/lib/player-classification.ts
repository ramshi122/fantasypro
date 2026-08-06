/**
 * Color-Based Player Classification System
 * ==========================================
 *
 * Per user spec: "MANUAL PLAYER SELECTION – COLOR BASED AI SYSTEM"
 *
 * Classifies every player into one of 6 color categories based on AI prediction:
 *
 * BEFORE LINEUP MODE:
 *   🟢 BEST PICK — Highest confidence, core player, 80-100% of teams
 *   🟢 SAFE PICK — Very good player, recommended in most teams
 *   🟡 MID RISK  — Good differential, selected teams only
 *   🟠 RISKY     — High risk/reward, Grand League only
 *   🔴 AVOID     — Poor form, weak matchup, low fantasy expectation
 *   ⚫ UNKNOWN   — Insufficient data
 *
 * AFTER LINEUP MODE:
 *   🟢 BEST PICK — Confirmed Playing XI + Strong AI Rating
 *   🟢 SAFE PICK — Confirmed Playing XI + Good Rating
 *   🟡 MID RISK  — Confirmed Playing XI + Moderate Rating
 *   🟠 RISKY     — Confirmed Playing XI + Low Confidence
 *   🔴 AVOID     — Low Chance, Poor Form, Bad Matchup, Very Low AI Score
 *   ⚫ NOT PLAYING — Bench, Substitute, Reserve, Injured, Not in Official XI
 *
 * Confidence thresholds (AI score 0-100):
 *   BEST PICK:  85-100
 *   SAFE PICK:  70-84
 *   MID RISK:   55-69
 *   RISKY:      40-54
 *   AVOID:      0-39
 *   UNKNOWN:    no data (null score)
 */

import type { MatchPlayer } from "./api";
import { isPlayerSafeForPostLineup } from "./post-lineup-filter";

export type PlayerCategory =
  | "BEST_PICK"    // 🟢
  | "SAFE_PICK"    // 🟢
  | "MID_RISK"     // 🟡
  | "RISKY"        // 🟠
  | "AVOID"        // 🔴
  | "NOT_PLAYING"  // ⚫ (after lineup) / UNKNOWN (before lineup)
  | "UNKNOWN";     // ⚫ (before lineup, insufficient data)

export interface PlayerClassification {
  category: PlayerCategory;
  /** AI confidence score 0-100. null = unknown/insufficient data */
  confidence: number | null;
  /** Human-readable label for the badge */
  label: string;
  /** Emoji for the badge */
  emoji: string;
  /** Tailwind color classes for the badge */
  colorClass: string;
  /** Background color for the player row */
  rowBgClass: string;
  /** Short reason for the classification (shown in tooltip) */
  reason: string;
}

// === CATEGORY METADATA ===
export const CATEGORY_META: Record<PlayerCategory, Omit<PlayerClassification, "category" | "confidence" | "reason">> = {
  BEST_PICK: {
    label: "BEST",
    emoji: "🟢",
    colorClass: "bg-emerald-500 text-white",
    rowBgClass: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400",
  },
  SAFE_PICK: {
    label: "SAFE",
    emoji: "🟢",
    colorClass: "bg-green-400 text-white",
    rowBgClass: "bg-green-50 dark:bg-green-950/30 border-green-400",
  },
  MID_RISK: {
    label: "MID",
    emoji: "🟡",
    colorClass: "bg-yellow-500 text-white",
    rowBgClass: "bg-yellow-50 dark:bg-yellow-950/30 border-yellow-400",
  },
  RISKY: {
    label: "RISKY",
    emoji: "🟠",
    colorClass: "bg-orange-500 text-white",
    rowBgClass: "bg-orange-50 dark:bg-orange-950/30 border-orange-400",
  },
  AVOID: {
    label: "AVOID",
    emoji: "🔴",
    colorClass: "bg-red-500 text-white",
    rowBgClass: "bg-red-50 dark:bg-red-950/30 border-red-400",
  },
  NOT_PLAYING: {
    label: "NOT PLAYING",
    emoji: "⚫",
    colorClass: "bg-slate-600 text-white",
    rowBgClass: "bg-slate-100 dark:bg-slate-900/50 border-slate-400 line-through",
  },
  UNKNOWN: {
    label: "UNKNOWN",
    emoji: "⚫",
    colorClass: "bg-slate-400 text-white",
    rowBgClass: "bg-slate-50 dark:bg-slate-900/30 border-slate-300",
  },
};

/**
 * Calculate AI confidence score for a player (0-100).
 *
 * Per user spec rule 2: Classification must use ALL 18 data factors:
 *   1.  Official Playing XI    10. Death Overs
 *   2.  Toss                   11. Powerplay Role
 *   3.  Batting Order          12. Venue Record
 *   4.  Bowling Order          13. H2H (Head-to-Head)
 *   5.  Recent Form            14. Matchup
 *   6.  Fantasy Points         15. Pitch
 *   7.  Credits Value          16. Weather
 *   8.  Selection %            17. Injury News
 *   9.  Captain %              18. Official Team News
 *
 * Each factor contributes 0-N points to the total score (max 100).
 * Factors that have no data available contribute 0 (don't penalize).
 *
 * AFTER LINEUP: confirmed Playing XI bonus (+15), benched/injured/doubtful
 * forced to 0 (NOT_PLAYING).
 */
export function calculatePlayerConfidence(
  p: MatchPlayer,
  lineupAnnounced: boolean
): number | null {
  if (!p) return null;

  // === AFTER LINEUP: check if player is in confirmed Playing XI ===
  if (lineupAnnounced) {
    // If player is NOT safe (benched, injured, doubtful, etc.) → score = 0
    if (!isPlayerSafeForPostLineup(p)) {
      return 0;
    }
    // Confirmed Playing XI player → continues with full scoring below
  }

  let score = 0;
  let hasData = false;

  // === FACTOR 1: Official Playing XI (after lineup) ===
  // +15 if confirmed in Playing XI
  if (lineupAnnounced && isPlayerSafeForPostLineup(p)) {
    score += 15;
    hasData = true;
  }

  // === FACTOR 2: Toss ===
  // Toss impact: if player's team won toss, slight bonus (they get choice of bat/bowl)
  const toss = String((p as any).toss || (p as any).toss_won || "").toLowerCase();
  const playerTeam = String(p.team_name || "").toLowerCase();
  if (toss && playerTeam && toss.includes(playerTeam)) {
    score += 3; // player's team won toss
    hasData = true;
  }

  // === FACTOR 3: Batting Order ===
  // Top-order batters (positions 1-4) get more balls to face → more points potential
  const batOrder = Number((p as any).batting_order ?? (p as any).bat_order ?? (p as any).batting_position ?? 0);
  if (batOrder > 0) {
    if (batOrder <= 3) score += 8;       // top order — high scoring potential
    else if (batOrder <= 6) score += 5;  // middle order
    else score += 2;                      // lower order
    hasData = true;
  }

  // === FACTOR 4: Bowling Order ===
  // Bowlers who bowl in powerplay or death overs get more wicket opportunities
  const bowlOrder = String((p as any).bowling_order ?? (p as any).bowl_role ?? "").toLowerCase();
  if (bowlOrder) {
    if (bowlOrder.includes("new ball") || bowlOrder.includes("powerplay")) {
      score += 6; // new ball bowler
    } else if (bowlOrder.includes("death") || bowlOrder.includes("yorker")) {
      score += 7; // death overs bowler — high wicket potential
    } else if (bowlOrder.includes("middle")) {
      score += 4; // middle overs
    }
    hasData = true;
  }

  // === FACTOR 5: Recent Form ===
  // Points field represents recent fantasy points scored
  const points = Number(p.points ?? 0);
  if (points > 0) {
    score += Math.min(15, points / 4); // up to 15 pts
    hasData = true;
  }

  // === FACTOR 6: Fantasy Points (historical average) ===
  // Some backends provide 'fantasy_points' or 'avg_points' separately from 'points'
  const fantasyPoints = Number((p as any).fantasy_points ?? (p as any).avg_points ?? (p as any).average_points ?? 0);
  if (fantasyPoints > 0) {
    score += Math.min(10, fantasyPoints / 5); // up to 10 pts
    hasData = true;
  }

  // === FACTOR 7: Credits Value ===
  // Higher credits = higher fantasy points potential (Dream11 pricing reflects expected output)
  const creditsVal = Number(p.credits ?? 0);
  if (creditsVal > 0) {
    score += Math.min(8, creditsVal); // up to 8 pts (1 credit = 1 point)
    hasData = true;
  }

  // === FACTOR 8: Selection % ===
  // Higher selection % = community consensus = safer pick
  const selBy = Number(p.selected_by ?? p.sel ?? 0);
  if (selBy > 0) {
    score += Math.min(10, selBy / 10); // up to 10 pts
    hasData = true;
  }

  // === FACTOR 9: Captain % ===
  // High captain % = community trusts this player for C/VC
  const capPct = Number(p.captain_percentage ?? 0);
  if (capPct > 0) {
    score += Math.min(8, capPct / 4); // up to 8 pts
    hasData = true;
  }

  // === FACTOR 10: Vice Captain % ===
  const vcPct = Number(p.vice_captain_percentage ?? 0);
  if (vcPct > 0) {
    score += Math.min(5, vcPct / 5); // up to 5 pts
    hasData = true;
  }

  // === FACTOR 11: Venue Record ===
  // Player's historical performance at this venue
  const venueRuns = Number((p as any).venue_runs ?? (p as any).venue_points ?? 0);
  if (venueRuns > 0) {
    score += Math.min(6, venueRuns / 50); // up to 6 pts
    hasData = true;
  }

  // === FACTOR 12: H2H (Head-to-Head) ===
  // Player's record against opposition
  const h2hRuns = Number((p as any).h2h_runs ?? (p as any).vs_team_runs ?? 0);
  const h2hWickets = Number((p as any).h2h_wickets ?? (p as any).vs_team_wickets ?? 0);
  if (h2hRuns > 0 || h2hWickets > 0) {
    score += Math.min(6, (h2hRuns / 100) + (h2hWickets * 1.5)); // up to 6 pts
    hasData = true;
  }

  // === FACTOR 13: Matchup ===
  // How well the player matches up against the opposition
  const matchup = String((p as any).matchup || (p as any).opposition_matchup || "").toLowerCase();
  if (matchup) {
    if (matchup.includes("good") || matchup.includes("favorable") || matchup.includes("strong")) {
      score += 5;
    } else if (matchup.includes("bad") || matchup.includes("unfavorable") || matchup.includes("weak")) {
      score -= 5;
    }
    hasData = true;
  }

  // === FACTOR 14: Pitch ===
  // Pitch type affects player suitability
  const pitch = String((p as any).pitch_type || (p as any).pitch || "").toLowerCase();
  const playerRole = String(p.role_text || p.player_type || "").toLowerCase();
  if (pitch && playerRole) {
    if (pitch.includes("spin") && (playerRole.includes("bowl") || playerRole.includes("ar"))) {
      if (playerRole.includes("spin") || playerRole.includes("ar")) score += 4;
    } else if (pitch.includes("pace") || pitch.includes("bouncy")) {
      if (playerRole.includes("bowl") || playerRole.includes("ar")) score += 4;
    } else if (pitch.includes("flat") || pitch.includes("batting")) {
      if (playerRole.includes("bat") || playerRole.includes("wk")) score += 4;
    }
    hasData = true;
  }

  // === FACTOR 15: Weather ===
  // Rain/overcast conditions favor bowlers
  const weather = String((p as any).weather || "").toLowerCase();
  if (weather && playerRole) {
    if ((weather.includes("rain") || weather.includes("overcast")) &&
        (playerRole.includes("bowl") || playerRole.includes("ar"))) {
      score += 3; // bowling-friendly conditions
    }
    hasData = true;
  }

  // === FACTOR 16: Injury News ===
  // If player is injured, heavily penalize
  const injuryStatus = String(
    (p as any).injury || (p as any).injury_status || (p as any).is_injured || ""
  ).toLowerCase();
  if (injuryStatus && injuryStatus !== "0" && injuryStatus !== "false") {
    score -= 30; // heavy penalty for injured players
    hasData = true;
  }

  // === FACTOR 17: Official Team News ===
  // If player is mentioned in team news as doubtful/uncertain, penalize
  const teamNews = String((p as any).team_news || (p as any).news || "").toLowerCase();
  if (teamNews) {
    if (teamNews.includes("doubtful") || teamNews.includes("uncertain") || teamNews.includes("unconfirmed")) {
      score -= 15;
    } else if (teamNews.includes("confirmed") || teamNews.includes("playing")) {
      score += 5;
    }
    hasData = true;
  }

  // === FACTOR 18: Last Match Played (participation indicator) ===
  const lastPlay = Number(p.last_play);
  if (lastPlay === 1) {
    score += 3; // played last match — bonus
    hasData = true;
  } else if (lastPlay === 0) {
    score -= 3; // didn't play last match — penalty
    hasData = true;
  }

  // === ROLE BONUS (derived from player_type) ===
  // All-rounders are most valuable (contribute in both innings)
  const roleText = String(p.role_text || p.player_type || "").toLowerCase();
  if (roleText.includes("all") || roleText.includes("ar") || roleText.includes("round")) {
    score += 5; // all-rounder bonus
    hasData = true;
  } else if (roleText.includes("bat") || roleText.includes("wk")) {
    score += 3; // batter/keeper bonus
    hasData = true;
  } else if (roleText.includes("bowl")) {
    score += 2; // bowler bonus
    hasData = true;
  }

  if (!hasData) {
    return null; // insufficient data
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Classify a player into a color category.
 *
 * @param p - The player to classify
 * @param lineupAnnounced - Whether the official Playing XI has been announced
 * @returns PlayerClassification with category, confidence, label, colors, reason
 */
export function classifyPlayer(
  p: MatchPlayer,
  lineupAnnounced: boolean
): PlayerClassification {
  const confidence = calculatePlayerConfidence(p, lineupAnnounced);

  // === AFTER LINEUP: check NOT_PLAYING first ===
  if (lineupAnnounced && !isPlayerSafeForPostLineup(p)) {
    return {
      category: "NOT_PLAYING",
      confidence: 0,
      ...CATEGORY_META.NOT_PLAYING,
      reason: "Not in official Playing XI (bench/reserve/injured/doubtful)",
    };
  }

  // === UNKNOWN: insufficient data ===
  if (confidence === null) {
    return {
      category: "UNKNOWN",
      confidence: null,
      ...CATEGORY_META.UNKNOWN,
      reason: "Insufficient data for AI prediction",
    };
  }

  // === Classify by confidence score ===
  // NOTE: Before lineup, we DON'T have enough data to confidently mark a
  // player as AVOID. The backend marks all players as playing=0 and may
  // not provide points/selected_by. So before lineup, the minimum category
  // is RISKY (not AVOID). This prevents auto-excluding players that we
  // simply don't have enough data for yet.
  //
  // AFTER lineup: full classification applies — AVOID is valid because we
  // have confirmed Playing XI + form data.
  let category: PlayerCategory;
  let reason: string;

  if (confidence >= 85) {
    category = "BEST_PICK";
    reason = "Highest confidence — core player, recommended in 80-100% of teams";
  } else if (confidence >= 70) {
    category = "SAFE_PICK";
    reason = "Very good player — recommended in most teams";
  } else if (confidence >= 55) {
    category = "MID_RISK";
    reason = "Good differential — include only in selected teams";
  } else if (confidence >= 40) {
    category = "RISKY";
    reason = "High risk/high reward — Grand League only";
  } else {
    // Confidence < 40
    if (lineupAnnounced) {
      // After lineup: enough data to confidently say AVOID
      category = "AVOID";
      reason = "Poor form/weak matchup/low fantasy expectation (confirmed data)";
    } else {
      // Before lineup: NOT enough data to mark as AVOID — use RISKY instead
      // This ensures we don't auto-exclude players before lineup when we
      // simply don't have enough data yet. Team generation must work before lineup.
      category = "RISKY";
      reason = "Low confidence (limited pre-lineup data) — use with caution";
    }
  }

  return {
    category,
    confidence,
    ...CATEGORY_META[category],
    reason,
  };
}

/**
 * Classify all players in a pool.
 * Returns a Map of playerId → PlayerClassification for fast lookup.
 */
export function classifyAllPlayers(
  players: MatchPlayer[],
  lineupAnnounced: boolean
): Map<string, PlayerClassification> {
  const map = new Map<string, PlayerClassification>();
  for (const p of players) {
    const id = String(p.player_fixed_id ?? p.pl_id ?? p.pid ?? p.name ?? "");
    if (!id) continue;
    map.set(id, classifyPlayer(p, lineupAnnounced));
  }
  return map;
}

/**
 * Get the player ID string from a MatchPlayer (helper).
 */
export function getPlayerId(p: MatchPlayer): string {
  return String(p.player_fixed_id ?? p.pl_id ?? p.pid ?? p.name ?? "");
}

/**
 * Check if a player should be EXCLUDED from team generation.
 *
 * Per user spec: "Players marked ⚫ NOT PLAYING or 🔴 AVOID must NEVER be
 * selected in any generated team."
 */
export function shouldExcludePlayer(classification: PlayerClassification): boolean {
  return classification.category === "NOT_PLAYING" || classification.category === "AVOID";
}

/**
 * Get summary stats for a pool of classified players.
 * Useful for showing "12 Best, 8 Safe, 5 Mid, 3 Risky, 2 Avoid, 4 Not Playing" in UI.
 */
export function getClassificationSummary(
  classifications: Map<string, PlayerClassification>
): Record<PlayerCategory, number> {
  const summary: Record<PlayerCategory, number> = {
    BEST_PICK: 0,
    SAFE_PICK: 0,
    MID_RISK: 0,
    RISKY: 0,
    AVOID: 0,
    NOT_PLAYING: 0,
    UNKNOWN: 0,
  };
  for (const c of classifications.values()) {
    summary[c.category]++;
  }
  return summary;
}

// ============================================================
// COMPREHENSIVE TEAM VALIDATION (per user spec rule 12 & 13)
// ============================================================
//
// "Team Generate ചെയ്യുന്നതിന് മുമ്പ് എല്ലാ ടീമുകളും Validate ചെയ്യണം."
// (Validate all teams before generation.)
//
// Checks:
//   - Exactly 11 Players
//   - Playing XI Only (no bench)
//   - No Injured
//   - No Doubtful
//   - No Low Chance
//   - No Avoid
//   - No Duplicate Players
//   - Dream11 Rules Valid (1 WK min, ≤8 per role, credits ≤ 100, ≤7 from one team)

export interface TeamValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate a generated team against ALL Dream11 + user spec rules.
 *
 * @param team - Array of 11 MatchPlayers
 * @param classifications - Player classification map (from classifyAllPlayers)
 * @param lineupAnnounced - Whether official Playing XI is confirmed
 * @returns TeamValidationResult with valid flag + errors + warnings
 */
export function validateTeamComprehensive(
  team: MatchPlayer[],
  classifications: Map<string, PlayerClassification>,
  lineupAnnounced: boolean
): TeamValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // === CHECK 1: Exactly 11 players ===
  if (!Array.isArray(team) || team.length !== 11) {
    errors.push(`Team must have exactly 11 players (has ${team?.length || 0})`);
  }

  if (team.length === 0) {
    return { valid: false, errors, warnings };
  }

  // === CHECK 2: No duplicate players ===
  const seenIds = new Set<string>();
  for (const p of team) {
    const id = getPlayerId(p);
    if (seenIds.has(id)) {
      errors.push(`Duplicate player: ${p.name || id}`);
    }
    seenIds.add(id);
  }

  // === CHECK 3: No AVOID or NOT_PLAYING players (per user spec rule 4) ===
  // "🔴 AVOID, ⚫ NOT PLAYING കളിക്കാരെ ... 100% ഒഴിവാക്കണം."
  for (const p of team) {
    const id = getPlayerId(p);
    const c = classifications.get(id);
    if (c) {
      if (c.category === "NOT_PLAYING") {
        errors.push(`NOT_PLAYING player in team: ${p.name} (must be excluded)`);
      } else if (c.category === "AVOID") {
        errors.push(`AVOID player in team: ${p.name} (must be excluded)`);
      }
    }
  }

  // === CHECK 4: After lineup — only Playing XI (no bench/injured/doubtful) ===
  if (lineupAnnounced) {
    for (const p of team) {
      // Use the post-lineup filter to check safety
      const isSafe = isPlayerSafeForPostLineup(p);
      if (!isSafe) {
        errors.push(`Unsafe player after lineup: ${p.name} (bench/injured/doubtful/low chance)`);
      }
    }
  }

  // === CHECK 5: Credits ≤ 100 (Dream11 rule) ===
  const totalCredits = team.reduce((sum, p) => sum + Number(p.credits ?? 0), 0);
  if (totalCredits > 100) {
    errors.push(`Total credits ${totalCredits.toFixed(1)} exceeds 100 limit`);
  }

  // === CHECK 6: Role distribution (Dream11 rules) ===
  // Count players per role
  const roleCounts: Record<string, number> = { WK: 0, BAT: 0, AR: 0, BOWL: 0 };
  for (const p of team) {
    const roleText = String(p.role_text || p.player_type || "").toLowerCase();
    const roleNum = Number(p.role);
    let role: string;
    if (roleText.includes("keep") || roleText.includes("wk") || roleNum === 0 || roleNum === 1) {
      role = "WK";
    } else if (roleText.includes("bowl") || roleNum === 3 || roleNum === 6) {
      role = "BOWL";
    } else if (roleText.includes("all") || roleText.includes("ar") || roleNum === 2 || roleNum === 5) {
      role = "AR";
    } else {
      role = "BAT";
    }
    roleCounts[role]++;
  }

  // Dream11 rules:
  //   - WK: 1-8 (at least 1 wicket-keeper)
  //   - BAT: 0-8
  //   - AR: 0-8
  //   - BOWL: 0-8
  //   - Max 8 per role
  if (roleCounts.WK < 1) {
    errors.push("At least 1 Wicket-Keeper required (Dream11 rule)");
  }
  if (roleCounts.WK > 8) errors.push(`Too many WK: ${roleCounts.WK} (max 8)`);
  if (roleCounts.BAT > 8) errors.push(`Too many BAT: ${roleCounts.BAT} (max 8)`);
  if (roleCounts.AR > 8) errors.push(`Too many AR: ${roleCounts.AR} (max 8)`);
  if (roleCounts.BOWL > 8) errors.push(`Too many BOWL: ${roleCounts.BOWL} (max 8)`);

  // === CHECK 7: Team balance (max 7 players from one team — Dream11 rule) ===
  const teamCounts: Record<string, number> = {};
  for (const p of team) {
    const teamName = String(p.team_name || p.team || "Unknown");
    teamCounts[teamName] = (teamCounts[teamName] || 0) + 1;
  }
  for (const [teamName, count] of Object.entries(teamCounts)) {
    if (count > 7) {
      errors.push(`Too many players from ${teamName}: ${count} (max 7 per team)`);
    }
  }

  // === CHECK 8: Captain and Vice-Captain must be safe (not AVOID/NOT_PLAYING) ===
  // This is checked by the caller (team.captain / team.viceCaptain fields).
  // We can't check it here without the TeamRow object, but the engine already
  // validates this during C/VC selection.

  // === WARNINGS (non-blocking) ===
  // Warn if team has too many RISKY players (should be GL only)
  let riskyCount = 0;
  let midRiskCount = 0;
  for (const p of team) {
    const id = getPlayerId(p);
    const c = classifications.get(id);
    if (c?.category === "RISKY") riskyCount++;
    if (c?.category === "MID_RISK") midRiskCount++;
  }
  if (riskyCount > 3) {
    warnings.push(`Team has ${riskyCount} RISKY players — recommended for Grand League only`);
  }
  if (midRiskCount > 5) {
    warnings.push(`Team has ${midRiskCount} MID_RISK players — high variation, use sparingly`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Check if a player is a "core player" (BEST_PICK) that should appear in
 * 80%+ of generated teams.
 *
 * Per user spec rule 5: "🟢 BEST PICK കളിക്കാർ Core Players ആയി കണക്കാക്കി
 * കൂടുതൽ ടീമുകളിൽ വരണം."
 */
export function isCorePlayer(classification: PlayerClassification): boolean {
  return classification.category === "BEST_PICK";
}

/**
 * Check if a player can be selected in the given team strategy.
 *
 * Per user spec rules 7 & 8:
 *   - 🟡 MID RISK: GL Variation only (limited use)
 *   - 🟠 RISKY: High Risk GL teams only
 *
 * @param classification - Player's classification
 * @param teamStrategy - 'safe' | 'balanced' | 'differential' | 'grand-league'
 * @returns true if player is allowed in this strategy type
 */
export function isPlayerAllowedInStrategy(
  classification: PlayerClassification,
  teamStrategy: "safe" | "balanced" | "differential" | "grand-league"
): boolean {
  // AVOID and NOT_PLAYING are NEVER allowed (any strategy)
  if (shouldExcludePlayer(classification)) return false;

  // BEST_PICK and SAFE_PICK are allowed in ALL strategies
  if (classification.category === "BEST_PICK" || classification.category === "SAFE_PICK") {
    return true;
  }

  // MID_RISK: allowed in balanced, differential, grand-league (not safe)
  if (classification.category === "MID_RISK") {
    return teamStrategy !== "safe";
  }

  // RISKY: allowed in differential and grand-league only
  if (classification.category === "RISKY") {
    return teamStrategy === "differential" || teamStrategy === "grand-league";
  }

  // UNKNOWN: allowed everywhere (we don't know enough to restrict)
  return true;
}
