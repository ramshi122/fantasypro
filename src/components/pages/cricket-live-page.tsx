"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { RefreshCw, Radio, Calendar, Trophy, ChevronRight, ArrowLeft, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface CrexMatch {
  matchId: string;
  team1Code: string;
  team2Code: string;
  team1Score: string;
  team2Score: string;
  result: string;
  format: string;
  startTime: number;
  finishTime: number;
  venue: string;
  status: number;
  winningTeam: string;
  isLive: boolean;
  isFinished: boolean;
  currentInnings: string;
}

export function CricketLivePage({ onClose }: { onClose: () => void }) {
  const [matches, setMatches] = useState<CrexMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [now, setNow] = useState(Date.now());

  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch("/api/cricket-live?type=live");
      const data = await res.json();
      if (data.status === "success") {
        setMatches(data.data || []);
      }
    } catch {
      // silent fail for auto-refresh
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLive();
  }, [fetchLive]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      fetchLive();
      setNow(Date.now());
    }, 10000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchLive]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const liveMatches = matches.filter(m => m.isLive && !m.isFinished);
  const finishedMatches = matches.filter(m => m.isFinished);
  const upcomingMatches = matches.filter(m => !m.isLive && !m.isFinished && m.startTime > now);

  return (
    <div className="px-4 py-4 pb-24 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="p-2 rounded-full bg-violet-100 dark:bg-violet-900/30">
            <ArrowLeft className="w-4 h-4 text-violet-600" />
          </button>
          <div>
            <h1 className="text-lg font-bold flex items-center gap-1.5">
              <Radio className="w-4 h-4 text-red-500 animate-pulse" />
              CREX Cricket Live
            </h1>
            <p className="text-[10px] text-muted-foreground">Scraped from api.goscorer.com · Auto-refresh 10s</p>
          </div>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setAutoRefresh(v => !v)}
            className={cn("p-2 rounded-full", autoRefresh ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-slate-100 dark:bg-slate-800")}
          >
            <RefreshCw className={cn("w-4 h-4", autoRefresh ? "text-emerald-500 animate-spin" : "text-slate-400")} style={{ animationDuration: "3s" }} />
          </button>
          <button
            onClick={() => { setLoading(true); fetchLive(); }}
            className="p-2 rounded-full bg-violet-100 dark:bg-violet-900/30"
          >
            <RefreshCw className="w-4 h-4 text-violet-600" />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-red-50 dark:bg-red-950/30 rounded-xl p-3 text-center border border-red-200 dark:border-red-900/30">
          <Radio className="w-5 h-5 mx-auto text-red-500 mb-1 animate-pulse" />
          <p className="text-2xl font-black text-red-600">{liveMatches.length}</p>
          <p className="text-[9px] text-muted-foreground uppercase">Live Now</p>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-3 text-center border border-emerald-200 dark:border-emerald-900/30">
          <Calendar className="w-5 h-5 mx-auto text-emerald-500 mb-1" />
          <p className="text-2xl font-black text-emerald-600">{upcomingMatches.length}</p>
          <p className="text-[9px] text-muted-foreground uppercase">Upcoming</p>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 text-center border border-slate-200 dark:border-slate-700">
          <Trophy className="w-5 h-5 mx-auto text-slate-500 mb-1" />
          <p className="text-2xl font-black text-slate-600">{finishedMatches.length}</p>
          <p className="text-[9px] text-muted-foreground uppercase">Finished</p>
        </div>
      </div>

      {/* LIVE MATCHES */}
      {liveMatches.length > 0 && (
        <div>
          <p className="text-xs font-bold text-red-500 mb-2 flex items-center gap-1">
            <Radio className="w-3 h-3 animate-pulse" /> LIVE MATCHES ({liveMatches.length})
          </p>
          <div className="space-y-2">
            {liveMatches.map((m, i) => (
              <motion.div
                key={m.matchId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-white dark:bg-card rounded-xl p-3 border-2 border-red-300 dark:border-red-800 shadow-md"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-bold text-red-500 bg-red-100 dark:bg-red-950/40 px-2 py-0.5 rounded-full animate-pulse">🔴 LIVE</span>
                  <span className="text-[8px] text-muted-foreground">{m.format} · {m.venue}</span>
                </div>
                {/* Team 1 */}
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-black text-foreground">{m.team1Code}</span>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{m.team1Score || "Yet to bat"}</span>
                </div>
                {/* Team 2 */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-black text-foreground">{m.team2Code}</span>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{m.team2Score || "Yet to bat"}</span>
                </div>
                {m.result && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold text-center bg-amber-50 dark:bg-amber-950/20 rounded-lg py-1">
                    {m.result}
                  </p>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* UPCOMING MATCHES */}
      {upcomingMatches.length > 0 && (
        <div>
          <p className="text-xs font-bold text-emerald-500 mb-2 flex items-center gap-1">
            <Calendar className="w-3 h-3" /> UPCOMING ({upcomingMatches.length})
          </p>
          <div className="space-y-2">
            {upcomingMatches.map((m, i) => {
              const diff = m.startTime - now;
              const days = Math.floor(diff / 86400000);
              const hours = Math.floor((diff % 86400000) / 3600000);
              const mins = Math.floor((diff % 3600000) / 60000);
              const countdown = days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
              return (
                <motion.div
                  key={m.matchId}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-white dark:bg-card rounded-xl p-3 border border-emerald-200 dark:border-emerald-900/30"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[8px] text-muted-foreground">{m.format}</span>
                    <span className="text-[9px] font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">{countdown}</span>
                  </div>
                  <div className="flex items-center justify-center gap-3">
                    <span className="text-sm font-bold">{m.team1Code}</span>
                    <span className="text-[10px] text-muted-foreground">vs</span>
                    <span className="text-sm font-bold">{m.team2Code}</span>
                  </div>
                  <p className="text-[8px] text-muted-foreground text-center mt-1">{m.venue}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* FINISHED MATCHES */}
      {finishedMatches.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1">
            <Trophy className="w-3 h-3" /> RECENT RESULTS ({finishedMatches.length})
          </p>
          <div className="space-y-2">
            {finishedMatches.slice(0, 10).map((m, i) => (
              <div key={m.matchId} className="bg-slate-50 dark:bg-slate-800/30 rounded-xl p-3 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[8px] text-muted-foreground">{m.format}</span>
                  <span className="text-[8px] text-slate-400">Finished</span>
                </div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold">{m.team1Code}</span>
                  <span className="text-xs font-bold text-slate-500">{m.team1Score || "—"}</span>
                </div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold">{m.team2Code}</span>
                  <span className="text-xs font-bold text-slate-500">{m.team2Score || "—"}</span>
                </div>
                {m.result && <p className="text-[9px] text-amber-600 font-bold">{m.result}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && matches.length === 0 && (
        <div className="text-center py-8">
          <Activity className="w-8 h-8 mx-auto text-violet-500 animate-spin mb-2" />
          <p className="text-xs text-muted-foreground">Scraping live data from CREX...</p>
        </div>
      )}

      {/* Auto-refresh indicator */}
      {autoRefresh && matches.length > 0 && (
        <div className="text-center">
          <p className="text-[9px] text-muted-foreground flex items-center justify-center gap-1">
            <RefreshCw className="w-2.5 h-2.5 animate-spin" style={{ animationDuration: "3s" }} />
            Auto-refreshing every 10s · {matches.length} matches from CREX
          </p>
        </div>
      )}

      {/* Source */}
      <div className="bg-violet-50 dark:bg-violet-950/20 rounded-xl p-3 border border-violet-200 dark:border-violet-900/30">
        <p className="text-[9px] text-muted-foreground text-center">
          📡 Data scraped from <span className="font-bold text-violet-600">api.goscorer.com</span> (CREX Cricket Exchange)
        </p>
      </div>
    </div>
  );
}
