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
 *
 * Features:
 *   - Auto-expires license when expiresAt is reached
 *   - Periodic check (every 30s) to auto-lock on expiry
 *   - isLicensed returns false if key is expired
 *   - requireLicense() checks expiry before granting access
 *
 * Key Tiers:
 *   trial       — basic access (1 day)
 *   match_basic — 1 match (6 hours)
 *   match_full  — 24 hours
 *   weekly      — 7 days
 *   monthly     — pro access (30 days)
 *   elite       — FULL access including Elite AI (90 days)
 *   lifetime    — FULL access including Elite AI (forever)
 */

export function useLicense() {
  const [licenseState, setLicenseState] = useState(getLicenseState());
  const [showActivate, setShowActivate] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const admin = useAdmin();

  /**
   * Check if the current license key has expired.
   * Looks up the key in admin store and checks expiresAt.
   */
  const checkExpiry = useCallback(() => {
    if (!licenseState.verified || !licenseState.key) {
      setIsExpired(false);
      return false;
    }

    // Find the key in admin store to get expiresAt
    const keyObj = admin.keys.find((k) => k.key === licenseState.key);
    if (!keyObj) {
      // Key not found in store — could be cleared by admin
      // Keep verified state but don't auto-clear (might be syncing)
      setIsExpired(false);
      return false;
    }

    if (keyObj.status === "suspended") {
      // Key suspended by admin — auto-clear
      console.log("[useLicense] Key suspended — auto-clearing");
      clearLicense();
      setLicenseState({ verified: false, key: null, deviceId: getDeviceId(), keyType: null });
      setIsExpired(true);
      return true;
    }

    if (keyObj.expiresAt && keyObj.expiresAt < Date.now()) {
      // Key expired — auto-clear
      console.log("[useLicense] Key expired — auto-clearing");
      clearLicense();
      setLicenseState({ verified: false, key: null, deviceId: getDeviceId(), keyType: null });
      setIsExpired(true);
      return true;
    }

    setIsExpired(false);
    return false;
  }, [licenseState.verified, licenseState.key, admin.keys]);

  // Auto-verify on mount + sync keyType + check expiry
  useEffect(() => {
    if (licenseState.verified && licenseState.key) {
      const result = admin.verifyLicense(licenseState.key, licenseState.deviceId);
      if (!result.valid) {
        // Key no longer valid (expired, suspended, or deleted)
        clearLicense();
        setLicenseState({ verified: false, key: null, deviceId: getDeviceId(), keyType: null });
        setIsExpired(true);
        console.log("[useLicense] License auto-cleared — key invalid");
      } else if (result.keyType && result.keyType !== licenseState.keyType) {
        // Sync keyType
        setLicenseVerified(licenseState.key, result.keyType);
        setLicenseState({
          verified: true,
          key: licenseState.key,
          deviceId: licenseState.deviceId,
          keyType: result.keyType,
        });
        console.log("[useLicense] Synced keyType from backend:", result.keyType);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Periodic expiry check — every 30 seconds
  useEffect(() => {
    if (!licenseState.verified) return;

    // Check immediately
    checkExpiry();

    // Check every 30 seconds
    const interval = setInterval(() => {
      checkExpiry();
    }, 30000);

    return () => clearInterval(interval);
  }, [licenseState.verified, checkExpiry]);

  const activate = useCallback(async (key: string): Promise<{ success: boolean; message: string }> => {
    setVerifying(true);
    const cleanKey = key.trim().toUpperCase();
    console.log("[useLicense] Activating key:", cleanKey);

    return new Promise((resolve) => {
      setTimeout(() => {
        const deviceId = getDeviceId();
        const result = admin.verifyLicense(cleanKey, deviceId);
        setVerifying(false);
        if (result.valid) {
          setLicenseVerified(cleanKey, result.keyType);
          setLicenseState({ verified: true, key: cleanKey, deviceId, keyType: result.keyType || null });
          setIsExpired(false);
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
    setIsExpired(false);
  }, []);

  /**
   * Check if license is currently valid (verified + not expired).
   */
  const isCurrentlyValid = useCallback((): boolean => {
    if (!licenseState.verified) return false;
    if (isExpired) return false;
    return true;
  }, [licenseState.verified, isExpired]);

  /**
   * Call this when user tries to use a locked feature.
   * Returns true if access granted, false if locked (and opens the activate modal).
   * Also checks expiry — if expired, auto-clears and shows modal.
   */
  const requireLicense = useCallback((): boolean => {
    // Check expiry first
    if (licenseState.verified && checkExpiry()) {
      // Just expired — show activate modal
      setShowActivate(true);
      return false;
    }
    if (licenseState.verified && !isExpired) return true;
    setShowActivate(true);
    return false;
  }, [licenseState.verified, isExpired, checkExpiry]);

  /**
   * Call this when user tries to use an ELITE-only feature.
   * Returns true only for elite/lifetime keys (not expired).
   */
  const requireElite = useCallback((): boolean => {
    if (!licenseState.verified) {
      setShowActivate(true);
      return false;
    }
    if (checkExpiry()) {
      setShowActivate(true);
      return false;
    }
    const kt = licenseState.keyType;
    return kt === "elite" || kt === "lifetime";
  }, [licenseState.verified, licenseState.keyType, checkExpiry]);

  // Derived flags — use isCurrentlyValid for accurate expiry check
  const isLicensed = isCurrentlyValid();
  const isElite = isCurrentlyValid() && (licenseState.keyType === "elite" || licenseState.keyType === "lifetime");
  const isPro = isLicensed && (isElite || licenseState.keyType === "monthly");
  const isTrial = isLicensed && (licenseState.keyType === "trial" || licenseState.keyType === "weekly" || licenseState.keyType === "match_basic" || licenseState.keyType === "match_full");

  return {
    isLicensed,
    isExpired,
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
