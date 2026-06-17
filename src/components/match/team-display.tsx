"use client";

import type { MatchPlayer, TeamRow } from "@/lib/api";
import { roleFromPlayerType, shortName, teamColor } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Crown, Star } from "lucide-react";

interface TeamDisplayProps {
  team: TeamRow;
  team1Name?: string;
  team2Name?: string;
  team1Color?: string;
  team2Color?: string;
  compact?: boolean;
}

// Role sections in display order
const ROLE_SECTIONS = [
  { key: "WK", label: "WK", color: "bg-amber-500" },
  { key: "BAT", label: "BAT", color: "bg-sky-500" },
  { key: "AR", label: "AR", color: "bg-emerald-500" },
  { key: "BOWL", label: "BOWL", color: "bg-rose-500" },
] as const;

export function TeamDisplay({
  team,
  team1Name = "T1",
  team2Name = "T2",
  team1Color: t1Color,
  team2Color: t2Color,
  compact = false,
}: TeamDisplayProps) {
  const players: MatchPlayer[] = team.players || [];
  const captainId = String(team.captain ?? team.c ?? "");
  const viceCaptainId = String(team.viceCaptain ?? team.vc ?? team.vicecaptain ?? "");

  const c1 = t1Color || teamColor(team1Name);
  const c2 = t2Color || teamColor(team2Name);

  // Group players by role using roleFromPlayerType (handles numeric role field)
  const byRole: Record<string, MatchPlayer[]> = { WK: [], BAT: [], AR: [], BOWL: [] };
  for (const p of players) {
    const role = (p.role as string) || roleFromPlayerType(p.player_type as string, p.role_num as number);
    if (byRole[role]) {
      byRole[role].push(p);
    } else {
      // Fallback: try player_type alone
      const r = roleFromPlayerType(p.player_type as string);
      if (byRole[r]) byRole[r].push(p);
      else byRole.BAT.push(p); // last resort
    }
  }

  // Player ID matcher — handles player_fixed_id, pl_id, pid, name
  function matchesCaptain(p: MatchPlayer): "C" | "VC" | null {
    const ids = [
      p.player_fixed_id, p.pl_id, p.pid, p.name,
    ].filter(Boolean).map(String);
    if (ids.includes(captainId)) return "C";
    if (ids.includes(viceCaptainId)) return "VC";
    return null;
  }

  // Determine which team color to use for a player
  function playerColor(p: MatchPlayer): string {
    const t = String(p.team || p.team_name || "").toLowerCase();
    const t1 = (team1Name || "").toLowerCase();
    const t2 = (team2Name || "").toLowerCase();
    if (t === t1 || t === shortName(team1Name, 4).toLowerCase()) return c1;
    if (t === t2 || t === shortName(team2Name, 4).toLowerCase()) return c2;
    // Default: alternate by team_index
    return p.team_index === 1 ? c2 : c1;
  }

  if (compact) {
    return (
      <div className="bg-white dark:bg-card rounded-xl border border-violet-100 dark:border-violet-900/30 p-3">
        <div className="flex flex-wrap gap-1.5">
          {players.slice(0, 11).map((p, i) => {
            const cv = matchesCaptain(p);
            const role = (p.role as string) || roleFromPlayerType(p.player_type as string, p.role_num as number);
            return (
              <span
                key={i}
                className={cn(
                  "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md text-white",
                  role === "WK" && "bg-amber-500",
                  role === "BAT" && "bg-sky-500",
                  role === "AR" && "bg-emerald-500",
                  role === "BOWL" && "bg-rose-500",
                )}
              >
                {p.name?.split(" ").pop() || p.shortName || `P${i + 1}`}
                {cv === "C" && <Crown className="w-2.5 h-2.5" />}
                {cv === "VC" && <Star className="w-2.5 h-2.5" />}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  // Full display — grouped by role sections (matches the screenshot design)
  return (
    <div className="rounded-2xl overflow-hidden border border-violet-100 dark:border-violet-900/30 shadow-sm bg-gradient-to-br from-emerald-50 via-teal-50 to-emerald-100 dark:from-emerald-950/40 dark:via-teal-950/40 dark:to-emerald-900/30">
      {/* Header bar with team counts */}
      <div className="flex items-stretch h-9 text-[11px] font-bold">
        <div
          className="flex-1 flex items-center justify-center text-white gap-1.5"
          style={{ backgroundColor: c1 }}
        >
          <span>{shortName(team1Name, 4)}</span>
          <span className="bg-white/30 rounded-full w-5 h-5 flex items-center justify-center text-[10px]">
            {players.filter(p => {
              const t = String(p.team || p.team_name || "").toLowerCase();
              return t === (team1Name || "").toLowerCase() || t === shortName(team1Name, 4).toLowerCase() || p.team_index === 0;
            }).length}
          </span>
        </div>
        <div className="px-3 flex items-center bg-violet-600 text-white text-[10px] font-bold">
          {players.length} Players
        </div>
        <div
          className="flex-1 flex items-center justify-center text-white gap-1.5"
          style={{ backgroundColor: c2 }}
        >
          <span className="bg-white/30 rounded-full w-5 h-5 flex items-center justify-center text-[10px]">
            {players.filter(p => {
              const t = String(p.team || p.team_name || "").toLowerCase();
              return t === (team2Name || "").toLowerCase() || t === shortName(team2Name, 4).toLowerCase() || p.team_index === 1;
            }).length}
          </span>
          <span>{shortName(team2Name, 4)}</span>
        </div>
      </div>

      {/* Role sections */}
      <div className="p-3 space-y-2.5">
        {ROLE_SECTIONS.map((section) => {
          const sectionPlayers = byRole[section.key] || [];
          if (sectionPlayers.length === 0) return null;
          return (
            <div key={section.key}>
              {/* Role label */}
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className={cn("text-[9px] font-black text-white px-1.5 py-0.5 rounded", section.color)}>
                  {section.label}
                </span>
                <div className="flex-1 h-px bg-violet-200/50 dark:bg-violet-800/40" />
                <span className="text-[9px] text-muted-foreground font-semibold">
                  {sectionPlayers.length}
                </span>
              </div>
              {/* Players in this role */}
              <div className="flex gap-2 flex-wrap">
                {sectionPlayers.map((p, i) => {
                  const cv = matchesCaptain(p);
                  const color = playerColor(p);
                  return (
                    <PlayerCard
                      key={`${section.key}-${i}`}
                      player={p}
                      captain={cv}
                      teamColor={color}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlayerCard({
  player,
  captain,
  teamColor,
}: {
  player: MatchPlayer;
  captain: "C" | "VC" | null;
  teamColor: string;
}) {
  const name = String(player.name || player.shortName || "Player");
  // Show last name (surname) prominently, full name as title
  const lastName = name.split(" ").pop() || name;
  const firstName = name.split(" ").slice(0, -1).join(" ");
  const credits = player.credits != null ? `${player.credits}cr` : null;
  const sel = player.selected_by ?? player.sel;

  return (
    <div className="flex flex-col items-center w-14 gap-0.5">
      <div className="relative">
        {/* Player avatar circle */}
        <div className="relative">
          {player.image ? (
            <div
              className="w-12 h-12 rounded-full overflow-hidden border-2 border-white dark:border-slate-800 shadow-md"
              style={{ backgroundColor: teamColor }}
            >
              <img
                src={player.image}
                alt={name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            </div>
          ) : (
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-white text-[11px] font-bold border-2 border-white dark:border-slate-800 shadow-md"
              style={{ backgroundColor: teamColor }}
            >
              {lastName.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>

        {/* C/VC badge */}
        {captain && (
          <span
            className={cn(
              "absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black text-white shadow-md border-2 border-white dark:border-slate-800",
              captain === "C" ? "bg-amber-500" : "bg-slate-500"
            )}
          >
            {captain}
          </span>
        )}
      </div>

      {/* Player name — full last name, dark + bold */}
      <p
        className="text-[10px] font-bold text-slate-900 dark:text-white leading-tight text-center truncate w-full"
        title={`${firstName} ${lastName}`.trim()}
      >
        {lastName}
      </p>

      {/* Credits */}
      {credits && (
        <p className="text-[8px] text-slate-600 dark:text-slate-300 font-semibold">
          {credits}
        </p>
      )}
    </div>
  );
}
