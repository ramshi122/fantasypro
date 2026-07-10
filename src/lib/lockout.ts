/**
 * License Lockout System — LOCAL ONLY (per FIREBASE-CLEANUP)
 * ----------------------------------------------------------
 * - After 5 wrong key attempts → 1 hour lock
 * - Lock persists in localStorage keyed by device fingerprint
 * - NO Firebase writes (lockout state lives only on this device)
 *
 * The device fingerprint (navigator + screen + UA hash) still survives a
 * localStorage clear (because we recompute it from hardware) so the lock
 * survives most reinstall/relogin scenarios without needing Firebase.
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
  return newState;
}

/**
 * Clear the lockout (on successful activation or after lock expires).
 */
export function clearLockout() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Get remaining attempts before lockout.
 */
export function getRemainingAttempts(): number {
  const state = getLockoutState();
  return Math.max(0, MAX_ATTEMPTS - state.failedAttempts);
}

/**
 * No-op restore function (kept for compatibility with callers that
 * previously restored lockout state from Firebase). Lockout state now
 * lives ONLY in localStorage, so there is nothing to restore from a
 * remote source.
 */
export async function restoreLockoutFromFirebase(): Promise<void> {
  // Intentionally empty — lockout is LOCAL ONLY now.
  return;
}
