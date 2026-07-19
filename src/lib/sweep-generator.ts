/**
 * Strategic Team Sweep Generator — DETERMINISTIC, NO RANDOM
 * ============================================================
 *
 * Builds teams using proper data analysis, not Math.random().
 *
 * Strategy for GL Rank 1:
 *   1. Sort players by EFV (Expected Fantasy Value) — sel% × credits × role weight
 *   2. Top BAT first (top-order batters score most points)
 *   3. Top BOWL next (death-overs bowlers get wickets)
 *   4. AR as dual-scorers (batting + bowling points)
 *   5. WK as captaincy candidate (batting + keeping bonus)
 *   6. C/VC rotation through top 6 EFV players (deterministic pairs)
 *   7. GL teams mix safe (high-sel%) + differential (low-sel%) picks
 *
 * Team types:
 *   - safe:          Top 11 by EFV (H2H/Small League)
 *   - balanced:      7 safe + 4 mid (Mid League)
 *   - differential:  5 safe + 6 low-sel% (Grand League Rank 1 target)
 */

import type { MatchPlayer, TeamRow } from "./api";
import { roleFromPlayerType } from "./format";

export type SweepCount = 1 | 5 | 10 | 20 | 40 | 50 | 75 | 100 | 150 | 200 | 300 | 400 | 500;
export const SWEEP_OPTIONS: SweepCount[] = [1, 5, 10, 20, 40, 50, 75, 100, 150, 200, 300, 400, 500];

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

/* ============== Player EFV Calculation ============== */

interface RankedPlayer {
  player: MatchPlayer;
  role: "WK" | "BAT" | "AR" | "BOWL";
  selNum: number;
  creditsNum: number;
  efv: number; // Expected Fantasy Value
  tier: "safe" | "balanced" | "differential";
  playerId: string;
  teamName: string;
}

/**
 * Calculate Expected Fantasy Value for a player.
 *
 * EFV = base_value × form_factor × role_weight × differential_bonus
 *
 * - base_value: from sel% (crowd wisdom — higher sel% = better expected performance)
 * - form_factor: from credits (9.0+ = peak form, 8.0+ = good form)
 * - role_weight: AR gets bonus (dual scoring), WK gets bonus (keeping + batting)
 * - differential_bonus: low-sel% players get GL upside bonus
 */
function calculateEFV(p: MatchPlayer, role: string): number {
  const sel = Number(p.selected_by ?? p.sel ?? 0);
  const cred = Number(p.credits ?? 8);

  // Base value from sel% (log scale: 0% → 0, 100% → 1)
  const baseValue = Math.log(1 + sel) / Math.log(101);

  // Form factor from credits (8.0-10.0 = good form)
  const formFactor = Math.max(0.3, Math.min(1.5, (cred - 7) / 3));

  // Role weights — AR and WK score from multiple sources
  const roleWeights: Record<string, number> = {
    AR: 1.25,   // all-rounders score from batting + bowling
    WK: 1.15,   // WK gets batting + keeping bonus
    BAT: 1.10,  // top-order batters score most runs
    BOWL: 1.05, // bowlers get wickets + economy bonus
  };
  const roleWeight = roleWeights[role] ?? 1.0;

  // Differential bonus: low-sel% players get GL upside
  const diffBonus = sel < 15 ? 1.15 : sel < 30 ? 1.08 : 1.0;

  return baseValue * formFactor * roleWeight * diffBonus * 100;
}

/**
 * Rank and sort players by EFV within each role.
 * Top EFV first (best players first).
 */
function rankPlayers(players: MatchPlayer[]): RankedPlayer[] {
  return players
    .filter((p) => p && p.name && Number(p.credits) > 0)
    .map((p) => {
      const role = roleFromPlayerType(p.player_type, p.role as number) as "WK" | "BAT" | "AR" | "BOWL";
      const sel = Number(p.selected_by ?? p.sel ?? 0);
      const cred = Number(p.credits ?? 8);
      const efv = calculateEFV(p, role);
      const tier: "safe" | "balanced" | "differential" =
        sel >= 50 ? "safe" : sel >= 20 ? "balanced" : "differential";
      return {
        player: p,
        role,
        selNum: sel,
        creditsNum: cred,
        efv,
        tier,
        playerId: String(p.player_fixed_id ?? p.pl_id ?? p.pid ?? p.name),
        teamName: String(p.team_name ?? p.team ?? "Unknown"),
      } as RankedPlayer;
    })
    .sort((a, b) => b.efv - a.efv); // Sort by EFV descending (best first)
}

/* ============== Validation ============== */

function isValidRoleBalance(players: MatchPlayer[]): boolean {
  if (players.length !== 11) return false;
  const counts = { WK: 0, BAT: 0, AR: 0, BOWL: 0 };
  for (const p of players) {
    const r = roleFromPlayerType(p.player_type, p.role as number) as keyof typeof counts;
    if (!(r in counts)) return false;
    counts[r]++;
  }
  // Lenient: WK 1-8, BAT 2-8, AR 1-8, BOWL 2-8
  if (counts.WK < 1 || counts.WK > 8) return false;
  if (counts.BAT < 2 || counts.BAT > 8) return false;
  if (counts.AR < 1 || counts.AR > 8) return false;
  if (counts.BOWL < 2 || counts.BOWL > 8) return false;
  return true;
}

function isValidSideBalance(players: MatchPlayer[], team1Name: string, team2Name: string): boolean {
  const t1 = players.filter((p) => p.team_name === team1Name).length;
  const t2 = players.filter((p) => p.team_name === team2Name).length;
  // If team names don't match, skip
  if (t1 === 0 && t2 === 0) return true;
  if (t1 === 0 || t2 === 0) return Math.max(t1, t2) <= 8;
  // Strict 4-7, then lenient 3-8
  if (t1 <= 7 && t2 <= 7 && t1 >= 4 && t2 >= 4) return true;
  if (t1 <= 8 && t2 <= 8 && t1 >= 3 && t2 >= 3) return true;
  return false;
}

function isValidCredits(players: MatchPlayer[], max = 105): boolean {
  const total = players.reduce((s, p) => s + (Number(p.credits) || 0), 0);
  return total <= max;
}

function teamFingerprint(players: MatchPlayer[]): string {
  return players
    .map((p) => String(p.player_fixed_id ?? p.pl_id ?? p.pid ?? p.name))
    .sort()
    .join("|");
}

/* ============== Strategic Team Builder (DETERMINISTIC) ============== */

type TeamType = "safe" | "balanced" | "differential";

// ============================================================
// PERFORMANCE: Pre-computed lookup structures (built ONCE per generateSweep call)
// These replace expensive repeated filter/map/find operations inside loops.
// ============================================================
interface CachedLookups {
  byRole: { WK: RankedPlayer[]; BAT: RankedPlayer[]; AR: RankedPlayer[]; BOWL: RankedPlayer[] };
  efvMap: Map<string, number>;          // playerId → EFV (for C/VC sort)
  roleMap: Map<string, "WK" | "BAT" | "AR" | "BOWL">; // playerId → role
  teamMap: Map<string, string>;          // playerId → teamName
  // Pre-shuffled pools per role per rotation seed (memoized)
  shuffleCache: Map<string, RankedPlayer[]>;
}

/**
 * Build all lookup structures ONCE — reused across all team generations.
 * This replaces O(N) filter/map calls inside loops with O(1) Map lookups.
 */
function buildLookups(ranked: RankedPlayer[]): CachedLookups {
  const byRole = {
    WK: ranked.filter((r) => r.role === "WK"),
    BAT: ranked.filter((r) => r.role === "BAT"),
    AR: ranked.filter((r) => r.role === "AR"),
    BOWL: ranked.filter((r) => r.role === "BOWL"),
  };
  const efvMap = new Map<string, number>();
  const roleMap = new Map<string, "WK" | "BAT" | "AR" | "BOWL">();
  const teamMap = new Map<string, string>();
  for (const r of ranked) {
    efvMap.set(r.playerId, r.efv);
    roleMap.set(r.playerId, r.role);
    teamMap.set(r.playerId, r.teamName);
  }
  return { byRole, efvMap, roleMap, teamMap, shuffleCache: new Map() };
}

/**
 * Deterministic shuffle — memoized per (role, seed) combination.
 * Previously: shuffled pool on every buildStrategicTeam call.
 * Now: shuffles are cached, reuse same shuffled pool for same seed.
 */
function memoizedShuffle(pool: RankedPlayer[], seed: number, cache: Map<string, RankedPlayer[]>, cacheKey: string): RankedPlayer[] {
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  const shuffled = [...pool];
  // SAFETY: apply modulo BEFORE multiplication to prevent number overflow.
  // seed * 2654435761 can exceed Number.MAX_SAFE_INTEGER if seed > ~3.4M.
  let s = ((seed % 2147483647) * 2654435761) % 2147483647;
  for (let j = shuffled.length - 1; j > 0; j--) {
    s = (s * 1103515245 + 12345) % 2147483647;
    const k = s % (j + 1);
    [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
  }
  cache.set(cacheKey, shuffled);
  return shuffled;
}

/**
 * Build a team using STRATEGIC selection — NO Math.random.
 *
 * Strategy:
 *   1. Determine role composition based on available players
 *   2. For each role, pick players by tier mix:
 *      - safe:          all top EFV
 *      - balanced:      60% top + 40% mid
 *      - differential:  40% top + 60% low-sel (GL rank 1 target)
 *   3. Use rotation offset to vary picks across teams
 */
function buildStrategicTeam(
  byRole: { WK: RankedPlayer[]; BAT: RankedPlayer[]; AR: RankedPlayer[]; BOWL: RankedPlayer[] },
  type: TeamType,
  team1Name: string,
  team2Name: string,
  rotationOffset: number,
  lookups?: CachedLookups,
  customCfg?: { WK: number; BAT: number; AR: number; BOWL: number }
): MatchPlayer[] | null {
  const availWK = byRole.WK.length;
  const availBAT = byRole.BAT.length;
  const availAR = byRole.AR.length;
  const availBOWL = byRole.BOWL.length;

  if (availWK < 1 || availBAT < 1 || availAR < 1 || availBOWL < 1) return null;

  // Determine role counts
  let wk: number, bat: number, ar: number, bowl: number;
  if (customCfg) {
    // CUSTOM COMBINATION: use user-specified role counts
    wk = customCfg.WK;
    ar = customCfg.AR;
    bat = customCfg.BAT;
    bowl = customCfg.BOWL;
  } else {
    // AUTO: Strategic for GL Rank 1
    wk = 1;
    ar = Math.min(availAR, Math.max(1, (rotationOffset % 3) + 1));
    const remaining = 11 - wk - ar;
    bat = Math.min(availBAT, Math.max(2, Math.floor(remaining / 2) + ((rotationOffset % 2) - 1)));
    bowl = remaining - bat;
  }

  // Clamp to available
  if (bat > availBAT) { bowl += bat - availBAT; bat = availBAT; }
  if (bowl > availBOWL) { bat += bowl - availBOWL; bowl = availBOWL; }
  if (bat < 1) { bat = 1; bowl = remaining - 1; }
  if (bowl < 1) { bowl = 1; bat = remaining - 1; }

  // Fallback: WK=2 if needed
  if (wk + bat + ar + bowl !== 11 && availWK >= 2) {
    wk = 2;
    ar = Math.min(availAR, Math.max(1, (rotationOffset % 3) + 1));
    remaining = 11 - wk - ar;
    bat = Math.min(availBAT, Math.max(2, Math.floor(remaining / 2)));
    bowl = remaining - bat;
    if (bat > availBAT) { bowl += bat - availBAT; bat = availBAT; }
    if (bowl > availBOWL) { bat += bowl - availBOWL; bowl = availBOWL; }
  }

  const cfg = { WK: wk, BAT: bat, AR: ar, BOWL: bowl };

  // Verify
  if (cfg.WK > availWK || cfg.BAT > availBAT || cfg.AR > availAR || cfg.BOWL > availBOWL) {
    return null;
  }

  // Pick players per role using STRATEGIC tier mix
  const picked: MatchPlayer[] = [];

  for (const role of ["WK", "BAT", "AR", "BOWL"] as const) {
    const need = cfg[role];
    const pool = byRole[role];
    if (pool.length < need) return null;

    let chosen: RankedPlayer[] = [];

    // FIX: Deterministic shuffle based on rotationOffset for maximum diversity
    // PERFORMANCE: Use memoized shuffle — same seed → same shuffled pool
    // Previously: shuffled pool on EVERY buildStrategicTeam call (expensive)
    // Now: shuffles are cached per (role, rotationOffset) combination
    const shuffleKey = `${role}_${rotationOffset}`;
    const shuffled = lookups
      ? memoizedShuffle(pool, rotationOffset, lookups.shuffleCache, shuffleKey)
      : (() => {
          // Fallback (no cache) — inline shuffle
          const s = [...pool];
          let seed = ((rotationOffset % 2147483647) * 2654435761) % 2147483647;
          for (let j = s.length - 1; j > 0; j--) {
            seed = (seed * 1103515245 + 12345) % 2147483647;
            const k = seed % (j + 1);
            [s[j], s[k]] = [s[k], s[j]];
          }
          return s;
        })();

    if (type === "safe") {
      // Safe: pick from shuffled pool — NO EFV sort (that cancels the shuffle!)
      // Just take first N from shuffled (already randomized)
      chosen = shuffled.slice(0, need);
    } else if (type === "balanced") {
      // Balanced: 50% from shuffled top + 50% from shuffled mid
      const topCount = Math.ceil(need * 0.5);
      const midCount = need - topCount;
      // Top half of shuffled (varied per team)
      const top = shuffled.slice(0, topCount);
      // Mid from rest of shuffled
      const mid = shuffled.slice(topCount, topCount + midCount);
      chosen = [...top, ...mid];
    } else {
      // differential: 30% from shuffled top + 70% from shuffled low-sel
      const topCount = Math.ceil(need * 0.3);
      const diffCount = need - topCount;
      // Top from shuffled
      const top = shuffled.slice(0, topCount);
      // Low-sel from shuffled (sorted by sel% ascending for differential picks)
      const lowSelPool = shuffled.slice(topCount).sort((a, b) => a.selNum - b.selNum);
      const diff = lowSelPool.slice(0, diffCount);
      chosen = [...top, ...diff];
    }

    // Deduplicate within role
    const seen = new Set<string>();
    const finalChosen: RankedPlayer[] = [];
    for (const c of chosen) {
      if (!seen.has(c.playerId)) {
        seen.add(c.playerId);
        finalChosen.push(c);
      }
    }
    // Fill any gaps from remaining pool
    if (finalChosen.length < need) {
      const remainingPool = pool.filter((p) => !seen.has(p.playerId));
      for (const r of remainingPool) {
        if (finalChosen.length >= need) break;
        finalChosen.push(r);
        seen.add(r.playerId);
      }
    }

    if (finalChosen.length < need) return null;
    picked.push(...finalChosen.map((r) => r.player));
  }

  if (picked.length !== 11) return null;

  // Validate
  if (!isValidRoleBalance(picked)) return null;
  if (!isValidCredits(picked)) return null;

  // Side balance — only fix if team names match
  const hasTeamMatch = picked.some((p) => p.team_name === team1Name || p.team_name === team2Name);
  if (hasTeamMatch && !isValidSideBalance(picked, team1Name, team2Name)) {
    // Try to fix by swapping dominant team player with other team
    const t1Count = picked.filter((p) => p.team_name === team1Name).length;
    const dominantTeam = t1Count > 7 ? team1Name : team2Name;
    const otherTeam = dominantTeam === team1Name ? team2Name : team1Name;
    for (let i = 0; i < picked.length; i++) {
      if (picked[i].team_name !== dominantTeam) continue;
      const role = roleFromPlayerType(picked[i].player_type, picked[i].role as number);
      const replacement = byRole[role as "WK" | "BAT" | "AR" | "BOWL"].find(
        (r) => r.teamName === otherTeam && !picked.find((x) =>
          String(x.player_fixed_id ?? x.pid) === r.playerId
        )
      );
      if (replacement) {
        picked[i] = replacement.player;
        break;
      }
    }
    if (!isValidSideBalance(picked, team1Name, team2Name)) return null;
  }

  return picked;
}

/* ============== C/VC Rotation (DETERMINISTIC) ============== */

/**
 * Pick Captain and Vice-Captain — DETERMINISTIC, no random.
 *
 * Strategy:
 *   - Sort team by EFV descending
 *   - C = top EFV player (rotated by team index)
 *   - VC = 2nd or 3rd top EFV (rotated by team index)
 *   - Ensures unique C/VC pairs across team set
 */
function pickCaptainVCDeterministic(
  players: MatchPlayer[],
  allRanked: RankedPlayer[],
  teamIndex: number,
  usedCVPairs: Set<string>,
  cachedEfvMap?: Map<string, number>
): { captain: string; viceCaptain: string } | null {
  // PERFORMANCE: Use cached efvMap if available (built ONCE per generateSweep)
  // Previously: rebuilt Map from allRanked on EVERY C/VC pick = O(N) per team
  // Now: O(1) lookup using pre-built map
  const efvMap = cachedEfvMap ?? new Map(allRanked.map((r) => [r.playerId, r.efv]));
  const sorted = [...players].sort((a, b) => {
    const efvA = efvMap.get(String(a.player_fixed_id ?? a.pid ?? a.name)) ?? 0;
    const efvB = efvMap.get(String(b.player_fixed_id ?? b.pid ?? b.name)) ?? 0;
    return efvB - efvA;
  });

  // Top 8 candidates for C/VC (was 6 — more variety for diverse C/VC)
  const candidates = sorted.slice(0, Math.min(8, sorted.length));
  if (candidates.length < 2) return null;

  // DIVERSIFIED C/VC rotation — tries ALL possible pairs starting from rotated position.
  // startOffset = teamIndex * 3 ensures different starting point per team.
  // This produces different C/VC picks across teams AND across runs.
  const startOffset = teamIndex * 3;
  for (let attempt = 0; attempt < candidates.length * candidates.length; attempt++) {
    const cIdx = (startOffset + attempt) % candidates.length;
    const vcIdx = (startOffset + attempt + 1 + Math.floor(attempt / candidates.length)) % candidates.length;
    if (cIdx === vcIdx) continue;

    const c = candidates[cIdx];
    const vc = candidates[vcIdx];
    const cId = String(c.player_fixed_id ?? c.pid ?? c.name);
    const vcId = String(vc.player_fixed_id ?? vc.pid ?? vc.name);
    const pairKey = `${cId}|${vcId}`;

    if (!usedCVPairs.has(pairKey)) {
      usedCVPairs.add(pairKey);
      return { captain: cId, viceCaptain: vcId };
    }
  }

  // Fallback: pick a RANDOM pair from candidates (not always first two)
  // This ensures even fallback C/VC is different each time
  const randomC = Math.floor(Math.random() * candidates.length);
  let randomVC = Math.floor(Math.random() * candidates.length);
  if (randomVC === randomC) randomVC = (randomVC + 1) % candidates.length;
  const c = candidates[randomC];
  const vc = candidates[randomVC];
  return {
    captain: String(c.player_fixed_id ?? c.pid ?? c.name),
    viceCaptain: String(vc.player_fixed_id ?? vc.pid ?? vc.name),
  };
}

/* ============== Main Generator ============== */

export function cleanPlayerPool(players: MatchPlayer[]): MatchPlayer[] {
  return players.filter((p) => {
    if (!p.name) return false;
    if (!p.credits || Number(p.credits) <= 0) return false;
    return true;
  });
}

export async function generateSweep(
  players: MatchPlayer[],
  count: SweepCount,
  team1Name: string,
  team2Name: string,
  onProgress?: (p: SweepProgress) => void,
  mode?: "smart" | "gl" | "advanced" | "combination",
  customCombos?: Array<{ wk: number; bat: number; ar: number; bowl: number }>
): Promise<SweepResult> {
  const startedAt = Date.now();
  // PERFORMANCE: Track each phase timing for diagnostics
  const perfLog = {
    cleanPoolMs: 0,
    rankPlayersMs: 0,
    buildLookupsMs: 0,
    generationMs: 0,
    similarityCheckMs: 0,
    cvPickMs: 0,
    teamsRequested: count,
    teamsGenerated: 0,
    attempts: 0,
    duplicates: 0,
  };

  onProgress?.({
    generated: 0,
    total: count,
    phase: "validating",
    message: "Analyzing player pool — calculating EFV scores...",
  });

  // 1. Clean and rank players by EFV
  const cleanStart = Date.now();
  const cleaned = cleanPlayerPool(players);
  perfLog.cleanPoolMs = Date.now() - cleanStart;

  if (cleaned.length < 11) {
    return {
      teams: [],
      stats: {
        requested: count, generated: 0, duplicates: 0, attempts: 0,
        coverage: { uniqueCaptains: 0, uniqueViceCaptains: 0, avgPlayerExposure: 0, maxPlayerExposure: 0 },
        roleDistribution: { WK: 0, BAT: 0, AR: 0, BOWL: 0 },
        durationMs: Date.now() - startedAt,
      },
    };
  }

  const rankStart = Date.now();
  const ranked = rankPlayers(cleaned);
  perfLog.rankPlayersMs = Date.now() - rankStart;

  // PERFORMANCE: Build all lookup structures ONCE — reused across all teams
  // Previously: filter() called per team for role grouping, EFV map rebuilt per C/VC pick
  // Now: O(1) lookups via Maps
  const lookupStart = Date.now();
  const lookups = buildLookups(ranked);
  const byRole = lookups.byRole;
  perfLog.buildLookupsMs = Date.now() - lookupStart;

  console.log("[generator] Player pool:", {
    total: ranked.length,
    WK: byRole.WK.length,
    BAT: byRole.BAT.length,
    AR: byRole.AR.length,
    BOWL: byRole.BOWL.length,
    topEFV: ranked.slice(0, 5).map((r) => `${r.player.name} (${r.efv.toFixed(1)})`),
  });
  console.log(`[perf] cleanPool: ${perfLog.cleanPoolMs}ms, rankPlayers: ${perfLog.rankPlayersMs}ms, buildLookups: ${perfLog.buildLookupsMs}ms`);

  onProgress?.({
    generated: 0,
    total: count,
    phase: "selecting",
    message: `Generating ${count} strategic teams — GL Rank 1 target...`,
  });

  const teams: TeamRow[] = [];
  const usedFingerprints = new Set<string>();
  const usedCVPairs = new Set<string>();
  // PERFORMANCE: Cache existing team player ID sets for O(1) similarity check
  // Previously: rebuilt Set for every existing team on every new team = O(N²)
  // Now: built once per team, stored in array
  const existingTeamIdSets: Set<string>[] = [];
  let attempts = 0;
  let duplicates = 0;
  const maxAttempts = count * 50;

  // Strategy rotation — MODE-SPECIFIC for diversity
  // FIX: Different modes produce different team distributions
  const strategyFor = (i: number): TeamType => {
    if (mode === "gl") {
      // Grand League: 20% safe, 30% balanced, 50% differential (GL rank 1 focus)
      const mod = i % 10;
      if (mod < 2) return "safe";          // 20% safe
      if (mod < 5) return "balanced";      // 30% balanced
      return "differential";                // 50% differential
    } else if (mode === "advanced") {
      // Advanced: 30% safe, 50% balanced, 20% differential (form-focused)
      const mod = i % 10;
      if (mod < 3) return "safe";          // 30% safe
      if (mod < 8) return "balanced";      // 50% balanced
      return "differential";                // 20% differential
    } else if (mode === "combination") {
      // Combination: rotate through all strategies evenly for max diversity
      const mod = i % 3;
      if (mod === 0) return "safe";
      if (mod === 1) return "balanced";
      return "differential";
    } else {
      // Smart (default): 40% safe, 40% balanced, 20% differential
      const mod = i % 10;
      if (mod < 4) return "safe";          // 40% safe (H2H/SL)
      if (mod < 8) return "balanced";      // 40% balanced (mid league)
      return "differential";                // 20% differential (GL rank 1)
    }
  };

  // CRITICAL: Session seed — makes EVERY generateSweep call produce DIFFERENT teams.
  const sessionSeed = Math.floor(Math.random() * 99999) + 1;
  console.log(`[generator] Session seed: ${sessionSeed} (ensures unique teams this run)${customCombos ? ` + ${customCombos.length} custom combos` : ""}`);

  // CUSTOM COMBINATIONS: If provided, distribute teams across all combos
  // Example: 40 teams + 3 combos → ~13-14 teams per combo
  const useCustomCombos = customCombos && customCombos.length > 0;

  // Generate teams in chunks
  const CHUNK = Math.max(5, Math.floor(count / 20));
  for (let i = 0; i < count; i++) {
    let team: MatchPlayer[] | null = null;
    let tries = 0;
    const strategy = strategyFor(i);

    while (tries < 50 && !team) {
      tries++;
      attempts++;
      if (attempts > maxAttempts) break;

      // Rotation offset = sessionSeed + i * 3 + tries (UNIQUE per run)
      const rotationOffset = sessionSeed + i * 3 + tries;
      // If custom combos provided, distribute teams across them
      const customCfg = useCustomCombos ? {
        WK: customCombos![i % customCombos!.length].wk,
        BAT: customCombos![i % customCombos!.length].bat,
        AR: customCombos![i % customCombos!.length].ar,
        BOWL: customCombos![i % customCombos!.length].bowl,
      } : undefined;
      const candidate = buildStrategicTeam(byRole, strategy, team1Name, team2Name, rotationOffset, lookups, customCfg);
      if (!candidate) continue;
      if (!isValidRoleBalance(candidate)) continue;
      if (!isValidCredits(candidate)) continue;

      const fp = teamFingerprint(candidate);
      if (usedFingerprints.has(fp)) {
        duplicates++;
        continue;
      }
      team = candidate;
    }

    if (!team) continue;
    // PERFORMANCE: reuse fingerprint instead of recomputing
    let teamFp = teamFingerprint(team);
    usedFingerprints.add(teamFp);

    // PERFORMANCE: Build current team's ID set ONCE
    const currentTeamIds = new Set(team.map((p) => String(p.player_fixed_id ?? p.pid ?? p.name)));

    // SIMILARITY CHECK — O(N) where N = number of existing teams (was O(N × M))
    // PERFORMANCE: use cached existingTeamIdSets instead of rebuilding Set per team
    const simStart = Date.now();
    let tooSimilar = false;
    for (let eIdx = 0; eIdx < existingTeamIdSets.length; eIdx++) {
      const existingIds = existingTeamIdSets[eIdx];
      let common = 0;
      // Iterate smaller set for performance + early exit
      // STRICTER: max 7 common players (was 9) — per DUPLICATE PREVENTION spec
      for (const id of currentTeamIds) {
        if (existingIds.has(id)) {
          common++;
          if (common >= 8) break; // early exit at 8 (will be flagged at 8+)
        }
      }
      // Teams with 8+ common players are too similar → swap 3 players for diversity
      if (common >= 8) {
        tooSimilar = true;
        break;
      }
    }
    perfLog.similarityCheckMs += Date.now() - simStart;

    if (tooSimilar) {
      // Swap 3 players from different roles for MORE diversity (was 2)
      // PERFORMANCE: use lookups.roleMap for O(1) role lookup
      let swapsMade = 0;
      const teamPlayerIds = new Set(team.map((p) => String(p.player_fixed_id ?? p.pid ?? p.name)));
      for (const role of ["BAT", "BOWL", "AR", "WK"] as const) {
        if (swapsMade >= 3) break;
        const swapIdx = team.findIndex((p) => {
          const pid = String(p.player_fixed_id ?? p.pid ?? p.name);
          return lookups.roleMap.get(pid) === role;
        });
        if (swapIdx >= 0) {
          const rolePool = byRole[role];
          // PERFORMANCE: use pre-built teamPlayerIds set + existingTeamIdSets (no nested .some)
          let alt: RankedPlayer | null = null;
          for (const rp of rolePool) {
            const rpId = rp.playerId;
            if (teamPlayerIds.has(rpId)) continue;
            // Check if player is in any existing team
            let inExisting = false;
            for (const exSet of existingTeamIdSets) {
              if (exSet.has(rpId)) { inExisting = true; break; }
            }
            if (!inExisting) { alt = rp; break; }
          }
          if (alt) {
            team[swapIdx] = alt.player;
            teamPlayerIds.add(alt.playerId);
            swapsMade++;
          }
        }
      }
      // Re-check fingerprint after swaps
      teamFp = teamFingerprint(team);
      if (usedFingerprints.has(teamFp)) {
        duplicates++;
        continue;
      }
      usedFingerprints.add(teamFp);
      // Update currentTeamIds after swaps
      currentTeamIds.clear();
      for (const p of team) currentTeamIds.add(String(p.player_fixed_id ?? p.pid ?? p.name));
    }

    // Pick C/VC (deterministic) — PERFORMANCE: pass cached efvMap
    onProgress?.({
      generated: i,
      total: count,
      phase: "rotating",
      message: `Rotating C/VC for team ${i + 1}/${count} — ${strategy}...`,
    });

    const cvStart = Date.now();
    const cv = pickCaptainVCDeterministic(team, ranked, i, usedCVPairs, lookups.efvMap);
    perfLog.cvPickMs += Date.now() - cvStart;
    if (!cv) continue;

    const teamRow: TeamRow = {
      _id: `sweep_${i}_${Date.now().toString(36)}`,
      teamId: `sweep_${i}`,
      teamNo: i + 1,
      team_number: i + 1,
      players: team.map((p) => ({
        pid: p.player_fixed_id ?? p.pid,
        player_fixed_id: p.player_fixed_id,
        pl_id: p.pl_id,
        name: p.name,
        shortName: p.shortName || p.name?.slice(0, 4).toUpperCase() || "",
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
      type: `sweep-${strategy}`,
    };
    teams.push(teamRow);
    // PERFORMANCE: cache this team's ID set for future similarity checks
    existingTeamIdSets.push(new Set(currentTeamIds));

    if (i > 0 && i % CHUNK === 0) {
      onProgress?.({
        generated: i + 1,
        total: count,
        phase: "selecting",
        message: `Generated ${i + 1}/${count} strategic teams...`,
      });
      // Yield to UI thread to prevent freeze
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // PERFORMANCE: Log generation phase timing
  perfLog.generationMs = Date.now() - startedAt - perfLog.cleanPoolMs - perfLog.rankPlayersMs - perfLog.buildLookupsMs;
  perfLog.teamsGenerated = teams.length;
  perfLog.duplicates = duplicates;
  perfLog.attempts = attempts;
  console.log(`[perf] Generation breakdown for ${count} teams:`);
  console.log(`  Total: ${Date.now() - startedAt}ms`);
  console.log(`  Clean pool: ${perfLog.cleanPoolMs}ms`);
  console.log(`  Rank players: ${perfLog.rankPlayersMs}ms`);
  console.log(`  Build lookups: ${perfLog.buildLookupsMs}ms`);
  console.log(`  Generation loop: ${perfLog.generationMs}ms`);
  console.log(`    ├─ Similarity checks: ${perfLog.similarityCheckMs.toFixed(0)}ms`);
  console.log(`    └─ C/VC picks: ${perfLog.cvPickMs.toFixed(0)}ms`);
  console.log(`  Teams: ${teams.length}/${count} (attempts: ${attempts}, duplicates: ${duplicates})`);

  onProgress?.({
    generated: teams.length,
    total: count,
    phase: "deduplicating",
    message: "Validating uniqueness...",
  });

  // Final dedupe
  const finalTeams: TeamRow[] = [];
  const finalFingerprints = new Set<string>();
  for (const t of teams) {
    const fp = teamFingerprint((t.players || []) as unknown as MatchPlayer[]);
    if (finalFingerprints.has(fp)) continue;
    finalFingerprints.add(fp);
    finalTeams.push(t);
  }

  // Compute stats
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

  const roleDist = { WK: 0, BAT: 0, AR: 0, BOWL: 0 };
  for (const t of finalTeams) {
    for (const p of t.players || []) {
      const r = (p.role as string) as keyof typeof roleDist;
      if (roleDist[r] !== undefined) roleDist[r]++;
    }
  }

  onProgress?.({
    generated: finalTeams.length,
    total: count,
    phase: "done",
    message: `Generated ${finalTeams.length} strategic teams`,
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
