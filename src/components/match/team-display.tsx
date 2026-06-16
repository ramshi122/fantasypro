"use client";

import type { MatchPlayer, TeamRow } from "@/lib/api";
import { classForRole, getInitials, roleLabel, shortName } from "@/lib/format";
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

export function TeamDisplay({
  team,
  team1Name = "T1",
  team2Name = "T2",
  team1Color = "#7C3AED",
  team2Color = "#EC4899",
  compact = false,
}: TeamDisplayProps) {
  const players: MatchPlayer[] = team.players || [];
  const captainId = team.captain ?? team.c;
  const viceCaptainId = team.viceCaptain ?? team.vc;

  // Group by team
  const t1 = players.filter((p) => {
    const t = (p.team || "").toString().toLowerCase();
    const t1n = (team1Name || "").toLowerCase();
    return t === t1n || t === shortName(team1Name, 4).toLowerCase() || t === "1" || t === "team1";
  });
  const t2 = players.filter((p) => {
    const t = (p.team || "").toString().toLowerCase();
    const t2n = (team2Name || "").toLowerCase();
    return t === t2n || t === shortName(team2Name, 4).toLowerCase() || t === "2" || t === "team2";
  });
  // Fallback: if grouping fails, split evenly
  const finalT1 = t1.length > 0 ? t1 : players.slice(0, Math.ceil(players.length / 2));
  const finalT2 = t2.length > 0 ? t2 : players.slice(Math.ceil(players.length / 2));

  // Group by role for ordering
  const roleOrder: Record<string, number> = { wk: 0, bat: 1, ar: 2, bowl: 3, gk: 0, def: 1, mid: 2, fwd: 3 };
  function sortByRole(arr: MatchPlayer[]) {
    return [...arr].sort((a, b) => {
      const ra = roleOrder[(a.role || "").toLowerCase()] ?? 99;
      const rb = roleOrder[(b.role || "").toLowerCase()] ?? 99;
      return ra - rb;
    });
  }

  if (compact) {
    return (
      <div className="bg-white dark:bg-card rounded-xl border border-violet-100 dark:border-violet-900/30 p-3">
        <div className="flex flex-wrap gap-1.5">
          {players.slice(0, 11).map((p, i) => {
            const isC = String(p.pid ?? i) === String(captainId);
            const isVC = String(p.pid ?? i) === String(viceCaptainId);
            return (
              <span
                key={i}
                className={cn(
                  "inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md",
                  classForRole(p.role),
                  "text-white"
                )}
              >
                {p.shortName || p.name?.slice(0, 8) || `P${i + 1}`}
                {isC && <Crown className="w-2.5 h-2.5" />}
                {isVC && <Star className="w-2.5 h-2.5" />}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-card rounded-2xl border border-violet-100 dark:border-violet-900/30 overflow-hidden shadow-sm">
      {/* Header bar with team counts */}
      <div className="flex items-stretch h-9 text-[11px] font-bold">
        <div
          className="flex-1 flex items-center justify-center text-white gap-1"
          style={{ backgroundColor: team1Color }}
        >
          <span>{shortName(team1Name, 4)}</span>
          <span className="bg-white/25 rounded-full w-5 h-5 flex items-center justify-center text-[10px]">
            {finalT1.length}
          </span>
        </div>
        <div className="px-2 flex items-center bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-[10px] font-semibold">
          {players.length} Players
        </div>
        <div
          className="flex-1 flex items-center justify-center text-white gap-1"
          style={{ backgroundColor: team2Color }}
        >
          <span className="bg-white/25 rounded-full w-5 h-5 flex items-center justify-center text-[10px]">
            {finalT2.length}
          </span>
          <span>{shortName(team2Name, 4)}</span>
        </div>
      </div>

      {/* Players grid */}
      <div className="p-3 grid grid-cols-4 gap-2">
        {sortByRole(finalT1).map((p, i) => (
          <PlayerChip
            key={`t1-${i}`}
            player={p}
            isC={String(p.pid ?? i) === String(captainId)}
            isVC={String(p.pid ?? i) === String(viceCaptainId)}
            teamColor={team1Color}
          />
        ))}
        {sortByRole(finalT2).map((p, i) => (
          <PlayerChip
            key={`t2-${i}`}
            player={p}
            isC={String(p.pid ?? i) === String(captainId)}
            isVC={String(p.pid ?? i) === String(viceCaptainId)}
            teamColor={team2Color}
          />
        ))}
      </div>
    </div>
  );
}

function PlayerChip({
  player,
  isC,
  isVC,
  teamColor,
}: {
  player: MatchPlayer;
  isC: boolean;
  isVC: boolean;
  teamColor: string;
}) {
  const name = player.shortName || player.name || "Player";
  const role = roleLabel(player.role);
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="relative">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-sm border-2 border-white dark:border-slate-900"
          style={{ backgroundColor: teamColor }}
        >
          {getInitials(name)}
        </div>
        <span
          className={cn(
            "absolute -bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-bold px-1 py-0.5 rounded text-white",
            classForRole(player.role)
          )}
        >
          {role}
        </span>
        {isC && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-400 flex items-center justify-center shadow">
            <Crown className="w-2.5 h-2.5 text-white" fill="currentColor" />
          </span>
        )}
        {isVC && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-slate-300 flex items-center justify-center shadow">
            <Star className="w-2.5 h-2.5 text-slate-700" fill="currentColor" />
          </span>
        )}
      </div>
      <span className="text-[9px] font-medium text-foreground/80 truncate w-full text-center">
        {name.length > 8 ? name.slice(0, 7) + "…" : name}
      </span>
      {typeof player.sel === "number" && (
        <span className="text-[8px] text-muted-foreground">
          {player.sel}%
        </span>
      )}
    </div>
  );
}
