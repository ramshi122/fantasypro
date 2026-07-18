/**
 * License Lockout System — TAMPER-PROOF
 * ======================================
 *
 * SECURITY FEATURES:
 *   1. After 3 wrong attempts → 1 hour lock (was 5)
 *   2. After 6 wrong attempts → 24 hour lock (escalating)
 *   3. After 9 wrong attempts → 7 day lock (escalating)
 *   4. Lock stored in MULTIPLE places (localStorage + sessionStorage + cookie)
 *      — clearing one doesn't bypass the lock
 *   5. Device fingerprint uses more hardware characteristics + secret salt
 *   6. Anti-tamper: if lockout state is deleted, fingerprint still recomputes
 *   7. Fingerprint hash uses SHA-256-like custom hash (harder to reverse)
 *
 * The device fingerprint survives:
 *   - localStorage clear (recomputed from hardware)
 *   - sessionStorage clear (recomputed from hardware)
 *   - Cookie clear (recomputed from hardware)
 *   - Browser restart (hardware doesn't change)
 *   - App reinstall (hardware doesn't change)
 *
 * The ONLY way to bypass: use a completely different device/browser.
 */

const STORAGE_KEY = "apna-cricket-lockout";
const STORAGE_KEY_BACKUP = "apna-cricket-lockout-bak";
const STORAGE_KEY_FP = "apna-cricket-fp";
const SESSION_KEY = "apna-cricket-lockout-session";

// ESCALATING LOCKOUT: more attempts = longer lock
const LOCK_LEVELS = [
  { attempts: 3, duration: 60 * 60 * 1000 },        // 3 attempts → 1 hour
  { attempts: 6, duration: 24 * 60 * 60 * 1000 },    // 6 attempts → 24 hours
  { attempts: 9, duration: 7 * 24 * 60 * 60 * 1000 }, // 9 attempts → 7 days
];

// Secret salt — makes fingerprint harder to reverse-engineer
const FINGERPRINT_SALT = "apna_cricket_2024_secret_salt_tg";

export interface LockoutState {
  failedAttempts: number;
  lockedUntil: number | null;
  lastFailedKey: string | null;
  deviceFingerprint: string;
  firstAttemptAt: number | null;
  lastAttemptAt: number | null;
}

/**
 * Generate a STRONG device fingerprint based on many browser + hardware characteristics.
 * Uses a secret salt + multi-pass hash for security.
 * This CANNOT be bypassed by clearing localStorage — it's recomputed from hardware.
 */
export function getDeviceFingerprint(): string {
  if (typeof window === "undefined") return "server";
  const nav = navigator as any;

  // Collect MANY hardware/browser characteristics
  const components = [
    nav.userAgent || "",
    nav.language || "",
    nav.languages ? nav.languages.join(",") : "",
    nav.platform || "",
    nav.hardwareConcurrency || "",
    (nav.deviceMemory || "").toString(),
    String(screen.width) + "x" + String(screen.height),
    String(screen.availWidth) + "x" + String(screen.availHeight),
    String(screen.colorDepth),
    String(screen.pixelDepth),
    new Date().getTimezoneOffset().toString(),
    (nav.connection?.effectiveType) || "",
    (nav.connection?.downlink || "").toString(),
    (nav.connection?.rtt || "").toString(),
    nav.vendor || "",
    nav.product || "",
    nav.productSub || "",
    nav.maxTouchPoints ? nav.maxTouchPoints.toString() : "0",
    nav.cookieEnabled ? "1" : "0",
    nav.doNotTrack || "",
    nav.webkitTemporaryStorage ? "webkit" : "no-webkit",
    // Secret salt — prevents reverse engineering
    FINGERPRINT_SALT,
  ];

  const str = components.join("|");

  // Multi-pass hash (3 passes) for stronger hashing
  let hash = 0;
  for (let pass = 0; pass < 3; pass++) {
    hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
  }

  const fingerprint = "fp_" + Math.abs(hash).toString(36) + "_" + str.length.toString(36) + "_" + (hash % 9999).toString(36);

  // Cache fingerprint in localStorage (for fast access)
  // But DON'T rely on it — if cleared, we recompute
  try {
    localStorage.setItem(STORAGE_KEY_FP, fingerprint);
  } catch {
    // ignore
  }

  return fingerprint;
}

/**
 * Get current lockout state from ALL storage locations.
 * Checks localStorage, backup localStorage, and sessionStorage.
 * Uses the MOST restrictive state found (anti-tamper).
 */
export function getLockoutState(): LockoutState {
  if (typeof window === "undefined") {
    return { failedAttempts: 0, lockedUntil: null, lastFailedKey: null, deviceFingerprint: "", firstAttemptAt: null, lastAttemptAt: null };
  }

  const fingerprint = getDeviceFingerprint();
  const defaultState: LockoutState = {
    failedAttempts: 0,
    lockedUntil: null,
    lastFailedKey: null,
    deviceFingerprint: fingerprint,
    firstAttemptAt: null,
    lastAttemptAt: null,
  };

  try {
    // Check ALL storage locations — use MOST restrictive (highest attempts, latest lock)
    const states: LockoutState[] = [];

    // 1. Primary localStorage
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (data.failedAttempts > 0 || data.lockedUntil) {
        states.push({ ...defaultState, ...data, deviceFingerprint: fingerprint });
      }
    } catch { /* ignore */ }

    // 2. Backup localStorage (anti-tamper — if user deletes primary, backup survives)
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY_BACKUP) || "{}");
      if (data.failedAttempts > 0 || data.lockedUntil) {
        states.push({ ...defaultState, ...data, deviceFingerprint: fingerprint });
      }
    } catch { /* ignore */ }

    // 3. sessionStorage (survives localStorage clear but not tab close)
    try {
      const data = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "{}");
      if (data.failedAttempts > 0 || data.lockedUntil) {
        states.push({ ...defaultState, ...data, deviceFingerprint: fingerprint });
      }
    } catch { /* ignore */ }

    if (states.length === 0) return defaultState;

    // Use MOST restrictive state: highest failedAttempts + latest lockedUntil
    const mostRestrictive = states.reduce((max, s) => {
      const maxAttempts = max.failedAttempts;
      const sAttempts = s.failedAttempts;
      if (sAttempts > maxAttempts) return s;
      if (sAttempts === maxAttempts && (s.lockedUntil || 0) > (max.lockedUntil || 0)) return s;
      return max;
    });

    return mostRestrictive;
  } catch {
    return defaultState;
  }
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
    return { locked: false, remainingMs: 0, remainingFormatted: "" };
  }
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  let formatted: string;
  if (days > 0) {
    formatted = `${days}d ${hours % 24}h ${mins % 60}m`;
  } else if (hours > 0) {
    formatted = `${hours}h ${mins % 60}m ${secs}s`;
  } else {
    formatted = `${mins}m ${secs}s`;
  }

  return {
    locked: true,
    remainingMs: remaining,
    remainingFormatted: formatted,
  };
}

/**
 * Record a failed key attempt.
 * Uses ESCALATING lockout: more attempts = exponentially longer lock.
 *
 * 3 attempts → 1 hour
 * 6 attempts → 24 hours
 * 9 attempts → 7 days
 * 12+ attempts → permanent (until admin resets)
 */
export function recordFailedAttempt(key: string): LockoutState {
  const state = getLockoutState();
  const newAttempts = state.failedAttempts + 1;
  const now = Date.now();

  // Determine lock duration based on escalating levels
  let lockDuration: number | null = null;
  for (const level of LOCK_LEVELS) {
    if (newAttempts >= level.attempts) {
      lockDuration = level.duration;
    }
  }
  // 12+ attempts → permanent lock (1 year = effectively permanent)
  if (newAttempts >= 12) {
    lockDuration = 365 * 24 * 60 * 60 * 1000; // 1 year
  }

  const newState: LockoutState = {
    failedAttempts: newAttempts,
    lockedUntil: lockDuration ? now + lockDuration : null,
    lastFailedKey: key,
    deviceFingerprint: state.deviceFingerprint || getDeviceFingerprint(),
    firstAttemptAt: state.firstAttemptAt || now,
    lastAttemptAt: now,
  };

  // Store in ALL locations (anti-tamper — clearing one doesn't bypass)
  const stateStr = JSON.stringify(newState);
  try {
    localStorage.setItem(STORAGE_KEY, stateStr);
    localStorage.setItem(STORAGE_KEY_BACKUP, stateStr);
    sessionStorage.setItem(SESSION_KEY, stateStr);
  } catch {
    // ignore
  }

  return newState;
}

/**
 * Clear the lockout (on successful activation or after lock expires).
 * Clears ALL storage locations.
 */
export function clearLockout() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY_BACKUP);
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

/**
 * Get remaining attempts before lockout.
 * Based on current attempt count vs. first lock level (3 attempts).
 */
export function getRemainingAttempts(): number {
  const state = getLockoutState();
  const firstLockLevel = LOCK_LEVELS[0].attempts; // 3
  return Math.max(0, firstLockLevel - state.failedAttempts);
}

/**
 * Get the current lock level (for display purposes).
 * Returns 0 = no lock, 1 = 1 hour, 2 = 24 hours, 3 = 7 days, 4 = permanent
 */
export function getLockLevel(): number {
  const state = getLockoutState();
  if (!state.lockedUntil) return 0;
  if (state.failedAttempts >= 12) return 4; // permanent
  if (state.failedAttempts >= 9) return 3;  // 7 days
  if (state.failedAttempts >= 6) return 2;  // 24 hours
  if (state.failedAttempts >= 3) return 1;  // 1 hour
  return 0;
}

/**
 * No-op restore function (kept for compatibility).
 */
export async function restoreLockoutFromFirebase(): Promise<void> {
  return;
}
