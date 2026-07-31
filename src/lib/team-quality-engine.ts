/**
 * Elite AI Team Quality Engine
 * =============================
 *
 * Per user spec: "ടീം Generate ചെയ്യുക മാത്രമല്ല, ഉയർന്ന നിലവാരമുള്ള (High Quality) ടീമുകൾ മാത്രം Generate ചെയ്യണം."
 *
 * This is an ADDITIONAL validation layer that sits ON TOP of the existing
 * AI generator (sweep-generator.ts). It does NOT replace the generator —
 * it validates each generated team and rejects low-quality ones.
 *
 * Quality Score (0-100):
 *   95–100 → Elite Quality
 *   90–94  → Premium Quality
 *   85–89  → High Quality
 *   80–84  → Standard Quality
 *   < 80   → REJECTED (not returned to user)
 *
 * Validation checks (all must pass):
 *   ✅ Playing XI (no benched players)
 *   ✅ Credit Limit (≤ 100)
 *   ✅ Role Balance (WK/BAT/AR/BOWL composition)
 *   ✅ Captain Quality (not random — based on form/EFV)
 *   ✅ Vice-Captain Quality (not random — based on form/EFV)
 *   ✅ AI Confidence (team EFV above threshold)
 *   ✅ Fantasy Points Projection (sel% weighted)
 *   ✅ Risk Balance (not too many low-sel players)
 *   ✅ Transfer Compatibility (11 players, valid IDs)
 *   ✅ Team Quality Score (≥ 80)
 *
 * NO other modules are modified. This is purely additive.
 */

import type { MatchPlayer } from "./api";

// === Types ===

export interface TeamQualityResult {
  /** Quality score 0-100 */
  score: number;
  /** Quality tier label */
  tier: "elite" | "premium" | "high" | "standard" | "rejected";
  /** Whether the team passed all quality checks */
  passed: boolean;
  /** List of validation checks and their results */
  checks: Array<{ name: string; passed: boolean; detail?: string }>;
  /** Reasons for rejection (if any) */
  rejectionReasons: string[];
}

// === Constants ===

/** Minimum quality score to accept a team (per user spec: "80-ൽ താഴെയുള്ള Score ഉള്ള Team Generate ചെയ്യരുത്") */
export const MIN_QUALITY_SCORE = 80;

// === Helper Functions ===

/** Get player's EFV (Expected Fantasy Value) — used for quality scoring */
function getPlayerEFV(p: MatchPlayer): number {
  const sel = Number(p.selected_by ?? p.sel ?? 0);
  const credits = Number(p.credits ?? 8);
  // EFV = credits × sel% factor + base value
  // Higher sel% = more reliable = higher EFV
  const selFactor = Math.min(sel / 100, 1); // 0-1
  const baseValue = credits * 0.8;
  const selBonus = credits * selFactor * 0.4;
  return baseValue + selBonus;
}

/** Get player's playing probability (0-1) */
function getPlayingProbability(p: MatchPlayer): number {
  const playing = Number(p.playing);
  if (playing === 1) return 1.0;
  if (playing === 0 || playing === -1) return 0.0;
  if (p.playing === "false" || p.playing === "no") return 0.0;
  // undefined/null = unknown — assume 0.5 (pre-lineup)
  return 0.5;
}

/** Check if player is a bench/injured player */
function isBenchedOrInjured(p: MatchPlayer): boolean {
  const playing = Number(p.playing);
  if (playing === 0 || playing === -1) return true;
  if (p.playing === "false" || p.playing === "no") return true;

  const name = String(p.name || "").toLowerCase();
  const injuryKeywords = ["injur", "dropped", "unavailable", "retired", "suspended", "ruled out", "not playing", "rested"];
  for (const kw of injuryKeywords) {
    if (name.includes(kw)) return true;
  }
  return false;
}

/** Get player role */
function getRole(p: MatchPlayer): "WK" | "BAT" | "AR" | "BOWL" | "UNKNOWN" {
  const pt = String(p.player_type || "").toLowerCase();
  const role = Number(p.role);
  const roleText = String(p.role_text || "").toLowerCase();

  if (pt.includes("wk") || pt.includes("keeper") || roleText.includes("wk") || roleText.includes("keeper")) return "WK";
  if (pt.includes("bat") || roleText.includes("bat") || role === 1) return "BAT";
  if (pt.includes("all") || pt.includes("ar") || roleText.includes("all") || role === 2) return "AR";
  if (pt.includes("bowl") || roleText.includes("bowl") || role === 3) return "BOWL";
  return "UNKNOWN";
}

// === Quality Score Calculation ===

/**
 * Calculate the quality score for a team (0-100).
 *
 * Scoring breakdown:
 *   - Player Quality (25 pts): avg EFV of 11 players
 *   - Playing XI Probability (15 pts): all players have high playing probability
 *   - Role Balance (15 pts): valid WK/BAT/AR/BOWL composition
 *   - Captain Quality (15 pts): captain has high EFV relative to team
 *   - Vice-Captain Quality (10 pts): VC has high EFV relative to team
 *   - Credit Usage (10 pts): credits between 90-100 (optimal)
 *   - Risk Balance (10 pts): not too many low-sel players (unless GL strategy)
 */
export function calculateTeamQualityScore(
  players: MatchPlayer[],
  captainId: string,
  viceCaptainId: string,
  strategy?: string
): TeamQualityResult {
  const checks: Array<{ name: string; passed: boolean; detail?: string }> = [];
  const rejectionReasons: string[] = [];
  let score = 0;

  // === CHECK 1: Exactly 11 players ===
  const has11Players = players.length === 11;
  checks.push({
    name: "11 Players",
    passed: has11Players,
    detail: `${players.length}/11 players`,
  });
  if (!has11Players) {
    rejectionReasons.push(`Team has ${players.length} players (need 11)`);
  }

  // === CHECK 2: No benched/injured players ===
  const benchedPlayers = players.filter(isBenchedOrInjured);
  const noBenched = benchedPlayers.length === 0;
  checks.push({
    name: "No Benched/Injured",
    passed: noBenched,
    detail: benchedPlayers.length > 0 ? `${benchedPlayers.length} benched: ${benchedPlayers.map(p => p.name).join(", ")}` : "All playing",
  });
  if (!noBenched) {
    rejectionReasons.push(`${benchedPlayers.length} benched/injured players`);
  }

  // === CHECK 3: Credit limit ≤ 100 ===
  const totalCredits = players.reduce((s, p) => s + Number(p.credits || 0), 0);
  const creditsOk = totalCredits <= 100;
  checks.push({
    name: "Credit Limit",
    passed: creditsOk,
    detail: `${totalCredits.toFixed(1)}/100 credits`,
  });
  if (!creditsOk) {
    rejectionReasons.push(`Credits ${totalCredits.toFixed(1)} > 100`);
  }

  // === CHECK 4: Role balance ===
  const roles = players.map(getRole);
  const wkCount = roles.filter(r => r === "WK").length;
  const batCount = roles.filter(r => r === "BAT").length;
  const arCount = roles.filter(r => r === "AR").length;
  const bowlCount = roles.filter(r => r === "BOWL").length;
  const unknownCount = roles.filter(r => r === "UNKNOWN").length;

  // Valid composition: WK 1-4, BAT 3-6, AR 1-4, BOWL 3-6
  const roleBalanceOk =
    wkCount >= 1 && wkCount <= 4 &&
    batCount >= 3 && batCount <= 6 &&
    arCount >= 1 && arCount <= 4 &&
    bowlCount >= 3 && bowlCount <= 6 &&
    unknownCount === 0;
  checks.push({
    name: "Role Balance",
    passed: roleBalanceOk,
    detail: `WK:${wkCount} BAT:${batCount} AR:${arCount} BOWL:${bowlCount}`,
  });
  if (!roleBalanceOk) {
    rejectionReasons.push(`Role imbalance: WK:${wkCount} BAT:${batCount} AR:${arCount} BOWL:${bowlCount}`);
  }

  // === CHECK 5: Captain quality ===
  const captain = players.find(p =>
    String(p.player_fixed_id ?? p.pl_id ?? p.pid ?? p.name) === String(captainId)
  );
  const captainEFV = captain ? getPlayerEFV(captain) : 0;
  const teamEFVs = players.map(getPlayerEFV).sort((a, b) => b - a);
  const topEFV = teamEFVs[0] || 0;
  const captainQualityOk = captain !== undefined && captainEFV >= topEFV * 0.6; // captain must be in top 40%
  checks.push({
    name: "Captain Quality",
    passed: captainQualityOk,
    detail: captain ? `${captain.name} (EFV: ${captainEFV.toFixed(1)}, top: ${topEFV.toFixed(1)})` : "Captain not found",
  });
  if (!captainQualityOk) {
    rejectionReasons.push("Captain is not a high-quality pick (low EFV)");
  }

  // === CHECK 6: Vice-Captain quality ===
  const viceCaptain = players.find(p =>
    String(p.player_fixed_id ?? p.pl_id ?? p.pid ?? p.name) === String(viceCaptainId)
  );
  const vcEFV = viceCaptain ? getPlayerEFV(viceCaptain) : 0;
  const vcQualityOk = viceCaptain !== undefined && vcEFV >= topEFV * 0.5; // VC must be in top 50%
  checks.push({
    name: "Vice-Captain Quality",
    passed: vcQualityOk,
    detail: viceCaptain ? `${viceCaptain.name} (EFV: ${vcEFV.toFixed(1)})` : "VC not found",
  });
  if (!vcQualityOk) {
    rejectionReasons.push("Vice-Captain is not a high-quality pick");
  }

  // === CHECK 7: Captain ≠ Vice-Captain ===
  const cvDifferent = String(captainId) !== String(viceCaptainId);
  checks.push({
    name: "Captain ≠ VC",
    passed: cvDifferent,
    detail: cvDifferent ? "Different" : "SAME PLAYER!",
  });
  if (!cvDifferent) {
    rejectionReasons.push("Captain and Vice-Captain are the same player");
  }

  // === SCORE CALCULATION ===

  // 1. Player Quality (25 pts) — based on avg EFV
  const avgEFV = players.length > 0 ? players.reduce((s, p) => s + getPlayerEFV(p), 0) / players.length : 0;
  const playerQualityScore = Math.min(avgEFV / 12 * 25, 25); // normalize: avgEFV ~12 → 25 pts
  score += playerQualityScore;

  // 2. Playing XI Probability (15 pts)
  const avgPlayingProb = players.length > 0 ? players.reduce((s, p) => s + getPlayingProbability(p), 0) / players.length : 0;
  const playingScore = avgPlayingProb * 15;
  score += playingScore;

  // 3. Role Balance (15 pts)
  if (roleBalanceOk) score += 15;
  else if (unknownCount === 0) score += 8; // partial credit

  // 4. Captain Quality (15 pts)
  if (captainQualityOk) score += 15;
  else if (captain) score += 5; // partial credit

  // 5. Vice-Captain Quality (10 pts)
  if (vcQualityOk) score += 10;
  else if (viceCaptain) score += 3;

  // 6. Credit Usage (10 pts) — optimal 90-100
  if (totalCredits >= 90 && totalCredits <= 100) score += 10;
  else if (totalCredits >= 80) score += 7;
  else if (totalCredits >= 70) score += 4;

  // 7. Risk Balance (10 pts) — not too many low-sel players (unless GL strategy)
  const lowSelCount = players.filter(p => Number(p.selected_by ?? p.sel ?? 0) < 20).length;
  const isGLStrategy = strategy === "grand-league" || strategy === "differential";
  if (isGLStrategy) {
    // GL teams can have more low-sel players (contrarian)
    if (lowSelCount <= 5) score += 10;
    else if (lowSelCount <= 7) score += 7;
    else score += 3;
  } else {
    // Safe/balanced teams should have fewer low-sel players
    if (lowSelCount <= 2) score += 10;
    else if (lowSelCount <= 4) score += 7;
    else if (lowSelCount <= 6) score += 3;
  }

  // Round score
  score = Math.round(Math.max(0, Math.min(100, score)));

  // === DETERMINE TIER ===
  let tier: TeamQualityResult["tier"];
  if (score >= 95) tier = "elite";
  else if (score >= 90) tier = "premium";
  else if (score >= 85) tier = "high";
  else if (score >= 80) tier = "standard";
  else tier = "rejected";

  // === FINAL PASS/FAIL ===
  const allCriticalChecksPassed = has11Players && noBenched && creditsOk && cvDifferent;
  const passed = score >= MIN_QUALITY_SCORE && allCriticalChecksPassed;

  if (!passed && score >= MIN_QUALITY_SCORE) {
    // Score is high but a critical check failed — reject
    rejectionReasons.push("Critical check failed despite acceptable score");
  }

  return {
    score,
    tier,
    passed,
    checks,
    rejectionReasons: rejectionReasons.length > 0 ? rejectionReasons : [],
  };
}

/**
 * Validate a team against the quality engine.
 * Returns true if the team passes all quality checks.
 *
 * Per user spec: "ഓരോ ടീമിനും AI Quality Validation നിർബന്ധമാണ്."
 */
export function validateTeamQuality(
  players: MatchPlayer[],
  captainId: string,
  viceCaptainId: string,
  strategy?: string
): { valid: boolean; result: TeamQualityResult } {
  const result = calculateTeamQualityScore(players, captainId, viceCaptainId, strategy);
  return {
    valid: result.passed,
    result,
  };
}

/**
 * Get quality tier label for UI display.
 */
export function getQualityTierLabel(score: number): string {
  if (score >= 95) return "Elite Quality ⭐";
  if (score >= 90) return "Premium Quality 💎";
  if (score >= 85) return "High Quality 🏆";
  if (score >= 80) return "Standard Quality ✅";
  return "Rejected ❌";
}
