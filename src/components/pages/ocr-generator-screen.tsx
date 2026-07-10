"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Upload,
  Camera,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Crown,
  Star,
  Trophy,
  Zap,
  Eye,
  EyeOff,
  RefreshCw,
  Sparkles,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface OCRPlayer {
  name: string;
  team: string;
  role: "WK" | "BAT" | "AR" | "BOWL";
  credits?: number;
  selected_by?: number;
  playing: boolean;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
  impactPlayer?: boolean;
}

interface RankedTeam {
  rank: number;
  strategy: string;
  players: OCRPlayer[];
  captain: string;
  viceCaptain: string;
  risk: string;
  winProbability: number;
  expectedPoints: number;
  efv: number;
}

interface OCRResult {
  status: "success" | "fail";
  message?: string;
  source?: string;
  team1Name?: string;
  team2Name?: string;
  players?: OCRPlayer[];
  rankedTeams?: RankedTeam[];
  extractedCount?: number;
  verifiedCount?: number;
  teamCount?: number;
}

export function OCRGenerator() {
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OCRResult | null>(null);
  const [showPlayers, setShowPlayers] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>, fromCamera: boolean = false) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image too large — max 10MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setImage(dataUrl);
      setResult(null);
      toast.success(`${fromCamera ? "Photo" : "Image"} loaded — click "Generate Teams"`);
    };
    reader.readAsDataURL(file);
  }

  async function handleGenerate() {
    if (!image) {
      toast.error("Please upload a screenshot first");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/ocr-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      });

      const data: OCRResult = await res.json();

      if (data.status === "success") {
        setResult(data);
        toast.success(`Generated ${data.teamCount} ranked teams from ${data.verifiedCount} players!`);
      } else {
        setResult(data);
        toast.error(data.message || "OCR failed — try a clearer image");
      }
    } catch (err: any) {
      console.error("[OCR] Error:", err);
      toast.error(err?.message || "Network error — please try again");
      setResult({
        status: "fail",
        message: err?.message || "Network error",
      });
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setImage(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  }

  return (
    <div className="px-4 py-4 pb-24 space-y-4">
      {/* Header */}
      <div className="bg-gradient-to-r from-fuchsia-600 via-purple-600 to-violet-600 rounded-3xl p-5 text-white shadow-lg">
        <div className="flex items-center gap-2 mb-1">
          <Eye className="w-5 h-5" />
          <h1 className="text-lg font-bold">AI OCR Team Generator</h1>
        </div>
        <p className="text-xs text-white/80">
          Upload a Dream11, My11Circle, or Playing XI screenshot. AI extracts players via Vision OCR
          and generates 10 ranked teams — same Elite AI quality.
        </p>
      </div>

      {/* How it works */}
      <div className="bg-white dark:bg-card rounded-2xl p-4 border border-violet-100 dark:border-violet-900/30">
        <p className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-violet-500" />
          How it works
        </p>
        <div className="grid grid-cols-5 gap-1 text-[9px] text-muted-foreground">
          {[
            { step: "1", label: "Upload Screenshot", icon: "📸" },
            { step: "2", label: "AI OCR Extract", icon: "🔍" },
            { step: "3", label: "Verify Players", icon: "✅" },
            { step: "4", label: "Score & Analyze", icon: "🧠" },
            { step: "5", label: "10 Ranked Teams", icon: "🏆" },
          ].map((s) => (
            <div key={s.step} className="text-center">
              <div className="text-xl mb-0.5">{s.icon}</div>
              <p className="font-bold text-foreground">{s.step}</p>
              <p className="leading-tight">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Upload section */}
      {!result && (
        <div className="bg-white dark:bg-card rounded-2xl p-4 border border-violet-100 dark:border-violet-900/30 space-y-3">
          {image ? (
            <div className="space-y-3">
              {/* Image preview */}
              <div className="relative rounded-xl overflow-hidden border-2 border-violet-200 dark:border-violet-800">
                <img src={image} alt="Uploaded screenshot" className="w-full max-h-80 object-contain bg-slate-100 dark:bg-slate-900" />
                <button
                  onClick={handleReset}
                  className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <Button
                className="w-full h-12 bg-gradient-to-r from-fuchsia-600 to-violet-600 hover:from-fuchsia-700 hover:to-violet-700 text-white font-bold"
                onClick={handleGenerate}
                disabled={loading}
              >
                {loading ? (
                  <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> AI analyzing image...</>
                ) : (
                  <><Sparkles className="w-5 h-5 mr-2" /> Generate 10 Ranked Teams</>
                )}
              </Button>
              {loading && (
                <div className="text-center text-[10px] text-muted-foreground">
                  Vision AI is reading player names, teams, roles, credits...
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Upload buttons */}
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="h-20 flex-col border-violet-200 text-violet-700 dark:text-violet-300"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-6 h-6 mb-1" />
                  <span className="text-[11px] font-bold">Upload Image</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-20 flex-col border-violet-200 text-violet-700 dark:text-violet-300"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera className="w-6 h-6 mb-1" />
                  <span className="text-[11px] font-bold">Take Photo</span>
                </Button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileSelect(e, false)}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handleFileSelect(e, true)}
              />

              {/* Accepted formats */}
              <div className="bg-violet-50 dark:bg-violet-950/30 rounded-lg p-3 text-[10px] text-muted-foreground">
                <p className="font-bold text-violet-700 dark:text-violet-300 mb-1">✅ Accepted Screenshots:</p>
                <ul className="space-y-0.5 ml-3">
                  <li>• Dream11 team/match screenshot</li>
                  <li>• My11Circle team/match screenshot</li>
                  <li>• Official Playing XI announcement</li>
                  <li>• Match Center player list</li>
                  <li>• Any fantasy cricket player list</li>
                </ul>
                <p className="font-bold text-amber-600 dark:text-amber-400 mt-2 mb-1">⚠️ Tips:</p>
                <ul className="space-y-0.5 ml-3">
                  <li>• Use high-resolution images</li>
                  <li>• Ensure all player names are visible</li>
                  <li>• Avoid blurry or cropped screenshots</li>
                  <li>• Max file size: 10MB</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error result */}
      {result?.status === "fail" && (
        <div className="bg-red-50 dark:bg-red-950/30 rounded-2xl p-4 border border-red-200 dark:border-red-800">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-bold text-red-700 dark:text-red-300">OCR Failed</p>
              <p className="text-[11px] text-muted-foreground mt-1">{result.message}</p>
              {result.verifiedCount !== undefined && (
                <p className="text-[10px] text-muted-foreground mt-2">
                  Extracted: {result.extractedCount} players · Verified: {result.verifiedCount} players
                </p>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full mt-3 border-red-200 text-red-700 dark:text-red-300"
            onClick={handleReset}
          >
            <RefreshCw className="w-4 h-4 mr-1.5" /> Try Another Image
          </Button>
        </div>
      )}

      {/* Success result */}
      {result?.status === "success" && result.rankedTeams && (
        <div className="space-y-4">
          {/* Success banner */}
          <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl p-4 text-white shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> Teams Generated!
                </p>
                <p className="text-[10px] text-white/80 mt-0.5">
                  Source: {result.source} · {result.verifiedCount} players verified
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black">{result.teamCount}</p>
                <p className="text-[9px] text-white/80 uppercase">Ranked Teams</p>
              </div>
            </div>
          </div>

          {/* Match info */}
          {(result.team1Name || result.team2Name) && (
            <div className="bg-white dark:bg-card rounded-xl p-3 border border-violet-100 dark:border-violet-900/30">
              <div className="flex items-center justify-center gap-3 text-sm font-bold">
                <span className="text-blue-600 dark:text-blue-400">{result.team1Name || "T1"}</span>
                <span className="text-muted-foreground text-xs">vs</span>
                <span className="text-red-600 dark:text-red-400">{result.team2Name || "T2"}</span>
              </div>
            </div>
          )}

          {/* Verified players (collapsible) */}
          {result.players && result.players.length > 0 && (
            <div className="bg-white dark:bg-card rounded-2xl p-3 border border-violet-100 dark:border-violet-900/30">
              <button
                onClick={() => setShowPlayers(!showPlayers)}
                className="w-full flex items-center justify-between text-xs font-bold text-foreground"
              >
                <span className="flex items-center gap-1.5">
                  {showPlayers ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  Verified Players ({result.players.length})
                </span>
                <span className="text-[10px] bg-violet-100 dark:bg-violet-900 px-2 py-0.5 rounded-full text-violet-700 dark:text-violet-300">
                  {showPlayers ? "Hide" : "Show"}
                </span>
              </button>
              <AnimatePresence>
                {showPlayers && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden mt-2"
                  >
                    <div className="grid grid-cols-2 gap-1.5">
                      {result.players.map((p, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-[10px] bg-violet-50 dark:bg-violet-950/30 rounded p-1.5">
                          <span className={cn(
                            "w-5 h-5 rounded flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0",
                            p.role === "WK" && "bg-amber-500",
                            p.role === "BAT" && "bg-sky-500",
                            p.role === "AR" && "bg-emerald-500",
                            p.role === "BOWL" && "bg-rose-500",
                          )}>
                            {p.role}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold truncate">{p.name}</p>
                            <p className="text-muted-foreground text-[9px]">{p.team} · {p.credits || "?"}cr · {p.selected_by || 0}%</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Ranked teams */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-amber-500" />
              10 Ranked Teams — Rank #1 (Best) to Rank #10 (Ultra Differential)
            </p>
            {result.rankedTeams.map((team) => (
              <OCRRankedTeamCard key={team.rank} team={team} />
            ))}
          </div>

          {/* Reset button */}
          <Button
            variant="outline"
            className="w-full border-violet-200 text-violet-700 dark:text-violet-300"
            onClick={handleReset}
          >
            <RefreshCw className="w-4 h-4 mr-1.5" /> Generate from Another Image
          </Button>
        </div>
      )}

      {/* Info section */}
      <div className="bg-amber-50 dark:bg-amber-950/20 rounded-2xl p-3 border border-amber-200 dark:border-amber-800">
        <p className="text-[10px] text-amber-700 dark:text-amber-300 font-bold mb-1">💡 OCR AI Engine</p>
        <p className="text-[10px] text-muted-foreground">
          This tool uses Vision AI to read player data from screenshots. It auto-corrects OCR mistakes
          (e.g. "V Kohii" → "Virat Kohli"), removes bench/injured players, and generates 10 unique
          ranked teams with different strategies (Safe, Balanced, Grand League, Differential, etc.).
          Same Elite AI quality as the main generator.
        </p>
      </div>
    </div>
  );
}

/* ============== Ranked Team Card ============== */

function OCRRankedTeamCard({ team }: { team: RankedTeam }) {
  const [expanded, setExpanded] = useState(team.rank <= 3); // top 3 expanded by default

  const rankColor =
    team.rank === 1 ? "from-amber-400 to-yellow-500" :
    team.rank === 2 ? "from-slate-300 to-slate-400" :
    team.rank === 3 ? "from-orange-400 to-amber-600" :
    team.rank <= 5 ? "from-violet-500 to-purple-600" :
    team.rank <= 7 ? "from-sky-500 to-blue-600" :
    "from-rose-500 to-pink-600";

  const rankLabel =
    team.rank === 1 ? "RANK 1 — MAX WIN PROB" :
    team.rank === 2 ? "RANK 2 — BALANCED" :
    team.rank === 3 ? "RANK 3 — SAFE" :
    team.rank === 4 ? "RANK 4 — GRAND LEAGUE" :
    team.rank === 5 ? "RANK 5 — HIGH DIFFERENTIAL" :
    team.rank === 6 ? "RANK 6 — AGGRESSIVE" :
    team.rank === 7 ? "RANK 7 — BOWLING DOMINANT" :
    team.rank === 8 ? "RANK 8 — BATTING DOMINANT" :
    team.rank === 9 ? "RANK 9 — MEGA GL" :
    "RANK 10 — ULTRA DIFFERENTIAL";

  const riskColor =
    team.risk === "low" ? "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30" :
    team.risk === "medium" ? "text-amber-600 bg-amber-50 dark:bg-amber-950/30" :
    "text-rose-600 bg-rose-50 dark:bg-rose-950/30";

  // Group players by role
  const wk = team.players.filter(p => p.role === "WK");
  const bat = team.players.filter(p => p.role === "BAT");
  const ar = team.players.filter(p => p.role === "AR");
  const bowl = team.players.filter(p => p.role === "BOWL");

  return (
    <div className={cn(
      "rounded-xl border-2 overflow-hidden transition-all",
      team.rank <= 3 ? "border-amber-300 dark:border-amber-700" : "border-violet-100 dark:border-violet-900/30"
    )}>
      {/* Rank header */}
      <div
        className={cn("bg-gradient-to-r p-2.5 flex items-center justify-between cursor-pointer", rankColor)}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-white/30 backdrop-blur-md flex items-center justify-center font-black text-white text-sm">
            {team.rank <= 3 ? <Crown className="w-4 h-4" /> : team.rank}
          </div>
          <div>
            <p className="text-xs font-black text-white">{rankLabel}</p>
            <p className="text-[10px] text-white/80 uppercase">{team.strategy} · {team.risk} risk</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs font-black text-white tabular-nums">{team.winProbability}% win</p>
          <p className="text-[10px] text-white/80">{team.expectedPoints} pts</p>
        </div>
      </div>

      {/* Team preview — C/VC + key stats */}
      <div className="bg-white dark:bg-card p-2.5">
        <div className="flex items-center gap-2 mb-2 text-[10px]">
          <span className="px-1.5 py-0.5 rounded-full font-bold bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300">
            👑 C: {team.captain}
          </span>
          <span className="px-1.5 py-0.5 rounded-full font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
            ⭐ VC: {team.viceCaptain}
          </span>
          <span className={cn("px-1.5 py-0.5 rounded-full font-bold ml-auto", riskColor)}>
            {team.risk} risk
          </span>
        </div>

        {/* Quick role summary */}
        <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
          <span className="bg-amber-100 dark:bg-amber-950/40 px-1.5 py-0.5 rounded text-amber-700 dark:text-amber-300 font-bold">WK {wk.length}</span>
          <span className="bg-sky-100 dark:bg-sky-950/40 px-1.5 py-0.5 rounded text-sky-700 dark:text-sky-300 font-bold">BAT {bat.length}</span>
          <span className="bg-emerald-100 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded text-emerald-700 dark:text-emerald-300 font-bold">AR {ar.length}</span>
          <span className="bg-rose-100 dark:bg-rose-950/40 px-1.5 py-0.5 rounded text-rose-700 dark:text-rose-300 font-bold">BOWL {bowl.length}</span>
          <span className="ml-auto font-bold text-foreground">EFV: {team.efv}</span>
        </div>

        {/* Expanded view — full player list */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mt-2"
            >
              {/* WK */}
              {wk.length > 0 && (
                <div className="mb-1.5">
                  <p className="text-[9px] font-bold text-amber-600 dark:text-amber-400 uppercase mb-0.5">WK</p>
                  <div className="flex flex-wrap gap-1">
                    {wk.map((p, i) => (
                      <PlayerChip key={i} player={p} isCaptain={p.name === team.captain} isViceCaptain={p.name === team.viceCaptain} />
                    ))}
                  </div>
                </div>
              )}
              {/* BAT */}
              {bat.length > 0 && (
                <div className="mb-1.5">
                  <p className="text-[9px] font-bold text-sky-600 dark:text-sky-400 uppercase mb-0.5">BAT</p>
                  <div className="flex flex-wrap gap-1">
                    {bat.map((p, i) => (
                      <PlayerChip key={i} player={p} isCaptain={p.name === team.captain} isViceCaptain={p.name === team.viceCaptain} />
                    ))}
                  </div>
                </div>
              )}
              {/* AR */}
              {ar.length > 0 && (
                <div className="mb-1.5">
                  <p className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 uppercase mb-0.5">AR</p>
                  <div className="flex flex-wrap gap-1">
                    {ar.map((p, i) => (
                      <PlayerChip key={i} player={p} isCaptain={p.name === team.captain} isViceCaptain={p.name === team.viceCaptain} />
                    ))}
                  </div>
                </div>
              )}
              {/* BOWL */}
              {bowl.length > 0 && (
                <div className="mb-1.5">
                  <p className="text-[9px] font-bold text-rose-600 dark:text-rose-400 uppercase mb-0.5">BOWL</p>
                  <div className="flex flex-wrap gap-1">
                    {bowl.map((p, i) => (
                      <PlayerChip key={i} player={p} isCaptain={p.name === team.captain} isViceCaptain={p.name === team.viceCaptain} />
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toggle button */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-[10px] text-violet-600 dark:text-violet-400 font-bold mt-1.5"
        >
          {expanded ? "▲ Hide players" : "▼ Show all 11 players"}
        </button>
      </div>
    </div>
  );
}

/* ============== Player Chip ============== */

function PlayerChip({
  player,
  isCaptain,
  isViceCaptain,
}: {
  player: OCRPlayer;
  isCaptain: boolean;
  isViceCaptain: boolean;
}) {
  return (
    <div className={cn(
      "flex items-center gap-1 px-1.5 py-1 rounded-lg text-[10px] border",
      isCaptain
        ? "bg-amber-100 dark:bg-amber-950/40 border-amber-400 dark:border-amber-600"
        : isViceCaptain
        ? "bg-slate-200 dark:bg-slate-700 border-slate-400 dark:border-slate-500"
        : "bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800"
    )}>
      {isCaptain && <Crown className="w-3 h-3 text-amber-500" />}
      {isViceCaptain && <Star className="w-3 h-3 text-slate-500" />}
      <span className="font-bold">{player.name}</span>
      <span className="text-muted-foreground text-[9px]">{player.team}</span>
      {player.credits && <span className="text-muted-foreground text-[9px]">{player.credits}cr</span>}
    </div>
  );
}
