/**
 * Firebase Firestore Integration — LICENSE ONLY
 * ==============================================
 * 
 * Firestore collection: `license_keys` (CONFIRMED EXISTS + READABLE)
 * Document ID: license key string (e.g. "CRICB-ABCD-EFGH-IJKL")
 * Fields: key, type, status, createdAt, expiresAt, deviceIds[], userName, verifications
 * 
 * This collection is publicly readable (allow read: if true in Firestore rules).
 * Admin panel writes to it when generating keys (allow create/update/delete: if true).
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

export function initFirebase(_config?: string): boolean {
  return !!db;
}

export function isFirebaseReady(): boolean {
  return !!db;
}

/**
 * Fetch a SINGLE license key from Firestore by key string.
 * Reads from license_keys/{keyStr} document.
 */
export async function fetchKeyFromFirestore(keyStr: string): Promise<LicenseKey | null> {
  console.log("[LicenseFetch] Searching key:", keyStr);
  
  if (!db) {
    console.error("[LicenseFetch] ❌ Firebase db not initialized");
    return null;
  }
  
  if (!keyStr) {
    console.error("[LicenseFetch] ❌ Empty key string");
    return null;
  }

  try {
    console.log("[LicenseFetch] Reading license_keys/" + keyStr + "...");
    
    const snap = await getDoc(doc(db, COLLECTION, keyStr));
    
    if (!snap.exists()) {
      console.log("[LicenseFetch] ❌ Key not found in license_keys collection");
      return null;
    }
    
    const data = snap.data() as Record<string, any>;
    console.log("[LicenseFetch] ✅ Key found:", data.key, "| Type:", data.type, "| Status:", data.status);
    
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
    console.error("[LicenseFetch] ❌ Error:", err);
    return null;
  }
}

/**
 * Sync a SINGLE license key to Firestore (create or overwrite).
 */
export async function syncKeyToFirestore(key: LicenseKey): Promise<boolean> {
  console.log("[LicenseSync] Syncing key:", key.key);
  
  if (!db) return false;

  try {
    await setDoc(doc(db, COLLECTION, key.key), {
      ...key,
      updatedAt: serverTimestamp(),
    });
    console.log("[LicenseSync] ✅ Key written to license_keys/" + key.key);
    return true;
  } catch (err) {
    console.error("[LicenseSync] ❌ Failed:", err);
    return false;
  }
}

/**
 * Update a SINGLE key's status in Firestore.
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
    console.error("[LicenseSync] updateKeyStatus failed:", err);
    return false;
  }
}

/**
 * Update a SINGLE key's fields in Firestore.
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
    console.error("[LicenseSync] updateKeyFields failed:", err);
    return false;
  }
}

/**
 * Delete a SINGLE key from Firestore.
 */
export async function deleteKeyFromFirestore(keyStr: string): Promise<boolean> {
  if (!db) return false;
  try {
    await deleteDoc(doc(db, COLLECTION, keyStr));
    return true;
  } catch (err) {
    console.error("[LicenseSync] deleteKey failed:", err);
    return false;
  }
}
