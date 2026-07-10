/**
 * PWA Notifications
 * =================
 * Lightweight PWA-style notifications wrapper around the Browser Notification API
 * with sugar for the three core Apna Cricket alerts:
 *   - lineup out
 *   - match starting
 *   - license expiry
 *
 * This is ADDITIVE — it does NOT replace the existing `notifications.ts` or
 * `push-notifications.ts` modules. It offers a simpler PWA-flavored API for
 * components that just want to fire a notification.
 *
 * Public API:
 *   - requestPermission(): Promise<NotificationPermission>
 *   - sendNotification(title, body, opts?): void
 *   - checkAndNotify(events): void
 *   - isSupported(): boolean
 *   - getPermission(): NotificationPermission | "unsupported"
 *
 * localStorage key: "apna-cricket-pwa-notifications" (sent history)
 */

export type PwaNotificationType =
  | "lineup_out"
  | "match_starting"
  | "license_expiry"
  | "info"
  | "broadcast";

export interface PwaNotificationEvent {
  type: PwaNotificationType;
  refId: string;
  title: string;
  body: string;
  /** Optional URL to open when clicked. */
  url?: string;
}

export interface SentPwaNotification {
  id: string;
  type: PwaNotificationType;
  refId?: string;
  title: string;
  body: string;
  url?: string;
  timestamp: number;
}

const KEY = "apna-cricket-pwa-notifications";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function isSupported(): boolean {
  return isBrowser() && "Notification" in window;
}

function getPermission(): NotificationPermission | "unsupported" {
  if (!isSupported()) return "unsupported";
  return Notification.permission;
}

function readSent(): SentPwaNotification[] {
  if (!isBrowser()) return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

function writeSent(list: SentPwaNotification[]): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-200)));
  } catch {
    /* ignore */
  }
}

function alreadySent(type: PwaNotificationType, refId: string): boolean {
  return readSent().some((n) => n.type === type && n.refId === refId);
}

function recordSent(n: SentPwaNotification): void {
  const list = readSent();
  list.push(n);
  writeSent(list);
}

/**
 * Request notification permission. Call on a user gesture (e.g. button click).
 */
export async function requestPermission(): Promise<NotificationPermission> {
  if (!isSupported()) return "denied";
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
 * Send a notification immediately. No-ops if not granted.
 *
 * Options:
 *   - type: PwaNotificationType (for dedup tracking)
 *   - refId: dedup key (e.g. matchId) — won't re-send for the same type+refId
 *   - url: optional URL to open on click
 *   - dedup: if true (default), skip when type+refId already sent
 */
export function sendNotification(
  title: string,
  body: string,
  opts: {
    type?: PwaNotificationType;
    refId?: string;
    url?: string;
    dedup?: boolean;
  } = {}
): void {
  if (!isSupported()) return;
  if (Notification.permission !== "granted") return;

  const type = opts.type || "info";
  const refId = opts.refId || `${type}_${Date.now()}`;

  if (opts.dedup !== false && alreadySent(type, refId)) {
    return;
  }

  try {
    const n = new Notification(title, {
      body,
      icon: "/logo.png",
      badge: "/logo-square.png",
      tag: refId,
      data: { url: opts.url } as any,
    });

    n.onclick = () => {
      try {
        if (opts.url) {
          window.focus();
          window.location.href = opts.url;
        }
      } catch {
        /* ignore */
      }
      n.close();
    };
  } catch (err) {
    console.warn("[PwaNotifications] send failed:", err);
  }

  recordSent({
    id: `pwa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    refId,
    title,
    body,
    url: opts.url,
    timestamp: Date.now(),
  });
}

/**
 * Check a list of events and notify for any that match.
 *
 * Used for periodic polling — pass in lineup/match/license events and this
 * will fire only the ones not yet sent.
 */
export function checkAndNotify(events: PwaNotificationEvent[]): {
  notified: number;
  skipped: number;
} {
  if (!isSupported() || Notification.permission !== "granted") {
    return { notified: 0, skipped: events.length };
  }

  let notified = 0;
  let skipped = 0;

  for (const e of events) {
    if (alreadySent(e.type, e.refId)) {
      skipped += 1;
      continue;
    }
    sendNotification(e.title, e.body, {
      type: e.type,
      refId: e.refId,
      url: e.url,
      dedup: true,
    });
    notified += 1;
  }

  return { notified, skipped };
}

/**
 * Get all sent notifications (most recent first).
 */
export function getSentNotifications(): SentPwaNotification[] {
  return readSent().slice().reverse();
}

/**
 * Clear all sent notification history.
 */
export function clearSentNotifications(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(KEY);
}

/* ---------- Convenience helpers for the 3 core alert types ---------- */

/**
 * Fire a "lineup out" notification (deduped per matchId).
 */
export function notifyLineupOut(matchId: string, matchName?: string): void {
  sendNotification(
    "✅ Lineup Out!",
    `${matchName || matchId} — playing XI is announced. Update your teams now.`,
    { type: "lineup_out", refId: matchId, url: `/?match=${matchId}` }
  );
}

/**
 * Fire a "match starting" notification (deduped per matchId).
 */
export function notifyMatchStarting(matchId: string, minutesAway: number, matchName?: string): void {
  sendNotification(
    "🏏 Match Starting Soon!",
    `${matchName || matchId} starts in ${minutesAway} min. Generate your teams now!`,
    { type: "match_starting", refId: matchId, url: `/?match=${matchId}` }
  );
}

/**
 * Fire a "license expiry" notification (deduped per daysLeft bucket).
 */
export function notifyLicenseExpiry(daysLeft: number, keyType?: string): void {
  const bucket = daysLeft <= 0 ? "day0" : daysLeft === 1 ? "day1" : daysLeft === 3 ? "day3" : "week";
  const title =
    daysLeft <= 0
      ? "⚠️ License Expired"
      : daysLeft === 1
      ? "⏰ License Expiring Tomorrow"
      : daysLeft === 3
      ? "📅 License Expiring in 3 Days"
      : "📅 License Expiry Reminder";
  const body =
    daysLeft <= 0
      ? `Your ${keyType || ""} plan has expired. Renew to continue using Apna Cricket.`
      : `Your ${keyType || ""} plan expires in ${daysLeft} day(s). Renew now!`;
  sendNotification(title, body, {
    type: "license_expiry",
    refId: `${keyType || "license"}_${bucket}`,
  });
}
