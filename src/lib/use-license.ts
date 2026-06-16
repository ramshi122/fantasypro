"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getLicenseState,
  setLicenseVerified,
  clearLicense,
  getDeviceId,
  useAdmin,
} from "./admin-store";

/**
 * useLicense Hook
 * ----------------
 * Tracks license verification status across the app.
 * When NOT verified: all team generation features are LOCKED.
 * When verified: all features unlocked.
 *
 * Persists in localStorage:
 *   licenseVerified=true
 *   licenseKey=CRICB-XXXX-XXXX-XXXX
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
        setLicenseState({ verified: false, key: null, deviceId: getDeviceId() });
      }
    }
  }, []);

  const activate = useCallback((key: string) => {
    setVerifying(true);
    setTimeout(() => {
      const deviceId = getDeviceId();
      const result = admin.verifyLicense(key.trim().toUpperCase(), deviceId);
      setVerifying(false);
      if (result.valid) {
        setLicenseVerified(key.trim().toUpperCase());
        setLicenseState({ verified: true, key: key.trim().toUpperCase(), deviceId });
        setShowActivate(false);
        setKeyInput("");
        return { success: true, message: "License activated!" };
      }
      return { success: false, message: result.message };
    }, 800);
  }, [admin]);

  const deactivate = useCallback(() => {
    clearLicense();
    setLicenseState({ verified: false, key: null, deviceId: getDeviceId() });
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

  return {
    isLicensed: licenseState.verified,
    licenseKey: licenseState.key,
    deviceId: licenseState.deviceId,
    showActivate,
    setShowActivate,
    keyInput,
    setKeyInput,
    verifying,
    activate,
    deactivate,
    requireLicense,
  };
}
