"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Radio, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MatchInfo } from "@/lib/api";
import { isMatchLive } from "@/lib/format";

/**
 * Match Live Score Component
 * ====================================
 *
 * Per user spec: "Match save cheydal last updated live score kanikanam
 * ella teamilum live same as original"
 *
 * Shows live score on match cards for saved matches.
 * Polls /api/cricket-live every 30 seconds for live match data.
 * Matches by team name (fuzzy match).
 *
 * Display:
 *   - Team 1 score (e.g. "IND 250/4 (45.2)")
 *   - Team 2 score (e.g. "AUS 180/3 (35.1)")
 *   - Match status/result text
 *   - "LIVE" pulsing badge
 *   - "Last updated Xs ago" indicator
 */

interface LiveScoreData {
  matchId: string;
  team1Code: string;
  team2Code: string;
  team1Name: string;
  team2Name: string;
  team1Score: string;
  team2Score: string;
  result: string;
  isLive: boolean;
  isFinished: boolean;
  format: string;
  venue: string;
}

interface MatchLiveScoreProps {
  match: MatchInfo;
}

export function MatchLiveScore({ match }: MatchLiveScoreProps) {
  const [liveData, setLiveData] = useState<LiveScoreData | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const team1Name = typeof match.team1 === "string"
    ? match.team1
    : (match.team1?.shortName || match.team1?.name || match.team1Short || "");
  const team2Name = typeof match.team2 === "string"
    ? match.team2
    : (match.team2?.shortName || match.team2?.name || match.team2Short || "");

  const matchStartTime = match.startTime ? Number(match.startTime) : 0;
  const isLive = isMatchLive(match.startTime);
  const now = Date.now();
  const matchEnded = match.endTime ? Number(match.endTime) < now : false;
  const isUpcoming = matchStartTime > now;

  // Don't show for upcoming matches (no score yet)
  const shouldFetch = isLive || matchEnded;

  async function fetchLiveScore() {
    if (!shouldFetch) return;
    setLoading(true);
    try {
      const res = await fetch("/api/cricket-live?type=live", {
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      const data = await res.json();
      if (data.status === "success" && Array.isArray(data.data)) {
        // Find matching match by team name (fuzzy)
        const t1Lower = String(team1Name).toLowerCase();
        const t2Lower = String(team2Name).toLowerCase();

        const matched = data.data.find((m: LiveScoreData) => {
          const mt1 = String(m.team1Code || "").toLowerCase();
          const mt2 = String(m.team2Code || "").toLowerCase();
          const mn1 = String(m.team1Name || "").toLowerCase();
          const mn2 = String(m.team2Name || "").toLowerCase();

          // Match by team code (most reliable)
          if (mt1 && mt2 && t1Lower && t2Lower) {
            if ((t1Lower.includes(mt1) || mt1.includes(t1Lower)) &&
                (t2Lower.includes(mt2) || mt2.includes(t2Lower))) return true;
            if ((t1Lower.includes(mt2) || mt2.includes(t1Lower)) &&
                (t2Lower.includes(mt1) || mt1.includes(t2Lower))) return true;
          }
          // Match by team name
          if (mn1 && mn2) {
            if (mn1.includes(t1Lower) || t1Lower.includes(mn1) || mn1.includes(t2Lower) || t2Lower.includes(mn1)) {
              if (mn2.includes(t1Lower) || t1Lower.includes(mn2) || mn2.includes(t2Lower) || t2Lower.includes(mn2)) {
                return true;
              }
            }
          }
          return false;
        });

        if (matched) {
          setLiveData(matched);
          setLastUpdated(Date.now());
        }
      }
    } catch (err) {
      // silent fail — don't spam errors
    } finally {
      setLoading(false);
    }
  }

  // Fetch on mount + poll every 30s
  useEffect(() => {
    if (!shouldFetch) return;
    fetchLiveScore();
    pollRef.current = setInterval(fetchLiveScore, 30000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [shouldFetch]);

  // Don't render anything if no live data
  if (!liveData) {
    if (isLive && loading) {
      return (
        <div className="px-4 pb-2 flex items-center gap-1.5">
          <Loader2 className="w-3 h-3 text-red-400 animate-spin" />
          <span className="text-[9px] text-muted-foreground">Fetching live score...</span>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="px-4 pb-2">
      <div className="rounded-xl bg-slate-800/60 dark:bg-slate-900/60 border border-white/[0.06] p-2.5">
        {/* Live badge + last updated */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1">
            {liveData.isLive && !liveData.isFinished && (
              <span className="inline-flex items-center gap-1 text-[8px] font-bold text-red-400 bg-red-950/40 border border-red-500/30 px-1.5 py-0.5 rounded-full premium-live-pulse">
                <Radio className="w-2 h-2" /> LIVE
              </span>
            )}
            {liveData.isFinished && (
              <span className="text-[8px] font-bold text-slate-400 bg-slate-700/50 px-1.5 py-0.5 rounded-full">
                COMPLETED
              </span>
            )}
            <span className="text-[8px] text-muted-foreground">{liveData.format}</span>
          </div>
          {lastUpdated && (
            <span className="text-[7px] text-muted-foreground">
              Updated {Math.round((Date.now() - lastUpdated) / 1000)}s ago
            </span>
          )}
        </div>

        {/* Scores */}
        <div className="grid grid-cols-2 gap-2">
          {/* Team 1 */}
          <div className="text-center">
            <p className="text-[10px] font-bold text-foreground truncate">{liveData.team1Code || team1Name || "T1"}</p>
            <p className="text-sm font-black text-foreground tabular-nums">{liveData.team1Score || "-"}</p>
          </div>
          {/* Team 2 */}
          <div className="text-center">
            <p className="text-[10px] font-bold text-foreground truncate">{liveData.team2Code || team2Name || "T2"}</p>
            <p className="text-sm font-black text-foreground tabular-nums">{liveData.team2Score || "-"}</p>
          </div>
        </div>

        {/* Result / status */}
        {liveData.result && (
          <p className="text-[9px] text-muted-foreground mt-1.5 text-center font-medium">
            {liveData.result}
          </p>
        )}
      </div>
    </div>
  );
}
