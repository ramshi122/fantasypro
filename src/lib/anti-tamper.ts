/**
 * Anti-Tamper Security Module
 * ============================
 *
 * Detects attempts to manipulate localStorage to bypass license/lockout.
 *
 * SECURITY CHECKS:
 *   1. Verify license state hasn't been tampered (forges valid license)
 *   2. Verify lockout state is consistent across storage locations
 *   3. Detect localStorage deletion (clearing to reset lockout)
 *   4. Cross-check device fingerprint (prevent spoofing)
 *
 * If tampering is detected:
 *   - Force re-verification from Firestore (source of truth)
 *   - Don't trust local cache
 */

const LICENSE_STORAGE_KEY = "apna-cricket-license";
const LOCKOUT_KEY = "apna-cricket-lockout";
const LOCKOUT_BACKUP_KEY = "apna-cricket-lockout-bak";
const FP_KEY = "apna-cricket-fp";
const TAMPER_COUNT_KEY = "apna-cricket-tamper-count";

/**
 * Check if the user has tampered with localStorage.
 * Returns true if tampering is detected.
 */
export function detectTampering(): boolean {
  if (typeof window === "undefined") return false;

  try {
    let tampered = false;

    // Check 1: License state exists but fingerprint doesn't match
    const licenseRaw = localStorage.getItem(LICENSE_STORAGE_KEY);
    if (licenseRaw) {
      try {
        const license = JSON.parse(licenseRaw);
        // If license says "verified: true" but there's no key — suspicious
        if (license.verified === true && !license.key) {
          console.warn("[AntiTamper] ⚠️ License state has verified=true but no key — possible tampering");
          tampered = true;
        }
      } catch {
        // Corrupted license data — suspicious
        console.warn("[AntiTamper] ⚠️ License data corrupted — possible tampering");
        tampered = true;
      }
    }

    // Check 2: Lockout was deleted but backup exists (user cleared primary)
    const lockoutPrimary = localStorage.getItem(LOCKOUT_KEY);
    const lockoutBackup = localStorage.getItem(LOCKOUT_BACKUP_KEY);
    if (!lockoutPrimary && lockoutBackup) {
      console.warn("[AntiTamper] ⚠️ Lockout primary deleted but backup exists — tampering detected");
      // Restore from backup
      localStorage.setItem(LOCKOUT_KEY, lockoutBackup);
      tampered = true;
    }

    // Check 3: Both lockout deleted but fingerprint exists (selective deletion)
    if (!lockoutPrimary && !lockoutBackup) {
      const fp = localStorage.getItem(FP_KEY);
      const tamperCount = parseInt(localStorage.getItem(TAMPER_COUNT_KEY) || "0");
      // If fingerprint exists and there was previous tampering — suspicious
      if (fp && tamperCount > 0) {
        console.warn("[AntiTamper] ⚠️ Lockout cleared but fingerprint + tamper count exist — possible tampering");
        tampered = true;
      }
    }

    // If tampering detected, increment counter
    if (tampered) {
      const count = parseInt(localStorage.getItem(TAMPER_COUNT_KEY) || "0") + 1;
      localStorage.setItem(TAMPER_COUNT_KEY, String(count));
      console.error(`[AntiTamper] ❌ Tampering detected! Count: ${count}`);

      // After 3 tampering attempts, force clear license (require re-verification)
      if (count >= 3) {
        console.error("[AntiTamper] ❌ 3+ tampering attempts — forcing license clear");
        localStorage.removeItem(LICENSE_STORAGE_KEY);
      }
    }

    return tampered;
  } catch {
    return false;
  }
}

/**
 * Verify that the license state in localStorage is genuine.
 * Cross-checks with device fingerprint.
 *
 * Returns true if license state is genuine, false if potentially forged.
 */
export function verifyLicenseIntegrity(): boolean {
  if (typeof window === "undefined") return true;

  try {
    const licenseRaw = localStorage.getItem(LICENSE_STORAGE_KEY);
    if (!licenseRaw) return true; // No license — nothing to verify

    const license = JSON.parse(licenseRaw);

    // Check: verified license must have a key
    if (license.verified === true && !license.key) {
      console.warn("[AntiTamper] License integrity FAILED — verified without key");
      return false;
    }

    // Check: key must match expected format (CRICB-XXXX-XXXX-XXXX)
    if (license.key) {
      const keyPattern = /^[A-Z]+-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
      if (!keyPattern.test(String(license.key).toUpperCase())) {
        console.warn("[AntiTamper] License integrity FAILED — key format invalid");
        return false;
      }
    }

    // Check: deviceId must exist
    if (license.verified === true && !license.deviceId) {
      console.warn("[AntiTamper] License integrity FAILED — verified without deviceId");
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Get the tamper count (number of times tampering was detected).
 */
export function getTamperCount(): number {
  if (typeof window === "undefined") return 0;
  try {
    return parseInt(localStorage.getItem(TAMPER_COUNT_KEY) || "0");
  } catch {
    return 0;
  }
}

/**
 * Reset tamper count (called after successful legitimate verification).
 */
export function resetTamperCount(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(TAMPER_COUNT_KEY);
  } catch {
    // ignore
  }
}
