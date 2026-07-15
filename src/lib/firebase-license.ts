/**
 * Firebase Firestore Integration — LICENSE ONLY
 * ==============================================
 *
 * SINGLE-PATH KEY STORAGE (matches actual Firestore rules):
 * ========================================================
 * Collection: `license_keys/{keyStr}` — one document per key.
 *
 * Firestore rules (matches user's actual Firebase project):
 *   match /license_keys/{keyId} {
 *     allow read, create, update, delete: if true;
 *   }
 *
 * All keys are normalized to UPPERCASE before read/write so the
 * admin's "CRICB-ABCD-EFGH-IJKL" matches the user typing
 * "cricb-abcd-efgh-ijkl" or " CRICB-ABCD-EFGH-IJKL ".
 *
 * After every write, we immediately READ BACK the document to
 * confirm it landed in Firestore. This catches silent write
 * failures (network/firestore rules issues) that would otherwise
 * leave the key invisible to other phones.
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

const COLL_KEYS = "license_keys";

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
 * Fetch a SINGLE license key from Firestore by key string.
 * Reads `license_keys/{keyStr}` document.
 *
 * Returns null if:
 *   - Firebase not initialized
 *   - Key string is empty
 *   - Document does not exist
 *   - Firestore error (permission denied, network, etc.)
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
    console.log("[LicenseFetch] Reading license_keys/" + cleanKey + "...");
    const snap = await getDoc(doc(db, COLL_KEYS, cleanKey));
    if (!snap.exists()) {
      console.log("[LicenseFetch] ❌ Document does not exist at license_keys/" + cleanKey);
      return null;
    }
    const data = snap.data() as Record<string, any>;
    console.log("[LicenseFetch] ✅ Key found:", data.key, "| Type:", data.type, "| Status:", data.status, "| Devices:", (data.deviceIds || []).length);
    return {
      key: data.key || cleanKey,
      type: (data.type as KeyType) || "trial",
      status: (data.status as KeyStatus) || "active",
      createdAt: typeof data.createdAt === "number" ? data.createdAt : Date.now(),
      expiresAt: data.expiresAt ?? null,
      deviceIds: Array.isArray(data.deviceIds) ? data.deviceIds : [],
      userName: data.userName,
      lastVerified: data.lastVerified,
      verifications: typeof data.verifications === "number" ? data.verifications : 0,
    };
  } catch (err: any) {
    console.error("[LicenseFetch] ❌ Firestore error:", err?.code || err?.message || err);
    if (err?.code === "permission-denied") {
      console.error("[LicenseFetch] ❌ PERMISSION DENIED — check Firestore rules for license_keys/{keyId}");
    }
    return null;
  }
}

/**
 * Sync a SINGLE license key to Firestore.
 * Writes to `license_keys/{keyStr}` document.
 *
 * After writing, immediately READS BACK the document to verify the
 * write actually landed. Returns true ONLY if the read-back succeeds.
 */
export async function syncKeyToFirestore(key: LicenseKey): Promise<boolean> {
  const cleanKey = normalizeKey(key.key);
  console.log("[LicenseSync] Syncing key:", cleanKey);

  if (!db) {
    console.error("[LicenseSync] ❌ Firebase db not initialized");
    return false;
  }

  try {
    const docRef = doc(db, COLL_KEYS, cleanKey);
    const payload = {
      ...key,
      key: cleanKey,
      updatedAt: serverTimestamp(),
    };
    console.log("[LicenseSync] Writing to license_keys/" + cleanKey + "...");
    await setDoc(docRef, payload);
    console.log("[LicenseSync] ✅ setDoc completed for license_keys/" + cleanKey);

    // VERIFY-AFTER-WRITE: read back immediately to confirm the write landed.
    // This catches silent failures (e.g. offline cache, rules mismatch, etc.)
    console.log("[LicenseSync] Verifying write — reading back license_keys/" + cleanKey + "...");
    const verifySnap = await getDoc(docRef);
    if (!verifySnap.exists()) {
      console.error("[LicenseSync] ❌ VERIFY FAILED — document does not exist after write!");
      console.error("[LicenseSync] ❌ Possible causes: offline mode, Firestore cache, rules issue");
      return false;
    }
    const verifyData = verifySnap.data() as Record<string, any>;
    console.log("[LicenseSync] ✅ Verified — key is in Firestore. Type:", verifyData.type, "| Status:", verifyData.status);
    return true;
  } catch (err: any) {
    console.error("[LicenseSync] ❌ Firestore write error:", err?.code || err?.message || err);
    if (err?.code === "permission-denied") {
      console.error("[LicenseSync] ❌ PERMISSION DENIED — check Firestore rules for license_keys/{keyId}");
    }
    return false;
  }
}

/**
 * Update a SINGLE key's status in Firestore.
 * Updates `license_keys/{keyStr}` document.
 */
export async function updateKeyStatusInFirestore(
  keyStr: string,
  status: KeyStatus
): Promise<boolean> {
  return updateKeyFieldsInFirestore(keyStr, { status });
}

/**
 * Update a SINGLE key's fields in Firestore.
 * Updates `license_keys/{keyStr}` document.
 * Falls back to setDoc(merge:true) if document doesn't exist yet.
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
    const docRef = doc(db, COLL_KEYS, cleanKey);
    try {
      await updateDoc(docRef, {
        ...fields,
        updatedAt: serverTimestamp(),
      });
      console.log("[LicenseSync] ✅ updateDoc completed for license_keys/" + cleanKey);
      return true;
    } catch (updateErr: any) {
      // updateDoc fails if doc doesn't exist. Fall back to setDoc(merge:true).
      console.log("[LicenseSync] updateDoc failed (" + (updateErr?.code || updateErr?.message) + ") — trying setDoc merge...");
      await setDoc(docRef, {
        ...fields,
        key: cleanKey,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      console.log("[LicenseSync] ✅ setDoc(merge) completed for license_keys/" + cleanKey);
      return true;
    }
  } catch (err: any) {
    console.error("[LicenseSync] ❌ Firestore update error:", err?.code || err?.message || err);
    if (err?.code === "permission-denied") {
      console.error("[LicenseSync] ❌ PERMISSION DENIED — check Firestore rules for license_keys/{keyId}");
    }
    return false;
  }
}

/**
 * Delete a SINGLE key from Firestore.
 * Deletes `license_keys/{keyStr}` document.
 */
export async function deleteKeyFromFirestore(keyStr: string): Promise<boolean> {
  const cleanKey = normalizeKey(keyStr);
  console.log("[LicenseSync] Deleting key:", cleanKey);

  if (!db) {
    console.error("[LicenseSync] ❌ Firebase db not initialized");
    return false;
  }

  try {
    await deleteDoc(doc(db, COLL_KEYS, cleanKey));
    console.log("[LicenseSync] ✅ Deleted license_keys/" + cleanKey);
    return true;
  } catch (err: any) {
    console.error("[LicenseSync] ❌ Firestore delete error:", err?.code || err?.message || err);
    if (err?.code === "permission-denied") {
      console.error("[LicenseSync] ❌ PERMISSION DENIED — check Firestore rules for license_keys/{keyId}");
    }
    return false;
  }
}

/**
 * TEST CONNECTION — diagnostic helper.
 * Writes a test document, reads it back, deletes it.
 * Returns a detailed report for the admin to see.
 */
export async function testFirestoreConnection(): Promise<{
  writeOk: boolean;
  readOk: boolean;
  deleteOk: boolean;
  message: string;
}> {
  console.log("[LicenseTest] Running connection test...");
  const testKey = "TEST-" + Date.now().toString(36).toUpperCase();
  const result = { writeOk: false, readOk: false, deleteOk: false, message: "" };

  if (!db) {
    result.message = "Firebase not initialized";
    return result;
  }

  // WRITE
  try {
    await setDoc(doc(db, COLL_KEYS, testKey), {
      key: testKey,
      type: "trial",
      status: "active",
      createdAt: Date.now(),
      _test: true,
    });
    result.writeOk = true;
    console.log("[LicenseTest] ✅ Write OK");
  } catch (err: any) {
    result.message = "Write failed: " + (err?.code || err?.message || err);
    console.error("[LicenseTest] ❌ Write failed:", err);
    return result;
  }

  // READ
  try {
    const snap = await getDoc(doc(db, COLL_KEYS, testKey));
    if (snap.exists()) {
      result.readOk = true;
      console.log("[LicenseTest] ✅ Read OK");
    } else {
      result.message = "Read failed: document does not exist after write";
      console.error("[LicenseTest] ❌ Read: doc missing");
      return result;
    }
  } catch (err: any) {
    result.message = "Read failed: " + (err?.code || err?.message || err);
    console.error("[LicenseTest] ❌ Read failed:", err);
    return result;
  }

  // DELETE
  try {
    await deleteDoc(doc(db, COLL_KEYS, testKey));
    result.deleteOk = true;
    result.message = "✅ All checks passed — Firestore is working correctly";
    console.log("[LicenseTest] ✅ Delete OK — connection healthy");
  } catch (err: any) {
    result.message = "Delete failed: " + (err?.code || err?.message || err);
    console.error("[LicenseTest] ❌ Delete failed:", err);
  }

  return result;
}
