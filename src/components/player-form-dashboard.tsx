"use client";

/**
 * Player Form Dashboard
 * =====================
 * Bar chart showing the form score (0-100) for every player in the pool,
 * color-coded by trend (up/down/stable).
 *
 * Uses inline SVG bars (no external chart dep) to keep the bundle small.
 *
 * Additive — does NOT modify any existing chart component.
 */

import { useEffect, useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Minus, Activity, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MatchPlayer } from "@/lib/api";
import {
  calculateForm,
  getFormTrend,
  rankByForm,
  saveFormSnapshot,
  type FormRanked,
} from "@/lib/player-form";

interface PlayerFormDashboardProps {
  players: MatchPlayer[];
  className?: string;
  /** Limit the chart to top N players (default 25). */
  topN?: number;
}

export function PlayerFormDashboard({
  players,
  className,
  topN = 25,
}: PlayerFormDashboardProps) {
  const [tick, setTick] = useState(0);

  // Re-snapshot when the player pool changes
  useEffect(() => {
    if (players && players.length > 0) {
      saveFormSnapshot(players);
      setTick((t) => t + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players?.length]);

  const ranked: FormRanked[] = useMemo(() => {
    if (!players || players.length === 0) return [];
    return rankByForm(players).slice(0, topN);
  }, [players, topN, tick]);

  const maxScore = 100;
  const trendCounts = useMemo(() => {
    let up = 0, down = 0, stable = 0;
    for (const r of ranked) {
      if (r.trend === "up") up++;
      else if (r.trend === "down") down++;
      else stable++;
    }
    return { up, down, stable };
  }, [ranked]);

  if (!players || players.length === 0) {
    return (
      <div className={cn("rounded-xl border border-slate-700 bg-slate-800/50 p-4 text-center", className)}>
        <Activity className="w-5 h-5 text-slate-500 mx-auto mb-2" />
        <p className="text-xs text-slate-400">
          No player data available. Load a match to see form scores.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl border border-violet-700/40 bg-slate-800/50 p-3 space-y-3", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-black text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-violet-400" />
            Player Form Dashboard
          </h3>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Top {ranked.length} players by form score (0-100) · computed from points, sel%, C/VC%, credits
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="text-slate-400 h-7 text-[10px]"
          onClick={() => {
            saveFormSnapshot(players);
            setTick((t) => t + 1);
          }}
        >
          <RefreshCw className="w-3 h-3 mr-1" />
          Refresh
        </Button>
      </div>

      {/* Trend legend */}
      <div className="flex items-center gap-3 text-[10px]">
        <span className="flex items-center gap-1 text-emerald-400">
          <TrendingUp className="w-3 h-3" /> {trendCounts.up} up
        </span>
        <span className="flex items-center gap-1 text-rose-400">
          <TrendingDown className="w-3 h-3" /> {trendCounts.down} down
        </span>
        <span className="flex items-center gap-1 text-slate-400">
          <Minus className="w-3 h-3" /> {trendCounts.stable} stable
        </span>
      </div>

      {/* Bar chart — horizontal bars */}
      <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
        {ranked.map((r, idx) => {
          const trend = r.trend;
          const barColor =
            trend === "up"
              ? "from-emerald-500 to-green-600"
              : trend === "down"
              ? "from-rose-500 to-red-600"
              : "from-violet-500 to-purple-600";
          const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
          const trendColor =
            trend === "up" ? "text-emerald-400" : trend === "down" ? "text-rose-400" : "text-slate-400";

          const name = String(r.player.name || r.player.shortName || r.playerId || "?");
          const team = String(r.player.team || r.player.team_name || "");
          const role = String(r.player.role || r.player.player_type || "");

          return (
            <div key={r.playerId || idx} className="flex items-center gap-2 text-xs">
              <div className="w-32 shrink-0 truncate">
                <div className="font-bold text-white truncate text-[11px]">{name}</div>
                <div className="text-[9px] text-slate-500 truncate">
                  {team}{team && role ? " · " : ""}{role}
                </div>
              </div>
              <div className="flex-1 h-5 bg-slate-900/60 rounded overflow-hidden relative">
                <div
                  className={cn("h-full bg-gradient-to-r flex items-center justify-end px-1.5 transition-all", barColor)}
                  style={{ width: `${(r.score / maxScore) * 100}%` }}
                >
                  <span className="text-[9px] font-bold text-white">{r.score}</span>
                </div>
              </div>
              <TrendIcon className={cn("w-3 h-3 shrink-0", trendColor)} />
            </div>
          );
        })}
      </div>

      {/* Top picks summary */}
      {ranked.length > 0 && (
        <div className="pt-2 border-t border-slate-700/50">
          <h4 className="text-[10px] font-bold text-slate-300 uppercase mb-1">Top Form Picks</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
            {ranked.slice(0, 4).map((r, idx) => (
              <div key={`top-${r.playerId || idx}`} className="text-[10px] text-slate-400 flex items-start gap-1">
                <span className="font-bold text-violet-400">#{idx + 1}</span>
                <span className="text-white font-bold">
                  {String(r.player.name || r.player.shortName || "?")}
                </span>
                <span className="text-slate-500">— {r.reasons[0]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default PlayerFormDashboard;

// Re-export for convenience
export { calculateForm, getFormTrend, rankByForm, saveFormSnapshot } from "@/lib/player-form";
