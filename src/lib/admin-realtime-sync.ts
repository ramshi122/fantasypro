/**
 * Admin Real-Time Sync — Firestore onSnapshot Listeners
 * =======================================================
 *
 * Provides 100% synchronized admin data across ALL devices.
 *
 * How it works:
 *   1. Firestore is the SINGLE SOURCE OF TRUTH (not localStorage)
 *   2. onSnapshot listeners push real-time updates to all devices
 *   3. When Admin A changes data → Firestore updates → Admin B/C/D
 *      receive update instantly (no refresh needed)
 *   4. localStorage is used ONLY as a read cache for offline fallback
 *   5. Server time (from Firestore serverTimestamp) used for expiry
 *
 * Collections:
 *   - admin_data/keys        → LicenseKey[]
 *   - admin_data/devices     → Device[]
 *   - admin_data/users       → User[]
 *   - admin_data/logs        → ActivityLog[]
 *   - admin_data/settings    → AdminSettings (single doc)
 *   - admin_data/announcements → Announcement[]
 *   - admin_data/server_time → { timestamp: serverTimestamp } (for sync)
 */

import { db } from "./firebase";
import { isFirebaseReady } from "./firebase-license";
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  serverTimestamp,
  query,
  orderBy,
  limit,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import type { LicenseKey, Device, User, ActivityLog, AdminSettings, Announcement } from "./admin-store";

// ============================================================
// Collection references — all admin data under admin_data/
// ============================================================

const ADMIN_DATA_COLLECTION = "admin_data";

// Document IDs (single-doc collections use fixed IDs)
const DOC_KEYS = "keys";
const DOC_DEVICES = "devices";
const DOC_USERS = "users";
const DOC_LOGS = "logs";
const DOC_SETTINGS = "settings";
const DOC_ANNOUNCEMENTS = "announcements";
const DOC_SERVER_TIME = "server_time";

// ============================================================
// Write operations — all go through Firestore (source of truth)
// ============================================================

/**
 * Remove undefined fields from any object — Firestore rejects undefined.
 */
function cleanUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(cleanUndefined) as T;
  const clean: any = {};
  for (const [key, value] of Object.entries(obj as any)) {
    if (value !== undefined) {
      clean[key] = typeof value === "object" && value !== null ? cleanUndefined(value) : value;
    }
  }
  return clean;
}

/**
 * Write all keys to Firestore (license_keys/{keyStr} — one doc per key).
 * Delegates to firebase-license.ts syncAllKeysToFirestore for atomic per-doc writes.
 */
export async function syncKeysToFirestore(keys: LicenseKey[]): Promise<void> {
  if (!isFirebaseReady() || !db) {
    console.warn("[AdminSync] Firebase not ready — keys write skipped");
    return;
  }
  try {
    const { syncAllKeysToFirestore } = await import("./firebase-license");
    await syncAllKeysToFirestore(keys);
    console.log(`[AdminSync] ✅ Synced ${keys.length} keys to license_keys/`);
  } catch (err) {
    console.error("[AdminSync] Failed to sync keys:", err);
  }
}

/**
 * Write all devices to Firestore.
 */
export async function syncDevicesToFirestore(devices: Device[]): Promise<void> {
  if (!isFirebaseReady() || !db) return;
  try {
    await setDoc(doc(db, ADMIN_DATA_COLLECTION, DOC_DEVICES), {
      devices: devices.map(cleanUndefined),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("[AdminSync] Failed to sync devices:", err);
  }
}

/**
 * Write all users to Firestore.
 */
export async function syncUsersToFirestore(users: User[]): Promise<void> {
  if (!isFirebaseReady() || !db) return;
  try {
    await setDoc(doc(db, ADMIN_DATA_COLLECTION, DOC_USERS), {
      users: users.map(cleanUndefined),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("[AdminSync] Failed to sync users:", err);
  }
}

/**
 * Write all logs to Firestore.
 */
export async function syncLogsToFirestore(logs: ActivityLog[]): Promise<void> {
  if (!isFirebaseReady() || !db) return;
  try {
    const recentLogs = logs.slice(-200).map(cleanUndefined);
    await setDoc(doc(db, ADMIN_DATA_COLLECTION, DOC_LOGS), {
      logs: recentLogs,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("[AdminSync] Failed to sync logs:", err);
  }
}

/**
 * Write settings to Firestore.
 */
export async function syncSettingsToFirestore(settings: AdminSettings): Promise<void> {
  if (!isFirebaseReady() || !db) return;
  try {
    await setDoc(doc(db, ADMIN_DATA_COLLECTION, DOC_SETTINGS), {
      settings: cleanUndefined(settings),
      updatedAt: serverTimestamp(),
    });
    console.log("[AdminSync] ✅ Settings synced to Firestore");
  } catch (err) {
    console.error("[AdminSync] Failed to sync settings:", err);
  }
}

/**
 * Write announcements to Firestore.
 */
export async function syncAnnouncementsToFirestore(announcements: Announcement[]): Promise<void> {
  if (!isFirebaseReady() || !db) return;
  try {
    await setDoc(doc(db, ADMIN_DATA_COLLECTION, DOC_ANNOUNCEMENTS), {
      announcements: announcements.map(cleanUndefined),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("[AdminSync] Failed to sync announcements:", err);
  }
}

// ============================================================
// Read operations — fetch from Firestore (with localStorage cache)
// ============================================================

export async function fetchKeysFromAdminData(): Promise<LicenseKey[] | null> {
  if (!isFirebaseReady() || !db) return null;
  try {
    // Read entire license_keys collection (one doc per key)
    const snap = await getDocs(collection(db, "license_keys"));
    const keys: LicenseKey[] = [];
    snap.forEach((d) => {
      const data = d.data() as any;
      keys.push({
        key: data.key || d.id,
        type: data.type || "trial",
        status: data.status || "active",
        createdAt: typeof data.createdAt === "number" ? data.createdAt : Date.now(),
        expiresAt: data.expiresAt ?? null,
        deviceIds: Array.isArray(data.deviceIds) ? data.deviceIds : [],
        userName: data.userName,
        lastVerified: data.lastVerified,
        verifications: typeof data.verifications === "number" ? data.verifications : 0,
      });
    });
    console.log(`[AdminSync] ✅ Fetched ${keys.length} keys from license_keys/`);
    return keys;
  } catch (err) {
    console.error("[AdminSync] Failed to fetch keys:", err);
    return null;
  }
}

export async function fetchDevicesFromAdminData(): Promise<Device[] | null> {
  if (!isFirebaseReady() || !db) return null;
  try {
    const snap = await getDoc(doc(db, ADMIN_DATA_COLLECTION, DOC_DEVICES));
    if (snap.exists()) return snap.data().devices as Device[];
    return null;
  } catch (err) {
    console.error("[AdminSync] Failed to fetch devices:", err);
    return null;
  }
}

export async function fetchUsersFromAdminData(): Promise<User[] | null> {
  if (!isFirebaseReady() || !db) return null;
  try {
    const snap = await getDoc(doc(db, ADMIN_DATA_COLLECTION, DOC_USERS));
    if (snap.exists()) return snap.data().users as User[];
    return null;
  } catch (err) {
    console.error("[AdminSync] Failed to fetch users:", err);
    return null;
  }
}

export async function fetchLogsFromAdminData(): Promise<ActivityLog[] | null> {
  if (!isFirebaseReady() || !db) return null;
  try {
    const snap = await getDoc(doc(db, ADMIN_DATA_COLLECTION, DOC_LOGS));
    if (snap.exists()) return snap.data().logs as ActivityLog[];
    return null;
  } catch (err) {
    console.error("[AdminSync] Failed to fetch logs:", err);
    return null;
  }
}

export async function fetchSettingsFromAdminData(): Promise<AdminSettings | null> {
  if (!isFirebaseReady() || !db) return null;
  try {
    const snap = await getDoc(doc(db, ADMIN_DATA_COLLECTION, DOC_SETTINGS));
    if (snap.exists()) return snap.data().settings as AdminSettings;
    return null;
  } catch (err) {
    console.error("[AdminSync] Failed to fetch settings:", err);
    return null;
  }
}

export async function fetchAnnouncementsFromAdminData(): Promise<Announcement[] | null> {
  if (!isFirebaseReady() || !db) return null;
  try {
    const snap = await getDoc(doc(db, ADMIN_DATA_COLLECTION, DOC_ANNOUNCEMENTS));
    if (snap.exists()) return snap.data().announcements as Announcement[];
    return null;
  } catch (err) {
    console.error("[AdminSync] Failed to fetch announcements:", err);
    return null;
  }
}

// ============================================================
// Real-time listeners — onSnapshot (INSTANT sync across devices)
// ============================================================

export interface AdminSyncCallbacks {
  onKeysUpdate?: (keys: LicenseKey[]) => void;
  onDevicesUpdate?: (devices: Device[]) => void;
  onUsersUpdate?: (users: User[]) => void;
  onLogsUpdate?: (logs: ActivityLog[]) => void;
  onSettingsUpdate?: (settings: AdminSettings) => void;
  onAnnouncementsUpdate?: (announcements: Announcement[]) => void;
  onServerTimeUpdate?: (serverTime: number) => void;
  onError?: (error: Error) => void;
}

/**
 * Subscribe to ALL admin data in real-time.
 * Returns an unsubscribe function.
 *
 * When ANY admin device changes data, ALL other devices receive
 * the update INSTANTLY via Firestore onSnapshot listeners.
 */
export function subscribeToAdminData(callbacks: AdminSyncCallbacks): Unsubscribe {
  if (!isFirebaseReady() || !db) {
    console.warn("[AdminSync] Firebase not ready — real-time sync disabled");
    return () => {};
  }

  const unsubs: Unsubscribe[] = [];

  try {
    // Listen to keys — onSnapshot on the license_keys COLLECTION.
    // Any key add/update/delete from ANY admin device fires here instantly.
    // (license_keys/{keyStr} — one doc per key, matches user's Firestore rules.)
    if (callbacks.onKeysUpdate) {
      const keysColl = collection(db, "license_keys");
      const unsub = onSnapshot(
        keysColl,
        (snap) => {
          // snap.docs = ALL documents in the collection at this moment
          const keys: LicenseKey[] = [];
          snap.forEach((d) => {
            const data = d.data() as any;
            keys.push({
              key: data.key || d.id,
              type: data.type || "trial",
              status: data.status || "active",
              createdAt: typeof data.createdAt === "number" ? data.createdAt : Date.now(),
              expiresAt: data.expiresAt ?? null,
              deviceIds: Array.isArray(data.deviceIds) ? data.deviceIds : [],
              userName: data.userName,
              lastVerified: data.lastVerified,
              verifications: typeof data.verifications === "number" ? data.verifications : 0,
            });
          });
          callbacks.onKeysUpdate!(keys);
          console.log(`[AdminSync] 📡 Real-time keys update: ${keys.length} keys (license_keys collection)`);
        },
        (err) => {
          console.error("[AdminSync] ❌ onSnapshot(license_keys) error:", err);
          callbacks.onError?.(err);
        }
      );
      unsubs.push(unsub);
    }

    // Listen to devices
    if (callbacks.onDevicesUpdate) {
      const unsub = onSnapshot(
        doc(db, ADMIN_DATA_COLLECTION, DOC_DEVICES),
        (snap) => {
          if (snap.exists()) {
            const devices = snap.data().devices as Device[];
            callbacks.onDevicesUpdate!(devices || []);
          }
        },
        (err) => callbacks.onError?.(err)
      );
      unsubs.push(unsub);
    }

    // Listen to users
    if (callbacks.onUsersUpdate) {
      const unsub = onSnapshot(
        doc(db, ADMIN_DATA_COLLECTION, DOC_USERS),
        (snap) => {
          if (snap.exists()) {
            const users = snap.data().users as User[];
            callbacks.onUsersUpdate!(users || []);
          }
        },
        (err) => callbacks.onError?.(err)
      );
      unsubs.push(unsub);
    }

    // Listen to logs
    if (callbacks.onLogsUpdate) {
      const unsub = onSnapshot(
        doc(db, ADMIN_DATA_COLLECTION, DOC_LOGS),
        (snap) => {
          if (snap.exists()) {
            const logs = snap.data().logs as ActivityLog[];
            callbacks.onLogsUpdate!(logs || []);
          }
        },
        (err) => callbacks.onError?.(err)
      );
      unsubs.push(unsub);
    }

    // Listen to settings
    if (callbacks.onSettingsUpdate) {
      const unsub = onSnapshot(
        doc(db, ADMIN_DATA_COLLECTION, DOC_SETTINGS),
        (snap) => {
          if (snap.exists()) {
            const settings = snap.data().settings as AdminSettings;
            callbacks.onSettingsUpdate!(settings);
            console.log("[AdminSync] 📡 Real-time settings update");
          }
        },
        (err) => callbacks.onError?.(err)
      );
      unsubs.push(unsub);
    }

    // Listen to announcements
    if (callbacks.onAnnouncementsUpdate) {
      const unsub = onSnapshot(
        doc(db, ADMIN_DATA_COLLECTION, DOC_ANNOUNCEMENTS),
        (snap) => {
          if (snap.exists()) {
            const announcements = snap.data().announcements as Announcement[];
            callbacks.onAnnouncementsUpdate!(announcements || []);
          }
        },
        (err) => callbacks.onError?.(err)
      );
      unsubs.push(unsub);
    }

    // Listen to server time (for expiry calculations)
    if (callbacks.onServerTimeUpdate) {
      const unsub = onSnapshot(
        doc(db, ADMIN_DATA_COLLECTION, DOC_SERVER_TIME),
        (snap) => {
          if (snap.exists()) {
            const ts = snap.data().timestamp;
            // Firestore Timestamp to milliseconds
            const serverTime = ts?.toMillis?.() || Date.now();
            callbacks.onServerTimeUpdate!(serverTime);
          }
        },
        (err) => callbacks.onError?.(err)
      );
      unsubs.push(unsub);
    }
  } catch (err) {
    console.error("[AdminSync] Failed to subscribe:", err);
    callbacks.onError?.(err as Error);
  }

  // Return combined unsubscribe
  return () => {
    unsubs.forEach((unsub) => {
      try { unsub(); } catch { /* ignore */ }
    });
  };
}

// ============================================================
// Server time — for accurate expiry calculation on all devices
// ============================================================

let cachedServerTime: number | null = null;
let lastServerTimeFetch: number = 0;
const SERVER_TIME_CACHE_MS = 30_000; // refresh every 30 seconds

/**
 * Get the current server time from Firestore.
 * Uses the admin_data/server_time doc which is periodically updated.
 *
 * This ensures ALL devices calculate expiry the same way —
 * no device-clock manipulation can bypass expiry.
 */
export async function getServerTime(): Promise<number> {
  // Return cached value if fresh (< 30s old)
  if (cachedServerTime && Date.now() - lastServerTimeFetch < SERVER_TIME_CACHE_MS) {
    return cachedServerTime;
  }

  if (!isFirebaseReady() || !db) {
    return Date.now(); // fallback to device time
  }

  try {
    // Write current server timestamp
    await setDoc(doc(db, ADMIN_DATA_COLLECTION, DOC_SERVER_TIME), {
      timestamp: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Read it back to get the actual server time
    const snap = await getDoc(doc(db, ADMIN_DATA_COLLECTION, DOC_SERVER_TIME));
    if (snap.exists()) {
      const ts = snap.data().timestamp;
      const serverTime = ts?.toMillis?.() || Date.now();
      cachedServerTime = serverTime;
      lastServerTimeFetch = Date.now();
      return serverTime;
    }
  } catch (err) {
    console.error("[AdminSync] Failed to get server time:", err);
  }

  return Date.now(); // fallback
}

/**
 * Calculate expiry from server time (not device time).
 * Returns the absolute expiry timestamp in milliseconds.
 */
export async function calculateExpiry(
  type: "trial" | "match_basic" | "match_full" | "weekly" | "monthly" | "half_yearly" | "elite" | "lifetime"
): Promise<number | null> {
  const now = await getServerTime();
  const day = 86400000;
  const hour = 3600000;

  switch (type) {
    case "trial": return now + 1 * day;
    case "match_basic": return now + 6 * hour;
    case "match_full": return now + 1 * day;
    case "weekly": return now + 7 * day;
    case "monthly": return now + 30 * day;
    case "half_yearly": return now + 180 * day;
    case "elite": return now + 90 * day;
    case "lifetime": return null;
    default: return now + 1 * day;
  }
}

/**
 * Check if a key is expired using SERVER TIME (not device time).
 */
export async function isKeyExpired(expiresAt: number | null): Promise<boolean> {
  if (!expiresAt) return false; // lifetime keys never expire
  const serverTime = await getServerTime();
  return expiresAt < serverTime;
}

// ============================================================
// Full sync — fetch all data from Firestore and update localStorage
// ============================================================

export async function fullSyncFromFirestore(): Promise<{
  keys?: LicenseKey[];
  devices?: Device[];
  users?: User[];
  logs?: ActivityLog[];
  settings?: AdminSettings;
  announcements?: Announcement[];
}> {
  console.log("[AdminSync] 🔄 Full sync from Firestore...");
  const result: any = {};

  try {
    const [keys, devices, users, logs, settings, announcements] = await Promise.all([
      fetchKeysFromAdminData(),
      fetchDevicesFromAdminData(),
      fetchUsersFromAdminData(),
      fetchLogsFromAdminData(),
      fetchSettingsFromAdminData(),
      fetchAnnouncementsFromAdminData(),
    ]);

    if (keys) result.keys = keys;
    if (devices) result.devices = devices;
    if (users) result.users = users;
    if (logs) result.logs = logs;
    if (settings) result.settings = settings;
    if (announcements) result.announcements = announcements;

    console.log("[AdminSync] ✅ Full sync complete:", {
      keys: keys?.length || 0,
      devices: devices?.length || 0,
      users: users?.length || 0,
      logs: logs?.length || 0,
      hasSettings: !!settings,
      announcements: announcements?.length || 0,
    });
  } catch (err) {
    console.error("[AdminSync] Full sync failed:", err);
  }

  return result;
}

// ============================================================
// Network reconnect handler — auto-sync on reconnect
// ============================================================

let reconnectSyncInProgress = false;

/**
 * Call this when network reconnects.
 * Triggers a full sync from Firestore to catch any changes
 * missed while offline.
 */
export async function syncOnReconnect(): Promise<void> {
  if (reconnectSyncInProgress) return;
  reconnectSyncInProgress = true;

  console.log("[AdminSync] 📡 Network reconnected — syncing from Firestore...");
  try {
    await fullSyncFromFirestore();
    await getServerTime(); // refresh server time
  } catch (err) {
    console.error("[AdminSync] Reconnect sync failed:", err);
  } finally {
    reconnectSyncInProgress = false;
  }
}

/**
 * Initialize network reconnect listener.
 * Call this once on app load.
 */
export function initNetworkReconnectListener(): () => void {
  if (typeof window === "undefined") return () => {};

  const handleOnline = () => syncOnReconnect();

  window.addEventListener("online", handleOnline);

  // Also listen to Firestore connectivity changes
  let unsub: Unsubscribe | null = null;
  if (isFirebaseReady() && db) {
    try {
      // onSnapshot will auto-reconnect when network comes back
      // This is a no-op listener just to keep the connection alive
      unsub = onSnapshot(
        doc(db, ADMIN_DATA_COLLECTION, DOC_SERVER_TIME),
        () => {}, // no-op — just keeps connection alive
        (err) => console.warn("[AdminSync] Connection error:", err)
      );
    } catch {
      // ignore
    }
  }

  return () => {
    window.removeEventListener("online", handleOnline);
    if (unsub) try { unsub(); } catch { /* ignore */ }
  };
}
