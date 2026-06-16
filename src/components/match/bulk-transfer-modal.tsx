"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Link2,
  Loader2,
  Send,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/lib/store";
import {
  bulkDirectTransfer,
  bulkTransferToLinkedAccount,
  getFantasyToken,
  getMatchDetail,
  type BulkTransferItem,
  type BulkTransferResult,
  type FantasyApp,
  type MatchInfo,
  type MatchPlayer,
  type TeamRow,
} from "@/lib/api";
import { cn } from "@/lib/utils";

interface BulkTransferModalProps {
  open: boolean;
  onClose: () => void;
  match: MatchInfo;
  teams: TeamRow[];
  onOpenOtpLogin: () => void;
}

type Mode = "direct" | "linked";
type Phase = "select" | "transferring" | "done";

export function BulkTransferModal({
  open,
  onClose,
  match,
  teams,
  onOpenOtpLogin,
}: BulkTransferModalProps) {
  const isGuest = useAuth((s) => s.isGuest);
  const [phase, setPhase] = useState<Phase>("select");
  const [mode, setMode] = useState<Mode>("direct");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<BulkTransferResult | null>(null);
  const [linkedApps, setLinkedApps] = useState<FantasyApp[]>([]);
  const [matchDbId, setMatchDbId] = useState<string>("");
  const [playerIdMap, setPlayerIdMap] = useState<Record<string, string>>({});

  // Refresh linked apps when modal opens
  useEffect(() => {
    if (open) {
      const apps: FantasyApp[] = [];
      for (const a of ["dream11", "my11circle", "myteam11", "vision11"] as FantasyApp[]) {
        if (getFantasyToken(a)) apps.push(a);
      }
      setLinkedApps(apps);
      // Fetch match detail to get the MongoDB _id and player ID mapping
      (async () => {
        const detail = await getMatchDetail((match.matchId ?? match.id ?? "") as string);
        if (detail) {
          setMatchDbId((detail as any)._id);
          // Build a map of player_fixed_id → dream11 player ID (from fantasy_id_list)
          const map: Record<string, string> = {};
          const all = [
            ...((detail as any).left_team_players || []),
            ...((detail as any).right_team_players || []),
          ].filter(Boolean);
          for (const p of all) {
            // p may already be decrypted by deepDecrypt, or still encrypted
            let player = p;
            if (typeof p === "string") {
              // Decrypt manually if needed
              const { decrypt } = await import("@/lib/crypto");
              const dec = decrypt<any>(p);
              if (dec) player = dec;
            }
            const fixedId = String(player.player_fixed_id ?? player.pl_id ?? player.pid ?? "");
            // Find dream11 ID from fantasy_id_list
            const fil = player.fantasy_id_list || [];
            const d11 = fil.find((f: any) => f.name === "dream11");
            const my11 = fil.find((f: any) => f.name === "my11circle");
            // Prefer dream11 ID, fallback to my11circle, then fixed_id
            const mappedId = d11?.id || my11?.id || fixedId;
            if (fixedId && mappedId) map[fixedId] = String(mappedId);
          }
          setPlayerIdMap(map);
        }
      })();
    }
  }, [open, match]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setPhase("select");
      setProgress({ done: 0, total: 0 });
      setResult(null);
    }
  }, [open]);

  if (!open) return null;

  const validTeams = teams.filter((t) => (t.players?.length || 0) === 11);

  function buildTransferItems(): BulkTransferItem[] {
    return validTeams.map((t) => ({
      teamNo: t.teamNo ?? 0,
      playerIds: (t.players || [])
        .map((p) => {
          const fixedId = String(p.player_fixed_id ?? p.pl_id ?? p.pid ?? "");
          return playerIdMap[fixedId] || fixedId;
        })
        .filter(Boolean),
      captainId: (() => {
        const capFixedId = String(t.captain ?? t.c ?? "");
        return playerIdMap[capFixedId] || capFixedId;
      })(),
      viceCaptainId: (() => {
        const vcFixedId = String(t.viceCaptain ?? t.vc ?? t.vicecaptain ?? "");
        return playerIdMap[vcFixedId] || vcFixedId;
      })(),
    }));
  }

  async function handleTransfer() {
    const items = buildTransferItems();
    if (items.length === 0) {
      toast.error("No valid teams to transfer (need 11 players each)");
      return;
    }
    setPhase("transferring");
    setProgress({ done: 0, total: items.length });

    try {
      let res: BulkTransferResult;
      if (mode === "direct") {
        // Direct link generation — no auth required
        res = await bulkDirectTransfer(items, matchDbId, (done, total) =>
          setProgress({ done, total })
        );
      } else {
        // Linked account transfer — uses saved authToken
        const app = (linkedApps[0] || "dream11") as FantasyApp;
        const authToken = getFantasyToken(app)!;
        const extras = app === "my11circle"
          ? JSON.parse(localStorage.getItem("fantasypro-my11circle-extras") || "{}")
          : {};
        res = await bulkTransferToLinkedAccount(
          items,
          {
            matchId: matchDbId,
            fantasyApp: app,
            authToken,
            sportIndex: 0,
            my11circleChallenge: extras.challenge,
            my11circleUserId: extras.userId,
            mobileNumber: extras.mobile,
          },
          (done, total) => setProgress({ done, total })
        );
      }
      setResult(res);
      setPhase("done");
      if (res.successCount > 0) {
        toast.success(`Transferred ${res.successCount}/${res.totalAttempted} teams`);
      } else {
        toast.error("All transfers failed — match may not support direct transfer");
      }
    } catch (err: any) {
      toast.error(err?.message || "Transfer failed");
      setPhase("select");
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          className="bg-white dark:bg-background w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[95vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="brand-gradient text-white p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Send className="w-5 h-5" />
              <div>
                <h3 className="font-bold text-sm">Bulk Team Transfer</h3>
                <p className="text-[10px] text-white/80">
                  {validTeams.length} teams · {teams.length} total
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* Phase: Select mode */}
            {phase === "select" && (
              <>
                {/* Mode selection */}
                <div className="space-y-2">
                  <button
                    onClick={() => setMode("direct")}
                    className={cn(
                      "w-full p-3 rounded-xl border-2 transition-all text-left flex items-start gap-3",
                      mode === "direct"
                        ? "border-violet-400 bg-violet-50/50 dark:bg-violet-900/20"
                        : "border-violet-100 dark:border-violet-900/30"
                    )}
                  >
                    <div className="w-9 h-9 rounded-lg brand-gradient flex items-center justify-center flex-shrink-0">
                      <Link2 className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
                        Direct Link Transfer
                        <span className="text-[9px] bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 px-1.5 py-0.5 rounded-full font-bold">
                          NO LOGIN
                        </span>
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Generate Dream11 transfer links for all teams. Open each link to instantly load the team in Dream11 — no OTP needed.
                      </p>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      if (linkedApps.length === 0) {
                        toast.info("Please link a fantasy account via OTP first");
                        onOpenOtpLogin();
                        return;
                      }
                      setMode("linked");
                    }}
                    className={cn(
                      "w-full p-3 rounded-xl border-2 transition-all text-left flex items-start gap-3",
                      mode === "linked"
                        ? "border-violet-400 bg-violet-50/50 dark:bg-violet-900/20"
                        : "border-violet-100 dark:border-violet-900/30"
                    )}
                  >
                    <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center flex-shrink-0">
                      <Zap className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground flex items-center gap-1.5">
                        Auto Transfer to Linked Account
                        {linkedApps.length > 0 ? (
                          <span className="text-[9px] bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 px-1.5 py-0.5 rounded-full font-bold">
                            {linkedApps.length} LINKED
                          </span>
                        ) : (
                          <span className="text-[9px] bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 px-1.5 py-0.5 rounded-full font-bold">
                            REQUIRES OTP
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Auto-send all teams directly to your linked Dream11/My11Circle account. Requires OTP login first.
                      </p>
                    </div>
                  </button>
                </div>

                {/* Match info */}
                <div className="rounded-xl bg-violet-50/50 dark:bg-violet-950/20 p-3 text-xs">
                  <p className="font-semibold text-foreground mb-1">Transfer details:</p>
                  <ul className="space-y-0.5 text-muted-foreground">
                    <li>• Match: {match.series || match.title || match.matchId}</li>
                    <li>• Teams to transfer: {validTeams.length}</li>
                    <li>• Mode: {mode === "direct" ? "Direct link (no login)" : "Auto to linked account"}</li>
                    {mode === "direct" && <li>• Rate limit: 200ms between teams</li>}
                    {mode === "linked" && <li>• Account: {linkedApps[0] || "none linked"}</li>}
                  </ul>
                </div>

                {validTeams.length === 0 ? (
                  <div className="text-center py-4 text-sm text-muted-foreground">
                    No valid teams (need 11 players each). Generate teams first.
                  </div>
                ) : (
                  <Button
                    onClick={handleTransfer}
                    className="w-full h-12 brand-gradient text-white font-bold"
                  >
                    {mode === "direct" ? (
                      <>
                        <Link2 className="w-4 h-4 mr-2" />
                        Generate {validTeams.length} Transfer Links
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Transfer {validTeams.length} Teams to {linkedApps[0] || "Account"}
                      </>
                    )}
                  </Button>
                )}

                {/* Quick link to OTP login */}
                {mode === "linked" && linkedApps.length === 0 && (
                  <Button
                    variant="outline"
                    className="w-full h-10"
                    onClick={onOpenOtpLogin}
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Link Fantasy Account via OTP
                  </Button>
                )}
              </>
            )}

            {/* Phase: Transferring */}
            {phase === "transferring" && (
              <div className="py-6 space-y-4">
                <div className="text-center">
                  <Loader2 className="w-12 h-12 mx-auto text-violet-500 animate-spin mb-3" />
                  <p className="text-sm font-bold text-foreground">
                    Transferring {progress.total} teams...
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {mode === "direct"
                      ? "Generating Dream11 transfer links"
                      : "Sending to your linked account"}
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Progress</span>
                    <span className="tabular-nums">{progress.done}/{progress.total}</span>
                  </div>
                  <div className="h-2 bg-violet-50 dark:bg-violet-900/30 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full brand-gradient"
                      animate={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Phase: Done */}
            {phase === "done" && result && (
              <div className="space-y-4">
                {/* Summary */}
                <div
                  className={cn(
                    "rounded-xl p-4 text-center",
                    result.successCount === result.totalAttempted
                      ? "bg-emerald-50 dark:bg-emerald-950/30"
                      : result.successCount > 0
                      ? "bg-amber-50 dark:bg-amber-950/30"
                      : "bg-red-50 dark:bg-red-950/30"
                  )}
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200 }}
                    className="w-14 h-14 mx-auto rounded-full bg-white dark:bg-card flex items-center justify-center mb-2"
                  >
                    {result.successCount === result.totalAttempted ? (
                      <CheckCircle2 className="w-9 h-9 text-emerald-600" />
                    ) : (
                      <AlertCircle className="w-9 h-9 text-amber-500" />
                    )}
                  </motion.div>
                  <p className="text-lg font-bold text-foreground">
                    {result.successCount}/{result.totalAttempted} teams transferred
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {result.failCount > 0 && `${result.failCount} failed · `}
                    {mode === "direct"
                      ? "Tap links below to open in Dream11"
                      : "Teams sent to your linked account"}
                  </p>
                </div>

                {/* Transfer links (direct mode) */}
                {mode === "direct" && result.transferLinks.filter((l) => l.link).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-foreground">
                      Transfer Links ({result.transferLinks.filter((l) => l.link).length}):
                    </p>
                    <div className="max-h-64 overflow-y-auto scrollbar-thin space-y-1.5">
                      {result.transferLinks
                        .filter((l) => l.link)
                        .map((l) => (
                          <a
                            key={l.teamNo}
                            href={l.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between p-2.5 rounded-lg border border-violet-100 dark:border-violet-900/30 bg-white dark:bg-card hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
                          >
                            <span className="text-xs font-bold text-foreground">
                              Team #{l.teamNo}
                            </span>
                            <span className="flex items-center gap-1 text-[11px] font-semibold text-violet-600 dark:text-violet-300">
                              Open Dream11
                              <ExternalLink className="w-3 h-3" />
                            </span>
                          </a>
                        ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground text-center pt-1">
                      💡 Each link opens Dream11 with the team pre-loaded. Tap to transfer.
                    </p>
                  </div>
                )}

                {/* Failed teams */}
                {result.failCount > 0 && (
                  <div className="rounded-xl bg-red-50 dark:bg-red-950/30 p-3">
                    <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1">
                      Failed teams ({result.failCount}):
                    </p>
                    <div className="max-h-32 overflow-y-auto scrollbar-thin space-y-1">
                      {result.results
                        .filter((r) => !r.success)
                        .slice(0, 10)
                        .map((r) => (
                          <p key={r.teamNo} className="text-[11px] text-red-600 dark:text-red-400">
                            Team #{r.teamNo}: {r.message || "Unknown error"}
                          </p>
                        ))}
                    </div>
                    {result.failCount > 10 && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        ...and {result.failCount - 10} more
                      </p>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={onClose}>
                    Close
                  </Button>
                  <Button
                    className="flex-1 brand-gradient text-white"
                    onClick={() => setPhase("select")}
                  >
                    Transfer Again
                  </Button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
