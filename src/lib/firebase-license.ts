/**
 * Firebase Firestore Integration
 * ================================
 * Handles license key storage in Firebase Firestore for cross-device sync.
 *
 * Uses the hardcoded Firebase config from src/lib/firebase.ts
 * (project: revofixer-81a1c)
 *
 * Firestore collection: `license_keys`
 * Document ID: license key string (e.g. "CRICB-ABCD-EFGH-IJKL")
 * Fields: key, type, status, createdAt, expiresAt, deviceIds[], userName, verifications
 */

import { db } from "./firebase";
import {
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
} from "firebase/firestore";
import type { KeyType, KeyStatus, LicenseKey } from "./admin-store";

let initialized = db !== undefined;
let dbInstance = db;

const COLLECTION = "license_keys";

/**
 * Initialize Firebase — already done in firebase.ts, this is a no-op for compatibility.
 * Returns true if Firebase is ready.
 */
export function initFirebase(_config?: string): boolean {
  if (initialized && dbInstance) return true;
  // Firebase is initialized at import time in firebase.ts
  initialized = dbInstance !== undefined;
  return initialized;
}

/**
 * Check if Firebase is ready (initialized + has db).
 */
export function isFirebaseReady(): boolean {
  return dbInstance !== undefined && dbInstance !== null;
}

/**
 * Sync a license key to Firestore.
 * Creates or updates the document.
 */
export async function syncKeyToFirestore(key: LicenseKey): Promise<boolean> {
  if (!dbInstance) return false;
  try {
    await setDoc(doc(dbInstance, COLLECTION, key.key), {
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
  if (!dbInstance) return null;
  try {
    const snap = await getDoc(doc(dbInstance, COLLECTION, keyStr));
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
  if (!dbInstance) return [];
  try {
    const snap = await getDocs(collection(dbInstance, COLLECTION));
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
  if (!dbInstance) return false;
  try {
    await updateDoc(doc(dbInstance, COLLECTION, keyStr), { status, updatedAt: serverTimestamp() });
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
  if (!dbInstance) return false;
  try {
    await deleteDoc(doc(dbInstance, COLLECTION, keyStr));
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
  if (!dbInstance) {
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

    // Device binding check — STRICT 1 KEY = 1 DEVICE
    if (key.deviceIds.length >= 1 && !key.deviceIds.includes(deviceId)) {
      return { valid: false, message: "This key is already activated on another device. Each key can only be used on 1 device." };
    }

    // Success — update key in Firestore
    const updatedDeviceIds = key.deviceIds.includes(deviceId)
      ? key.deviceIds
      : [...key.deviceIds, deviceId];

    await updateDoc(doc(dbInstance, COLLECTION, keyStr), {
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
  if (!dbInstance) return { synced: 0, failed: keys.length };

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
  if (!dbInstance) return { suspended: 0, failed: 0 };

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

