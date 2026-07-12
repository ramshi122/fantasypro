"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getMatches, type MatchInfo } from "@/lib/api";

interface LineupAlert {
  id: string;
  matchId: string;
  matchTitle: string;
  team1: string;
  team2: string;
  type: "lineup" | "match-start" | "toss";
  timestamp: number;
}

/**
 * Lineup Alert Manager — 30 Second Auto-Track
 * =============================================
 *
 * സവിശേഷതകൾ:
 *   1. 30 സെക്കൻഡ് ഇടവേളയിൽ സ്വയം മത്സരങ്ങൾ ഫെച്ച് ചെയ്യുക
 *   2. അണിവരെ പ്രഖ്യാപിച്ചാൽ ഉടൻ അറിയിപ്പ് (popup + toast + sound)
 *   3. 30 മിനിറ്റ് മുമ്പ് മത്സര ആരംഭ അറിയിപ്പ്
 *   4. ടോസ് കഴിഞ്ഞാൽ അറിയിപ്പ്
 *   5. നിരസിക്കാൻ കഴിയുന്ന പോപ്പഅപ്പ്
 *   6. ശബ്ദ അറിയിപ്പ് (beep)
 *   7. ബ്രൗസർ അറിയിപ്പ് (Notification API ഉപയോഗിച്ച്)
 */
export function LineupAlertManager() {
  const [activeAlert, setActiveAlert] = useState<LineupAlert | null>(null);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [pendingAlerts, setPendingAlerts] = useState<LineupAlert[]>([]);
  const [isTracking, setIsTracking] = useState(false);
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const [trackedMatches, setTrackedMatches] = useState<MatchInfo[]>([]);

  const prevLineupStatus = useRef<Map<string, number>>(new Map());
  const alertedMatches = useRef<Set<string>>(new Set());

  // Load dismissed alerts
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = localStorage.getItem("apna-cricket-dismissed-alerts");
      if (stored) setDismissedAlerts(new Set(JSON.parse(stored)));
    } catch { /* ignore */ }
  }, []);

  // Request notification permission
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    }
  }, []);

  // === 30-SECOND AUTO-TRACK ===
  const checkLineups = useCallback(async () => {
    setIsTracking(true);
    try {
      const matches = await getMatches("cricket");
      setTrackedMatches(matches);
      setLastChecked(Date.now());

      for (const match of matches) {
        const matchId = String(match.matchId ?? match.id ?? "");
        if (!matchId) continue;

        // 1. Lineup status check (0 → 1 = announced)
        const currentStatus = Number((match as any).lineup_status ?? 0);
        const prevStatus = prevLineupStatus.current.get(matchId) ?? 0;
        prevLineupStatus.current.set(matchId, currentStatus);

        if (currentStatus === 1 && prevStatus === 0) {
          const alertId = `lineup-${matchId}`;
          if (!dismissedAlerts.has(alertId) && !alertedMatches.current.has(alertId)) {
            alertedMatches.current.add(alertId);
            const team1Name = typeof match.team1 === "string" ? match.team1 : (match.team1?.shortName || match.team1?.name || "T1");
            const team2Name = typeof match.team2 === "string" ? match.team2 : (match.team2?.shortName || match.team2?.name || "T2");
            const alert: LineupAlert = {
              id: alertId, matchId,
              matchTitle: (match as any).title || (match as any).series || `${team1Name} vs ${team2Name}`,
              team1: team1Name, team2: team2Name,
              type: "lineup", timestamp: Date.now(),
            };
            setPendingAlerts(prev => [...prev, alert]);
            playSound();
            showToast(alert);
            showBrowserNotification(alert);
          }
        }

        // 2. Match starting soon (30 min before)
        const startTime = (match as any).start_time ?? (match as any).startTime ?? (match as any).timestamp;
        if (startTime) {
          const startMs = typeof startTime === "number"
            ? (startTime < 1e12 ? startTime * 1000 : startTime)
            : new Date(startTime).getTime();
          if (!isNaN(startMs)) {
            const diffMin = (startMs - Date.now()) / 60000;
            const startAlertId = `start-${matchId}`;
            if (diffMin > 0 && diffMin <= 30 && !alertedMatches.current.has(startAlertId) && !dismissedAlerts.has(startAlertId)) {
              alertedMatches.current.add(startAlertId);
              const team1Name = typeof match.team1 === "string" ? match.team1 : (match.team1?.shortName || match.team1?.name || "T1");
              const team2Name = typeof match.team2 === "string" ? match.team2 : (match.team2?.shortName || match.team2?.name || "T2");
              const alert: LineupAlert = {
                id: startAlertId, matchId,
                matchTitle: (match as any).title || (match as any).series || `${team1Name} vs ${team2Name}`,
                team1: team1Name, team2: team2Name,
                type: "match-start", timestamp: Date.now(),
              };
              setPendingAlerts(prev => [...prev, alert]);
              playSound();
              showToast(alert);
              showBrowserNotification(alert);
            }
          }
        }
      }
    } catch (err) {
      console.error("[LineupAlert] Fetch error:", err);
    } finally {
      setIsTracking(false);
    }
  }, [dismissedAlerts]);

  // Start tracking immediately + every 30 seconds
  useEffect(() => {
    // Check immediately
    checkLineups();

    // Check every 30 seconds (user requirement)
    const interval = setInterval(() => {
      checkLineups();
    }, 30_000); // 30 seconds

    return () => clearInterval(interval);
  }, [checkLineups]);

  // Process pending alerts
  useEffect(() => {
    if (!activeAlert && pendingAlerts.length > 0) {
      const [next, ...rest] = pendingAlerts;
      setActiveAlert(next);
      setPendingAlerts(rest);
    }
  }, [activeAlert, pendingAlerts]);

  // Play notification sound
  function playSound() {
    if (typeof window === "undefined") return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      // Double beep for lineup alerts
      for (let i = 0; i < 2; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(880, ctx.currentTime + i * 0.3);
        osc.frequency.setValueAtTime(1100, ctx.currentTime + i * 0.3 + 0.1);
        gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.3);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.3 + 0.25);
        osc.start(ctx.currentTime + i * 0.3); osc.stop(ctx.currentTime + i * 0.3 + 0.25);
      }
    } catch { /* audio not available */ }
  }

  // Show toast notification
  function showToast(alert: LineupAlert) {
    const msg = alert.type === "lineup"
      ? "🎉 Lineup Announced!"
      : alert.type === "match-start"
      ? "⏰ Match Starting Soon!"
      : "🎯 Toss Completed!";

    toast.success(msg, {
      description: `${alert.team1} vs ${alert.team2} — ${alert.matchTitle}`,
      duration: 10000,
      position: "top-center",
    });
  }

  // Show browser notification
  function showBrowserNotification(alert: LineupAlert) {
    if (typeof window === "undefined") return;
    try {
      if ("Notification" in window && Notification.permission === "granted") {
        const title = alert.type === "lineup"
          ? "🎉 Lineup Announced!"
          : alert.type === "match-start"
          ? "⏰ Match Starting Soon!"
          : "🎯 Toss Completed!";

        const body = `${alert.team1} vs ${alert.team2}\n${alert.matchTitle}`;

        const notification = new Notification(title, {
          body,
          icon: "/icon-192.png",
          tag: alert.id,
          requireInteraction: true,
        });

        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      }
    } catch { /* ignore */ }
  }

  // Dismiss alert
  function dismiss(alert: LineupAlert) {
    setActiveAlert(null);
    setDismissedAlerts(prev => {
      const newSet = new Set([...prev, alert.id]);
      if (typeof window !== "undefined") {
        localStorage.setItem("apna-cricket-dismissed-alerts", JSON.stringify([...newSet]));
      }
      return newSet;
    });
  }

  return (
    <>
      {/* Tracking indicator — small badge showing live tracking */}
      <div className="fixed top-1 right-1 z-40 pointer-events-none">
        <div className={cn(
          "flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold",
          isTracking ? "bg-emerald-500 text-white" : "bg-slate-500 text-white/70"
        )}>
          <RefreshCw className={cn("w-2 h-2", isTracking && "animate-spin")} />
          {isTracking ? "LIVE" : "30s"}
        </div>
      </div>

      {/* Full-screen popup alert */}
      <AnimatePresence>
        {activeAlert && !dismissedAlerts.has(activeAlert.id) && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => dismiss(activeAlert)}
          >
            <motion.div
              initial={{ scale: 0.8, y: 40 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.8, y: 40 }}
              transition={{ type: "spring", duration: 0.5 }}
              className={cn(
                "w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden",
                activeAlert.type === "lineup" ? "bg-gradient-to-br from-emerald-600 to-green-700"
                : activeAlert.type === "toss" ? "bg-gradient-to-br from-violet-600 to-purple-700"
                : "bg-gradient-to-br from-amber-500 to-orange-600"
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-5 text-white text-center relative">
                <button onClick={() => dismiss(activeAlert)} className="absolute top-3 right-3 p-1 rounded-full hover:bg-white/20">
                  <X className="w-5 h-5" />
                </button>
                <motion.div
                  initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: "spring" }}
                  className="w-16 h-16 mx-auto rounded-full bg-white/20 flex items-center justify-center mb-3"
                >
                  {activeAlert.type === "lineup" ? <CheckCircle2 className="w-8 h-8" />
                  : activeAlert.type === "toss" ? <AlertCircle className="w-8 h-8" />
                  : <Bell className="w-8 h-8" />}
                </motion.div>
                <h2 className="text-lg font-black">
                  {activeAlert.type === "lineup" ? "🎉 Lineup Announced!"
                  : activeAlert.type === "toss" ? "🎯 Toss Completed!"
                  : "⏰ Match Starting Soon!"}
                </h2>
                <p className="text-xs text-white/80 mt-1">{activeAlert.matchTitle}</p>
              </div>
              <div className="bg-black/20 p-4">
                <div className="flex items-center justify-between text-white mb-3">
                  <span className="text-sm font-bold flex-1 text-center">{activeAlert.team1}</span>
                  <span className="text-[10px] text-white/60 px-2">VS</span>
                  <span className="text-sm font-bold flex-1 text-center">{activeAlert.team2}</span>
                </div>
                <div className="bg-white/10 rounded-xl p-2.5 text-center">
                  <p className="text-xs font-bold text-white">
                    {activeAlert.type === "lineup"
                      ? "✅ Playing XI is now locked — generate teams with confirmed players!"
                      : activeAlert.type === "toss"
                      ? "🎯 Toss done — teams will auto-update with Playing XI!"
                      : "⏳ Match starts in ~30 minutes — lineup will be announced soon!"}
                  </p>
                </div>
              </div>
              <div className="p-4">
                <Button className="w-full h-10 bg-white text-foreground hover:bg-white/90 font-bold text-xs" onClick={() => dismiss(activeAlert)}>
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" /> Got it
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
