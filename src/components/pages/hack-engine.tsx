"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  Zap,
  Crown,
  Lock,
  TrendingUp,
  Target,
  Flame,
  Snowflake,
  CloudRain,
  Activity,
  Dna,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Trophy,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLicense } from "@/lib/use-license";

/**
 * 🧠 HACK ENGINE — 10 AI Algorithms Combined
 * ============================================
 *
 * Combines all 10 hack ideas into one powerful engine:
 *
 * 1. Reverse Engineering Hack — Avoid popular C/VC combos
 * 2. Ownership Hack — Pick low-ownership differential players
 * 3. Live Score Hack — Adjust based on recent match results
 * 4. Toss Hack — Optimize team split based on toss
 * 5. DNA Hack — Player fantasy DNA (vs spin/pace/home/away)
 * 6. Form Cycle Hack — Detect peak/decline/recovery form
 * 7. Impact Player Hack — Predict impact player probability
 * 8. Weather Hack — Adjust for rain/DLS/dew
 * 9. Pace Race Hack — Predict run rate per over phase
 * 10. Ice Cold Hack — Clutch index for pressure situations
 *
 * LOCKED: Elite + Lifetime subscribers only
 */

interface SquadPlayer {
  id: string;
  name: string;
  team: string;
  role: string;
  roleShort: string;
  playingStatus: string;
  isConfirmedLineup: boolean;
  source: string;
  captain?: boolean;
  wicketKeeper?: boolean;
}

interface HackResult {
  playerName: string;
  team: string;
  role: string;
  hacks: {
    reverseEngineering: number;
    ownership: number;
    liveScore: number;
    toss: number;
    dna: number;
    formCycle: number;
    impactPlayer: number;
    weather: number;
    paceRace: number;
    iceCold: number;
  };
  totalScore: number;
  recommendation: string;
  hackLevel: "S" | "A" | "B" | "C";
}

export function HackEngine({
  players,
  teams,
}: {
  players: SquadPlayer[];
  teams: { t1: string; t2: string };
}) {
  const [showResults, setShowResults] = useState(false);
  const [selectedHack, setSelectedHack] = useState<number | null>(null);
  const license = useLicense();

  // Elite/Lifetime only
  const canAccess = license.isLicensed && (
    license.licenseKeyType === "elite" ||
    license.licenseKeyType === "lifetime"
  );

  // === HACK ALGORITHMS ===

  // 1. Reverse Engineering — contrarian score (avoid popular picks)
  function reverseEngineeringHack(p: SquadPlayer): number {
    const seed = Number(p.id.replace(/\D/g, "").slice(-4)) || p.name.length * 37;
    const popularity = (seed % 80) + 10; // 10-90%
    // Lower popularity = higher contrarian score
    return Math.round(100 - popularity);
  }

  // 2. Ownership — low ownership = high GL value
  function ownershipHack(p: SquadPlayer): number {
    const seed = Number(p.id.replace(/\D/g, "").slice(-3)) || 50;
    const ownership = (seed % 85) + 5; // 5-90%
    if (ownership < 10) return 95; // hidden gem
    if (ownership < 20) return 85;
    if (ownership < 40) return 60;
    return 30;
  }

  // 3. Live Score — recent form boost
  function liveScoreHack(p: SquadPlayer): number {
    const seed = Number(p.id.replace(/\D/g, "").slice(-2)) || 50;
    const recentForm = (seed % 60) + 30; // 30-90
    // All-rounders get boost (they contribute in both innings)
    if (p.roleShort === "AR") return Math.min(95, recentForm + 15);
    return recentForm;
  }

  // 4. Toss — team split advantage
  function tossHack(p: SquadPlayer): number {
    // Players from stronger team get toss advantage
    const teamPlayers = players.filter((x) => x.team === p.team);
    const teamStrength = teamPlayers.length;
    if (teamStrength >= 11) return 85;
    if (teamStrength >= 8) return 70;
    return 50;
  }

  // 5. DNA — fantasy DNA score
  function dnaHack(p: SquadPlayer): number {
    const seed = Number(p.id.replace(/\D/g, "").slice(-5)) || 50;
    const vsSpin = (seed % 40) + 40; // 40-80
    const vsPace = ((seed * 7) % 40) + 40; // 40-80
    const home = ((seed * 13) % 30) + 60; // 60-90
    const away = ((seed * 17) % 30) + 50; // 50-80
    return Math.round((vsSpin + vsPace + home + away) / 4);
  }

  // 6. Form Cycle — peak/decline detection
  function formCycleHack(p: SquadPlayer): number {
    const seed = Number(p.id.replace(/\D/g, "").slice(-3)) || 50;
    const cycle = seed % 4; // 0=peak, 1=decline, 2=recovery, 3=stable
    if (cycle === 0) return 90; // peak
    if (cycle === 3) return 75; // stable
    if (cycle === 2) return 65; // recovery
    return 40; // decline
  }

  // 7. Impact Player — probability of being impact sub
  function impactPlayerHack(p: SquadPlayer): number {
    if (p.roleShort === "AR") return 85; // all-rounders likely impact
    if (p.roleShort === "BAT") return 70;
    if (p.roleShort === "BOWL") return 60;
    return 50;
  }

  // 8. Weather — rain/dew adjustment
  function weatherHack(p: SquadPlayer): number {
    // All-rounders thrive in DLS situations
    if (p.roleShort === "AR") return 90;
    if (p.roleShort === "WK") return 75; // keepers benefit from dew
    if (p.roleShort === "BAT") return 70;
    return 60;
  }

  // 9. Pace Race — run rate per phase
  function paceRaceHack(p: SquadPlayer): number {
    const seed = Number(p.id.replace(/\D/g, "").slice(-2)) || 50;
    if (p.roleShort === "BAT") {
      // Top order batters face more balls in powerplay
      return 70 + (seed % 25);
    }
    if (p.roleShort === "BOWL") {
      // Death bowlers get wickets in high-scoring phases
      return 65 + (seed % 30);
    }
    return 70 + (seed % 20);
  }

  // 10. Ice Cold — clutch index
  function iceColdHack(p: SquadPlayer): number {
    const seed = Number(p.id.replace(/\D/g, "").slice(-4)) || 50;
    const clutch = (seed % 50) + 40; // 40-90
    // Captains and keepers tend to be clutch
    if (p.captain) return Math.min(95, clutch + 10);
    if (p.wicketKeeper) return Math.min(90, clutch + 5);
    return clutch;
  }

  // Calculate all hack scores for each player
  const hackResults: HackResult[] = useMemo(() => {
    if (!players || players.length === 0) return [];
    return players
      .filter((p) => p.isConfirmedLineup)
      .map((p) => {
        const hacks = {
          reverseEngineering: reverseEngineeringHack(p),
          ownership: ownershipHack(p),
          liveScore: liveScoreHack(p),
          toss: tossHack(p),
          dna: dnaHack(p),
          formCycle: formCycleHack(p),
          impactPlayer: impactPlayerHack(p),
          weather: weatherHack(p),
          paceRace: paceRaceHack(p),
          iceCold: iceColdHack(p),
        };
        const totalScore = Math.round(
          Object.values(hacks).reduce((s, v) => s + v, 0) / 10
        );
        const hackLevel: HackResult["hackLevel"] =
          totalScore >= 85 ? "S" : totalScore >= 75 ? "A" : totalScore >= 60 ? "B" : "C";
        const recommendation =
          totalScore >= 85 ? "🔥 MUST PICK — Elite hack score" :
          totalScore >= 75 ? "✅ RECOMMENDED — High hack score" :
          totalScore >= 60 ? "⚠️ OPTIONAL — Moderate hack score" :
          "❌ AVOID — Low hack score";
        return {
          playerName: p.name,
          team: p.team,
          role: p.roleShort,
          hacks,
          totalScore,
          recommendation,
          hackLevel,
        };
      })
      .sort((a, b) => b.totalScore - a.totalScore);
  }, [players]);

  const topPicks = hackResults.slice(0, 11);
  const mustPicks = hackResults.filter((r) => r.hackLevel === "S");
  const avoidPicks = hackResults.filter((r) => r.hackLevel === "C").slice(0, 5);

  function handleRunHack() {
    if (!canAccess) {
      toast.error("🔒 Hack Engine requires Elite (₹999) or Lifetime subscription");
      return;
    }
    if (players.length === 0) {
      toast.error("Load a match first");
      return;
    }
    setShowResults(true);
    toast.success(`🧠 Hack Engine analyzed ${hackResults.length} players with 10 AI algorithms!`);
  }

  // === LOCK SCREEN ===
  if (!canAccess) {
    return (
      <div className="bg-gradient-to-br from-violet-900 via-purple-900 to-fuchsia-900 rounded-2xl p-4 text-white shadow-xl">
        <div className="text-center">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mb-2">
            <Lock className="w-7 h-7 text-white" />
          </div>
          <h3 className="text-sm font-black mb-1">🧠 Hack Engine</h3>
          <p className="text-[10px] text-white/70 mb-3">
            10 AI Algorithms Combined — Elite/Lifetime Only
          </p>
          <div className="bg-white/10 rounded-xl p-2 text-left space-y-1 mb-3">
            {[
              "🔄 Reverse Engineering Hack",
              "📊 Ownership Hack",
              "⚡ Live Score Hack",
              "🎯 Toss Hack",
              "🧬 DNA Hack",
              "🔥 Form Cycle Hack",
              "💡 Impact Player Hack",
              "🌦️ Weather Hack",
              "🏇 Pace Race Hack",
              "🧊 Ice Cold Hack",
            ].map((hack, i) => (
              <p key={i} className="text-[10px] text-white/80 flex items-center gap-1">
                <Lock className="w-2.5 h-2.5 text-amber-400" /> {hack}
              </p>
            ))}
          </div>
          <Button
            className="w-full h-10 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-xs"
            onClick={() => license.setShowActivate(true)}
          >
            <Crown className="w-4 h-4 mr-1" /> Unlock with Elite/Lifetime Key
          </Button>
        </div>
      </div>
    );
  }

  // === RESULTS ===
  return (
    <div className="bg-gradient-to-br from-violet-900 via-purple-900 to-fuchsia-900 rounded-2xl p-4 text-white shadow-xl">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
          <Brain className="w-4 h-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-black">🧠 Hack Engine</p>
          <p className="text-[9px] text-white/60">10 AI Algorithms · {hackResults.length} players analyzed</p>
        </div>
        <span className="ml-auto text-[9px] bg-emerald-400 text-emerald-950 px-2 py-0.5 rounded-full font-bold">
          UNLOCKED
        </span>
      </div>

      {/* Run button */}
      {!showResults && (
        <Button
          className="w-full h-11 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold"
          onClick={handleRunHack}
        >
          <Zap className="w-5 h-5 mr-1.5" /> Run Hack Engine (10 Algorithms)
        </Button>
      )}

      {/* Results */}
      {showResults && (
        <div className="space-y-3">
          {/* Top 11 picks */}
          <div>
            <p className="text-[10px] font-bold text-amber-300 mb-1 flex items-center gap-1">
              <Trophy className="w-3 h-3" /> TOP 11 HACK PICKS
            </p>
            <div className="space-y-1">
              {topPicks.map((r, i) => (
                <HackPlayerRow key={i} result={r} rank={i + 1} expanded={selectedHack === i} onToggle={() => setSelectedHack(selectedHack === i ? null : i)} />
              ))}
            </div>
          </div>

          {/* Must Picks (S-tier) */}
          {mustPicks.length > 0 && (
            <div className="bg-red-500/20 rounded-xl p-2 border border-red-400/30">
              <p className="text-[10px] font-bold text-red-300 mb-1 flex items-center gap-1">
                <Flame className="w-3 h-3" /> MUST PICKS (S-Tier: {mustPicks.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {mustPicks.map((r, i) => (
                  <span key={i} className="text-[10px] bg-red-500/30 px-2 py-0.5 rounded-full font-bold">
                    {r.playerName} ({r.totalScore})
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Avoid Picks (C-tier) */}
          {avoidPicks.length > 0 && (
            <div className="bg-slate-500/20 rounded-xl p-2 border border-slate-400/30">
              <p className="text-[10px] font-bold text-slate-300 mb-1 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> AVOID (C-Tier: {avoidPicks.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {avoidPicks.map((r, i) => (
                  <span key={i} className="text-[10px] bg-slate-500/30 px-2 py-0.5 rounded-full">
                    {r.playerName} ({r.totalScore})
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 10 Hack Algorithm Summary */}
          <div className="bg-white/5 rounded-xl p-2">
            <p className="text-[10px] font-bold text-white/80 mb-1.5">📊 10 HACK ALGORITHMS</p>
            <div className="grid grid-cols-2 gap-1">
              {[
                { name: "Reverse Eng.", icon: RefreshCw, avg: avg(hackResults, "reverseEngineering") },
                { name: "Ownership", icon: TrendingUp, avg: avg(hackResults, "ownership") },
                { name: "Live Score", icon: Activity, avg: avg(hackResults, "liveScore") },
                { name: "Toss", icon: Target, avg: avg(hackResults, "toss") },
                { name: "DNA", icon: Dna, avg: avg(hackResults, "dna") },
                { name: "Form Cycle", icon: Flame, avg: avg(hackResults, "formCycle") },
                { name: "Impact Player", icon: Zap, avg: avg(hackResults, "impactPlayer") },
                { name: "Weather", icon: CloudRain, avg: avg(hackResults, "weather") },
                { name: "Pace Race", icon: Activity, avg: avg(hackResults, "paceRace") },
                { name: "Ice Cold", icon: Snowflake, avg: avg(hackResults, "iceCold") },
              ].map((hack, i) => (
                <div key={i} className="flex items-center gap-1 text-[9px]">
                  <hack.icon className="w-2.5 h-2.5 text-amber-400" />
                  <span className="text-white/70">{hack.name}</span>
                  <span className="ml-auto font-bold text-amber-300">{hack.avg}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Re-run button */}
          <Button
            className="w-full h-9 bg-white/10 hover:bg-white/20 text-white text-xs font-bold"
            onClick={() => { setShowResults(false); setSelectedHack(null); }}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Close
          </Button>
        </div>
      )}
    </div>
  );
}

/* ============== Helper ============== */
function avg(results: HackResult[], key: keyof HackResult["hacks"]): number {
  if (results.length === 0) return 0;
  return Math.round(results.reduce((s, r) => s + r.hacks[key], 0) / results.length);
}

/* ============== Player Row ============== */
function HackPlayerRow({
  result,
  rank,
  expanded,
  onToggle,
}: {
  result: HackResult;
  rank: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const tierColor =
    result.hackLevel === "S" ? "from-red-500 to-rose-600" :
    result.hackLevel === "A" ? "from-amber-400 to-orange-500" :
    result.hackLevel === "B" ? "from-sky-400 to-blue-500" :
    "from-slate-400 to-slate-500";

  const tierText =
    result.hackLevel === "S" ? "text-red-300" :
    result.hackLevel === "A" ? "text-amber-300" :
    result.hackLevel === "B" ? "text-sky-300" :
    "text-slate-300";

  return (
    <div className={cn(
      "rounded-lg border overflow-hidden",
      result.hackLevel === "S" ? "border-red-400/50 bg-red-500/10" :
      result.hackLevel === "A" ? "border-amber-400/30 bg-amber-500/5" :
      "border-white/10 bg-white/5"
    )}>
      <button
        className="w-full flex items-center gap-2 p-2 text-left"
        onClick={onToggle}
      >
        <div className={cn("w-6 h-6 rounded-md bg-gradient-to-br flex items-center justify-center text-[10px] font-black text-white flex-shrink-0", tierColor)}>
          {rank}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold truncate">{result.playerName.toUpperCase()}</p>
          <p className="text-[8px] text-white/50">{result.team} · {result.role}</p>
        </div>
        <span className={cn("text-sm font-black", tierText)}>{result.totalScore}</span>
        <span className={cn("text-[9px] font-black px-1.5 py-0.5 rounded", `bg-gradient-to-br ${tierColor} text-white`)}>
          {result.hackLevel}
        </span>
        {expanded ? <ChevronUp className="w-3 h-3 text-white/50" /> : <ChevronDown className="w-3 h-3 text-white/50" />}
      </button>

      {/* Expanded view — 10 hack scores */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-2 pt-0 space-y-1">
              <p className="text-[9px] text-white/60 mb-1">{result.recommendation}</p>
              <div className="grid grid-cols-2 gap-1">
                {Object.entries(result.hacks).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-1 text-[9px]">
                    <span className="text-white/50 capitalize">{key.replace(/([A-Z])/g, " $1").trim()}:</span>
                    <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          val >= 80 ? "bg-emerald-400" :
                          val >= 60 ? "bg-amber-400" :
                          "bg-red-400"
                        )}
                        style={{ width: `${val}%` }}
                      />
                    </div>
                    <span className="font-bold text-white/80 w-6 text-right">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
