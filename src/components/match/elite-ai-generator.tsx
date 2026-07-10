"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  Brain,
  CheckCircle2,
  Clock,
  Cpu,
  Crown,
  Layers,
  Loader2,
  Send,
  Shield,
  Sparkles,
  TrendingUp,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  runEliteAI,
  type EliteAnalysisResult,
  type EliteRankedTeam,
  type EliteGenerateResult,
} from "@/lib/elite-ai";
import type { MatchInfo, MatchPlayer, TeamRow } from "@/lib/api";
import { cn } from "@/lib/utils";

interface EliteAIGeneratorProps {
  match: MatchInfo;
  players: MatchPlayer[];
  team1Name: string;
  team2Name: string;
  lineupAnnounced: boolean;
  onClose: () => void;
  onGenerated: (teams: TeamRow[]) => void;
  onTransfer?: (teams: TeamRow[], app: "dream11" | "my11circle") => void;
  licenseTier?: string | null;
  isLicensed?: boolean;
}

export function EliteAIGenerator({
  match,
  players,
  team1Name,
  team2Name,
  lineupAnnounced,
  onClose,
  onGenerated,
  onTransfer,
  licenseTier,
  isLicensed,
}: EliteAIGeneratorProps) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ check: 0, total: 25, message: "" });
  const [result, setResult] = useState<EliteGenerateResult | null>(null);
  const [selectedCount, setSelectedCount] = useState<number>(20);
  const [eliteMode, setEliteMode] = useState<"smart" | "gl" | "advanced" | "combination">("smart");

  const matchId = (match?.matchId ?? match?.id ?? "") as string;

  // Defensive: ensure players is always an array
  const safePlayers = Array.isArray(players) ? players : [];

  async function handleRun() {
    if (safePlayers.length < 11) {
      toast.error("Need at least 11 players in pool");
      return;
    }
    setRunning(true);
    setResult(null);
    setProgress({ check: 0, total: 26, message: "Initializing Elite AI..." });

    try {
      const res = await runEliteAI(
        safePlayers,
        team1Name || "T1",
        team2Name || "T2",
        lineupAnnounced,
        (check, total, message) => setProgress({ check, total, message }),
        selectedCount
      );

      if (!res || !res.rankedTeams || res.rankedTeams.length === 0) {
        toast.error("AI could not generate teams — try with more players");
        setRunning(false);
        return;
      }

      setResult(res);
      toast.success(`Elite AI generated ${res.rankedTeams.length} ranked teams in ${(res.durationMs / 1000).toFixed(2)}s`);
    } catch (err: any) {
      console.error("[EliteAI] error:", err);
      toast.error(err?.message || "Elite AI failed — check console for details");
    } finally {
      setRunning(false);
    }
  }

  function handleSaveAll() {
    if (!result) return;
    onGenerated(result.rankedTeams.map((r) => r.team));
    onClose();
  }

  function handleSaveOne(rank: number) {
    if (!result) return;
    const t = result.rankedTeams.find((r) => r.rank === rank);
    if (!t) return;
    onGenerated([t.team]);
    onClose();
  }

  // Transfer ALL ranked teams to Dream11 or My11Circle
  function handleTransferAll(app: "dream11" | "my11circle") {
    if (!result || !onTransfer) return;
    const teams = result.rankedTeams.map((r) => r.team);
    onGenerated(teams); // save to localStorage first
    onTransfer(teams, app);
    onClose();
  }

  // Transfer a SINGLE ranked team to Dream11 or My11Circle
  function handleTransferOne(rank: number, app: "dream11" | "my11circle") {
    if (!result || !onTransfer) return;
    const t = result.rankedTeams.find((r) => r.rank === rank);
    if (!t) return;
    onGenerated([t.team]); // save to localStorage first
    onTransfer([t.team], app);
    onClose();
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        className="bg-background w-full sm:max-w-3xl rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[95vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — Cinematic Gold */}
        <div className="sticky top-0 z-10 bg-gradient-to-r from-amber-900 via-yellow-800 to-amber-900 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center">
              <Crown className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h3 className="font-black text-base flex items-center gap-2">
                Elite AI Team Generator
                <span className="text-[9px] bg-amber-400 text-amber-950 px-1.5 py-0.5 rounded-full font-bold">RANK 1-{selectedCount}</span>
              </h3>
              <p className="text-[10px] text-white/70">25-check AI research · {selectedCount} ranked teams by EFV score</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/20">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Match info */}
          <div className="bg-amber-50 dark:bg-amber-950/20 rounded-xl p-3 border border-amber-200 dark:border-amber-800">
            <p className="text-xs font-bold text-amber-800 dark:text-amber-200">
              {match.series || match.title}
            </p>
            <p className="text-[11px] text-amber-700 dark:text-amber-300">
              {team1Name} vs {team2Name} · {safePlayers.length} players · {lineupAnnounced ? "✓ Lineup announced" : "⚠ Lineup pending"}
            </p>
          </div>

          {/* Initial state — Run button */}
          {!result && !running && (
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-violet-50 to-amber-50 dark:from-violet-950/30 dark:to-amber-950/30 rounded-2xl p-5 text-center border border-violet-200 dark:border-violet-800">
                <Brain className="w-12 h-12 mx-auto text-violet-600 dark:text-violet-400 mb-2" />
                <h4 className="text-sm font-black text-foreground mb-1">
                  Hard AI Research · 25 Deep Checks
                </h4>
                <p className="text-[11px] text-muted-foreground mb-3 max-w-md mx-auto">
                  Elite AI runs 25 in-depth analysis checks on the player pool — covering captain certainty,
                  role balance, form trends, differential opportunity, venue suitability, risk-reward ratio
                  and more. Then generates {selectedCount} ranked teams (Rank 1 = best EFV score).
                </p>
                <div className="grid grid-cols-2 gap-2 text-[10px] mb-4">
                  <div className="bg-white/60 dark:bg-card/60 rounded-lg p-2">
                    <p className="font-bold text-violet-600 dark:text-violet-400">25 Checks</p>
                    <p className="text-muted-foreground">Deep AI analysis</p>
                  </div>
                  <div className="bg-white/60 dark:bg-card/60 rounded-lg p-2">
                    <p className="font-bold text-amber-600 dark:text-amber-400">{selectedCount} Ranked Teams</p>
                    <p className="text-muted-foreground">Rank 1 to Rank {selectedCount}</p>
                  </div>
                </div>

                {/* Team count selector — 1 to 40 */}
                <div className="mb-4 text-left">
                  <label className="text-[11px] font-bold text-foreground mb-2 block flex items-center gap-1">
                    <Layers className="w-3 h-3 text-amber-500" />
                    Team Count (1 to 40)
                  </label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[1, 5, 10, 15, 20, 25, 30, 35, 40].map((n) => (
                      <button
                        key={n}
                        onClick={() => setSelectedCount(n)}
                        className={cn(
                          "h-9 rounded-lg font-bold text-xs transition-all border-2",
                          selectedCount === n
                            ? "bg-gradient-to-r from-amber-600 to-yellow-600 text-white border-transparent shadow-md"
                            : "bg-white dark:bg-card border-amber-200 dark:border-amber-900/30 text-foreground hover:border-amber-400"
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  {/* Custom slider for 1-40 */}
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="range"
                      min={1}
                      max={40}
                      value={selectedCount}
                      onChange={(e) => setSelectedCount(parseInt(e.target.value))}
                      className="flex-1 h-2 bg-amber-100 dark:bg-amber-900/30 rounded-full appearance-none cursor-pointer accent-amber-600"
                    />
                    <span className="text-xs font-black text-amber-700 dark:text-amber-300 tabular-nums w-8 text-center">
                      {selectedCount}
                    </span>
                  </div>
                  <p className="text-[9px] text-muted-foreground mt-1">
                    Strategy split: ~25% Safe · ~30% Balanced · ~25% Differential · ~20% Grand-League
                  </p>
                </div>

                <Button
                  className="w-full h-12 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-700 hover:to-yellow-700 text-white font-bold"
                  onClick={handleRun}
                  disabled={safePlayers.length < 11}
                >
                  <Brain className="w-5 h-5 mr-2" />
                  Run Elite AI Research — Generate {selectedCount} Teams
                </Button>
                {safePlayers.length < 11 && (
                  <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-2">
                    Need at least 11 players (currently {safePlayers.length})
                  </p>
                )}
              </div>

              {/* 25 checks preview */}
              <div className="bg-violet-50/50 dark:bg-violet-950/20 rounded-xl p-3">
                <p className="text-[11px] font-bold text-violet-700 dark:text-violet-300 mb-2 flex items-center gap-1.5">
                  <Cpu className="w-3 h-3" />
                  25 AI Analysis Checks
                </p>
                <div className="grid grid-cols-2 gap-1 text-[9px] text-muted-foreground">
                  {CHECK_NAMES.map((name, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <span className="text-violet-500 font-bold">{i + 1}.</span>
                      <span>{name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Running state — progress */}
          {running && (
            <div className="space-y-4">
              <div className="bg-violet-50 dark:bg-violet-950/30 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold flex items-center gap-1.5">
                    <Loader2 className="w-4 h-4 animate-spin text-violet-600" />
                    {progress.message}
                  </span>
                  <span className="text-xs font-black text-violet-700 dark:text-violet-300 tabular-nums">
                    {progress.check}/{progress.total}
                  </span>
                </div>
                <div className="h-3 bg-violet-100 dark:bg-violet-900/40 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-amber-500 to-violet-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${(progress.check / progress.total) * 100}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <div className="grid grid-cols-5 gap-1 mt-2">
                  {Array.from({ length: 25 }, (_, i) => i + 1).map((n) => (
                    <div
                      key={n}
                      className={cn(
                        "h-1.5 rounded-full transition-colors",
                        n <= progress.check
                          ? "bg-gradient-to-r from-amber-500 to-violet-500"
                          : "bg-violet-100 dark:bg-violet-900/40"
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Result — analysis + ranked teams */}
          {result && !running && (
            <EliteAIResult
              result={result}
              onSaveAll={handleSaveAll}
              onSaveOne={handleSaveOne}
              onRerun={handleRun}
              onTransferAll={onTransfer ? handleTransferAll : undefined}
              onTransferOne={onTransfer ? handleTransferOne : undefined}
              licenseTier={licenseTier}
              isLicensed={isLicensed}
            />
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ============== Result Component ============== */

function EliteAIResult({
  result,
  onSaveAll,
  onSaveOne,
  onRerun,
  onTransferAll,
  onTransferOne,
  licenseTier,
  isLicensed,
}: {
  result: EliteGenerateResult;
  onSaveAll: () => void;
  onSaveOne: (rank: number) => void;
  onRerun: () => void;
  onTransferAll?: (app: "dream11" | "my11circle") => void;
  onTransferOne?: (rank: number, app: "dream11" | "my11circle") => void;
  licenseTier?: string | null;
  isLicensed?: boolean;
}) {
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [selectedRank, setSelectedRank] = useState<number | null>(null);

  // Tier checks for transfer buttons
  const my11Tiers = ["match_full", "weekly", "monthly", "elite", "lifetime"];
  const canDream11 = isLicensed !== false;
  const canMy11 = isLicensed && licenseTier && my11Tiers.includes(licenseTier);

  const { analysis, rankedTeams, durationMs } = result;

  return (
    <div className="space-y-4">
      {/* Overall score banner */}
      <div className="bg-gradient-to-br from-amber-100 to-violet-100 dark:from-amber-950/30 dark:to-violet-950/30 rounded-2xl p-4 border border-amber-300 dark:border-amber-800">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-bold">AI Confidence Score</p>
            <p className="text-3xl font-black text-amber-700 dark:text-amber-300">
              {analysis.overallScore}<span className="text-base text-muted-foreground">/100</span>
            </p>
            <p className="text-[10px] text-muted-foreground">
              {analysis.confidence === "high" ? "🟢 HIGH confidence" : analysis.confidence === "medium" ? "🟡 MEDIUM confidence" : "🔴 LOW confidence"} ·
              Recommended: {analysis.recommendedStrategy.toUpperCase()}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">Generated in</p>
            <p className="text-sm font-bold text-foreground">{(durationMs / 1000).toFixed(2)}s</p>
            <p className="text-[10px] text-muted-foreground mt-1">{rankedTeams.length} ranked teams</p>
          </div>
        </div>

        {/* === WIN PROBABILITY DISPLAY (NEW) === */}
        {analysis.winProbability && (
          <div className="mt-3 bg-white/60 dark:bg-slate-900/40 rounded-xl p-3 border border-violet-200 dark:border-violet-800">
            <p className="text-[10px] font-bold text-violet-700 dark:text-violet-300 uppercase tracking-wide mb-2">
              🏆 Win Probability Analysis
            </p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-2 text-center">
                <p className="text-[9px] text-muted-foreground font-bold">{analysis.winProbability.teamA.name}</p>
                <p className="text-xl font-black text-blue-600 dark:text-blue-400">
                  {analysis.winProbability.teamAWinPercent}%
                </p>
                <p className="text-[8px] text-muted-foreground">
                  BAT:{analysis.winProbability.teamA.batStrength} · BOWL:{analysis.winProbability.teamA.bowlStrength}
                </p>
              </div>
              <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-2 text-center">
                <p className="text-[9px] text-muted-foreground font-bold">{analysis.winProbability.teamB.name}</p>
                <p className="text-xl font-black text-red-600 dark:text-red-400">
                  {analysis.winProbability.teamBWinPercent}%
                </p>
                <p className="text-[8px] text-muted-foreground">
                  BAT:{analysis.winProbability.teamB.batStrength} · BOWL:{analysis.winProbability.teamB.bowlStrength}
                </p>
              </div>
            </div>
            <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2 text-center">
              <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300">
                ⚖️ Recommended Split: {analysis.winProbability.teamA.name} {analysis.winProbability.recommendedSplit.A} - {analysis.winProbability.recommendedSplit.B} {analysis.winProbability.teamB.name}
              </p>
              <p className="text-[9px] text-muted-foreground mt-1">{analysis.winProbability.reasoning}</p>
            </div>
          </div>
        )}

        <Button
          variant="outline"
          size="sm"
          className="w-full h-8 text-[11px] border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300"
          onClick={() => setShowAnalysis(!showAnalysis)}
        >
          {showAnalysis ? "Hide" : "Show"} 26 AI Checks
        </Button>
      </div>

      {/* 25 checks (collapsible) */}
      <AnimatePresence>
        {showAnalysis && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-1.5"
          >
            {analysis.checks.map((check) => (
              <div
                key={check.id}
                className={cn(
                  "rounded-lg p-2 border text-[10px]",
                  check.status === "excellent" && "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800",
                  check.status === "good" && "bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800",
                  check.status === "warning" && "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",
                  check.status === "critical" && "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
                )}
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-bold flex items-center gap-1">
                    <span className="text-muted-foreground">#{check.id}</span>
                    {check.name}
                  </span>
                  <span className="font-black tabular-nums">{check.score}</span>
                </div>
                <p className="text-muted-foreground">{check.insight}</p>
                {check.recommendation && (
                  <p className="text-amber-600 dark:text-amber-400 font-semibold mt-0.5">→ {check.recommendation}</p>
                )}
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top picks */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2 border border-amber-200 dark:border-amber-800">
          <p className="text-[9px] font-bold text-amber-700 dark:text-amber-300 uppercase mb-1">Top Captains</p>
          {analysis.topCaptainPicks.slice(0, 3).map((p, i) => (
            <p key={i} className="text-[10px] text-foreground">
              <span className="font-bold">#{i + 1}</span> {p.name.slice(0, 12)}
              <span className="text-muted-foreground"> ({p.selPct.toFixed(0)}%)</span>
            </p>
          ))}
        </div>
        <div className="bg-sky-50 dark:bg-sky-950/30 rounded-lg p-2 border border-sky-200 dark:border-sky-800">
          <p className="text-[9px] font-bold text-sky-700 dark:text-sky-300 uppercase mb-1">Top VCs</p>
          {analysis.topVCPicks.slice(0, 3).map((p, i) => (
            <p key={i} className="text-[10px] text-foreground">
              <span className="font-bold">#{i + 1}</span> {p.name.slice(0, 12)}
              <span className="text-muted-foreground"> ({p.selPct.toFixed(0)}%)</span>
            </p>
          ))}
        </div>
        <div className="bg-rose-50 dark:bg-rose-950/30 rounded-lg p-2 border border-rose-200 dark:border-rose-800">
          <p className="text-[9px] font-bold text-rose-700 dark:text-rose-300 uppercase mb-1">Differentials</p>
          {analysis.differentialPicks.slice(0, 3).map((p, i) => (
            <p key={i} className="text-[10px] text-foreground">
              <span className="font-bold">#{i + 1}</span> {p.name.slice(0, 12)}
              <span className="text-muted-foreground"> ({p.selPct.toFixed(0)}%)</span>
            </p>
          ))}
        </div>
      </div>

      {/* Ranked teams — Rank 1 to N */}
      <div>
        <p className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5 text-amber-500" />
          {rankedTeams.length} Ranked Teams — Rank 1 (Best) to Rank {rankedTeams.length} (Most Differential)
        </p>
        <div className="space-y-2">
          {rankedTeams.map((rt) => (
            <RankedTeamCard
              key={rt.rank}
              rankedTeam={rt}
              expanded={selectedRank === rt.rank}
              onToggle={() => setSelectedRank(selectedRank === rt.rank ? null : rt.rank)}
              onSave={() => onSaveOne(rt.rank)}
              onTransferOne={onTransferOne}
              canDream11={canDream11}
              canMy11={canMy11}
            />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2 sticky bottom-0 bg-background pt-2 pb-1">
        {/* Save + Transfer All — bulk */}
        {onTransferAll && (
          <div className="grid grid-cols-2 gap-2">
            <Button
              className={cn(
                canDream11 ? "bg-red-600 hover:bg-red-700 text-white font-bold h-11" : "bg-slate-300 text-slate-500 dark:bg-slate-700 h-11"
              )}
              onClick={() => canDream11 ? onTransferAll("dream11") : toast.error("Activate license to transfer")}
            >
              <Send className="w-4 h-4 mr-1.5" />
              {canDream11 ? "Transfer All → Dream11" : "🔒 Dream11"}
            </Button>
            <Button
              className={cn(
                canMy11 ? "bg-sky-600 hover:bg-sky-700 text-white font-bold h-11" : "bg-slate-300 text-slate-500 dark:bg-slate-700 h-11"
              )}
              onClick={() => canMy11 ? onTransferAll("my11circle") : toast.error("My11Circle requires 24h pass (₹99) or higher")}
            >
              <Send className="w-4 h-4 mr-1.5" />
              {canMy11 ? "Transfer All → My11Circle" : "🔒 My11Circle"}
            </Button>
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onRerun}>
            <Brain className="w-4 h-4 mr-1.5" />
            Re-run AI
          </Button>
          <Button
            className="flex-1 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-700 hover:to-yellow-700 text-white font-bold"
            onClick={onSaveAll}
          >
            <CheckCircle2 className="w-4 h-4 mr-1.5" />
            Save All {rankedTeams.length} Teams
          </Button>
        </div>
        {onTransferAll && (
          <p className="text-[9px] text-center text-muted-foreground">
            💡 Transfer All saves teams first, then opens the transfer modal —
            supports bulk + single, replace existing, and join contest check.
          </p>
        )}
      </div>
    </div>
  );
}

/* ============== Ranked Team Card ============== */

function RankedTeamCard({
  rankedTeam,
  expanded,
  onToggle,
  onSave,
  onTransferOne,
  canDream11,
  canMy11,
}: {
  rankedTeam: EliteRankedTeam;
  expanded: boolean;
  onToggle: () => void;
  onSave: () => void;
  onTransferOne?: (rank: number, app: "dream11" | "my11circle") => void;
  canDream11?: boolean;
  canMy11?: boolean;
}) {
  const { rank, team, efv, aiScore, riskLevel, strategy, reasoning, captainReason, vcReason } = rankedTeam;

  const rankColor =
    rank === 1 ? "from-amber-400 to-yellow-500" :
    rank === 2 ? "from-slate-300 to-slate-400" :
    rank === 3 ? "from-orange-400 to-amber-600" :
    rank <= 10 ? "from-violet-500 to-purple-600" :
    rank <= 20 ? "from-sky-500 to-blue-600" :
    rank <= 30 ? "from-emerald-500 to-teal-600" :
    "from-rose-500 to-pink-600";

  const rankLabel =
    rank === 1 ? "RANK 1 — BEST PICK" :
    rank === 2 ? "RANK 2 — RUNNER-UP" :
    rank === 3 ? "RANK 3 — PODIUM" :
    rank <= 10 ? `RANK ${rank} — TOP 10` :
    rank <= 20 ? `RANK ${rank} — MID TIER` :
    rank <= 30 ? `RANK ${rank} — DIFFERENTIAL` :
    `RANK ${rank} — CONTRARIAN`;

  const riskColor =
    riskLevel === "low" ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" :
    riskLevel === "medium" ? "text-amber-600 bg-amber-50 dark:bg-amber-950/30" :
    "text-rose-600 bg-rose-50 dark:bg-rose-950/30";

  // Get captain + VC player objects
  const captain = (team.players || []).find((p) => String(p.player_fixed_id ?? p.pid) === team.captain);
  const viceCaptain = (team.players || []).find((p) => String(p.player_fixed_id ?? p.pid) === team.viceCaptain);

  return (
    <div className={cn(
      "rounded-xl border-2 overflow-hidden transition-all",
      rank <= 3 ? "border-amber-300 dark:border-amber-700" : "border-violet-100 dark:border-violet-900/30"
    )}>
      {/* Rank header */}
      <div
        className={cn(
          "bg-gradient-to-r p-2.5 flex items-center justify-between cursor-pointer",
          rankColor
        )}
        onClick={onToggle}
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-white/30 backdrop-blur-md flex items-center justify-center font-black text-white text-sm">
            {rank <= 3 ? <Crown className="w-4 h-4" /> : rank}
          </div>
          <div>
            <p className="text-xs font-black text-white">
              {rankLabel}
            </p>
            <p className="text-[10px] text-white/80 uppercase">{strategy} · {riskLevel} risk</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-black text-white tabular-nums">EFV {efv.toFixed(1)}</p>
          <p className="text-[10px] text-white/80">AI: {aiScore}/100</p>
        </div>
      </div>

      {/* Team preview (always visible) */}
      <div className="bg-white dark:bg-card p-2.5">
        <div className="flex items-center gap-2 mb-1.5 text-[10px]">
          <span className={cn("px-1.5 py-0.5 rounded-full font-bold", "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300")}>
            C: {captain?.shortName || captain?.name || "?"}
          </span>
          <span className={cn("px-1.5 py-0.5 rounded-full font-bold", "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300")}>
            VC: {viceCaptain?.shortName || viceCaptain?.name || "?"}
          </span>
          <span className={cn("px-1.5 py-0.5 rounded-full font-bold", riskColor)}>
            {riskLevel.toUpperCase()}
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground truncate">
          {(team.players || []).map((p) => p.shortName || p.name).join(" · ")}
        </p>
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-violet-50/50 dark:bg-violet-950/20 p-3 space-y-2 text-[10px]"
          >
            <div>
              <p className="font-bold text-violet-700 dark:text-violet-300 mb-0.5">🧠 AI Reasoning</p>
              <p className="text-muted-foreground">{reasoning}</p>
            </div>
            <div>
              <p className="font-bold text-amber-700 dark:text-amber-300 mb-0.5">👑 Captain</p>
              <p className="text-muted-foreground">{captainReason}</p>
            </div>
            <div>
              <p className="font-bold text-slate-700 dark:text-slate-300 mb-0.5">⭐ Vice-Captain</p>
              <p className="text-muted-foreground">{vcReason}</p>
            </div>
            <Button
              size="sm"
              className="w-full h-8 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-700 hover:to-yellow-700 text-white text-[11px]"
              onClick={onSave}
            >
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Save Rank {rank} Team
            </Button>
            {/* Single team transfer buttons — locked per tier */}
            {onTransferOne && (
              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  size="sm"
                  className={cn(
                    "h-8 text-[10px]",
                    canDream11 ? "bg-red-600 hover:bg-red-700 text-white" : "bg-slate-300 text-slate-500 dark:bg-slate-700"
                  )}
                  onClick={() => canDream11 ? onTransferOne(rank, "dream11") : toast.error("Activate license to transfer")}
                >
                  <Send className="w-3 h-3 mr-1" />
                  {canDream11 ? "→ Dream11" : "🔒 Dream11"}
                </Button>
                <Button
                  size="sm"
                  className={cn(
                    "h-8 text-[10px]",
                    canMy11 ? "bg-sky-600 hover:bg-sky-700 text-white" : "bg-slate-300 text-slate-500 dark:bg-slate-700"
                  )}
                  onClick={() => canMy11 ? onTransferOne(rank, "my11circle") : toast.error("My11Circle requires 24h pass or higher")}
                >
                  <Send className="w-3 h-3 mr-1" />
                  {canMy11 ? "→ My11Circle" : "🔒 My11Circle"}
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ============== Check Names (for preview) ============== */

const CHECK_NAMES = [
  "Player Pool Depth",
  "Playing XI Confirmation",
  "Captain Certainty",
  "Vice-Captain Certainty",
  "Credit Distribution",
  "Selection % Concentration",
  "Differential Opportunity",
  "Team Balance (7-4 vs 6-5)",
  "Role Balance Optimal",
  "Top-Order BAT Strength",
  "Death Overs BOWL Strength",
  "All-Rounder Coverage",
  "Wicket-Keeper Form",
  "Player Form Trend",
  "Venue Suitability",
  "Toss Impact",
  "Injury/Bench Risk",
  "Captain Multiplier Effect",
  "VC Multiplier Effect",
  "Team Combination Coverage",
  "Grand League Suitability",
  "Small League Suitability",
  "Risk-Reward Ratio",
  "Player Combination Uniqueness",
  "Final AI Confidence Score",
];
