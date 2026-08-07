"use client";

import { Bookmark, Clock, Bell, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { useApp } from "@/lib/store";
import { formatCountdown, isMatchLive, shortName, teamColor } from "@/lib/format";
import { getSupportedFantasyApps } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { MatchInfo } from "@/lib/api";
import { useEffect, useState } from "react";
import { MatchLiveScore } from "./match-live-score";

/**
 * Match Card Lineup Status Helper
 *
 * Per user spec:
 *   🟢 Upcoming → Lineup Pending
 *   🟠 Lineup Out → ✅ Lineup Out (green highlight + notification dot)
 *   🔴 Live → Live
 *   ⚫ Completed → Completed
 *
 * NOTE: The matches list API does NOT return lineup_status directly.
 * It's only available from the match detail API. So we check multiple
 * indicators:
 *   1. match.lineup_status === 1 (from detail API, if available)
 *   2. match.lineup_status_text contains "announced" or "out"
 *   3. match.toss field is present (toss happens after lineup)
 *   4. Check localStorage for cached lineup status from detail fetches
 */
function getMatchStatus(match: MatchInfo | any): {
  label: string;
  emoji: string;
  color: string;
  bgColor: string;
  isLineupOut: boolean;
} {
  const live = isMatchLive(match.startTime);
  const now = Date.now();
  const endTime = (match as any).endTime ? Number((match as any).endTime) : null;

  // Completed
  if (endTime && endTime < now) {
    return { label: "Completed", emoji: "⚫", color: "text-slate-400", bgColor: "bg-slate-700 border-slate-500/30", isLineupOut: false };
  }
  // Live
  if (live) {
    return { label: "Live", emoji: "🔴", color: "text-red-400", bgColor: "bg-red-950/40 border-red-500/30", isLineupOut: false };
  }

  // === LINEUP DETECTION — check multiple sources ===
  // 1. lineup_status field (from match detail API)
  const lineupStatus = Number((match as any).lineup_status ?? 0);
  // 2. lineup_status_text field
  const lineupText = String((match as any).lineup_status_text || (match as any).lineupStatusText || "").toLowerCase();
  // 3. toss field (toss happens after lineup announcement)
  const hasToss = !!(match as any).toss;
  // 4. Check localStorage for cached lineup status (set by transfer-flow when it fetches detail)
  const matchId = String(match.matchId ?? match.id ?? "");
  let cachedLineupOut = false;
  if (matchId && typeof window !== "undefined") {
    try {
      cachedLineupOut = localStorage.getItem(`apna-lineup-out-${matchId}`) === "1";
    } catch {}
  }

  const isLineupOut = lineupStatus === 1 ||
    lineupText.includes("announced") || lineupText.includes("out") || lineupText.includes("confirmed") ||
    hasToss ||
    cachedLineupOut;

  if (isLineupOut) {
    return { label: "Lineup Out", emoji: "✅", color: "text-emerald-400", bgColor: "bg-emerald-950/40 border-emerald-500/30", isLineupOut: true };
  }

  // Upcoming — Lineup Pending
  return { label: "Upcoming", emoji: "🟢", color: "text-amber-400", bgColor: "bg-amber-950/40 border-amber-500/30", isLineupOut: false };
}

interface MatchCardProps {
  match: MatchInfo;
  index?: number;
}

// Fantasy app badge metadata
const FANTASY_APPS: Record<string, { label: string; emoji: string; bg: string; text: string }> = {
  dream11: { label: "D11", emoji: "🏏", bg: "bg-red-500", text: "text-white" },
  my11circle: { label: "M11", emoji: "⭕", bg: "bg-sky-500", text: "text-white" },
  jumbo: { label: "JBO", emoji: "🐘", bg: "bg-orange-500", text: "text-white" },
  myteam11: { label: "MT11", emoji: "👥", bg: "bg-emerald-500", text: "text-white" },
  vision11: { label: "V11", emoji: "👁️", bg: "bg-violet-500", text: "text-white" },
  myfab11: { label: "MF11", emoji: "🎯", bg: "bg-pink-500", text: "text-white" },
};

export function MatchCard({ match, index = 0 }: MatchCardProps) {
  const openMatch = useApp((s) => s.openMatch);
  const toggleSaveMatch = useApp((s) => s.toggleSaveMatch);
  const isSaved = useApp((s) => s.isSaved);
  const [, tick] = useState(0);

  // Live countdown ticker
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const id = match.matchId ?? match.id;
  const team1Name = typeof match.team1 === "string" ? match.team1 : (match.team1?.shortName || match.team1?.name || match.team1Short || "T1");
  const team2Name = typeof match.team2 === "string" ? match.team2 : (match.team2?.shortName || match.team2?.name || match.team2Short || "T2");
  const team1Logo = typeof match.team1 === "object" ? match.team1?.logo : undefined;
  const team2Logo = typeof match.team2 === "object" ? match.team2?.logo : undefined;
  const live = isMatchLive(match.startTime);
  const countdown = formatCountdown(match.startTime);
  const saved = isSaved(id);

  // Single source of truth: use the helper from api.ts that checks
  // fantasy_list + fantasy_version + explicit URL fields.
  // This drives both the badge display AND the match card visibility rule.
  const supportedApps = getSupportedFantasyApps(match);
  const matchStatus = getMatchStatus(match);

  function onCardClick() {
    openMatch(match);
  }

  function onSaveClick(e: React.MouseEvent) {
    e.stopPropagation();
    toggleSaveMatch(match);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.4), duration: 0.3 }}
      onClick={onCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onCardClick();
        }
      }}
      className={cn(
        "w-full text-left premium-card rounded-2xl overflow-hidden group cursor-pointer transition-all",
        matchStatus.isLineupOut && "ring-2 ring-emerald-500/50 shadow-lg shadow-emerald-900/20"
      )}
    >
      {/* Series name / match title strip + status badge */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <p className="text-[11px] font-medium text-muted-foreground truncate flex-1">
          {match.series || match.title || match.subTitle || "Match"}
        </p>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Lineup Out notification dot */}
          {matchStatus.isLineupOut && (
            <span className="relative flex items-center gap-0.5 text-[9px] font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded-full">
              <Bell className="w-2.5 h-2.5" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            </span>
          )}
          {/* Status badge */}
          <span className={cn(
            "inline-flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full border tracking-wider",
            matchStatus.bgColor,
            matchStatus.color
          )}>
            {matchStatus.emoji} {matchStatus.label}
          </span>
        </div>
      </div>

      {/* Teams + countdown */}
      <div className="px-4 pb-3 flex items-center justify-between gap-3">
        {/* Team 1 */}
        <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
          <TeamAvatar name={team1Name as string} logo={team1Logo} />
          <span className="text-xs font-bold text-foreground truncate w-full text-center">
            {shortName(team1Name as string, 4)}
          </span>
        </div>

        {/* Countdown */}
        <div className="flex flex-col items-center px-3">
          <div className="flex items-center gap-1 premium-micro-label text-muted-foreground mb-1">
            <Clock className="w-3 h-3" />
            <span>{live ? "In progress" : "Starts in"}</span>
          </div>
          <div
            className={cn(
              "text-base font-black tabular-nums tracking-tight",
              live ? "text-red-400" : "premium-gold-text"
            )}
          >
            {countdown}
          </div>
        </div>

        {/* Team 2 */}
        <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
          <TeamAvatar name={team2Name as string} logo={team2Logo} />
          <span className="text-xs font-bold text-foreground truncate w-full text-center">
            {shortName(team2Name as string, 4)}
          </span>
        </div>
      </div>

      {/* === LIVE SCORE (per user spec: "Match save cheydal live score kanikanam") === */}
      <MatchLiveScore match={match} />

      {/* Fantasy app support badges — shows ONLY platforms this match actually supports */}
      {supportedApps.length > 0 && (
        <div className="px-4 pb-2 flex items-center gap-1 flex-wrap">
          <span className="premium-micro-label text-muted-foreground mr-0.5">
            🏏 Available on:
          </span>
          {supportedApps.map((app) => {
            const meta = FANTASY_APPS[app] || { label: app.toUpperCase().slice(0, 4), emoji: "🎮", bg: "bg-slate-500", text: "text-white" };
            return (
              <span
                key={app}
                className={cn(
                  "inline-flex items-center gap-0.5 text-[9px] font-bold px-2 py-0.5 rounded-md border border-white/15 premium-inner-highlight shadow-sm",
                  meta.bg,
                  meta.text
                )}
                title={app}
              >
                {meta.emoji} {meta.label}
              </span>
            );
          })}
        </div>
      )}

      {/* Footer badges */}
      <div className="px-4 pb-3 pt-2 border-t border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Badge variant="gl">MEGA GL</Badge>
          <Badge variant="sl">SL</Badge>
          <Badge variant="h2h">H2H</Badge>
        </div>
        <button
          onClick={onSaveClick}
          className={cn(
            "flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full transition-all active:scale-95 border",
            saved
              ? "brand-gradient text-black border-amber-400/40 premium-inner-highlight font-bold"
              : "text-muted-foreground border-white/10 hover:border-amber-500/30 hover:text-amber-400"
          )}
        >
          <Bookmark
            className={cn("w-3 h-3", saved && "fill-current")}
            fill={saved ? "currentColor" : "none"}
          />
          {saved ? "Saved" : "save"}
        </button>
      </div>
    </motion.div>
  );
}

function TeamAvatar({ name, logo }: { name: string; logo?: string }) {
  const color = teamColor(name);
  if (logo) {
    return (
      <div className="w-11 h-11 rounded-full bg-violet-50 dark:bg-violet-900/20 p-0.5 flex items-center justify-center ring-1 ring-amber-500/20 shadow-sm">
        <img
          src={logo}
          alt={name}
          className="w-full h-full rounded-full object-cover"
          onError={(e) => {
            (e.currentTarget.style.display = "none");
          }}
        />
      </div>
    );
  }
  return (
    <div
      className="w-11 h-11 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md ring-1 ring-amber-500/25 premium-inner-highlight"
      style={{ backgroundColor: color }}
    >
      {shortName(name, 3)}
    </div>
  );
}

function Badge({ variant, children }: { variant: "gl" | "sl" | "h2h"; children: React.ReactNode }) {
  const styles = {
    gl: "bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-700 dark:from-amber-950/50 dark:to-yellow-950/50 dark:text-amber-300 border-amber-500/30",
    sl: "bg-gradient-to-r from-emerald-100 to-green-100 text-emerald-700 dark:from-emerald-950/50 dark:to-green-950/50 dark:text-emerald-300 border-emerald-500/30",
    h2h: "bg-gradient-to-r from-sky-100 to-blue-100 text-sky-700 dark:from-sky-950/50 dark:to-blue-950/50 dark:text-sky-300 border-sky-500/30",
  } as const;
  return (
    <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full border tracking-wider premium-inner-highlight", styles[variant])}>
      {children}
    </span>
  );
}
