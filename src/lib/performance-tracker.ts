/**
 * Performance Tracker — Per-Match Team Generation Stats
 * ======================================================
 * Local store of how many teams have been generated per match
 * and which fantasy platforms they were transferred to.
 *
 * localStorage "apna-cricket-match-perf"
 */

export type FantasyPlatform = "dream11" | "my11circle" | "myteam11" | "vision11";

export interface MatchPerformance {
  matchId: string;
  matchName?: string;
  teamCount: number;
  lastGenerated: number;
  platforms: FantasyPlatform[];
}

const KEY = "apna-cricket-match-perf";

function isBrowser(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function readAll(): Record<string, MatchPerformance> {
  if (!isBrowser()) return {};
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(data: Record<string, MatchPerformance>): void {
  if (!isBrowser()) return;
  localStorage.setItem(KEY, JSON.stringify(data));
}

/**
 * Track generation of teams for a match on a given platform.
 */
export function trackMatchTeam(
  matchId: string,
  platform: FantasyPlatform,
  matchName?: string,
  teamCount = 1
): void {
  if (!matchId) return;
  const all = readAll();
  const existing = all[matchId] || {
    matchId,
    matchName: matchName || matchId,
    teamCount: 0,
    lastGenerated: 0,
    platforms: [],
  };
  existing.teamCount += teamCount;
  existing.lastGenerated = Date.now();
  if (matchName) existing.matchName = matchName;
  if (!existing.platforms.includes(platform)) {
    existing.platforms.push(platform);
  }
  all[matchId] = existing;
  writeAll(all);
}

/**
 * Get performance stats for a single match.
 */
export function getMatchPerformance(matchId: string): MatchPerformance | null {
  return readAll()[matchId] || null;
}

/**
 * Get the top N matches by team generation count.
 */
export function getTopMatches(limit = 10): MatchPerformance[] {
  const all = readAll();
  return Object.values(all)
    .sort((a, b) => b.teamCount - a.teamCount)
    .slice(0, limit);
}

/**
 * Reset performance tracking for a single match.
 */
export function resetMatchPerformance(matchId: string): void {
  const all = readAll();
  delete all[matchId];
  writeAll(all);
}

/**
 * Reset all performance tracking.
 */
export function clearAllMatchPerformance(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(KEY);
}
