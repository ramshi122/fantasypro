/**
 * Player Form Predictor
 * =====================
 * Predicts player form based on points, selected_by %, last_play data.
 *
 * Returns score 0-100 and a category: In Form / Average / Out of Form / No Data
 */

import type { MatchPlayer } from "./api";

export type FormCategory = "In Form" | "Average" | "Out of Form" | "No Data";

export interface FormPrediction {
  score: number;
  category: FormCategory;
  recommendation: string;
}

function num(v: unknown, def = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

/**
 * Predict form for a single player.
 */
export function predictForm(player: MatchPlayer): FormPrediction {
  const points = num(player.points, 0);
  const selBy = num(player.selected_by ?? player.sel, 0);
  const lastPlay = num(player.last_play, 1);
  const credits = num(player.credits, 0);

  // No data: zero points AND zero sel_by AND no credits
  if (points === 0 && selBy === 0 && credits === 0) {
    return {
      score: 0,
      category: "No Data",
      recommendation: "No recent data — pick with caution",
    };
  }

  let score = 0;
  // Points (normalized 0-60 — max ~600 pts → 60)
  score += Math.min(60, points / 10);

  // Selection by crowd (0-25 — crowd wisdom)
  score += Math.min(25, selBy * 0.5);

  // Credits (0-10 — high credits = expected to score)
  score += Math.min(10, credits);

  // Last play bonus (0-5)
  if (lastPlay === 1) score += 5;
  else score -= 5;

  score = Math.max(0, Math.min(100, Math.round(score)));

  let category: FormCategory;
  let recommendation: string;

  if (score >= 70) {
    category = "In Form";
    recommendation = "Strong pick — likely to score well";
  } else if (score >= 40) {
    category = "Average";
    recommendation = "Decent pick — moderate expectations";
  } else if (score > 0) {
    category = "Out of Form";
    recommendation = "Risky — consider benching if alternatives exist";
  } else {
    category = "No Data";
    recommendation = "No recent data — pick with caution";
  }

  return { score, category, recommendation };
}

/**
 * Get form for a list of players sorted by form score (desc).
 */
export function rankByForm(players: MatchPlayer[]): Array<{ player: MatchPlayer; form: FormPrediction }> {
  return players
    .map((player) => ({ player, form: predictForm(player) }))
    .sort((a, b) => b.form.score - a.form.score);
}

export function formColor(category: FormCategory): string {
  switch (category) {
    case "In Form":
      return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
    case "Average":
      return "text-amber-400 bg-amber-500/10 border-amber-500/30";
    case "Out of Form":
      return "text-red-400 bg-red-500/10 border-red-500/30";
    case "No Data":
      return "text-slate-400 bg-slate-500/10 border-slate-500/30";
  }
}
