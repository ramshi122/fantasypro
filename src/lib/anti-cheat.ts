/**
 * Anti-Cheat System — LOCAL ONLY (per FIREBASE-CLEANUP)
 * ======================================================
 * Detects:
 *   - Rapid key attempts (3+ failed verifications within 24h)
 *   - Multiple devices using the same key
 *   - API abuse (too many calls in short window)
 *
 * Auto-ban after 3 suspicious activities.
 * Banned devices are stored ONLY in localStorage (no Firebase).
 */

import { getDeviceId } from "./admin-store";

const LOCAL_KEY = "apna-cricket-suspicious-activities";
const BANNED_LOCAL_KEY = "apna-cricket-banned-local";

export type SuspiciousActivityType =
  | "rapid_key_attempts"
  | "multiple_devices_key"
  | "api_abuse"
  | "invalid_license_pattern"
  | "automated_requests";

export interface SuspiciousActivity {
  type: SuspiciousActivityType;
  deviceId: string;
  timestamp: number;
  details?: string;
}

export interface BannedDevice {
  deviceId: string;
  reason: string;
  bannedAt: number;
  expiresAt?: number | null;
  activities: SuspiciousActivity[];
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function readLocalActivities(): SuspiciousActivity[] {
  if (!isBrowser()) return [];
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeLocalActivities(list: SuspiciousActivity[]): void {
  if (!isBrowser()) return;
  localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(-50)));
}

function readLocalBanned(): string[] {
  if (!isBrowser()) return [];
  try {
    return JSON.parse(localStorage.getItem(BANNED_LOCAL_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeLocalBanned(list: string[]): void {
  if (!isBrowser()) return;
  localStorage.setItem(BANNED_LOCAL_KEY, JSON.stringify(list));
}

/**
 * Record a suspicious activity. Auto-bans after 3 within 24h.
 */
export async function detectSuspicious(
  activity: Omit<SuspiciousActivity, "timestamp" | "deviceId">
): Promise<{ banned: boolean; reason?: string }> {
  const deviceId = isBrowser() ? getDeviceId() : "server";
  const entry: SuspiciousActivity = {
    ...activity,
    deviceId,
    timestamp: Date.now(),
  };

  const all = readLocalActivities();
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recent = all.filter((a) => a.timestamp >= dayAgo);
  recent.push(entry);
  writeLocalActivities(recent);

  if (recent.length >= 3) {
    const reason = `Auto-ban: ${recent.length} suspicious activities in 24h (last: ${activity.type})`;
    await banDevice(deviceId, reason, recent);
    return { banned: true, reason };
  }

  return { banned: false };
}

/**
 * Check if a device is banned (local only).
 */
export async function isBanned(deviceId?: string): Promise<boolean> {
  const id = deviceId || (isBrowser() ? getDeviceId() : "server");
  return isBannedLocal(id);
}

/**
 * Synchronous local-only ban check (fast path).
 */
export function isBannedLocal(deviceId?: string): boolean {
  if (!isBrowser()) return false;
  const id = deviceId || getDeviceId();
  return readLocalBanned().includes(id);
}

/**
 * Ban a device (local only).
 */
export async function banDevice(
  deviceId: string,
  reason: string,
  activities: SuspiciousActivity[] = []
): Promise<void> {
  if (!deviceId) return;
  if (isBrowser()) {
    const local = readLocalBanned();
    if (!local.includes(deviceId)) {
      local.push(deviceId);
      writeLocalBanned(local);
    }
  }
  // Record in admin store logs for visibility
  try {
    const { useAdmin } = await import("./admin-store");
    useAdmin.getState().addLog("error", `Device ${deviceId} banned: ${reason}`, { activities });
  } catch {
    /* ignore */
  }
}

/**
 * Unban a device (local only).
 */
export async function unbanDevice(deviceId: string): Promise<void> {
  if (isBrowser()) {
    const local = readLocalBanned();
    writeLocalBanned(local.filter((id: string) => id !== deviceId));
  }
}

/**
 * List all locally banned devices (admin).
 */
export async function listBannedDevices(): Promise<BannedDevice[]> {
  if (!isBrowser()) return [];
  const now = Date.now();
  return readLocalBanned().map((id) => ({
    deviceId: id,
    reason: "Banned locally (anti-cheat)",
    bannedAt: now,
    expiresAt: null,
    activities: readLocalActivities().filter((a) => a.deviceId === id),
  }));
}

/**
 * Get suspicious activity count for current device.
 */
export function getSuspiciousCount(): number {
  return readLocalActivities().filter(
    (a) => a.timestamp >= Date.now() - 24 * 60 * 60 * 1000
  ).length;
}
