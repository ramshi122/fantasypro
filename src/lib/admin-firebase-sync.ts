/**
 * Admin Firebase Sync — LICENSE-KEY-ONLY
 * =======================================
 * All admin data EXCEPT license keys is stored locally (localStorage in
 * admin-store). The only Firebase collection we touch here is the
 * `admin_generated_keys` collection — used so that keys generated on one
 * device can be looked up from any other device via individual doc reads.
 *
 * Allowed operations (all ONE-SHOT, no real-time listeners):
 *   - fetchAdminGeneratedKeys()   — fetch last N admin-generated key strings
 *   - recordAdminGeneratedKey()   — setDoc ONE key-string into Firebase
 *
 * REMOVED per FIREBASE-CLEANUP:
 *   - subscribeToKeys / subscribeToUsers / subscribeToSettings (onSnapshot)
 *   - fetchAllKeysFromFirebase / fetchAllDevicesFromFirebase /
 *     fetchAllUsersFromFirebase / fetchLogsFromFirebase /
 *     fetchSettingsFromFirebase (collection downloads)
 *   - writeKeyToFirebase / bulkWriteKeysToFirebase /
 *     deleteKeyFromFirebase / updateKeyInFirebase (replaced by firebase-license.ts)
 *   - writeLogToFirebase / writeSettingsToFirebase /
 *     writeDeviceToFirebase / writeUserToFirebase (no longer needed —
 *     localStorage is the source of truth for everything except license keys)
 */

import { db } from "./firebase";
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from "firebase/firestore";

const ADMIN_GEN_COLLECTION = "admin_generated_keys";

/**
 * Check that the Firestore db instance is ready.
 */
function isDbReady(): boolean {
  return (
    !!db &&
    (typeof (db as any).collection === "function" ||
      Object.keys(db as object).length > 0)
  );
}

/**
 * Fetch the LAST N (default 50) admin-generated key STRINGS from Firebase.
 * We only fetch the `keyStr` field — the full LicenseKey record lives in
 * the admin store (localStorage). New phones opening admin will:
 *   1. seed the same 500+ initial keys (deterministic — see admin-store)
 *   2. fetch these admin-generated key strings
 *   3. for each, do an INDIVIDUAL read of the full license_keys/{keyStr}
 *      document (via `fetchKeyFromFirestore`) to hydrate the local store
 *
 * Returns a list of key strings. Empty list if Firebase is unavailable.
 */
export async function fetchAdminGeneratedKeys(
  limitCount = 50
): Promise<string[]> {
  if (!isDbReady()) return [];
  try {
    let snap;
    try {
      const q = query(
        collection(db as any, ADMIN_GEN_COLLECTION),
        orderBy("createdAt", "desc"),
        limit(limitCount)
      );
      snap = await getDocs(q);
    } catch {
      // No index / ordering failed → fall back to unordered fetch
      snap = await getDocs(collection(db as any, ADMIN_GEN_COLLECTION));
    }
    const out: string[] = [];
    snap.forEach((d) => {
      const data = d.data() as Record<string, any>;
      if (typeof data.keyStr === "string") out.push(data.keyStr);
      else if (typeof d.id === "string") out.push(d.id);
    });
    return out;
  } catch (err) {
    console.error("[Admin Sync] fetchAdminGeneratedKeys failed:", err);
    return [];
  }
}

/**
 * Record a SINGLE admin-generated key string in Firebase.
 * Called when admin generates a key (so other admin phones can discover it
 * via `fetchAdminGeneratedKeys` and then hydrate it via
 * `fetchKeyFromFirestore`).
 */
export async function recordAdminGeneratedKey(
  keyStr: string
): Promise<boolean> {
  if (!isDbReady() || !keyStr) return false;
  try {
    await setDoc(doc(db as any, ADMIN_GEN_COLLECTION, keyStr), {
      keyStr,
      createdAt: Date.now(),
      createdAtTs: serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.error("[Admin Sync] recordAdminGeneratedKey failed:", err);
    return false;
  }
}
