"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface LineupAlert {
  id: string;
  matchId: string;
  matchTitle: string;
  team1: string;
  team2: string;
  type: "lineup" | "match-start" | "toss";
  timestamp: number;
}

interface LineupAlertManagerProps {
  matches?: Array<{
    matchId?: string;
    id?: string;
    title?: string;
    series?: string;
    team1?: any;
    team2?: any;
    lineup_status?: number;
    start_time?: any;
    startTime?: any;
    timestamp?: any;
  }>;
}

/**
 * Lineup Alert Manager
 * ====================
 * Monitors matches for:
 *   1. Lineup announcements
 *   2. Match starting soon (30 min before)
 *   3. New matches added
 *
 * Shows full-screen cinematic popup + notification sound.
 */
export function LineupAlertManager({ matches = [] }: LineupAlertManagerProps) {
  const [activeAlert, setActiveAlert] = useState<LineupAlert | null>(null);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [pendingAlerts, setPendingAlerts] = useState<LineupAlert[]>([]);
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

  // Check lineup status every 60s
  useEffect(() => {
    if (!matches || matches.length === 0) return;

    const checkAll = () => {
      for (const match of matches) {
        const matchId = String(match.matchId ?? match.id ?? "");
        if (!matchId) continue;

        // 1. Check lineup status change
        const currentStatus = match.lineup_status ?? 0;
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
              matchTitle: match.title || match.series || `${team1Name} vs ${team2Name}`,
              team1: team1Name, team2: team2Name,
              type: "lineup", timestamp: Date.now(),
            };
            setPendingAlerts(prev => [...prev, alert]);
            playSound();
          }
        }

        // 2. Check match starting soon (30 min before)
        const startTime = match.start_time ?? match.startTime ?? match.timestamp;
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
                matchTitle: match.title || match.series || `${team1Name} vs ${team2Name}`,
                team1: team1Name, team2: team2Name,
                type: "match-start", timestamp: Date.now(),
              };
              setPendingAlerts(prev => [...prev, alert]);
              playSound();
            }
          }
        }
      }
    };

    checkAll();
    const interval = setInterval(checkAll, 60000);
    return () => clearInterval(interval);
  }, [matches, dismissedAlerts]);

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
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      osc.frequency.setValueAtTime(1000, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(800, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
    } catch { /* audio not available */ }
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
                {activeAlert.type === "lineup" ? <CheckCircle2 className="w-8 h-8" /> : <Bell className="w-8 h-8" />}
              </motion.div>
              <h2 className="text-lg font-black">
                {activeAlert.type === "lineup" ? "🎉 Lineup Announced!" : "⏰ Match Starting Soon!"}
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
  );
}
