/**
 * Anti-Cheat System
 * =================
 * Detects:
 *   - Rapid key attempts (5+ failed verifications within 10 minutes)
 *   - Multiple devices using the same key
 *   - API abuse (too many calls in short window)
 *
 * Auto-ban after 3 suspicious activities.
 * Banned devices are stored in Firebase "banned_devices".
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
import { getDeviceId } from "./admin-store";

const COLLECTION = "banned_devices";
const LOCAL_KEY = "apna-cricket-suspicious-activities";

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
  // Keep last 50
  localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(-50)));
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
  // Only count last 24h
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recent = all.filter((a) => a.timestamp >= dayAgo);
  recent.push(entry);
  writeLocalActivities(recent);

  // Auto-ban threshold
  if (recent.length >= 3) {
    const reason = `Auto-ban: ${recent.length} suspicious activities in 24h (last: ${activity.type})`;
    await banDevice(deviceId, reason, recent);
    return { banned: true, reason };
  }

  return { banned: false };
}

/**
 * Check if a device is banned.
 */
export async function isBanned(deviceId?: string): Promise<boolean> {
  const id = deviceId || (isBrowser() ? getDeviceId() : "server");
  if (!db) {
    // Local fallback
    if (isBrowser()) {
      try {
        const local = JSON.parse(localStorage.getItem("apna-cricket-banned-local") || "[]");
        return local.includes(id);
      } catch {
        return false;
      }
    }
    return false;
  }
  try {
    const snap = await getDoc(doc(db, COLLECTION, id));
    return snap.exists();
  } catch {
    return false;
  }
}

/**
 * Synchronous local-only ban check (fast path).
 */
export function isBannedLocal(deviceId?: string): boolean {
  if (!isBrowser()) return false;
  const id = deviceId || getDeviceId();
  try {
    const local = JSON.parse(localStorage.getItem("apna-cricket-banned-local") || "[]");
    return local.includes(id);
  } catch {
    return false;
  }
}

/**
 * Ban a device. Stores in Firebase "banned_devices" + local list.
 */
export async function banDevice(
  deviceId: string,
  reason: string,
  activities: SuspiciousActivity[] = []
): Promise<void> {
  if (!deviceId) return;
  const record: BannedDevice = {
    deviceId,
    reason,
    bannedAt: Date.now(),
    expiresAt: null,
    activities,
  };

  if (db) {
    try {
      await setDoc(doc(db, COLLECTION, deviceId), {
        ...record,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.log("[AntiCheat] ban sync failed:", err);
    }
  }

  // Local mirror
  if (isBrowser()) {
    try {
      const local = JSON.parse(localStorage.getItem("apna-cricket-banned-local") || "[]");
      if (!local.includes(deviceId)) {
        local.push(deviceId);
        localStorage.setItem("apna-cricket-banned-local", JSON.stringify(local));
      }
    } catch {
      /* ignore */
    }
  }
}

/**
 * Unban a device (admin action).
 */
export async function unbanDevice(deviceId: string): Promise<void> {
  if (!db) return;
  try {
    const { deleteDoc } = await import("firebase/firestore");
    await deleteDoc(doc(db, COLLECTION, deviceId));
  } catch (err) {
    console.log("[AntiCheat] unban failed:", err);
  }

  if (isBrowser()) {
    try {
      const local = JSON.parse(localStorage.getItem("apna-cricket-banned-local") || "[]");
      const next = local.filter((id: string) => id !== deviceId);
      localStorage.setItem("apna-cricket-banned-local", JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
}

/**
 * List all banned devices (admin).
 */
export async function listBannedDevices(): Promise<BannedDevice[]> {
  if (!db) return [];
  try {
    const snap = await getDocs(collection(db, COLLECTION));
    const out: BannedDevice[] = [];
    snap.forEach((d) => out.push({ deviceId: d.id, ...(d.data() as Omit<BannedDevice, "deviceId">) }));
    return out;
  } catch {
    return [];
  }
}

/**
 * Get suspicious activity count for current device.
 */
export function getSuspiciousCount(): number {
  return readLocalActivities().filter(
    (a) => a.timestamp >= Date.now() - 24 * 60 * 60 * 1000
  ).length;
}
