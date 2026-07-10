"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getMatches, type MatchInfo } from "@/lib/api";
import { Crown, Sparkles, Telescope, TrendingUp, Trophy, Brain, Target, Zap, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function ResearchScreen() {
  const [matches, setMatches] = useState<MatchInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<MatchInfo | null>(null);
  const setView = useApp((s) => s.setView);
  const openMatch = useApp((s) => s.openMatch);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const ms = await getMatches("cricket");
        if (!active) return;
        // Sort by start time — upcoming first
        const sorted = ms.sort((a, b) => {
          const aTime = new Date(a.startTime || (a as any).match_time || 0).getTime();
          const bTime = new Date(b.startTime || (b as any).match_time || 0).getTime();
          return aTime - bTime;
        });
        setMatches(sorted);
      } catch {
        if (active) toast.error("Could not load matches");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  function formatTime(match: any): string {
    const time = match.startTime || match.match_time;
    if (!time) return "—";
    const ts = new Date(time).getTime();
    const diff = ts - Date.now();
    if (diff <= 0) return "Live/Ended";
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }

  return (
    <div className="px-4 py-4 pb-24 space-y-4">
      {/* Header */}
      <div className="brand-gradient rounded-3xl p-5 text-white shadow-lg">
        <div className="flex items-center gap-2 mb-1">
          <Telescope className="w-4 h-4" />
          <h1 className="text-lg font-bold">Research</h1>
        </div>
        <p className="text-xs text-white/80">
          Match analysis, player stats, pitch reports & AI insights for upcoming matches.
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white dark:bg-card rounded-xl p-3 border border-violet-100 dark:border-violet-900/30 text-center">
          <Trophy className="w-5 h-5 mx-auto text-amber-500 mb-1" />
          <p className="text-lg font-black text-foreground">{matches.length}</p>
          <p className="text-[9px] text-muted-foreground uppercase">Matches</p>
        </div>
        <div className="bg-white dark:bg-card rounded-xl p-3 border border-violet-100 dark:border-violet-900/30 text-center">
          <Brain className="w-5 h-5 mx-auto text-violet-500 mb-1" />
          <p className="text-lg font-black text-foreground">AI</p>
          <p className="text-[9px] text-muted-foreground uppercase">Analysis</p>
        </div>
        <div className="bg-white dark:bg-card rounded-xl p-3 border border-violet-100 dark:border-violet-900/30 text-center">
          <Target className="w-5 h-5 mx-auto text-rose-500 mb-1" />
          <p className="text-lg font-black text-foreground">Live</p>
          <p className="text-[9px] text-muted-foreground uppercase">Data</p>
        </div>
      </div>

      {/* Cricket Live Page Button */}
      <button
        onClick={() => setView("cricket-live")}
        className="w-full bg-gradient-to-r from-red-500 to-rose-600 rounded-2xl p-4 text-white shadow-lg flex items-center justify-between hover:shadow-xl transition-all"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
            <Telescope className="w-5 h-5" />
          </div>
          <div className="text-left">
            <p className="text-sm font-bold">🏏 Cricket Live — Full Data</p>
            <p className="text-[10px] text-white/80">Live matches · Upcoming · Commentary · All match data</p>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-white/80" />
      </button>

      {/* AI Research Tools */}
      <div className="bg-white dark:bg-card rounded-2xl p-4 border border-violet-100 dark:border-violet-900/30">
        <p className="text-xs font-bold text-foreground mb-3 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-violet-500" />
          AI Research Tools
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-violet-50 dark:bg-violet-950/30 rounded-lg p-2.5 text-center">
            <Brain className="w-5 h-5 mx-auto text-violet-500 mb-1" />
            <p className="text-[10px] font-bold text-foreground">Elite AI</p>
            <p className="text-[8px] text-muted-foreground">26-check analysis</p>
          </div>
          <div className="bg-rose-50 dark:bg-rose-950/30 rounded-lg p-2.5 text-center">
            <Target className="w-5 h-5 mx-auto text-rose-500 mb-1" />
            <p className="text-[10px] font-bold text-foreground">Win Probability</p>
            <p className="text-[8px] text-muted-foreground">Team A vs B</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2.5 text-center">
            <Crown className="w-5 h-5 mx-auto text-amber-500 mb-1" />
            <p className="text-[10px] font-bold text-foreground">Captain Picks</p>
            <p className="text-[8px] text-muted-foreground">AI recommended C/VC</p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-950/30 rounded-lg p-2.5 text-center">
            <TrendingUp className="w-5 h-5 mx-auto text-emerald-500 mb-1" />
            <p className="text-[10px] font-bold text-foreground">Risk Meter</p>
            <p className="text-[8px] text-muted-foreground">Safe vs Risky</p>
          </div>
        </div>
      </div>

      {/* Upcoming Matches for Research */}
      <div>
        <p className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-violet-500" />
          Upcoming Matches — Tap to Research
        </p>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : matches.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">No matches available for research</p>
            <Button className="mt-3 brand-gradient text-white" onClick={() => setView("home")}>
              Browse Matches
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {matches.map((m, i) => {
              const team1 = typeof m.team1 === "string" ? m.team1 : (m.team1?.shortName || m.team1?.name || "T1");
              const team2 = typeof m.team2 === "string" ? m.team2 : (m.team2?.shortName || m.team2?.name || "T2");
              const team1Img = typeof m.team1 === "object" ? m.team1?.image : (m as any).left_team_image;
              const team2Img = typeof m.team2 === "object" ? m.team2?.image : (m as any).right_team_image;
              const series = m.series || (m as any).series_name || "";
              const time = formatTime(m);
              const supports = (m as any).fantasy_list || [];

              return (
                <motion.button
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => {
                    openMatch(m);
                  }}
                  className="w-full bg-white dark:bg-card rounded-xl p-3 border border-violet-100 dark:border-violet-900/30 hover:border-violet-300 hover:shadow-md transition-all text-left"
                >
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] text-muted-foreground font-bold truncate flex-1">{series}</p>
                    <span className={cn(
                      "text-[9px] font-bold px-1.5 py-0.5 rounded-full",
                      time === "Live/Ended" ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"
                    )}>
                      {time}
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-3">
                    <div className="flex items-center gap-1.5">
                      {team1Img && <img src={team1Img} alt={team1} className="w-6 h-6 rounded-full object-cover" onError={(e) => (e.target as HTMLImageElement).style.display = 'none'} />}
                      <span className="text-sm font-bold text-foreground">{team1}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-bold">vs</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-foreground">{team2}</span>
                      {team2Img && <img src={team2Img} alt={team2} className="w-6 h-6 rounded-full object-cover" onError={(e) => (e.target as HTMLImageElement).style.display = 'none'} />}
                    </div>
                  </div>
                  <div className="flex gap-1 justify-center mt-2">
                    {supports.includes("dream11") && <span className="text-[8px] bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded-full font-bold">D11</span>}
                    {supports.includes("my11circle") && <span className="text-[8px] bg-sky-100 dark:bg-sky-950/40 text-sky-600 dark:text-sky-400 px-1.5 py-0.5 rounded-full font-bold">M11</span>}
                    {supports.includes("jumbo") && <span className="text-[8px] bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded-full font-bold">JBO</span>}
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>

      {/* Tips Section */}
      <div className="bg-violet-50 dark:bg-violet-950/20 rounded-2xl p-4 border border-violet-200 dark:border-violet-900/30">
        <p className="text-xs font-bold text-violet-600 dark:text-violet-400 mb-2">💡 Research Tips</p>
        <ul className="space-y-1.5 text-[10px] text-muted-foreground">
          <li>✅ Check pitch report before selecting teams</li>
          <li>✅ Wait for lineup announcement for best accuracy</li>
          <li>✅ Use Elite AI for 26-check deep analysis</li>
          <li>✅ Check Win Probability for team balance</li>
          <li>✅ Use Risk Meter to identify safe vs risky picks</li>
          <li>✅ Captain picks are AI-recommended based on form</li>
        </ul>
      </div>
    </div>
  );
}
