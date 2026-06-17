"use client";

import { ArrowLeft, Bell, Calendar, Clock, MapPin, Share2, Trophy } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { formatCountdown, isMatchLive, shortName, teamColor } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TransferFlow } from "./transfer-flow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function MatchDetailScreen() {
  const match = useApp((s) => s.activeMatch);
  const setView = useApp((s) => s.setView);
  const [, tick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (!match) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-sm text-muted-foreground">No match selected.</p>
        <Button onClick={() => setView("home")} className="mt-3 brand-gradient text-white">
          Back to Home
        </Button>
      </div>
    );
  }

  const team1Name = typeof match.team1 === "string" ? match.team1 : (match.team1?.shortName || match.team1?.name || match.team1Short || "T1") as string;
  const team2Name = typeof match.team2 === "string" ? match.team2 : (match.team2?.shortName || match.team2?.name || match.team2Short || "T2") as string;
  const team1Logo = typeof match.team1 === "object" ? match.team1?.logo : undefined;
  const team2Logo = typeof match.team2 === "object" ? match.team2?.logo : undefined;
  const team1Color = teamColor(team1Name);
  const team2Color = teamColor(team2Name);
  const live = isMatchLive(match.startTime);

  return (
    <div className="pb-24">
      {/* Hero header */}
      <div className="brand-gradient text-white px-4 pt-4 pb-8 relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full" />
        <div className="absolute -bottom-16 -left-10 w-48 h-48 bg-white/5 rounded-full" />

        <div className="relative">
          {/* Top bar */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setView("home")}
              className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center backdrop-blur-sm"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex gap-2">
              <button className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center backdrop-blur-sm">
                <Share2 className="w-4 h-4" />
              </button>
              <button className="w-9 h-9 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center backdrop-blur-sm">
                <Bell className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Series + venue */}
          <div className="text-center mb-4">
            <p className="text-xs text-white/80 font-medium">
              {match.series || match.title || "Match"}
            </p>
            {match.venue && (
              <p className="text-[10px] text-white/60 flex items-center justify-center gap-1 mt-0.5">
                <MapPin className="w-2.5 h-2.5" />
                {match.venue}
              </p>
            )}
          </div>

          {/* Teams + countdown */}
          <div className="flex items-center justify-between gap-3">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex flex-col items-center gap-2 flex-1"
            >
              <TeamAvatar name={team1Name} logo={team1Logo} color={team1Color} size="lg" />
              <span className="text-sm font-bold">{shortName(team1Name, 4)}</span>
            </motion.div>

            <div className="flex flex-col items-center px-3">
              <div className="text-[10px] text-white/70 font-medium mb-1">
                {live ? "Status" : "Starts in"}
              </div>
              <div className="text-lg font-black tabular-nums">
                {formatCountdown(match.startTime)}
              </div>
              {live && (
                <span className="mt-1 inline-flex items-center gap-1 text-[9px] font-bold bg-red-500 text-white px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                  LIVE NOW
                </span>
              )}
              <div className="mt-1 text-[9px] text-white/60">
                {match.format || match.type || ""}
              </div>
              {(match as any).lineup_status === 1 && (
                <span className="mt-1 inline-flex items-center gap-1 text-[8px] font-bold bg-emerald-500 text-white px-1.5 py-0.5 rounded-full">
                  <span className="w-1 h-1 bg-white rounded-full" />
                  XI CONFIRMED
                </span>
              )}
            </div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex flex-col items-center gap-2 flex-1"
            >
              <TeamAvatar name={team2Name} logo={team2Logo} color={team2Color} size="lg" />
              <span className="text-sm font-bold">{shortName(team2Name, 4)}</span>
            </motion.div>
          </div>

          {/* Badges */}
          <div className="flex justify-center gap-2 mt-5">
            <Badge className="bg-white/20 text-white border-0 hover:bg-white/25">
              <Trophy className="w-3 h-3 mr-1" />
              MEGA GL
            </Badge>
            <Badge className="bg-white/20 text-white border-0 hover:bg-white/25">
              SL
            </Badge>
            <Badge className="bg-white/20 text-white border-0 hover:bg-white/25">
              H2H
            </Badge>
          </div>
        </div>
      </div>

      {/* Transfer Flow section */}
      <div className="px-4 -mt-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <TransferFlow match={match} />
        </motion.div>
      </div>
    </div>
  );
}

function TeamAvatar({
  name,
  logo,
  color,
  size = "md",
}: {
  name: string;
  logo?: string;
  color: string;
  size?: "md" | "lg";
}) {
  const dim = size === "lg" ? "w-16 h-16" : "w-12 h-12";
  if (logo) {
    return (
      <div className={cn(dim, "rounded-full bg-white/20 p-1 backdrop-blur-sm")}>
        <img src={logo} alt={name} className="w-full h-full rounded-full object-cover" />
      </div>
    );
  }
  return (
    <div
      className={cn(
        dim,
        "rounded-full flex items-center justify-center text-white font-black shadow-lg"
      )}
      style={{ backgroundColor: color }}
    >
      <span className={size === "lg" ? "text-base" : "text-xs"}>
        {shortName(name, 3)}
      </span>
    </div>
  );
}
