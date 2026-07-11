"use client";

import { useEffect } from "react";
import { getDeviceFingerprint } from "@/lib/lockout";

/**
 * Screenshot Protection + Security Overlay
 * -----------------------------------------
 * On web (browser), TRUE screenshot blocking is IMPOSSIBLE — browsers don't allow it.
 * But we CAN add deterrents:
 *
 * 1. Blur content when user switches tabs (visibilitychange = hidden)
 *    This prevents OS-level screenshots while tab is in background
 * 2. Add watermark overlay with device fingerprint (visible deterrent)
 * 3. Detect PrintScreen key and clear content immediately
 *
 * (FIREBASE-CLEANUP) Lockout state is no longer restored from Firebase.
 * The device fingerprint (recomputed from hardware on every load) is
 * enough to identify a returning device locally without any remote sync.
 */
export function SecurityOverlay() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Blur content when tab is hidden (prevents background screenshots)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        document.body.style.filter = "blur(20px)";
        document.body.style.transition = "filter 0.1s";
      } else {
        document.body.style.filter = "";
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // 2. Detect PrintScreen key — clear content immediately
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen" || e.keyCode === 44) {
        // Clear clipboard and blur
        navigator.clipboard?.writeText("").catch(() => {});
        document.body.style.filter = "blur(30px)";
        setTimeout(() => {
          document.body.style.filter = "";
        }, 500);
        console.warn("[Security] Screenshot attempt detected");
      }
      // Block Ctrl+P (print), Ctrl+S (save), Ctrl+U (view source)
      if (
        (e.ctrlKey && (e.key === "p" || e.key === "s" || e.key === "u")) ||
        (e.metaKey && (e.key === "p" || e.key === "s" || e.key === "u"))
      ) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);

    // 3. Detect copy attempt and clear clipboard
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      e.clipboardData?.setData("text/plain", "⚠️ Screenshot/Copy not allowed — Apna Cricket");
      return false;
    };
    document.addEventListener("copy", handleCopy);

    // 4. Add watermark with device fingerprint (deterrent)
    const fp = getDeviceFingerprint();
    const watermark = document.createElement("div");
    watermark.id = "security-watermark";
    watermark.style.cssText = `
      position: fixed;
      bottom: 4px;
      right: 4px;
      font-size: 8px;
      color: rgba(255,255,255,0.15);
      pointer-events: none;
      z-index: 9999;
      font-family: monospace;
      user-select: none;
    `;
    watermark.textContent = `ID:${fp.slice(0, 12)}`;
    document.body.appendChild(watermark);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("copy", handleCopy);
      watermark.remove();
    };
  }, []);

  return null;
}
