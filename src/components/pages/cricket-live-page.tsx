"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { RefreshCw, Radio, Calendar, Trophy, Users, Activity, ChevronRight, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface LiveMatch {
  matchId: string;
  title: string;
  team1: string;
  team2: string;
  team1Img?: string;
  team2Img?: string;
  startTime: number;
  series: string;
  lineup: boolean;
  toss?: string;
  matchType?: string;
  supports: string[];
  playerCount: number;
}

interface MatchDetail {
  matchId: string;
  team1: string;
  team2: string;
  lineupStatus: number;
  toss: string;
  leftPlayers: any[];
  rightPlayers: any[];
  fantasyVersions: any[];
}

export function CricketLivePage({ onClose }: { onClose: () => void }) {
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<MatchDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [now, setNow] = useState(Date.now());

  const fetchMatches = useCallback(async () => {
    try {
      const res = await fetch("/api/matches?sport=cricket");
      const data = await res.json();
      if (data.status === "success") {
        const raw = data.data || [];
        const live: LiveMatch[] = raw.map((m: any) => ({
          matchId: String(m.id ?? m._id ?? ""),
          title: m.series_name || `${m.left_team_name || "T1"} vs ${m.right_team_name || "T2"}`,
          team1: m.left_team_name || "T1",
          team2: m.right_team_name || "T2",
          team1Img: m.left_team_image,
          team2Img: m.right_team_image,
          startTime: m.match_time ? new Date(m.match_time).getTime() : 0,
          series: m.series_name || "",
          lineup: m.lineup_out === 1,
          toss: m.toss || "",
          matchType: m.match_type || "normal",
          supports: m.fantasy_list || [],
          playerCount: 0,
        }));
        live.sort((a, b) => a.startTime - b.startTime);
        setMatches(live);
      }
    } catch {
      toast.error("Failed to fetch matches");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchMatchDetail = useCallback(async (matchId: string) => {
    setDetailLoading(true);
    setSelectedMatch(null);
    try {
      const res = await fetch(`/api/match-detail?matchId=${matchId}`);
      const data = await res.json();
      if (data.status === "success") {
        const d = data.data;
        const left = d.left_team_players || [];
        const right = d.right_team_players || [];
        setSelectedMatch({
          matchId,
          team1: d.left_team_name || "T1",
          team2: d.right_team_name || "T2",
          lineupStatus: d.lineup_status || 0,
          toss: d.toss || "",
          leftPlayers: left,
          rightPlayers: right,
          fantasyVersions: d.fantasy_version || [],
        });
      } else {
        toast.error("Could not load match detail");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      fetchMatches();
      setNow(Date.now());
    }, 15000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchMatches]);

  // Countdown timer
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  function formatCountdown(ts: number): string {
    if (!ts) return "—";
    const diff = ts - now;
    if (diff <= 0) {
      const ago = -diff;
      const hrs = Math.floor(ago / 3600000);
      if (hrs < 8) return `🔴 LIVE ${Math.floor(ago / 60000)}m ago`;
      return `Ended ${hrs}h ago`;
    }
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);
    if (days > 0) return `${days}d ${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
    return `${mins}m ${secs}s`;
  }

  function isLive(ts: number): boolean {
    if (!ts) return false;
    const diff = ts - now;
    return diff <= 0 && diff > -8 * 3600000;
  }

  // === MATCH DETAIL VIEW ===
  if (selectedMatch) {
    const allPlayers = [...selectedMatch.leftPlayers, ...selectedMatch.rightPlayers];
    return (
      <div className="px-4 py-4 pb-24 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedMatch(null)} className="p-2 rounded-full bg-violet-100 dark:bg-violet-900/30">
            <ArrowLeft className="w-4 h-4 text-violet-600" />
          </button>
          <h1 className="text-lg font-bold">Match Detail</h1>
        </div>

        {/* Match Info */}
        <div className="bg-gradient-to-r from-violet-600 to-purple-700 rounded-2xl p-4 text-white">
          <div className="flex items-center justify-center gap-4 mb-3">
            <div className="text-center">
              <p className="text-xl font-black">{selectedMatch.team1}</p>
              <p className="text-[10px] text-white/70">{selectedMatch.leftPlayers.length} players</p>
            </div>
            <span className="text-sm font-bold text-white/50">VS</span>
            <div className="text-center">
              <p className="text-xl font-black">{selectedMatch.team2}</p>
              <p className="text-[10px] text-white/70">{selectedMatch.rightPlayers.length} players</p>
            </div>
          </div>
          <div className="flex justify-center gap-2 flex-wrap">
            <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full", selectedMatch.lineupStatus === 1 ? "bg-emerald-500" : "bg-amber-500")}>
              {selectedMatch.lineupStatus === 1 ? "✅ LINEUP OUT" : "⚠️ LINEUP PENDING"}
            </span>
            {selectedMatch.toss && (
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-sky-500">
                🏏 TOSS: {selectedMatch.toss}
              </span>
            )}
            {selectedMatch.fantasyVersions.map((v: any) => (
              <span key={v.name} className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/20">
                {v.name}
              </span>
            ))}
          </div>
        </div>

        {/* Player List */}
        <div className="grid grid-cols-2 gap-3">
          {/* Team 1 Players */}
          <div className="bg-white dark:bg-card rounded-xl p-3 border border-violet-100 dark:border-violet-900/30">
            <p className="text-xs font-bold text-violet-600 dark:text-violet-400 mb-2 uppercase">{selectedMatch.team1}</p>
            <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
              {selectedMatch.leftPlayers.map((p: any, i: number) => {
                const name = p.name || p.player_name || `Player ${i+1}`;
                const role = p.role === 0 ? "WK" : p.role === 1 ? "BAT" : p.role === 2 ? "AR" : "BOWL";
                const playing = p.playing === 1;
                const credits = p.credits || "—";
                return (
                  <div key={i} className={cn("flex items-center gap-2 p-1.5 rounded-lg", playing ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-slate-50 dark:bg-slate-800/30")}>
                    <span className={cn("text-[8px] font-bold px-1 py-0.5 rounded", role === "WK" ? "bg-yellow-200 text-yellow-800" : role === "BAT" ? "bg-blue-200 text-blue-800" : role === "AR" ? "bg-green-200 text-green-800" : "bg-red-200 text-red-800")}>{role}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold truncate">{name}</p>
                      <p className="text-[8px] text-muted-foreground">{credits}cr · {p.selected_by || 0}% sel</p>
                    </div>
                    {playing && <span className="text-[8px] text-emerald-500 font-bold">✓</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Team 2 Players */}
          <div className="bg-white dark:bg-card rounded-xl p-3 border border-violet-100 dark:border-violet-900/30">
            <p className="text-xs font-bold text-violet-600 dark:text-violet-400 mb-2 uppercase">{selectedMatch.team2}</p>
            <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
              {selectedMatch.rightPlayers.map((p: any, i: number) => {
                const name = p.name || p.player_name || `Player ${i+1}`;
                const role = p.role === 0 ? "WK" : p.role === 1 ? "BAT" : p.role === 2 ? "AR" : "BOWL";
                const playing = p.playing === 1;
                const credits = p.credits || "—";
                return (
                  <div key={i} className={cn("flex items-center gap-2 p-1.5 rounded-lg", playing ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-slate-50 dark:bg-slate-800/30")}>
                    <span className={cn("text-[8px] font-bold px-1 py-0.5 rounded", role === "WK" ? "bg-yellow-200 text-yellow-800" : role === "BAT" ? "bg-blue-200 text-blue-800" : role === "AR" ? "bg-green-200 text-green-800" : "bg-red-200 text-red-800")}>{role}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold truncate">{name}</p>
                      <p className="text-[8px] text-muted-foreground">{credits}cr · {p.selected_by || 0}% sel</p>
                    </div>
                    {playing && <span className="text-[8px] text-emerald-500 font-bold">✓</span>}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Match Stats */}
        <div className="bg-white dark:bg-card rounded-xl p-3 border border-violet-100 dark:border-violet-900/30">
          <p className="text-xs font-bold text-foreground mb-2">📊 Match Stats</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><p className="text-lg font-black text-violet-600">{allPlayers.length}</p><p className="text-[9px] text-muted-foreground">Total Players</p></div>
            <div><p className="text-lg font-black text-emerald-600">{allPlayers.filter((p:any) => p.playing === 1).length}</p><p className="text-[9px] text-muted-foreground">Playing XI</p></div>
            <div><p className="text-lg font-black text-amber-600">{selectedMatch.fantasyVersions.length}</p><p className="text-[9px] text-muted-foreground">Platforms</p></div>
          </div>
        </div>
      </div>
    );
  }

  // === MAIN MATCH LIST VIEW ===
  const liveMatches = matches.filter(m => isLive(m.startTime));
  const upcomingMatches = matches.filter(m => m.startTime > now);

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
              <Radio className="w-4 h-4 text-red-500" />
              Cricket Live
            </h1>
            <p className="text-[10px] text-muted-foreground">Full match data · Live scores · Commentary</p>
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
            onClick={() => { setLoading(true); fetchMatches(); }}
            className="p-2 rounded-full bg-violet-100 dark:bg-violet-900/30"
          >
            <RefreshCw className="w-4 h-4 text-violet-600" />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-red-50 dark:bg-red-950/30 rounded-xl p-3 text-center border border-red-200 dark:border-red-900/30">
          <Radio className="w-5 h-5 mx-auto text-red-500 mb-1" />
          <p className="text-lg font-black text-red-600">{liveMatches.length}</p>
          <p className="text-[9px] text-muted-foreground uppercase">Live</p>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-3 text-center border border-emerald-200 dark:border-emerald-900/30">
          <Calendar className="w-5 h-5 mx-auto text-emerald-500 mb-1" />
          <p className="text-lg font-black text-emerald-600">{upcomingMatches.length}</p>
          <p className="text-[9px] text-muted-foreground uppercase">Upcoming</p>
        </div>
        <div className="bg-violet-50 dark:bg-violet-950/30 rounded-xl p-3 text-center border border-violet-200 dark:border-violet-900/30">
          <Trophy className="w-5 h-5 mx-auto text-violet-500 mb-1" />
          <p className="text-lg font-black text-violet-600">{matches.length}</p>
          <p className="text-[9px] text-muted-foreground uppercase">Total</p>
        </div>
      </div>

      {/* Live Matches */}
      {liveMatches.length > 0 && (
        <div>
          <p className="text-xs font-bold text-red-500 mb-2 flex items-center gap-1">
            <Radio className="w-3 h-3 animate-pulse" /> LIVE NOW
          </p>
          <div className="space-y-2">
            {liveMatches.map((m, i) => (
              <MatchCard key={i} match={m} countdown={formatCountdown(m.startTime)} live={true} onClick={() => fetchMatchDetail(m.matchId)} />
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Matches */}
      <div>
        <p className="text-xs font-bold text-emerald-500 mb-2 flex items-center gap-1">
          <Calendar className="w-3 h-3" /> UPCOMING MATCHES
        </p>
        {loading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => (
              <div key={i} className="h-20 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : upcomingMatches.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-4">No upcoming matches</p>
        ) : (
          <div className="space-y-2">
            {upcomingMatches.map((m, i) => (
              <MatchCard key={i} match={m} countdown={formatCountdown(m.startTime)} live={false} onClick={() => fetchMatchDetail(m.matchId)} />
            ))}
          </div>
        )}
      </div>

      {/* Auto-refresh indicator */}
      {autoRefresh && (
        <div className="text-center">
          <p className="text-[9px] text-muted-foreground flex items-center justify-center gap-1">
            <RefreshCw className="w-2.5 h-2.5 animate-spin" style={{ animationDuration: "3s" }} />
            Auto-refreshing every 15s
          </p>
        </div>
      )}
    </div>
  );
}

function MatchCard({ match, countdown, live, onClick }: { match: LiveMatch; countdown: string; live: boolean; onClick: () => void }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className={cn(
        "w-full rounded-xl p-3 border-2 text-left transition-all hover:shadow-md",
        live ? "border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20" : "border-violet-100 dark:border-violet-900/30 bg-white dark:bg-card"
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-[9px] text-muted-foreground font-bold truncate flex-1">{match.series}</p>
        <span className={cn(
          "text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap",
          live ? "bg-red-500 text-white animate-pulse" : "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
        )}>
          {countdown}
        </span>
      </div>
      <div className="flex items-center justify-center gap-3 mb-2">
        <div className="flex items-center gap-1.5">
          {match.team1Img && <img src={match.team1Img} alt={match.team1} className="w-6 h-6 rounded-full object-cover" onError={(e) => (e.target as HTMLImageElement).style.display = 'none'} />}
          <span className="text-sm font-bold">{match.team1}</span>
        </div>
        <span className="text-[10px] text-muted-foreground font-bold">vs</span>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold">{match.team2}</span>
          {match.team2Img && <img src={match.team2Img} alt={match.team2} className="w-6 h-6 rounded-full object-cover" onError={(e) => (e.target as HTMLImageElement).style.display = 'none'} />}
        </div>
      </div>
      <div className="flex gap-1 justify-center items-center">
        {match.lineup && <span className="text-[8px] bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded-full font-bold">LINEUP OUT</span>}
        {match.supports.map(s => (
          <span key={s} className={cn("text-[8px] px-1.5 py-0.5 rounded-full font-bold", s === "dream11" ? "bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400" : s === "my11circle" ? "bg-sky-100 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400")}>{s}</span>
        ))}
        <ChevronRight className="w-3 h-3 text-muted-foreground ml-1" />
      </div>
    </motion.button>
  );
}
