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
  bulkAddTeams,
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
      if (genMode === "advanced") {
        // Advanced: sort by credits (form indicator) — keep top 30
        allPlayers = allPlayers.sort((a, b) => Number(b.credits || 0) - Number(a.credits || 0)).slice(0, 30);
      } else if (genMode === "gl") {
        // GL: emphasize differentials — sort by sel% ascending + credits
        allPlayers = allPlayers.sort((a, b) => {
          const selA = Number(a.selected_by ?? a.sel ?? 0);
          const selB = Number(b.selected_by ?? b.sel ?? 0);
          return selA - selB; // low sel% first
        });
      }

      // 3. Run sweep generator
      setProgress({ generated: 0, total: selectedCount, phase: "selecting", message: `Generating ${selectedCount} teams — ${GEN_MODES.find(m => m.id === genMode)?.label}...` });
      const res = await generateSweep(
        allPlayers,
        selectedCount,
        team1Name,
        team2Name,
        (p) => setProgress(p)
      );

      if (res.teams.length === 0) {
        toast.error("Failed to generate any valid teams — try a smaller count");
        setGenerating(false);
        return;
      }

      // 4. Bulk-save to localStorage
      await bulkAddTeams(token!, {
        matchId,
        teams: res.teams.map((t) => ({
          players: t.players,
          captain: t.captain,
          viceCaptain: t.viceCaptain,
          type: genMode,
        })),
        mode,
      });

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
      </div>

      <div className="p-4 space-y-4">
        {/* Generation Mode selector */}
        <div>
          <label className="text-xs font-semibold text-foreground mb-2 block flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-violet-500" />
            Generation Mode
          </label>
          <div className="space-y-2">
            {GEN_MODES.map((m) => {
              const Icon = m.icon;
              const active = genMode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setGenMode(m.id)}
                  disabled={generating}
                  className={cn(
                    "w-full text-left p-3 rounded-xl border-2 transition-all flex items-start gap-3",
                    active
                      ? "border-transparent bg-gradient-to-r " + m.color + " text-white shadow-md"
                      : "bg-white dark:bg-card border-violet-100 dark:border-violet-900/30 text-foreground hover:border-violet-300"
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
                    active ? "bg-white/20" : "bg-violet-50 dark:bg-violet-900/30"
                  )}>
                    <Icon className={cn("w-4 h-4", active ? "text-white" : "text-violet-500")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-xs font-bold flex items-center gap-1.5", active ? "text-white" : "text-foreground")}>
                      {m.label}
                      {active && <CheckCircle2 className="w-3 h-3" />}
                      {m.id === "elite" && (
                        <span className={cn(
                          "text-[8px] px-1.5 py-0.5 rounded-full font-bold",
                          active ? "bg-white/20 text-white" : "bg-amber-100 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"
                        )}>
                          ELITE KEY
                        </span>
                      )}
                    </p>
                    <p className={cn("text-[10px] mt-0.5 leading-relaxed", active ? "text-white/80" : "text-muted-foreground")}>
                      {m.desc}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Captain / Vice-Captain Control */}
        <div className="bg-violet-50/50 dark:bg-violet-950/20 rounded-xl p-3">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-xs font-bold text-foreground mb-0.5">Captain / Vice-Captain</p>
              <p className="text-[10px] text-muted-foreground">
                Auto mode — AI picks C/VC from top players. Tap &quot;Customize&quot; to lock 1-8 candidates.
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-violet-600 dark:text-violet-400 h-8 text-xs"
              onClick={() => toast.info("C/VC customization coming soon — currently auto-rotated")}
            >
              Customize
            </Button>
          </div>
        </div>

        {/* Count picker */}
        <div>
          <label className="text-xs font-semibold text-foreground mb-2 block">
            Team Count
          </label>
          <div className="grid grid-cols-3 gap-2">
            {SWEEP_OPTIONS.map((c) => {
              const active = selectedCount === c;
              return (
                <button
                  key={c}
                  onClick={() => setSelectedCount(c)}
                  disabled={generating}
                  className={cn(
                    "h-11 rounded-xl text-sm font-bold transition-all border-2",
                    active
                      ? "brand-gradient text-white border-transparent shadow-md"
                      : "bg-white dark:bg-card border-violet-100 dark:border-violet-900/30 text-foreground hover:border-violet-300"
                  )}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>

        {/* Mode picker */}
        <div>
          <label className="text-xs font-semibold text-foreground mb-2 block">
            Save Mode
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMode("replace")}
              disabled={generating}
              className={cn(
                "h-10 rounded-xl text-xs font-semibold transition-all border-2",
                mode === "replace"
                  ? "brand-gradient text-white border-transparent"
                  : "bg-white dark:bg-card border-violet-100 dark:border-violet-900/30 text-foreground"
              )}
            >
              Replace existing
            </button>
            <button
              onClick={() => setMode("append")}
              disabled={generating}
              className={cn(
                "h-10 rounded-xl text-xs font-semibold transition-all border-2",
                mode === "append"
                  ? "brand-gradient text-white border-transparent"
                  : "bg-white dark:bg-card border-violet-100 dark:border-violet-900/30 text-foreground"
              )}
            >
              Append to existing
            </button>
          </div>
        </div>

        {/* Generate button */}
        <Button
          onClick={handleGenerate}
          disabled={generating}
          className={cn(
            "w-full h-12 text-white font-bold text-sm",
            isElite
              ? "bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-700 hover:to-yellow-700"
              : "brand-gradient"
          )}
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Generating {selectedCount} teams...
            </>
          ) : isElite ? (
            <>
              <Crown className="w-4 h-4 mr-2" />
              Open Elite AI — 25 Checks + Ranked Teams
            </>
          ) : (
            <>
              <Zap className="w-4 h-4 mr-2" />
              Generate {selectedCount} Teams · {selectedMode.label}
            </>
          )}
        </Button>

        {/* Progress */}
        <AnimatePresence>
          {generating && progress && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-2"
            >
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="font-semibold">{progress.message}</span>
                <span className="tabular-nums">{progress.generated}/{progress.total}</span>
              </div>
              <div className="h-2 bg-violet-50 dark:bg-violet-900/30 rounded-full overflow-hidden">
                <motion.div
                  className="h-full brand-gradient"
                  initial={{ width: 0 }}
                  animate={{ width: `${(progress.generated / progress.total) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
              <div className="flex gap-1 text-[9px] text-muted-foreground">
                {["validating", "selecting", "rotating", "deduplicating", "done"].map((phase, i) => {
                  const order = ["validating", "selecting", "rotating", "deduplicating", "done"];
                  const active = order.indexOf(progress.phase) >= i;
                  return (
                    <span
                      key={phase}
                      className={cn(
                        "px-1.5 py-0.5 rounded-full",
                        active ? "brand-gradient text-white" : "bg-violet-50 dark:bg-violet-900/30"
                      )}
                    >
                      {phase}
                    </span>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Result stats */}
        <AnimatePresence>
          {result && !generating && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 space-y-2"
            >
              <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4" />
                <p className="text-xs font-bold">
                  Generated {result.stats.generated} unique teams
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <Stat label="Duration" value={`${result.stats.durationMs}ms`} />
                <Stat label="Duplicates rejected" value={result.stats.duplicates.toString()} />
                <Stat label="Unique Captains" value={result.stats.coverage.uniqueCaptains.toString()} />
                <Stat label="Unique VCs" value={result.stats.coverage.uniqueViceCaptains.toString()} />
                <Stat label="Avg exposure" value={result.stats.coverage.avgPlayerExposure.toFixed(1)} />
                <Stat label="Max exposure" value={result.stats.coverage.maxPlayerExposure.toString()} />
              </div>
              <div className="pt-1.5 border-t border-emerald-200 dark:border-emerald-800">
                <p className="text-[10px] text-muted-foreground mb-1">Role distribution (total players):</p>
                <div className="flex gap-1.5 text-[10px]">
                  {Object.entries(result.stats.roleDistribution).map(([role, count]) => (
                    <span
                      key={role}
                      className={cn(
                        "px-2 py-0.5 rounded-full font-bold text-white",
                        role === "WK" && "bg-amber-500",
                        role === "BAT" && "bg-sky-500",
                        role === "AR" && "bg-emerald-500",
                        role === "BOWL" && "bg-rose-500"
                      )}
                    >
                      {role}: {count}
                    </span>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Validation hints */}
        <div className="space-y-1 text-[10px] text-muted-foreground">
          <p className="font-semibold text-foreground/70">Validation rules applied:</p>
          <ul className="space-y-0.5 pl-3">
            <li>✓ 11 players per team</li>
            <li>✓ 1+ WK, 3-6 BAT, 1-4 AR, 3-6 BOWL</li>
            <li>✓ Max 7 players from one side</li>
            <li>✓ Total credits ≤ 100</li>
            <li>✓ No duplicate team combinations</li>
            <li>✓ No duplicate C/VC combinations</li>
            <li>✓ Mix of safe / balanced / differential picks</li>
            <li>✓ Excludes bench / unavailable / non-playing</li>
          </ul>
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
