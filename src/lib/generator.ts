import type { MatchPlayer, TeamRow } from "./api";
import { roleFromPlayerType } from "./format";

/**
 * Fantasy Team Generator Engine
 *
 * Generates N unique valid fantasy teams from a player pool with:
 *  - Role balance enforcement (WK/BAT/AR/BOWL)
 *  - Credit limit (100 default)
 *  - Max 7 players from one team (Dream11 rule for cricket)
 *  - 11 players per team
 *  - Unique combinations (no duplicate teams)
 *  - Smart C/VC rotation across the team set
 *  - Tier-based player grouping (safe / balanced / differential)
 */

export const TEAM_SIZE = 11;
export const MAX_CREDITS = 100;
export const MAX_PER_TEAM = 7; // Dream11 cricket rule
export const MIN_PER_TEAM = 4;

// Role constraints (Dream11 cricket): 1-8 WK, 1-8 BAT, 1-8 AR, 1-8 BOWL
export const ROLE_LIMITS = {
  WK: { min: 1, max: 8 },
  BAT: { min: 1, max: 8 },
  AR: { min: 1, max: 8 },
  BOWL: { min: 1, max: 8 },
} as const;

export type PlayerTier = "safe" | "balanced" | "differential";

export interface RankedPlayer extends MatchPlayer {
  role: string; // WK | BAT | AR | BOWL
  tier: PlayerTier;
  teamName: string;
  creditsNum: number;
  selNum: number; // selected_by percentage
  playerId: string; // stable unique key
}

/**
 * Pre-process raw API players into a ranked, tiered pool.
 * Excludes bench/retired/unavailable (playing === 0 means not in playing XI,
 * but for pre-lineup we still include everyone; the engine will pick top by sel%).
 */
export function rankPlayers(allPlayers: MatchPlayer[]): RankedPlayer[] {
  return allPlayers
    .filter((p) => p && (p.name || p.shortName))
    .map((p) => {
      const role = roleFromPlayerType(p.player_type) || "BAT";
      const selNum = Number(p.selected_by ?? p.sel ?? 0);
      const creditsNum = Number(p.credits ?? 8);
      const tier: PlayerTier =
        selNum >= 60 ? "safe" : selNum >= 25 ? "balanced" : "differential";
      return {
        ...p,
        role,
        tier,
        teamName: String(p.team_name ?? p.team ?? "TBD"),
        creditsNum,
        selNum,
        playerId: String(p.player_fixed_id ?? p.pl_id ?? p.pid ?? p.name),
      } as RankedPlayer;
    });
}

/**
 * Group ranked players by role.
 */
export function byRole(players: RankedPlayer[]) {
  const groups: Record<string, RankedPlayer[]> = {
    WK: [],
    BAT: [],
    AR: [],
    BOWL: [],
  };
  for (const p of players) {
    if (!groups[p.role]) groups[p.role] = [];
    groups[p.role].push(p);
  }
  // Sort each by sel% descending (safe picks first)
  for (const k of Object.keys(groups)) {
    groups[k].sort((a, b) => b.selNum - a.selNum);
  }
  return groups;
}

/**
 * Group ranked players by team.
 */
export function byTeam(players: RankedPlayer[]): Record<string, RankedPlayer[]> {
  const groups: Record<string, RankedPlayer[]> = {};
  for (const p of players) {
    if (!groups[p.teamName]) groups[p.teamName] = [];
    groups[p.teamName].push(p);
  }
  return groups;
}

/* ---------- Team validation ---------- */

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

export function validateTeam(
  players: RankedPlayer[],
  team1Name: string,
  team2Name: string
): ValidationResult {
  if (players.length !== TEAM_SIZE) {
    return { ok: false, reason: `Need ${TEAM_SIZE} players, got ${players.length}` };
  }

  // Credit limit
  const totalCredits = players.reduce((s, p) => s + p.creditsNum, 0);
  if (totalCredits > MAX_CREDITS) {
    return { ok: false, reason: `Credits ${totalCredits.toFixed(1)} > ${MAX_CREDITS}` };
  }

  // Role balance
  const counts: Record<string, number> = { WK: 0, BAT: 0, AR: 0, BOWL: 0 };
  for (const p of players) counts[p.role] = (counts[p.role] || 0) + 1;
  for (const r of Object.keys(ROLE_LIMITS)) {
    const lim = ROLE_LIMITS[r as keyof typeof ROLE_LIMITS];
    if ((counts[r] || 0) < lim.min) {
      return { ok: false, reason: `${r} count ${counts[r]} < min ${lim.min}` };
    }
    if ((counts[r] || 0) > lim.max) {
      return { ok: false, reason: `${r} count ${counts[r]} > max ${lim.max}` };
    }
  }

  // Max players per side
  const t1 = players.filter((p) => p.teamName === team1Name).length;
  const t2 = players.filter((p) => p.teamName === team2Name).length;
  if (t1 > MAX_PER_TEAM) return { ok: false, reason: `${team1Name} has ${t1} > ${MAX_PER_TEAM}` };
  if (t2 > MAX_PER_TEAM) return { ok: false, reason: `${team2Name} has ${t2} > ${MAX_PER_TEAM}` };
  if (t1 < MIN_PER_TEAM) return { ok: false, reason: `${team1Name} has ${t1} < ${MIN_PER_TEAM}` };
  if (t2 < MIN_PER_TEAM) return { ok: false, reason: `${team2Name} has ${t2} < ${MIN_PER_TEAM}` };

  // No duplicate players
  const ids = new Set(players.map((p) => p.playerId));
  if (ids.size !== players.length) {
    return { ok: false, reason: "Duplicate player in team" };
  }

  return { ok: true };
}

/* ---------- Combination generation ---------- */

/**
 * Generate a stable hash key for a team's player set (for duplicate detection).
 * Sorts player IDs alphabetically and joins — order-independent.
 */
export function teamKey(players: RankedPlayer[]): string {
  return players
    .map((p) => p.playerId)
    .sort()
    .join("|");
}

/**
 * Pick N distinct items from an array using a seeded RNG.
 */
function seededPick<T>(arr: T[], n: number, rng: () => number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(rng() * copy.length);
    out.push(copy.splice(idx, 1)[0]);
  }
  return out;
}

/**
 * Mulberry32 — fast seeded PRNG. Same seed → same sequence.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Try to build ONE valid team from the player pool using the given seed and
 * tier mix preference. Returns null if no valid combination found in N attempts.
 *
 * Tier mix strategies (rotated across the team set for diversity):
 *   "safe":        mostly high-sel% players (7-8 safe, 2-3 balanced, 0-1 differential)
 *   "balanced":    mix of safe + balanced (4-5 safe, 4-5 balanced, 1-2 differential)
 *   "differential": heavy on differentials (2-3 safe, 4-5 balanced, 3-4 differential)
 *   "gl":           Grand League — random rotation across all tiers
 */
type Strategy = "safe" | "balanced" | "differential" | "gl";

function buildTeam(
  pool: RankedPlayer[],
  team1Name: string,
  team2Name: string,
  strategy: Strategy,
  seed: number
): RankedPlayer[] | null {
  const rng = mulberry32(seed);
  const byRolePool = byRole(pool);

  // For each role, decide how many safe/balanced/differential picks we want.
  // Role composition target: 1-2 WK, 3-5 BAT, 1-3 AR, 2-4 BOWL (sums to 11)
  const roleCompositions: Array<{
    role: string;
    count: number;
    safe: number;
    balanced: number;
    diff: number;
  }> = [];

  // Generate a random but valid role composition
  const wkCount = 1 + Math.floor(rng() * 2); // 1-2
  const arCount = 1 + Math.floor(rng() * 3); // 1-3
  const remaining = TEAM_SIZE - wkCount - arCount;
  // Split remaining between BAT and BOWL (3-5 each)
  const batCount = Math.max(3, Math.min(5, 3 + Math.floor(rng() * 3)));
  const bowlCount = remaining - batCount;
  if (bowlCount < 2 || bowlCount > 5) return null;

  roleCompositions.push({ role: "WK", count: wkCount, safe: 0, balanced: 0, diff: 0 });
  roleCompositions.push({ role: "BAT", count: batCount, safe: 0, balanced: 0, diff: 0 });
  roleCompositions.push({ role: "AR", count: arCount, safe: 0, balanced: 0, diff: 0 });
  roleCompositions.push({ role: "BOWL", count: bowlCount, safe: 0, balanced: 0, diff: 0 });

  // Assign tier mix per role based on strategy
  for (const rc of roleCompositions) {
    if (strategy === "safe") {
      rc.safe = Math.min(rc.count, Math.ceil(rc.count * 0.7));
      rc.balanced = Math.max(0, rc.count - rc.safe - 1);
      rc.diff = rc.count - rc.safe - rc.balanced;
    } else if (strategy === "balanced") {
      rc.safe = Math.ceil(rc.count * 0.4);
      rc.balanced = Math.ceil(rc.count * 0.4);
      rc.diff = rc.count - rc.safe - rc.balanced;
    } else if (strategy === "differential") {
      rc.safe = Math.max(1, Math.ceil(rc.count * 0.25));
      rc.balanced = Math.ceil(rc.count * 0.4);
      rc.diff = rc.count - rc.safe - rc.balanced;
    } else {
      // gl: random
      const safeMax = Math.max(0, rc.count - 1);
      rc.safe = Math.floor(rng() * (safeMax + 1));
      const balancedMax = Math.max(0, rc.count - rc.safe);
      rc.balanced = Math.floor(rng() * (balancedMax + 1));
      rc.diff = rc.count - rc.safe - rc.balanced;
      if (rc.diff < 0) rc.diff = 0;
    }
    // Clamp negatives
    rc.safe = Math.max(0, rc.safe);
    rc.balanced = Math.max(0, rc.balanced);
    rc.diff = Math.max(0, rc.diff);
  }

  // Pick players per role
  const team: RankedPlayer[] = [];
  for (const rc of roleCompositions) {
    const poolForRole = byRolePool[rc.role] || [];
    if (poolForRole.length < rc.count) return null;

    const safePool = poolForRole.filter((p) => p.tier === "safe");
    const balancedPool = poolForRole.filter((p) => p.tier === "balanced");
    const diffPool = poolForRole.filter((p) => p.tier === "differential");

    // If a tier doesn't have enough players, fall back to other tiers
    const picks: RankedPlayer[] = [];
    picks.push(...seededPick(safePool, rc.safe, rng));
    picks.push(...seededPick(balancedPool, rc.balanced, rng));
    picks.push(...seededPick(diffPool, rc.diff, rng));

    // Fill the remainder from the full pool if we didn't get enough
    if (picks.length < rc.count) {
      const remainingNeeded = rc.count - picks.length;
      const used = new Set(picks.map((p) => p.playerId));
      const leftover = poolForRole.filter((p) => !used.has(p.playerId));
      picks.push(...seededPick(leftover, remainingNeeded, rng));
    }

    if (picks.length < rc.count) return null;
    team.push(...picks);
  }

  if (team.length !== TEAM_SIZE) return null;

  // Validate the team
  const v = validateTeam(team, team1Name, team2Name);
  if (!v.ok) return null;

  return team;
}

/* ---------- C/VC rotation ---------- */

/**
 * Pick a Captain and Vice-Captain from a team.
 * Strategy: rotate across the team set so no two teams share the same C/VC pair.
 *
 * - Prefer top-sel% players for C/VC (they're the safe picks)
 * - For GL teams, sometimes pick differential C/VCs for upside
 */
function pickCandVC(
  team: RankedPlayer[],
  teamIndex: number,
  usedPairs: Set<string>,
  rng: () => number
): { captain: string; viceCaptain: string } | null {
  // Sort by sel% descending — top players are good C/VC candidates
  const sorted = [...team].sort((a, b) => b.selNum - a.selNum);
  // Take top 6 as candidates (avoid WK as VC sometimes for variety)
  const candidates = sorted.slice(0, Math.min(6, sorted.length));
  if (candidates.length < 2) return null;

  // Try combinations in a rotated order
  const attempts: Array<[number, number]> = [];
  const startIdx = teamIndex % candidates.length;
  for (let i = 0; i < candidates.length; i++) {
    for (let j = 0; j < candidates.length; j++) {
      if (i === j) continue;
      const ci = (i + startIdx) % candidates.length;
      const vci = (j + startIdx) % candidates.length;
      if (ci === vci) continue;
      attempts.push([ci, vci]);
    }
  }

  for (const [ci, vci] of attempts) {
    const cId = candidates[ci].playerId;
    const vcId = candidates[vci].playerId;
    const pairKey = `${cId}|${vcId}`;
    if (!usedPairs.has(pairKey)) {
      usedPairs.add(pairKey);
      return { captain: cId, viceCaptain: vcId };
    }
  }

  // Fallback: just pick first two
  return {
    captain: candidates[0].playerId,
    viceCaptain: candidates[1].playerId,
  };
}

/* ---------- Main sweep generator ---------- */

export interface GenerateOptions {
  count: number; // 1-500
  team1Name: string;
  team2Name: string;
  onProgress?: (current: number, total: number) => void;
  signal?: AbortSignal;
}

export interface GenerateResult {
  teams: TeamRow[];
  duplicatesPrevented: number;
  attempts: number;
  elapsedMs: number;
}

const TEAM_COUNT_OPTIONS = [10, 20, 40, 50, 100, 200, 300, 400, 500] as const;
export { TEAM_COUNT_OPTIONS };

/**
 * Generate N unique valid fantasy teams with smart C/VC rotation.
 *
 * Algorithm:
 *   1. Rank players by sel% and tier (safe/balanced/differential)
 *   2. Rotate strategies: safe → balanced → differential → gl, repeating
 *   3. For each team, attempt to build with a unique seed; if duplicate, retry
 *   4. Pick unique C/VC pair per team
 *   5. Stop after `maxAttempts` to avoid infinite loop
 *
 * Performance: runs in chunks via setTimeout to avoid blocking the UI thread.
 */
export async function generateTeams(
  allPlayers: MatchPlayer[],
  options: GenerateOptions
): Promise<GenerateResult> {
  const startTime = Date.now();
  const pool = rankPlayers(allPlayers);
  const { count, team1Name, team2Name, onProgress, signal } = options;

  if (pool.length < TEAM_SIZE) {
    return { teams: [], duplicatesPrevented: 0, attempts: 0, elapsedMs: 0 };
  }

  const strategies: Strategy[] = ["safe", "balanced", "differential", "gl"];
  const usedTeamKeys = new Set<string>();
  const usedCVPairs = new Set<string>();
  const teams: TeamRow[] = [];
  let attempts = 0;
  let duplicatesPrevented = 0;
  const maxAttempts = count * 50; // generous retry budget

  // Build teams in chunks to yield to the UI thread
  const CHUNK_SIZE = 20;
  let teamIndex = 0;

  while (teams.length < count && attempts < maxAttempts) {
    const chunkEnd = Math.min(teamIndex + CHUNK_SIZE, count);

    for (; teamIndex < chunkEnd && attempts < maxAttempts; ) {
      const strategy = strategies[teamIndex % strategies.length];
      // Try a few seeds before giving up on this slot
      let built = false;
      for (let retry = 0; retry < 20 && !built; retry++) {
        attempts++;
        const seed = teamIndex * 1000 + retry + Date.now() % 100000;
        const candidate = buildTeam(pool, team1Name, team2Name, strategy, seed);
        if (!candidate) continue;

        const key = teamKey(candidate);
        if (usedTeamKeys.has(key)) {
          duplicatesPrevented++;
          continue;
        }

        // Pick C/VC
        const rng = mulberry32(seed + 7777);
        const cv = pickCandVC(candidate, teamIndex, usedCVPairs, rng);
        if (!cv) continue;

        usedTeamKeys.add(key);
        const team: TeamRow = {
          _id: "gen_" + teamIndex + "_" + Date.now().toString(36),
          teamId: "gen_" + teamIndex + "_" + Date.now().toString(36),
          teamNo: teamIndex + 1,
          team_number: teamIndex + 1,
          players: candidate.map((p) => ({
            pid: p.playerId,
            name: p.name,
            shortName: p.shortName || p.name,
            team: p.teamName,
            role: p.role,
            credits: p.creditsNum,
            selected_by: p.selNum,
            image: p.image,
            player_fixed_id: p.playerId,
          })),
          captain: cv.captain,
          viceCaptain: cv.viceCaptain,
          vicecaptain: cv.viceCaptain,
          c: cv.captain,
          vc: cv.viceCaptain,
          type: "generated",
        };
        teams.push(team);
        teamIndex++;
        built = true;
      }

      if (!built) {
        // Couldn't build this slot — skip to next strategy
        teamIndex++;
      }
    }

    // Yield to UI thread + report progress
    if (onProgress) onProgress(teams.length, count);
    if (signal?.aborted) break;
    await new Promise((r) => setTimeout(r, 0));
  }

  return {
    teams,
    duplicatesPrevented,
    attempts,
    elapsedMs: Date.now() - startTime,
  };
}

/* ---------- Diversity stats ---------- */

export interface DiversityStats {
  uniqueTeams: number;
  uniqueCVPairs: number;
  playerExposure: Record<string, number>; // playerId → team count
  topCaptains: Array<{ name: string; count: number }>;
  topViceCaptains: Array<{ name: string; count: number }>;
  strategyBreakdown: Record<string, number>;
}

export function computeDiversityStats(teams: TeamRow[]): DiversityStats {
  const playerExposure: Record<string, number> = {};
  const captainCounts: Record<string, number> = {};
  const vcCounts: Record<string, number> = {};
  const cvPairs = new Set<string>();

  for (const t of teams) {
    const cId = String(t.captain ?? t.c ?? "");
    const vcId = String(t.viceCaptain ?? t.vc ?? "");
    if (cId && vcId) cvPairs.add(`${cId}|${vcId}`);
    if (cId) captainCounts[cId] = (captainCounts[cId] || 0) + 1;
    if (vcId) vcCounts[vcId] = (vcCounts[vcId] || 0) + 1;

    for (const p of t.players || []) {
      const id = String(p.player_fixed_id ?? p.pid ?? p.name);
      playerExposure[id] = (playerExposure[id] || 0) + 1;
    }
  }

  // Build captain list with names
  const nameMap: Record<string, string> = {};
  for (const t of teams) {
    for (const p of t.players || []) {
      const id = String(p.player_fixed_id ?? p.pid ?? p.name);
      nameMap[id] = p.name || p.shortName || id;
    }
  }

  const topCaptains = Object.entries(captainCounts)
    .map(([id, count]) => ({ name: nameMap[id] || id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topViceCaptains = Object.entries(vcCounts)
    .map(([id, count]) => ({ name: nameMap[id] || id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    uniqueTeams: teams.length,
    uniqueCVPairs: cvPairs.size,
    playerExposure,
    topCaptains,
    topViceCaptains,
    strategyBreakdown: {},
  };
}
