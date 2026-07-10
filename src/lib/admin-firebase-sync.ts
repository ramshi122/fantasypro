/**
 * Admin Firebase Sync — SINGLE SOURCE OF TRUTH
 * =============================================
 * All admin data (license keys, devices, users, logs, settings) lives in
 * Firebase Firestore. There is NO localStorage caching for admin data.
 *
 * This module provides:
 *   - Fetch functions   (one-shot reads)
 *   - Subscribe functions (real-time onSnapshot listeners)
 *   - Write functions    (setDoc / updateDoc / deleteDoc / addDoc)
 *
 * Collections:
 *   - license_keys/{keyStr}        — LicenseKey[]
 *   - devices/{deviceId}           — Device[]
 *   - users/{userId}               — User[]
 *   - admin_logs/{autoId}          — ActivityLog[] (last 100)
 *   - admin_config/settings        — single AdminSettings doc
 */

import { db } from "./firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
  type Unsubscribe,
} from "firebase/firestore";
import type {
  LicenseKey,
  Device,
  User,
  ActivityLog,
  AdminSettings,
} from "./admin-store";

const KEYS_COLLECTION = "license_keys";
const DEVICES_COLLECTION = "devices";
const USERS_COLLECTION = "users";
const LOGS_COLLECTION = "admin_logs";
const CONFIG_COLLECTION = "admin_config";
const SETTINGS_DOC = "settings";

/**
 * Check that the Firestore db instance is ready.
 * The db instance is created at import time in src/lib/firebase.ts, but during
 * SSR or if init failed, it may be an empty object. We guard all read/writes
 * with this check.
 */
function isDbReady(): boolean {
  return !!db && typeof (db as any).collection === "function"
    ? true
    : !!db && Object.keys(db as object).length > 0;
}

/* ------------------------------------------------------------------ *
 * FETCH FUNCTIONS (one-shot reads)
 * ------------------------------------------------------------------ */

/**
 * Fetch ALL license keys from Firestore.
 */
export async function fetchAllKeysFromFirebase(): Promise<LicenseKey[]> {
  if (!isDbReady()) return [];
  try {
    const snap = await getDocs(collection(db as any, KEYS_COLLECTION));
    const keys: LicenseKey[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() as Record<string, any>;
      keys.push({
        key: data.key || docSnap.id,
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
    return keys;
  } catch (err) {
    console.error("[Admin Sync] fetchAllKeysFromFirebase failed:", err);
    return [];
  }
}

/**
 * Fetch ALL devices from Firestore.
 */
export async function fetchAllDevicesFromFirebase(): Promise<Device[]> {
  if (!isDbReady()) return [];
  try {
    const snap = await getDocs(collection(db as any, DEVICES_COLLECTION));
    const devices: Device[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() as Record<string, any>;
      devices.push({
        deviceId: data.deviceId || docSnap.id,
        userName: data.userName,
        licenseKey: data.licenseKey,
        lastLogin: typeof data.lastLogin === "number" ? data.lastLogin : 0,
        status: data.status === "banned" ? "banned" : "allowed",
      });
    });
    return devices;
  } catch (err) {
    console.error("[Admin Sync] fetchAllDevicesFromFirebase failed:", err);
    return [];
  }
}

/**
 * Fetch ALL users from Firestore.
 */
export async function fetchAllUsersFromFirebase(): Promise<User[]> {
  if (!isDbReady()) return [];
  try {
    const snap = await getDocs(collection(db as any, USERS_COLLECTION));
    const users: User[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() as Record<string, any>;
      users.push({
        id: data.id || docSnap.id,
        name: data.name || "",
        device: data.device,
        license: data.license,
        lastActive: typeof data.lastActive === "number" ? data.lastActive : 0,
        banned: !!data.banned,
      });
    });
    return users;
  } catch (err) {
    console.error("[Admin Sync] fetchAllUsersFromFirebase failed:", err);
    return [];
  }
}

/**
 * Fetch the last 100 activity logs from Firestore (most-recent first).
 */
export async function fetchLogsFromFirebase(): Promise<ActivityLog[]> {
  if (!isDbReady()) return [];
  try {
    // Try ordered query first; if no index exists, fall back to plain fetch.
    let snap;
    try {
      const q = query(
        collection(db as any, LOGS_COLLECTION),
        orderBy("timestamp", "desc"),
        limit(100)
      );
      snap = await getDocs(q);
    } catch (orderedErr) {
      console.warn("[Admin Sync] ordered logs query failed, falling back:", orderedErr);
      snap = await getDocs(collection(db as any, LOGS_COLLECTION));
    }

    const logs: ActivityLog[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data() as Record<string, any>;
      logs.push({
        id: data.id || docSnap.id,
        timestamp: typeof data.timestamp === "number" ? data.timestamp : Date.now(),
        type: data.type || "admin_action",
        message: data.message || "",
        details: data.details,
      });
    });
    // Sort client-side by timestamp desc (in case fallback query was unordered)
    logs.sort((a, b) => b.timestamp - a.timestamp);
    return logs.slice(0, 100);
  } catch (err) {
    console.error("[Admin Sync] fetchLogsFromFirebase failed:", err);
    return [];
  }
}

/**
 * Fetch the single admin settings document from Firestore.
 * Returns null if the document does not exist.
 */
export async function fetchSettingsFromFirebase(): Promise<AdminSettings | null> {
  if (!isDbReady()) return null;
  try {
    const snap = await getDoc(doc(db as any, CONFIG_COLLECTION, SETTINGS_DOC));
    if (!snap.exists()) return null;
    return snap.data() as AdminSettings;
  } catch (err) {
    console.error("[Admin Sync] fetchSettingsFromFirebase failed:", err);
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * SUBSCRIBE FUNCTIONS (real-time onSnapshot listeners)
 * ------------------------------------------------------------------ */

/**
 * Subscribe to ALL license key changes in real-time.
 * The callback fires immediately with the current state, and again on every
 * change to the license_keys collection (across ALL devices).
 * Returns an unsubscribe function.
 */
export function subscribeToKeys(callback: (keys: LicenseKey[]) => void): Unsubscribe {
  if (!isDbReady()) return () => {};
  try {
    return onSnapshot(
      collection(db as any, KEYS_COLLECTION),
      (snap) => {
        const keys: LicenseKey[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data() as Record<string, any>;
          keys.push({
            key: data.key || docSnap.id,
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
        callback(keys);
      },
      (err) => {
        console.error("[Admin Sync] subscribeToKeys error:", err);
      }
    );
  } catch (err) {
    console.error("[Admin Sync] subscribeToKeys init failed:", err);
    return () => {};
  }
}

/**
 * Subscribe to ALL user changes in real-time.
 */
export function subscribeToUsers(callback: (users: User[]) => void): Unsubscribe {
  if (!isDbReady()) return () => {};
  try {
    return onSnapshot(
      collection(db as any, USERS_COLLECTION),
      (snap) => {
        const users: User[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data() as Record<string, any>;
          users.push({
            id: data.id || docSnap.id,
            name: data.name || "",
            device: data.device,
            license: data.license,
            lastActive: typeof data.lastActive === "number" ? data.lastActive : 0,
            banned: !!data.banned,
          });
        });
        callback(users);
      },
      (err) => {
        console.error("[Admin Sync] subscribeToUsers error:", err);
      }
    );
  } catch (err) {
    console.error("[Admin Sync] subscribeToUsers init failed:", err);
    return () => {};
  }
}

/**
 * Subscribe to admin settings document changes in real-time.
 */
export function subscribeToSettings(
  callback: (settings: AdminSettings) => void
): Unsubscribe {
  if (!isDbReady()) return () => {};
  try {
    return onSnapshot(
      doc(db as any, CONFIG_COLLECTION, SETTINGS_DOC),
      (snap) => {
        if (snap.exists()) {
          callback(snap.data() as AdminSettings);
        }
      },
      (err) => {
        console.error("[Admin Sync] subscribeToSettings error:", err);
      }
    );
  } catch (err) {
    console.error("[Admin Sync] subscribeToSettings init failed:", err);
    return () => {};
  }
}

/* ------------------------------------------------------------------ *
 * WRITE FUNCTIONS
 * ------------------------------------------------------------------ */

/**
 * Write (create or overwrite) a license key to Firestore.
 */
export async function writeKeyToFirebase(key: LicenseKey): Promise<boolean> {
  if (!isDbReady()) return false;
  try {
    await setDoc(doc(db as any, KEYS_COLLECTION, key.key), {
      ...key,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.error("[Admin Sync] writeKeyToFirebase failed:", err);
    return false;
  }
}

/**
 * Bulk write multiple license keys to Firestore (sequential, rate-limit safe).
 */
export async function bulkWriteKeysToFirebase(keys: LicenseKey[]): Promise<{
  synced: number;
  failed: number;
}> {
  let synced = 0;
  let failed = 0;
  // Process in chunks of 50 to avoid Firestore rate limits.
  const chunkSize = 50;
  for (let i = 0; i < keys.length; i += chunkSize) {
    const chunk = keys.slice(i, i + chunkSize);
    const results = await Promise.all(chunk.map((k) => writeKeyToFirebase(k)));
    for (const ok of results) {
      if (ok) synced++;
      else failed++;
    }
  }
  return { synced, failed };
}

/**
 * Delete a license key from Firestore.
 */
export async function deleteKeyFromFirebase(keyStr: string): Promise<boolean> {
  if (!isDbReady()) return false;
  try {
    await deleteDoc(doc(db as any, KEYS_COLLECTION, keyStr));
    return true;
  } catch (err) {
    console.error("[Admin Sync] deleteKeyFromFirebase failed:", err);
    return false;
  }
}

/**
 * Update specific fields of a license key in Firestore.
 */
export async function updateKeyInFirebase(
  keyStr: string,
  updates: Partial<LicenseKey>
): Promise<boolean> {
  if (!isDbReady()) return false;
  try {
    await updateDoc(doc(db as any, KEYS_COLLECTION, keyStr), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.error("[Admin Sync] updateKeyInFirebase failed:", err);
    return false;
  }
}

/**
 * Append a new activity log to Firestore (auto-generated document ID).
 */
export async function writeLogToFirebase(log: ActivityLog): Promise<boolean> {
  if (!isDbReady()) return false;
  try {
    await addDoc(collection(db as any, LOGS_COLLECTION), {
      ...log,
      createdAt: serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.error("[Admin Sync] writeLogToFirebase failed:", err);
    return false;
  }
}

/**
 * Write (create or overwrite) the admin settings document to Firestore.
 */
export async function writeSettingsToFirebase(
  settings: AdminSettings
): Promise<boolean> {
  if (!isDbReady()) return false;
  try {
    await setDoc(doc(db as any, CONFIG_COLLECTION, SETTINGS_DOC), {
      ...settings,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.error("[Admin Sync] writeSettingsToFirebase failed:", err);
    return false;
  }
}

/**
 * Write (create or overwrite) a device document in Firestore.
 */
export async function writeDeviceToFirebase(device: Device): Promise<boolean> {
  if (!isDbReady()) return false;
  try {
    await setDoc(doc(db as any, DEVICES_COLLECTION, device.deviceId), {
      ...device,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.error("[Admin Sync] writeDeviceToFirebase failed:", err);
    return false;
  }
}

/**
 * Write (create or overwrite) a user document in Firestore.
 */
export async function writeUserToFirebase(user: User): Promise<boolean> {
  if (!isDbReady()) return false;
  try {
    await setDoc(doc(db as any, USERS_COLLECTION, user.id), {
      ...user,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.error("[Admin Sync] writeUserToFirebase failed:", err);
    return false;
  }
}
