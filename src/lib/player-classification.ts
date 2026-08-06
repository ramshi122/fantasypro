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
 * BEFORE LINEUP — based on:
 *   - Recent form (points)
 *   - Fantasy points potential (credits × role factor)
 *   - Selected by % (community wisdom)
 *   - Captain % (indicates trust)
 *   - Last match played (participation indicator)
 *   - Role (all-rounders get bonus)
 *
 * AFTER LINEUP — same factors + confirmed Playing XI bonus:
 *   - Confirmed playing XI: +20 bonus
 *   - Benched/injured/doubtful: forced to 0 (NOT_PLAYING)
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
    // Confirmed Playing XI player → base score + 20 bonus
  }

  let score = 0;
  let hasData = false;

  // 1. Recent form — points field (higher = better recent form)
  const points = Number(p.points ?? 0);
  if (points > 0) {
    score += Math.min(30, points / 3); // up to 30 pts
    hasData = true;
  }

  // 2. Fantasy points potential — credits × role factor
  const creditsVal = Number(p.credits ?? 0);
  if (creditsVal > 0) {
    // Higher credits = higher fantasy points potential
    score += Math.min(20, creditsVal * 2); // up to 20 pts
    hasData = true;
  }

  // 3. Selected by % (community wisdom — higher = safer pick)
  const selBy = Number(p.selected_by ?? p.sel ?? 0);
  if (selBy > 0) {
    score += Math.min(20, selBy / 5); // up to 20 pts
    hasData = true;
  }

  // 4. Captain % (indicates community trust for C/VC)
  const capPct = Number(p.captain_percentage ?? 0);
  if (capPct > 0) {
    score += Math.min(15, capPct / 3); // up to 15 pts
    hasData = true;
  }

  // 5. Last match played (participation indicator)
  const lastPlay = Number(p.last_play);
  if (lastPlay === 1) {
    score += 5; // played last match — bonus
    hasData = true;
  } else if (lastPlay === 0) {
    score -= 5; // didn't play last match — penalty
    hasData = true;
  }

  // 6. Role bonus — all-rounders are most valuable
  const roleText = String(p.role_text || p.player_type || "").toLowerCase();
  if (roleText.includes("all") || roleText.includes("ar") || roleText.includes("round")) {
    score += 10; // all-rounder bonus
    hasData = true;
  } else if (roleText.includes("bat") || roleText.includes("wk")) {
    score += 7; // batter/keeper bonus
    hasData = true;
  } else if (roleText.includes("bowl")) {
    score += 5; // bowler bonus
    hasData = true;
  }

  // After lineup bonus
  if (lineupAnnounced && isPlayerSafeForPostLineup(p)) {
    score += 20; // confirmed Playing XI bonus
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
    category = "AVOID";
    reason = "Poor form/weak matchup/low fantasy expectation";
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
