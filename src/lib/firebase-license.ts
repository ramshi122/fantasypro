/**
 * Firebase Firestore Integration — LICENSE ONLY (UNIFIED)
 * ========================================================
 *
 * SINGLE SOURCE OF TRUTH:
 * =======================
 * ONE Firestore document: `admin_data/keys`
 * Shape: { keys: LicenseKey[], updatedAt: serverTimestamp }
 *
 * ALL clients (Admin Web, Old APK, New APK, User APK, API routes)
 * read and write to this SAME document. No other paths.
 *
 * Real-time sync:
 *   - admin-realtime-sync.ts attaches onSnapshot to `admin_data/keys`
 *   - Any write here instantly notifies ALL admin panels
 *
 * Removed legacy paths:
 *   - license_keys/{keyStr} collection — REMOVED (was causing sync issues)
 *   - admin_generated_keys collection — REMOVED (was redundant)
 *
 * Firestore rules (must allow full read/write on admin_data):
 *   match /admin_data/{docId} {
 *     allow read, create, update, delete: if true;
 *   }
 */

import { db } from "./firebase";
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";
import type { KeyType, KeyStatus, LicenseKey } from "./admin-store";

// ============================================================
// SINGLE SOURCE OF TRUTH — one document, one array
// ============================================================
const COLL_ADMIN_DATA = "admin_data";
const DOC_KEYS = "keys";

export function initFirebase(_config?: string): boolean {
  return !!db;
}

export function isFirebaseReady(): boolean {
  return !!db;
}

/**
 * Normalize a key string — uppercase + trim.
 * Used for ALL reads and writes so casing never breaks a lookup.
 */
function normalizeKey(keyStr: string): string {
  return (keyStr || "").trim().toUpperCase();
}

/**
 * Read the ENTIRE keys array from `admin_data/keys`.
 * Returns empty array if doc doesn't exist or Firebase unavailable.
 */
export async function fetchAllKeysFromFirestore(): Promise<LicenseKey[]> {
  if (!db) {
    console.error("[LicenseFetch] ❌ Firebase db not initialized");
    return [];
  }
  try {
    const snap = await getDoc(doc(db, COLL_ADMIN_DATA, DOC_KEYS));
    if (!snap.exists()) {
      console.log("[LicenseFetch] admin_data/keys document does not exist yet");
      return [];
    }
    const data = snap.data() as Record<string, any>;
    const arr = Array.isArray(data.keys) ? data.keys : [];
    console.log("[LicenseFetch] ✅ Read admin_data/keys — " + arr.length + " keys");
    return arr as LicenseKey[];
  } catch (err: any) {
    console.error("[LicenseFetch] ❌ Firestore error:", err?.code || err?.message || err);
    return [];
  }
}

/**
 * Fetch a SINGLE license key from Firestore by key string.
 * Reads `admin_data/keys` document and scans the `keys[]` array.
 *
 * Returns null if:
 *   - Firebase not initialized
 *   - Key string is empty
 *   - Key not found in array
 *   - Firestore error
 */
export async function fetchKeyFromFirestore(keyStr: string): Promise<LicenseKey | null> {
  const cleanKey = normalizeKey(keyStr);
  console.log("[LicenseFetch] Searching key:", cleanKey);

  if (!db) {
    console.error("[LicenseFetch] ❌ Firebase db not initialized");
    return null;
  }

  if (!cleanKey) {
    console.error("[LicenseFetch] ❌ Empty key string after normalize");
    return null;
  }

  try {
    const allKeys = await fetchAllKeysFromFirestore();
    const match = allKeys.find((k: any) => normalizeKey(k?.key || "") === cleanKey);
    if (!match) {
      console.log("[LicenseFetch] ❌ Key not found in admin_data/keys array");
      return null;
    }
    console.log("[LicenseFetch] ✅ Key found:", match.key, "| Type:", match.type, "| Status:", match.status, "| Devices:", (match.deviceIds || []).length);
    return match as LicenseKey;
  } catch (err: any) {
    console.error("[LicenseFetch] ❌ Error scanning keys:", err?.code || err?.message || err);
    return null;
  }
}

/**
 * Write the ENTIRE keys array to `admin_data/keys`.
 * Used by admin-realtime-sync.ts and admin-store.ts bulk operations.
 *
 * After writing, immediately READS BACK to verify the write landed.
 */
export async function syncAllKeysToFirestore(keys: LicenseKey[]): Promise<boolean> {
  console.log("[LicenseSync] Writing " + keys.length + " keys to admin_data/keys...");

  if (!db) {
    console.error("[LicenseSync] ❌ Firebase db not initialized");
    return false;
  }

  try {
    const docRef = doc(db, COLL_ADMIN_DATA, DOC_KEYS);
    // Clean undefined fields + normalize keys
    const cleanKeys = keys.map((k) => ({
      ...k,
      key: normalizeKey(k.key),
      deviceIds: Array.isArray(k.deviceIds) ? k.deviceIds : [],
      verifications: typeof k.verifications === "number" ? k.verifications : 0,
      createdAt: typeof k.createdAt === "number" ? k.createdAt : Date.now(),
    }));
    await setDoc(docRef, {
      keys: cleanKeys,
      updatedAt: serverTimestamp(),
    });
    console.log("[LicenseSync] ✅ Wrote " + cleanKeys.length + " keys to admin_data/keys");

    // VERIFY-AFTER-WRITE: read back immediately
    const verifySnap = await getDoc(docRef);
    if (!verifySnap.exists()) {
      console.error("[LicenseSync] ❌ VERIFY FAILED — doc missing after write!");
      return false;
    }
    const verifyData = verifySnap.data() as Record<string, any>;
    const verifyCount = Array.isArray(verifyData.keys) ? verifyData.keys.length : 0;
    console.log("[LicenseSync] ✅ Verified — " + verifyCount + " keys now in Firestore");
    return true;
  } catch (err: any) {
    console.error("[LicenseSync] ❌ Firestore write error:", err?.code || err?.message || err);
    if (err?.code === "permission-denied") {
      console.error("[LicenseSync] ❌ PERMISSION DENIED — check Firestore rules for admin_data/{docId}");
    }
    return false;
  }
}

/**
 * Sync a SINGLE license key to Firestore.
 * Reads the current `admin_data/keys` array, merges/updates this key, writes back.
 *
 * This is the atomic per-key write function used by admin-store CRUD operations.
 *
 * After writing, immediately READS BACK to verify the write landed.
 */
export async function syncKeyToFirestore(key: LicenseKey): Promise<boolean> {
  const cleanKey = normalizeKey(key.key);
  console.log("[LicenseSync] Upserting single key:", cleanKey);

  if (!db) {
    console.error("[LicenseSync] ❌ Firebase db not initialized");
    return false;
  }

  try {
    const docRef = doc(db, COLL_ADMIN_DATA, DOC_KEYS);

    // Read current array
    const currentSnap = await getDoc(docRef);
    let currentKeys: LicenseKey[] = [];
    if (currentSnap.exists()) {
      const data = currentSnap.data() as Record<string, any>;
      currentKeys = Array.isArray(data.keys) ? data.keys : [];
    }

    // Merge: remove existing entry for this key, add updated one
    const cleanKeyObj = {
      ...key,
      key: cleanKey,
      deviceIds: Array.isArray(key.deviceIds) ? key.deviceIds : [],
      verifications: typeof key.verifications === "number" ? key.verifications : 0,
      createdAt: typeof key.createdAt === "number" ? key.createdAt : Date.now(),
    };
    const nextKeys = [cleanKeyObj, ...currentKeys.filter((k: any) => normalizeKey(k?.key || "") !== cleanKey)];

    await setDoc(docRef, {
      keys: nextKeys,
      updatedAt: serverTimestamp(),
    });
    console.log("[LicenseSync] ✅ Upserted key " + cleanKey + " (total " + nextKeys.length + " keys)");

    // VERIFY-AFTER-WRITE
    const verifySnap = await getDoc(docRef);
    if (!verifySnap.exists()) {
      console.error("[LicenseSync] ❌ VERIFY FAILED — doc missing after upsert!");
      return false;
    }
    const verifyData = verifySnap.data() as Record<string, any>;
    const verifyArr = Array.isArray(verifyData.keys) ? verifyData.keys : [];
    const verifyMatch = verifyArr.find((k: any) => normalizeKey(k?.key || "") === cleanKey);
    if (!verifyMatch) {
      console.error("[LicenseSync] ❌ VERIFY FAILED — key not in array after upsert!");
      return false;
    }
    console.log("[LicenseSync] ✅ Verified — key is in Firestore. Status:", verifyMatch.status);
    return true;
  } catch (err: any) {
    console.error("[LicenseSync] ❌ Upsert error:", err?.code || err?.message || err);
    if (err?.code === "permission-denied") {
      console.error("[LicenseSync] ❌ PERMISSION DENIED — check Firestore rules for admin_data/{docId}");
    }
    return false;
  }
}

/**
 * Update a SINGLE key's status in Firestore.
 * Reads array, merges status field, writes back.
 */
export async function updateKeyStatusInFirestore(
  keyStr: string,
  status: KeyStatus
): Promise<boolean> {
  return updateKeyFieldsInFirestore(keyStr, { status });
}

/**
 * Update a SINGLE key's fields in Firestore.
 * Reads `admin_data/keys` array, merges fields into matching key, writes back.
 */
export async function updateKeyFieldsInFirestore(
  keyStr: string,
  fields: Partial<LicenseKey>
): Promise<boolean> {
  const cleanKey = normalizeKey(keyStr);
  console.log("[LicenseSync] Updating fields for key:", cleanKey, "| Fields:", Object.keys(fields).join(","));

  if (!db) {
    console.error("[LicenseSync] ❌ Firebase db not initialized");
    return false;
  }

  try {
    const docRef = doc(db, COLL_ADMIN_DATA, DOC_KEYS);

    // Read current array
    const currentSnap = await getDoc(docRef);
    let currentKeys: LicenseKey[] = [];
    if (currentSnap.exists()) {
      const data = currentSnap.data() as Record<string, any>;
      currentKeys = Array.isArray(data.keys) ? data.keys : [];
    }

    // Find + merge
    let found = false;
    const nextKeys = currentKeys.map((k: any) => {
      if (normalizeKey(k?.key || "") === cleanKey) {
        found = true;
        return { ...k, ...fields, key: cleanKey };
      }
      return k;
    });

    if (!found) {
      console.error("[LicenseSync] ❌ Key not found in array — cannot update. Key:", cleanKey);
      return false;
    }

    await setDoc(docRef, {
      keys: nextKeys,
      updatedAt: serverTimestamp(),
    });
    console.log("[LicenseSync] ✅ Updated fields for key " + cleanKey);
    return true;
  } catch (err: any) {
    console.error("[LicenseSync] ❌ Update error:", err?.code || err?.message || err);
    return false;
  }
}

/**
 * Delete a SINGLE key from Firestore.
 * Reads `admin_data/keys` array, filters out the key, writes back.
 */
export async function deleteKeyFromFirestore(keyStr: string): Promise<boolean> {
  const cleanKey = normalizeKey(keyStr);
  console.log("[LicenseSync] Deleting key:", cleanKey);

  if (!db) {
    console.error("[LicenseSync] ❌ Firebase db not initialized");
    return false;
  }

  try {
    const docRef = doc(db, COLL_ADMIN_DATA, DOC_KEYS);

    // Read current array
    const currentSnap = await getDoc(docRef);
    let currentKeys: LicenseKey[] = [];
    if (currentSnap.exists()) {
      const data = currentSnap.data() as Record<string, any>;
      currentKeys = Array.isArray(data.keys) ? data.keys : [];
    }

    // Filter out the key
    const nextKeys = currentKeys.filter((k: any) => normalizeKey(k?.key || "") !== cleanKey);

    if (nextKeys.length === currentKeys.length) {
      console.log("[LicenseSync] Key was not in array — nothing to delete");
      return true;
    }

    await setDoc(docRef, {
      keys: nextKeys,
      updatedAt: serverTimestamp(),
    });
    console.log("[LicenseSync] ✅ Deleted key " + cleanKey + " (now " + nextKeys.length + " keys)");
    return true;
  } catch (err: any) {
    console.error("[LicenseSync] ❌ Delete error:", err?.code || err?.message || err);
    return false;
  }
}

/**
 * Check if a key already exists in Firestore (duplicate prevention).
 * Returns true if key exists, false if available.
 */
export async function checkKeyExistsInFirestore(keyStr: string): Promise<boolean> {
  const cleanKey = normalizeKey(keyStr);
  if (!db || !cleanKey) return false;
  try {
    const allKeys = await fetchAllKeysFromFirestore();
    return allKeys.some((k: any) => normalizeKey(k?.key || "") === cleanKey);
  } catch {
    return false;
  }
}

/**
 * TEST CONNECTION — diagnostic helper.
 * Writes a test key to admin_data/keys, reads it back, deletes it.
 * Returns a detailed report for the admin to see.
 */
export async function testFirestoreConnection(): Promise<{
  writeOk: boolean;
  readOk: boolean;
  deleteOk: boolean;
  message: string;
}> {
  console.log("[LicenseTest] Running connection test on admin_data/keys...");
  const testKey = "TEST-" + Date.now().toString(36).toUpperCase();
  const result = { writeOk: false, readOk: false, deleteOk: false, message: "" };

  if (!db) {
    result.message = "Firebase not initialized";
    return result;
  }

  // WRITE — upsert test key
  try {
    const ok = await syncKeyToFirestore({
      key: testKey,
      type: "trial",
      status: "active",
      createdAt: Date.now(),
      expiresAt: null,
      deviceIds: [],
      verifications: 0,
    });
    if (!ok) {
      result.message = "Write failed — see console for Firestore error";
      return result;
    }
    result.writeOk = true;
    console.log("[LicenseTest] ✅ Write OK");
  } catch (err: any) {
    result.message = "Write failed: " + (err?.code || err?.message || err);
    console.error("[LicenseTest] ❌ Write failed:", err);
    return result;
  }

  // READ — verify test key is in array
  try {
    const fetched = await fetchKeyFromFirestore(testKey);
    if (fetched) {
      result.readOk = true;
      console.log("[LicenseTest] ✅ Read OK");
    } else {
      result.message = "Read failed: key not found after write";
      console.error("[LicenseTest] ❌ Read: key missing");
      return result;
    }
  } catch (err: any) {
    result.message = "Read failed: " + (err?.code || err?.message || err);
    console.error("[LicenseTest] ❌ Read failed:", err);
    return result;
  }

  // DELETE — remove test key
  try {
    const ok = await deleteKeyFromFirestore(testKey);
    if (ok) {
      result.deleteOk = true;
      result.message = "✅ All checks passed — Firestore admin_data/keys is working. Real-time sync will work across all admin panels.";
      console.log("[LicenseTest] ✅ Delete OK — connection healthy");
    } else {
      result.message = "Delete failed — see console";
      console.error("[LicenseTest] ❌ Delete failed");
    }
  } catch (err: any) {
    result.message = "Delete failed: " + (err?.code || err?.message || err);
    console.error("[LicenseTest] ❌ Delete failed:", err);
  }

  return result;
}
