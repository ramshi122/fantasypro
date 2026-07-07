"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getLicenseState,
  setLicenseVerified,
  clearLicense,
  getDeviceId,
  useAdmin,
  type KeyType,
} from "./admin-store";

/**
 * useLicense Hook
 * ----------------
 * Tracks license verification status across the app.
 * When NOT verified: all team generation features are LOCKED.
 * When verified: features unlocked based on key tier.
 *
 * Key Tiers:
 *   trial    — basic access (1 day)
 *   weekly   — basic access (7 days)
 *   monthly  — pro access (30 days)
 *   elite    — FULL access including Elite AI (90 days)
 *   lifetime — FULL access including Elite AI (forever)
 *
 * Persists in localStorage:
 *   licenseVerified=true
 *   licenseKey=CRICB-XXXX-XXXX-XXXX
 *   licenseKeyType=elite
 *   deviceId=unique-device-id
 */

export function useLicense() {
  const [licenseState, setLicenseState] = useState(getLicenseState());
  const [showActivate, setShowActivate] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [verifying, setVerifying] = useState(false);
  const admin = useAdmin();

  // Auto-verify on mount if license exists
  useEffect(() => {
    if (licenseState.verified && licenseState.key) {
      const result = admin.verifyLicense(licenseState.key, licenseState.deviceId);
      if (!result.valid) {
        clearLicense();
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLicenseState({ verified: false, key: null, deviceId: getDeviceId(), keyType: null });
      } else if (result.keyType && result.keyType !== licenseState.keyType) {
        // Update stored key type if it changed
        setLicenseVerified(licenseState.key, result.keyType);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLicenseState({ verified: true, key: licenseState.key, deviceId: licenseState.deviceId, keyType: result.keyType });
      }
    }
  }, []);

  const activate = useCallback(async (key: string): Promise<{ success: boolean; message: string }> => {
    setVerifying(true);
    // Clean the key: trim spaces, convert to uppercase
    const cleanKey = key.trim().toUpperCase();
    console.log("[useLicense] Activating key:", cleanKey);

    return new Promise((resolve) => {
      setTimeout(() => {
        const deviceId = getDeviceId();
        console.log("[useLicense] Device ID:", deviceId);
        const result = admin.verifyLicense(cleanKey, deviceId);
        console.log("[useLicense] Verify result:", JSON.stringify(result));
        setVerifying(false);
        if (result.valid) {
          setLicenseVerified(cleanKey, result.keyType);
          setLicenseState({ verified: true, key: cleanKey, deviceId, keyType: result.keyType || null });
          setShowActivate(false);
          setKeyInput("");
          resolve({ success: true, message: result.message || "✅ License Key Verified Successfully" });
        } else {
          resolve({ success: false, message: result.message || "Verification failed — unknown reason" });
        }
      }, 800);
    });
  }, [admin]);

  const deactivate = useCallback(() => {
    clearLicense();
    setLicenseState({ verified: false, key: null, deviceId: getDeviceId(), keyType: null });
  }, []);

  /**
   * Call this when user tries to use a locked feature.
   * Returns true if access granted, false if locked (and opens the activate modal).
   */
  const requireLicense = useCallback((): boolean => {
    if (licenseState.verified) return true;
    setShowActivate(true);
    return false;
  }, [licenseState.verified]);

  /**
   * Call this when user tries to use an ELITE-only feature.
   * Returns true if the user has an elite or lifetime key.
   * Returns false (and opens activate modal) if not.
   */
  const requireElite = useCallback((): boolean => {
    if (!licenseState.verified) {
      setShowActivate(true);
      return false;
    }
    const kt = licenseState.keyType;
    if (kt === "elite" || kt === "lifetime") return true;
    return false;
  }, [licenseState.verified, licenseState.keyType]);

  // Derived flags
  const isElite = licenseState.verified && (licenseState.keyType === "elite" || licenseState.keyType === "lifetime");
  const isPro = licenseState.verified && (isElite || licenseState.keyType === "monthly");
  const isTrial = licenseState.verified && (licenseState.keyType === "trial" || licenseState.keyType === "weekly");

  return {
    isLicensed: licenseState.verified,
    licenseKey: licenseState.key,
    licenseKeyType: licenseState.keyType,
    deviceId: licenseState.deviceId,
    // Tier flags
    isElite,
    isPro,
    isTrial,
    // Access checks
    requireLicense,
    requireElite,
    // Modal state
    showActivate,
    setShowActivate,
    keyInput,
    setKeyInput,
    verifying,
    activate,
    deactivate,
  };
}
