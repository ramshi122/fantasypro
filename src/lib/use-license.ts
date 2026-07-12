"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  getLicenseState,
  setLicenseVerified,
  clearLicense,
  getDeviceId,
  useAdmin,
  type KeyType,
} from "./admin-store";

/**
 * Server Time Cache
 * ==================
 * Fetches server time from /api/admin/time every 30 seconds.
 * All expiry checks use this server time — NOT device Date.now().
 * This ensures all devices show the same expiry countdown.
 */
let cachedServerTime: number | null = null;
let lastServerTimeFetch: number = 0;
const SERVER_TIME_CACHE_MS = 30_000; // 30 seconds

async function getServerTime(): Promise<number> {
  // Return cached value if fresh (< 30s old)
  if (cachedServerTime && Date.now() - lastServerTimeFetch < SERVER_TIME_CACHE_MS) {
    return cachedServerTime;
  }

  try {
    const res = await fetch("/api/admin/time");
    if (res.ok) {
      const data = await res.json();
      if (data.serverTime) {
        cachedServerTime = data.serverTime;
        lastServerTimeFetch = Date.now();
        return data.serverTime;
      }
    }
  } catch {
    // Network error — use cached or device time
  }

  return cachedServerTime || Date.now();
}

// Also check localStorage cache (set by admin-realtime-sync onSnapshot)
function getCachedServerTime(): number {
  if (typeof window === "undefined") return Date.now();
  try {
    const lsTime = localStorage.getItem("apna-server-time");
    const lsFetched = localStorage.getItem("apna-server-time-fetched");
    if (lsTime && lsFetched) {
      const serverTime = Number(lsTime);
      const fetchedAt = Number(lsFetched);
      // If cached within last 60 seconds, use it
      if (Date.now() - fetchedAt < 60_000) {
        return serverTime + (Date.now() - fetchedAt);
      }
    }
  } catch {
    // ignore
  }
  return Date.now();
}

/**
 * useLicense Hook
 * ----------------
 * Tracks license verification status across the app.
 *
 * Features:
 *   - Auto-expires license when expiresAt is reached (using SERVER TIME)
 *   - Periodic check (every 30s) to auto-lock on expiry
 *   - isLicensed returns false if key is expired
 *   - requireLicense() checks expiry before granting access
 *
 * IMPORTANT: Expiry uses SERVER TIME (not device time) so all devices
 * show the same expiry countdown — no 1-minute difference.
 *
 * Key Tiers:
 *   trial       — basic access (1 day)
 *   match_basic — 1 match (6 hours)
 *   match_full  — 24 hours
 *   weekly      — 7 days
 *   monthly     — pro access (30 days)
 *   half_yearly — 6 months (180 days)
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
   * Uses SERVER TIME (not device time) for accurate expiry.
   * SECURITY FIX: If key not in local store, mark as expired (not "keep verified").
   * Prevents localStorage manipulation to fake license state.
   */
  const checkExpiry = useCallback(() => {
    if (!licenseState.verified || !licenseState.key) {
      setIsExpired(false);
      return false;
    }

    // Find the key in admin store to get expiresAt
    const keyObj = admin.keys.find((k) => k.key === licenseState.key);
    if (!keyObj) {
      // SECURITY FIX: Key not found → DO NOT keep verified.
      // Previously: "keeping verified (Firebase sync pending)" — this was a loophole!
      // Now: mark as expired → forces re-verification via Firebase.
      console.log("[useLicense] Key not in local store — marking expired (security fix)");
      clearLicense();
      setLicenseState({ verified: false, key: null, deviceId: getDeviceId(), keyType: null });
      setIsExpired(true);
      return true;
    }

    if (keyObj.status === "suspended") {
      console.log("[useLicense] Key suspended — auto-clearing");
      clearLicense();
      setLicenseState({ verified: false, key: null, deviceId: getDeviceId(), keyType: null });
      setIsExpired(true);
      return true;
    }

    // SERVER TIME expiry check — NOT device Date.now()
    // This ensures all devices show the same expiry countdown
    const serverTime = getCachedServerTime();
    if (keyObj.expiresAt && keyObj.expiresAt < serverTime) {
      console.log("[useLicense] Key expired (server time) — auto-clearing");
      console.log(`[useLicense] expiresAt: ${new Date(keyObj.expiresAt).toISOString()}`);
      console.log(`[useLicense] serverTime: ${new Date(serverTime).toISOString()}`);
      clearLicense();
      setLicenseState({ verified: false, key: null, deviceId: getDeviceId(), keyType: null });
      setIsExpired(true);
      return true;
    }

    setIsExpired(false);
    return false;
  }, [licenseState.verified, licenseState.key, admin.keys]);

  // Auto-verify on mount — FIX: Use a flag to prevent auto-clear on phone lock/unlock
  const hasVerifiedRef = useRef(false);
  useEffect(() => {
    if (hasVerifiedRef.current) return; // Only verify once per session
    if (!licenseState.verified || !licenseState.key) return;

    hasVerifiedRef.current = true;

    // Give Firebase time to sync before checking
    const timer = setTimeout(async () => {
      try {
        const result = await admin.verifyLicense(licenseState.key, licenseState.deviceId);
        if (!result.valid) {
          // FIX: Don't auto-clear immediately — check if Firebase is still syncing
          // Only clear if we get a definitive "expired" or "suspended" response
          const msg = (result as any).message || "";
          if (msg.includes("expired") || msg.includes("suspended") || msg.includes("not found")) {
            console.log("[useLicense] License invalid (confirmed) — clearing");
            clearLicense();
            setLicenseState({ verified: false, key: null, deviceId: getDeviceId(), keyType: null });
            setIsExpired(true);
          } else {
            // SECURITY FIX: Don't keep verified on inconclusive results.
            // Previously: "keeping verified" — this was a loophole!
            // Now: clear license — forces re-verification
            console.log("[useLicense] License check inconclusive — clearing (security fix)");
            clearLicense();
            setLicenseState({ verified: false, key: null, deviceId: getDeviceId(), keyType: null });
            setIsExpired(true);
          }
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
      } catch (err) {
        // Network error — don't clear license
        console.log("[useLicense] Verify error — keeping license:", err);
      }
    }, 2000); // Wait 2s for Firebase to sync

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // SERVER TIME SYNC — fetch server time every 30 seconds
  // This ensures all devices use the same time for expiry checks
  useEffect(() => {
    if (!licenseState.verified) return;

    // Fetch server time immediately
    getServerTime().then((time) => {
      if (typeof window !== "undefined") {
        localStorage.setItem("apna-server-time", String(time));
        localStorage.setItem("apna-server-time-fetched", String(Date.now()));
      }
    });

    // Refresh server time every 30 seconds
    const timeInterval = setInterval(async () => {
      const time = await getServerTime();
      if (typeof window !== "undefined") {
        localStorage.setItem("apna-server-time", String(time));
        localStorage.setItem("apna-server-time-fetched", String(Date.now()));
      }
    }, 30_000); // 30 seconds

    return () => clearInterval(timeInterval);
  }, [licenseState.verified]);

  // Periodic expiry check — every 30 seconds (using SERVER TIME)
  // This ensures expiry happens at the EXACT same moment on all devices
  useEffect(() => {
    if (!licenseState.verified) return;

    // Check immediately
    checkExpiry();

    // Check every 30 seconds (was 2 minutes — too slow for accurate expiry)
    const interval = setInterval(() => {
      checkExpiry();
    }, 30_000); // 30 seconds — ensures expiry within 30s of actual expiry time

    return () => clearInterval(interval);
  }, [licenseState.verified, checkExpiry]);

  const activate = useCallback(async (key: string): Promise<{ success: boolean; message: string }> => {
    setVerifying(true);
    const cleanKey = key.trim().toUpperCase();
    console.log("[useLicense] Activating key:", cleanKey);

    return new Promise((resolve) => {
      setTimeout(async () => {
        const deviceId = getDeviceId();
        const result = await admin.verifyLicense(cleanKey, deviceId);
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
    expiresAt: licenseState.expiresAt,
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
