/**
 * Match Scheduler — LOCAL ONLY (per FIREBASE-CLEANUP)
 * =====================================================
 * Auto-check every 30 min, auto-add matches starting within 24h.
 * Config + scheduled matches stored in localStorage ONLY.
 */

export type Sport = "cricket" | "football" | "basketball" | "kabaddi";
export type Platform = "dream11" | "my11circle";

export interface ScheduledMatch {
  matchId: string;
  matchName?: string;
  sport: Sport;
  platform: Platform;
  startTime: number;
  addedAt: number;
  autoAdded: boolean;
}

export interface SchedulerConfig {
  enabled: boolean;
  sport: Sport;
  platform: Platform;
  checkIntervalMin: number;     // default 30
  autoAddWindowHours: number;   // default 24
  lastCheckedAt?: number;
}

const LOCAL_CONFIG_KEY = "apna-cricket-match-scheduler-config";
const LOCAL_MATCHES_KEY = "apna-cricket-scheduled-matches";

function isBrowser(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function readLocalMatches(): Record<string, ScheduledMatch> {
  if (!isBrowser()) return {};
  try {
    return JSON.parse(localStorage.getItem(LOCAL_MATCHES_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeLocalMatches(map: Record<string, ScheduledMatch>): void {
  if (!isBrowser()) return;
  localStorage.setItem(LOCAL_MATCHES_KEY, JSON.stringify(map));
}

/**
 * Get the scheduler config from localStorage.
 */
export async function getSchedulerConfig(): Promise<SchedulerConfig> {
  const defaults: SchedulerConfig = {
    enabled: false,
    sport: "cricket",
    platform: "dream11",
    checkIntervalMin: 30,
    autoAddWindowHours: 24,
  };
  if (isBrowser()) {
    try {
      const local = localStorage.getItem(LOCAL_CONFIG_KEY);
      if (local) return { ...defaults, ...JSON.parse(local) };
    } catch {
      /* ignore */
    }
  }
  return defaults;
}

/**
 * Enable or disable auto-add (local only).
 */
export async function enableAutoAdd(enabled: boolean, config?: Partial<SchedulerConfig>): Promise<SchedulerConfig> {
  const current = await getSchedulerConfig();
  const next: SchedulerConfig = { ...current, ...config, enabled };
  if (isBrowser()) {
    localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(next));
  }
  return next;
}

/**
 * Schedule a match for auto-add tracking (local).
 */
export async function scheduleMatch(match: Omit<ScheduledMatch, "addedAt" | "autoAdded"> & { autoAdded?: boolean }): Promise<void> {
  if (!isBrowser() || !match.matchId) return;
  const all = readLocalMatches();
  all[match.matchId] = {
    ...match,
    autoAdded: match.autoAdded ?? true,
    addedAt: Date.now(),
  };
  writeLocalMatches(all);
}

/**
 * Get all scheduled matches (local).
 */
export async function getScheduledMatches(): Promise<ScheduledMatch[]> {
  if (!isBrowser()) return [];
  return Object.values(readLocalMatches()).sort(
    (a, b) => (a.startTime || 0) - (b.startTime || 0)
  );
}

/**
 * Auto-add matches starting within the configured window (local).
 */
export async function scheduleAutoAdd(
  fetchedMatches: Array<{
    id: string;
    name?: string;
    matchDate?: number;
    start_time?: number;
  }>
): Promise<{ added: number; skipped: number }> {
  const config = await getSchedulerConfig();
  if (!config.enabled) return { added: 0, skipped: 0 };

  const now = Date.now();
  const windowMs = config.autoAddWindowHours * 60 * 60 * 1000;
  let added = 0;
  let skipped = 0;
  const all = readLocalMatches();

  for (const m of fetchedMatches) {
    const start = Number(m.matchDate || m.start_time || 0);
    if (!start) { skipped++; continue; }
    const delta = start - now;
    if (delta > 0 && delta <= windowMs) {
      if (all[m.id]) { skipped++; continue; }
      all[m.id] = {
        matchId: m.id,
        matchName: m.name,
        sport: config.sport,
        platform: config.platform,
        startTime: start,
        autoAdded: true,
        addedAt: now,
      };
      added++;
    } else {
      skipped++;
    }
  }
  writeLocalMatches(all);

  // Update lastCheckedAt
  if (isBrowser()) {
    const current = await getSchedulerConfig();
    const next = { ...current, lastCheckedAt: now };
    localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(next));
  }

  return { added, skipped };
}

/**
 * Start a poller that checks for new matches every X minutes.
 */
export function startSchedulerPoller(
  fetchMatches: () => Promise<Array<{ id: string; name?: string; matchDate?: number; start_time?: number }>>
): () => void {
  if (!isBrowser()) return () => {};

  async function tick() {
    const config = await getSchedulerConfig();
    if (!config.enabled) return;
    try {
      const matches = await fetchMatches();
      await scheduleAutoAdd(matches);
    } catch (err) {
      console.log("[Scheduler] tick failed:", err);
    }
  }

  setTimeout(tick, 5000);
  const interval = setInterval(tick, 30 * 60 * 1000);
  return () => clearInterval(interval);
}
