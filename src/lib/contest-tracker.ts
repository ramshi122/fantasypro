/**
 * Contest Profit/Loss Tracker
 * ===========================
 * Tracks per-contest financials for the user: entry fee, prize won, result, date.
 * Aggregates into total invested, total won, profit %, win rate.
 *
 * localStorage key: "apna-cricket-contest-tracker"
 *
 * Public API:
 *   - addContestResult(input): ContestRecord
 *   - updateContestResult(id, patch): void
 *   - deleteContestResult(id): void
 *   - getContestRecords(): ContestRecord[]
 *   - getContestStats(): ContestStats
 *   - getProfitLoss(): ProfitLoss
 *   - clearContestTracker(): void
 *
 * NOTE: This is ADDITIVE and separate from the existing `contest-history.ts`
 * module. It focuses on P&L / ROI metrics for an at-a-glance dashboard widget.
 */

export type ContestResult = "won" | "lost" | "draw" | "pending";

export interface ContestRecord {
  id: string;
  contestId: string;
  matchId?: string;
  matchName?: string;
  platform?: string;
  entryFee: number;
  teamsJoined: number;
  prizeWon: number;
  result: ContestResult;
  date: number; // epoch ms
  notes?: string;
}

export interface ContestStats {
  totalContests: number;
  totalInvested: number;
  totalWon: number;
  netProfit: number;
  profitPercent: number; // ROI %
  wins: number;
  losses: number;
  draws: number;
  pending: number;
  winRate: number; // wins / (completed) * 100
  bestContest?: ContestRecord;
  worstContest?: ContestRecord;
}

export interface ProfitLoss {
  invested: number;
  won: number;
  net: number;
  roiPercent: number;
  isProfit: boolean;
  breakdown: {
    byPlatform: Record<string, { invested: number; won: number; net: number; contests: number }>;
    byResult: Record<ContestResult, { count: number; net: number }>;
  };
}

const KEY = "apna-cricket-contest-tracker";

function isBrowser(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function readAll(): ContestRecord[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeAll(list: ContestRecord[]): void {
  if (!isBrowser()) return;
  localStorage.setItem(KEY, JSON.stringify(list.slice(-1000)));
}

function genId(): string {
  return `ct_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function num(v: unknown, def = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

/* ---------- Public API ---------- */

/**
 * Add a new contest result record.
 */
export function addContestResult(input: Omit<ContestRecord, "id" | "date"> & { date?: number }): ContestRecord {
  const record: ContestRecord = {
    ...input,
    id: genId(),
    date: input.date ?? Date.now(),
    entryFee: num(input.entryFee),
    teamsJoined: num(input.teamsJoined, 1),
    prizeWon: num(input.prizeWon),
    result: input.result || "pending",
  };
  const all = readAll();
  all.push(record);
  writeAll(all);
  return record;
}

/**
 * Update an existing contest record.
 */
export function updateContestResult(id: string, patch: Partial<ContestRecord>): void {
  const all = readAll();
  const idx = all.findIndex((c) => c.id === id);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...patch, id: all[idx].id };
    writeAll(all);
  }
}

/**
 * Delete a contest record.
 */
export function deleteContestResult(id: string): void {
  const all = readAll().filter((c) => c.id !== id);
  writeAll(all);
}

/**
 * Get all contest records (most recent first).
 */
export function getContestRecords(): ContestRecord[] {
  return readAll().slice().sort((a, b) => b.date - a.date);
}

/**
 * Get aggregated stats.
 */
export function getContestStats(): ContestStats {
  const all = readAll();
  const totalInvested = all.reduce((acc, c) => acc + c.entryFee * c.teamsJoined, 0);
  const totalWon = all.reduce((acc, c) => acc + c.prizeWon, 0);
  const wins = all.filter((c) => c.result === "won").length;
  const losses = all.filter((c) => c.result === "lost").length;
  const draws = all.filter((c) => c.result === "draw").length;
  const pending = all.filter((c) => c.result === "pending").length;
  const completed = wins + losses + draws;
  const netProfit = totalWon - totalInvested;
  const profitPercent = totalInvested > 0 ? (netProfit / totalInvested) * 100 : 0;

  let bestContest: ContestRecord | undefined;
  let worstContest: ContestRecord | undefined;
  for (const c of all) {
    const net = c.prizeWon - c.entryFee * c.teamsJoined;
    if (!bestContest || net > (bestContest.prizeWon - bestContest.entryFee * bestContest.teamsJoined)) {
      bestContest = c;
    }
    if (!worstContest || net < (worstContest.prizeWon - worstContest.entryFee * worstContest.teamsJoined)) {
      worstContest = c;
    }
  }

  return {
    totalContests: all.length,
    totalInvested,
    totalWon,
    netProfit,
    profitPercent,
    wins,
    losses,
    draws,
    pending,
    winRate: completed > 0 ? (wins / completed) * 100 : 0,
    bestContest,
    worstContest,
  };
}

/**
 * Get profit/loss breakdown — by platform and by result.
 */
export function getProfitLoss(): ProfitLoss {
  const all = readAll();
  const invested = all.reduce((acc, c) => acc + c.entryFee * c.teamsJoined, 0);
  const won = all.reduce((acc, c) => acc + c.prizeWon, 0);
  const net = won - invested;
  const roiPercent = invested > 0 ? (net / invested) * 100 : 0;

  const byPlatform: ProfitLoss["breakdown"]["byPlatform"] = {};
  const byResult: ProfitLoss["breakdown"]["byResult"] = {
    won: { count: 0, net: 0 },
    lost: { count: 0, net: 0 },
    draw: { count: 0, net: 0 },
    pending: { count: 0, net: 0 },
  };

  for (const c of all) {
    const platform = c.platform || "unknown";
    const cNet = c.prizeWon - c.entryFee * c.teamsJoined;
    if (!byPlatform[platform]) {
      byPlatform[platform] = { invested: 0, won: 0, net: 0, contests: 0 };
    }
    byPlatform[platform].invested += c.entryFee * c.teamsJoined;
    byPlatform[platform].won += c.prizeWon;
    byPlatform[platform].net += cNet;
    byPlatform[platform].contests += 1;

    byResult[c.result].count += 1;
    byResult[c.result].net += cNet;
  }

  return {
    invested,
    won,
    net,
    roiPercent,
    isProfit: net >= 0,
    breakdown: { byPlatform, byResult },
  };
}

/**
 * Clear all tracked contests.
 */
export function clearContestTracker(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(KEY);
}
