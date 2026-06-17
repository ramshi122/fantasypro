"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Cpu,
  Layers,
  Loader2,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  TEAM_COUNT_OPTIONS,
  generateTeams,
  computeDiversityStats,
  type DiversityStats,
} from "@/lib/generator";
import type { MatchInfo, MatchPlayer, TeamRow } from "@/lib/api";
import { cn } from "@/lib/utils";

interface SweepGeneratorProps {
  match: MatchInfo;
  players: MatchPlayer[];
  team1Name: string;
  team2Name: string;
  onClose: () => void;
  onGenerated: (teams: TeamRow[]) => void;
}

export function SweepGenerator({
  match,
  players,
  team1Name,
  team2Name,
  onClose,
  onGenerated,
}: SweepGeneratorProps) {
  const [selectedCount, setSelectedCount] = useState<number>(20);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<{
    teams: TeamRow[];
    duplicatesPrevented: number;
    elapsedMs: number;
    stats: DiversityStats;
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const matchId = (match.matchId ?? match.id ?? "") as string;

  async function handleGenerate() {
    if (players.length < 11) {
      toast.error("Not enough players in pool to generate teams");
      return;
    }
    setGenerating(true);
    setResult(null);
    setProgress({ current: 0, total: selectedCount });
    abortRef.current = new AbortController();

    try {
      const res = await generateTeams(players, {
        count: selectedCount,
        team1Name,
        team2Name,
        onProgress: (current, total) => setProgress({ current, total }),
        signal: abortRef.current.signal,
      });

      if (res.teams.length === 0) {
        toast.error("Could not generate any valid teams from the player pool");
        setGenerating(false);
        return;
      }

      const stats = computeDiversityStats(res.teams);
      setResult({
        teams: res.teams,
        duplicatesPrevented: res.duplicatesPrevented,
        elapsedMs: res.elapsedMs,
        stats,
      });
      toast.success(`Generated ${res.teams.length} unique teams in ${(res.elapsedMs / 1000).toFixed(2)}s`);
    } catch (err: any) {
      toast.error(err?.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
    setGenerating(false);
    toast.info("Generation cancelled");
  }

  function handleSaveAll() {
    if (!result) return;
    onGenerated(result.teams);
    onClose();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        className="bg-white dark:bg-background w-full sm:max-w-2xl rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[95vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 brand-gradient text-white p-4 flex items-center justify-between z-10">
          <h3 className="font-bold flex items-center gap-2">
            <Zap className="w-5 h-5" />
            Auto Team Generator
          </h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Match info */}
          <div className="bg-violet-50 dark:bg-violet-900/20 rounded-xl p-3">
            <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
              {match.series || match.title}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {team1Name} vs {team2Name} · {players.length} players in pool · Match ID: {matchId}
            </p>
          </div>

          {/* Team count selector */}
          <div>
            <label className="text-xs font-semibold text-foreground mb-2 block flex items-center gap-1">
              <Layers className="w-3.5 h-3.5 text-violet-500" />
              Team Count
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {TEAM_COUNT_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => setSelectedCount(n)}
                  disabled={generating}
                  className={cn(
                    "h-12 rounded-xl font-bold text-sm transition-all border-2",
                    selectedCount === n
                      ? "brand-gradient text-white border-transparent shadow-md"
                      : "bg-white dark:bg-card border-violet-100 dark:border-violet-900/30 text-foreground hover:border-violet-300"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Generate up to {selectedCount} unique teams with smart C/VC rotation and Grand League diversity.
            </p>
          </div>

          {/* Strategy info */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <StrategyCard
              icon={TrendingUp}
              label="Safe Picks"
              color="text-emerald-600"
              bg="bg-emerald-50 dark:bg-emerald-950/30"
              desc="High selection %"
            />
            <StrategyCard
              icon={Sparkles}
              label="Balanced"
              color="text-sky-600"
              bg="bg-sky-50 dark:bg-sky-950/30"
              desc="Mix of safe + diff"
            />
            <StrategyCard
              icon={Cpu}
              label="Differential"
              color="text-amber-600"
              bg="bg-amber-50 dark:bg-amber-950/30"
              desc="Low sel%, GL upside"
            />
          </div>

          {/* Generate button */}
          {!result && (
            <div className="space-y-3">
              {generating ? (
                <>
                  <div className="bg-violet-50 dark:bg-violet-900/20 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold flex items-center gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-600" />
                        Generating teams...
                      </span>
                      <span className="text-xs font-bold text-violet-700 dark:text-violet-300">
                        {progress.current} / {progress.total}
                      </span>
                    </div>
                    <div className="h-2 bg-violet-100 dark:bg-violet-900/40 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full brand-gradient"
                        initial={{ width: 0 }}
                        animate={{ width: `${(progress.current / progress.total) * 100}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full border-red-200 text-red-600 hover:bg-red-50"
                    onClick={handleCancel}
                  >
                    Cancel Generation
                  </Button>
                </>
              ) : (
                <Button
                  className="w-full h-12 brand-gradient text-white font-bold"
                  onClick={handleGenerate}
                  disabled={players.length < 11}
                >
                  <Zap className="w-5 h-5 mr-2" />
                  Generate {selectedCount} Teams
                </Button>
              )}
              {players.length < 11 && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 text-center">
                  Need at least 11 players in the pool to generate teams (currently {players.length}).
                </p>
              )}
            </div>
          )}

          {/* Results */}
          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                {/* Success banner */}
                <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 flex items-start gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                      Generated {result.teams.length} unique teams
                    </p>
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {result.duplicatesPrevented} duplicates prevented ·{" "}
                      {(result.elapsedMs / 1000).toFixed(2)}s · {result.stats.uniqueCVPairs} unique C/VC pairs
                    </p>
                  </div>
                </div>

                {/* Diversity stats */}
                <div>
                  <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5 text-violet-500" />
                    Top Captains
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.stats.topCaptains.map((c, i) => (
                      <span
                        key={c.name}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                      >
                        #{i + 1} {c.name} ({c.count}x)
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-violet-500" />
                    Top Vice-Captains
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.stats.topViceCaptains.map((c, i) => (
                      <span
                        key={c.name}
                        className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                      >
                        #{i + 1} {c.name} ({c.count}x)
                      </span>
                    ))}
                  </div>
                </div>

                {/* Preview teams */}
                <div>
                  <p className="text-xs font-semibold text-foreground mb-2">
                    Team Preview ({Math.min(result.teams.length, 5)} of {result.teams.length})
                  </p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto scrollbar-thin">
                    {result.teams.slice(0, 5).map((t, i) => (
                      <div
                        key={i}
                        className="bg-white dark:bg-card border border-violet-100 dark:border-violet-900/30 rounded-lg p-2"
                      >
                        <p className="text-[11px] font-bold mb-1">
                          Team #{t.teamNo} · C: {getPlayerName(t, t.captain)} · VC: {getPlayerName(t, t.viceCaptain)}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {(t.players || []).map((p) => p.shortName || p.name).join(", ")}
                        </p>
                      </div>
                    ))}
                    {result.teams.length > 5 && (
                      <p className="text-[10px] text-muted-foreground text-center pt-1">
                        + {result.teams.length - 5} more teams...
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-1 sticky bottom-0 bg-white dark:bg-background pb-1">
                  <Button variant="outline" className="flex-1" onClick={() => setResult(null)}>
                    Regenerate
                  </Button>
                  <Button
                    className="flex-1 brand-gradient text-white"
                    onClick={handleSaveAll}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1.5" />
                    Save All {result.teams.length} Teams
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Validation rules */}
          {!result && !generating && (
            <div className="bg-violet-50/50 dark:bg-violet-950/20 rounded-xl p-3 space-y-1.5">
              <p className="text-[11px] font-bold text-violet-700 dark:text-violet-300 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Validation Rules Applied
              </p>
              <ul className="text-[10px] text-muted-foreground space-y-0.5 ml-4">
                <li>✓ 11 players per team, max 100 credits</li>
                <li>✓ Role balance: 1-8 WK / 1-8 BAT / 1-8 AR / 1-8 BOWL</li>
                <li>✓ Max 7 players from one team (Dream11 rule)</li>
                <li>✓ No duplicate teams across the generated set</li>
                <li>✓ Unique C/VC pairs rotated across teams</li>
                <li>✓ Tier mix: Safe + Balanced + Differential picks</li>
              </ul>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function getPlayerName(team: TeamRow, playerId: any): string {
  const id = String(playerId ?? "");
  const p = (team.players || []).find(
    (pp) => String(pp.player_fixed_id ?? pp.pid ?? pp.name) === id
  );
  return p?.shortName || p?.name || "?";
}

function StrategyCard({
  icon: Icon,
  label,
  color,
  bg,
  desc,
}: {
  icon: typeof TrendingUp;
  label: string;
  color: string;
  bg: string;
  desc: string;
}) {
  return (
    <div className={cn("rounded-xl p-2", bg)}>
      <Icon className={cn("w-4 h-4 mx-auto mb-1", color)} />
      <p className={cn("text-[10px] font-bold", color)}>{label}</p>
      <p className="text-[9px] text-muted-foreground">{desc}</p>
    </div>
  );
}
