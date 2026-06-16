"use client";

import { Bookmark, Clock } from "lucide-react";
import { motion } from "framer-motion";
import { useApp } from "@/lib/store";
import { formatCountdown, isMatchLive, shortName, teamColor } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MatchInfo } from "@/lib/api";
import { useEffect, useState } from "react";

interface MatchCardProps {
  match: MatchInfo;
  index?: number;
}

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
      className="w-full text-left bg-white dark:bg-card rounded-2xl shadow-sm border border-violet-100 dark:border-violet-900/30 hover:shadow-md hover:border-violet-200 dark:hover:border-violet-800 transition-all overflow-hidden group cursor-pointer"
    >
      {/* Series name / match title strip */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <p className="text-[11px] font-medium text-muted-foreground truncate flex-1">
          {match.series || match.title || match.subTitle || "Match"}
        </p>
        {live && (
          <span className="ml-2 flex-shrink-0 inline-flex items-center gap-1 text-[9px] font-bold text-red-600 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
            LIVE
          </span>
        )}
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
          <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground mb-0.5">
            <Clock className="w-3 h-3" />
            <span>{live ? "In progress" : "Starts in"}</span>
          </div>
          <div
            className={cn(
              "text-sm font-bold tabular-nums",
              live ? "text-red-600" : "text-violet-700 dark:text-violet-300"
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

      {/* Footer badges */}
      <div className="px-4 pb-3 pt-2 border-t border-violet-50 dark:border-violet-900/20 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Badge variant="gl">MEGA GL</Badge>
          <Badge variant="sl">SL</Badge>
          <Badge variant="h2h">H2H</Badge>
        </div>
        <button
          onClick={onSaveClick}
          className={cn(
            "flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full transition-colors",
            saved
              ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
              : "text-muted-foreground hover:bg-violet-50 dark:hover:bg-violet-900/20"
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
      <div className="w-11 h-11 rounded-full bg-violet-50 dark:bg-violet-900/20 p-0.5 flex items-center justify-center">
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
      className="w-11 h-11 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-md"
      style={{ backgroundColor: color }}
    >
      {shortName(name, 3)}
    </div>
  );
}

function Badge({ variant, children }: { variant: "gl" | "sl" | "h2h"; children: React.ReactNode }) {
  const styles = {
    gl: "bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-700 dark:from-amber-950/40 dark:to-yellow-950/40 dark:text-amber-300",
    sl: "bg-gradient-to-r from-emerald-100 to-green-100 text-emerald-700 dark:from-emerald-950/40 dark:to-green-950/40 dark:text-emerald-300",
    h2h: "bg-gradient-to-r from-sky-100 to-blue-100 text-sky-700 dark:from-sky-950/40 dark:to-blue-950/40 dark:text-sky-300",
  } as const;
  return (
    <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full", styles[variant])}>
      {children}
    </span>
  );
}
