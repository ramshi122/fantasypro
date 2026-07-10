"use client";

import { useState } from "react";
import {
  Zap, Target, Brain, Layers, Crown,
  Loader2, CheckCircle2, Send, Lock, ChevronLeft,
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
  const info = MODE_INFO[mode];
  const Icon = info.icon;

  async function handleGenerate() {
    setGenerating(true);
    setProgress("Fetching latest playing XI...");
    setGeneratedTeams([]);
    setSaved(false);
    try {
      const detail = await getMatchDetail(matchId);
      if (!detail) { toast.error("Could not load player data"); setGenerating(false); return; }
      const allPlayers = [...((detail as any).left_team_players || []), ...((detail as any).right_team_players || [])].filter(Boolean);
      if (allPlayers.length < 11) { toast.error(`Only ${allPlayers.length} players available`); setGenerating(false); return; }

      setProgress(`Generating ${teamCount} teams — ${info.label}...`);
      const res = await generateSweep(allPlayers, teamCount, team1Name, team2Name, (p) => {
        setProgress(`${p.phase}: ${p.message}`);
      }, mode);

      if (res.teams.length === 0) { toast.error("Failed to generate teams — try smaller count"); setGenerating(false); return; }

      // Store in state for preview
      setGeneratedTeams(res.teams);
      toast.success(`Generated ${res.teams.length} teams in ${res.stats.durationMs}ms`);
    } catch (err: any) {
      toast.error(err?.message || "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  // Save teams to localStorage + notify parent
  function handleSave() {
    if (generatedTeams.length === 0) { toast.error("No teams to save"); return; }

    try {
      const LOCAL_TEAMS_KEY = "apna-cricket-local-teams";
      const key = String(matchId);
      let all: Record<string, TeamRow[]> = {};
      try { all = JSON.parse(localStorage.getItem(LOCAL_TEAMS_KEY) || "{}"); } catch { all = {}; }

      const oldCount = (all[key] || []).length;
      // WIPE old, save only new
      all[key] = generatedTeams.map((t, i) => ({
        ...t,
        _id: "local_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
        teamId: "local_" + Math.random().toString(36).slice(2, 10),
        teamNo: i + 1,
        team_number: i + 1,
        vicecaptain: t.viceCaptain,
        c: t.captain,
        vc: t.viceCaptain,
        type: mode,
        transferStatus: "pending",
      }));
      localStorage.setItem(LOCAL_TEAMS_KEY, JSON.stringify(all));
      setSaved(true);
      toast.success(`✓ Saved ${generatedTeams.length} teams to My Teams!`);
    } catch (err) {
      toast.error("Failed to save teams");
    }
  }

  // Transfer — pass teams to parent which opens transfer modal
  function handleTransfer() {
    if (generatedTeams.length === 0) { toast.error("Generate teams first"); return; }
    if (!saved) { handleSave(); }
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
        {/* === SMART AUTO === */}
        {mode === "smart" && (
          <div className="space-y-3">
            <div>
              <p className="text-[11px] font-bold text-violet-600 dark:text-violet-400 uppercase mb-2">⚡ AI Checks</p>
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                {["Form Analysis", "Pitch Report", "Weather", "Venue Record", "H2H", "Safe Captain", "Safe Vice Captain", "Credit Balance", "Team Balance", "Playing XI"].map(c => (
                  <label key={c} className="flex items-center gap-1"><input type="checkbox" defaultChecked /> {c}</label>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-bold text-violet-600 dark:text-violet-400 uppercase mb-2">⚙️ Settings</p>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-[9px] text-muted-foreground">Safe Level</label><select className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1"><option>Low</option><option>Medium</option><option>High</option></select></div>
                <div><label className="text-[9px] text-muted-foreground">Risk Level</label><select className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1"><option>Safe</option><option>Balanced</option><option>Aggressive</option></select></div>
                <div><label className="text-[9px] text-muted-foreground">Lock Players</label><input type="text" placeholder="None" className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" /></div>
                <div><label className="text-[9px] text-muted-foreground">Exclude Players</label><input type="text" placeholder="None" className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" /></div>
                <div><label className="text-[9px] text-muted-foreground">Captain Lock</label><input type="text" placeholder="Auto" className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" /></div>
                <div><label className="text-[9px] text-muted-foreground">VC Lock</label><input type="text" placeholder="Auto" className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" /></div>
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
                  <label key={c} className="flex items-center gap-1"><input type="checkbox" defaultChecked /> {c}</label>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase mb-2">⚙️ Options</p>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-[9px] text-muted-foreground">Differential %</label><input type="range" min="20" max="80" defaultValue="50" className="w-full accent-rose-500" /></div>
                <div><label className="text-[9px] text-muted-foreground">Risk Slider</label><input type="range" min="0" max="100" defaultValue="70" className="w-full accent-rose-500" /></div>
                <div><label className="text-[9px] text-muted-foreground">Lock C</label><input type="text" placeholder="Auto" className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" /></div>
                <div><label className="text-[9px] text-muted-foreground">Lock VC</label><input type="text" placeholder="Auto" className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" /></div>
                <div><label className="text-[9px] text-muted-foreground">Lock Players</label><input type="text" placeholder="None" className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" /></div>
                <div><label className="text-[9px] text-muted-foreground">Exclude Players</label><input type="text" placeholder="None" className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" /></div>
                <div className="col-span-2"><label className="text-[9px] text-muted-foreground">Unique Team %</label><input type="range" min="50" max="100" defaultValue="80" className="w-full accent-rose-500" /></div>
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
                  <label key={c} className="flex items-center gap-1"><input type="checkbox" defaultChecked /> {c}</label>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-bold text-sky-600 dark:text-sky-400 uppercase mb-2">⚙️ Options</p>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-[9px] text-muted-foreground">Lock Players</label><input type="text" placeholder="None" className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" /></div>
                <div><label className="text-[9px] text-muted-foreground">Ignore Form</label><select className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1"><option>No</option><option>Yes</option></select></div>
                <div><label className="text-[9px] text-muted-foreground">Ignore Ownership</label><select className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1"><option>No</option><option>Yes</option></select></div>
                <div><label className="text-[9px] text-muted-foreground">Auto Captain</label><select className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1"><option>AI Best</option><option>Safe</option><option>Differential</option></select></div>
                <div><label className="text-[9px] text-muted-foreground">Auto VC</label><select className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1"><option>AI Best</option><option>Safe</option><option>Differential</option></select></div>
                <div><label className="text-[9px] text-muted-foreground">Team Balance</label><select className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1"><option>Balanced</option><option>Bat Heavy</option><option>Bowl Heavy</option></select></div>
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
                  <label key={c} className="flex items-center gap-1"><input type="checkbox" defaultChecked /> {c}</label>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase mb-2">⚙️ Options</p>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-[9px] text-muted-foreground">Locked Pair</label><input type="text" placeholder="None" className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" /></div>
                <div><label className="text-[9px] text-muted-foreground">Excluded Pair</label><input type="text" placeholder="None" className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" /></div>
                <div><label className="text-[9px] text-muted-foreground">Max Player Exposure</label><input type="range" min="30" max="100" defaultValue="70" className="w-full accent-emerald-500" /></div>
                <div><label className="text-[9px] text-muted-foreground">Min Player Exposure</label><input type="range" min="0" max="50" defaultValue="10" className="w-full accent-emerald-500" /></div>
                <div><label className="text-[9px] text-muted-foreground">Stack Strategy</label><select className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1"><option>None</option><option>Batting</option><option>Bowling</option><option>Team</option></select></div>
                <div><label className="text-[9px] text-muted-foreground">Random Seed</label><input type="text" placeholder="Auto" className="w-full h-8 text-[10px] rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-1" /></div>
              </div>
            </div>
          </div>
        )}

        {/* === Team Count Selector === */}
        <div>
          <p className="text-[11px] font-bold text-foreground mb-2">Team Count</p>
          <div className="grid grid-cols-4 gap-1.5">
            {[5, 10, 20, 40, 50, 100, 200, 500].map(n => (
              <button key={n} onClick={() => setTeamCount(n as SweepCount)} className={cn("h-9 rounded-lg font-bold text-xs border-2", teamCount === n ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white border-transparent" : "bg-white dark:bg-card border-violet-100 dark:border-violet-900/30 text-foreground")}>{n}</button>
            ))}
          </div>
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
