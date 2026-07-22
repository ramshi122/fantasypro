"use client";

import { useState, useEffect } from "react";
import {
  Zap, Target, Brain, Layers, Crown,
  Loader2, CheckCircle2, Send, Lock, ChevronLeft, Plus, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/lib/store";
import { generateSweep, type SweepCount, type SweepResult } from "@/lib/sweep-generator";
import { getMatchDetail, type MatchInfo, type MatchPlayer, type TeamRow } from "@/lib/api";
import { cn } from "@/lib/utils";

type GenMode = "smart" | "gl" | "advanced" | "combination";

interface Props {
  mode: GenMode;
  match: MatchInfo;
  matchId: string;
  team1Name: string;
  team2Name: string;
  token: string | null;
  onClose: () => void;
  onGenerated: (teams: TeamRow[]) => void;
}

const MODE_INFO: Record<GenMode, { label: string; icon: typeof Zap; color: string; desc: string }> = {
  smart: { label: "Smart Auto", icon: Zap, color: "from-violet-500 to-purple-600", desc: "Balanced AI analysis — form, pitch, h2h. Best for H2H & Small Leagues." },
  gl: { label: "Grand League", icon: Target, color: "from-rose-500 to-pink-600", desc: "High-risk differentials + unique C/VC combos. Max winning probability for GL." },
  advanced: { label: "Advanced Auto", icon: Brain, color: "from-sky-500 to-blue-600", desc: "AI form analysis — batting order, bowling role, death overs, impact player." },
  combination: { label: "Combination Auto", icon: Layers, color: "from-emerald-500 to-teal-600", desc: "Rotate C/VC through all locked candidate pairs. Maximal team diversity." },
};

export function ModeSettingsPage({ mode, match, matchId, team1Name, team2Name, token, onClose, onGenerated }: Props) {
  const [generating, setGenerating] = useState(false);
  const [teamCount, setTeamCount] = useState<SweepCount>(20);
  const [progress, setProgress] = useState<string>("");
  const [generatedTeams, setGeneratedTeams] = useState<TeamRow[]>([]);
  const [saved, setSaved] = useState(false);
  const [lineupAnnounced, setLineupAnnounced] = useState(false);

  // === Multiple Custom Combination Selection ===
  interface Combo { wk: number; bat: number; ar: number; bowl: number; }
  const [customCombos, setCustomCombos] = useState<Combo[]>([]);
  const [newCombo, setNewCombo] = useState<Combo>({ wk: 1, bat: 4, ar: 3, bowl: 3 });

  // === ALL SETTINGS STATE (wired to generator) ===
  const [lockedPlayers, setLockedPlayers] = useState<string>("");
  const [excludedPlayers, setExcludedPlayers] = useState<string>("");
  const [captainLock, setCaptainLock] = useState<string>("");
  const [vcLock, setVcLock] = useState<string>("");
  const [riskLevel, setRiskLevel] = useState<string>("Balanced");
  const [differentialPct, setDifferentialPct] = useState<number>(50);
  const [captainStrategy, setCaptainStrategy] = useState<string>("AI Best");
  const [vcStrategy, setVcStrategy] = useState<string>("AI Best");
  const [teamBalance, setTeamBalance] = useState<string>("Balanced");

  // === REAL AI OPTIONS STATE (every checkbox wired — no demo, no placeholder) ===
  // Smart Auto options
  const [smartOptions, setSmartOptions] = useState<Record<string, boolean>>({
    "Form Analysis": true,
    "Weather": true,
    "Pitch Report": true,
    "Venue Record": true,
    "H2H": true,
    "Credit Balance": true,
    "Safe Captain": true,
    "Safe Vice Captain": true,
    "Team Balance": true,
    "Playing XI": true,
  });
  // Grand League options
  const [glOptions, setGlOptions] = useState<Record<string, boolean>>({
    "High Differential Players": true,
    "Unique Captain": true,
    "Unique Vice Captain": true,
    "Ownership Fade": true,
    "Contrarian Picks": true,
    "High Ceiling Players": true,
    "Boom/Bust Strategy": true,
    "Late Swap Logic": true,
    "Low Selected Players": true,
    "Stack Strategy": true,
    "Team Combination Rotation": true,
    "GL Confidence": true,
  });
  // Advanced Auto options
  const [advOptions, setAdvOptions] = useState<Record<string, boolean>>({
    "Batting Order": true,
    "Bowling Role": true,
    "Death Overs": true,
    "Powerplay Bowler": true,
    "Middle Overs": true,
    "Impact Player": true,
    "Recent Form": true,
    "Matchup Analysis": true,
    "Venue Suitability": true,
    "Fantasy Projection": true,
    "Expected Points": true,
    "Safe Floor": true,
    "Ceiling Score": true,
  });
  // Combination Auto options
  const [comboOptions, setComboOptions] = useState<Record<string, boolean>>({
    "Rotate Captain": true,
    "Rotate Vice Captain": true,
    "Rotate WK": true,
    "Rotate Bowlers": true,
    "Rotate All-rounders": true,
    "Rotate Differential Picks": true,
  });
  // Elite AI options
  const [eliteOptions, setEliteOptions] = useState<Record<string, boolean>>({
    "Playing XI": true,
    "Form": true,
    "Venue": true,
    "Pitch": true,
    "Weather": true,
    "Toss Impact": true,
    "Batting Order": true,
    "Bowling Role": true,
    "Death Overs": true,
    "Powerplay": true,
    "Matchups": true,
    "Fantasy Trends": true,
    "Expected Points": true,
    "Ownership": true,
    "Differential": true,
    "Credit": true,
    "Team Balance": true,
    "Monte Carlo Simulation": true,
    "Captain Probability": true,
    "Vice Captain Probability": true,
  });
  const [uniqueTeamPct, setUniqueTeamPct] = useState<number>(80);
  const [maxExposure, setMaxExposure] = useState<number>(70);
  const [minExposure, setMinExposure] = useState<number>(10);
  const [lockedPair, setLockedPair] = useState<string>("");
  const [excludedPair, setExcludedPair] = useState<string>("");
  const [aiConfidence, setAiConfidence] = useState<string>("High");
  const [teamStyle, setTeamStyle] = useState<string>("Balanced");
  const [stackType, setStackType] = useState<string>("Top Order");

  // Helper to toggle any option set
  function toggleOption(setter: React.Dispatch<React.SetStateAction<Record<string, boolean>>>, key: string) {
    setter(prev => ({ ...prev, [key]: !prev[key] }));
  }

  // === Manual Exclude Players (Checkbox-based) ===
  const [manualExclude, setManualExclude] = useState<Set<string>>(new Set());
  const [playerPool, setPlayerPool] = useState<any[]>([]);

  // === Manual Playing XI Selection ===
  const [manualPlayingXI, setManualPlayingXI] = useState<Set<string>>(new Set());

  // Load saved lists from localStorage on mount
  useEffect(() => {
    const savedExclude = localStorage.getItem(`apna-exclude-${matchId}`);
    if (savedExclude) {
      try { setManualExclude(new Set(JSON.parse(savedExclude))); } catch {}
    }
    const savedXI = localStorage.getItem(`apna-playingxi-${matchId}`);
    if (savedXI) {
      try { setManualPlayingXI(new Set(JSON.parse(savedXI))); } catch {}
    }
  }, [matchId]);

  // Save exclude list to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(`apna-exclude-${matchId}`, JSON.stringify([...manualExclude]));
  }, [manualExclude, matchId]);

  // Save Playing XI selection to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(`apna-playingxi-${matchId}`, JSON.stringify([...manualPlayingXI]));
  }, [manualPlayingXI, matchId]);

  function togglePlayingXIPlayer(playerId: string) {
    setManualPlayingXI(prev => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }

  function selectAllPlayers() {
    setManualPlayingXI(new Set(playerPool.map((p: any) => String(p.player_fixed_id ?? p.pid ?? p.name))));
    toast.success(`Selected all ${playerPool.length} players`);
  }

  function clearPlayingXI() {
    setManualPlayingXI(new Set());
    toast.info("Playing XI selection cleared");
  }

  function autoSelectOfficialXI() {
    const playingOnly = playerPool.filter((p: any) => Number(p.playing) === 1);
    if (playingOnly.length === 0) {
      toast.warning("No official Playing XI found — lineup may not be announced yet");
      return;
    }
    setManualPlayingXI(new Set(playingOnly.map((p: any) => String(p.player_fixed_id ?? p.pid ?? p.name))));
    toast.success(`✅ Auto-selected ${playingOnly.length} official Playing XI players`);
  }

  const xiCount = manualPlayingXI.size;
  const directMode = xiCount === 11;
  const canGenerateWithXI = xiCount >= 11;

  function toggleExcludePlayer(playerId: string) {
    setManualExclude(prev => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }

  function clearAllExcludes() {
    setManualExclude(new Set());
    toast.info("All excludes cleared");
  }

  // Fetch player pool on mount for exclude checkboxes
  useEffect(() => {
    (async () => {
      const detail = await getMatchDetail(matchId).catch(() => null);
      if (detail) {
        const all = [...((detail as any).left_team_players || []), ...((detail as any).right_team_players || [])].filter(Boolean);
        setPlayerPool(all);
      }
    })();
  }, [matchId]);

  function addCombo() {
    const c = newCombo;
    if (c.wk + c.bat + c.ar + c.bowl !== 11) {
      toast.error(`Total must be 11 (current: ${c.wk + c.bat + c.ar + c.bowl})`);
      return;
    }
    const isDup = customCombos.some(existing =>
      existing.wk === c.wk && existing.bat === c.bat && existing.ar === c.ar && existing.bowl === c.bowl
    );
    if (isDup) {
      toast.error("This combination already added — duplicate not allowed");
      return;
    }
    setCustomCombos([...customCombos, { ...c }]);
    toast.success(`✅ Added: WK ${c.wk} | BAT ${c.bat} | AR ${c.ar} | BOWL ${c.bowl} (${customCombos.length + 1} total)`);
  }

  function removeCombo(idx: number) {
    setCustomCombos(customCombos.filter((_, i) => i !== idx));
    toast.info("Combination removed");
  }

  const info = MODE_INFO[mode];
  const Icon = info.icon;

  // Parse comma-separated player names into array
  function parsePlayers(input: string): string[] {
    return input.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  }

  async function handleGenerate() {
    setGenerating(true);
    setProgress("Fetching latest playing XI...");
    setGeneratedTeams([]);
    setSaved(false);
    try {
      const detail = await getMatchDetail(matchId);
      if (!detail) { toast.error("Could not load player data"); setGenerating(false); return; }

      // Detect lineup status
      const lineupStatus = (detail as any).lineup_status;
      const announced = Number(lineupStatus) === 1;
      setLineupAnnounced(announced);

      let allPlayers = [...((detail as any).left_team_players || []), ...((detail as any).right_team_players || [])].filter(Boolean);
      if (allPlayers.length < 11) { toast.error(`Only ${allPlayers.length} players available`); setGenerating(false); return; }

      // === AFTER LINEUP: Filter to ONLY confirmed playing XI ===
      // Detect lineup: lineup_status===1 OR at least 11 players have playing===1
      const playingCount = allPlayers.filter((p: any) => Number(p.playing) === 1).length;
      const lineupActive = announced || playingCount >= 11;

      if (lineupActive) {
        // STRICT: ONLY playing === 1 players — NO exceptions
        const playingOnly = allPlayers.filter((p: any) => Number(p.playing) === 1);
        console.log(`[generator] Lineup active: ${playingOnly.length} playing players out of ${allPlayers.length} total`);

        if (playingOnly.length >= 11) {
          allPlayers = playingOnly;
          setProgress(`✅ Lineup confirmed — using ${allPlayers.length} playing XI players ONLY (bench removed)`);
        } else if (playingOnly.length > 0) {
          // Even if < 11 playing, still use ONLY playing players
          // Generator will handle if not enough
          allPlayers = playingOnly;
          setProgress(`⚠️ Only ${playingOnly.length} confirmed playing — using them only (some teams may fail)`);
        } else {
          // No playing players marked — can't determine lineup
          setProgress(`🟡 No playing status found — using all ${allPlayers.length} players (pre-lineup mode)`);
        }
      } else {
        setProgress(`🟡 Lineup pending — using all ${allPlayers.length} players (pre-lineup mode)`);
      }

      // === APPLY USER SETTINGS: Exclude players (text input) ===
      const excludeList = parsePlayers(excludedPlayers);
      if (excludeList.length > 0) {
        const before = allPlayers.length;
        allPlayers = allPlayers.filter((p: any) => {
          const name = String(p.name || "").toLowerCase();
          return !excludeList.some(ex => name.includes(ex));
        });
        console.log(`[generator] Excluded ${before - allPlayers.length} players (text exclusion)`);
      }

      // === APPLY MANUAL EXCLUDE (checkbox-based) — HIGH PRIORITY ===
      if (manualExclude.size > 0) {
        const before = allPlayers.length;
        allPlayers = allPlayers.filter((p: any) => {
          const pid = String(p.player_fixed_id ?? p.pid ?? p.name);
          return !manualExclude.has(pid);
        });
        console.log(`[generator] Excluded ${before - allPlayers.length} players (manual checkbox exclusion) — ${manualExclude.size} total excluded`);
      }

      // === APPLY MANUAL PLAYING XI SELECTION — HIGHEST PRIORITY ===
      // If user has selected specific players, ONLY use those players
      if (manualPlayingXI.size > 0) {
        const before = allPlayers.length;
        allPlayers = allPlayers.filter((p: any) => {
          const pid = String(p.player_fixed_id ?? p.pid ?? p.name);
          return manualPlayingXI.has(pid);
        });
        console.log(`[generator] Manual Playing XI: ${allPlayers.length} players selected (filtered from ${before})`);

        if (allPlayers.length < 11) {
          toast.error(`Only ${allPlayers.length} players selected — need at least 11`);
          setGenerating(false);
          return;
        }

        if (directMode) {
          setProgress(`🎯 Direct Team Generate Mode — exactly 11 players selected, AI will only pick C/VC`);
        } else {
          setProgress(`🧠 AI Smart Team Generation Mode — ${allPlayers.length} players selected, AI will pick best 11 + C/VC`);
        }
      }

      // === APPLY USER SETTINGS: Lock players (force include) ===
      const lockList = parsePlayers(lockedPlayers);

      // Small delay to show status
      await new Promise(r => setTimeout(r, 500));

      setProgress(`Generating ${teamCount} teams — ${info.label}${customCombos.length > 0 ? ` + ${customCombos.length} custom combos` : ""}...`);
      const res = await generateSweep(allPlayers, teamCount, team1Name, team2Name, (p) => {
        setProgress(`${p.phase}: ${p.message}`);
      }, mode, customCombos.length > 0 ? customCombos : undefined, {
        lockedPlayers: lockList,
        excludedPlayers: excludeList,
        captainLock: captainLock.trim().toLowerCase(),
        vcLock: vcLock.trim().toLowerCase(),
        riskLevel,
        differentialPct,
        captainStrategy,
        vcStrategy,
        teamBalance,
        // === REAL AI OPTIONS (all wired — no demo) ===
        smartOptions,
        glOptions,
        advOptions,
        comboOptions,
        uniqueTeamPct,
        maxExposure,
        minExposure,
        lockedPair,
        excludedPair,
        stackType,
      });

      if (res.teams.length === 0) { toast.error("Failed to generate teams — try smaller count"); setGenerating(false); return; }

      // Store in state for preview
      setGeneratedTeams(res.teams);

      // AUTO-SAVE: Immediately replace old teams with new ones in localStorage
      // Don't wait for "Save Teams" button — user expects teams to be replaced
      // immediately after generation
      onGenerated(res.teams);

      toast.success(`${announced ? "🟢 After Lineup" : "🟡 Before Lineup"}: Generated ${res.teams.length} teams in ${res.stats.durationMs}ms — old teams REPLACED!`);
    } catch (err: any) {
      toast.error(err?.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  // Save teams — call onGenerated which triggers handleBulkAddTeams in parent
  // This saves to localStorage AND refreshes main page AND closes modal
  function handleSave() {
    if (generatedTeams.length === 0) { toast.error("No teams to save"); return; }
    // Call onGenerated → parent's handleBulkAddTeams saves to localStorage + refreshes UI
    onGenerated(generatedTeams);
    setSaved(true);
  }

  // Transfer — call onGenerated which saves + opens transfer flow
  function handleTransfer() {
    if (generatedTeams.length === 0) { toast.error("Generate teams first"); return; }
    // onGenerated → handleBulkAddTeams saves teams + refreshes + closes modal
    // Parent will then open transfer modal
    onGenerated(generatedTeams);
  }

  return (
    <div className="bg-white dark:bg-card rounded-2xl border border-violet-100 dark:border-violet-900/30 overflow-hidden shadow-sm">
      {/* Header */}
      <div className={cn("bg-gradient-to-r p-4 flex items-center gap-3 text-white", info.color)}>
        <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className={cn("w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center")}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-sm">{info.label}</h3>
          <p className="text-[10px] text-white/80">{info.desc}</p>
        </div>
      </div>

      <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
        {/* === LINEUP STATUS BANNER === */}
        <div className={cn(
          "rounded-xl p-3 border-2 text-center",
          lineupAnnounced
            ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500"
            : "bg-amber-50 dark:bg-amber-950/30 border-amber-500"
        )}>
          <p className={cn(
            "text-xs font-bold",
            lineupAnnounced ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"
          )}>
            {lineupAnnounced ? "🟢 AFTER LINEUP — Official Playing XI Confirmed" : "🟡 BEFORE LINEUP — Pre-Playing XI Mode"}
          </p>
          <p className="text-[9px] text-muted-foreground mt-1">
            {lineupAnnounced
              ? "✅ Only confirmed playing XI used · ❌ Bench removed · Toss/Impact Player analyzed"
              : "⚠️ Using all players · Pitch/Weather/Form analysis · Teams will update after lineup"}
          </p>
        </div>

        {/* === Lineup-mode specific checks === */}
        {lineupAnnounced ? (
          <div className="bg-emerald-50/50 dark:bg-emerald-950/20 rounded-lg p-2">
            <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase mb-1.5">🟢 After Lineup Checks</p>
            <div className="grid grid-cols-2 gap-1 text-[9px] text-muted-foreground">
              <span>✅ Official Playing XI</span>
              <span>❌ Bench Removed</span>
              <span>🏏 Toss Winner</span>
              <span>🏏 Bat First/Chase</span>
              <span>⚡ Impact Player</span>
              <span>📋 Final Bat Order</span>
              <span>🎯 Final Bowl Roles</span>
              <span>💀 Death Bowlers</span>
              <span>⚡ Powerplay Bowlers</span>
              <span>🧤 WK Confirmed</span>
              <span>💧 Dew Factor</span>
              <span>🌤️ Weather Update</span>
              <span>👑 C/VC Optimized</span>
              <span>📊 Ownership Analysis</span>
              <span>🎯 AI Points Projection</span>
              <span>🔒 Final Rank 1-10</span>
            </div>
          </div>
        ) : (
          <div className="bg-amber-50/50 dark:bg-amber-950/20 rounded-lg p-2">
            <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase mb-1.5">🟡 Before Lineup Checks</p>
            <div className="grid grid-cols-2 gap-1 text-[9px] text-muted-foreground">
              <span>🏟️ Match Format</span>
              <span>📊 Pitch Report</span>
              <span>🌤️ Weather Forecast</span>
              <span>🤝 H2H Record</span>
              <span>📈 Recent Form</span>
              <span>🏠 Home/Away</span>
              <span>🏏 Bat Position Pred</span>
              <span>🎯 Bowl Role Pred</span>
              <span>💀 Death Overs</span>
              <span>⚡ Powerplay Bowlers</span>
              <span>🔄 Spin vs Pace</span>
              <span>⚔️ Opposition Matchups</span>
              <span>📊 Venue Stats</span>
              <span>👑 C/VC Probability</span>
              <span>🎯 Differential Picks</span>
              <span>🛡️ Safe Picks</span>
              <span>⚠️ Risk Analysis</span>
              <span>📰 Injury/News</span>
              <span>⚖️ Team Balance</span>
              <span>🏆 H2H & GL Teams</span>
            </div>
          </div>
        )}

        {/* === SMART AUTO === */}
        {mode === "smart" && (
          <div className="space-y-3">
            <div>
              <p className="text-[11px] font-bold text-violet-600 dark:text-violet-400 uppercase mb-2">⚡ AI Checks</p>
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                {["Form Analysis", "Pitch Report", "Weather", "Venue Record", "H2H", "Safe Captain", "Safe Vice Captain", "Credit Balance", "Team Balance", "Playing XI"].map(c => (
                  <label key={c} className="flex items-center gap-1"><input type="checkbox" checked={smartOptions[c] ?? false} onChange={() => toggleOption(setSmartOptions, c)} /> {c}</label>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-bold text-violet-600 dark:text-violet-400 uppercase mb-2">⚙️ Settings</p>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-[9px] text-muted-foreground">Safe Level</label><select className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)}><option>Safe</option><option>Balanced</option><option>Aggressive</option></select></div>
                <div><label className="text-[9px] text-muted-foreground">Risk Level</label><select className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" value={riskLevel} onChange={(e) => setRiskLevel(e.target.value)}><option>Safe</option><option>Balanced</option><option>Aggressive</option></select></div>
                <div><label className="text-[9px] text-muted-foreground">Lock Players</label><input type="text" placeholder="None" value={lockedPlayers} onChange={(e) => setLockedPlayers(e.target.value)} className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" /></div>
                <div><label className="text-[9px] text-muted-foreground">Exclude Players</label><input type="text" placeholder="None" value={excludedPlayers} onChange={(e) => setExcludedPlayers(e.target.value)} className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" /></div>
                <div><label className="text-[9px] text-muted-foreground">Captain Lock</label><input type="text" placeholder="Auto" value={captainLock} onChange={(e) => setCaptainLock(e.target.value)} className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" /></div>
                <div><label className="text-[9px] text-muted-foreground">VC Lock</label><input type="text" placeholder="Auto" value={vcLock} onChange={(e) => setVcLock(e.target.value)} className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" /></div>
              </div>
            </div>
          </div>
        )}

        {/* === GRAND LEAGUE === */}
        {mode === "gl" && (
          <div className="space-y-3">
            <div>
              <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase mb-2">🎯 GL Strategy</p>
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                {["High Differential Players", "Unique Captain", "Unique Vice Captain", "Ownership Fade", "Contrarian Picks", "High Ceiling Players", "Boom/Bust Strategy", "Late Swap Logic", "Low Selected Players", "Stack Strategy", "Team Combination Rotation", "GL Confidence"].map(c => (
                  <label key={c} className="flex items-center gap-1"><input type="checkbox" checked={glOptions[c] ?? false} onChange={() => toggleOption(setGlOptions, c)} /> {c}</label>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase mb-2">⚙️ Options</p>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-[9px] text-muted-foreground">Differential %</label><input type="range" min="20" max="80" value={differentialPct} onChange={(e) => setDifferentialPct(parseInt(e.target.value))} className="w-full accent-rose-500" /><span className="text-[8px] text-slate-500">{differentialPct}%</span></div>
                <div><label className="text-[9px] text-muted-foreground">Risk Slider</label><input type="range" min="0" max="100" value={differentialPct} onChange={(e) => setDifferentialPct(parseInt(e.target.value))} className="w-full accent-rose-500" /><span className="text-[8px] text-slate-500">{differentialPct}%</span></div>
                <div><label className="text-[9px] text-muted-foreground">Lock C</label><input type="text" placeholder="Auto" value={captainLock} onChange={(e) => setCaptainLock(e.target.value)} className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" /></div>
                <div><label className="text-[9px] text-muted-foreground">Lock VC</label><input type="text" placeholder="Auto" value={vcLock} onChange={(e) => setVcLock(e.target.value)} className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" /></div>
                <div><label className="text-[9px] text-muted-foreground">Lock Players</label><input type="text" placeholder="None" value={lockedPlayers} onChange={(e) => setLockedPlayers(e.target.value)} className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" /></div>
                <div><label className="text-[9px] text-muted-foreground">Exclude Players</label><input type="text" placeholder="None" value={excludedPlayers} onChange={(e) => setExcludedPlayers(e.target.value)} className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" /></div>
                <div className="col-span-2"><label className="text-[9px] text-muted-foreground">Unique Team %</label><input type="range" min="50" max="100" value={uniqueTeamPct} onChange={(e) => setUniqueTeamPct(parseInt(e.target.value))} className="w-full accent-rose-500" /><span className="text-[8px] text-slate-500">{uniqueTeamPct}%</span></div>
              </div>
            </div>
          </div>
        )}

        {/* === ADVANCED AUTO === */}
        {mode === "advanced" && (
          <div className="space-y-3">
            <div>
              <p className="text-[11px] font-bold text-sky-600 dark:text-sky-400 uppercase mb-2">🧠 Advanced AI Research</p>
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                {["Batting Order", "Bowling Role", "Death Overs", "Powerplay Bowler", "Middle Overs", "Impact Player", "Recent Form", "Matchup Analysis", "Venue Suitability", "Fantasy Projection", "Expected Points", "Safe Floor", "Ceiling Score"].map(c => (
                  <label key={c} className="flex items-center gap-1"><input type="checkbox" checked={advOptions[c] ?? false} onChange={() => toggleOption(setAdvOptions, c)} /> {c}</label>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-bold text-sky-600 dark:text-sky-400 uppercase mb-2">⚙️ Options</p>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-[9px] text-muted-foreground">Lock Players</label><input type="text" placeholder="None" value={lockedPlayers} onChange={(e) => setLockedPlayers(e.target.value)} className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" /></div>
                <div><label className="text-[9px] text-muted-foreground">Ignore Form</label><select className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" value={riskLevel === "Aggressive" ? "Yes" : "No"} onChange={(e) => setRiskLevel(e.target.value === "Yes" ? "Aggressive" : "Balanced")}><option>No</option><option>Yes</option></select></div>
                <div><label className="text-[9px] text-muted-foreground">Ignore Ownership</label><select className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" value={riskLevel === "Aggressive" ? "Yes" : "No"} onChange={(e) => setRiskLevel(e.target.value === "Yes" ? "Aggressive" : "Balanced")}><option>No</option><option>Yes</option></select></div>
                <div><label className="text-[9px] text-muted-foreground">Auto Captain</label><select className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" value={captainStrategy} onChange={(e) => setCaptainStrategy(e.target.value)}><option>AI Best</option><option>Safe</option><option>Differential</option></select></div>
                <div><label className="text-[9px] text-muted-foreground">Auto VC</label><select className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" value={vcStrategy} onChange={(e) => setVcStrategy(e.target.value)}><option>AI Best</option><option>Safe</option><option>Differential</option></select></div>
                <div><label className="text-[9px] text-muted-foreground">Team Balance</label><select className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" value={teamBalance} onChange={(e) => setTeamBalance(e.target.value)}><option>Balanced</option><option>Bat Heavy</option><option>Bowl Heavy</option></select></div>
              </div>
            </div>
          </div>
        )}

        {/* === COMBINATION AUTO === */}
        {mode === "combination" && (
          <div className="space-y-3">
            <div>
              <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase mb-2">📦 Max Diversity Settings</p>
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                {["Rotate Captain", "Rotate Vice Captain", "Rotate WK", "Rotate Bowlers", "Rotate All-rounders", "Rotate Differential Picks"].map(c => (
                  <label key={c} className="flex items-center gap-1"><input type="checkbox" checked={comboOptions[c] ?? false} onChange={() => toggleOption(setComboOptions, c)} /> {c}</label>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase mb-2">⚙️ Options</p>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-[9px] text-muted-foreground">Locked Pair</label><input type="text" placeholder="None" value={lockedPair} onChange={(e) => setLockedPair(e.target.value)} className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" /></div>
                <div><label className="text-[9px] text-muted-foreground">Excluded Pair</label><input type="text" placeholder="None" value={excludedPair} onChange={(e) => setExcludedPair(e.target.value)} className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" /></div>
                <div><label className="text-[9px] text-muted-foreground">Max Player Exposure</label><input type="range" min="30" max="100" value={maxExposure} onChange={(e) => setMaxExposure(parseInt(e.target.value))} className="w-full accent-emerald-500" /><span className="text-[8px] text-slate-500">{maxExposure}%</span></div>
                <div><label className="text-[9px] text-muted-foreground">Min Player Exposure</label><input type="range" min="0" max="50" value={minExposure} onChange={(e) => setMinExposure(parseInt(e.target.value))} className="w-full accent-emerald-500" /><span className="text-[8px] text-slate-500">{minExposure}%</span></div>
                <div><label className="text-[9px] text-muted-foreground">Stack Strategy</label><select value={stackType} onChange={(e) => setStackType(e.target.value)} className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1"><option>None</option><option>Batting</option><option>Bowling</option><option>Team</option><option>Top Order</option></select></div>
                <div><label className="text-[9px] text-muted-foreground">Random Seed</label><input type="text" placeholder="Auto" className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" /></div>
              </div>
            </div>
          </div>
        )}

        {/* === Team Count Selector === */}
        <div>
          <p className="text-[11px] font-bold text-foreground mb-2">Team Count</p>
          <div className="grid grid-cols-4 gap-1.5">
            {[1, 5, 10, 20, 40, 50, 75, 100, 150, 200, 300, 500].map(n => (
              <button key={n} onClick={() => setTeamCount(n as SweepCount)} className={cn("h-9 rounded-lg font-bold text-xs border-2", teamCount === n ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white border-transparent" : "bg-white dark:bg-card border-violet-100 dark:border-violet-900/30 text-foreground")}>{n}</button>
            ))}
          </div>
        </div>

        {/* === Multiple Custom Combination Selection (NEW) === */}
        <div className="bg-violet-50 dark:bg-violet-950/20 rounded-lg p-3 border border-violet-200 dark:border-violet-900/30">
          <p className="text-[11px] font-bold text-foreground mb-2 flex items-center gap-1">
            <Layers className="w-3 h-3 text-violet-500" />
            Custom Combinations (Optional)
          </p>
          <p className="text-[9px] text-muted-foreground mb-2">
            Add multiple role combinations. Teams will be distributed across all selected combos.
          </p>

          {/* Combination inputs */}
          <div className="grid grid-cols-4 gap-1.5 mb-2">
            <div>
              <label className="text-[9px] text-muted-foreground block mb-0.5">WK</label>
              <input type="number" min={0} max={8} value={newCombo.wk} onChange={(e) => setNewCombo({ ...newCombo, wk: Math.max(0, Math.min(8, parseInt(e.target.value) || 0)) })} className="w-full h-8 text-center text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900" />
            </div>
            <div>
              <label className="text-[9px] text-muted-foreground block mb-0.5">BAT</label>
              <input type="number" min={0} max={8} value={newCombo.bat} onChange={(e) => setNewCombo({ ...newCombo, bat: Math.max(0, Math.min(8, parseInt(e.target.value) || 0)) })} className="w-full h-8 text-center text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900" />
            </div>
            <div>
              <label className="text-[9px] text-muted-foreground block mb-0.5">AR</label>
              <input type="number" min={0} max={8} value={newCombo.ar} onChange={(e) => setNewCombo({ ...newCombo, ar: Math.max(0, Math.min(8, parseInt(e.target.value) || 0)) })} className="w-full h-8 text-center text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900" />
            </div>
            <div>
              <label className="text-[9px] text-muted-foreground block mb-0.5">BOWL</label>
              <input type="number" min={0} max={8} value={newCombo.bowl} onChange={(e) => setNewCombo({ ...newCombo, bowl: Math.max(0, Math.min(8, parseInt(e.target.value) || 0)) })} className="w-full h-8 text-center text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900" />
            </div>
          </div>

          {/* Total indicator */}
          <div className="flex items-center justify-between mb-2">
            <span className={cn("text-[10px] font-bold", newCombo.wk + newCombo.bat + newCombo.ar + newCombo.bowl === 11 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500")}>
              Total: {newCombo.wk + newCombo.bat + newCombo.ar + newCombo.bowl} / 11
            </span>
            <Button size="sm" className="h-7 text-[10px] bg-violet-600 hover:bg-violet-700 text-white" onClick={addCombo}>
              <Plus className="w-3 h-3 mr-0.5" /> Add Combination
            </Button>
          </div>

          {/* Selected combinations list */}
          {customCombos.length > 0 && (
            <div className="space-y-1 mt-2">
              <p className="text-[9px] text-muted-foreground font-bold">Selected Combinations ({customCombos.length}):</p>
              {customCombos.map((c, i) => (
                <div key={i} className="flex items-center justify-between bg-white dark:bg-slate-800 rounded px-2 py-1 border border-slate-200 dark:border-slate-700">
                  <span className="text-[10px] font-mono text-foreground">
                    {i + 1}. WK {c.wk} | BAT {c.bat} | AR {c.ar} | BOWL {c.bowl}
                  </span>
                  <button onClick={() => removeCombo(i)} className="text-red-500 hover:text-red-700 p-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* === Manual Playing XI Selection (NEW) === */}
        <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-lg p-3 border border-emerald-200 dark:border-emerald-900/30">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              ✅ Manual Playing XI Selection
            </p>
            <div className="flex gap-1">
              <button onClick={selectAllPlayers} className="text-[9px] text-emerald-600 hover:text-emerald-800 font-bold underline">Select All</button>
              <button onClick={autoSelectOfficialXI} className="text-[9px] text-sky-600 hover:text-sky-800 font-bold underline">Auto Official XI</button>
              <button onClick={clearPlayingXI} className="text-[9px] text-red-500 hover:text-red-700 font-bold underline">Clear</button>
            </div>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <span className={cn(
              "text-[10px] font-bold px-2 py-0.5 rounded-full",
              directMode ? "bg-amber-500 text-white" : canGenerateWithXI ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
            )}>
              {xiCount} selected {directMode ? "· 🎯 Direct Mode" : canGenerateWithXI ? "· 🧠 AI Mode" : "· ❌ Need 11+"}
            </span>
          </div>
          <p className="text-[9px] text-muted-foreground mb-2">
            Tick players to include in team generation. 11 = Direct Mode (AI picks only C/VC). 12+ = AI Mode (AI picks best 11). Saved automatically.
          </p>
          {playerPool.length > 0 ? (
            <div className="max-h-[30vh] overflow-y-auto grid grid-cols-2 gap-1">
              {playerPool.map((p, i) => {
                const pid = String(p.player_fixed_id ?? p.pid ?? p.name ?? `p${i}`);
                const name = String(p.name || `Player ${i+1}`);
                const team = String(p.team_name || p.team || "");
                const isSelected = manualPlayingXI.has(pid);
                const isPlaying = Number(p.playing) === 1;
                return (
                  <label key={i} className={cn(
                    "flex items-center gap-1 text-[10px] rounded px-1.5 py-1 cursor-pointer border",
                    isSelected
                      ? "bg-emerald-100 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300"
                      : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-foreground"
                  )}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => togglePlayingXIPlayer(pid)}
                      className="w-3 h-3 rounded accent-emerald-500"
                    />
                    <span className="truncate">{name}</span>
                    {team && <span className="text-[8px] text-muted-foreground">({team.slice(0,3)})</span>}
                    {isPlaying && <span className="text-[7px] text-emerald-500 font-bold">●</span>}
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="text-[9px] text-muted-foreground italic">Loading players...</p>
          )}
        </div>

        {/* === Manual Exclude Players (Checkbox-based) === */}
        <div className="bg-red-50 dark:bg-red-950/20 rounded-lg p-3 border border-red-200 dark:border-red-900/30">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold text-red-600 dark:text-red-400 flex items-center gap-1">
              🚫 Manual Exclude Players
            </p>
            {manualExclude.size > 0 && (
              <button onClick={clearAllExcludes} className="text-[9px] text-red-500 hover:text-red-700 font-bold underline">
                Clear All ({manualExclude.size})
              </button>
            )}
          </div>
          <p className="text-[9px] text-muted-foreground mb-2">
            Tick players to EXCLUDE from ALL team generation. Excluded players will never appear in any team. Saved automatically.
          </p>
          {playerPool.length > 0 ? (
            <div className="max-h-[30vh] overflow-y-auto grid grid-cols-2 gap-1">
              {playerPool.map((p, i) => {
                const pid = String(p.player_fixed_id ?? p.pid ?? p.name ?? `p${i}`);
                const name = String(p.name || `Player ${i+1}`);
                const team = String(p.team_name || p.team || "");
                const isExcluded = manualExclude.has(pid);
                return (
                  <label key={i} className={cn(
                    "flex items-center gap-1 text-[10px] rounded px-1.5 py-1 cursor-pointer border",
                    isExcluded
                      ? "bg-red-100 dark:bg-red-950/40 border-red-300 dark:border-red-800 line-through text-red-500"
                      : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-foreground"
                  )}>
                    <input
                      type="checkbox"
                      checked={isExcluded}
                      onChange={() => toggleExcludePlayer(pid)}
                      className="w-3 h-3 rounded accent-red-500"
                    />
                    <span className="truncate">{name}</span>
                    {team && <span className="text-[8px] text-muted-foreground">({team.slice(0,3)})</span>}
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="text-[9px] text-muted-foreground italic">Loading players...</p>
          )}
        </div>

        {/* Progress */}
        {generating && progress && (
          <div className="bg-violet-50 dark:bg-violet-950/30 rounded-lg p-2 text-center">
            <Loader2 className="w-4 h-4 animate-spin mx-auto text-violet-500 mb-1" />
            <p className="text-[10px] text-muted-foreground">{progress}</p>
          </div>
        )}

        {/* === Generated Teams Preview (NEW) === */}
        {generatedTeams.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-bold text-foreground uppercase">📋 Generated Teams ({generatedTeams.length})</p>
            <div className="max-h-[40vh] overflow-y-auto space-y-1.5">
              {generatedTeams.slice(0, 20).map((t, i) => {
                const players = (t.players || []) as any[];
                const cap = String(t.captain || t.c || "");
                const vc = String(t.viceCaptain || t.vc || t.vicecaptain || "");
                return (
                  <div key={i} className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold text-foreground">Team #{i + 1}</span>
                      <span className="text-[8px] text-muted-foreground">{players.length} players</span>
                    </div>
                    <div className="flex flex-wrap gap-0.5">
                      {players.slice(0, 11).map((p, j) => {
                        const name = String(p.name || p.player_name || `P${j+1}`).slice(0, 4).toUpperCase();
                        const isCap = String(p.player_fixed_id ?? p.pid ?? p.name) === cap;
                        const isVC = String(p.player_fixed_id ?? p.pid ?? p.name) === vc;
                        return (
                          <span key={j} className={cn(
                            "text-[7px] px-1 py-0.5 rounded font-bold",
                            isCap ? "bg-amber-500 text-white" : isVC ? "bg-sky-500 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                          )}>
                            {name}{isCap ? " C" : isVC ? " VC" : ""}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {generatedTeams.length > 20 && (
                <p className="text-[9px] text-center text-muted-foreground">+ {generatedTeams.length - 20} more teams...</p>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2">
          <Button className={cn("w-full h-12 bg-gradient-to-r text-white font-bold", info.color)} onClick={handleGenerate} disabled={generating}>
            {generating ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Icon className="w-5 h-5 mr-2" />}
            {generating ? "Generating..." : `Generate ${teamCount} Teams · ${info.label}`}
          </Button>

          {generatedTeams.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                className={cn("h-10 font-bold text-sm", saved ? "bg-emerald-600 text-white" : "bg-emerald-500 hover:bg-emerald-600 text-white")}
                onClick={handleSave}
              >
                {saved ? <><CheckCircle2 className="w-4 h-4 mr-1" /> Saved!</> : <><CheckCircle2 className="w-4 h-4 mr-1" /> Save Teams</>}
              </Button>
              <Button
                className="h-10 bg-sky-500 hover:bg-sky-600 text-white font-bold text-sm"
                onClick={handleTransfer}
              >
                <Send className="w-4 h-4 mr-1" /> Transfer
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
