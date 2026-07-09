/**
 * Match Scheduler — Auto-check for new matches
 * ============================================
 * Auto-check every 30 min, auto-add matches starting within 24h.
 * Config: enabled/disabled, sport, platform.
 */

import { db } from "./firebase";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";

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

const CONFIG_DOC = "match_scheduler_config";
const MATCHES_COLLECTION = "scheduled_matches";
const LOCAL_CONFIG_KEY = "apna-cricket-match-scheduler-config";

function isBrowser(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

/**
 * Get the scheduler config (from Firebase or local fallback).
 */
export async function getSchedulerConfig(): Promise<SchedulerConfig> {
  const defaults: SchedulerConfig = {
    enabled: false,
    sport: "cricket",
    platform: "dream11",
    checkIntervalMin: 30,
    autoAddWindowHours: 24,
  };

  // Try local first
  if (isBrowser()) {
    try {
      const local = localStorage.getItem(LOCAL_CONFIG_KEY);
      if (local) {
        return { ...defaults, ...JSON.parse(local) };
      }
    } catch {
      /* ignore */
    }
  }

  if (db) {
    try {
      const snap = await getDoc(doc(db, "scheduler_config", CONFIG_DOC));
      if (snap.exists()) {
        return { ...defaults, ...(snap.data() as Partial<SchedulerConfig>) };
      }
    } catch {
      /* ignore */
    }
  }

  return defaults;
}

/**
 * Enable or disable auto-add.
 */
export async function enableAutoAdd(enabled: boolean, config?: Partial<SchedulerConfig>): Promise<SchedulerConfig> {
  const current = await getSchedulerConfig();
  const next: SchedulerConfig = { ...current, ...config, enabled };
  if (isBrowser()) {
    localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(next));
  }
  if (db) {
    try {
      await setDoc(doc(db, "scheduler_config", CONFIG_DOC), {
        ...next,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.log("[Scheduler] config save failed:", err);
    }
  }
  return next;
}

/**
 * Schedule a match for auto-add tracking.
 */
export async function scheduleMatch(match: Omit<ScheduledMatch, "addedAt" | "autoAdded"> & { autoAdded?: boolean }): Promise<void> {
  if (!db || !match.matchId) return;
  try {
    await setDoc(doc(db, MATCHES_COLLECTION, match.matchId), {
      ...match,
      autoAdded: match.autoAdded ?? true,
      addedAt: Date.now(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.log("[Scheduler] scheduleMatch failed:", err);
  }
}

/**
 * Get all scheduled matches.
 */
export async function getScheduledMatches(): Promise<ScheduledMatch[]> {
  if (!db) return [];
  try {
    const snap = await getDocs(collection(db, MATCHES_COLLECTION));
    const out: ScheduledMatch[] = [];
    snap.forEach((d) => out.push({ matchId: d.id, ...(d.data() as Omit<ScheduledMatch, "matchId">) }));
    return out.sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
  } catch {
    return [];
  }
}

/**
 * Auto-add matches starting within the configured window.
 * Called by the scheduler poller.
 *
 * @param fetchedMatches list of matches fetched from API
 * @returns number of matches added
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

  for (const m of fetchedMatches) {
    const start = Number(m.matchDate || m.start_time || 0);
    if (!start) {
      skipped++;
      continue;
    }
    const delta = start - now;
    if (delta > 0 && delta <= windowMs) {
      // Check if already scheduled
      if (db) {
        try {
          const existing = await getDoc(doc(db, MATCHES_COLLECTION, m.id));
          if (existing.exists()) {
            skipped++;
            continue;
          }
        } catch {
          /* ignore */
        }
      }
      await scheduleMatch({
        matchId: m.id,
        matchName: m.name,
        sport: config.sport,
        platform: config.platform,
        startTime: start,
      });
      added++;
    } else {
      skipped++;
    }
  }

  // Update lastCheckedAt
  if (db) {
    try {
      await setDoc(doc(db, "scheduler_config", CONFIG_DOC), {
        lastCheckedAt: now,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch {
      /* ignore */
    }
  }

  return { added, skipped };
}

/**
 * Start a poller that checks for new matches every X minutes.
 * Returns a cleanup function.
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

  // Initial tick after 5s
  setTimeout(tick, 5000);

  // Poll every configured interval
  const interval = setInterval(tick, 30 * 60 * 1000);

  return () => clearInterval(interval);
}
