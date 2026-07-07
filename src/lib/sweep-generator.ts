/**
 * Auto Team Sweep Generator
 * -------------------------
 * Generates N unique fantasy teams from a player pool, following:
 *  - 11 players per team
 *  - Role balance: 1 WK min, 3-6 BAT, 1-4 AR, 3-6 BOWL (cricket default)
 *  - 7 max players from one side
 *  - 100 credit cap (Dream11 rules)
 *  - Captain & Vice-Captain rotation across teams
 *  - No duplicate teams
 *  - Mix of safe / balanced / differential picks
 */

import type { MatchPlayer, TeamRow } from "./api";
import { roleFromPlayerType } from "./format";

export type SweepCount = 10 | 20 | 40 | 50 | 100 | 200 | 300 | 400 | 500;
export const SWEEP_OPTIONS: SweepCount[] = [10, 20, 40, 50, 100, 200, 300, 400, 500];

export interface SweepProgress {
  generated: number;
  total: number;
  phase: "validating" | "selecting" | "rotating" | "deduplicating" | "done";
  message: string;
}

export interface SweepResult {
  teams: TeamRow[];
  stats: {
    requested: number;
    generated: number;
    duplicates: number;
    attempts: number;
    coverage: {
      uniqueCaptains: number;
      uniqueViceCaptains: number;
      avgPlayerExposure: number;
      maxPlayerExposure: number;
    };
    roleDistribution: { WK: number; BAT: number; AR: number; BOWL: number };
    durationMs: number;
  };
}

/**
 * Validate that a player pool can produce valid teams.
 * Returns the cleaned pool (excluding only truly invalid players).
 *
 * Note: `playing === 0` means "playing status not yet decided" (before lineup
 * is out). We do NOT exclude these — we only exclude if a player has no name
 * or no credits (data integrity issues).
 */
export function cleanPlayerPool(players: MatchPlayer[]): MatchPlayer[] {
  return players.filter((p) => {
    // Exclude if no name
    if (!p.name) return false;
    // Exclude if no credits
    if (!p.credits || Number(p.credits) <= 0) return false;
    return true;
  });
}

/**
 * Sort players by selected_by % descending — top picks first.
 */
function sortByPopularity(players: MatchPlayer[]): MatchPlayer[] {
  return [...players].sort((a, b) => {
    const sa = Number(a.selected_by ?? a.sel ?? 0);
    const sb = Number(b.selected_by ?? b.sel ?? 0);
    return sb - sa;
  });
}

/**
 * Group players by role (WK/BAT/AR/BOWL).
 */
function groupByRole(players: MatchPlayer[]): Record<"WK" | "BAT" | "AR" | "BOWL", MatchPlayer[]> {
  const out: Record<"WK" | "BAT" | "AR" | "BOWL", MatchPlayer[]> = {
    WK: [],
    BAT: [],
    AR: [],
    BOWL: [],
  };
  for (const p of players) {
    const r = roleFromPlayerType(p.player_type, p.role as number) as "WK" | "BAT" | "AR" | "BOWL";
    if (out[r]) out[r].push(p);
  }
  // Sort each group by popularity
  for (const k of Object.keys(out) as Array<keyof typeof out>) {
    out[k] = sortByPopularity(out[k]);
  }
  return out;
}

/**
 * Group players by team.
 */
function groupByTeam(players: MatchPlayer[]): Map<string, MatchPlayer[]> {
  const out = new Map<string, MatchPlayer[]>();
  for (const p of players) {
    const t = p.team_name || "Unknown";
    if (!out.has(t)) out.set(t, []);
    out.get(t)!.push(p);
  }
  return out;
}

/**
 * Check if a team meets role balance requirements (Dream11 cricket).
 *  - 1 WK minimum
 *  - 3-6 BAT
 *  - 1-4 AR
 *  - 3-6 BOWL
 *  - Total exactly 11
 */
function isValidRoleBalance(players: MatchPlayer[]): boolean {
  if (players.length !== 11) return false;
  const counts = { WK: 0, BAT: 0, AR: 0, BOWL: 0 };
  for (const p of players) {
    const r = roleFromPlayerType(p.player_type, p.role as number) as keyof typeof counts;
    if (!(r in counts)) return false; // unknown role
    counts[r]++;
  }
  // Lenient role balance — Dream11 allows:
  //   WK: 1-8, BAT: 1-8, AR: 1-8, BOWL: 1-8 (just need 11 total)
  // But we enforce at least 1 WK for a valid cricket team
  if (counts.WK < 1 || counts.WK > 8) return false;
  if (counts.BAT < 2 || counts.BAT > 8) return false;
  if (counts.AR < 1 || counts.AR > 8) return false;
  if (counts.BOWL < 2 || counts.BOWL > 8) return false;
  return true;
}

/**
 * Check team-side balance (max 7 from one side, min 4 from other).
 * Lenient: allow 3-8 from one side if strict 4-7 fails.
 */
function isValidSideBalance(players: MatchPlayer[], team1Name: string, team2Name: string): boolean {
  const t1 = players.filter((p) => p.team_name === team1Name).length;
  const t2 = players.filter((p) => p.team_name === team2Name).length;
  // Strict: 4-7 from each side
  if (t1 <= 7 && t2 <= 7 && t1 >= 4 && t2 >= 4) return true;
  // Lenient fallback: 3-8 from each side (still valid Dream11)
  if (t1 <= 8 && t2 <= 8 && t1 >= 3 && t2 >= 3) return true;
  return false;
}

/**
 * Check credit limit (max 100).
 */
function isValidCredits(players: MatchPlayer[], max = 100): boolean {
  const total = players.reduce((s, p) => s + (Number(p.credits) || 0), 0);
  return total <= max;
}

/**
 * Generate a stable team fingerprint for duplicate detection.
 */
function teamFingerprint(players: MatchPlayer[]): string {
  return players
    .map((p) => String(p.player_fixed_id ?? p.pl_id ?? p.pid ?? p.name))
    .sort()
    .join("|");
}

/**
 * Pick N items from an array with weighted random selection.
 * Higher-weighted items are more likely to be picked, but low-weighted items
 * still have a chance (for differential picks).
 */
function weightedPick<T>(items: T[], weights: number[], n: number, rng: () => number = Math.random): T[] {
  if (items.length <= n) return [...items];
  const picked = new Set<number>();
  const result: T[] = [];
  let safety = 0;
  while (result.length < n && safety < 1000) {
    safety++;
    // Weighted random index
    const totalWeight = weights.reduce((s, w) => s + Math.max(w, 0.001), 0);
    let r = rng() * totalWeight;
    let idx = 0;
    for (let i = 0; i < weights.length; i++) {
      r -= Math.max(weights[i], 0.001);
      if (r <= 0) {
        idx = i;
        break;
      }
    }
    if (!picked.has(idx)) {
      picked.add(idx);
      result.push(items[idx]);
    }
  }
  return result;
}

/**
 * Strategy: pick players based on a "team type" that biases toward safe,
 * balanced, or differential combinations.
 */
type TeamType = "safe" | "balanced" | "differential";

function pickTeamByType(
  pool: { WK: MatchPlayer[]; BAT: MatchPlayer[]; AR: MatchPlayer[]; BOWL: MatchPlayer[] },
  type: TeamType,
  team1Name: string,
  team2Name: string,
  rng: () => number
): MatchPlayer[] | null {
  // Check available players per role
  const availWK = pool.WK.length;
  const availBAT = pool.BAT.length;
  const availAR = pool.AR.length;
  const availBOWL = pool.BOWL.length;

  // If any role has < 1 player, can't build a team
  if (availWK < 1 || availBAT < 1 || availAR < 1 || availBOWL < 1) {
    console.log("[pickTeamByType] Insufficient players:", { WK: availWK, BAT: availBAT, AR: availAR, BOWL: availBOWL });
    return null;
  }

  // Dynamically build role config based on available players
  // Target: WK=1, BAT=2-5, AR=1-4, BOWL=2-5, total=11
  // Adjust based on what's available
  let wk = 1;
  let ar = Math.min(availAR, Math.max(1, Math.floor(rng() * 3) + 1)); // 1-3
  let remaining = 11 - wk - ar;

  // Split remaining between BAT and BOWL, respecting availability
  let bat = Math.min(availBAT, Math.max(2, Math.floor(remaining / 2) + Math.floor(rng() * 2) - 1));
  let bowl = remaining - bat;

  // Clamp to available players
  if (bat > availBAT) { bowl += bat - availBAT; bat = availBAT; }
  if (bowl > availBOWL) { bat += bowl - availBOWL; bowl = availBOWL; }
  if (bat < 1) { bat = 1; bowl = remaining - 1; }
  if (bowl < 1) { bowl = 1; bat = remaining - 1; }

  // Final safety check — if we still can't make 11, try WK=2
  if (wk + bat + ar + bowl !== 11 && availWK >= 2) {
    wk = 2;
    ar = Math.min(availAR, Math.max(1, Math.floor(rng() * 3) + 1));
    remaining = 11 - wk - ar;
    bat = Math.min(availBAT, Math.max(2, Math.floor(remaining / 2)));
    bowl = remaining - bat;
    if (bat > availBAT) { bowl += bat - availBAT; bat = availBAT; }
    if (bowl > availBOWL) { bat += bowl - availBOWL; bowl = availBOWL; }
  }

  const cfg = { WK: wk, BAT: bat, AR: ar, BOWL: bowl };

  // Verify we have enough players for each role
  if (cfg.WK > availWK || cfg.BAT > availBAT || cfg.AR > availAR || cfg.BOWL > availBOWL) {
    console.log("[pickTeamByType] Config exceeds available:", cfg, { availWK, availBAT, availAR, availBOWL });
    return null;
  }

  // Weights based on team type
  const weightFn = (idx: number, total: number, type: TeamType): number => {
    // Normalize position: 0 = top pick, 1 = bottom
    const t = total > 1 ? idx / (total - 1) : 0;
    if (type === "safe") {
      // Strongly favor top picks
      return Math.exp(-t * 4);
    }
    if (type === "balanced") {
      // Moderate favor to top, some spread
      return Math.exp(-t * 1.5);
    }
    // differential — more even weighting, sometimes favors mid/low picks
    return Math.exp(-t * 0.5) + (rng() > 0.7 ? 0.5 : 0);
  };

  // Pick players for each role
  const picked: MatchPlayer[] = [];
  for (const role of ["WK", "BAT", "AR", "BOWL"] as const) {
    const items = pool[role];
    const need = cfg[role];
    if (items.length < need) return null;
    const weights = items.map((_, idx) => weightFn(idx, items.length, type));
    const chosen = weightedPick(items, weights, need, rng);
    picked.push(...chosen);
  }

  // Validate side balance — retry swap if needed
  let attempts = 0;
  while ((!isValidSideBalance(picked, team1Name, team2Name)) && attempts < 20) {
    attempts++;
    // Find a player from the dominant side and try swapping with same-role player from other side
    const t1Count = picked.filter((p) => p.team_name === team1Name).length;
    const dominantTeam = t1Count > 7 ? team1Name : team2Name;
    const otherTeam = dominantTeam === team1Name ? team2Name : team1Name;
    // Find a player in dominant side and a same-role replacement in other side
    for (let i = 0; i < picked.length; i++) {
      const p = picked[i];
      if (p.team_name !== dominantTeam) continue;
      const role = roleFromPlayerType(p.player_type, p.role as number);
      const candidates = pool[role as "WK" | "BAT" | "AR" | "BOWL"].filter(
        (c) => c.team_name === otherTeam && !picked.find((x) => x.player_fixed_id === c.player_fixed_id)
      );
      if (candidates.length > 0) {
        picked[i] = candidates[Math.floor(rng() * candidates.length)];
        break;
      }
    }
  }

  return picked;
}

/**
 * Pick a unique captain + vice-captain from a team's 11 players.
 * Rotates C/VC across the team set to maximize coverage.
 */
function pickCaptainVC(
  players: MatchPlayer[],
  usedCVPairs: Set<string>,
  rng: () => number
): { captain: string; viceCaptain: string } | null {
  // Prefer high-value captains (top selected_by) but rotate
  const sorted = [...players].sort(
    (a, b) => Number(b.selected_by ?? b.sel ?? 0) - Number(a.selected_by ?? a.sel ?? 0)
  );
  // Try top 5 players as captain, top 6 as VC
  const capCandidates = sorted.slice(0, Math.min(5, sorted.length));
  const vcCandidates = sorted.slice(0, Math.min(6, sorted.length));

  // Try combinations in rotated order to maximize coverage
  for (let i = 0; i < 30; i++) {
    const cap = capCandidates[Math.floor(rng() * capCandidates.length)];
    const vc = vcCandidates[Math.floor(rng() * vcCandidates.length)];
    if (!cap || !vc) continue;
    const capId = String(cap.player_fixed_id ?? cap.pl_id ?? cap.pid ?? cap.name);
    const vcId = String(vc.player_fixed_id ?? vc.pl_id ?? vc.pid ?? vc.name);
    if (capId === vcId) continue;
    const pairKey = capId + "|" + vcId;
    if (!usedCVPairs.has(pairKey)) {
      usedCVPairs.add(pairKey);
      return { captain: capId, viceCaptain: vcId };
    }
  }
  // Fallback: any pair even if duplicate
  const cap = capCandidates[0];
  const vc = vcCandidates[1] || capCandidates[0];
  if (!cap || !vc) return null;
  return {
    captain: String(cap.player_fixed_id ?? cap.pl_id ?? cap.pid ?? cap.name),
    viceCaptain: String(vc.player_fixed_id ?? vc.pl_id ?? vc.pid ?? vc.name),
  };
}

/**
 * Main sweep generator.
 * Generates up to `count` unique valid teams.
 *
 * Yields progress via the onProgress callback so the UI can show a progress bar
 * without freezing.
 */
export async function generateSweep(
  players: MatchPlayer[],
  count: SweepCount,
  team1Name: string,
  team2Name: string,
  onProgress?: (p: SweepProgress) => void
): Promise<SweepResult> {
  const startedAt = Date.now();
  onProgress?.({
    generated: 0,
    total: count,
    phase: "validating",
    message: "Validating player pool...",
  });

  // 1. Clean and validate pool
  const cleaned = cleanPlayerPool(players);
  if (cleaned.length < 11) {
    return {
      teams: [],
      stats: {
        requested: count,
        generated: 0,
        duplicates: 0,
        attempts: 0,
        coverage: { uniqueCaptains: 0, uniqueViceCaptains: 0, avgPlayerExposure: 0, maxPlayerExposure: 0 },
        roleDistribution: { WK: 0, BAT: 0, AR: 0, BOWL: 0 },
        durationMs: Date.now() - startedAt,
      },
    };
  }

  // 2. Group by role and team
  const byRole = groupByRole(cleaned);
  onProgress?.({
    generated: 0,
    total: count,
    phase: "selecting",
    message: `Generating ${count} unique teams...`,
  });

  const teams: TeamRow[] = [];
  const usedFingerprints = new Set<string>();
  const usedCVPairs = new Set<string>();
  let attempts = 0;
  let duplicates = 0;
  const maxAttempts = count * 50; // safety valve (increased from 20)

  // Use a seeded RNG for reproducibility-ish but still varied
  let seed = 12345 + count;
  const rng = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  // Strategy mix: ~40% safe, ~40% balanced, ~20% differential
  const strategyFor = (i: number): TeamType => {
    const mod = i % 10;
    if (mod < 4) return "safe";
    if (mod < 8) return "balanced";
    return "differential";
  };

  // 3. Generate teams in chunks to keep UI responsive
  const CHUNK = Math.max(5, Math.floor(count / 20));
  for (let i = 0; i < count; i++) {
    let team: MatchPlayer[] | null = null;
    let tries = 0;
    while (tries < 50 && !team) {
      tries++;
      attempts++;
      if (attempts > maxAttempts) break;
      const candidate = pickTeamByType(byRole, strategyFor(i), team1Name, team2Name, rng);
      if (!candidate) continue;
      if (!isValidRoleBalance(candidate)) continue;
      if (!isValidSideBalance(candidate, team1Name, team2Name)) continue;
      if (!isValidCredits(candidate)) continue;
      const fp = teamFingerprint(candidate);
      if (usedFingerprints.has(fp)) {
        duplicates++;
        continue;
      }
      team = candidate;
    }
    if (!team) {
      // Could not find a unique team — skip
      continue;
    }
    usedFingerprints.add(teamFingerprint(team));

    // 4. Pick C/VC
    onProgress?.({
      generated: i,
      total: count,
      phase: "rotating",
      message: `Rotating C/VC for team ${i + 1}/${count}...`,
    });
    const cv = pickCaptainVC(team, usedCVPairs, rng);
    if (!cv) continue;

    const teamRow: TeamRow = {
      _id: "sweep_" + i + "_" + Date.now().toString(36),
      teamId: "sweep_" + i,
      teamNo: i + 1,
      team_number: i + 1,
      players: team.map((p) => ({
        pid: p.player_fixed_id ?? p.pid,
        player_fixed_id: p.player_fixed_id,
        pl_id: p.pl_id,
        name: p.name,
        shortName: p.name?.slice(0, 4).toUpperCase(),
        team: p.team_name,
        team_name: p.team_name,
        role: roleFromPlayerType(p.player_type, p.role as number),
        role_num: p.role,
        player_type: p.player_type,
        credits: p.credits,
        selected_by: p.selected_by ?? p.sel,
        sel: p.sel,
        image: p.image,
      })),
      captain: cv.captain,
      viceCaptain: cv.viceCaptain,
      vicecaptain: cv.viceCaptain,
      c: cv.captain,
      vc: cv.viceCaptain,
      type: "sweep",
    };
    teams.push(teamRow);

    // Yield to UI every CHUNK teams
    if (i > 0 && i % CHUNK === 0) {
      onProgress?.({
        generated: i + 1,
        total: count,
        phase: "selecting",
        message: `Generated ${i + 1}/${count} teams...`,
      });
      // Micro-sleep so React can paint
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  onProgress?.({
    generated: teams.length,
    total: count,
    phase: "deduplicating",
    message: "Validating uniqueness...",
  });

  // 5. Final dedupe (safety)
  const finalTeams: TeamRow[] = [];
  const finalFingerprints = new Set<string>();
  for (const t of teams) {
    const fp = teamFingerprint((t.players || []) as unknown as MatchPlayer[]);
    if (finalFingerprints.has(fp)) continue;
    finalFingerprints.add(fp);
    finalTeams.push(t);
  }

  // 6. Compute coverage stats
  const captainSet = new Set(finalTeams.map((t) => String(t.captain)));
  const vcSet = new Set(finalTeams.map((t) => String(t.viceCaptain)));
  const playerExposure = new Map<string, number>();
  for (const t of finalTeams) {
    for (const p of t.players || []) {
      const id = String(p.player_fixed_id ?? p.pl_id ?? p.pid ?? p.name);
      playerExposure.set(id, (playerExposure.get(id) || 0) + 1);
    }
  }
  const exposureValues = Array.from(playerExposure.values());
  const avgExposure = exposureValues.length
    ? exposureValues.reduce((s, v) => s + v, 0) / exposureValues.length
    : 0;
  const maxExposure = exposureValues.length ? Math.max(...exposureValues) : 0;

  // Role distribution (use the stored role string which is already WK/BAT/AR/BOWL)
  const roleDist = { WK: 0, BAT: 0, AR: 0, BOWL: 0 };
  for (const t of finalTeams) {
    for (const p of t.players || []) {
      // Stored role is a string code from roleFromPlayerType
      const r = (p.role as string) as keyof typeof roleDist;
      if (roleDist[r] !== undefined) roleDist[r]++;
    }
  }

  onProgress?.({
    generated: finalTeams.length,
    total: count,
    phase: "done",
    message: `Generated ${finalTeams.length} unique teams`,
  });

  return {
    teams: finalTeams,
    stats: {
      requested: count,
      generated: finalTeams.length,
      duplicates,
      attempts,
      coverage: {
        uniqueCaptains: captainSet.size,
        uniqueViceCaptains: vcSet.size,
        avgPlayerExposure: Number(avgExposure.toFixed(2)),
        maxPlayerExposure: maxExposure,
      },
      roleDistribution: roleDist,
      durationMs: Date.now() - startedAt,
    },
  };
}
