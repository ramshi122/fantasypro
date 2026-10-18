"use client";

import React, { Component, useEffect, type ReactNode } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";

/**
 * GlobalCrashGuard — APK crash fix
 * =================================
 * The app runs inside a WebAPK (no URL bar, no refresh button). When any
 * render error produced a white screen, users were stuck and reported it as
 * "APK crash". This guard makes the app self-healing:
 *
 *  1. ErrorBoundary around the WHOLE app — render crashes show a recovery
 *     screen with "Reload App" instead of a dead white screen.
 *  2. Auto-recovery: up to 2 automatic soft reloads per session when the
 *     crash happens within 5 s of load (hydration / boot crashes).
 *  3. window.onerror + unhandledrejection handlers — log and count errors;
 *     never let an async error kill the app silently.
 *  4. Session crash counter — if the app crashes 3+ times in a row, offer
 *     "Clear cached data" (corrupt localStorage can boot-loop the app).
 */

const CRASH_COUNT_KEY = "apna-crash-count";
const CRASH_TS_KEY = "apna-last-crash-ts";
const MAX_AUTO_RELOADS = 2;

function recordCrash(): number {
  try {
    const count = Number(sessionStorage.getItem(CRASH_COUNT_KEY) || "0") + 1;
    sessionStorage.setItem(CRASH_COUNT_KEY, String(count));
    sessionStorage.setItem(CRASH_TS_KEY, String(Date.now()));
    return count;
  } catch {
    return 1;
  }
}

function getCrashCount(): number {
  try {
    return Number(sessionStorage.getItem(CRASH_COUNT_KEY) || "0");
  } catch {
    return 0;
  }
}

function clearCrashCount() {
  try {
    sessionStorage.removeItem(CRASH_COUNT_KEY);
    sessionStorage.removeItem(CRASH_TS_KEY);
  } catch {}
}

interface GuardProps { children: ReactNode; }
interface GuardState { hasError: boolean; error?: Error; autoReloading: boolean; countdown: number; }

export class GlobalCrashGuard extends Component<GuardProps, GuardState> {
  private autoReloadTimer: ReturnType<typeof setInterval> | null = null;

  constructor(props: GuardProps) {
    super(props);
    this.state = { hasError: false, autoReloading: false, countdown: 3 };
  }

  static getDerivedStateFromError(error: Error): Partial<GuardState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const count = recordCrash();
    console.error("[CrashGuard] Render error caught:", error, errorInfo?.componentStack);
    this.maybeAutoReload(count);
  }

  maybeAutoReload = (crashCount: number) => {
    // Boot crash (within 5s of load) + under the auto-reload budget → soft reload
    const perf = typeof performance !== "undefined" ? performance.now() : 0;
    const isBootCrash = perf < 5000;
    if (isBootCrash && crashCount <= MAX_AUTO_RELOADS) {
      this.setState({ autoReloading: true, countdown: 3 });
      this.autoReloadTimer = setInterval(() => {
        this.setState(
          (s) => ({ countdown: s.countdown - 1 }),
          () => {
            if (this.state.countdown <= 0) {
              if (this.autoReloadTimer) clearInterval(this.autoReloadTimer);
              try { window.location.reload(); } catch {}
            }
          }
        );
      }, 1000);
    }
  };

  componentWillUnmount() {
    if (this.autoReloadTimer) clearInterval(this.autoReloadTimer);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const crashCount = getCrashCount();
    const tooManyCrashes = crashCount > MAX_AUTO_RELOADS;

    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-sm w-full rounded-2xl border border-red-900/40 bg-red-950/20 p-6 text-center">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-amber-500" />
          <h1 className="text-lg font-black mb-2 text-foreground">App hit a snag</h1>
          <p className="text-sm text-muted-foreground mb-1">
            Don&apos;t worry — your teams and settings are safe.
          </p>
          {this.state.error && (
            <p className="text-[11px] text-muted-foreground/60 mb-4 break-words font-mono">
              {this.state.error.message?.slice(0, 140)}
            </p>
          )}
          {this.state.autoReloading && !tooManyCrashes ? (
            <p className="text-sm font-bold text-primary">Reloading in {this.state.countdown}s…</p>
          ) : tooManyCrashes ? (
            <>
              <p className="text-sm font-bold text-amber-500 mb-3">
                App crashed {crashCount} times in a row. Try clearing cached data.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    try {
                      // Preserve license + auth — clear everything else
                      const keep = [
                        "apna-cricket-license", "apna-license-key", "apna-device-id",
                        "apna-cricket-admin-keys", "apna-cricket-splash-shown",
                      ];
                      const saved: Record<string, string> = {};
                      for (const k of keep) {
                        const v = localStorage.getItem(k);
                        if (v) saved[k] = v;
                      }
                      localStorage.clear();
                      for (const [k, v] of Object.entries(saved)) localStorage.setItem(k, v);
                      sessionStorage.clear();
                    } catch {}
                    clearCrashCount();
                    window.location.reload();
                  }}
                  className="w-full h-11 rounded-xl bg-amber-600 text-white font-bold text-sm active:scale-95 transition"
                >
                  🧹 Clear cached data & reload
                </button>
                <button
                  onClick={() => { clearCrashCount(); window.location.reload(); }}
                  className="w-full h-11 rounded-xl border border-border font-bold text-sm active:scale-95 transition"
                >
                  Just reload
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => { clearCrashCount(); window.location.reload(); }}
              className="mt-3 inline-flex items-center gap-2 h-11 px-6 rounded-xl bg-primary text-primary-foreground font-bold text-sm active:scale-95 transition"
            >
              <RefreshCw className="w-4 h-4" /> Reload App
            </button>
          )}
        </div>
      </div>
    );
  }
}

/**
 * GlobalAsyncErrors — installs window.onerror + unhandledrejection handlers.
 * Async errors do NOT unmount React, but they previously failed silently and
 * left the UI in a broken state (e.g. generation stuck). Logging them here
 * gives visibility; nothing is thrown.
 */
export function GlobalAsyncErrors() {
  useEffect(() => {
    const onError = (ev: ErrorEvent) => {
      console.error("[CrashGuard] window.onerror:", ev.message, ev.filename?.slice(0, 80), "line", ev.lineno);
    };
    const onRejection = (ev: PromiseRejectionEvent) => {
      const reason = ev?.reason;
      const msg = reason instanceof Error ? reason.message : String(reason);
      // Firebase permission errors and network blips are expected noise — don't spam
      if (/permission-denied|network|Failed to fetch|timeout/i.test(msg)) return;
      console.error("[CrashGuard] unhandled rejection:", msg);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
