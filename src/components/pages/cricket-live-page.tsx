"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { RefreshCw, Radio, Calendar, Trophy, ArrowLeft, Activity, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface CrexMatch {
  matchId: string;
  team1Code: string;
  team2Code: string;
  team1Name?: string;
  team2Name?: string;
  team1Score: string;
  team2Score: string;
  result: string;
  format: string;
  startTime: number;
  finishTime: number;
  venue: string;
  status: number;
  isLive: boolean;
  isFinished: boolean;
  currentInnings: string;
  inningsStatus: number;
}

export function CricketLivePage({ onClose }: { onClose: () => void }) {
  const [matches, setMatches] = useState<CrexMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [selectedMatch, setSelectedMatch] = useState<CrexMatch | null>(null);

  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch("/api/cricket-live?type=live");
      const data = await res.json();
      if (data.status === "success") {
        setMatches(data.data || []);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLive(); }, [fetchLive]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => { fetchLive(); setNow(Date.now()); }, 10000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchLive]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const liveMatches = matches.filter(m => m.isLive && !m.isFinished);
  const finishedMatches = matches.filter(m => m.isFinished);
  const upcomingMatches = matches.filter(m => !m.isLive && !m.isFinished && m.startTime > now);

  function getTeamName(m: CrexMatch, side: 1 | 2): string {
    if (side === 1) return m.team1Name || m.team1Code;
    return m.team2Name || m.team2Code;
  }

  function formatCountdown(ts: number): string {
    if (!ts) return "—";
    const diff = ts - now;
    if (diff <= 0) return "Started";
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }

  // === MATCH DETAIL VIEW ===
  if (selectedMatch) {
    return (
      <div className="px-4 py-4 pb-24 space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedMatch(null)} className="p-2 rounded-full bg-violet-100 dark:bg-violet-900/30">
            <ArrowLeft className="w-4 h-4 text-violet-600" />
          </button>
          <h1 className="text-lg font-bold">Match Detail</h1>
        </div>

        {/* Match Header */}
        <div className="bg-gradient-to-r from-violet-600 to-purple-700 rounded-2xl p-4 text-white">
          <p className="text-[10px] text-white/70 mb-2">{selectedMatch.format} · Match ID: {selectedMatch.matchId}</p>
          <div className="flex items-center justify-between mb-3">
            <div className="text-center flex-1">
              <p className="text-lg font-black">{getTeamName(selectedMatch, 1)}</p>
              <p className="text-[9px] text-white/50">Code: {selectedMatch.team1Code}</p>
            </div>
            <span className="text-xs font-bold text-white/40">VS</span>
            <div className="text-center flex-1">
              <p className="text-lg font-black">{getTeamName(selectedMatch, 2)}</p>
              <p className="text-[9px] text-white/50">Code: {selectedMatch.team2Code}</p>
            </div>
          </div>
          {/* Scores */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/10 rounded-lg p-2 text-center">
              <p className="text-[9px] text-white/60">{getTeamName(selectedMatch, 1)}</p>
              <p className="text-base font-bold">{selectedMatch.team1Score || "Yet to bat"}</p>
            </div>
            <div className="bg-white/10 rounded-lg p-2 text-center">
              <p className="text-[9px] text-white/60">{getTeamName(selectedMatch, 2)}</p>
              <p className="text-base font-bold">{selectedMatch.team2Score || "Yet to bat"}</p>
            </div>
          </div>
          {/* Status */}
          <div className="flex justify-center gap-2 mt-3 flex-wrap">
            {selectedMatch.isLive && !selectedMatch.isFinished && (
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-red-500 animate-pulse">🔴 LIVE</span>
            )}
            {selectedMatch.isFinished && (
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-500">FINISHED</span>
            )}
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/20">
              Innings: {selectedMatch.currentInnings}
            </span>
            {selectedMatch.venue && (
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/20">Venue: {selectedMatch.venue}</span>
            )}
          </div>
        </div>

        {/* Result */}
        {selectedMatch.result && (
          <div className="bg-amber-50 dark:bg-amber-950/20 rounded-xl p-3 border border-amber-200 dark:border-amber-900/30">
            <p className="text-xs font-bold text-amber-600 dark:text-amber-400 mb-1">🏆 Result</p>
            <p className="text-sm text-foreground">{selectedMatch.result}</p>
          </div>
        )}

        {/* Match Info */}
        <div className="bg-white dark:bg-card rounded-xl p-3 border border-violet-100 dark:border-violet-900/30 space-y-2">
          <p className="text-xs font-bold text-foreground mb-2">📋 Match Info</p>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div><span className="text-muted-foreground">Format:</span> <span className="font-bold">{selectedMatch.format}</span></div>
            <div><span className="text-muted-foreground">Venue:</span> <span className="font-bold">{selectedMatch.venue || "—"}</span></div>
            <div><span className="text-muted-foreground">Start:</span> <span className="font-bold">{selectedMatch.startTime ? new Date(selectedMatch.startTime).toLocaleString() : "—"}</span></div>
            <div><span className="text-muted-foreground">Status:</span> <span className="font-bold">{selectedMatch.isFinished ? "Finished" : selectedMatch.isLive ? "Live" : "Upcoming"}</span></div>
            <div><span className="text-muted-foreground">Innings:</span> <span className="font-bold">{selectedMatch.currentInnings}</span></div>
            <div><span className="text-muted-foreground">Match ID:</span> <span className="font-bold">{selectedMatch.matchId}</span></div>
          </div>
        </div>

        {/* Note about player data */}
        <div className="bg-violet-50 dark:bg-violet-950/20 rounded-xl p-3 border border-violet-200 dark:border-violet-900/30">
          <p className="text-[10px] text-muted-foreground">
            💡 Player data, H2H, weather, points table available in match detail from main app.
            This page shows live scores scraped from CREX (api.goscorer.com).
          </p>
        </div>
      </div>
    );
  }

  // === MAIN LIST VIEW ===
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
            <p className="text-[10px] text-muted-foreground">Scraped from api.goscorer.com · 10s auto-refresh</p>
          </div>
        </div>
        <div className="flex gap-1.5">
          <button onClick={() => setAutoRefresh(v => !v)} className={cn("p-2 rounded-full", autoRefresh ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-slate-100 dark:bg-slate-800")}>
            <RefreshCw className={cn("w-4 h-4", autoRefresh ? "text-emerald-500 animate-spin" : "text-slate-400")} style={{ animationDuration: "3s" }} />
          </button>
          <button onClick={() => { setLoading(true); fetchLive(); }} className="p-2 rounded-full bg-violet-100 dark:bg-violet-900/30">
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
            <Radio className="w-3 h-3 animate-pulse" /> LIVE ({liveMatches.length})
          </p>
          <div className="space-y-2">
            {liveMatches.map((m, i) => (
              <motion.button
                key={m.matchId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => setSelectedMatch(m)}
                className="w-full bg-white dark:bg-card rounded-xl p-3 border-2 border-red-300 dark:border-red-800 shadow-md text-left hover:shadow-lg transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-bold text-red-500 bg-red-100 dark:bg-red-950/40 px-2 py-0.5 rounded-full animate-pulse">🔴 LIVE</span>
                  <span className="text-[8px] text-muted-foreground">{m.format} · {m.venue}</span>
                </div>
                {/* Team 1 */}
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <span className="text-sm font-black text-foreground">{getTeamName(m, 1)}</span>
                    {m.team1Name && <span className="text-[8px] text-muted-foreground ml-1">({m.team1Code})</span>}
                  </div>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{m.team1Score || "—"}</span>
                </div>
                {/* Team 2 */}
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-sm font-black text-foreground">{getTeamName(m, 2)}</span>
                    {m.team2Name && <span className="text-[8px] text-muted-foreground ml-1">({m.team2Code})</span>}
                  </div>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{m.team2Score || "—"}</span>
                </div>
                {m.result && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold text-center bg-amber-50 dark:bg-amber-950/20 rounded-lg py-1">{m.result}</p>
                )}
                <div className="flex justify-center mt-1">
                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* UPCOMING */}
      {upcomingMatches.length > 0 && (
        <div>
          <p className="text-xs font-bold text-emerald-500 mb-2 flex items-center gap-1">
            <Calendar className="w-3 h-3" /> UPCOMING ({upcomingMatches.length})
          </p>
          <div className="space-y-2">
            {upcomingMatches.map((m, i) => (
              <motion.button
                key={m.matchId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => setSelectedMatch(m)}
                className="w-full bg-white dark:bg-card rounded-xl p-3 border border-emerald-200 dark:border-emerald-900/30 text-left hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[8px] text-muted-foreground">{m.format}</span>
                  <span className="text-[9px] font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">{formatCountdown(m.startTime)}</span>
                </div>
                <div className="flex items-center justify-center gap-3">
                  <span className="text-sm font-bold">{getTeamName(m, 1)}</span>
                  <span className="text-[10px] text-muted-foreground">vs</span>
                  <span className="text-sm font-bold">{getTeamName(m, 2)}</span>
                </div>
                <p className="text-[8px] text-muted-foreground text-center mt-1">{m.venue}</p>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* RECENT RESULTS */}
      {finishedMatches.length > 0 && (
        <div>
          <p className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1">
            <Trophy className="w-3 h-3" /> RECENT RESULTS ({finishedMatches.length})
          </p>
          <div className="space-y-2">
            {finishedMatches.slice(0, 15).map((m, i) => (
              <motion.button
                key={m.matchId}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => setSelectedMatch(m)}
                className="w-full bg-slate-50 dark:bg-slate-800/30 rounded-xl p-3 border border-slate-200 dark:border-slate-700 text-left hover:shadow-sm transition-all"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[8px] text-muted-foreground">{m.format}</span>
                  <span className="text-[8px] text-slate-400">Finished</span>
                </div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold">{getTeamName(m, 1)}</span>
                  <span className="text-xs font-bold text-slate-500">{m.team1Score || "—"}</span>
                </div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold">{getTeamName(m, 2)}</span>
                  <span className="text-xs font-bold text-slate-500">{m.team2Score || "—"}</span>
                </div>
                {m.result && <p className="text-[9px] text-amber-600 font-bold">{m.result}</p>}
              </motion.button>
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
        <p className="text-[9px] text-muted-foreground text-center flex items-center justify-center gap-1">
          <RefreshCw className="w-2.5 h-2.5 animate-spin" style={{ animationDuration: "3s" }} />
          {matches.length} matches · Auto-refresh 10s
        </p>
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
