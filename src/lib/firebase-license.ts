/**
 * Firebase Firestore Integration — LICENSE ONLY
 * ==============================================
 *
 * DUAL-PATH KEY STORAGE (CRITICAL):
 * =================================
 * Path 1 (PRIMARY): `license_keys/{keyStr}` — one document per key
 *   - Firestore rules ALLOW client reads + writes here.
 *   - Admin APK writes here on key generation.
 *   - User APK reads here on activation.
 *
 * Path 2 (FALLBACK): `admin_data/keys` — single doc with `keys` array
 *   - Holds the FULL list of all keys (mirror of admin local store).
 *   - User APK scans this array if the primary doc lookup fails.
 *   - Allows keys to be discovered even if the primary path's write
 *     silently failed (network/firestore issue on admin phone).
 *
 * Read order:
 *   1. Try `license_keys/{keyStr}` (single-doc read, fast).
 *   2. If not found, scan `admin_data/keys.keys[]` array.
 *
 * Write order:
 *   1. Write to `license_keys/{keyStr}` (allowed by rules).
 *   2. ALSO write to `admin_data/keys.keys[]` array (best-effort —
 *      may fail if rules block it, but primary write already succeeded).
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
const DOC_ADMIN_KEYS = "keys"; // doc id under admin_data collection
const COLL_ADMIN_DATA = "admin_data";

export function initFirebase(_config?: string): boolean {
  return !!db;
}

export function isFirebaseReady(): boolean {
  return !!db;
}

/**
 * Fetch a SINGLE license key from Firestore by key string.
 *
 * Reads:
 *   1. `license_keys/{keyStr}` document (PRIMARY)
 *   2. `admin_data/keys.keys[]` array (FALLBACK)
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

  const cleanKey = keyStr.trim().toUpperCase();

  // ============================================================
  // PATH 1: Read license_keys/{cleanKey} (PRIMARY — single-doc read)
  // ============================================================
  try {
    console.log("[LicenseFetch] [Path 1] Reading license_keys/" + cleanKey + "...");
    const snap = await getDoc(doc(db, COLL_KEYS, cleanKey));
    if (snap.exists()) {
      const data = snap.data() as Record<string, any>;
      console.log("[LicenseFetch] ✅ [Path 1] Key found:", data.key, "| Type:", data.type, "| Status:", data.status);
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
    }
    console.log("[LicenseFetch] [Path 1] Key not found in license_keys collection — trying fallback...");
  } catch (err) {
    console.error("[LicenseFetch] [Path 1] Error:", err);
  }

  // ============================================================
  // PATH 2: Read admin_data/keys.keys[] array (FALLBACK)
  // ============================================================
  try {
    console.log("[LicenseFetch] [Path 2] Reading admin_data/keys document...");
    const adminSnap = await getDoc(doc(db, COLL_ADMIN_DATA, DOC_ADMIN_KEYS));
    if (adminSnap.exists()) {
      const data = adminSnap.data() as Record<string, any>;
      const arr = Array.isArray(data.keys) ? data.keys : [];
      console.log("[LicenseFetch] [Path 2] admin_data/keys has " + arr.length + " keys — scanning...");
      const match = arr.find((k: any) => String(k?.key || "").toUpperCase() === cleanKey);
      if (match) {
        console.log("[LicenseFetch] ✅ [Path 2] Key found in admin_data/keys array:", match.key, "| Type:", match.type);
        return {
          key: match.key || cleanKey,
          type: (match.type as KeyType) || "trial",
          status: (match.status as KeyStatus) || "active",
          createdAt: typeof match.createdAt === "number" ? match.createdAt : Date.now(),
          expiresAt: match.expiresAt ?? null,
          deviceIds: Array.isArray(match.deviceIds) ? match.deviceIds : [],
          userName: match.userName,
          lastVerified: match.lastVerified,
          verifications: typeof match.verifications === "number" ? match.verifications : 0,
        };
      }
      console.log("[LicenseFetch] [Path 2] Key not found in admin_data/keys array either");
    } else {
      console.log("[LicenseFetch] [Path 2] admin_data/keys document does not exist");
    }
  } catch (err) {
    console.error("[LicenseFetch] [Path 2] Error:", err);
  }

  console.log("[LicenseFetch] ❌ Key not found in EITHER path. Key:", cleanKey);
  return null;
}

/**
 * Sync a SINGLE license key to Firestore.
 *
 * Writes to BOTH:
 *   1. license_keys/{keyStr} (PRIMARY — required for cross-device activation)
 *   2. admin_data/keys.keys[] array (BEST-EFFORT — may fail if rules block)
 */
export async function syncKeyToFirestore(key: LicenseKey): Promise<boolean> {
  console.log("[LicenseSync] Syncing key:", key.key);

  if (!db) return false;

  const cleanKey = key.key.trim().toUpperCase();
  let primaryOk = false;

  // ============================================================
  // WRITE 1: license_keys/{cleanKey} (PRIMARY — MUST succeed)
  // ============================================================
  try {
    await setDoc(doc(db, COLL_KEYS, cleanKey), {
      ...key,
      key: cleanKey,
      updatedAt: serverTimestamp(),
    });
    console.log("[LicenseSync] ✅ [Path 1] Key written to license_keys/" + cleanKey);
    primaryOk = true;
  } catch (err) {
    console.error("[LicenseSync] ❌ [Path 1] Failed to write license_keys/" + cleanKey + ":", err);
  }

  // ============================================================
  // WRITE 2: admin_data/keys.keys[] array (BEST-EFFORT)
  // Reads existing array, merges/replaces this key, writes back.
  // ============================================================
  try {
    const adminDocRef = doc(db, COLL_ADMIN_DATA, DOC_ADMIN_KEYS);
    const snap = await getDoc(adminDocRef);
    let arr: any[] = [];
    if (snap.exists()) {
      const data = snap.data() as Record<string, any>;
      arr = Array.isArray(data.keys) ? data.keys : [];
    }
    // Remove existing entry for this key (if any), then prepend the new one.
    arr = arr.filter((k: any) => String(k?.key || "").toUpperCase() !== cleanKey);
    arr = [{ ...key, key: cleanKey }, ...arr];
    await setDoc(adminDocRef, { keys: arr, updatedAt: serverTimestamp() }, { merge: true });
    console.log("[LicenseSync] ✅ [Path 2] Key written to admin_data/keys array (now " + arr.length + " keys)");
  } catch (err) {
    console.error("[LicenseSync] ⚠️ [Path 2] Failed to write admin_data/keys array (rules may block):", err);
    // Not fatal — primary write already succeeded.
  }

  return primaryOk;
}

/**
 * Update a SINGLE key's status in Firestore.
 * Updates BOTH license_keys/{keyStr} AND admin_data/keys.keys[] array.
 */
export async function updateKeyStatusInFirestore(
  keyStr: string,
  status: KeyStatus
): Promise<boolean> {
  return updateKeyFieldsInFirestore(keyStr, { status });
}

/**
 * Update a SINGLE key's fields in Firestore.
 * Updates BOTH license_keys/{keyStr} AND admin_data/keys.keys[] array.
 */
export async function updateKeyFieldsInFirestore(
  keyStr: string,
  fields: Partial<LicenseKey>
): Promise<boolean> {
  if (!db) return false;

  const cleanKey = keyStr.trim().toUpperCase();
  let primaryOk = false;

  // ============================================================
  // UPDATE 1: license_keys/{cleanKey} (PRIMARY)
  // ============================================================
  try {
    await updateDoc(doc(db, COLL_KEYS, cleanKey), {
      ...fields,
      updatedAt: serverTimestamp(),
    });
    console.log("[LicenseSync] ✅ [Path 1] Fields updated in license_keys/" + cleanKey);
    primaryOk = true;
  } catch (err) {
    console.error("[LicenseSync] ❌ [Path 1] updateKeyFields failed:", err);
    // If update fails because doc doesn't exist, try setDoc (create it).
    try {
      await setDoc(doc(db, COLL_KEYS, cleanKey), { ...fields, key: cleanKey, updatedAt: serverTimestamp() }, { merge: true });
      console.log("[LicenseSync] ✅ [Path 1] Fields written via setDoc fallback to license_keys/" + cleanKey);
      primaryOk = true;
    } catch (err2) {
      console.error("[LicenseSync] ❌ [Path 1] setDoc fallback also failed:", err2);
    }
  }

  // ============================================================
  // UPDATE 2: admin_data/keys.keys[] array (BEST-EFFORT)
  // ============================================================
  try {
    const adminDocRef = doc(db, COLL_ADMIN_DATA, DOC_ADMIN_KEYS);
    const snap = await getDoc(adminDocRef);
    if (snap.exists()) {
      const data = snap.data() as Record<string, any>;
      const arr = Array.isArray(data.keys) ? data.keys : [];
      const idx = arr.findIndex((k: any) => String(k?.key || "").toUpperCase() === cleanKey);
      if (idx >= 0) {
        arr[idx] = { ...arr[idx], ...fields, key: cleanKey };
        await setDoc(adminDocRef, { keys: arr, updatedAt: serverTimestamp() }, { merge: true });
        console.log("[LicenseSync] ✅ [Path 2] Fields updated in admin_data/keys array");
      } else {
        console.log("[LicenseSync] [Path 2] Key not in admin_data/keys array — skipping");
      }
    }
  } catch (err) {
    console.error("[LicenseSync] ⚠️ [Path 2] Failed to update admin_data/keys array:", err);
  }

  return primaryOk;
}

/**
 * Delete a SINGLE key from Firestore.
 * Deletes from BOTH license_keys/{keyStr} AND admin_data/keys.keys[] array.
 */
export async function deleteKeyFromFirestore(keyStr: string): Promise<boolean> {
  if (!db) return false;

  const cleanKey = keyStr.trim().toUpperCase();
  let primaryOk = false;

  // DELETE 1: license_keys/{cleanKey}
  try {
    await deleteDoc(doc(db, COLL_KEYS, cleanKey));
    console.log("[LicenseSync] ✅ [Path 1] Deleted license_keys/" + cleanKey);
    primaryOk = true;
  } catch (err) {
    console.error("[LicenseSync] ❌ [Path 1] deleteKey failed:", err);
  }

  // DELETE 2: admin_data/keys.keys[] array
  try {
    const adminDocRef = doc(db, COLL_ADMIN_DATA, DOC_ADMIN_KEYS);
    const snap = await getDoc(adminDocRef);
    if (snap.exists()) {
      const data = snap.data() as Record<string, any>;
      const arr = Array.isArray(data.keys) ? data.keys : [];
      const next = arr.filter((k: any) => String(k?.key || "").toUpperCase() !== cleanKey);
      if (next.length !== arr.length) {
        await setDoc(adminDocRef, { keys: next, updatedAt: serverTimestamp() }, { merge: true });
        console.log("[LicenseSync] ✅ [Path 2] Deleted from admin_data/keys array");
      }
    }
  } catch (err) {
    console.error("[LicenseSync] ⚠️ [Path 2] Failed to delete from admin_data/keys array:", err);
  }

  return primaryOk;
}
