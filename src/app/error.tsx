"use client";

/**
 * Route-level Error Boundary
 * ===========================
 *
 * Catches ANY client-side exception thrown while rendering the "/" route
 * (the main app: HomeScreen, MatchDetailScreen, ProfileScreen, etc.).
 *
 * Before this file existed, an uncaught client-side crash would show
 * Next.js's raw white "Application error: a client-side exception has
 * occurred" page — which is exactly what users were seeing on
 * fantasypro.vercel.app and the space-z.ai preview URL.
 *
 * With this file in place, the same crash shows a friendly dark UI with
 * the actual error message and a "Try again" button that resets the
 * boundary without a full page reload (so the user keeps their
 * localStorage license + cached matches).
 */

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log so we can debug from browser console / Sentry-style trackers
    console.error("[app/error.tsx] Route error caught:", error);
  }, [error]);

  function handleReload() {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }

  function handleClearAndReload() {
    if (typeof window === "undefined") return;
    // Last-resort: clear potentially corrupted client caches that may have
    // caused the crash, then reload. We deliberately DO NOT touch the
    // license key (apna-cricket-license) or auth (apna-cricket-auth) so
    // the user stays logged in.
    try {
      const PROTECTED_KEYS = new Set([
        "apna-cricket-license",
        "apna-cricket-auth",
        "apna-cricket-theme",
        "apna-cricket-fp",
      ]);
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && !PROTECTED_KEYS.has(k)) toRemove.push(k);
      }
      toRemove.forEach((k) => localStorage.removeItem(k));
    } catch {
      /* ignore */
    }
    window.location.reload();
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-4">
        <AlertTriangle className="w-8 h-8 text-amber-400" />
      </div>
      <h1 className="text-2xl font-black text-foreground mb-2">Something went wrong</h1>
      <p className="text-sm text-muted-foreground max-w-md mb-1">
        The app hit an unexpected error. Your data is safe — try again, or reload the page.
      </p>
      {error?.message && (
        <p className="text-[11px] font-mono text-amber-500/80 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-1.5 mt-3 max-w-md break-words">
          {error.message}
        </p>
      )}
      <div className="flex items-center gap-2 mt-6">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-amber-500 text-black font-bold text-sm hover:bg-amber-400 transition-colors active:scale-95"
        >
          <RefreshCw className="w-4 h-4" />
          Try again
        </button>
        <button
          onClick={handleReload}
          className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-white/5 border border-white/10 text-foreground font-semibold text-sm hover:bg-white/10 transition-colors active:scale-95"
        >
          <Home className="w-4 h-4" />
          Reload
        </button>
      </div>
      <button
        onClick={handleClearAndReload}
        className="mt-4 text-xs text-muted-foreground/60 underline underline-offset-4 hover:text-muted-foreground"
      >
        Clear cache & reload
      </button>
    </div>
  );
}
