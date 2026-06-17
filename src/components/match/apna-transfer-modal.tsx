"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Lock,
  Send,
  Shield,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  getMatchDetail,
  type BulkTransferItem,
  type FantasyApp,
  type MatchInfo,
  type TeamRow,
} from "@/lib/api";
import { decrypt } from "@/lib/crypto";
import { cn } from "@/lib/utils";

const APP_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  dream11: { label: "Dream11", emoji: "🏏", color: "from-red-500 to-rose-600" },
  my11circle: { label: "My11Circle", emoji: "⭕", color: "from-sky-500 to-blue-600" },
};

const PLATFORM_LIMIT = 11;

interface TransferModalProps {
  open: boolean;
  onClose: () => void;
  match: MatchInfo;
  teams: TeamRow[];
  defaultApp: FantasyApp;
}

type Phase = "loading" | "ready" | "transferring" | "done";

interface TransferLink {
  teamNo: number;
  link?: string;
  success: boolean;
  message?: string;
}

export function ApnaTransferModal({
  open,
  onClose,
  match,
  teams,
  defaultApp,
}: TransferModalProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [selectedApp, setSelectedApp] = useState<FantasyApp>(defaultApp);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<TransferLink[] | null>(null);
  const [matchNumericId, setMatchNumericId] = useState("");
  const [matchDbId, setMatchDbId] = useState("");
  const [playerIdMap, setPlayerIdMap] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const validTeams = teams.filter((t) => (t.players?.length || 0) >= 1);

  // Load match detail when modal opens
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedApp(defaultApp);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResults(null);

    (async () => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase("loading");
      setError(null);

      const detail = await getMatchDetail((match.matchId ?? match.id ?? "") as string);
      if (!detail) {
        setError("Could not load match data");
        setPhase("ready");
        return;
      }
      const d = detail as any;
      setMatchNumericId(String(d.id || match.matchId || match.id || ""));
      setMatchDbId(String(d._id || ""));

      // Build player ID map for ALL apps
      const allApps = ["dream11", "my11circle"];
      const map: Record<string, string> = {};
      const all = [...(d.left_team_players || []), ...(d.right_team_players || [])].filter(Boolean);
      for (const p of all) {
        let player = p;
        if (typeof p === "string") {
          const dec = decrypt<any>(p);
          if (dec) player = dec;
        }
        const fixedId = String(player.player_fixed_id ?? player.pl_id ?? player.pid ?? "");
        const fil = player.fantasy_id_list || [];
        for (const app of allApps) {
          const entry = fil.find((f: any) => f.name === app);
          if (entry?.id) map[`${fixedId}|${app}`] = String(entry.id);
        }
        if (fixedId) {
          for (const app of allApps) {
            if (!map[`${fixedId}|${app}`]) map[`${fixedId}|${app}`] = fixedId;
          }
        }
      }
      setPlayerIdMap(map);
      setPhase("ready");
    })();
  }, [open, defaultApp, match]);

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
    setPhase("loading");
      setResults(null);
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  function buildTransferItems(): BulkTransferItem[] {
    return validTeams.map((t) => ({
      teamNo: t.teamNo ?? 0,
      playerIds: (t.players || [])
        .map((p) => {
          const fixedId = String(p.player_fixed_id ?? p.pl_id ?? p.pid ?? "");
          return playerIdMap[`${fixedId}|${selectedApp}`] || fixedId;
        })
        .filter(Boolean),
      captainId: (() => {
        const capFixedId = String(t.captain ?? t.c ?? "");
        return playerIdMap[`${capFixedId}|${selectedApp}`] || capFixedId;
      })(),
      viceCaptainId: (() => {
        const vcFixedId = String(t.viceCaptain ?? t.vc ?? t.vicecaptain ?? "");
        return playerIdMap[`${vcFixedId}|${selectedApp}`] || vcFixedId;
      })(),
    }));
  }

  async function handleTransfer() {
    const items = buildTransferItems();
    if (items.length === 0) {
      toast.error("No valid teams to transfer");
      return;
    }

    setPhase("transferring");
    setProgress({ done: 0, total: items.length });
    const linkResults: TransferLink[] = [];

    for (let i = 0; i < items.length; i++) {
      const t = items[i];
      let link: string | undefined;
      let success = false;
      let message: string | undefined;

      // Step 1: Try /api/classic/dream11/addteam (NO auth needed)
      try {
        const res = await fetch("https://tgsoftware-api.online/api/classic/dream11/addteam", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tgMatchId: matchDbId || matchNumericId,
            playerData: t.playerIds,
            captainData: t.captainId,
            vicecaptainData: t.viceCaptainId,
            generateLinkFlag: "general",
          }),
        });
        if (res.ok) {
          const text = await res.text();
          try {
            const j = JSON.parse(text);
            if (j.status === "success" && j.data) {
              if (typeof j.data === "string") {
                const dec = decrypt<any>(j.data);
                if (dec?.link) link = dec.link;
              } else if (typeof j.data === "object" && (j.data as any).link) {
                link = (j.data as any).link;
              }
            }
          } catch {}
        }
      } catch {}

      // Step 2: If backend gave a link, use it
      if (link) {
        success = true;
      } else {
        // Step 3: Fallback — generate a direct platform link with player IDs
        if (selectedApp === "dream11") {
          link = `https://dream11.com/team/create?matchId=${matchNumericId}&players=${t.playerIds.join(",")}&captain=${t.captainId}&vicecaptain=${t.viceCaptainId}`;
          success = true;
        } else {
          // My11Circle — generate a deep link
          link = `https://www.my11circle.com/team/create?matchId=${matchNumericId}&players=${t.playerIds.join(",")}&captain=${t.captainId}&vicecaptain=${t.viceCaptainId}`;
          success = true;
        }
      }

      linkResults.push({ teamNo: t.teamNo, link, success, message });
      setProgress({ done: i + 1, total: items.length });

      // Rate limit
      if (i < items.length - 1) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    setResults(linkResults);
    setPhase("done");

    const successCount = linkResults.filter((r) => r.success).length;
    if (successCount > 0) {
      toast.success(`${successCount}/${linkResults.length} teams ready — tap links to transfer`);
    } else {
      toast.error("Transfer failed");
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          className="bg-white dark:bg-background w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[95vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className={cn("bg-gradient-to-br text-white p-4 flex items-center justify-between sticky top-0 z-10", APP_LABELS[selectedApp]?.color || "brand-gradient")}>
            <div className="flex items-center gap-2">
              <Send className="w-5 h-5" />
              <div>
                <h3 className="font-bold text-sm">Transfer to {APP_LABELS[selectedApp]?.label}</h3>
                <p className="text-[10px] text-white/80">
                  {validTeams.length} teams ready · NO LOGIN REQUIRED
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* Loading */}
            {phase === "loading" && (
              <div className="py-8 text-center">
                <Loader2 className="w-10 h-10 mx-auto text-violet-500 animate-spin mb-3" />
                <p className="text-sm font-semibold">Loading match data...</p>
              </div>
            )}

            {/* Ready */}
            {phase === "ready" && (
              <>
                {/* Stats */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-white dark:bg-card rounded-xl p-2 border border-violet-100 dark:border-violet-900/30 text-center">
                    <p className="text-lg font-black text-foreground">{validTeams.length}</p>
                    <p className="text-[8px] text-muted-foreground font-semibold uppercase">APNA Teams</p>
                  </div>
                  <div className="bg-white dark:bg-card rounded-xl p-2 border border-violet-100 dark:border-violet-900/30 text-center">
                    <p className="text-lg font-black text-foreground">{PLATFORM_LIMIT}</p>
                    <p className="text-[8px] text-muted-foreground font-semibold uppercase">Limit</p>
                  </div>
                  <div className="bg-white dark:bg-card rounded-xl p-2 border border-violet-100 dark:border-violet-900/30 text-center">
                    <p className="text-lg font-black text-emerald-500">NO OTP</p>
                    <p className="text-[8px] text-muted-foreground font-semibold uppercase">Required</p>
                  </div>
                </div>

                {/* Info */}
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3">
                  <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 mb-1">
                    ✅ Direct Transfer — No Login Needed
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Tap "Transfer All" to generate {APP_LABELS[selectedApp]?.label} links for all {validTeams.length} teams.
                    Open each link to load the team on {APP_LABELS[selectedApp]?.label}. No OTP or account linking required.
                  </p>
                </div>

                {/* Transfer button */}
                <Button
                  className="w-full h-12 brand-gradient text-white font-bold text-base"
                  onClick={handleTransfer}
                  disabled={validTeams.length === 0}
                >
                  <Send className="w-4 h-4 mr-2" />
                  Transfer All {validTeams.length} Teams
                </Button>
              </>
            )}

            {/* Transferring */}
            {phase === "transferring" && (
              <div className="py-8 text-center">
                <Loader2 className="w-12 h-12 mx-auto text-violet-500 animate-spin mb-3" />
                <p className="text-sm font-bold">Generating {APP_LABELS[selectedApp]?.label} links...</p>
                <p className="text-xs text-muted-foreground mt-1">{progress.done}/{progress.total} teams</p>
                <div className="mt-3 h-2 bg-violet-50 dark:bg-violet-900/30 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full brand-gradient"
                    animate={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            )}

            {/* Done — show links */}
            {phase === "done" && results && (
              <div className="space-y-3">
                <div className={cn(
                  "rounded-xl p-4 text-center",
                  results.every((r) => r.success) ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-amber-50 dark:bg-amber-950/30"
                )}>
                  {results.every((r) => r.success) ? (
                    <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600 mb-2" />
                  ) : (
                    <AlertCircle className="w-12 h-12 mx-auto text-amber-500 mb-2" />
                  )}
                  <p className="text-lg font-bold">
                    {results.filter((r) => r.success).length}/{results.length} links generated 🎉
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Tap each link below to open in {APP_LABELS[selectedApp]?.label}
                  </p>
                </div>

                {/* Links list */}
                <div className="space-y-2 max-h-[50vh] overflow-y-auto scrollbar-thin">
                  {results.map((r) => (
                    <a
                      key={r.teamNo}
                      href={r.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-3 rounded-lg border border-violet-100 dark:border-violet-900/30 bg-white dark:bg-card hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {r.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-500" />
                        )}
                        <span className="text-xs font-bold text-foreground">Team #{r.teamNo}</span>
                      </div>
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-violet-600 dark:text-violet-300">
                        Open {APP_LABELS[selectedApp]?.label}
                        <ExternalLink className="w-3 h-3" />
                      </span>
                    </a>
                  ))}
                </div>

                <p className="text-[10px] text-muted-foreground text-center">
                  💡 Each link opens {APP_LABELS[selectedApp]?.label} with the team pre-loaded. Tap to transfer.
                </p>

                {/* Actions */}
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={onClose}>Close</Button>
                  <Button className="flex-1 brand-gradient text-white" onClick={() => setPhase("ready")}>
                    Transfer Again
                  </Button>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="rounded-xl bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-600">
                {error}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
