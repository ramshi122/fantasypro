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
  getLinkedAccount,
  getMatchDetail,
  listFantasyTeams,
  saveFantasyToken,
  verifyFantasyAuth,
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
  defaultApp?: FantasyApp;
}

type Mode = "direct" | "linked";
type Phase = "select" | "transferring" | "done";

// Apps supported by the match (from fantasy_version field)
const APP_LABELS: Record<string, { label: string; emoji: string }> = {
  dream11: { label: "Dream11", emoji: "🏏" },
  my11circle: { label: "My11Circle", emoji: "⭕" },
  myteam11: { label: "MyTeam11", emoji: "👥" },
  vision11: { label: "Vision11", emoji: "👁️" },
};

export function BulkTransferModal({
  open,
  onClose,
  match,
  teams,
  onOpenOtpLogin,
  defaultApp,
}: BulkTransferModalProps) {
  const isGuest = useAuth((s) => s.isGuest);
  const [phase, setPhase] = useState<Phase>("select");
  const [mode, setMode] = useState<Mode>("direct");
  const [selectedApp, setSelectedApp] = useState<FantasyApp>("dream11");
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<BulkTransferResult | null>(null);
  const [linkedApps, setLinkedApps] = useState<FantasyApp[]>([]);
  const [existingTeamIds, setExistingTeamIds] = useState<string[]>([]);
  const [matchNumericId, setMatchNumericId] = useState<string>("");
  const [matchDbId, setMatchDbId] = useState<string>("");
  const [supportedApps, setSupportedApps] = useState<string[]>([]);
  // Map: "fixedId|appName" → fantasy player ID for that app
  const [playerIdMap, setPlayerIdMap] = useState<Record<string, string>>({});

  // Refresh linked apps + match detail when modal opens
  useEffect(() => {
    if (!open) return;
    const apps: FantasyApp[] = [];
    for (const a of ["dream11", "my11circle", "myteam11", "vision11"] as FantasyApp[]) {
      if (getFantasyToken(a)) apps.push(a);
    }
    setLinkedApps(apps);

    (async () => {
      const detail = await getMatchDetail((match.matchId ?? match.id ?? "") as string);
      if (!detail) return;
      const d = detail as any;
      setMatchNumericId(String(d.id || match.matchId || match.id || ""));
      setMatchDbId(String(d._id || ""));

      // Detect supported apps from fantasy_version field
      const versions: string[] = (d.fantasy_version || []).map((v: any) => v.name);
      const supported = versions.length > 0 ? versions : ["my11circle"];
      setSupportedApps(supported);

      // ALWAYS use defaultApp if provided
      const chosenApp = defaultApp || (apps.find((a) => supported.includes(a)) as FantasyApp) || (supported[0] as FantasyApp) || "dream11";
      setSelectedApp(chosenApp);

      // Mode selection — ALL apps use "linked" mode (real API transfer)
      // The real flow: auth/verify → list-of-teams → add-team (new) or edit-team (replace)
      // This requires OTP login to get the auth token, which is then sent in the body (no Bearer)
      setMode("linked");

      // Build player ID map for ALL apps (not just supported ones)
      // so Dream11 transfer works even on My11Circle-only matches
      const allApps = Array.from(new Set([...supported, "dream11", "my11circle", chosenApp]));
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
        // Map IDs for every possible app
        for (const app of allApps) {
          const entry = fil.find((f: any) => f.name === app);
          if (entry?.id) {
            map[`${fixedId}|${app}`] = String(entry.id);
          }
        }
        // Fallback: use fixed_id for any app that doesn't have a specific mapping
        if (fixedId) {
          for (const app of allApps) {
            if (!map[`${fixedId}|${app}`]) {
              map[`${fixedId}|${app}`] = fixedId;
            }
          }
        }
      }
      setPlayerIdMap(map);
    })();
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

  function buildTransferItems(app: FantasyApp): BulkTransferItem[] {
    return validTeams.map((t) => ({
      teamNo: t.teamNo ?? 0,
      playerIds: (t.players || [])
        .map((p) => {
          const fixedId = String(p.player_fixed_id ?? p.pl_id ?? p.pid ?? "");
          return playerIdMap[`${fixedId}|${app}`] || fixedId;
        })
        .filter(Boolean),
      captainId: (() => {
        const capFixedId = String(t.captain ?? t.c ?? "");
        return playerIdMap[`${capFixedId}|${app}`] || capFixedId;
      })(),
      viceCaptainId: (() => {
        const vcFixedId = String(t.viceCaptain ?? t.vc ?? t.vicecaptain ?? "");
        return playerIdMap[`${vcFixedId}|${app}`] || vcFixedId;
      })(),
    }));
  }

  async function handleTransfer() {
    const items = buildTransferItems(selectedApp);
    if (items.length === 0) {
      toast.error("No valid teams to transfer (need 11 players each)");
      return;
    }
    setPhase("transferring");
    setProgress({ done: 0, total: items.length });

    try {
      let res: BulkTransferResult;
      if (mode === "direct") {
        // Direct link generation for Dream11
        res = await bulkDirectTransfer(items, matchNumericId, matchDbId, (done, total) =>
          setProgress({ done, total })
        );

        // If replace mode, modify the links to use Dream11's edit-team URL
        // Dream11 edit URL: https://dream11.com/team/edit?matchId=XXX&teamNo=N&players=...&captain=...&vicecaptain=...
        if (replaceExisting) {
          res.transferLinks = res.transferLinks.map((l, i) => ({
            ...l,
            link: l.link
              ? l.link.replace("/team/create?", `/team/edit?teamNo=${i + 1}&`)
              : l.link,
          }));
        }
      } else {
        // Linked account transfer — Step 1: Verify auth token first
        const account = getLinkedAccount(selectedApp);
        if (!account) {
          toast.error(`${APP_LABELS[selectedApp]?.label} account not linked`);
          onOpenOtpLogin();
          setPhase("select");
          return;
        }

        // Step 1: Verify auth token via /api/fantasy/auth/verify
        setProgress({ done: 0, total: items.length });
        try {
          const verifyRes = await verifyFantasyAuth({
            fantasyApp: selectedApp,
            authToken: account.token,
            matchId: matchNumericId,
          });
          if (!verifyRes.validToken) {
            // Token is invalid/expired — stop and prompt relink
            toast.error("Your session expired. Relink via OTP to continue.");
            setResult({
              totalAttempted: items.length,
              successCount: 0,
              failCount: items.length,
              results: items.map((it) => ({ teamNo: it.teamNo, success: false, message: "Auth token expired — relink via OTP" })),
              transferLinks: items.map((it) => ({ teamNo: it.teamNo })),
            });
            setPhase("done");
            return;
          }
          // If backend returned a new token, update it
          if (verifyRes.updateUiToken && verifyRes.authToken) {
            saveFantasyToken(selectedApp, verifyRes.authToken, {
              mobile: account.mobile || undefined,
              my11circleChallenge: account.my11circleChallenge || undefined,
              my11circleUserId: account.my11circleUserId || undefined,
            });
            account.token = verifyRes.authToken;
          }
        } catch {
          // If verify fails (network), continue anyway — the add-team call will also fail if token is bad
        }

        // Step 2 (replace mode): Fetch existing teams via /api/fantasy/list-of-teams
        let existingIds: string[] | undefined;
        if (replaceExisting) {
          try {
            const existing = await listFantasyTeams({
              fantasyApp: selectedApp,
              authToken: account.token,
              matchId: matchNumericId,
            });
            existingIds = existing
              .map((t) => String(t.team_id ?? t.teamId ?? ""))
              .filter(Boolean);
          } catch {
            // ignore — will create new
          }
        }

        res = await bulkTransferToLinkedAccount(
          items,
          {
            matchId: matchNumericId,
            fantasyApp: selectedApp,
            authToken: account.token,
            sportIndex: 0,
            my11circleChallenge: account.my11circleChallenge || undefined,
            my11circleUserId: account.my11circleUserId || undefined,
            mobileNumber: account.mobile || undefined,
            replaceMode: replaceExisting,
            existingTeamIds: existingIds,
          },
          (done, total) => setProgress({ done, total })
        );
      }

      setResult(res);
      setPhase("done");

      if (res.successCount > 0 && res.failCount === 0) {
        // All succeeded — mark teams as transferred locally
        markTeamsTransferred();
        toast.success(`Transferred ${res.successCount}/${res.totalAttempted} teams to ${APP_LABELS[selectedApp]?.label || selectedApp}`);
      } else if (res.successCount > 0) {
        // Partial success
        toast.success(`${res.successCount} transferred, ${res.failCount} failed`);
      } else {
        // All failed — show honest error
        if (mode === "direct") {
          toast.error("Dream11 transfer failed — this match may not support Dream11. Try My11Circle instead.");
        } else {
          toast.error("Transfer failed — relink your account via OTP");
        }
      }
    } catch (err: any) {
      setResult({
        totalAttempted: items.length,
        successCount: 0,
        failCount: items.length,
        results: items.map((it) => ({ teamNo: it.teamNo, success: false, message: err?.message || "Network error" })),
        transferLinks: items.map((it) => ({ teamNo: it.teamNo })),
      });
      setPhase("done");
      toast.error("Transfer failed — check your connection and try again");
    }
  }

  // Mark successfully transferred teams in localStorage so they show "Sent" badge
  function markTeamsTransferred() {
    try {
      const all = JSON.parse(localStorage.getItem("fantasypro-local-teams") || "{}");
      const key = String(matchNumericId);
      const list = all[key] || [];
      for (const t of list) {
        t.transferred = true;
        t.transferStatus = "transferred";
      }
      all[key] = list;
      localStorage.setItem("fantasypro-local-teams", JSON.stringify(all));
    } catch {}
  }

  // App selector for linked mode
  // For linked mode: allow if the SELECTED app is linked
  const canUseLinked = linkedApps.includes(selectedApp);
  // Direct mode disabled — all transfers use authenticated API (add-team/edit-team)
  const canUseDirect = false;

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
                <h3 className="font-bold text-sm">
                  Transfer to {APP_LABELS[selectedApp]?.label || selectedApp}
                </h3>
                <p className="text-[10px] text-white/80">
                  {validTeams.length} teams ready · {APP_LABELS[selectedApp]?.emoji || ""} {APP_LABELS[selectedApp]?.label || selectedApp}
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
                {/* Supported apps info */}
                <div className="rounded-xl bg-violet-50/50 dark:bg-violet-950/20 p-3 text-xs">
                  <p className="font-semibold text-foreground mb-1">Match compatibility:</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {supportedApps.map((app) => {
                      const isLinked = linkedApps.includes(app as FantasyApp);
                      return (
                        <span
                          key={app}
                          className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-bold",
                            isLinked
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                              : "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
                          )}
                        >
                          {APP_LABELS[app]?.emoji} {APP_LABELS[app]?.label || app}
                          {isLinked ? " ✓" : ""}
                        </span>
                      );
                    })}
                  </div>
                  {linkedApps.length > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-1.5">
                      Linked: {linkedApps.map(a => APP_LABELS[a]?.label || a).join(", ")}
                    </p>
                  )}
                </div>

                {/* Warning: Dream11 not supported for this match */}
                {selectedApp === "dream11" && !supportedApps.includes("dream11") && supportedApps.length > 0 && (
                  <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 p-3 text-xs">
                    <p className="font-bold text-amber-700 dark:text-amber-300 mb-0.5">
                      ⚠️ Dream11 Not Available for This Match
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      This match only supports {supportedApps.map(a => APP_LABELS[a]?.label || a).join(", ")}. Dream11 transfer may fail.
                      Use the ⭕ My11Circle button instead.
                    </p>
                  </div>
                )}

                {/* Mode selection — only authenticated transfer (linked mode) */}
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      if (!linkedApps.includes(selectedApp)) {
                        toast.info(`Link your ${APP_LABELS[selectedApp]?.label || selectedApp} account via OTP first`);
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
                        Auto Transfer to {APP_LABELS[selectedApp]?.label || selectedApp}
                        {linkedApps.includes(selectedApp) ? (
                          <span className="text-[9px] bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 px-1.5 py-0.5 rounded-full font-bold">
                            LINKED ✓
                          </span>
                        ) : (
                          <span className="text-[9px] bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 px-1.5 py-0.5 rounded-full font-bold">
                            REQUIRES OTP
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {linkedApps.includes(selectedApp)
                          ? `Send teams to your ${APP_LABELS[selectedApp]?.label} account via API. Supports replace mode to overwrite existing teams.`
                          : `Link your ${APP_LABELS[selectedApp]?.label || selectedApp} account via OTP to enable real API transfer with replace support.`}
                      </p>
                    </div>
                  </button>
                </div>

                {/* App selector for linked mode — show ALL linked apps */}
                {mode === "linked" && linkedApps.length > 0 && (
                  <div>
                    <label className="text-xs font-semibold text-foreground mb-1.5 block">
                      Transfer to:
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      {linkedApps.map((app) => (
                        <button
                          key={app}
                          onClick={() => setSelectedApp(app)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                            selectedApp === app
                              ? "brand-gradient text-white"
                              : "bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300"
                          )}
                        >
                          {APP_LABELS[app]?.emoji} {APP_LABELS[app]?.label || app}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Replace existing teams toggle — visible for BOTH direct and linked modes */}
                <label className="flex items-center gap-2.5 p-3 rounded-xl border border-violet-100 dark:border-violet-900/30 bg-violet-50/30 dark:bg-violet-950/20 cursor-pointer hover:bg-violet-50/50 dark:hover:bg-violet-900/30 transition-colors">
                  <input
                    type="checkbox"
                    checked={replaceExisting}
                    onChange={(e) => setReplaceExisting(e.target.checked)}
                    className="w-4 h-4 rounded accent-violet-600"
                  />
                  <div className="flex-1">
                    <p className="text-xs font-bold text-foreground">Replace existing teams</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {mode === "direct"
                        ? "Opens Dream11 team editor links so you can overwrite existing teams instead of creating new ones. Useful after lineup changes."
                        : `Overwrite teams already on your ${APP_LABELS[selectedApp]?.label} account instead of creating new ones. Useful after lineup is out.`}
                    </p>
                  </div>
                </label>

                {/* Transfer details */}
                <div className="rounded-xl bg-violet-50/50 dark:bg-violet-950/20 p-3 text-xs">
                  <p className="font-semibold text-foreground mb-1">Transfer details:</p>
                  <ul className="space-y-0.5 text-muted-foreground">
                    <li>• Match: {match.series || match.title || matchNumericId}</li>
                    <li>• Teams to transfer: {validTeams.length}</li>
                    <li>• Mode: {mode === "direct" ? "Direct link (no login)" : `Auto to ${APP_LABELS[selectedApp]?.label || selectedApp}`}</li>
                    <li>• Action: {replaceExisting ? "Replace existing teams" : "Create new teams"}</li>
                    <li>• Match ID: {mode === "direct" ? matchDbId : matchNumericId}</li>
                  </ul>
                </div>

                {validTeams.length === 0 ? (
                  <div className="text-center py-4 text-sm text-muted-foreground">
                    No valid teams (need 11 players each). Generate teams first.
                  </div>
                ) : (
                  <Button
                    onClick={handleTransfer}
                    disabled={mode === "direct" && !canUseDirect}
                    className="w-full h-12 brand-gradient text-white font-bold disabled:opacity-50"
                  >
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      {replaceExisting
                        ? `Replace ${validTeams.length} Teams on ${APP_LABELS[selectedApp]?.label || selectedApp}`
                        : `Transfer ${validTeams.length} Teams to ${APP_LABELS[selectedApp]?.label || selectedApp}`}
                    </>
                  </Button>
                )}

                {/* Quick link to OTP login */}
                {mode === "linked" && !linkedApps.includes(selectedApp) && (
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
                      : `Sending to your ${APP_LABELS[selectedApp]?.label || selectedApp} account`}
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
                    {result.successCount > 0
                      ? `${result.successCount}/${result.totalAttempted} teams transferred 🎉`
                      : `${result.totalAttempted} teams failed`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {result.successCount > 0 && result.failCount === 0
                      ? (mode === "direct"
                          ? "Tap links below to open in Dream11"
                          : `Successfully sent to your ${APP_LABELS[selectedApp]?.label || selectedApp} account`)
                      : result.successCount > 0
                        ? `${result.failCount} failed — see below`
                        : mode === "direct"
                          ? "Dream11 direct transfer not available for this match"
                          : "Your linked account session is invalid or expired"}
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
                              Team #{l.teamNo} {replaceExisting && "(Replace)"}
                            </span>
                            <span className="flex items-center gap-1 text-[11px] font-semibold text-violet-600 dark:text-violet-300">
                              {replaceExisting ? "Replace on Dream11" : "Open Dream11"}
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
                    <div className="max-h-24 overflow-y-auto scrollbar-thin space-y-1">
                      {result.results
                        .filter((r) => !r.success)
                        .slice(0, 5)
                        .map((r) => (
                          <p key={r.teamNo} className="text-[11px] text-red-600 dark:text-red-400">
                            Team #{r.teamNo}: {r.message || "Backend rejected"}
                          </p>
                        ))}
                    </div>
                    {result.failCount > 5 && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        ...and {result.failCount - 5} more
                      </p>
                    )}
                    {result.failCount === result.totalAttempted && (
                      <div className="mt-3 pt-3 border-t border-red-200 dark:border-red-800">
                        {mode === "direct" ? (
                          <>
                            <p className="text-[11px] font-bold text-red-700 dark:text-red-300 mb-2">
                              ⚠️ Dream11 Transfer Failed
                            </p>
                            <p className="text-[10px] text-muted-foreground mb-2.5">
                              This match may not have Dream11 player IDs mapped. Try My11Circle instead.
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-[11px] font-bold text-red-700 dark:text-red-300 mb-2">
                              ⚠️ Transfer Failed
                            </p>
                            <p className="text-[10px] text-muted-foreground mb-2.5">
                              {result.results[0]?.message?.includes("Proxy returned 400")
                                ? "Dream11 rejected the team (Proxy 400). This usually means: 1) The match hasn't opened for team creation on Dream11 yet, 2) The team composition violates Dream11 rules, or 3) Your session needs refresh. Try again closer to match time or relink via OTP."
                                : result.results[0]?.message?.includes("Auth token expired")
                                  ? "Your linked account session is invalid or expired. Complete OTP login with your real mobile number to get a fresh auth token."
                                  : "The backend rejected the transfer. Try relinking your account via OTP."}
                            </p>
                            <Button
                              size="sm"
                              className="w-full h-8 brand-gradient text-white text-xs"
                              onClick={() => {
                                onClose();
                                onOpenOtpLogin();
                              }}
                            >
                              <Zap className="w-3 h-3 mr-1" />
                              Relink {APP_LABELS[selectedApp]?.label} via OTP
                            </Button>
                          </>
                        )}
                      </div>
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
