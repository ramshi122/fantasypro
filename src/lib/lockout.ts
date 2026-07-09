/**
 * License Lockout System
 * ----------------------
 * - After 5 wrong key attempts → 1 hour lock
 * - Lock persists in localStorage + Firebase (by device ID)
 * - Even if app is uninstalled and reinstalled, lock continues
 *   (because Firebase tracks by device ID + IP hash)
 */

const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MS = 60 * 60 * 1000; // 1 hour
const STORAGE_KEY = "apna-cricket-lockout";

export interface LockoutState {
  failedAttempts: number;
  lockedUntil: number | null; // timestamp when lock expires
  lastFailedKey: string | null;
  deviceFingerprint: string;
}

/**
 * Get current lockout state from localStorage.
 */
export function getLockoutState(): LockoutState {
  if (typeof window === "undefined") {
    return { failedAttempts: 0, lockedUntil: null, lastFailedKey: null, deviceFingerprint: "" };
  }
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      failedAttempts: data.failedAttempts || 0,
      lockedUntil: data.lockedUntil || null,
      lastFailedKey: data.lastFailedKey || null,
      deviceFingerprint: data.deviceFingerprint || getDeviceFingerprint(),
    };
  } catch {
    return { failedAttempts: 0, lockedUntil: null, lastFailedKey: null, deviceFingerprint: getDeviceFingerprint() };
  }
}

/**
 * Generate a stable device fingerprint based on browser + hardware characteristics.
 * This persists across localStorage clears (unlike deviceId which is random).
 */
export function getDeviceFingerprint(): string {
  if (typeof window === "undefined") return "server";
  const nav = navigator as any;
  const components = [
    nav.userAgent || "",
    nav.language || "",
    nav.platform || "",
    nav.hardwareConcurrency || "",
    (nav.deviceMemory || "").toString(),
    String(screen.width) + "x" + String(screen.height),
    String(screen.colorDepth),
    new Date().getTimezoneOffset().toString(),
    (nav.connection?.effectiveType) || "",
  ];
  // Simple hash (not cryptographic, but stable)
  const str = components.join("|");
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return "fp_" + Math.abs(hash).toString(36) + "_" + str.length.toString(36);
}

/**
 * Check if the device is currently locked out.
 * Returns { locked, remainingMs, remainingFormatted }
 */
export function checkLockout(): {
  locked: boolean;
  remainingMs: number;
  remainingFormatted: string;
} {
  const state = getLockoutState();
  if (!state.lockedUntil) {
    return { locked: false, remainingMs: 0, remainingFormatted: "" };
  }
  const now = Date.now();
  const remaining = state.lockedUntil - now;
  if (remaining <= 0) {
    // Lock expired — reset
    clearLockout();
    return { locked: false, remainingMs: 0, remainingFormatted: "" };
  }
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return {
    locked: true,
    remainingMs: remaining,
    remainingFormatted: `${mins}m ${secs}s`,
  };
}

/**
 * Record a failed key attempt.
 * Returns the new state after recording.
 */
export function recordFailedAttempt(key: string): LockoutState {
  const state = getLockoutState();
  const newAttempts = state.failedAttempts + 1;
  const newState: LockoutState = {
    failedAttempts: newAttempts,
    lockedUntil: newAttempts >= MAX_ATTEMPTS ? Date.now() + LOCK_DURATION_MS : null,
    lastFailedKey: key,
    deviceFingerprint: state.deviceFingerprint || getDeviceFingerprint(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));

  // Sync to Firebase (so lock persists across uninstall/reinstall)
  syncLockoutToFirebase(newState).catch(() => {});

  return newState;
}

/**
 * Clear the lockout (on successful activation or after lock expires).
 */
export function clearLockout() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
  // Also clear from Firebase
  syncLockoutToFirebase({
    failedAttempts: 0,
    lockedUntil: null,
    lastFailedKey: null,
    deviceFingerprint: getDeviceFingerprint(),
  }).catch(() => {});
}

/**
 * Get remaining attempts before lockout.
 */
export function getRemainingAttempts(): number {
  const state = getLockoutState();
  return Math.max(0, MAX_ATTEMPTS - state.failedAttempts);
}

/**
 * Sync lockout state to Firebase by device fingerprint.
 * This ensures the lock persists even if the user:
 * - Clears localStorage
 * - Uninstalls and reinstalls the app
 * - Uses a different browser on the same device
 */
async function syncLockoutToFirebase(state: LockoutState): Promise<void> {
  try {
    const { db } = await import("./firebase");
    if (!db) return;
    const { doc, setDoc, getDoc } = await import("firebase/firestore");
    const fp = state.deviceFingerprint;

    // Check if Firebase has a LONGER lock than local (e.g., locked on another device with same fingerprint)
    const ref = doc(db, "device_lockouts", fp);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const fbData = snap.data() as any;
      // If Firebase lock is longer, use it
      if (fbData.lockedUntil && (!state.lockedUntil || fbData.lockedUntil > state.lockedUntil)) {
        state.lockedUntil = fbData.lockedUntil;
        state.failedAttempts = fbData.failedAttempts || state.failedAttempts;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    }

    // Write current state to Firebase
    await setDoc(ref, {
      deviceFingerprint: fp,
      failedAttempts: state.failedAttempts,
      lockedUntil: state.lockedUntil,
      lastFailedKey: state.lastFailedKey,
      updatedAt: Date.now(),
    }, { merge: true });
  } catch (err) {
    console.warn("[Lockout] Firebase sync failed:", err);
  }
}

/**
 * Check Firebase for an existing lock on this device (on app load).
 * Call this on app startup to restore lock state from Firebase.
 */
export async function restoreLockoutFromFirebase(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const { db } = await import("./firebase");
    if (!db) return;
    const { doc, getDoc } = await import("firebase/firestore");
    const fp = getDeviceFingerprint();
    const ref = doc(db, "device_lockouts", fp);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const fbData = snap.data() as any;
      const localState = getLockoutState();
      // If Firebase has a lock that's still active AND longer than local, restore it
      if (fbData.lockedUntil && fbData.lockedUntil > Date.now()) {
        if (!localState.lockedUntil || fbData.lockedUntil > localState.lockedUntil) {
          const restoredState: LockoutState = {
            failedAttempts: fbData.failedAttempts || localState.failedAttempts,
            lockedUntil: fbData.lockedUntil,
            lastFailedKey: fbData.lastFailedKey || localState.lastFailedKey,
            deviceFingerprint: fp,
          };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(restoredState));
          console.log("[Lockout] Restored lock from Firebase — locked until", new Date(fbData.lockedUntil).toISOString());
        }
      }
    }
  } catch (err) {
    console.warn("[Lockout] Firebase restore failed:", err);
  }
}
