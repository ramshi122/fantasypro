"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Shield, Sparkles, TrendingUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { MatchPlayer, TeamRow } from "@/lib/api";
import { calculateRisk, riskColor } from "@/lib/risk-meter";
import { recommendCaptains } from "@/lib/captain-recommender";
import { cn } from "@/lib/utils";

/**
 * TeamInsights — shows risk meter + AI captain recommendations
 * Mount below each TeamDisplay in transfer-flow.
 */
export function TeamInsights({
  team,
  players,
  lineupAnnounced,
}: {
  team: TeamRow;
  players: MatchPlayer[];
  lineupAnnounced: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const risk = useMemo(
    () => calculateRisk(team, players, lineupAnnounced),
    [team, players, lineupAnnounced]
  );

  const recommendations = useMemo(
    () => recommendCaptains(players),
    [players]
  );

  // Determine which captain pick matches the current team's captain
  const captainId = String(team.captain ?? team.c ?? "");
  const currentCaptainPick = recommendations.captains.find(
    (c) => String(c.player.player_fixed_id || c.player.pl_id || c.player.pid || c.player.name) === captainId
  );

  return (
    <div className="bg-white/60 dark:bg-slate-800/40 rounded-xl border border-violet-100 dark:border-slate-700/50 overflow-hidden">
      <button
        onClick={() => setExpanded((s) => !s)}
        className="w-full flex items-center justify-between p-2.5 text-left hover:bg-violet-50/50 dark:hover:bg-slate-800/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-violet-500" />
          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
            AI Insights
          </span>
          <span
            className={cn(
              "text-[9px] font-bold px-1.5 py-0.5 rounded border",
              riskColor(risk.label)
            )}
          >
            {risk.label} · {risk.score}
          </span>
          {currentCaptainPick && (
            <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded">
              ✓ C match
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-2.5 pt-0 space-y-2">
              {/* Risk reasons */}
              <div>
                <p className="text-[9px] font-bold uppercase text-slate-500 mb-1 flex items-center gap-1">
                  <Shield className="w-2.5 h-2.5" /> Risk Analysis
                </p>
                <div className="space-y-0.5">
                  {risk.reasons.slice(0, 6).map((r, i) => (
                    <p key={i} className="text-[10px] text-slate-600 dark:text-slate-400">
                      • {r}
                    </p>
                  ))}
                </div>
              </div>

              {/* Captain picks */}
              {recommendations.captains.length > 0 && (
                <div>
                  <p className="text-[9px] font-bold uppercase text-slate-500 mb-1 flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5" /> Top Captain Picks
                  </p>
                  <div className="space-y-1">
                    {recommendations.captains.slice(0, 3).map((c, i) => (
                      <div
                        key={i}
                        className={cn(
                          "flex items-center gap-1.5 p-1 rounded",
                          currentCaptainPick?.player.name === c.player.name
                            ? "bg-emerald-100 dark:bg-emerald-950/40"
                            : "bg-slate-100/50 dark:bg-slate-900/40"
                        )}
                      >
                        <span className="text-[9px] font-black text-amber-500 w-3">{i + 1}.</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold text-slate-700 dark:text-slate-200 truncate">
                            {c.player.name}
                            {currentCaptainPick?.player.name === c.player.name && (
                              <span className="ml-1 text-[8px] text-emerald-600 dark:text-emerald-400">✓ Your pick</span>
                            )}
                          </p>
                          <p className="text-[8px] text-slate-500 truncate">{c.reasons[0]}</p>
                        </div>
                        <span className="text-[9px] font-bold text-violet-500">{c.score}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Vice-captain picks */}
              {recommendations.viceCaptains.length > 0 && (
                <div>
                  <p className="text-[9px] font-bold uppercase text-slate-500 mb-1 flex items-center gap-1">
                    <TrendingUp className="w-2.5 h-2.5" /> Top VC Picks
                  </p>
                  <div className="space-y-1">
                    {recommendations.viceCaptains.slice(0, 3).map((c, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-1.5 p-1 rounded bg-slate-100/50 dark:bg-slate-900/40"
                      >
                        <span className="text-[9px] font-black text-slate-400 w-3">{i + 1}.</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold text-slate-700 dark:text-slate-200 truncate">
                            {c.player.name}
                          </p>
                          <p className="text-[8px] text-slate-500 truncate">{c.reasons[0]}</p>
                        </div>
                        <span className="text-[9px] font-bold text-slate-400">{c.score}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
