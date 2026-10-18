"use client";

/**
 * Global Error Boundary
 * ======================
 *
 * This catches errors that escape the route-level error.tsx — i.e.
 * errors thrown while rendering the ROOT layout itself (RootLayout in
 * src/app/layout.tsx).
 *
 * Why this matters: layout.tsx mounts <AppBootstrap />, <SecurityOverlay />,
 * <OfflineIndicator />, <ServiceWorkerRegister /> and the Sonner/Toaster
 * providers. If ANY of those throws during initial mount (e.g. a corrupt
 * localStorage entry, a framer-motion hydration mismatch, or a stale
 * service worker), Next.js's default white "Application error" page took
 * over and the whole app was unusable. global-error.tsx replaces that
 * white screen with a recoverable UI.
 *
 * Note: global-error.tsx MUST render its own <html> + <body> tags because
 * it replaces the entire root layout when it kicks in.
 */

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error("[app/global-error.tsx] Global error caught:", error);
  }, [error]);

  function handleHardReload() {
    if (typeof window !== "undefined") {
      // Clear non-essential caches that could be causing layout-level crashes.
      // Keep license + auth so user doesn't have to log in again.
      try {
        const PROTECTED = new Set([
          "apna-cricket-license",
          "apna-cricket-auth",
          "apna-cricket-theme",
          "apna-cricket-fp",
        ]);
        const remove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && !PROTECTED.has(k)) remove.push(k);
        }
        remove.forEach((k) => localStorage.removeItem(k));
        // Also clear any stale service worker that might be serving bad assets
        if ("serviceWorker" in navigator) {
          navigator.serviceWorker.getRegistrations().then((regs) => {
            regs.forEach((r) => r.unregister());
          });
        }
      } catch {
        /* ignore */
      }
      window.location.reload();
    }
  }

  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className="antialiased bg-background text-foreground"
        style={{ margin: 0, minHeight: "100vh" }}
      >
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            textAlign: "center",
            background: "#050810",
            color: "#fafafa",
            fontFamily:
              "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "rgba(245, 158, 11, 0.1)",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <AlertTriangle size={32} color="#fbbf24" />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 900, margin: "0 0 8px" }}>
            App failed to load
          </h1>
          <p
            style={{
              fontSize: 13,
              color: "rgba(250, 250, 250, 0.6)",
              maxWidth: 420,
              margin: "0 0 12px",
            }}
          >
            A critical error prevented the app from starting. Your account and
            license are safe — reload to try again.
          </p>
          {error?.message && (
            <p
              style={{
                fontSize: 11,
                fontFamily: "monospace",
                color: "rgba(251, 191, 36, 0.8)",
                background: "rgba(245, 158, 11, 0.05)",
                border: "1px solid rgba(245, 158, 11, 0.2)",
                borderRadius: 8,
                padding: "6px 12px",
                marginTop: 12,
                maxWidth: 420,
                wordBreak: "break-word",
              }}
            >
              {error.message}
            </p>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
            <button
              onClick={reset}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                height: 44,
                padding: "0 20px",
                borderRadius: 12,
                background: "#f59e0b",
                color: "#000",
                fontWeight: 700,
                fontSize: 14,
                border: "none",
                cursor: "pointer",
              }}
            >
              <RefreshCw size={16} />
              Try again
            </button>
            <button
              onClick={handleHardReload}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                height: 44,
                padding: "0 20px",
                borderRadius: 12,
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                color: "#fafafa",
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
