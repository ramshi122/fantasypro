"use client";

import { useEffect, useState } from "react";
import { Trophy, Crown, Medal, Loader2, RefreshCw, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface LeaderboardEntry {
  userId: string;
  userName: string;
  teamCount: number;
  totalPrize: number;
  weeklyTeamCount: number;
  weeklyPrize: number;
  lastActive: number;
}

type LbType = "teamGenerators" | "contestWinners";
type LbRange = "weekly" | "all";

export function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<LbType>("teamGenerators");
  const [range, setRange] = useState<LbRange>("all");

  async function fetchLB() {
    setLoading(true);
    try {
      const res = await fetch(`/api/leaderboard?type=${type}&range=${range}&limit=20`);
      const data = await res.json();
      if (data.status === "success") {
        setEntries(data.leaderboard || []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLB();
  }, [type, range]);

  function getValue(e: LeaderboardEntry): number {
    if (type === "teamGenerators") {
      return range === "weekly" ? e.weeklyTeamCount : e.teamCount;
    }
    return range === "weekly" ? e.weeklyPrize : e.totalPrize;
  }

  function formatValue(v: number): string {
    if (type === "contestWinners") return `₹${v.toLocaleString("en-IN")}`;
    return v.toLocaleString("en-IN");
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold flex items-center gap-1.5">
          <Trophy className="w-4 h-4 text-amber-400" />
          Leaderboard
        </h3>
        <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={fetchLB}>
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
        </Button>
      </div>

      <div className="flex gap-1">
        {(["teamGenerators", "contestWinners"] as LbType[]).map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className={cn(
              "px-2 py-1 rounded text-[10px] font-bold",
              type === t ? "bg-amber-500 text-white" : "bg-slate-800 text-slate-300"
            )}
          >
            {t === "teamGenerators" ? "Team Gen" : "Winners"}
          </button>
        ))}
        <div className="flex-1" />
        {(["weekly", "all"] as LbRange[]).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={cn(
              "px-2 py-1 rounded text-[10px] font-bold",
              range === r ? "bg-violet-500 text-white" : "bg-slate-800 text-slate-300"
            )}
          >
            {r === "weekly" ? "This Week" : "All-Time"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-8">
          <Loader2 className="w-8 h-8 mx-auto text-amber-500 animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-8 text-slate-500 text-xs">
          <Trophy className="w-10 h-10 mx-auto mb-2 opacity-30" />
          No entries yet. Be the first!
        </div>
      ) : (
        <div className="space-y-1.5">
          {entries.map((e, i) => (
            <motion.div
              key={e.userId}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className={cn(
                "flex items-center gap-2 p-2 rounded-lg border",
                i === 0
                  ? "bg-gradient-to-r from-amber-500/20 to-yellow-500/10 border-amber-500/30"
                  : i === 1
                  ? "bg-slate-700/40 border-slate-600"
                  : i === 2
                  ? "bg-orange-900/20 border-orange-700/30"
                  : "bg-slate-800/40 border-slate-700/50"
              )}
            >
              <div
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black",
                  i === 0 ? "bg-amber-500 text-white" : i === 1 ? "bg-slate-400 text-white" : i === 2 ? "bg-orange-700 text-white" : "bg-slate-700 text-slate-300"
                )}
              >
                {i === 0 ? <Crown className="w-3.5 h-3.5" /> : i === 1 ? <Medal className="w-3.5 h-3.5" /> : i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-slate-100 truncate">
                  {e.userName || "Anonymous"}
                </p>
                <p className="text-[8px] text-slate-500">
                  Last active {new Date(e.lastActive || 0).toLocaleDateString("en-IN")}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-black text-amber-400">{formatValue(getValue(e))}</p>
                {type === "teamGenerators" && (
                  <p className="text-[8px] text-slate-500">teams</p>
                )}
                {type === "contestWinners" && (
                  <p className="text-[8px] text-slate-500">prize</p>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <p className="text-[9px] text-slate-500 text-center flex items-center justify-center gap-1">
        <TrendingUp className="w-3 h-3" />
        Rankings update in real-time as users generate teams &amp; win contests
      </p>
    </div>
  );
}
