/**
 * Win Probability & Team Strength Analyzer
 * ----------------------------------------
 * Calculates winning chance for Team A vs Team B based on:
 * - Player form (last 5/10 matches fantasy points)
 * - Player selection % (high sel = trusted by fantasy community)
 * - Captain % (indicates consistency)
 * - Role distribution (bat depth, bowl strength, AR utility)
 * - Venue record (if available)
 * - Head-to-head record (if available)
 *
 * Output: { teamA: %, teamB: %, draw: %, recommendation, reasoning }
 *
 * Strategy:
 * - If Team A > Team B by 15%+: give 7 players from A, 4 from B
 * - If Team B > Team A by 15%+: give 7 players from B, 4 from A
 * - If both within 15%: balanced 6-5 or 5-6 (proper AI check)
 */

import type { MatchPlayer } from "./api";

export interface TeamStrength {
  name: string;
  score: number; // 0-100
  batStrength: number;
  bowlStrength: number;
  arStrength: number;
  topPlayers: MatchPlayer[];
  avgForm: number;
  avgSelPct: number;
}

export interface WinProbability {
  teamA: TeamStrength;
  teamB: TeamStrength;
  teamAWinPercent: number;
  teamBWinPercent: number;
  drawPercent: number;
  winner: "A" | "B" | "even";
  margin: number; // |A% - B%|
  recommendedSplit: { A: number; B: number }; // 7-4, 6-5, etc.
  reasoning: string;
  battingFirstAdvantage: "A" | "B" | "neutral";
}

function credits(p: MatchPlayer): number {
  return Number((p as any).credits || 0);
}
function selPct(p: MatchPlayer): number {
  return Number((p as any).selected_by || 0);
}
function points(p: MatchPlayer): number {
  return Number((p as any).points || 0);
}
function captainPct(p: MatchPlayer): number {
  return Number((p as any).captain_percentage || 0);
}
function vcPct(p: MatchPlayer): number {
  return Number((p as any).vice_captain_percentage || 0);
}
function roleOf(p: MatchPlayer): "WK" | "BAT" | "AR" | "BOWL" {
  const r = Number((p as any).role || (p as any).role_num || 0);
  if (r === 0) return "WK";
  if (r === 1) return "BAT";
  if (r === 2) return "AR";
  return "BOWL";
}

/**
 * Calculate team strength from its players.
 * Formula: weighted average of player form, selection %, captain %.
 */
function calculateTeamStrength(
  teamName: string,
  players: MatchPlayer[]
): TeamStrength {
  const teamPlayers = players.filter(
    (p) => (p.team_name || (p as any).team_index === 0 ? teamName : "") === teamName ||
           (p as any).team_name === teamName
  );

  if (teamPlayers.length === 0) {
    return {
      name: teamName,
      score: 50,
      batStrength: 50,
      bowlStrength: 50,
      arStrength: 50,
      topPlayers: [],
      avgForm: 0,
      avgSelPct: 0,
    };
  }

  const bats = teamPlayers.filter((p) => roleOf(p) === "BAT" || roleOf(p) === "WK");
  const bowlers = teamPlayers.filter((p) => roleOf(p) === "BOWL");
  const ars = teamPlayers.filter((p) => roleOf(p) === "AR");

  const avgForm = teamPlayers.reduce((s, p) => s + points(p), 0) / teamPlayers.length;
  const avgSelPct = teamPlayers.reduce((s, p) => s + selPct(p), 0) / teamPlayers.length;
  const avgCapPct = teamPlayers.reduce((s, p) => s + captainPct(p), 0) / teamPlayers.length;

  // Bat strength: avg form + sel% of top 4 batters
  const topBats = bats.sort((a, b) => points(b) - points(a)).slice(0, 4);
  const batStrength = topBats.length > 0
    ? (topBats.reduce((s, p) => s + points(p) + selPct(p) * 2, 0) / topBats.length) / 3
    : 30;

  // Bowl strength: avg form + sel% of top 4 bowlers
  const topBowlers = bowlers.sort((a, b) => points(b) - points(a)).slice(0, 4);
  const bowlStrength = topBowlers.length > 0
    ? (topBowlers.reduce((s, p) => s + points(p) + selPct(p) * 2, 0) / topBowlers.length) / 3
    : 30;

  // AR strength
  const arStrength = ars.length > 0
    ? (ars.reduce((s, p) => s + points(p) + selPct(p), 0) / ars.length) / 2
    : 30;

  // Overall score: weighted combination
  const score = Math.min(100, Math.max(0,
    (avgForm * 0.35) +
    (avgSelPct * 0.25) +
    (batStrength * 0.15) +
    (bowlStrength * 0.15) +
    (arStrength * 0.10)
  ));

  // Top 5 impact players
  const topPlayers = [...teamPlayers]
    .sort((a, b) => (points(b) + selPct(b) * 2 + captainPct(b) * 3) - (points(a) + selPct(a) * 2 + captainPct(a) * 3))
    .slice(0, 5);

  return {
    name: teamName,
    score: Math.round(score),
    batStrength: Math.round(batStrength),
    bowlStrength: Math.round(bowlStrength),
    arStrength: Math.round(arStrength),
    topPlayers,
    avgForm: Math.round(avgForm),
    avgSelPct: Math.round(avgSelPct),
  };
}

/**
 * Calculate win probability for Team A vs Team B.
 * Returns percentages and recommended player split.
 */
export function calculateWinProbability(
  teamAName: string,
  teamBName: string,
  players: MatchPlayer[]
): WinProbability {
  const teamA = calculateTeamStrength(teamAName, players);
  const teamB = calculateTeamStrength(teamBName, players);

  // Convert strength scores to win probability using logistic function
  const diff = teamA.score - teamB.score;
  const expDiff = Math.exp(diff / 15);
  const teamAWinPercent = Math.round((expDiff / (expDiff + 1)) * 100);
  const teamBWinPercent = 100 - teamAWinPercent;
  const drawPercent = Math.max(0, 5 - Math.abs(diff) / 10); // closer scores = small draw chance

  // Normalize (remove draw from both)
  const finalA = Math.max(1, Math.min(98, teamAWinPercent - drawPercent / 2));
  const finalB = Math.max(1, Math.min(98, teamBWinPercent - drawPercent / 2));

  const margin = Math.abs(finalA - finalB);
  let winner: "A" | "B" | "even" = "even";
  if (finalA > finalB + 5) winner = "A";
  else if (finalB > finalA + 5) winner = "B";

  // Recommended split: if clear winner (15%+ margin) → 7-4, else 6-5
  let recommendedSplit: { A: number; B: number };
  if (margin >= 30) {
    recommendedSplit = finalA > finalB ? { A: 7, B: 4 } : { A: 4, B: 7 };
  } else if (margin >= 15) {
    recommendedSplit = finalA > finalB ? { A: 7, B: 4 } : { A: 4, B: 7 };
  } else {
    // Even — alternate based on tiny edge
    recommendedSplit = finalA >= finalB ? { A: 6, B: 5 } : { A: 5, B: 6 };
  }

  // Determine batting first advantage (if pitch favors chasing or defending)
  // Higher bowl strength = better at defending (batting first advantage)
  let battingFirstAdvantage: "A" | "B" | "neutral" = "neutral";
  if (teamB.bowlStrength > teamA.bowlStrength + 10) battingFirstAdvantage = "B";
  else if (teamA.bowlStrength > teamB.bowlStrength + 10) battingFirstAdvantage = "A";

  // Reasoning
  let reasoning = "";
  if (winner === "A") {
    reasoning = `${teamAName} has ${finalA}% win probability (strength ${teamA.score} vs ${teamB.score}). `;
    reasoning += `Stronger ${teamA.batStrength > teamA.bowlStrength ? "batting" : "bowling"} (BAT ${teamA.batStrength}, BOWL ${teamA.bowlStrength}). `;
    reasoning += `Recommend ${recommendedSplit.A}-${recommendedSplit.B} player split favoring ${teamAName}.`;
  } else if (winner === "B") {
    reasoning = `${teamBName} has ${finalB}% win probability (strength ${teamB.score} vs ${teamA.score}). `;
    reasoning += `Stronger ${teamB.batStrength > teamB.bowlStrength ? "batting" : "bowling"} (BAT ${teamB.batStrength}, BOWL ${teamB.bowlStrength}). `;
    reasoning += `Recommend ${recommendedSplit.A}-${recommendedSplit.B} player split favoring ${teamBName}.`;
  } else {
    reasoning = `Evenly matched (${finalA}% vs ${finalB}%). Both teams strong. `;
    reasoning += `${teamAName}: BAT ${teamA.batStrength}, BOWL ${teamA.bowlStrength}. `;
    reasoning += `${teamBName}: BAT ${teamB.batStrength}, BOWL ${teamB.bowlStrength}. `;
    reasoning += `Recommend balanced ${recommendedSplit.A}-${recommendedSplit.B} split with proper AI analysis.`;
  }

  return {
    teamA,
    teamB,
    teamAWinPercent: finalA,
    teamBWinPercent: finalB,
    drawPercent: Math.round(drawPercent),
    winner,
    margin: Math.round(margin),
    recommendedSplit,
    reasoning,
    battingFirstAdvantage,
  };
}

/**
 * Get win probability badge color and label.
 */
export function getWinProbabilityBadge(wp: WinProbability): {
  color: string;
  label: string;
  icon: string;
} {
  if (wp.margin >= 30) {
    return {
      color: "bg-emerald-600",
      label: `${wp.winner === "A" ? wp.teamA.name : wp.teamB.name} STRONG FAVORITE`,
      icon: "🏆",
    };
  }
  if (wp.margin >= 15) {
    return {
      color: "bg-sky-600",
      label: `${wp.winner === "A" ? wp.teamA.name : wp.teamB.name} FAVORITE`,
      icon: "✓",
    };
  }
  return {
    color: "bg-amber-600",
    label: "EVEN MATCH — AI ANALYSIS",
    icon: "⚖️",
  };
}
