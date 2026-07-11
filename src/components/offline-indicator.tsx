"use client";

import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Offline Indicator — shows when the app has no network connection.
 * Mount once at the app root (layout.tsx).
 */
export function OfflineIndicator() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    function update() {
      setOnline(navigator.onLine);
    }
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <AnimatePresence>
      {!online && (
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -50, opacity: 0 }}
          className="fixed top-0 left-0 right-0 z-[200] bg-amber-600 text-white px-3 py-1.5 flex items-center justify-center gap-2 text-xs font-bold shadow-lg"
        >
          <WifiOff className="w-3.5 h-3.5" />
          <span>You&apos;re offline — viewing cached teams &amp; matches</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Hook to cache teams/matches for offline use via service worker.
 */
export function useOfflineCache() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    function postToSW(type: string, payload: unknown) {
      if (!navigator.serviceWorker?.controller) return;
      try {
        navigator.serviceWorker.controller.postMessage({ type, payload });
      } catch {
        /* ignore */
      }
    }

    function cacheTeams() {
      try {
        const raw = localStorage.getItem("apna-cricket-teams");
        if (raw) postToSW("CACHE_TEAMS", JSON.parse(raw));
      } catch {
        /* ignore */
      }
    }

    function cacheMatches() {
      try {
        const raw = localStorage.getItem("apna-cricket-matches");
        if (raw) postToSW("CACHE_MATCHES", JSON.parse(raw));
      } catch {
        /* ignore */
      }
    }

    cacheTeams();
    cacheMatches();

    // Re-cache on storage changes
    window.addEventListener("storage", (e) => {
      if (e.key === "apna-cricket-teams") cacheTeams();
      if (e.key === "apna-cricket-matches") cacheMatches();
    });
  }, []);
}

/**
 * Helper to show online status badge (small icon).
 */
export function OnlineStatusBadge() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    function update() {
      setOnline(navigator.onLine);
    }
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <span
      className={`inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded ${
        online ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
      }`}
    >
      {online ? <Wifi className="w-2.5 h-2.5" /> : <WifiOff className="w-2.5 h-2.5" />}
      {online ? "Online" : "Offline"}
    </span>
  );
}
