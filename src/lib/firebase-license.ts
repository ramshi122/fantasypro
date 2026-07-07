/**
 * Firebase Firestore Integration
 * ================================
 * Handles license key storage in Firebase Firestore for cross-device sync.
 *
 * Firestore collection: `license_keys`
 * Document ID: license key string (e.g. "CRICB-ABCD-EFGH-IJKL")
 * Fields: key, type, status, createdAt, expiresAt, deviceIds[], userName, verifications
 *
 * Falls back to localStorage if Firebase is not configured or offline.
 */

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";
import type { KeyType, KeyStatus, LicenseKey } from "./admin-store";

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let initialized = false;

const COLLECTION = "license_keys";

/**
 * Initialize Firebase with the given config.
 * Returns true if successful, false otherwise.
 */
export function initFirebase(config: string): boolean {
  if (initialized) return db !== null;
  initialized = true;

  if (!config || !config.trim()) {
    console.log("[Firebase] No config provided — using localStorage only");
    return false;
  }

  try {
    const parsed = JSON.parse(config);
    if (!parsed.apiKey || !parsed.projectId) {
      console.error("[Firebase] Invalid config — missing apiKey or projectId");
      return false;
    }

    // Use existing app if already initialized
    if (getApps().length > 0) {
      app = getApps()[0];
    } else {
      app = initializeApp(parsed);
    }
    db = getFirestore(app);
    console.log("[Firebase] Initialized successfully — project:", parsed.projectId);
    return true;
  } catch (err) {
    console.error("[Firebase] Init failed:", err);
    return false;
  }
}

/**
 * Check if Firebase is ready (initialized + has db).
 */
export function isFirebaseReady(): boolean {
  return db !== null;
}

/**
 * Sync a license key to Firestore.
 * Creates or updates the document.
 */
export async function syncKeyToFirestore(key: LicenseKey): Promise<boolean> {
  if (!db) return false;
  try {
    await setDoc(doc(db, COLLECTION, key.key), {
      ...key,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.error("[Firebase] syncKeyToFirestore failed:", err);
    return false;
  }
}

/**
 * Fetch a license key from Firestore by key string.
 */
export async function fetchKeyFromFirestore(keyStr: string): Promise<LicenseKey | null> {
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, COLLECTION, keyStr));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      key: data.key || keyStr,
      type: (data.type as KeyType) || "trial",
      status: (data.status as KeyStatus) || "active",
      createdAt: data.createdAt || Date.now(),
      expiresAt: data.expiresAt ?? null,
      deviceIds: data.deviceIds || [],
      userName: data.userName,
      lastVerified: data.lastVerified,
      verifications: data.verifications || 0,
    };
  } catch (err) {
    console.error("[Firebase] fetchKeyFromFirestore failed:", err);
    return null;
  }
}

/**
 * Fetch ALL license keys from Firestore.
 */
export async function fetchAllKeysFromFirestore(): Promise<LicenseKey[]> {
  if (!db) return [];
  try {
    const snap = await getDocs(collection(db, COLLECTION));
    const keys: LicenseKey[] = [];
    snap.forEach((doc) => {
      const data = doc.data();
      keys.push({
        key: data.key || doc.id,
        type: (data.type as KeyType) || "trial",
        status: (data.status as KeyStatus) || "active",
        createdAt: data.createdAt || Date.now(),
        expiresAt: data.expiresAt ?? null,
        deviceIds: data.deviceIds || [],
        userName: data.userName,
        lastVerified: data.lastVerified,
        verifications: data.verifications || 0,
      });
    });
    return keys;
  } catch (err) {
    console.error("[Firebase] fetchAllKeysFromFirestore failed:", err);
    return [];
  }
}

/**
 * Update a key's status in Firestore (suspend, expire, reactivate).
 */
export async function updateKeyStatusInFirestore(
  keyStr: string,
  status: KeyStatus
): Promise<boolean> {
  if (!db) return false;
  try {
    await updateDoc(doc(db, COLLECTION, keyStr), { status, updatedAt: serverTimestamp() });
    return true;
  } catch (err) {
    console.error("[Firebase] updateKeyStatusInFirestore failed:", err);
    return false;
  }
}

/**
 * Delete a key from Firestore.
 */
export async function deleteKeyFromFirestore(keyStr: string): Promise<boolean> {
  if (!db) return false;
  try {
    await deleteDoc(doc(db, COLLECTION, keyStr));
    return true;
  } catch (err) {
    console.error("[Firebase] deleteKeyFromFirestore failed:", err);
    return false;
  }
}

/**
 * Verify a license key against Firestore.
 * Checks: exists, not suspended, not expired, device binding.
 * On success: increments verifications, adds device ID, updates lastVerified.
 */
export async function verifyKeyInFirestore(
  keyStr: string,
  deviceId: string
): Promise<{ valid: boolean; message: string; keyType?: KeyType; key?: LicenseKey }> {
  if (!db) {
    return { valid: false, message: "Firebase not initialized" };
  }

  try {
    const key = await fetchKeyFromFirestore(keyStr);
    if (!key) {
      return { valid: false, message: "Key not found in database" };
    }

    if (key.status === "suspended") {
      return { valid: false, message: "Key suspended — contact admin" };
    }

    if (key.status === "expired" || (key.expiresAt && key.expiresAt < Date.now())) {
      return { valid: false, message: "Key expired" };
    }

    // Device binding check — allow up to 2 devices per key
    if (key.deviceIds.length >= 2 && !key.deviceIds.includes(deviceId)) {
      return { valid: false, message: "Key already bound to 2 devices" };
    }

    // Success — update key in Firestore
    const updatedDeviceIds = key.deviceIds.includes(deviceId)
      ? key.deviceIds
      : [...key.deviceIds, deviceId];

    await updateDoc(doc(db, COLLECTION, keyStr), {
      deviceIds: updatedDeviceIds,
      lastVerified: Date.now(),
      verifications: (key.verifications || 0) + 1,
      status: "used",
      updatedAt: serverTimestamp(),
    });

    return {
      valid: true,
      message: "License verified successfully",
      keyType: key.type,
      key: { ...key, deviceIds: updatedDeviceIds, verifications: (key.verifications || 0) + 1 },
    };
  } catch (err) {
    console.error("[Firebase] verifyKeyInFirestore failed:", err);
    return { valid: false, message: "Verification error — try again" };
  }
}

/**
 * Bulk sync all local keys to Firestore.
 * Useful after generating keys offline.
 */
export async function bulkSyncKeysToFirestore(keys: LicenseKey[]): Promise<{
  synced: number;
  failed: number;
}> {
  if (!db) return { synced: 0, failed: keys.length };

  let synced = 0;
  let failed = 0;

  for (const key of keys) {
    const ok = await syncKeyToFirestore(key);
    if (ok) synced++;
    else failed++;
  }

  return { synced, failed };
}

/**
 * Suspend ALL active keys in Firestore — emergency admin action.
 */
export async function suspendAllKeysInFirestore(): Promise<{
  suspended: number;
  failed: number;
}> {
  if (!db) return { suspended: 0, failed: 0 };

  try {
    const keys = await fetchAllKeysFromFirestore();
    let suspended = 0;
    let failed = 0;

    for (const key of keys) {
      if (key.status === "active" || key.status === "used") {
        const ok = await updateKeyStatusInFirestore(key.key, "suspended");
        if (ok) suspended++;
        else failed++;
      }
    }

    return { suspended, failed };
  } catch (err) {
    console.error("[Firebase] suspendAllKeysInFirestore failed:", err);
    return { suspended: 0, failed: 1 };
  }
}
