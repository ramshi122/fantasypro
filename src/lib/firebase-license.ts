/**
 * Firebase Firestore Integration — LICENSE ONLY
 * ==============================================
 * Minimal Firebase access layer for LICENSE KEY verification.
 *
 * Allowed operations (all ONE-SHOT, no real-time listeners):
 *   - initFirebase()                       — no-op (already done in firebase.ts)
 *   - fetchKeyFromFirestore(keyStr)        — single doc read by key string
 *   - syncKeyToFirestore(key)              — setDoc for ONE key (admin generates)
 *   - deleteKeyFromFirestore(keyStr)       — delete ONE key
 *   - updateKeyStatusInFirestore(keyStr,status) — update ONE key
 *
 * REMOVED (per FIREBASE-CLEANUP):
 *   - fetchAllKeysFromFirestore   (no collection downloads)
 *   - bulkSyncKeysToFirestore     (no bulk writes)
 *   - suspendAllKeysInFirestore   (no collection scans)
 *   - verifyKeyInFirestore        (verification lives in admin-store)
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
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import type { KeyType, KeyStatus, LicenseKey } from "./admin-store";

const COLLECTION = "license_keys";

/**
 * Initialize Firebase — no-op. Firebase is initialized at import time in
 * `firebase.ts`. Returns true if the db instance is ready.
 */
export function initFirebase(_config?: string): boolean {
  return !!db;
}

/**
 * Check if Firebase is ready (initialized + has db).
 */
export function isFirebaseReady(): boolean {
  return !!db;
}

/**
 * Fetch a SINGLE license key from Firestore by key string.
 * One-shot read of ONE document. No collection downloads.
 */
export async function fetchKeyFromFirestore(keyStr: string): Promise<LicenseKey | null> {
  if (!db || !keyStr) return null;
  try {
    const snap = await getDoc(doc(db, COLLECTION, keyStr));
    if (!snap.exists()) return null;
    const data = snap.data() as Record<string, any>;
    return {
      key: data.key || keyStr,
      type: (data.type as KeyType) || "trial",
      status: (data.status as KeyStatus) || "active",
      createdAt: typeof data.createdAt === "number" ? data.createdAt : Date.now(),
      expiresAt: data.expiresAt ?? null,
      deviceIds: Array.isArray(data.deviceIds) ? data.deviceIds : [],
      userName: data.userName,
      lastVerified: data.lastVerified,
      verifications: typeof data.verifications === "number" ? data.verifications : 0,
    };
  } catch (err) {
    console.error("[Firebase] fetchKeyFromFirestore failed:", err);
    return null;
  }
}

/**
 * Sync a SINGLE license key to Firestore (create or overwrite).
 * Used when admin generates a new key — saves to localStorage AND to Firestore
 * so that key is verifiable from any device via `fetchKeyFromFirestore`.
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
 * Update a SINGLE key's status in Firestore (suspend, expire, reactivate).
 * One-shot update of ONE document.
 */
export async function updateKeyStatusInFirestore(
  keyStr: string,
  status: KeyStatus
): Promise<boolean> {
  if (!db) return false;
  try {
    await updateDoc(doc(db, COLLECTION, keyStr), {
      status,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.error("[Firebase] updateKeyStatusInFirestore failed:", err);
    return false;
  }
}

/**
 * Update a SINGLE key's fields in Firestore (used for verification state —
 * deviceIds, lastVerified, verifications). One-shot update of ONE document.
 */
export async function updateKeyFieldsInFirestore(
  keyStr: string,
  fields: Partial<LicenseKey>
): Promise<boolean> {
  if (!db) return false;
  try {
    await updateDoc(doc(db, COLLECTION, keyStr), {
      ...fields,
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.error("[Firebase] updateKeyFieldsInFirestore failed:", err);
    return false;
  }
}

/**
 * Delete a SINGLE key from Firestore.
 * One-shot delete of ONE document.
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
