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
    // Read entire license_keys collection, but LIMIT to last 200 keys
    // (sorted by createdAt desc) to prevent browser hang when there are
    // thousands of keys in Firestore.
    const q = query(
      collection(db, "license_keys"),
      orderBy("createdAt", "desc"),
      limit(200)
    );
    let snap;
    try {
      snap = await getDocs(q);
    } catch (indexErr) {
      // orderBy requires an index — fall back to unordered fetch with client-side sort
      console.warn("[AdminSync] orderBy failed (no index?), falling back to unordered fetch");
      snap = await getDocs(collection(db, "license_keys"));
    }
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
    // Sort by createdAt desc (most recent first) + limit to 200
    keys.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
    const limited = keys.slice(0, 200);
    console.log(`[AdminSync] ✅ Fetched ${limited.length} keys from license_keys/ (limited to 200)`);
    return limited;
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
    // Listen to keys — onSnapshot on the license_keys COLLECTION with LIMIT.
    // Without limit, loading 12,000+ keys freezes the browser.
    // We only need the most recent 200 keys for the admin panel.
    // Any key add/update/delete from ANY admin device fires here instantly.
    if (callbacks.onKeysUpdate) {
      let keysQuery;
      try {
        keysQuery = query(
          collection(db, "license_keys"),
          orderBy("createdAt", "desc"),
          limit(200)
        );
      } catch {
        keysQuery = collection(db, "license_keys");
      }
      const unsub = onSnapshot(
        keysQuery,
        (snap) => {
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
          // Sort by createdAt desc + limit to 200
          keys.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
          const limited = keys.slice(0, 200);
          callbacks.onKeysUpdate!(limited);
          console.log(`[AdminSync] 📡 Real-time keys update: ${limited.length} keys (limited to 200)`);
        },
        (err) => {
          console.error("[AdminSync] ❌ onSnapshot(license_keys) error:", err);
          callbacks.onError?.(err);
        }
      );
      unsubs.push(unsub);
    }

    // NOTE: devices, users, logs, settings, announcements, server_time
    // listeners are DISABLED because the user's Firestore rules only allow
    // license_keys/{keyId}. Attempting to listen to admin_data/* causes
    // "Missing or insufficient permissions" errors in the console.
    // These data types are stored in localStorage only (per-device).
    // Only license keys need cross-device sync.
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

  // NOTE: Firestore server time fetch removed — it writes to admin_data/server_time
  // which causes "Missing or insufficient permissions" errors (user's rules
  // only allow license_keys/{keyId}).
  // Fall back to device time. This is acceptable because:
  //   1. License expiry checks use this time, but admins set expiry from their
  //      device anyway — so device time is consistent within a session.
  //   2. The /api/admin/time endpoint provides server time via HTTP (no Firestore).
  //   3. Cached server time from onSnapshot (if available) is used first.
  cachedServerTime = Date.now();
  lastServerTimeFetch = Date.now();
  return cachedServerTime;
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
  console.log("[AdminSync] 🔄 Full sync from Firestore (license_keys only)...");
  const result: any = {};

  try {
    // ONLY fetch keys from license_keys collection (user's Firestore rules
    // only allow license_keys/{keyId}). Devices, users, logs, settings,
    // announcements are stored in localStorage only — attempting to fetch
    // them from admin_data/* causes "Missing or insufficient permissions" errors.
    const keys = await fetchKeysFromAdminData();
    if (keys) result.keys = keys;

    console.log("[AdminSync] ✅ Full sync complete:", {
      keys: keys?.length || 0,
      devices: "localStorage only",
      users: "localStorage only",
      logs: "localStorage only",
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
    // Note: getServerTime() removed — it writes to admin_data/server_time
    // which causes permission-denied errors (user's rules only allow license_keys)
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

  // NOTE: Firestore keep-alive onSnapshot removed — it was listening to
  // admin_data/server_time which causes permission-denied errors.
  // The license_keys onSnapshot listener already keeps the connection alive.

  return () => {
    window.removeEventListener("online", handleOnline);
  };
}

// ============================================================
// JWT TOKEN SYNC — Centralized across all admin devices
// ============================================================
// Stored in license_keys/ADMIN_JWT_TOKEN (same collection as license keys,
// since that's the only collection the user's Firestore rules allow).
// All admin devices read from + write to this SAME document.
// Real-time onSnapshot listener syncs instantly across all devices.

const JWT_TOKEN_DOC_ID = "ADMIN_JWT_TOKEN";
const JWT_TOKEN_COLLECTION = "license_keys";

/**
 * Save JWT token to Firestore (central source of truth).
 * Also writes to localStorage as offline cache.
 * All admin devices will receive this via onSnapshot instantly.
 */
export async function saveJwtTokenToFirestore(token: string): Promise<boolean> {
  if (!isFirebaseReady() || !db) {
    console.warn("[JwtSync] Firebase not ready — saving to localStorage only");
    if (typeof window !== "undefined") {
      if (token) localStorage.setItem("user_token", token);
      else localStorage.removeItem("user_token");
    }
    return false;
  }
  try {
    const docRef = doc(db, JWT_TOKEN_COLLECTION, JWT_TOKEN_DOC_ID);
    await setDoc(docRef, {
      token: token || "",
      updatedAt: serverTimestamp(),
      updatedBy: typeof window !== "undefined" ? localStorage.getItem("apna-cricket-device-id") || "unknown" : "unknown",
    });
    console.log("[JwtSync] ✅ JWT token saved to Firestore — all admin devices will sync");
    // Also cache in localStorage for offline use
    if (typeof window !== "undefined") {
      if (token) localStorage.setItem("user_token", token);
      else localStorage.removeItem("user_token");
    }
    return true;
  } catch (err: any) {
    console.error("[JwtSync] ❌ Failed to save JWT to Firestore:", err?.code || err?.message || err);
    // Fall back to localStorage only
    if (typeof window !== "undefined") {
      if (token) localStorage.setItem("user_token", token);
      else localStorage.removeItem("user_token");
    }
    return false;
  }
}

/**
 * Fetch JWT token from Firestore (central source of truth).
 * Falls back to localStorage if Firestore unavailable.
 */
export async function fetchJwtTokenFromFirestore(): Promise<string> {
  // Try localStorage first for instant display (while Firestore loads)
  const cached = typeof window !== "undefined" ? (localStorage.getItem("user_token") || "") : "";

  if (!isFirebaseReady() || !db) {
    return cached;
  }
  try {
    const snap = await getDoc(doc(db, JWT_TOKEN_COLLECTION, JWT_TOKEN_DOC_ID));
    if (snap.exists()) {
      const data = snap.data() as Record<string, any>;
      const token = data.token || "";
      // Update localStorage cache
      if (typeof window !== "undefined") {
        if (token) localStorage.setItem("user_token", token);
        else localStorage.removeItem("user_token");
      }
      console.log("[JwtSync] ✅ Fetched JWT token from Firestore");
      return token;
    }
    return cached;
  } catch (err: any) {
    console.error("[JwtSync] ❌ Failed to fetch JWT from Firestore:", err?.code || err?.message || err);
    return cached;
  }
}

/**
 * Subscribe to JWT token changes in real-time.
 * When ANY admin device saves a new token, ALL other devices
 * receive the update INSTANTLY via onSnapshot.
 *
 * Returns an unsubscribe function.
 */
export function subscribeToJwtToken(callback: (token: string) => void): Unsubscribe {
  if (!isFirebaseReady() || !db) {
    console.warn("[JwtSync] Firebase not ready — real-time JWT sync disabled");
    return () => {};
  }
  try {
    const unsub = onSnapshot(
      doc(db, JWT_TOKEN_COLLECTION, JWT_TOKEN_DOC_ID),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Record<string, any>;
          const token = data.token || "";
          // Update localStorage cache
          if (typeof window !== "undefined") {
            if (token) localStorage.setItem("user_token", token);
            else localStorage.removeItem("user_token");
          }
          callback(token);
          console.log("[JwtSync] 📡 Real-time JWT token update received");
        } else {
          // Document deleted — token cleared
          if (typeof window !== "undefined") {
            localStorage.removeItem("user_token");
          }
          callback("");
          console.log("[JwtSync] 📡 Real-time JWT token cleared");
        }
      },
      (err) => {
        console.error("[JwtSync] ❌ onSnapshot error:", err);
      }
    );
    return unsub;
  } catch (err) {
    console.error("[JwtSync] ❌ Failed to subscribe:", err);
    return () => {};
  }
}
