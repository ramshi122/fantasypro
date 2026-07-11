/**
 * Analytics — Local Event Tracking
 * ===============================
 * Stores analytics events in localStorage as array of {type, timestamp, data}.
 * Used by the admin Analytics tab + revenue analytics + team-gen insights.
 *
 * Key: "apna-cricket-analytics"
 */

export interface AnalyticsEvent {
  type: string;
  timestamp: number;
  data: Record<string, unknown>;
}

const KEY = "apna-cricket-analytics";
const MAX_EVENTS = 5000;

function isBrowser(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

/**
 * Track an analytics event. Safe to call from server components (no-op).
 */
export function trackEvent(
  type: string,
  data: Record<string, unknown> = {}
): void {
  if (!isBrowser()) return;
  try {
    const events = readEvents();
    events.push({ type, timestamp: Date.now(), data });
    // Trim to MAX_EVENTS
    if (events.length > MAX_EVENTS) {
      events.splice(0, events.length - MAX_EVENTS);
    }
    localStorage.setItem(KEY, JSON.stringify(events));
  } catch (err) {
    console.warn("[analytics] trackEvent failed:", err);
  }
}

/**
 * Read all stored analytics events.
 */
export function readEvents(): AnalyticsEvent[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Clear all analytics events.
 */
export function clearAnalytics(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(KEY);
}

/**
 * Get aggregated analytics summary for the admin dashboard.
 */
export function getAnalytics(): {
  totalEvents: number;
  eventsByType: Record<string, number>;
  recent: AnalyticsEvent[];
  daily: Record<string, number>; // yyyy-mm-dd → count
  todayCount: number;
  weekCount: number;
} {
  const events = readEvents();
  const now = Date.now();
  const day = 86400000;
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const weekStart = now - 7 * day;

  const eventsByType: Record<string, number> = {};
  const daily: Record<string, number> = {};

  for (const e of events) {
    eventsByType[e.type] = (eventsByType[e.type] || 0) + 1;
    const d = new Date(e.timestamp);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    daily[key] = (daily[key] || 0) + 1;
  }

  return {
    totalEvents: events.length,
    eventsByType,
    recent: events.slice(-50).reverse(),
    daily,
    todayCount: events.filter((e) => e.timestamp >= todayStart).length,
    weekCount: events.filter((e) => e.timestamp >= weekStart).length,
  };
}

/**
 * Get the last 7 days as a label→count array for bar chart rendering.
 */
export function getDailyTeamGenerationTrend(): Array<{ label: string; count: number }> {
  const events = readEvents();
  const out: Array<{ label: string; count: number }> = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const dayStart = d.getTime();
    const dayEnd = dayStart + 86400000;
    const count = events.filter(
      (e) => e.type === "team_generation" && e.timestamp >= dayStart && e.timestamp < dayEnd
    ).length;
    const label = d.toLocaleDateString("en-US", { weekday: "short" });
    out.push({ label, count });
  }
  return out;
}

/**
 * Get most popular matches by team generation count.
 */
export function getPopularMatches(limit = 10): Array<{ matchId: string; count: number; lastGenerated: number }> {
  const events = readEvents();
  const map = new Map<string, { matchId: string; count: number; lastGenerated: number }>();
  for (const e of events) {
    if (e.type !== "team_generation") continue;
    const matchId = String(e.data?.matchId || e.data?.match_id || "unknown");
    const existing = map.get(matchId);
    if (existing) {
      existing.count += Number(e.data?.teamCount || 1);
      if (e.timestamp > existing.lastGenerated) existing.lastGenerated = e.timestamp;
    } else {
      map.set(matchId, {
        matchId,
        count: Number(e.data?.teamCount || 1),
        lastGenerated: e.timestamp,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, limit);
}
