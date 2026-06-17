"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  Check,
  CheckCircle2,
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
  bulkTransferToLinkedAccount,
  getLinkedAccount,
  getMatchDetail,
  listFantasyTeams,
  verifyFantasyAuth,
  type BulkTransferItem,
  type BulkTransferResult,
  type FantasyApp,
  type MatchInfo,
  type TeamRow,
} from "@/lib/api";
import { cn } from "@/lib/utils";

const APP_LABELS: Record<string, { label: string; emoji: string }> = {
  dream11: { label: "Dream11", emoji: "🏏" },
  my11circle: { label: "My11Circle", emoji: "⭕" },
  myteam11: { label: "MyTeam11", emoji: "👥" },
  vision11: { label: "Vision11", emoji: "👁️" },
};

const PLATFORM_LIMIT = 11; // Dream11/My11Circle max teams per match

interface ApnaTransferModalProps {
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
}: ApnaTransferModalProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [selectedApp, setSelectedApp] = useState<FantasyApp>(defaultApp);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<BulkTransferResult | null>(null);
  const [matchNumericId, setMatchNumericId] = useState("");
  const [playerIdMap, setPlayerIdMap] = useState<Record<string, string>>({});
  const [existingTeams, setExistingTeams] = useState<Array<{ team_id: string; team_number: number }>>([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set());
  const [isLinked, setIsLinked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validTeams = teams.filter((t) => (t.players?.length || 0) >= 1);
  const availableNewSlots = Math.max(0, PLATFORM_LIMIT - existingTeams.length);

  // Load match detail + existing teams when modal opens
  useEffect(() => {
    if (!open) return;
    const account = getLinkedAccount(defaultApp);
    setIsLinked(!!account);
    setSelectedApp(defaultApp);

    (async () => {
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

      // Build player ID map
      const allApps = Array.from(new Set([...(d.fantasy_version || []).map((v: any) => v.name), "dream11", "my11circle", defaultApp]));
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
      setPlayerIdMap(map);

      // Fetch existing teams on the fantasy platform
      if (account) {
        try {
          const existing = await listFantasyTeams({
            fantasyApp: defaultApp,
            authToken: account.token,
            matchId: String(d.id || match.matchId || match.id || ""),
          });
          setExistingTeams(
            existing.map((t) => ({
              team_id: String(t.team_id ?? t.teamId ?? ""),
              team_number: Number(t.team_number ?? t.teamNo ?? 0),
            })).filter((t) => t.team_id)
          );
        } catch {
          setExistingTeams([]);
        }
      } else {
        setExistingTeams([]);
      }

      setPhase("ready");
    })();
  }, [open, defaultApp, match]);

  useEffect(() => {
    if (!open) {
      setPhase("loading");
      setResult(null);
      setSelectedTeamIds(new Set());
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

  async function handleReplace() {
    const account = getLinkedAccount(selectedApp);
    if (!account) {
      toast.error(`${APP_LABELS[selectedApp]?.label} not linked`);
      onOpenOtpLogin();
      return;
    }

    const items = buildTransferItems();
    const selectedIds = Array.from(selectedTeamIds);
    const teamsToReplace = Math.min(items.length, selectedIds.length);

    if (teamsToReplace === 0) {
      toast.error("Select at least one team to replace");
      return;
    }

    setPhase("transferring");
    setProgress({ done: 0, total: teamsToReplace });

    try {
      // Step 1: Verify auth token
      const verifyRes = await verifyFantasyAuth({
        fantasyApp: selectedApp,
        authToken: account.token,
        matchId: matchNumericId,
      });
      if (!verifyRes.validToken) {
        toast.error("Session expired. Relink via OTP.");
        setResult({
          totalAttempted: teamsToReplace,
          successCount: 0,
          failCount: teamsToReplace,
          results: items.slice(0, teamsToReplace).map((it) => ({ teamNo: it.teamNo, success: false, message: "Auth token expired" })),
          transferLinks: [],
        });
        setPhase("done");
        return;
      }

      // Step 2: Replace selected teams (edit-team)
      const replaceItems = items.slice(0, teamsToReplace);
      const replaceIds = selectedIds.slice(0, teamsToReplace);

      const res = await bulkTransferToLinkedAccount(
        replaceItems,
        {
          matchId: matchNumericId,
          fantasyApp: selectedApp,
          authToken: account.token,
          sportIndex: 0,
          my11circleChallenge: account.my11circleChallenge || undefined,
          my11circleUserId: account.my11circleUserId || undefined,
          mobileNumber: account.mobile || undefined,
          replaceMode: true,
          existingTeamIds: replaceIds,
        },
        (done, total) => setProgress({ done, total })
      );

      setResult(res);
      setPhase("done");
      if (res.successCount > 0) {
        toast.success(`Replaced ${res.successCount} team(s) on ${APP_LABELS[selectedApp]?.label}`);
      } else {
        toast.error("Replace failed — check errors below");
      }
    } catch (err: any) {
      setResult({
        totalAttempted: teamsToReplace,
        successCount: 0,
        failCount: teamsToReplace,
        results: items.slice(0, teamsToReplace).map((it) => ({ teamNo: it.teamNo, success: false, message: err?.message || "Network error" })),
        transferLinks: [],
      });
      setPhase("done");
    }
  }

  async function handleBulkTransfer() {
    const account = getLinkedAccount(selectedApp);
    if (!account) {
      toast.error(`${APP_LABELS[selectedApp]?.label} not linked`);
      onOpenOtpLogin();
      return;
    }

    const items = buildTransferItems();
    const teamsToAdd = Math.min(items.length, availableNewSlots);

    if (teamsToAdd === 0) {
      toast.error("No available slots. Replace existing teams instead.");
      return;
    }

    setPhase("transferring");
    setProgress({ done: 0, total: teamsToAdd });

    try {
      // Step 1: Verify auth token
      const verifyRes = await verifyFantasyAuth({
        fantasyApp: selectedApp,
        authToken: account.token,
        matchId: matchNumericId,
      });
      if (!verifyRes.validToken) {
        toast.error("Session expired. Relink via OTP.");
        setResult({
          totalAttempted: teamsToAdd,
          successCount: 0,
          failCount: teamsToAdd,
          results: items.slice(0, teamsToAdd).map((it) => ({ teamNo: it.teamNo, success: false, message: "Auth token expired" })),
          transferLinks: [],
        });
        setPhase("done");
        return;
      }

      // Step 2: Add new teams (add-team)
      const newItems = items.slice(0, teamsToAdd);
      const res = await bulkTransferToLinkedAccount(
        newItems,
        {
          matchId: matchNumericId,
          fantasyApp: selectedApp,
          authToken: account.token,
          sportIndex: 0,
          my11circleChallenge: account.my11circleChallenge || undefined,
          my11circleUserId: account.my11circleUserId || undefined,
          mobileNumber: account.mobile || undefined,
          replaceMode: false,
        },
        (done, total) => setProgress({ done, total })
      );

      setResult(res);
      setPhase("done");
      if (res.successCount > 0) {
        toast.success(`Added ${res.successCount} new team(s) to ${APP_LABELS[selectedApp]?.label}`);
      } else {
        toast.error("Transfer failed — check errors below");
      }
    } catch (err: any) {
      setResult({
        totalAttempted: teamsToAdd,
        successCount: 0,
        failCount: teamsToAdd,
        results: items.slice(0, teamsToAdd).map((it) => ({ teamNo: it.teamNo, success: false, message: err?.message || "Network error" })),
        transferLinks: [],
      });
      setPhase("done");
    }
  }

  const replaceCount = Math.min(selectedTeamIds.size, validTeams.length);
  const bulkCount = Math.min(validTeams.length, availableNewSlots);

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
          <div className="brand-gradient text-white p-4 flex items-center justify-between sticky top-0 z-10">
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
            {/* Not linked warning */}
            {!isLinked && (
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4 text-center">
                <Lock className="w-10 h-10 mx-auto text-amber-500 mb-2" />
                <p className="text-sm font-bold mb-1">{APP_LABELS[selectedApp]?.label} Not Linked</p>
                <p className="text-xs text-muted-foreground mb-3">
                  Link your {APP_LABELS[selectedApp]?.label} account via OTP to transfer teams.
                  The flow: OTP login → verify token → fetch existing teams → add/edit teams.
                </p>
                <Button className="brand-gradient text-white" onClick={onOpenOtpLogin}>
                  <Zap className="w-4 h-4 mr-2" />
                  Link {APP_LABELS[selectedApp]?.label} via OTP
                </Button>
              </div>
            )}

            {/* When linked but still loading existing teams, show stats with 0 */}
            {isLinked && phase === "loading" && (
              <div className="py-8 text-center">
                <Loader2 className="w-10 h-10 mx-auto text-violet-500 animate-spin mb-3" />
                <p className="text-sm font-semibold">Fetching existing {APP_LABELS[selectedApp]?.label} teams...</p>
                <p className="text-[10px] text-muted-foreground mt-1">Step 1: Verify token → Step 2: List teams</p>
              </div>
            )}

            {/* Ready: APNA-style transfer UI */}
            {isLinked && phase === "ready" && (
              <>
                {/* Stats cards */}
                <div className="grid grid-cols-4 gap-2">
                  <StatCard value={validTeams.length} label="APNA Teams" />
                  <StatCard value={existingTeams.length} label={`${APP_LABELS[selectedApp]?.label || ""} Teams`} />
                  <StatCard value={availableNewSlots} label="New Slots" />
                  <StatCard value={`Up to ${PLATFORM_LIMIT}`} label="Limit" />
                </div>

                {/* Transfer summary */}
                <div className="rounded-xl bg-violet-50 dark:bg-violet-950/20 p-3">
                  <p className="text-xs font-bold text-foreground mb-2 flex items-center gap-1">
                    <Shield className="w-3.5 h-3.5 text-violet-500" />
                    Transfer Summary
                  </p>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Teams to replace (edit)</span>
                      <span className="font-bold text-foreground">{replaceCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Teams to add (new)</span>
                      <span className="font-bold text-foreground">
                        {selectedTeamIds.size > 0 ? 0 : bulkCount}
                      </span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-violet-100 dark:border-violet-900/30">
                      <span className="font-semibold text-foreground">Total to transfer</span>
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
                      <p className="text-xs font-bold text-foreground">Select Existing Teams to Replace</p>
                      <div className="flex gap-2">
                        <button onClick={selectAll} className="text-[10px] font-bold text-violet-600 dark:text-violet-300">Select All</button>
                        <button onClick={deselectAll} className="text-[10px] font-bold text-muted-foreground">Deselect All</button>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground mb-2">{selectedTeamIds.size} selected</p>
                    <div className="max-h-48 overflow-y-auto scrollbar-thin space-y-1.5">
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
                            <span className="text-xs font-semibold text-foreground">
                              Team {t.team_number}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              ID: {t.team_id}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Mode indicator */}
                {selectedTeamIds.size > 0 ? (
                  <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-center">
                    <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
                      {replaceCount} Teams Selected — Replace Mode Active
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Only selected teams will be replaced. Bulk transfer is disabled.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 text-center">
                    <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                      Bulk Transfer Mode — {bulkCount} new teams will be created
                    </p>
                    {existingTeams.length > 0 && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Select teams above to switch to Replace mode
                      </p>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                <div className="space-y-2">
                  {selectedTeamIds.size > 0 ? (
                    <Button
                      className="w-full h-12 bg-orange-500 hover:bg-orange-600 text-white font-bold"
                      onClick={handleReplace}
                      disabled={replaceCount === 0}
                    >
                      <Shield className="w-4 h-4 mr-2" />
                      Replace {replaceCount} Selected Teams
                    </Button>
                  ) : (
                    <Button
                      className="w-full h-12 bg-emerald-500 hover:bg-emerald-600 text-white font-bold"
                      onClick={handleBulkTransfer}
                      disabled={bulkCount === 0}
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Bulk Transfer — {bulkCount} Teams
                    </Button>
                  )}
                </div>

                {/* Free contests CTA */}
                <Button
                  variant="outline"
                  className="w-full h-10 border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-300"
                  onClick={() => toast.info("Use the Free Contests button on the team list")}
                >
                  <Trophy className="w-4 h-4 mr-2" />
                  Join FREE Contests Now
                </Button>
              </>
            )}

            {/* Transferring */}
            {phase === "transferring" && (
              <div className="py-8 text-center">
                <Loader2 className="w-12 h-12 mx-auto text-violet-500 animate-spin mb-3" />
                <p className="text-sm font-bold">Transferring {progress.total} teams...</p>
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
                    <AlertCircle className="w-12 h-12 mx-auto text-amber-500 mb-2" />
                  )}
                  <p className="text-lg font-bold">
                    {result.successCount > 0
                      ? "All Teams Transferred! ✅"
                      : `${result.failCount} teams failed`}
                  </p>
                  {result.successCount > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {result.successCount} Success · Total: {result.totalAttempted}
                    </p>
                  )}
                </div>

                {/* Failed teams */}
                {result.failCount > 0 && (
                  <div className="rounded-xl bg-red-50 dark:bg-red-950/30 p-3">
                    <p className="text-xs font-bold text-red-700 dark:text-red-300 mb-1">
                      Failed teams ({result.failCount}):
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

function StatCard({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="bg-white dark:bg-card rounded-xl p-2 border border-violet-100 dark:border-violet-900/30 text-center">
      <p className="text-lg font-black text-foreground">{value}</p>
      <p className="text-[8px] text-muted-foreground font-semibold uppercase tracking-wide">{label}</p>
    </div>
  );
}
