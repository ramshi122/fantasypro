"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (/public/sw.js) for PWA installability
 * and offline support. Runs only in production to avoid stale cache
 * issues during development.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // Only register in production — in dev, the SW cache can mask HMR updates
    if (process.env.NODE_ENV !== "production") return;

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        console.log("[SW] Registered with scope:", reg.scope);

        // Listen for updates
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              // New version available — activate it immediately
              console.log("[SW] New version available — activating");
              newWorker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      } catch (err) {
        console.warn("[SW] Registration failed:", err);
      }
    };

    // Register after window load to not block initial render
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
