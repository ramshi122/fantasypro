/**
 * Firebase Firestore Integration — LICENSE ONLY (FIXED)
 * ======================================================
 * 
 * FIX: The actual Firestore database structure is:
 *   admin_data (collection)
 *     └── keys (document)
 *          └── keys (array of LicenseKey objects)
 * 
 * NOT a separate `license_keys` collection. All key data is stored
 * as an array inside admin_data/keys document.
 * 
 * This file now reads/writes from admin_data/keys instead of
 * the non-existent license_keys collection.
 * 
 * Allowed operations (all ONE-SHOT, no real-time listeners):
 *   - fetchKeyFromFirestore(keyStr)        — read admin_data/keys, scan array
 *   - syncKeyToFirestore(key)              — update admin_data/keys array
 *   - updateKeyStatusInFirestore(keyStr, status) — update key in array
 *   - updateKeyFieldsInFirestore(keyStr, fields) — update key fields in array
 *   - deleteKeyFromFirestore(keyStr)       — remove key from array
 */

import { db } from "./firebase";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import type { KeyType, KeyStatus, LicenseKey } from "./admin-store";

// The ACTUAL Firestore path where keys are stored
const ADMIN_DATA_COLLECTION = "admin_data";
const DOC_KEYS = "keys";

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
 * Fetch a SINGLE license key from Firestore.
 * Reads admin_data/keys document, scans the keys array for a match.
 * 
 * Debug logs added for every step.
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
    console.log("[LicenseFetch] Opening Firestore...");
    console.log("[LicenseFetch] Reading admin_data/keys...");
    
    const snap = await getDoc(doc(db, ADMIN_DATA_COLLECTION, DOC_KEYS));
    
    if (!snap.exists()) {
      console.log("[LicenseFetch] ❌ admin_data/keys document does NOT exist");
      return null;
    }
    
    const data = snap.data();
    const keysArray = data.keys as LicenseKey[] | undefined;
    
    if (!Array.isArray(keysArray)) {
      console.log("[LicenseFetch] ❌ 'keys' field is not an array. Type:", typeof keysArray);
      return null;
    }
    
    console.log("[LicenseFetch] ✅ Document found. Keys array length:", keysArray.length);
    console.log("[LicenseFetch] Comparing entered key:", keyStr);
    
    // Search for matching key (case-insensitive)
    const found = keysArray.find((k) => {
      const kKey = String(k.key || "").toUpperCase();
      return kKey === keyStr.toUpperCase();
    });
    
    if (!found) {
      console.log("[LicenseFetch] ❌ Key not found in array. Available keys (first 5):", 
        keysArray.slice(0, 5).map(k => k.key));
      return null;
    }
    
    console.log("[LicenseFetch] ✅ Matching key found:", found.key, "| Type:", found.type, "| Status:", found.status);
    
    return {
      key: found.key || keyStr,
      type: (found.type as KeyType) || "trial",
      status: (found.status as KeyStatus) || "active",
      createdAt: typeof found.createdAt === "number" ? found.createdAt : Date.now(),
      expiresAt: found.expiresAt ?? null,
      deviceIds: Array.isArray(found.deviceIds) ? found.deviceIds : [],
      userName: found.userName,
      lastVerified: found.lastVerified,
      verifications: typeof found.verifications === "number" ? found.verifications : 0,
    };
  } catch (err) {
    console.error("[LicenseFetch] ❌ Error reading admin_data/keys:", err);
    return null;
  }
}

/**
 * Sync a SINGLE license key to Firestore.
 * Reads admin_data/keys, updates or appends the key in the array, writes back.
 * 
 * Used when admin generates a new key.
 */
export async function syncKeyToFirestore(key: LicenseKey): Promise<boolean> {
  console.log("[LicenseSync] Syncing key to Firestore:", key.key);
  
  if (!db) {
    console.error("[LicenseSync] ❌ Firebase db not initialized");
    return false;
  }

  try {
    // Read current keys array
    const snap = await getDoc(doc(db, ADMIN_DATA_COLLECTION, DOC_KEYS));
    let keysArray: LicenseKey[] = [];
    
    if (snap.exists()) {
      const data = snap.data();
      keysArray = Array.isArray(data.keys) ? data.keys : [];
    }
    
    console.log("[LicenseSync] Current keys in array:", keysArray.length);
    
    // Find if key already exists (update) or is new (append)
    const existingIdx = keysArray.findIndex((k) => 
      String(k.key || "").toUpperCase() === String(key.key || "").toUpperCase()
    );
    
    if (existingIdx >= 0) {
      console.log("[LicenseSync] Key exists at index", existingIdx, "— updating");
      keysArray[existingIdx] = { ...key };
    } else {
      console.log("[LicenseSync] New key — appending to array");
      keysArray.push({ ...key });
    }
    
    // Write back the full array
    await setDoc(doc(db, ADMIN_DATA_COLLECTION, DOC_KEYS), {
      keys: keysArray,
      updatedAt: serverTimestamp(),
    });
    
    console.log("[LicenseSync] ✅ Key synced. Total keys in array:", keysArray.length);
    return true;
  } catch (err) {
    console.error("[LicenseSync] ❌ Failed to sync key:", err);
    return false;
  }
}

/**
 * Update a SINGLE key's status in Firestore (suspend, expire, reactivate).
 * Reads admin_data/keys, finds the key, updates its status, writes back.
 */
export async function updateKeyStatusInFirestore(
  keyStr: string,
  status: KeyStatus
): Promise<boolean> {
  console.log("[LicenseSync] Updating key status:", keyStr, "→", status);
  
  if (!db) return false;

  try {
    const snap = await getDoc(doc(db, ADMIN_DATA_COLLECTION, DOC_KEYS));
    if (!snap.exists()) return false;
    
    const keysArray = snap.data().keys as LicenseKey[];
    if (!Array.isArray(keysArray)) return false;
    
    const idx = keysArray.findIndex((k) => 
      String(k.key || "").toUpperCase() === keyStr.toUpperCase()
    );
    
    if (idx < 0) {
      console.log("[LicenseSync] Key not found for status update");
      return false;
    }
    
    keysArray[idx].status = status;
    
    await setDoc(doc(db, ADMIN_DATA_COLLECTION, DOC_KEYS), {
      keys: keysArray,
      updatedAt: serverTimestamp(),
    });
    
    console.log("[LicenseSync] ✅ Status updated");
    return true;
  } catch (err) {
    console.error("[LicenseSync] ❌ Failed to update status:", err);
    return false;
  }
}

/**
 * Update a SINGLE key's fields in Firestore (deviceIds, lastVerified, etc).
 * Reads admin_data/keys, finds the key, merges fields, writes back.
 */
export async function updateKeyFieldsInFirestore(
  keyStr: string,
  fields: Partial<LicenseKey>
): Promise<boolean> {
  console.log("[LicenseSync] Updating key fields:", keyStr, JSON.stringify(fields));
  
  if (!db) return false;

  try {
    const snap = await getDoc(doc(db, ADMIN_DATA_COLLECTION, DOC_KEYS));
    if (!snap.exists()) return false;
    
    const keysArray = snap.data().keys as LicenseKey[];
    if (!Array.isArray(keysArray)) return false;
    
    const idx = keysArray.findIndex((k) => 
      String(k.key || "").toUpperCase() === keyStr.toUpperCase()
    );
    
    if (idx < 0) {
      console.log("[LicenseSync] Key not found for field update");
      return false;
    }
    
    keysArray[idx] = { ...keysArray[idx], ...fields };
    
    await setDoc(doc(db, ADMIN_DATA_COLLECTION, DOC_KEYS), {
      keys: keysArray,
      updatedAt: serverTimestamp(),
    });
    
    console.log("[LicenseSync] ✅ Fields updated");
    return true;
  } catch (err) {
    console.error("[LicenseSync] ❌ Failed to update fields:", err);
    return false;
  }
}

/**
 * Delete a SINGLE key from Firestore.
 * Reads admin_data/keys, removes the key from array, writes back.
 */
export async function deleteKeyFromFirestore(keyStr: string): Promise<boolean> {
  console.log("[LicenseSync] Deleting key:", keyStr);
  
  if (!db) return false;

  try {
    const snap = await getDoc(doc(db, ADMIN_DATA_COLLECTION, DOC_KEYS));
    if (!snap.exists()) return false;
    
    const keysArray = snap.data().keys as LicenseKey[];
    if (!Array.isArray(keysArray)) return false;
    
    const before = keysArray.length;
    const filtered = keysArray.filter((k) => 
      String(k.key || "").toUpperCase() !== keyStr.toUpperCase()
    );
    
    if (filtered.length === before) {
      console.log("[LicenseSync] Key not found for deletion");
      return false;
    }
    
    await setDoc(doc(db, ADMIN_DATA_COLLECTION, DOC_KEYS), {
      keys: filtered,
      updatedAt: serverTimestamp(),
    });
    
    console.log("[LicenseSync] ✅ Key deleted. Remaining:", filtered.length);
    return true;
  } catch (err) {
    console.error("[LicenseSync] ❌ Failed to delete key:", err);
    return false;
  }
}
