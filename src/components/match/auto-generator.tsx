"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  Brain,
  CheckCircle2,
  Crown,
  Layers,
  Loader2,
  Sparkles,
  Target,
  TrendingUp,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/lib/store";
import {
  getMatchDetail,
  type MatchInfo,
  type MatchPlayer,
  type TeamRow,
} from "@/lib/api";
import {
  generateSweep,
  SWEEP_OPTIONS,
  type SweepCount,
  type SweepProgress,
  type SweepResult,
} from "@/lib/sweep-generator";
import { cn } from "@/lib/utils";
import { ModeSettingsPage } from "./mode-settings-page";

type GenMode = "smart" | "gl" | "advanced" | "combination" | "elite";

interface AutoGeneratorProps {
  match: MatchInfo;
  onGenerated: (teams: TeamRow[]) => void;
  onClose?: () => void;
  onEliteAI?: () => void; // Open Elite AI modal
}

export function AutoGenerator({ match, onGenerated, onClose, onEliteAI }: AutoGeneratorProps) {
  const token = useAuth((s) => s.token);
  const [selectedCount, setSelectedCount] = useState<SweepCount>(20);
  const [mode, setMode] = useState<"append" | "replace">("replace");
  const [genMode, setGenMode] = useState<GenMode>("smart");
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<SweepProgress | null>(null);
  const [result, setResult] = useState<SweepResult | null>(null);
  const [openModePage, setOpenModePage] = useState<GenMode | null>(null);

  const matchId = (match.matchId ?? match.id ?? "") as string;
  const team1Name = (typeof match.team1 === "string" ? match.team1 : (match.team1?.shortName || match.team1?.name)) as string ||
    (match as any).left_team_name || "T1";
  const team2Name = (typeof match.team2 === "string" ? match.team2 : (match.team2?.shortName || match.team2?.name)) as string ||
    (match as any).right_team_name || "T2";

  const GEN_MODES: Array<{
    id: GenMode;
    label: string;
    icon: typeof Brain;
    desc: string;
    color: string;
  }> = [
    {
      id: "smart",
      label: "Smart Auto",
      icon: Zap,
      desc: "Balanced AI analysis — form, pitch, h2h. Best for H2H & Small Leagues.",
      color: "from-violet-500 to-purple-600",
    },
    {
      id: "gl",
      label: "Grand League",
      icon: Target,
      desc: "High-risk differentials + unique C/VC combos. Max winning probability for GL.",
      color: "from-rose-500 to-pink-600",
    },
    {
      id: "advanced",
      label: "Advanced Auto",
      icon: Brain,
      desc: "AI form analysis — batting order, bowling role, death overs, impact player.",
      color: "from-sky-500 to-blue-600",
    },
    {
      id: "combination",
      label: "Combination Auto",
      icon: Layers,
      desc: "Rotate C/VC through all locked candidate pairs. Maximal team diversity.",
      color: "from-emerald-500 to-teal-600",
    },
    {
      id: "elite",
      label: "Elite AI",
      icon: Crown,
      desc: "Full analysis engine — form, venue, pitch, toss, H2H, ceiling, ownership. Confidence + reasoning per team.",
      color: "from-amber-500 to-yellow-600",
    },
  ];

  async function handleGenerate() {
    // Elite AI opens the Elite AI modal instead
    if (genMode === "elite") {
      onClose?.();
      onEliteAI?.();
      return;
    }

    setGenerating(true);
    setResult(null);
    try {
      // 1. Fetch fresh match detail to get latest player pool
      setProgress({ generated: 0, total: selectedCount, phase: "validating", message: "Fetching latest playing XI..." });
      const detail = await getMatchDetail(matchId);
      if (!detail) {
        toast.error("Could not load player data for this match");
        setGenerating(false);
        return;
      }
      const leftPlayers = ((detail as any).left_team_players || []) as MatchPlayer[];
      const rightPlayers = ((detail as any).right_team_players || []) as MatchPlayer[];
      let allPlayers = [...leftPlayers, ...rightPlayers].filter(Boolean);

      if (allPlayers.length < 11) {
        toast.error(`Only ${allPlayers.length} players available — need at least 11`);
        setGenerating(false);
        return;
      }

      // 2. Mode-specific player filtering
      // IMPORTANT: We do NOT modify the player pool order for GL mode —
      // the sweep generator's strategyFor() function handles the safe/balanced/
      // differential mix internally. Sorting by sel% ascending would break
      // role balance (all low-sel% players might be from one role).
      if (genMode === "advanced") {
        // Advanced: prioritize high-credit (in-form) players — but keep all
        // (don't slice, just let the generator prefer them via higher sel%)
        allPlayers = allPlayers.sort((a, b) => Number(b.credits || 0) - Number(a.credits || 0));
      } else if (genMode === "gl") {
        // GL: keep full pool — generator's differential strategy handles it
        // Just ensure players are sorted by sel% descending (high sel% first)
        // so the generator's "safe" tier has enough players
        allPlayers = allPlayers.sort((a, b) => {
          const selA = Number(a.selected_by ?? a.sel ?? 0);
          const selB = Number(b.selected_by ?? b.sel ?? 0);
          return selB - selA; // high sel% first (normal order)
        });
      }
      // smart + combination: use players as-is (already has sel% data)

      // Safety check: ensure we have enough players per role
      const roleCount = { WK: 0, BAT: 0, AR: 0, BOWL: 0 };
      for (const p of allPlayers) {
        const role = String(p.player_type || "").toLowerCase();
        if (role.includes("keeper") || role.includes("wk") || p.role === 0) roleCount.WK++;
        else if (role.includes("all") || p.role === 2) roleCount.AR++;
        else if (role.includes("bowl") || role.includes("pacer") || p.role === 3) roleCount.BOWL++;
        else if (role.includes("bat") || p.role === 1) roleCount.BAT++;
      }
      console.log("[generator] Player pool roles:", roleCount, "total:", allPlayers.length);

      // If any role has < 3 players, generation will likely fail — warn but try anyway
      const minRoleCount = Math.min(roleCount.WK, roleCount.BAT, roleCount.AR, roleCount.BOWL);
      if (minRoleCount < 3) {
        toast.warning(`Low player count per role (WK:${roleCount.WK} BAT:${roleCount.BAT} AR:${roleCount.AR} BOWL:${roleCount.BOWL}) — generation may fail. Try smaller count.`);
      }

      // 3. Run sweep generator
      setProgress({ generated: 0, total: selectedCount, phase: "selecting", message: `Generating ${selectedCount} teams — ${GEN_MODES.find(m => m.id === genMode)?.label}...` });
      const res = await generateSweep(
        allPlayers,
        selectedCount,
        team1Name,
        team2Name,
        (p) => setProgress(p),
        genMode as "smart" | "gl" | "advanced" | "combination", // PASS MODE for strategy selection
      );

      if (res.teams.length === 0) {
        toast.error("Failed to generate any valid teams — try a smaller count");
        setGenerating(false);
        return;
      }

      // 4. Teams saved by parent (handleBulkAddTeams) — no duplicate save here
      // Previously: bulkAddTeams() was called here AND in handleBulkAddTeams → double save
      // Now: handleBulkAddTeams saves teams, so we just pass them via onGenerated

      setResult(res);
      toast.success(`Generated ${res.teams.length} unique teams in ${res.stats.durationMs}ms`);
      onGenerated(res.teams);
    } catch (err: any) {
      console.error("[sweep] generation failed:", err);
      toast.error(err?.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  const selectedMode = GEN_MODES.find(m => m.id === genMode)!;
  const isElite = genMode === "elite";

  // === Mode Settings Page (separate page for Smart/GL/Advanced/Combination) ===
  if (openModePage && openModePage !== "elite") {
    return (
      <ModeSettingsPage
        mode={openModePage}
        match={match}
        matchId={matchId}
        team1Name={team1Name}
        team2Name={team2Name}
        token={token}
        onClose={() => setOpenModePage(null)}
        onGenerated={(teams) => {
          onGenerated(teams);
          setOpenModePage(null);
        }}
      />
    );
  }

  return (
    <div className="bg-white dark:bg-card rounded-2xl border border-violet-100 dark:border-violet-900/30 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="brand-gradient text-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wand2 className="w-5 h-5" />
          <div>
            <h3 className="font-bold text-sm">AI Team Generator</h3>
            <p className="text-[10px] text-white/80">5 modes · Pre-lineup</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20">
            <X className="w-4 h-4" />
          </button>
        )}
      <div className="p-4">
        <label className="text-[11px] font-bold text-foreground mb-2 block flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-violet-500" />
          Generation Mode
        </label>
        <div className="space-y-2">
          {GEN_MODES.map((m) => {
            const Icon = m.icon;
            return (
              <button
                key={m.id}
                onClick={() => {
                  if (m.id === "elite") {
                    setGenMode(m.id);
                    onClose?.();
                    onEliteAI?.();
                  } else {
                    setGenMode(m.id);
                    setOpenModePage(m.id);
                  }
                }}
                disabled={generating}
                className={cn(
                  "w-full text-left p-3 rounded-xl border-2 transition-all flex items-start gap-3",
                  "bg-white dark:bg-card border-violet-100 dark:border-violet-900/30 text-foreground hover:border-violet-300 hover:shadow-md"
                )}
              >
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-gradient-to-br", m.color)}>
                  <Icon className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold flex items-center gap-1.5">
                    {m.label}
                    {m.id === "elite" && (
                      <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400">
                        ELITE KEY
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] mt-0.5 text-muted-foreground">{m.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/50 dark:bg-card/50 rounded-md px-2 py-1">
      <p className="text-[9px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-xs font-bold text-foreground tabular-nums">{value}</p>
    </div>
  );
}
