"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getExpertTeams, getPrimeTeams, type TeamRow } from "@/lib/api";
import { TeamDisplay } from "@/components/match/team-display";
import { Crown, Sparkles, Telescope, Zap, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { shortName, teamColor } from "@/lib/format";

export function ResearchScreen() {
  const [tab, setTab] = useState<"expert" | "prime">("expert");
  const [expertTeams, setExpertTeams] = useState<TeamRow[]>([]);
  const [primeTeams, setPrimeTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const setView = useApp((s) => s.setView);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const [ex, pr] = await Promise.all([
          getExpertTeams().catch(() => []),
          getPrimeTeams().catch(() => []),
        ]);
        if (!active) return;
        setExpertTeams(ex);
        setPrimeTeams(pr);
      } catch {
        if (active) toast.error("Could not load research teams. Try again later.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const teams = tab === "expert" ? expertTeams : primeTeams;

  return (
    <div className="px-4 py-4 pb-24 space-y-4">
      <div className="brand-gradient rounded-3xl p-5 text-white shadow-lg">
        <div className="flex items-center gap-2 mb-1">
          <Telescope className="w-4 h-4" />
          <h1 className="text-lg font-bold">Research</h1>
        </div>
        <p className="text-xs text-white/80">
          Expert-curated and Prime teams for every match. Use these as a reference to build your winning combination.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex bg-violet-50 dark:bg-violet-900/20 rounded-xl p-1">
        <button
          onClick={() => setTab("expert")}
          className={`flex-1 h-10 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${
            tab === "expert"
              ? "bg-white text-violet-700 shadow-sm dark:bg-violet-950 dark:text-violet-200"
              : "text-muted-foreground"
          }`}
        >
          <Sparkles className="w-4 h-4" />
          Expert Teams
        </button>
        <button
          onClick={() => setTab("prime")}
          className={`flex-1 h-10 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${
            tab === "prime"
              ? "bg-white text-violet-700 shadow-sm dark:bg-violet-950 dark:text-violet-200"
              : "text-muted-foreground"
          }`}
        >
          <Crown className="w-4 h-4" />
          Prime Teams
        </button>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-2xl" />
          ))}
        </div>
      ) : teams.length === 0 ? (
        <div className="text-center py-12 px-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center mb-3">
            {tab === "prime" ? <Lock className="w-7 h-7 text-violet-400" /> : <Zap className="w-7 h-7 text-violet-400" />}
          </div>
          <p className="text-sm font-semibold mb-1">
            {tab === "prime" ? "Prime teams are locked" : "No expert teams yet"}
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            {tab === "prime"
              ? "Subscribe to Prime to unlock premium teams."
              : "Check back closer to match time for expert picks."}
          </p>
          <Button className="brand-gradient text-white" onClick={() => setView("home")}>
            Browse Matches
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {teams.map((t, i) => (
            <motion.div
              key={(t._id ?? t.teamId ?? i) as string}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="space-y-1.5"
            >
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold flex items-center gap-1.5">
                  {tab === "prime" ? (
                    <Crown className="w-3.5 h-3.5 text-amber-500" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                  )}
                  {tab === "prime" ? "Prime" : "Expert"} Team #{t.teamNo ?? i + 1}
                </span>
                {t.type && (
                  <span className="text-[10px] text-muted-foreground uppercase">
                    {t.type}
                  </span>
                )}
              </div>
              <TeamDisplay
                team={t}
                team1Name={shortName((t as any).team1Name || "T1", 4)}
                team2Name={shortName((t as any).team2Name || "T2", 4)}
                team1Color={teamColor("T1")}
                team2Color={teamColor("T2")}
              />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
