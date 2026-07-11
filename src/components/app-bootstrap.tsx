"use client";

import { useEffect } from "react";
import { useOfflineCache } from "@/components/offline-indicator";
import { useApplyTheme } from "@/components/theme-toggle";
import { requestNotificationPermission, startNotificationPollers, checkLicenseExpiry } from "@/lib/notifications";
import { requestPushPermission } from "@/lib/push-notifications";
import { ensurePredefinedCoupons } from "@/lib/coupons";
import { useApp } from "@/lib/store";

/**
 * AppBootstrap — runs once on app load:
 *  - Apply theme (dark/light) from localStorage
 *  - Cache teams/matches for offline viewing
 *  - Request notification permission
 *  - Start notification pollers (match start, lineup, license expiry)
 *  - Subscribe to push notifications
 *  - Seed predefined coupons
 */
export function AppBootstrap() {
  useApplyTheme();
  useOfflineCache();

  useEffect(() => {
    // Request notification permission (best-effort)
    requestNotificationPermission().catch(() => undefined);
    requestPushPermission().catch(() => undefined);

    // Start notification pollers
    const matchesGetter = () => {
      try {
        const raw = localStorage.getItem("apna-cricket-matches");
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
      } catch {
        return [];
      }
    };
    const cleanup = startNotificationPollers(matchesGetter);

    // Check license expiry immediately
    checkLicenseExpiry();

    // Seed coupons (fire and forget)
    ensurePredefinedCoupons().catch(() => undefined);

    return cleanup;
  }, []);

  return null;
}
