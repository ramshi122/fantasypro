/**
 * Firebase Firestore Integration — LICENSE ONLY
 * ==============================================
 *
 * STORAGE MODEL (matches user's ACTUAL Firestore rules):
 * =====================================================
 * Collection: `license_keys/{keyStr}` — ONE DOCUMENT PER KEY
 *
 * User's actual Firestore rules:
 *   match /license_keys/{keyId} {
 *     allow read, create, update, delete: if true;
 *   }
 *
 * This is the ONLY collection used. No admin_data, no arrays.
 * Each key is its own document — atomic writes, no race conditions.
 *
 * Real-time sync:
 *   - admin-realtime-sync.ts attaches onSnapshot to the COLLECTION
 *     (not a single doc) — receives updates for ANY key change
 *   - When Admin A generates/suspends/deletes a key → Firestore
 *     → ALL other admin panels receive the update INSTANTLY
 *
 * Document shape (license_keys/{keyStr}):
 *   {
 *     key: string,           // "CRICB-ABCD-EFGH-IJKL" (uppercase)
 *     type: KeyType,         // "trial" | "monthly" | "elite" | ...
 *     status: KeyStatus,     // "active" | "used" | "suspended" | "expired"
 *     createdAt: number,     // epoch ms
 *     expiresAt: number|null,// epoch ms or null for lifetime
 *     deviceIds: string[],   // bound device IDs (1 KEY = 1 DEVICE)
 *     userName?: string,
 *     lastVerified?: number,
 *     verifications: number,
 *     updatedAt: serverTimestamp
 *   }
 *
 * All keys normalized to UPPERCASE before read/write (case-insensitive).
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

// ============================================================
// SINGLE COLLECTION — one document per key
// ============================================================
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
 * Reads `license_keys/{keyStr}` document (single-doc read, fast).
 *
 * Returns null if:
 *   - Firebase not initialized
 *   - Key string is empty
 *   - Document does not exist
 *   - Firestore error (permission-denied, network, etc.)
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
 * Remove undefined fields from any object — Firestore REJECTS undefined values.
 * Recursively cleans nested objects + arrays.
 * This is the #1 cause of "Sync Firebase failed" errors.
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
 * Sync a SINGLE license key to Firestore.
 * Writes to `license_keys/{keyStr}` document (atomic, no race conditions).
 *
 * After writing, immediately READS BACK the document to verify the write landed.
 * Returns true ONLY if the read-back succeeds.
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
    // Build payload — replace null/undefined with explicit values that Firestore accepts.
    // Firestore REJECTS undefined fields ("Unsupported field value: undefined").
    const rawPayload: Record<string, any> = {
      key: cleanKey,
      type: key.type || "trial",
      status: key.status || "active",
      createdAt: typeof key.createdAt === "number" ? key.createdAt : Date.now(),
      expiresAt: key.expiresAt ?? null,  // null is allowed (lifetime keys)
      deviceIds: Array.isArray(key.deviceIds) ? key.deviceIds : [],
      verifications: typeof key.verifications === "number" ? key.verifications : 0,
      // Optional fields — only include if defined (Firestore rejects undefined)
      ...(key.userName ? { userName: key.userName } : {}),
      ...(key.lastVerified ? { lastVerified: key.lastVerified } : {}),
      updatedAt: serverTimestamp(),
    };
    // Final safety: strip any remaining undefined values
    const payload = cleanUndefined(rawPayload);
    console.log("[LicenseSync] Writing to license_keys/" + cleanKey + "...", JSON.stringify(Object.keys(payload)));
    await setDoc(docRef, payload);
    console.log("[LicenseSync] ✅ setDoc completed for license_keys/" + cleanKey);

    // VERIFY-AFTER-WRITE: read back immediately to confirm the write landed.
    console.log("[LicenseSync] Verifying write — reading back license_keys/" + cleanKey + "...");
    const verifySnap = await getDoc(docRef);
    if (!verifySnap.exists()) {
      console.error("[LicenseSync] ❌ VERIFY FAILED — document does not exist after write!");
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
    if (err?.message?.includes("undefined")) {
      console.error("[LicenseSync] ❌ UNDEFINED FIELD error — cleanUndefined() should have caught this. Key object:", JSON.stringify(key));
    }
    return false;
  }
}

/**
 * Sync ALL keys to Firestore (bulk operation).
 * Writes each key as its own document (atomic, parallel).
 * Used by "Sync Firebase" button in admin panel.
 *
 * Returns true ONLY if ALL keys synced successfully.
 * Logs detailed per-key success/failure counts to console.
 */
export async function syncAllKeysToFirestore(keys: LicenseKey[]): Promise<boolean> {
  console.log("[LicenseSync] Bulk syncing " + keys.length + " keys to license_keys/...");
  if (!db) {
    console.error("[LicenseSync] ❌ Firebase db not initialized");
    return false;
  }
  if (keys.length === 0) {
    console.log("[LicenseSync] No keys to sync");
    return true;
  }
  try {
    const results = await Promise.all(keys.map((k) => syncKeyToFirestore(k)));
    const okCount = results.filter(Boolean).length;
    const failCount = keys.length - okCount;
    if (failCount === 0) {
      console.log("[LicenseSync] ✅ Bulk write: ALL " + okCount + "/" + keys.length + " keys written successfully");
      return true;
    } else {
      console.error("[LicenseSync] ⚠️ Bulk write: " + okCount + "/" + keys.length + " keys succeeded. " + failCount + " FAILED — see errors above.");
      // Log which keys failed
      keys.forEach((k, i) => {
        if (!results[i]) {
          console.error("[LicenseSync] ❌ Failed key #" + (i + 1) + ": " + k.key + " | Type: " + k.type + " | Status: " + k.status);
        }
      });
      return false;
    }
  } catch (err: any) {
    console.error("[LicenseSync] ❌ Bulk write error:", err?.code || err?.message || err);
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
  const cleanKey = normalizeKey(keyStr);
  console.log("[LicenseSync] Updating status for key:", cleanKey, "→", status);
  if (!db) return false;
  try {
    await updateDoc(doc(db, COLL_KEYS, cleanKey), {
      status,
      updatedAt: serverTimestamp(),
    });
    console.log("[LicenseSync] ✅ Status updated for license_keys/" + cleanKey);
    return true;
  } catch (err: any) {
    console.error("[LicenseSync] ❌ updateDoc failed:", err?.code || err?.message);
    // Fallback: if doc doesn't exist, create it with merge
    try {
      await setDoc(doc(db, COLL_KEYS, cleanKey), {
        status,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      console.log("[LicenseSync] ✅ setDoc(merge) fallback succeeded");
      return true;
    } catch (err2: any) {
      console.error("[LicenseSync] ❌ setDoc fallback failed:", err2?.code || err2?.message);
      return false;
    }
  }
}

/**
 * Update a SINGLE key's fields in Firestore.
 * Updates `license_keys/{keyStr}` document.
 * Falls back to setDoc(merge:true) if document doesn't exist yet.
 * Strips undefined fields (Firestore rejects undefined).
 */
export async function updateKeyFieldsInFirestore(
  keyStr: string,
  fields: Partial<LicenseKey>
): Promise<boolean> {
  const cleanKey = normalizeKey(keyStr);
  console.log("[LicenseSync] Updating fields for key:", cleanKey, "| Fields:", Object.keys(fields).join(","));
  if (!db) return false;
  try {
    const docRef = doc(db, COLL_KEYS, cleanKey);
    // Strip undefined fields — Firestore REJECTS undefined values.
    const cleanFields = cleanUndefined({ ...fields });
    try {
      await updateDoc(docRef, {
        ...cleanFields,
        updatedAt: serverTimestamp(),
      });
      console.log("[LicenseSync] ✅ updateDoc completed for license_keys/" + cleanKey);
      return true;
    } catch (updateErr: any) {
      // updateDoc fails if doc doesn't exist. Fall back to setDoc(merge:true).
      console.log("[LicenseSync] updateDoc failed (" + (updateErr?.code || updateErr?.message) + ") — trying setDoc merge...");
      await setDoc(docRef, {
        ...cleanFields,
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
  if (!db) return false;
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
 * Check if a key already exists in Firestore (duplicate prevention).
 * Returns true if key exists, false if available.
 */
export async function checkKeyExistsInFirestore(keyStr: string): Promise<boolean> {
  const cleanKey = normalizeKey(keyStr);
  if (!db || !cleanKey) return false;
  try {
    const snap = await getDoc(doc(db, COLL_KEYS, cleanKey));
    return snap.exists();
  } catch {
    return false;
  }
}

/**
 * TEST CONNECTION — diagnostic helper.
 * Writes a test document to license_keys/{TEST-xxx}, reads it back, deletes it.
 * Returns a detailed report for the admin to see.
 */
export async function testFirestoreConnection(): Promise<{
  writeOk: boolean;
  readOk: boolean;
  deleteOk: boolean;
  message: string;
}> {
  console.log("[LicenseTest] Running connection test on license_keys/...");
  const testKey = "TEST-" + Date.now().toString(36).toUpperCase();
  const result = { writeOk: false, readOk: false, deleteOk: false, message: "" };

  if (!db) {
    result.message = "Firebase not initialized";
    return result;
  }

  // WRITE
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
      result.message = "Write failed — check console for Firestore error (likely PERMISSION-DENIED. Verify Firestore rules allow license_keys/{keyId} create/update/Delete)";
      return result;
    }
    result.writeOk = true;
    console.log("[LicenseTest] ✅ Write OK");
  } catch (err: any) {
    result.message = "Write failed: " + (err?.code || err?.message || err);
    console.error("[LicenseTest] ❌ Write failed:", err);
    return result;
  }

  // READ
  try {
    const fetched = await fetchKeyFromFirestore(testKey);
    if (fetched) {
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
    const ok = await deleteKeyFromFirestore(testKey);
    if (ok) {
      result.deleteOk = true;
      result.message = "✅ All checks passed — Firestore license_keys/ is working. Keys will sync to other phones.";
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
