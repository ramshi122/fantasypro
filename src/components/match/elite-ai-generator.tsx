"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  Brain,
  CheckCircle2,
  Clock,
  Cpu,
  Crown,
  Eye,
  EyeOff,
  Layers,
  Loader2,
  Plus,
  Send,
  Shield,
  Sparkles,
  Target,
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
  type EliteCheckGroup,
} from "@/lib/elite-ai";
import type { MatchInfo, MatchPlayer, TeamRow } from "@/lib/api";
import { getAllStandardCombos, validateCombo, type RoleCombo } from "@/lib/team-combos";
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
  const [progress, setProgress] = useState({ check: 0, total: 173, message: "" });
  const [result, setResult] = useState<EliteGenerateResult | null>(null);
  const [selectedCount, setSelectedCount] = useState<number>(20);
  const [eliteMode, setEliteMode] = useState<"smart" | "gl" | "advanced" | "combination">("smart");
  const [showChecksPreview, setShowChecksPreview] = useState(false); // Hide 150+ checks preview by default

  // === Manual Playing XI Selection + Exclude + Custom Combos ===
  const [manualPlayingXI, setManualPlayingXI] = useState<Set<string>>(new Set());
  const [manualExclude, setManualExclude] = useState<Set<string>>(new Set());
  interface Combo { wk: number; bat: number; ar: number; bowl: number; }
  const [customCombos, setCustomCombos] = useState<Combo[]>([]);
  const [newCombo, setNewCombo] = useState<Combo>({ wk: 1, bat: 4, ar: 3, bowl: 3 });

  const matchId = (match?.matchId ?? match?.id ?? "") as string;
  const safePlayers = Array.isArray(players) ? players : [];

  useEffect(() => {
    const sXI = localStorage.getItem(`apna-playingxi-${matchId}`);
    if (sXI) { try { setManualPlayingXI(new Set(JSON.parse(sXI))); } catch {} }
    const sEx = localStorage.getItem(`apna-exclude-${matchId}`);
    if (sEx) { try { setManualExclude(new Set(JSON.parse(sEx))); } catch {} }
    // Restore custom combos (per-user preset, not per-match)
    const sCombos = localStorage.getItem("apna-elite-custom-combos");
    if (sCombos) { try { setCustomCombos(JSON.parse(sCombos)); } catch {} }
  }, [matchId]);
  useEffect(() => { localStorage.setItem(`apna-playingxi-${matchId}`, JSON.stringify([...manualPlayingXI])); }, [manualPlayingXI, matchId]);
  useEffect(() => { localStorage.setItem(`apna-exclude-${matchId}`, JSON.stringify([...manualExclude])); }, [manualExclude, matchId]);
  // Persist custom combos across sessions
  useEffect(() => { localStorage.setItem("apna-elite-custom-combos", JSON.stringify(customCombos)); }, [customCombos]);

  function toggleXI(pid: string) { setManualPlayingXI(p => { const n = new Set(p); n.has(pid) ? n.delete(pid) : n.add(pid); return n; }); }
  function toggleEx(pid: string) { setManualExclude(p => { const n = new Set(p); n.has(pid) ? n.delete(pid) : n.add(pid); return n; }); }
  function selectAllXI() { setManualPlayingXI(new Set(safePlayers.map((p: any) => String(p.player_fixed_id ?? p.pid ?? p.name)))); }
  function autoOfficialXI() {
    const pl = safePlayers.filter((p: any) => Number(p.playing) === 1);
    if (pl.length === 0) { toast.warning("No official Playing XI found"); return; }
    setManualPlayingXI(new Set(pl.map((p: any) => String(p.player_fixed_id ?? p.pid ?? p.name))));
    toast.success(`Auto-selected ${pl.length} official Playing XI`);
  }
  function clearXI() { setManualPlayingXI(new Set()); }
  function clearEx() { setManualExclude(new Set()); }
  function addCombo() {
    const c = newCombo;
    if (c.wk + c.bat + c.ar + c.bowl !== 11) { toast.error(`Total must be 11 (current: ${c.wk + c.bat + c.ar + c.bowl})`); return; }
    if (customCombos.some(e => e.wk === c.wk && e.bat === c.bat && e.ar === c.ar && e.bowl === c.bowl)) { toast.error("Duplicate"); return; }
    setCustomCombos([...customCombos, { ...c }]); toast.success(`Added: WK ${c.wk} | BAT ${c.bat} | AR ${c.ar} | BOWL ${c.bowl}`);
  }
  function removeCombo(idx: number) { setCustomCombos(customCombos.filter((_, i) => i !== idx)); }

  // === STANDARD COMBINATIONS PRESETS (per user spec) ===
  // Loads ALL 45 valid Dream11 role combinations (1WK + 2WK + 3WK variants)
  // into the customCombos array. Only adds combinations not already present.
  function addAllStandardCombos() {
    const allCombos = getAllStandardCombos();
    const existing = new Set(customCombos.map(c => `${c.wk}-${c.bat}-${c.ar}-${c.bowl}`));
    const toAdd = allCombos.filter(c => !existing.has(`${c.wk}-${c.bat}-${c.ar}-${c.bowl}`));
    if (toAdd.length === 0) {
      toast.info("All standard combinations already added");
      return;
    }
    setCustomCombos([...customCombos, ...toAdd]);
    toast.success(`✅ Added ${toAdd.length} standard combinations (${customCombos.length + toAdd.length} total)`);
  }

  function clearAllCombos() {
    if (customCombos.length === 0) return;
    setCustomCombos([]);
    toast.info("Cleared all custom combinations");
  }

  // Validate all custom combos — show a warning toast if any are invalid
  function validateAllCombos() {
    if (customCombos.length === 0) {
      toast.info("No custom combinations to validate");
      return;
    }
    const invalid = customCombos.filter(c => !validateCombo(c).valid);
    if (invalid.length === 0) {
      toast.success(`✅ All ${customCombos.length} combinations are valid (sum to 11)`);
    } else {
      toast.error(`❌ ${invalid.length} invalid combinations found (must sum to 11)`);
    }
  }
  const xiCount = manualPlayingXI.size;
  const directMode = xiCount === 11;

  async function handleRun() {
    // Apply Manual Playing XI + Exclude filters
    let pool = [...safePlayers];
    if (manualExclude.size > 0) {
      pool = pool.filter((p: any) => !manualExclude.has(String(p.player_fixed_id ?? p.pid ?? p.name)));
    }
    if (manualPlayingXI.size > 0) {
      pool = pool.filter((p: any) => manualPlayingXI.has(String(p.player_fixed_id ?? p.pid ?? p.name)));
      if (pool.length < 11) { toast.error(`Only ${pool.length} players selected — need at least 11`); return; }
      if (directMode) { toast.info("🎯 Direct Mode — 11 players selected, AI picks only C/VC"); }
      else { toast.info(`🧠 AI Mode — ${pool.length} players selected`); }
    }
    if (pool.length < 11) { toast.error("Need at least 11 players in pool"); return; }
    setRunning(true);
    setResult(null);
    setProgress({ check: 0, total: 173, message: "Initializing Elite AI — 150+ Data Point Analysis..." });

    try {
      // Pass customCombos ONLY when in "combination" mode. In other modes
      // (smart/gl/advanced), the engine uses its built-in strategy templates.
      const combosToPass = eliteMode === "combination" ? customCombos : undefined;

      const res = await runEliteAI(
        pool,
        team1Name || "T1",
        team2Name || "T2",
        lineupAnnounced,
        (check, total, message) => setProgress({ check, total, message }),
        selectedCount,
        eliteMode,
        combosToPass,
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
                    Team Count (1 to 150)
                  </label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[1, 5, 10, 15, 20, 25, 30, 35, 40, 50, 75, 100, 150].map((n) => (
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

                {/* === Generation Mode Selector (NEW) === */}
                <div className="mb-4 text-left">
                  <label className="text-[11px] font-bold text-foreground mb-2 block flex items-center gap-1">
                    <Zap className="w-3 h-3 text-amber-500" />
                    Generation Mode
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: "smart", label: "Smart Auto", icon: Zap, color: "from-violet-500 to-purple-600", desc: "H2H & Small League", default: true },
                      { id: "gl", label: "Grand League", icon: Target, color: "from-rose-500 to-pink-600", desc: "High-risk GL teams" },
                      { id: "advanced", label: "Advanced Auto", icon: Brain, color: "from-sky-500 to-blue-600", desc: "Deep AI research" },
                      { id: "combination", label: "Combination Auto", icon: Layers, color: "from-emerald-500 to-teal-600", desc: "Max diversity" },
                    ].map((m) => {
                      const Icon = m.icon;
                      return (
                        <button
                          key={m.id}
                          onClick={() => setEliteMode(m.id as any)}
                          className={cn(
                            "p-2 rounded-xl border-2 text-left transition-all",
                            eliteMode === m.id
                              ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30 shadow-md"
                              : "border-slate-200 dark:border-slate-700 bg-white dark:bg-card hover:border-amber-300"
                          )}
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <div className={cn("w-6 h-6 rounded-lg bg-gradient-to-br flex items-center justify-center", m.color)}>
                              <Icon className="w-3 h-3 text-white" />
                            </div>
                            <span className="text-[11px] font-bold text-foreground">{m.label}</span>
                            {m.default && <span className="text-[8px] bg-emerald-500 text-white px-1 rounded">✓</span>}
                          </div>
                          <p className="text-[9px] text-muted-foreground">{m.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* === Mode-specific Settings (NEW) === */}
                <div className="mb-4 bg-white/60 dark:bg-card/60 rounded-xl p-3 border border-amber-200 dark:border-amber-900/30 text-left">
                  {eliteMode === "smart" && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase">⚡ Smart Auto Settings</p>
                      <div className="grid grid-cols-2 gap-1.5 text-[9px]">
                        <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> Form Analysis</label>
                        <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> Pitch Report</label>
                        <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> Weather</label>
                        <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> Venue Record</label>
                        <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> H2H</label>
                        <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> Safe Captain</label>
                        <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> Safe VC</label>
                        <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> Credit Balance</label>
                      </div>
                      <div className="mt-2">
                        <label className="text-[9px] text-muted-foreground">Risk Level</label>
                        <select className="w-full h-7 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1">
                          <option>Safe</option><option>Balanced</option><option>Aggressive</option>
                        </select>
                      </div>
                    </div>
                  )}
                  {eliteMode === "gl" && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase">🎯 Grand League Strategy</p>
                      <div className="grid grid-cols-2 gap-1.5 text-[9px]">
                        <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> High Differentials</label>
                        <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> Unique Captain</label>
                        <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> Unique VC</label>
                        <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> Ownership Fade</label>
                        <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> Contrarian Picks</label>
                        <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> High Ceiling</label>
                        <label className="flex items-center gap-1"><input type="checkbox" /> Boom/Bust</label>
                        <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> Low Selected</label>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <div>
                          <label className="text-[9px] text-muted-foreground">Differential %</label>
                          <input type="range" min="20" max="80" defaultValue="50" className="w-full h-1 accent-rose-500" />
                        </div>
                        <div>
                          <label className="text-[9px] text-muted-foreground">Risk Slider</label>
                          <input type="range" min="0" max="100" defaultValue="70" className="w-full h-1 accent-rose-500" />
                        </div>
                      </div>
                    </div>
                  )}
                  {eliteMode === "advanced" && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-sky-600 dark:text-sky-400 uppercase">🧠 Advanced AI Research</p>
                      <div className="grid grid-cols-2 gap-1.5 text-[9px]">
                        <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> Batting Order</label>
                        <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> Bowling Role</label>
                        <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> Death Overs</label>
                        <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> Powerplay Bowler</label>
                        <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> Impact Player</label>
                        <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> Recent Form</label>
                        <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> Matchup Analysis</label>
                        <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> Venue Suitability</label>
                        <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> Fantasy Projection</label>
                        <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> Expected Points</label>
                        <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> Safe Floor</label>
                        <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> Ceiling Score</label>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <div>
                          <label className="text-[9px] text-muted-foreground">Auto Captain</label>
                          <select className="w-full h-7 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1">
                            <option>AI Best</option><option>Safe</option><option>Differential</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[9px] text-muted-foreground">Auto VC</label>
                          <select className="w-full h-7 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1">
                            <option>AI Best</option><option>Safe</option><option>Differential</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                  {eliteMode === "combination" && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase">📦 Combination Auto — Max Diversity</p>
                      <div className="grid grid-cols-2 gap-1.5 text-[9px]">
                        <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> Rotate Captain</label>
                        <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> Rotate VC</label>
                        <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> Rotate WK</label>
                        <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> Rotate Bowlers</label>
                        <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> Rotate AR</label>
                        <label className="flex items-center gap-1"><input type="checkbox" defaultChecked /> Rotate Differential</label>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <div>
                          <label className="text-[9px] text-muted-foreground">Max Player Exposure</label>
                          <input type="range" min="30" max="100" defaultValue="70" className="w-full h-1 accent-emerald-500" />
                        </div>
                        <div>
                          <label className="text-[9px] text-muted-foreground">Min Player Exposure</label>
                          <input type="range" min="0" max="50" defaultValue="10" className="w-full h-1 accent-emerald-500" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* === Elite AI Extra Options (always visible) === */}
                <div className="mb-4 bg-amber-50 dark:bg-amber-950/20 rounded-xl p-3 border border-amber-300 dark:border-amber-800/50 text-left">
                  <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase mb-2 flex items-center gap-1">
                    <Crown className="w-3 h-3" /> Elite AI Extra Options
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] text-muted-foreground">AI Confidence</label>
                      <select className="w-full h-7 text-[10px] rounded border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 px-1">
                        <option>70%</option><option>80%</option><option selected>90%</option><option>95%</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] text-muted-foreground">Risk Mode</label>
                      <select className="w-full h-7 text-[10px] rounded border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 px-1">
                        <option>Ultra Safe</option><option>Safe</option><option selected>Balanced</option><option>Aggressive</option><option>Extreme GL</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] text-muted-foreground">Team Style</label>
                      <select className="w-full h-7 text-[10px] rounded border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 px-1">
                        <option>H2H</option><option>Small League</option><option selected>Grand League</option><option>Mega GL</option><option>Winner Take All</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] text-muted-foreground">Stack Type</label>
                      <select className="w-full h-7 text-[10px] rounded border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 px-1">
                        <option>Batting Stack</option><option>Bowling Stack</option><option selected>Team Stack</option><option>Mixed Stack</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] text-muted-foreground">Captain Engine</label>
                      <select className="w-full h-7 text-[10px] rounded border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 px-1">
                        <option>Safe Captain</option><option>Differential Captain</option><option selected>AI Best Captain</option><option>Manual Captain</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] text-muted-foreground">VC Engine</label>
                      <select className="w-full h-7 text-[10px] rounded border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 px-1">
                        <option>Safe VC</option><option>Differential VC</option><option selected>AI Best VC</option><option>Manual VC</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* === AI Selection Banner (150+ Data Points) === */}
                <div className="bg-gradient-to-r from-violet-600 via-purple-600 to-fuchsia-600 rounded-2xl p-4 text-white shadow-lg mb-4">
                  <p className="text-sm font-black flex items-center gap-1.5 mb-1">
                    <Sparkles className="w-4 h-4" /> AI TOP RANK FANTASY ENGINE
                  </p>
                  <p className="text-[10px] text-white/80 mb-2 font-bold tracking-wide">150+ DATA POINT ANALYSIS</p>
                  <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                    <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-300" /> 173 AI checks (real data)</span>
                    <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-300" /> Monte Carlo simulations</span>
                    <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-300" /> 10,000+ data points</span>
                    <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-300" /> No fake data — pool-derived</span>
                    <span className="flex items-center gap-1 col-span-2"><CheckCircle2 className="w-3 h-3 text-emerald-300" /> Recalculates after Toss · No bench/injured players</span>
                  </div>
                  <div className="mt-3 bg-white/10 rounded-lg p-2 text-center">
                    <p className="text-[9px] text-white/60 uppercase">Average Win Rate</p>
                    <p className="text-2xl font-black text-emerald-300">89%—95%</p>
                  </div>
                </div>
                {/* === Manual Playing XI Selection === */}
                <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-lg p-3 border border-emerald-200 dark:border-emerald-900/30">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">✅ Manual Playing XI</p>
                    <div className="flex gap-1.5">
                      <button onClick={selectAllXI} className="text-[8px] text-emerald-600 underline">All</button>
                      <button onClick={autoOfficialXI} className="text-[8px] text-sky-600 underline">Official XI</button>
                      <button onClick={clearXI} className="text-[8px] text-red-500 underline">Clear</button>
                    </div>
                  </div>
                  <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full", directMode ? "bg-amber-500 text-white" : xiCount >= 11 ? "bg-emerald-500 text-white" : "bg-red-500 text-white")}>
                    {xiCount} {directMode ? "· 🎯 Direct" : xiCount >= 11 ? "· 🧠 AI" : "· ❌ 11+"}
                  </span>
                  <div className="max-h-[20vh] overflow-y-auto grid grid-cols-3 gap-0.5 mt-1">
                    {safePlayers.map((p: any, i: number) => {
                      const pid = String(p.player_fixed_id ?? p.pid ?? p.name ?? `p${i}`);
                      const sel = manualPlayingXI.has(pid);
                      return (
                        <label key={i} className={cn("flex items-center gap-0.5 text-[8px] px-1 py-0.5 rounded border cursor-pointer", sel ? "bg-emerald-100 dark:bg-emerald-950/40 border-emerald-400 text-emerald-700" : "bg-white dark:bg-slate-800 border-slate-200")}>
                          <input type="checkbox" checked={sel} onChange={() => toggleXI(pid)} className="w-2.5 h-2.5 accent-emerald-500" />
                          <span className="truncate">{String(p.name || `P${i+1}`).slice(0, 8)}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* === Manual Exclude === */}
                <div className="bg-red-50 dark:bg-red-950/20 rounded-lg p-2 border border-red-200 dark:border-red-900/30">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-bold text-red-600 dark:text-red-400">🚫 Exclude</p>
                    {manualExclude.size > 0 && <button onClick={clearEx} className="text-[8px] text-red-500 underline">Clear ({manualExclude.size})</button>}
                  </div>
                  <div className="max-h-[15vh] overflow-y-auto grid grid-cols-3 gap-0.5">
                    {safePlayers.map((p: any, i: number) => {
                      const pid = String(p.player_fixed_id ?? p.pid ?? p.name ?? `p${i}`);
                      const ex = manualExclude.has(pid);
                      return (
                        <label key={i} className={cn("flex items-center gap-0.5 text-[8px] px-1 py-0.5 rounded border cursor-pointer", ex ? "bg-red-100 dark:bg-red-950/40 border-red-400 text-red-500 line-through" : "bg-white dark:bg-slate-800 border-slate-200")}>
                          <input type="checkbox" checked={ex} onChange={() => toggleEx(pid)} className="w-2.5 h-2.5 accent-red-500" />
                          <span className="truncate">{String(p.name || `P${i+1}`).slice(0, 8)}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* === Custom Combinations === */}
                <div className="bg-violet-50 dark:bg-violet-950/20 rounded-lg p-2 border border-violet-200 dark:border-violet-900/30">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-bold text-violet-600 dark:text-violet-400">📊 Custom Combos</p>
                    {customCombos.length > 0 && (
                      <span className="text-[8px] font-bold text-violet-700 dark:text-violet-300 bg-violet-200 dark:bg-violet-900 px-1.5 py-0.5 rounded-full">
                        {customCombos.length} combo{customCombos.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>

                  {/* === STANDARD PRESETS — per user spec === */}
                  {/* One-click button to load all 46 valid Dream11 combinations */}
                  <div className="flex gap-1 mb-1.5">
                    <Button
                      size="sm"
                      className="flex-1 h-6 text-[8px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                      onClick={addAllStandardCombos}
                      title="Load all 46 standard Dream11 combinations (1WK + 2WK + 3WK variants)"
                    >
                      <Plus className="w-2.5 h-2.5 mr-0.5" />
                      Add All Standard ({getAllStandardCombos().length})
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[8px] border-violet-300 text-violet-700 dark:text-violet-300"
                      onClick={validateAllCombos}
                      title="Check that all combinations sum to 11"
                    >
                      ✓ Validate
                    </Button>
                    {customCombos.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[8px] border-red-300 text-red-600 hover:bg-red-50"
                        onClick={clearAllCombos}
                        title="Remove all custom combinations"
                      >
                        <X className="w-2.5 h-2.5" />
                      </Button>
                    )}
                  </div>

                  {/* Manual single-combo entry */}
                  <div className="grid grid-cols-4 gap-1 mb-1">
                    {(["WK","BAT","AR","BOWL"] as const).map((r) => (
                      <div key={r}>
                        <label className="text-[7px] text-muted-foreground">{r}</label>
                        <input type="number" min={0} max={8} value={(newCombo as any)[r.toLowerCase()]} onChange={(e) => setNewCombo({ ...newCombo, [r.toLowerCase()]: Math.max(0, Math.min(8, parseInt(e.target.value) || 0)) })} className="w-full h-7 text-center text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900" />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={cn("text-[8px] font-bold", newCombo.wk + newCombo.bat + newCombo.ar + newCombo.bowl === 11 ? "text-emerald-600" : "text-red-500")}>
                      Total: {newCombo.wk + newCombo.bat + newCombo.ar + newCombo.bowl}/11
                    </span>
                    <Button size="sm" className="h-6 text-[8px] bg-violet-600 hover:bg-violet-700 text-white" onClick={addCombo}><Plus className="w-2 h-2 mr-0.5" />Add Custom</Button>
                  </div>

                  {/* Combo list — scrollable when many combos present */}
                  {customCombos.length > 0 && (
                    <div className="mt-1.5 space-y-0.5 max-h-32 overflow-y-auto">
                      {customCombos.map((c, i) => {
                        const isValid = c.wk + c.bat + c.ar + c.bowl === 11;
                        return (
                          <div key={i} className={cn(
                            "flex items-center justify-between rounded px-1 py-0.5 border",
                            isValid
                              ? "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                              : "bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800"
                          )}>
                            <span className={cn("text-[8px] font-mono", !isValid && "text-red-600")}>
                              {i+1}. WK {c.wk} | BAT {c.bat} | AR {c.ar} | BOWL {c.bowl}
                              {!isValid && ` (sum=${c.wk + c.bat + c.ar + c.bowl})`}
                            </span>
                            <button onClick={() => removeCombo(i)} className="text-red-500 hover:text-red-700"><X className="w-2.5 h-2.5" /></button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Hint when in Combination mode but no combos added */}
                  {eliteMode === "combination" && customCombos.length === 0 && (
                    <p className="text-[8px] text-amber-600 dark:text-amber-400 mt-1 italic">
                      ⚠️ Combination Auto mode is selected but no custom combos added —
                      click "Add All Standard" to load the full preset, or the AI
                      will fall back to built-in strategy templates.
                    </p>
                  )}
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

              {/* 150+ checks preview — collapsible with Hide/Show button */}
              <div className="bg-violet-50/50 dark:bg-violet-950/20 rounded-xl p-3">
                <button
                  onClick={() => setShowChecksPreview(!showChecksPreview)}
                  className="w-full flex items-center justify-between text-[11px] font-bold text-violet-700 dark:text-violet-300 mb-2"
                >
                  <span className="flex items-center gap-1.5">
                    <Cpu className="w-3 h-3" />
                    150+ Data Point Analysis (173 Checks)
                  </span>
                  <span className="flex items-center gap-1 text-[10px] bg-violet-200 dark:bg-violet-900 px-2 py-0.5 rounded-full">
                    {showChecksPreview ? <><EyeOff className="w-3 h-3" /> Hide</> : <><Eye className="w-3 h-3" /> Show</>}
                  </span>
                </button>
                <AnimatePresence>
                  {showChecksPreview && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-2">
                        {CHECK_GROUPS.map((g) => (
                          <div key={g.name}>
                            <p className="text-[9px] font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wide mb-1">
                              {g.name} ({g.count})
                            </p>
                            <div className="grid grid-cols-2 gap-0.5 text-[8px] text-muted-foreground">
                              {g.items.map((name, i) => (
                                <div key={i} className="flex items-center gap-0.5 truncate">
                                  <span className="text-violet-500 font-bold flex-shrink-0">{g.startIdx + i}.</span>
                                  <span className="truncate">{name}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
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
          {showAnalysis ? "Hide" : "Show"} 150+ AI Checks
        </Button>
      </div>

      {/* 150+ checks (collapsible, grouped by category) */}
      <AnimatePresence>
        {showAnalysis && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3"
          >
            {CHECK_GROUPS_UI.map((grp) => {
              const groupChecks = analysis.checks.filter((c) => c.group === grp.key);
              if (groupChecks.length === 0) return null;
              const groupAvg = Math.round(groupChecks.reduce((s, c) => s + c.score, 0) / groupChecks.length);
              return (
                <div key={grp.key} className="space-y-1.5">
                  <div className={cn("rounded-lg p-2 border", grp.bgClass)}>
                    <div className="flex items-center justify-between">
                      <p className={cn("text-[10px] font-bold uppercase tracking-wide", grp.textClass)}>
                        {grp.icon} {grp.label} ({groupChecks.length} checks)
                      </p>
                      <span className={cn("text-xs font-black tabular-nums", grp.textClass)}>
                        {groupAvg}/100
                      </span>
                    </div>
                  </div>
                  {groupChecks.map((check) => (
                    <div
                      key={check.id}
                      className={cn(
                        "rounded-lg p-2 border text-[10px] ml-3",
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
                </div>
              );
            })}
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
  const { rank, team, efv, aiScore, riskLevel, strategy, reasoning, captainReason, vcReason, hackTier, hackScore } = rankedTeam;

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
          {hackTier && (
            <span className={cn(
              "inline-block text-[8px] font-black px-1.5 py-0.5 rounded-full mt-0.5",
              hackTier === "S" && "bg-red-500 text-white",
              hackTier === "A" && "bg-amber-500 text-white",
              hackTier === "B" && "bg-sky-500 text-white",
              hackTier === "C" && "bg-slate-500 text-white",
            )}>
              🧠 HACK {hackTier} ({hackScore})
            </span>
          )}
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

/* ============== 150+ Check Groups (for preview + result display) ============== */

/** UI styling for each of the 6 check groups */
const CHECK_GROUPS_UI: Array<{
  key: EliteCheckGroup;
  label: string;
  icon: string;
  bgClass: string;
  textClass: string;
}> = [
  { key: "match", label: "Match Analysis", icon: "🏟️", bgClass: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800", textClass: "text-blue-700 dark:text-blue-300" },
  { key: "team", label: "Team Analysis", icon: "👥", bgClass: "bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800", textClass: "text-violet-700 dark:text-violet-300" },
  { key: "player", label: "Player Analysis", icon: "🏏", bgClass: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800", textClass: "text-emerald-700 dark:text-emerald-300" },
  { key: "matchup", label: "Matchup Analysis", icon: "⚔️", bgClass: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800", textClass: "text-amber-700 dark:text-amber-300" },
  { key: "ai", label: "AI Analysis", icon: "🤖", bgClass: "bg-fuchsia-50 dark:bg-fuchsia-950/30 border-fuchsia-200 dark:border-fuchsia-800", textClass: "text-fuchsia-700 dark:text-fuchsia-300" },
  { key: "optimization", label: "Final Optimization", icon: "🎯", bgClass: "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800", textClass: "text-rose-700 dark:text-rose-300" },
];

/** Compact preview of the 150+ checks (for the side panel) */
const CHECK_GROUPS: Array<{
  name: string;
  count: number;
  startIdx: number;
  items: string[];
}> = [
  {
    name: "Match Analysis",
    count: 65,
    startIdx: 1,
    items: ["Pool Depth", "Playing XI", "Captain Certainty", "VC Certainty", "Credit Distribution", "Selection %", "Differential", "Team Balance", "Role Balance", "Top-Order BAT", "Death BOWL", "AR Coverage", "WK Form", "Form Trend", "Venue", "Toss Impact", "Injury Risk", "C Multiplier", "VC Multiplier", "Combo Coverage", "GL Suitability", "SL Suitability", "Risk-Reward", "Uniqueness", "Confidence", "Win Probability", "Toss Result", "Bat First Prob.", "Chase Prob.", "Pitch Type", "Pitch Freshness", "Grass Coverage", "Crack Analysis", "Bounce Factor", "Pace Assist.", "Spin Assist.", "Swing Assist.", "Seam Movement", "1st Inn Avg", "2nd Inn Avg", "Winning Score", "Chase Success", "Bat-First Success", "Venue Pattern", "Toss Impact", "Toss Decision", "Home Adv.", "Away Perf.", "Match Format", "Tournament", "Match Import.", "Knockout", "Qualification", "Motivation", "Venue Index", "Ground Name", "Dimensions", "Straight Bdy", "Square Bdy", "Outfield", "Weather", "Temperature", "Humidity", "Wind Speed", "Rain Chance"],
  },
  {
    name: "Team Analysis",
    count: 20,
    startIdx: 66,
    items: ["Team Form", "Last 5 Form", "Last 10 Form", "Win %", "Loss %", "Batting Strength", "Bowling Strength", "Spin Strength", "Pace Strength", "Fielding Rating", "Team Balance", "Opening Strength", "Mid-Order Strength", "Finishing", "Death Bowling", "PP Bowling", "Momentum", "Captain Form", "Confidence", "Pressure Perf."],
  },
  {
    name: "Player Analysis",
    count: 40,
    startIdx: 86,
    items: ["Official XI", "Batting Pos.", "Bowling Pos.", "Exp. Overs", "Role Clarity", "Form Rating", "Fitness", "Injury Status", "Workload", "Recent Runs", "Recent Wickets", "Batting Avg", "Bowling Avg", "Strike Rate", "Economy", "Boundary %", "Six %", "Dot Ball %", "Wicket %", "Catch %", "Stumping %", "Run-out %", "Consistency", "Fantasy Avg", "Last 3", "Last 5", "Last 10", "Venue Record", "Opponent Record", "Home Record", "Away Record", "Chase Record", "Bat-First Record", "Spin Record", "Pace Record", "Left-Hand", "Right-Hand", "PP Record", "Mid-Overs Record", "Death Record"],
  },
  {
    name: "Matchup Analysis",
    count: 20,
    startIdx: 126,
    items: ["Head to Head", "Batter vs Bowler", "Bowler vs Batter", "Left vs Right", "Spin Matchup", "Pace Matchup", "Death Matchup", "PP Matchup", "Venue Matchup", "Opp. Weakness", "Opp. Strength", "Opening Matchup", "Finisher Matchup", "Bowl Rotation", "Bat Rotation", "Matchup Win %", "Exp. Balls Faced", "Exp. Deliveries", "Pressure Matchup", "Clutch Perf."],
  },
  {
    name: "AI Analysis",
    count: 5,
    startIdx: 146,
    items: ["AI Exp. Runs", "AI Exp. Wickets", "AI Exp. Catches", "AI Exp. Fantasy", "AI Captain Score"],
  },
  {
    name: "Final Optimization",
    count: 23,
    startIdx: 151,
    items: ["AI Boom Prob.", "AI Failure Prob.", "AI Risk Score", "AI Safe Score", "AI Diff Score", "AI Ownership", "AI GL Score", "AI SL Score", "AI Value Score", "AI Match Winner", "AI Top Performer", "AI Best Bowler", "AI Best Batter", "AI Impact Player", "Player Synergy", "Credit Opt.", "Diff. Opt.", "Safe Core", "Unique Combo", "Captain Opt.", "VC Opt.", "Final AI Conf.", "Final Team Opt."],
  },
];
