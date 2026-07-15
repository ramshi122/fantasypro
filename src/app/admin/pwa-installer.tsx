"use client";

import { useEffect } from "react";

/**
 * Admin PWA Installer
 * ===================
 * Automatically registers service worker for /admin route
 * and prompts "Add to Home Screen" for APK installation.
 */

export function AdminPWAInstaller() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Register admin service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/admin-sw.js").catch(() => {});
    }

    // PWA install prompt
    let deferredPrompt: any = null;

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt = e;
      // Auto-prompt after 2 seconds
      setTimeout(() => {
        if (deferredPrompt) {
          deferredPrompt.prompt();
          deferredPrompt.userChoice.then(() => {
            deferredPrompt = null;
          });
        }
      }, 2000);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  return null;
}
