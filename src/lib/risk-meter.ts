/**
 * Risk Meter — Calculate risk score 0-100 for a team
 * ===================================================
 * Factors:
 *   - Playing XI confirmed (low risk) / not confirmed (high risk)
 *   - Captain selection (popular C = low risk)
 *   - Team balance (role + side balance)
 *   - Player form (last_play, points, sel%)
 */

import type { MatchPlayer, TeamRow } from "./api";

export type RiskLabel = "Safe" | "Moderate" | "Risky" | "High Risk";

export interface RiskResult {
  score: number;
  label: RiskLabel;
  reasons: string[];
}

function num(v: unknown, def = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function roleOf(p: MatchPlayer): string {
  if (p.role && typeof p.role === "string") return p.role;
  // numeric role: 0=WK,1=BAT,2=AR,3=BOWL
  const r = Number(p.role);
  if (Number.isFinite(r)) return ["WK", "BAT", "AR", "BOWL"][r] || "BAT";
  if (p.player_type) {
    const t = String(p.player_type).toLowerCase();
    if (t.includes("keeper") || t.includes("wk")) return "WK";
    if (t.includes("bowl") || t.includes("pacer") || t.includes("spinner")) return "BOWL";
    if (t.includes("all")) return "AR";
    return "BAT";
  }
  return "BAT";
}

/**
 * Calculate team risk.
 *
 * @param team team row with players + captain + viceCaptain
 * @param allPlayers full squad (for form lookups)
 * @param lineupAnnounced boolean — true if playing XI is confirmed
 */
export function calculateRisk(
  team: TeamRow,
  allPlayers: MatchPlayer[] = [],
  lineupAnnounced: boolean = false
): RiskResult {
  const players: MatchPlayer[] = team.players || [];
  const reasons: string[] = [];
  let score = 50; // baseline

  // 1. Lineup announcement (major factor)
  if (lineupAnnounced) {
    score -= 25;
    reasons.push("✅ Lineup announced — low risk");
  } else {
    score += 20;
    reasons.push("⚠️ Lineup not announced — risk of late changes");
  }

  // 2. Captain popularity
  const captainId = String(team.captain ?? team.c ?? "");
  const vcId = String(team.viceCaptain ?? team.vc ?? team.vicecaptain ?? "");
  const captain = players.find(
    (p) =>
      String(p.player_fixed_id || p.pl_id || p.pid || p.name) === captainId
  );
  if (captain) {
    const sel = num(captain.selected_by ?? captain.sel, 0);
    const captPct = num(captain.captain_percentage, 0);
    if (sel >= 60) {
      score -= 8;
      reasons.push(`Captain has ${sel.toFixed(0)}% selection — safe pick`);
    } else if (sel < 10) {
      score += 12;
      reasons.push(`Captain only ${sel.toFixed(0)}% selected — risky differential`);
    }
    if (captPct > 30) {
      score -= 4;
      reasons.push(`Strong captain pick (${captPct.toFixed(0)}% users pick as C)`);
    }
  } else {
    score += 5;
    reasons.push("Captain not clearly identified");
  }

  // VC check
  const vc = players.find(
    (p) =>
      String(p.player_fixed_id || p.pl_id || p.pid || p.name) === vcId
  );
  if (vc) {
    const vcPct = num(vc.vice_captain_percentage, 0);
    if (vcPct > 25) {
      score -= 3;
      reasons.push(`VC well-positioned (${vcPct.toFixed(0)}% pick as VC)`);
    }
  }

  // 3. Team balance — role + side
  const byRole: Record<string, number> = { WK: 0, BAT: 0, AR: 0, BOWL: 0 };
  for (const p of players) byRole[roleOf(p)] = (byRole[roleOf(p)] || 0) + 1;

  if (players.length !== 11) {
    score += 10;
    reasons.push(`Team has ${players.length} players (should be 11)`);
  }

  // Role balance checks
  if (byRole.WK < 1) {
    score += 6;
    reasons.push("No WK selected");
  }
  if (byRole.BAT < 3 || byRole.BAT > 6) {
    score += 5;
    reasons.push(`Unbalanced BAT count (${byRole.BAT})`);
  }
  if (byRole.AR < 1 || byRole.AR > 4) {
    score += 5;
    reasons.push(`Unbalanced AR count (${byRole.AR})`);
  }
  if (byRole.BOWL < 3 || byRole.BOWL > 6) {
    score += 5;
    reasons.push(`Unbalanced BOWL count (${byRole.BOWL})`);
  }

  // Side balance
  const teams = new Set(players.map((p) => String(p.team || p.team_name || p.team_index || "")));
  if (teams.size === 1 && players.length >= 11) {
    score += 15;
    reasons.push("All players from one team — very risky");
  } else {
    const counts: Record<string, number> = {};
    for (const p of players) {
      const k = String(p.team || p.team_name || p.team_index || "?");
      counts[k] = (counts[k] || 0) + 1;
    }
    const values = Object.values(counts).sort((a, b) => b - a);
    if (values[0] > 7) {
      score += 10;
      reasons.push(`One side has ${values[0]} players (max allowed 7)`);
    } else if (values[0] >= 6 && values.length === 2) {
      score -= 3;
      reasons.push("Good side balance");
    }
  }

  // 4. Player form
  let outOfFormCount = 0;
  let totalPoints = 0;
  for (const p of players) {
    const lastPlay = num(p.last_play, 1);
    if (lastPlay === 0) outOfFormCount++;
    totalPoints += num(p.points, 0);
  }
  if (outOfFormCount > 3) {
    score += 8;
    reasons.push(`${outOfFormCount} players didn't play last match`);
  }
  if (totalPoints === 0 && players.length > 0) {
    score += 5;
    reasons.push("No recent points data");
  } else if (totalPoints > 200) {
    score -= 5;
    reasons.push("Players in good form");
  }

  // Credit check
  const totalCredits = players.reduce((acc, p) => acc + num(p.credits, 0), 0);
  if (totalCredits > 100) {
    score += 8;
    reasons.push(`Credits exceeded (${totalCredits.toFixed(1)} > 100)`);
  } else if (totalCredits >= 95 && totalCredits <= 100) {
    score -= 3;
    reasons.push("Optimal credit usage");
  }

  // Clamp to 0-100
  score = Math.max(0, Math.min(100, Math.round(score)));

  let label: RiskLabel;
  if (score < 30) label = "Safe";
  else if (score < 55) label = "Moderate";
  else if (score < 80) label = "Risky";
  else label = "High Risk";

  return { score, label, reasons };
}

export function riskColor(label: RiskLabel): string {
  switch (label) {
    case "Safe":
      return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
    case "Moderate":
      return "text-amber-400 bg-amber-500/10 border-amber-500/30";
    case "Risky":
      return "text-orange-400 bg-orange-500/10 border-orange-500/30";
    case "High Risk":
      return "text-red-400 bg-red-500/10 border-red-500/30";
  }
}
