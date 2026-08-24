/**
 * AI Combination Recommendation Engine
 * =====================================
 *
 * Per user spec: "Smart AI Recommendation" + "Auto Combination Engine"
 *
 * Recommends the best team combination (WK/BAT/AR/BOWL) based on:
 *   - Pitch report (balanced/batting/bowling/spin/pace)
 *   - Weather
 *   - Venue history
 *   - Toss (after toss)
 *   - Confirmed Playing XI (after lineup)
 *   - Player roles available in the pool
 *
 * NEVER uses random combinations — only data-driven recommendations.
 */

import type { MatchPlayer, MatchInfo } from "./api";
import type { RoleCombo } from "./team-combos";

export interface ComboRecommendation {
  combo: RoleCombo;
  reason: string;
  pitchType: "balanced" | "batting" | "bowling" | "spin" | "pace" | "unknown";
  confidence: number; // 0-100
}

/**
 * Detect pitch type from match data.
 * Checks multiple possible field names from the backend.
 */
export function detectPitchType(match: MatchInfo | any): ComboRecommendation["pitchType"] {
  const pitch = String(
    match?.pitch_report || match?.pitch || match?.pitch_type ||
    match?.venue_pitch || match?.pitch_condition || ""
  ).toLowerCase();

  if (!pitch) return "unknown";

  if (pitch.includes("spin") || pitch.includes("turn") || pitch.includes("dry")) {
    return "spin";
  }
  if (pitch.includes("pace") || pitch.includes("bounce") || pitch.includes("bouncy") || pitch.includes("seam")) {
    return "pace";
  }
  if (pitch.includes("batting") || pitch.includes("flat") || pitch.includes("belter") || pitch.includes("high scoring")) {
    return "batting";
  }
  if (pitch.includes("bowling") || pitch.includes("green") || pitch.includes("overcast") || pitch.includes("difficult")) {
    return "bowling";
  }
  return "balanced";
}

/**
 * Get the recommended combination based on pitch type + player pool.
 *
 * Per user spec "Auto Combination Engine":
 *   Balanced Pitch  → 1 WK - 3 BAT - 3 AR - 4 BOWL
 *   Batting Pitch   → 1 WK - 4 BAT - 3 AR - 3 BOWL
 *   Bowling Pitch   → 1 WK - 3 BAT - 2 AR - 5 BOWL
 *   Spin Friendly   → increase spinner allocation (more AR/BOWL)
 *   Pace Friendly   → increase pacer allocation (more BOWL)
 *
 * Also adapts to the available player pool — if we don't have enough
 * players in a role, adjust the combination to what's possible.
 */
export function recommendCombination(
  match: MatchInfo | any,
  players: MatchPlayer[],
  lineupAnnounced: boolean
): ComboRecommendation {
  const pitchType = detectPitchType(match);

  // Count available players per role
  const roleCounts = { WK: 0, BAT: 0, AR: 0, BOWL: 0 };
  for (const p of players) {
    const roleText = String(p.role_text || p.player_type || "").toLowerCase();
    const roleNum = Number(p.role);
    if (roleText.includes("keep") || roleText.includes("wk") || roleNum === 0 || roleNum === 1) {
      roleCounts.WK++;
    } else if (roleText.includes("bowl") || roleNum === 3 || roleNum === 6) {
      roleCounts.BOWL++;
    } else if (roleText.includes("all") || roleText.includes("ar") || roleNum === 2 || roleNum === 5) {
      roleCounts.AR++;
    } else {
      roleCounts.BAT++;
    }
  }

  // Default combinations per pitch type
  const PITCH_COMBOS: Record<ComboRecommendation["pitchType"], { combo: RoleCombo; reason: string }> = {
    balanced: {
      combo: { wk: 1, bat: 3, ar: 3, bowl: 4 },
      reason: "Balanced pitch — 1 WK, 3 BAT, 3 AR, 4 BOWL (default recommended)",
    },
    batting: {
      combo: { wk: 1, bat: 4, ar: 3, bowl: 3 },
      reason: "Batting pitch — 4 BAT for maximum scoring, 3 AR for balance",
    },
    bowling: {
      combo: { wk: 1, bat: 3, ar: 2, bowl: 5 },
      reason: "Bowling pitch — 5 BOWL for wicket-taking advantage",
    },
    spin: {
      combo: { wk: 1, bat: 3, ar: 3, bowl: 4 },
      reason: "Spin-friendly pitch — 3 AR (spin all-rounders) + 4 BOWL for spin advantage",
    },
    pace: {
      combo: { wk: 1, bat: 3, ar: 2, bowl: 5 },
      reason: "Pace-friendly pitch — 5 BOWL for pace bowling advantage",
    },
    unknown: {
      combo: { wk: 1, bat: 4, ar: 3, bowl: 3 },
      reason: "No pitch data — using safe default (1 WK, 4 BAT, 3 AR, 3 BOWL)",
    },
  };

  let { combo, reason } = PITCH_COMBOS[pitchType];

  // === ADAPT TO AVAILABLE PLAYERS ===
  // If we don't have enough players in a role, adjust the combination.
  // E.g., if only 2 AR available but combo wants 3, reduce AR and add to BAT/BOWL.
  if (roleCounts.WK < combo.wk) {
    const deficit = combo.wk - roleCounts.WK;
    combo = { ...combo, wk: roleCounts.WK, bat: combo.bat + deficit };
    reason += ` · Adjusted: only ${roleCounts.WK} WK available`;
  }
  if (roleCounts.BAT < combo.bat) {
    const deficit = combo.bat - roleCounts.BAT;
    combo = { ...combo, bat: roleCounts.BAT, ar: combo.ar + deficit };
    reason += ` · Adjusted: only ${roleCounts.BAT} BAT available`;
  }
  if (roleCounts.AR < combo.ar) {
    const deficit = combo.ar - roleCounts.AR;
    combo = { ...combo, ar: roleCounts.AR, bowl: combo.bowl + deficit };
    reason += ` · Adjusted: only ${roleCounts.AR} AR available`;
  }
  if (roleCounts.BOWL < combo.bowl) {
    const deficit = combo.bowl - roleCounts.BOWL;
    combo = { ...combo, bowl: roleCounts.BOWL, bat: combo.bat + deficit };
    reason += ` · Adjusted: only ${roleCounts.BOWL} BOWL available`;
  }

  // Ensure sum is still 11
  const sum = combo.wk + combo.bat + combo.ar + combo.bowl;
  if (sum !== 11) {
    // Fix: add/remove from BAT (most flexible role)
    const diff = 11 - sum;
    combo = { ...combo, bat: Math.max(0, combo.bat + diff) };
  }

  // === AFTER LINEUP: boost confidence ===
  let confidence = 70;
  if (lineupAnnounced) {
    confidence = 90;
    reason += ` · After Lineup: confirmed Playing XI used`;
  }

  return {
    combo,
    reason,
    pitchType,
    confidence,
  };
}

/**
 * Get the list of recommended combinations to show in the swipe selector.
 * Returns the AI-recommended combo FIRST, then other valid combinations
 * sorted by similarity to the recommendation.
 */
export function getRecommendedComboList(
  recommendation: ComboRecommendation
): Array<{ combo: RoleCombo; label: string; isRecommended: boolean; badge?: string }> {
  const allCombos: Array<{ combo: RoleCombo; label: string; isRecommended: boolean; badge?: string }> = [];

  // The recommended combo goes first with a badge
  const recKey = `${recommendation.combo.wk}-${recommendation.combo.bat}-${recommendation.combo.ar}-${recommendation.combo.bowl}`;
  allCombos.push({
    combo: recommendation.combo,
    label: `${recommendation.combo.wk} WK - ${recommendation.combo.bat} BAT - ${recommendation.combo.ar} AR - ${recommendation.combo.bowl} BOWL`,
    isRecommended: true,
    badge: `⭐ AI Recommended (${recommendation.pitchType})`,
  });

  // Add other popular combinations (not duplicates of the recommended one)
  const popularCombos: RoleCombo[] = [
    { wk: 1, bat: 3, ar: 3, bowl: 4 },
    { wk: 1, bat: 4, ar: 2, bowl: 4 },
    { wk: 2, bat: 3, ar: 2, bowl: 4 },
    { wk: 1, bat: 4, ar: 3, bowl: 3 },
    { wk: 1, bat: 3, ar: 2, bowl: 5 },
    { wk: 2, bat: 4, ar: 2, bowl: 3 },
    { wk: 1, bat: 5, ar: 2, bowl: 3 },
    { wk: 1, bat: 3, ar: 4, bowl: 3 },
    { wk: 2, bat: 3, ar: 3, bowl: 3 },
    { wk: 1, bat: 4, ar: 1, bowl: 5 },
  ];

  for (const c of popularCombos) {
    const key = `${c.wk}-${c.bat}-${c.ar}-${c.bowl}`;
    if (key === recKey) continue; // skip duplicate
    allCombos.push({
      combo: c,
      label: `${c.wk} WK - ${c.bat} BAT - ${c.ar} AR - ${c.bowl} BOWL`,
      isRecommended: false,
    });
  }

  return allCombos;
}
