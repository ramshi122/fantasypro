/**
 * Contest History — Track all joined contests
 * ===========================================
 * localStorage "apna-cricket-contest-history"
 * Schema: {matchId, contestId, platform, teamsJoined, result, prizeWon, joinedAt, completedAt}
 */

export type ContestPlatform = "dream11" | "my11circle" | "myteam11" | "vision11";
export type ContestResult = "won" | "lost" | "draw" | "pending";

export interface ContestEntry {
  id: string;
  matchId: string;
  matchName?: string;
  contestId: string;
  platform: ContestPlatform;
  teamsJoined: number;
  entryFee?: number;
  result: ContestResult;
  prizeWon: number;
  joinedAt: number;
  completedAt?: number;
}

const KEY = "apna-cricket-contest-history";

function isBrowser(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function readAll(): ContestEntry[] {
  if (!isBrowser()) return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

function writeAll(list: ContestEntry[]): void {
  if (!isBrowser()) return;
  localStorage.setItem(KEY, JSON.stringify(list.slice(-500)));
}

function genId(): string {
  return `ct_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Add a contest entry (when user joins a contest).
 */
export function addContestEntry(data: Omit<ContestEntry, "id" | "joinedAt">): ContestEntry {
  const entry: ContestEntry = {
    ...data,
    id: genId(),
    joinedAt: Date.now(),
  };
  const all = readAll();
  all.push(entry);
  writeAll(all);
  return entry;
}

/**
 * Update contest result (when match completes).
 */
export function updateContestResult(
  id: string,
  result: ContestResult,
  prizeWon: number
): void {
  const all = readAll();
  const idx = all.findIndex((c) => c.id === id);
  if (idx >= 0) {
    all[idx].result = result;
    all[idx].prizeWon = prizeWon;
    all[idx].completedAt = Date.now();
    writeAll(all);
  }
}

/**
 * Get all contest entries (optionally filtered by matchId).
 */
export function getContestHistory(matchId?: string): ContestEntry[] {
  const all = readAll();
  if (!matchId) return all.slice().reverse();
  return all.filter((c) => c.matchId === matchId).reverse();
}

/**
 * Get aggregated contest stats.
 */
export function getContestStats(): {
  total: number;
  wins: number;
  losses: number;
  pending: number;
  totalPrize: number;
  totalEntryFee: number;
} {
  const all = readAll();
  return {
    total: all.length,
    wins: all.filter((c) => c.result === "won").length,
    losses: all.filter((c) => c.result === "lost").length,
    pending: all.filter((c) => c.result === "pending").length,
    totalPrize: all.reduce((acc, c) => acc + Number(c.prizeWon || 0), 0),
    totalEntryFee: all.reduce((acc, c) => acc + Number(c.entryFee || 0), 0),
  };
}

/**
 * Clear all contest history.
 */
export function clearContestHistory(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(KEY);
}

/* ======================================================================
 * Win/Loss Tracker (Task G7.25)
 * ==================================================================== */

export interface WinLossStats {
  totalContests: number;
  wins: number;
  losses: number;
  draws: number;
  pending: number;
  winRate: number;          // percentage 0-100
  totalPrize: number;
  totalSpent: number;
  netProfit: number;
  roiPercent: number;       // return on investment
  bestPlatform: ContestPlatform | null;
  platformBreakdown: Array<{
    platform: ContestPlatform;
    contests: number;
    wins: number;
    prize: number;
    winRate: number;
  }>;
}

/**
 * Compute win/loss stats + best platform (dream11 vs my11circle etc.)
 */
export function getWinLossStats(): WinLossStats {
  const all = readAll();
  const wins = all.filter((c) => c.result === "won").length;
  const losses = all.filter((c) => c.result === "lost").length;
  const draws = all.filter((c) => c.result === "draw").length;
  const pending = all.filter((c) => c.result === "pending").length;
  const completed = wins + losses + draws;
  const totalPrize = all.reduce((acc, c) => acc + Number(c.prizeWon || 0), 0);
  const totalSpent = all.reduce((acc, c) => acc + Number(c.entryFee || 0), 0);
  const netProfit = totalPrize - totalSpent;
  const roiPercent = totalSpent > 0 ? (netProfit / totalSpent) * 100 : 0;

  // Platform breakdown
  const platforms: ContestPlatform[] = ["dream11", "my11circle", "myteam11", "vision11"];
  const platformBreakdown = platforms
    .map((platform) => {
      const list = all.filter((c) => c.platform === platform);
      const pWins = list.filter((c) => c.result === "won").length;
      const pPrize = list.reduce((acc, c) => acc + Number(c.prizeWon || 0), 0);
      return {
        platform,
        contests: list.length,
        wins: pWins,
        prize: pPrize,
        winRate: list.length > 0 ? (pWins / list.length) * 100 : 0,
      };
    })
    .filter((p) => p.contests > 0);

  // Best platform: highest win rate (with at least 1 contest)
  let bestPlatform: ContestPlatform | null = null;
  let bestWinRate = -1;
  for (const p of platformBreakdown) {
    if (p.winRate > bestWinRate) {
      bestWinRate = p.winRate;
      bestPlatform = p.platform;
    }
  }

  return {
    totalContests: all.length,
    wins,
    losses,
    draws,
    pending,
    winRate: completed > 0 ? (wins / completed) * 100 : 0,
    totalPrize,
    totalSpent,
    netProfit,
    roiPercent,
    bestPlatform,
    platformBreakdown,
  };
}
