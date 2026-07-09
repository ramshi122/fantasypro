/**
 * Notifications — Match Start, Lineup Announced, License Expiry
 * =================================================================
 * Uses the Browser Notification API.
 * Tracks sent notifications in localStorage "apna-cricket-notifications".
 *
 * Functions:
 *   - sendNotification(title, body)
 *   - checkMatchAlerts() — alert 30 min before match start
 *   - checkLineupAlerts() — alert when lineup_status goes 0 → 1
 *   - checkLicenseExpiry() — alert 3 days, 1 day, day-of expiry
 */

import { getLicenseState } from "./admin-store";

export interface SentNotification {
  id: string;
  type: "match_start" | "lineup_announced" | "license_expiry" | "broadcast";
  title: string;
  body: string;
  timestamp: number;
  refId?: string;
}

const KEY = "apna-cricket-notifications";

function isBrowser(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

function readSent(): SentNotification[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

function writeSent(list: SentNotification[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(list.slice(-200)));
}

function alreadySent(type: string, refId: string): boolean {
  return readSent().some((n) => n.type === type && n.refId === refId);
}

function recordSent(n: SentNotification): void {
  const list = readSent();
  list.push(n);
  writeSent(list);
}

/**
 * Request notification permission (call on user gesture).
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isBrowser()) return "denied";
  try {
    if (Notification.permission === "default") {
      return await Notification.requestPermission();
    }
    return Notification.permission;
  } catch {
    return "denied";
  }
}

/**
 * Send a browser notification (and record it locally).
 */
export function sendNotification(title: string, body: string, type?: SentNotification["type"], refId?: string): void {
  if (!isBrowser()) return;
  if (Notification.permission !== "granted") return;

  try {
    new Notification(title, {
      body,
      icon: "/logo.png",
      badge: "/logo-square.png",
      tag: refId || `${type}-${Date.now()}`,
    });
  } catch (err) {
    console.warn("[Notifications] send failed:", err);
  }

  recordSent({
    id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type: type || "broadcast",
    title,
    body,
    timestamp: Date.now(),
    refId,
  });
}

/**
 * Check matches for upcoming starts; alert 30 min before.
 *
 * @param matches array of match objects with matchDate / start_time + id
 */
export function checkMatchAlerts(matches: Array<{ id: string; matchDate?: number; start_time?: number; name?: string }>): void {
  if (!isBrowser() || Notification.permission !== "granted") return;
  const now = Date.now();
  const thirtyMin = 30 * 60 * 1000;

  for (const m of matches) {
    const start = Number(m.matchDate || m.start_time || 0);
    if (!start) continue;
    const delta = start - now;
    if (delta > 0 && delta <= thirtyMin) {
      if (alreadySent("match_start", m.id)) continue;
      const mins = Math.ceil(delta / 60000);
      sendNotification(
        "🏏 Match Starting Soon!",
        `${m.name || m.id} starts in ${mins} min. Generate your teams now!`,
        "match_start",
        m.id
      );
    }
  }
}

/**
 * Check lineup_status changes — alert when 0 → 1.
 *
 * @param matches array with id + lineup_status (0/1)
 */
export function checkLineupAlerts(matches: Array<{ id: string; lineup_status?: number; name?: string }>): void {
  if (!isBrowser() || Notification.permission !== "granted") return;

  for (const m of matches) {
    if (m.lineup_status === 1) {
      if (alreadySent("lineup_announced", m.id)) continue;
      sendNotification(
        "✅ Lineup Announced!",
        `${m.name || m.id} — playing XI is out. Update your teams now.`,
        "lineup_announced",
        m.id
      );
    }
  }
}

/**
 * Check license expiry — alert at 3 days, 1 day, and day-of.
 */
export function checkLicenseExpiry(): void {
  if (!isBrowser() || Notification.permission !== "granted") return;
  const license = getLicenseState();
  if (!license.verified || !license.key || !license.keyType) return;

  // Read expiry from localStorage (admin-store sets it)
  try {
    const adminState = JSON.parse(localStorage.getItem("apna-cricket-admin") || "{}");
    const keyObj = (adminState?.state?.keys || []).find((k: any) => k.key === license.key);
    if (!keyObj || !keyObj.expiresAt) return; // lifetime = no expiry
    const expiresAt = Number(keyObj.expiresAt);
    const now = Date.now();
    const day = 86400000;
    const daysLeft = Math.ceil((expiresAt - now) / day);

    if (daysLeft <= 0) {
      if (alreadySent("license_expiry", `${license.key}_day0`)) return;
      sendNotification(
        "⚠️ License Expired",
        `Your ${license.keyType} plan has expired. Renew to continue using Apna Cricket.`,
        "license_expiry",
        `${license.key}_day0`
      );
    } else if (daysLeft === 1) {
      if (alreadySent("license_expiry", `${license.key}_day1`)) return;
      sendNotification(
        "⏰ License Expiring Tomorrow",
        `Your ${license.keyType} plan expires tomorrow. Renew now!`,
        "license_expiry",
        `${license.key}_day1`
      );
    } else if (daysLeft === 3) {
      if (alreadySent("license_expiry", `${license.key}_day3`)) return;
      sendNotification(
        "📅 License Expiring in 3 Days",
        `Your ${license.keyType} plan expires in 3 days. Plan your renewal.`,
        "license_expiry",
        `${license.key}_day3`
      );
    }
  } catch {
    /* ignore */
  }
}

/**
 * Get all sent notifications (for debug / history view).
 */
export function getSentNotifications(): SentNotification[] {
  return readSent().slice().reverse();
}

/**
 * Start background polling for match/lineup/expiry alerts.
 * Call once on app load. Returns a cleanup function.
 */
export function startNotificationPollers(
  getMatches: () => Array<{ id: string; matchDate?: number; start_time?: number; lineup_status?: number; name?: string }>
): () => void {
  if (!isBrowser()) return () => {};

  // Initial request
  requestNotificationPermission();

  const matchInterval = setInterval(() => {
    const matches = getMatches();
    checkMatchAlerts(matches);
    checkLineupAlerts(matches);
  }, 5 * 60 * 1000); // every 5 min

  const lineupInterval = setInterval(() => {
    const matches = getMatches();
    checkLineupAlerts(matches);
  }, 2 * 60 * 1000); // every 2 min

  const expiryInterval = setInterval(() => {
    checkLicenseExpiry();
  }, 60 * 60 * 1000); // every hour

  // Initial check
  setTimeout(() => {
    const matches = getMatches();
    checkMatchAlerts(matches);
    checkLineupAlerts(matches);
    checkLicenseExpiry();
  }, 3000);

  return () => {
    clearInterval(matchInterval);
    clearInterval(lineupInterval);
    clearInterval(expiryInterval);
  };
}
