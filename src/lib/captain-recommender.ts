/**
 * AI Captain Recommendation
 * =========================
 * Scores each player using weighted factors:
 *   (points * 0.4) + (captain_percentage * 0.3) + (selected_by * 0.2) + (credits * 0.1)
 *
 * Returns top 3 captain picks + top 3 vice-captain picks with reasoning.
 */

import type { MatchPlayer } from "./api";

export interface CaptainPick {
  player: MatchPlayer;
  score: number;
  reasons: string[];
}

export interface CaptainRecommendation {
  captains: CaptainPick[];
  viceCaptains: CaptainPick[];
}

function num(v: unknown, def = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

/**
 * Score a player for captaincy.
 * Inputs are normalized to 0-100 scale before weighting.
 */
export function scorePlayerForCaptain(p: MatchPlayer): { score: number; reasons: string[] } {
  const points = num(p.points, 0);
  const captPct = num(p.captain_percentage, 0);
  const vcPct = num(p.vice_captain_percentage, 0);
  const selBy = num(p.selected_by ?? p.sel, 0);
  const credits = num(p.credits, 8);

  // Normalize: points (typical 0-1000, normalize to 0-100 via /10)
  const pointsNorm = Math.min(100, points / 10);
  const captNorm = Math.min(100, captPct);
  const selNorm = Math.min(100, selBy);
  const credNorm = Math.min(100, (credits / 10) * 100);

  const score = pointsNorm * 0.4 + captNorm * 0.3 + selNorm * 0.2 + credNorm * 0.1;

  const reasons: string[] = [];
  if (points > 0) reasons.push(`${points} pts this match`);
  if (captPct > 0) reasons.push(`${captPct.toFixed(1)}% users pick as C`);
  if (vcPct > 0) reasons.push(`${vcPct.toFixed(1)}% pick as VC`);
  if (selBy >= 50) reasons.push(`High selection ${selBy.toFixed(0)}%`);
  else if (selBy >= 20) reasons.push(`Decent selection ${selBy.toFixed(0)}%`);
  if (credits >= 9) reasons.push(`Premium credits ${credits}`);
  if (reasons.length === 0) reasons.push("Balanced profile");

  return { score: Math.round(score * 10) / 10, reasons };
}

/**
 * Recommend top 3 captain and vice-captain picks from a pool of match players.
 */
export function recommendCaptains(players: MatchPlayer[]): CaptainRecommendation {
  if (!players || players.length === 0) {
    return { captains: [], viceCaptains: [] };
  }

  const scored = players
    .map((p) => {
      const { score, reasons } = scorePlayerForCaptain(p);
      return { player: p, score, reasons };
    })
    .sort((a, b) => b.score - a.score);

  // For captain: prioritize captain_percentage
  const captains = [...scored]
    .sort((a, b) => {
      const ac = num(a.player.captain_percentage, 0);
      const bc = num(b.player.captain_percentage, 0);
      // If both have captain_percentage, sort by it; else by score
      if (ac > 0 || bc > 0) return bc - ac;
      return b.score - a.score;
    })
    .slice(0, Math.min(3, scored.length));

  // For vice-captain: prioritize vice_captain_percentage, but exclude top captain picks
  const captainIds = new Set(
    captains.map((c) => String(c.player.player_fixed_id || c.player.pl_id || c.player.pid || c.player.name))
  );
  const viceCandidates = scored.filter(
    (s) => !captainIds.has(String(s.player.player_fixed_id || s.player.pl_id || s.player.pid || s.player.name))
  );
  const viceCaptains = [...viceCandidates]
    .sort((a, b) => {
      const av = num(a.player.vice_captain_percentage, 0);
      const bv = num(b.player.vice_captain_percentage, 0);
      if (av > 0 || bv > 0) return bv - av;
      return b.score - a.score;
    })
    .slice(0, Math.min(3, viceCandidates.length));

  return { captains, viceCaptains };
}
