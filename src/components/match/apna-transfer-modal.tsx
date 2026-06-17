"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Loader2,
  Lock,
  RefreshCw,
  Send,
  Shield,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  bulkTransferToLinkedAccount,
  getLinkedAccount,
  getMatchDetail,
  listFantasyTeams,
  saveFantasyToken,
  verifyFantasyAuth,
  type BulkTransferItem,
  type BulkTransferResult,
  type FantasyApp,
  type MatchInfo,
  type TeamRow,
} from "@/lib/api";
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
  onOpenOtpLogin: () => void;
}

type Phase = "loading" | "ready" | "transferring" | "done";

export function ApnaTransferModal({
  open,
  onClose,
  match,
  teams,
  defaultApp,
  onOpenOtpLogin,
}: TransferModalProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [selectedApp, setSelectedApp] = useState<FantasyApp>(defaultApp);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<BulkTransferResult | null>(null);
  const [matchNumericId, setMatchNumericId] = useState("");
  const [matchDbId, setMatchDbId] = useState("");
  const [playerIdMap, setPlayerIdMap] = useState<Record<string, string>>({});
  const [existingTeams, setExistingTeams] = useState<Array<{ team_id: string; team_number: number }>>([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set());
  const [isLinked, setIsLinked] = useState(false);
  const [linkedMobile, setLinkedMobile] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const validTeams = teams.filter((t) => (t.players?.length || 0) >= 1);
  const availableNewSlots = Math.max(0, PLATFORM_LIMIT - existingTeams.length);
  const replaceCount = Math.min(selectedTeamIds.size, validTeams.length);
  const bulkCount = Math.min(validTeams.length, availableNewSlots);

  // Load match detail + existing teams when modal opens
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedApp(defaultApp);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResult(null);

    const account = getLinkedAccount(defaultApp);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLinked(!!account);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLinkedMobile(account?.mobile || "");

    (async () => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase("loading");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(null);

      const detail = await getMatchDetail((match.matchId ?? match.id ?? "") as string);
      if (!detail) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setError("Could not load match data");
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPhase("ready");
        return;
      }
      const d = detail as any;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMatchNumericId(String(d.id || match.matchId || match.id || ""));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMatchDbId(String(d._id || ""));

      // Build player ID map
      const allApps = ["dream11", "my11circle"];
      const map: Record<string, string> = {};
      const all = [...(d.left_team_players || []), ...(d.right_team_players || [])].filter(Boolean);
      for (const p of all) {
        let player = p;
        if (typeof p === "string") {
          const { decrypt } = await import("@/lib/crypto");
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlayerIdMap(map);

      // Fetch existing teams on the fantasy platform (requires OTP token)
      if (account) {
        try {
          const existing = await listFantasyTeams({
            fantasyApp: defaultApp,
            authToken: account.token,
            matchId: String(d.id || match.matchId || match.id || ""),
          });
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setExistingTeams(
            existing.map((t) => ({
              team_id: String(t.team_id ?? t.teamId ?? ""),
              team_number: Number(t.team_number ?? t.teamNo ?? 0),
            })).filter((t) => t.team_id)
          );
        } catch {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setExistingTeams([]);
        }
      } else {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setExistingTeams([]);
      }

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase("ready");
    })();
  }, [open, defaultApp, match]);

  useEffect(() => {
    if (!open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase("loading");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResult(null);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedTeamIds(new Set());
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  function toggleTeamSelect(teamId: string) {
    const next = new Set(selectedTeamIds);
    if (next.has(teamId)) next.delete(teamId);
    else next.add(teamId);
    setSelectedTeamIds(next);
  }

  function selectAll() {
    setSelectedTeamIds(new Set(existingTeams.map((t) => t.team_id)));
  }

  function deselectAll() {
    setSelectedTeamIds(new Set());
  }

  async function handleTransfer() {
    const account = getLinkedAccount(selectedApp);
    if (!account) {
      toast.error(`Link your ${APP_LABELS[selectedApp]?.label} account via OTP first`);
      onOpenOtpLogin();
      return;
    }

    const items = buildTransferItems();
    const isReplace = selectedTeamIds.size > 0;
    const selectedIds = Array.from(selectedTeamIds);
    const teamsToSend = isReplace ? Math.min(items.length, selectedIds.length) : Math.min(items.length, availableNewSlots);

    if (teamsToSend === 0) {
      toast.error(isReplace ? "Select teams to replace" : "No available slots");
      return;
    }

    setPhase("transferring");
    setProgress({ done: 0, total: teamsToSend });

    try {
      const sendItems = items.slice(0, teamsToSend);
      const sendIds = isReplace ? selectedIds.slice(0, teamsToSend) : undefined;

      const res = await bulkTransferToLinkedAccount(
        sendItems,
        {
          matchId: matchNumericId,
          fantasyApp: selectedApp,
          authToken: account.token,
          sportIndex: 0,
          my11circleChallenge: account.my11circleChallenge || undefined,
          my11circleUserId: account.my11circleUserId || undefined,
          mobileNumber: account.mobile || undefined,
          replaceMode: isReplace,
          existingTeamIds: sendIds,
        },
        (done, total) => setProgress({ done, total })
      );

      setResult(res);
      setPhase("done");
      if (res.successCount > 0) {
        toast.success(`${res.successCount}/${res.totalAttempted} teams transferred to ${APP_LABELS[selectedApp]?.label}`);
      } else {
        toast.error("Transfer failed — relink via OTP");
      }
    } catch (err: any) {
      setResult({
        totalAttempted: teamsToSend,
        successCount: 0,
        failCount: teamsToSend,
        results: items.slice(0, teamsToSend).map((it) => ({ teamNo: it.teamNo, success: false, message: err?.message || "Network error" })),
        transferLinks: [],
      });
      setPhase("done");
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
                  {validTeams.length} teams ready · Match {matchNumericId}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* NOT LINKED — show OTP login prompt */}
            {!isLinked && phase !== "loading" && (
              <div className="text-center py-6">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center mb-3">
                  <Lock className="w-8 h-8 text-amber-500" />
                </div>
                <p className="text-sm font-bold mb-1">{APP_LABELS[selectedApp]?.label} Not Linked</p>
                <p className="text-xs text-muted-foreground mb-4 px-4">
                  OTP login is required to transfer teams. Link your {APP_LABELS[selectedApp]?.label} account with your real mobile number to get an auth token.
                  The token is used to call the {APP_LABELS[selectedApp]?.label} API directly.
                </p>
                <Button className="brand-gradient text-white" onClick={onOpenOtpLogin}>
                  <Zap className="w-4 h-4 mr-2" />
                  Link {APP_LABELS[selectedApp]?.label} via OTP
                </Button>
              </div>
            )}

            {/* Loading */}
            {isLinked && phase === "loading" && (
              <div className="py-8 text-center">
                <Loader2 className="w-10 h-10 mx-auto text-violet-500 animate-spin mb-3" />
                <p className="text-sm font-semibold">Fetching {APP_LABELS[selectedApp]?.label} teams...</p>
                <p className="text-[10px] text-muted-foreground mt-1">Linked: {linkedMobile}</p>
              </div>
            )}

            {/* Ready — APNA transfer UI */}
            {isLinked && phase === "ready" && (
              <>
                {/* Linked status */}
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                      {APP_LABELS[selectedApp]?.label} Linked — {linkedMobile}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Token active · One-time OTP login</p>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-4 gap-2">
                  <StatCard value={validTeams.length} label="APNA" />
                  <StatCard value={existingTeams.length} label="Platform" />
                  <StatCard value={availableNewSlots} label="Slots" />
                  <StatCard value={`Max ${PLATFORM_LIMIT}`} label="Limit" />
                </div>

                {/* Transfer summary */}
                <div className="rounded-xl bg-violet-50 dark:bg-violet-950/20 p-3">
                  <p className="text-xs font-bold text-foreground mb-2 flex items-center gap-1">
                    <Shield className="w-3.5 h-3.5 text-violet-500" />
                    Transfer Summary
                  </p>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Replace (edit)</span>
                      <span className="font-bold text-foreground">{selectedTeamIds.size > 0 ? replaceCount : 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Add (new)</span>
                      <span className="font-bold text-foreground">{selectedTeamIds.size > 0 ? 0 : bulkCount}</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-violet-100 dark:border-violet-900/30">
                      <span className="font-semibold text-foreground">Total</span>
                      <span className="font-bold text-violet-600 dark:text-violet-300">
                        {selectedTeamIds.size > 0 ? replaceCount : bulkCount}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Existing teams to replace */}
                {existingTeams.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-foreground">Replace Existing Teams</p>
                      <div className="flex gap-2">
                        <button onClick={selectAll} className="text-[10px] font-bold text-violet-600 dark:text-violet-300">Select All</button>
                        <button onClick={deselectAll} className="text-[10px] font-bold text-muted-foreground">Deselect</button>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground mb-2">{selectedTeamIds.size} selected</p>
                    <div className="max-h-40 overflow-y-auto scrollbar-thin space-y-1.5">
                      {existingTeams.map((t) => {
                        const isSelected = selectedTeamIds.has(t.team_id);
                        return (
                          <button
                            key={t.team_id}
                            onClick={() => toggleTeamSelect(t.team_id)}
                            className={cn(
                              "w-full flex items-center gap-2.5 p-2.5 rounded-lg border-2 transition-all",
                              isSelected
                                ? "border-violet-400 bg-violet-50/50 dark:bg-violet-900/20"
                                : "border-violet-100 dark:border-violet-900/30"
                            )}
                          >
                            <div className={cn(
                              "w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0",
                              isSelected ? "brand-gradient border-transparent" : "border-violet-200 dark:border-violet-800"
                            )}>
                              {isSelected && <Check className="w-3 h-3 text-white" />}
                            </div>
                            <span className="text-xs font-semibold">Team {t.team_number}</span>
                            <span className="text-[10px] text-muted-foreground">ID: {t.team_id}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Mode banner */}
                {selectedTeamIds.size > 0 ? (
                  <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-center">
                    <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
                      {replaceCount} Teams Selected — Replace Mode
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Selected teams will be replaced via /api/fantasy/edit-team
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 text-center">
                    <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                      Bulk Mode — {bulkCount} new teams via /api/fantasy/add-team
                    </p>
                    {existingTeams.length > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Select teams above to switch to Replace mode
                      </p>
                    )}
                  </div>
                )}

                {/* Transfer button */}
                <Button
                  className="w-full h-12 brand-gradient text-white font-bold"
                  onClick={handleTransfer}
                  disabled={selectedTeamIds.size > 0 ? replaceCount === 0 : bulkCount === 0}
                >
                  <Send className="w-4 h-4 mr-2" />
                  {selectedTeamIds.size > 0
                    ? `Replace ${replaceCount} Teams`
                    : `Transfer ${bulkCount} New Teams`}
                </Button>
              </>
            )}

            {/* Transferring */}
            {phase === "transferring" && (
              <div className="py-8 text-center">
                <Loader2 className="w-12 h-12 mx-auto text-violet-500 animate-spin mb-3" />
                <p className="text-sm font-bold">Transferring to {APP_LABELS[selectedApp]?.label}...</p>
                <p className="text-xs text-muted-foreground mt-1">POST /api/fantasy/add-team or /edit-team</p>
                <div className="mt-3 h-2 bg-violet-50 dark:bg-violet-900/30 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full brand-gradient"
                    animate={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">{progress.done}/{progress.total}</p>
              </div>
            )}

            {/* Done */}
            {phase === "done" && result && (
              <div className="space-y-3">
                <div className={cn(
                  "rounded-xl p-4 text-center",
                  result.successCount > 0 ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30"
                )}>
                  {result.successCount > 0 ? (
                    <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600 mb-2" />
                  ) : (
                    <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-2" />
                  )}
                  <p className="text-lg font-bold">
                    {result.successCount > 0
                      ? `${result.successCount}/${result.totalAttempted} transferred 🎉`
                      : `${result.failCount} teams failed`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {result.successCount > 0
                      ? `Teams sent to ${APP_LABELS[selectedApp]?.label} via API`
                      : "Backend rejected — check token or relink"}
                  </p>
                </div>

                {/* Failed teams */}
                {result.failCount > 0 && (
                  <div className="rounded-xl bg-red-50 dark:bg-red-950/30 p-3">
                    <p className="text-xs font-bold text-red-700 dark:text-red-300 mb-1">
                      Failed ({result.failCount}):
                    </p>
                    <div className="max-h-24 overflow-y-auto scrollbar-thin space-y-1">
                      {result.results.filter((r) => !r.success).slice(0, 5).map((r) => (
                        <p key={r.teamNo} className="text-[11px] text-red-600 dark:text-red-400">
                          Team #{r.teamNo}: {r.message || "Failed"}
                        </p>
                      ))}
                    </div>
                    {result.failCount === result.totalAttempted && (
                      <div className="mt-3 pt-3 border-t border-red-200 dark:border-red-800">
                        <Button
                          size="sm"
                          className="w-full h-8 brand-gradient text-white text-xs"
                          onClick={() => { onClose(); onOpenOtpLogin(); }}
                        >
                          <Zap className="w-3 h-3 mr-1" />
                          Relink {APP_LABELS[selectedApp]?.label} via OTP
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={onClose}>Close</Button>
                  <Button className="flex-1 brand-gradient text-white" onClick={() => setPhase("ready")}>
                    Transfer Again
                  </Button>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl bg-red-50 dark:bg-red-950/30 p-3 text-xs text-red-600">{error}</div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function StatCard({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="bg-white dark:bg-card rounded-xl p-2 border border-violet-100 dark:border-violet-900/30 text-center">
      <p className="text-lg font-black text-foreground">{value}</p>
      <p className="text-[8px] text-muted-foreground font-semibold uppercase">{label}</p>
    </div>
  );
}
