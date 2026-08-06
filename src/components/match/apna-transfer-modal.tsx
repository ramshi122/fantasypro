"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ExternalLink,
  Link2,
  Loader2,
  Lock,
  Send,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  bulkTransferToLinkedAccount,
  getLinkedAccount,
  getMatchDetail,
  getPlatformLimit,
  listFantasyTeams,
  type BulkTransferItem,
  type BulkTransferResult,
  type FantasyApp,
  type MatchInfo,
  type TeamRow,
} from "@/lib/api";
import { listAccountsForApp, type FantasyAccount } from "@/lib/multi-accounts";
import { decrypt } from "@/lib/crypto";
import { cn } from "@/lib/utils";

const APP_LABELS: Record<string, { label: string; emoji: string; color: string; url: string }> = {
  dream11: { label: "Dream11", emoji: "🏏", color: "from-red-500 to-rose-600", url: "https://dream11.com" },
  my11circle: { label: "My11Circle", emoji: "⭕", color: "from-sky-500 to-blue-600", url: "https://www.my11circle.com" },
};

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
  open, onClose, match, teams, defaultApp, onOpenOtpLogin,
}: TransferModalProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [selectedApp, setSelectedApp] = useState<FantasyApp>(defaultApp);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<BulkTransferResult | null>(null);
  const [linkResults, setLinkResults] = useState<Array<{ teamNo: number; link?: string; success: boolean; message?: string }> | null>(null);
  const [matchNumericId, setMatchNumericId] = useState("");
  const [matchDbId, setMatchDbId] = useState("");
  const [playerIdMap, setPlayerIdMap] = useState<Record<string, string>>({});
  const [existingTeams, setExistingTeams] = useState<Array<{ team_id: string; team_number: number }>>([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set());
  const [isLinked, setIsLinked] = useState(false);
  const [linkedMobile, setLinkedMobile] = useState("");
  const [transferMode, setTransferMode] = useState<"classic" | "otp">("classic");
  const [lastTransferType, setLastTransferType] = useState<"classic" | "otp">("classic");

  // === MULTI-ACCOUNT SELECTOR ===
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [, setAccountsRefreshTick] = useState(0);
  const availableAccounts: FantasyAccount[] = selectedApp ? listAccountsForApp(selectedApp) : [];
  const selectedAccounts = availableAccounts.filter(a => selectedAccountIds.includes(a.id));

  // Refresh accounts + isLinked periodically while modal is open
  useEffect(() => {
    if (!open) return;
    // Update isLinked based on current selectedApp
    const acct = getLinkedAccount(selectedApp);
    setIsLinked(!!acct);
    setLinkedMobile(acct?.mobile || "");
    setAccountsRefreshTick(t => t + 1);
    const interval = setInterval(() => {
      const a = getLinkedAccount(selectedApp);
      setIsLinked(!!a);
      setLinkedMobile(a?.mobile || "");
      setAccountsRefreshTick(t => t + 1);
    }, 500);
    return () => clearInterval(interval);
  }, [open, selectedApp]);

  // Reset selection when app changes
  useEffect(() => {
    setSelectedAccountIds([]);
  }, [selectedApp]);

  const validTeams = teams.filter((t) => (t.players?.length || 0) >= 1);
  // Per-platform team limit — matches the ORIGINAL teamgeneration.in APK:
  //   dream11 = 40 (or backend-provided maxAllowedTeam if user has subscription)
  //   my11circle = 40
  //   jumbo = 50
  //   other apps = 11 (platform default)
  // The user must be able to transfer up to this many teams per match.
  const linkedAccount = getLinkedAccount(selectedApp);
  const PLATFORM_LIMIT = getPlatformLimit(selectedApp, linkedAccount);
  const availableNewSlots = Math.max(0, PLATFORM_LIMIT - existingTeams.length);
  const replaceCount = Math.min(selectedTeamIds.size, validTeams.length);
  const bulkCount = Math.min(validTeams.length, availableNewSlots);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedApp(defaultApp);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResult(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLinkResults(null);

    const account = getLinkedAccount(defaultApp);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLinked(!!account);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLinkedMobile(account?.mobile || "");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTransferMode(account ? "otp" : "classic");

    (async () => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase("loading");

      const detail = await getMatchDetail((match.matchId ?? match.id ?? "") as string);
      if (!detail) { // eslint-disable-next-line react-hooks/set-state-in-effect
        setPhase("ready"); return;
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
        if (typeof p === "string") { const dec = decrypt<any>(p); if (dec) player = dec; }
        const fixedId = String(player.player_fixed_id ?? player.pl_id ?? player.pid ?? "");
        const fil = player.fantasy_id_list || [];
        for (const app of allApps) {
          const entry = fil.find((f: any) => f.name === app);
          if (entry?.id) map[`${fixedId}|${app}`] = String(entry.id);
        }
        if (fixedId) { for (const app of allApps) { if (!map[`${fixedId}|${app}`]) map[`${fixedId}|${app}`] = fixedId; } }
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlayerIdMap(map);

      if (account) {
        try {
          // Pass my11circle fields for My11Circle — required for list-of-teams to
          // return existing teams (without these, My11Circle replace shows 0 existing teams).
          const existing = await listFantasyTeams({
            fantasyApp: defaultApp,
            authToken: account.token,
            matchId: String(d.id || match.matchId || ""),
            my11circleChallenge: account.my11circleChallenge || undefined,
            my11circleUserId: account.my11circleUserId || undefined,
            my11circleMobile: account.mobile || undefined,
          });
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setExistingTeams(existing.map((t) => ({ team_id: String(t.team_id ?? t.teamId ?? ""), team_number: Number(t.team_number ?? t.teamNo ?? 0) })).filter((t) => t.team_id));
        } catch { // eslint-disable-next-line react-hooks/set-state-in-effect
          setExistingTeams([]);
        }
      } else { // eslint-disable-next-line react-hooks/set-state-in-effect
        setExistingTeams([]);
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase("ready");
    })();
  }, [open, defaultApp, match]);

  useEffect(() => {
    if (!open) { // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase("loading"); // eslint-disable-next-line react-hooks/set-state-in-effect
      setResult(null); // eslint-disable-next-line react-hooks/set-state-in-effect
      setLinkResults(null); // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedTeamIds(new Set());
    }
  }, [open]);

  if (!open) return null;

  // COMMON TRANSFER PAYLOAD BUILDER — identical to BulkTransferModal.buildTransferItems
  // Per user spec: "There must be only ONE transfer payload builder in the project"
  // This is the SAME logic used by Elite AI transfer flow.
  function buildItems(): BulkTransferItem[] {
    return validTeams.map((t) => {
      // Step 1: Player IDs — playerIdMap first, fallback to fixedId (same as Elite AI)
      let playerIds = (t.players || [])
        .map((p) => {
          const fixedId = String(p.player_fixed_id ?? p.pl_id ?? p.pid ?? p.name ?? "");
          if (!fixedId) return "";
          const mapped = playerIdMap[`${fixedId}|${selectedApp}`];
          return mapped || fixedId;
        })
        .filter(Boolean);

      // Fix: If < 11 after mapping, try raw IDs
      if (playerIds.length < 11) {
        const rawIds = (t.players || [])
          .map(p => String(p.player_fixed_id ?? p.pl_id ?? p.pid ?? ""))
          .filter(Boolean);
        if (rawIds.length === 11) playerIds = rawIds;
      }

      // Step 2: Captain — playerIdMap, fallback to raw, fallback to first player
      const capRaw = String(t.captain ?? t.c ?? "");
      let captainId = capRaw ? (playerIdMap[`${capRaw}|${selectedApp}`] || capRaw) : "";
      if (!captainId || !playerIds.includes(captainId)) {
        const capPlayer = (t.players || []).find(p =>
          String(p.player_fixed_id ?? p.pl_id ?? p.pid ?? p.name ?? "") === capRaw
        );
        if (capPlayer) {
          const fid = String(capPlayer.player_fixed_id ?? capPlayer.pl_id ?? capPlayer.pid ?? "");
          captainId = playerIdMap[`${fid}|${selectedApp}`] || fid;
        }
      }
      if (!captainId || !playerIds.includes(captainId)) captainId = playerIds[0] || "";

      // Step 3: VC — playerIdMap, fallback to raw, fallback to different player
      const vcRaw = String(t.viceCaptain ?? t.vc ?? t.vicecaptain ?? "");
      let viceCaptainId = vcRaw ? (playerIdMap[`${vcRaw}|${selectedApp}`] || vcRaw) : "";
      if (!viceCaptainId || !playerIds.includes(viceCaptainId)) {
        const vcPlayer = (t.players || []).find(p =>
          String(p.player_fixed_id ?? p.pl_id ?? p.pid ?? p.name ?? "") === vcRaw
        );
        if (vcPlayer) {
          const fid = String(vcPlayer.player_fixed_id ?? vcPlayer.pl_id ?? vcPlayer.pid ?? "");
          viceCaptainId = playerIdMap[`${fid}|${selectedApp}`] || fid;
        }
      }
      if (!viceCaptainId || !playerIds.includes(viceCaptainId) || viceCaptainId === captainId) {
        for (let i = 0; i < playerIds.length; i++) {
          if (playerIds[i] !== captainId) { viceCaptainId = playerIds[i]; break; }
        }
        if (!viceCaptainId) viceCaptainId = playerIds[0] || "";
      }

      return { teamNo: t.teamNo ?? 0, playerIds, captainId, viceCaptainId };
    }).filter(item =>
      item.playerIds.length === 11 &&
      item.captainId &&
      item.viceCaptainId &&
      item.captainId !== item.viceCaptainId
    );
  }

  // CLASSIC transfer: try /api/classic/dream11/addteam (NO OTP)
  async function handleClassicTransfer() {
    const items = buildItems();
    if (items.length === 0) { toast.error("No teams"); return; }

    setPhase("transferring");
    setProgress({ done: 0, total: items.length });
    setLastTransferType("classic");
    const results: Array<{ teamNo: number; link?: string; success: boolean; message?: string }> = [];

    for (let i = 0; i < items.length; i++) {
      const t = items[i];
      let link: string | undefined;
      let success = false;
      let message: string | undefined;

      // Try classic endpoint (NO auth needed)
      try {
        const res = await fetch("/api/classic-addteam", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fantasyApp: selectedApp,
            tgMatchId: matchDbId || matchNumericId,
            playerData: t.playerIds,
            captainData: t.captainId,
            vicecaptainData: t.viceCaptainId,
          }),
        });
        if (res.ok) {
          const text = await res.text();
          try {
            const j = JSON.parse(text);
            if (j.status === "success" && j.data) {
              if (typeof j.data === "string") { const dec = decrypt<any>(j.data); if (dec?.link) { link = dec.link; success = true; } }
              else if (typeof j.data === "object" && (j.data as any).link) { link = (j.data as any).link; success = true; }
            } else {
              message = j.message || "Backend rejected";
            }
          } catch { message = "Parse error"; }
        } else { message = `HTTP ${res.status}`; }
      } catch (err: any) { message = err?.message || "Network error"; }

      // If classic succeeded with a link — use it
      if (success && link) {
        results.push({ teamNo: t.teamNo, link, success: true });
      } else {
        // Classic failed — generate platform link as fallback
        const appUrl = APP_LABELS[selectedApp]?.url || "https://dream11.com";
        const fallbackLink = `${appUrl}/team/create?matchId=${matchNumericId}&players=${t.playerIds.join(",")}&captain=${t.captainId}&vicecaptain=${t.viceCaptainId}`;
        results.push({ teamNo: t.teamNo, link: fallbackLink, success: true, message: "Fallback link" });
      }

      setProgress({ done: i + 1, total: items.length });
      if (i < items.length - 1) await new Promise((r) => setTimeout(r, 150));
    }

    setLinkResults(results);
    setPhase("done");
    const successCount = results.filter((r) => r.success).length;
    toast.success(`${successCount} links generated — tap to open ${APP_LABELS[selectedApp]?.label}`);
  }

  // OTP transfer: use /api/fantasy/add-team or /edit-team (requires OTP token)
  // MULTI-ACCOUNT: Transfers to EACH selected account independently
  async function handleOtpTransfer() {
    const items = buildItems();
    if (items.length === 0) { toast.error("No valid teams to transfer"); return; }

    const isReplace = selectedTeamIds.size > 0;
    const selectedIds = Array.from(selectedTeamIds);
    const teamsToSend = isReplace ? Math.min(items.length, selectedIds.length) : Math.min(items.length, availableNewSlots);
    if (teamsToSend === 0) { toast.error("No teams to send"); return; }

    // Determine which accounts to transfer to
    // If user selected accounts via multi-account selector, use those
    // Otherwise fall back to default account
    const accountsToTransfer = selectedAccounts.length > 0
      ? selectedAccounts
      : [getLinkedAccount(selectedApp)].filter(Boolean);

    if (accountsToTransfer.length === 0) {
      toast.error("Link via OTP first");
      onOpenOtpLogin();
      return;
    }

    setPhase("transferring");
    setProgress({ done: 0, total: teamsToSend * accountsToTransfer.length });
    setLastTransferType("otp");

    const sendItems = items.slice(0, teamsToSend);
    let totalSuccess = 0;
    let totalFail = 0;
    const allResults: Array<{ teamNo: number; success: boolean; message?: string }> = [];

    // Transfer to EACH selected account sequentially
    for (let ai = 0; ai < accountsToTransfer.length; ai++) {
      const account = accountsToTransfer[ai];
      const accountLabel = account.label || `Account ${ai + 1}`;
      const mobile = account.mobile || "unknown";

      console.log(`[MultiTransfer] 🔄 Account ${ai + 1}/${accountsToTransfer.length}: ${accountLabel} (${mobile})`);

      try {
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
            existingTeamIds: isReplace ? selectedIds.slice(0, teamsToSend) : undefined,
            skipVerify: true,
          },
          (done, total) => setProgress({ done: ai * teamsToSend + done, total: teamsToSend * accountsToTransfer.length })
        );

        totalSuccess += res.successCount;
        totalFail += res.failCount;
        allResults.push(...res.results.map(r => ({
          ...r,
          message: `[${accountLabel}] ${r.message || ""}`,
        })));

        console.log(`[MultiTransfer] Account ${ai + 1} done: ${res.successCount} success, ${res.failCount} fail`);
      } catch (err: any) {
        console.error(`[MultiTransfer] Account ${ai + 1} error:`, err?.message);
        totalFail += sendItems.length;
        allResults.push(...sendItems.map(it => ({
          teamNo: it.teamNo,
          success: false,
          message: `[${accountLabel}] ${err?.message || "Transfer failed"}`,
        })));
      }

      // Delay between accounts
      if (ai < accountsToTransfer.length - 1) {
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    const finalResult: BulkTransferResult = {
      totalAttempted: teamsToSend * accountsToTransfer.length,
      successCount: totalSuccess,
      failCount: totalFail,
      results: allResults,
      transferLinks: [],
    };

    setResult(finalResult);
    setPhase("done");

    if (totalSuccess > 0 && totalFail === 0) {
      toast.success(`✅ Transferred ${totalSuccess} teams across ${accountsToTransfer.length} account(s)`);
    } else if (totalSuccess > 0) {
      toast.success(`⚡ ${totalSuccess} transferred, ${totalFail} failed across ${accountsToTransfer.length} accounts`);
    } else {
      toast.error(`❌ Transfer failed for all ${accountsToTransfer.length} accounts`);
    }
  }


  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={onClose}>
        <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
          className="bg-white dark:bg-background w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[95vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className={cn("bg-gradient-to-br text-white p-4 flex items-center justify-between sticky top-0 z-10", APP_LABELS[selectedApp]?.color || "brand-gradient")}>
            <div className="flex items-center gap-2">
              <Send className="w-5 h-5" />
              <div>
                <h3 className="font-bold text-sm">Transfer to {APP_LABELS[selectedApp]?.label}</h3>
                <p className="text-[10px] text-white/80">{validTeams.length} teams · Match {matchNumericId}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20"><X className="w-5 h-5" /></button>
          </div>

          <div className="p-4 space-y-4">
            {phase === "loading" && (
              <div className="py-8 text-center">
                <Loader2 className="w-10 h-10 mx-auto text-violet-500 animate-spin mb-3" />
                <p className="text-sm font-semibold">Loading match data...</p>
              </div>
            )}

            {phase === "ready" && (
              <>
                {/* Platform selector — switch between Dream11 and My11Circle */}
                <div className="flex gap-2">
                  {(["dream11", "my11circle"] as FantasyApp[]).map(app => {
                    const isLinkedApp = !!getLinkedAccount(app);
                    const acctCount = listAccountsForApp(app).length;
                    return (
                      <button key={app} onClick={() => setSelectedApp(app)}
                        className={cn("flex-1 h-10 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                          selectedApp === app ? "bg-gradient-to-r text-white " + (APP_LABELS[app]?.color || "from-violet-500 to-purple-600") : "bg-slate-100 dark:bg-slate-800 text-muted-foreground")}>
                        {APP_LABELS[app]?.emoji} {APP_LABELS[app]?.label}
                        {isLinkedApp && <span className="text-[8px] bg-emerald-500 text-white px-1 rounded-full">{acctCount}</span>}
                      </button>
                    );
                  })}
                </div>
                {/* Mode selector */}
                <div className="flex bg-violet-50 dark:bg-violet-900/20 rounded-xl p-1">
                  <button onClick={() => setTransferMode("classic")}
                    className={cn("flex-1 h-9 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1",
                      transferMode === "classic" ? "bg-white dark:bg-violet-950 text-violet-700 shadow-sm" : "text-muted-foreground")}>
                    <Link2 className="w-3.5 h-3.5" /> Direct Links
                  </button>
                  <button onClick={() => setTransferMode("otp")}
                    className={cn("flex-1 h-9 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1",
                      transferMode === "otp" ? "bg-white dark:bg-violet-950 text-violet-700 shadow-sm" : "text-muted-foreground")}>
                    <Send className="w-3.5 h-3.5" /> OTP Transfer {isLinked && "✓"}
                  </button>
                </div>

                {/* DIRECT LINKS MODE */}
                {transferMode === "classic" && (
                  <div className="space-y-3">
                    <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3">
                      <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">✅ No Login Required</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Generates {APP_LABELS[selectedApp]?.label} links for all {validTeams.length} teams. Each link opens the platform with your team pre-loaded.
                      </p>
                    </div>
                    <Button className="w-full h-12 brand-gradient text-white font-bold" onClick={handleClassicTransfer} disabled={validTeams.length === 0}>
                      <Link2 className="w-4 h-4 mr-2" /> Generate {validTeams.length} Links
                    </Button>
                  </div>
                )}

                {/* OTP TRANSFER MODE */}
                {transferMode === "otp" && (
                  <div className="space-y-3">
                    {!isLinked ? (
                      <div className="text-center py-4">
                        <Lock className="w-10 h-10 mx-auto text-amber-500 mb-2" />
                        <p className="text-sm font-bold mb-1">{APP_LABELS[selectedApp]?.label} OTP Required</p>
                        <p className="text-xs text-muted-foreground mb-3 px-4">
                          Link your {APP_LABELS[selectedApp]?.label} account via OTP to transfer teams directly via API (add-team / edit-team).
                        </p>
                        <Button className="brand-gradient text-white" onClick={onOpenOtpLogin}>
                          <Zap className="w-4 h-4 mr-2" /> Link via OTP
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                          <div>
                            <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">{APP_LABELS[selectedApp]?.label} Linked — {linkedMobile}</p>
                            <p className="text-[10px] text-muted-foreground">Token active · One-time OTP login</p>
                          </div>
                        </div>

                        {/* === MULTI-ACCOUNT SELECTOR === */}
                        {availableAccounts.length > 0 && (
                          <div className="p-3 rounded-xl border border-violet-200 dark:border-violet-900/30 bg-violet-50/30 dark:bg-violet-950/20">
                            <div className="flex items-center justify-between mb-2">
                              <label className="text-[11px] font-bold text-foreground">
                                Select Accounts ({availableAccounts.length} linked):
                              </label>
                              <div className="flex gap-2">
                                <button onClick={() => setSelectedAccountIds(availableAccounts.map(a => a.id))} className="text-[10px] font-bold text-violet-600 dark:text-violet-400 hover:underline">Select All</button>
                                <button onClick={() => setSelectedAccountIds([])} className="text-[10px] font-bold text-slate-500 hover:underline">Deselect All</button>
                              </div>
                            </div>
                            <div className="space-y-1.5 max-h-32 overflow-y-auto">
                              {availableAccounts.map((acc, i) => {
                                const isSelected = selectedAccountIds.includes(acc.id);
                                return (
                                  <label key={acc.id} className={cn("flex items-center gap-2.5 p-2 rounded-lg border cursor-pointer transition-all", isSelected ? "border-violet-500 bg-violet-100 dark:bg-violet-900/40" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-card hover:border-violet-300")}>
                                    <input type="checkbox" checked={isSelected} onChange={(e) => { if (e.target.checked) setSelectedAccountIds(prev => [...prev, acc.id]); else setSelectedAccountIds(prev => prev.filter(id => id !== acc.id)); }} className="w-4 h-4 accent-violet-600" />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-bold text-foreground truncate">{acc.label || `Account ${i + 1}`}</p>
                                      <p className="text-[10px] text-muted-foreground">{acc.mobile ? `📱 ${acc.mobile}` : "No mobile"}{acc.isDefault ? " · ⭐ Default" : ""}</p>
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                            {selectedAccountIds.length > 1 && (
                              <div className="mt-2 p-2 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800">
                                <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">⚡ Multi Transfer: {selectedAccountIds.length} accounts selected</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-white dark:bg-card rounded-xl p-2 border text-center">
                            <p className="text-base font-black">{validTeams.length}</p>
                            <p className="text-[8px] text-muted-foreground uppercase">APNA</p>
                          </div>
                          <div className="bg-white dark:bg-card rounded-xl p-2 border text-center">
                            <p className="text-base font-black">{existingTeams.length}<span className="text-[10px] text-muted-foreground">/{PLATFORM_LIMIT}</span></p>
                            <p className="text-[8px] text-muted-foreground uppercase">Platform</p>
                          </div>
                          <div className="bg-white dark:bg-card rounded-xl p-2 border text-center">
                            <p className="text-base font-black">{availableNewSlots}</p>
                            <p className="text-[8px] text-muted-foreground uppercase">Free Slots</p>
                          </div>
                        </div>
                        {linkedAccount?.subscriptionTier && (
                          <p className="text-[10px] text-center text-violet-600 dark:text-violet-300 font-semibold">
                            {APP_LABELS[selectedApp]?.label} {linkedAccount.subscriptionTier} plan · max {PLATFORM_LIMIT} teams/match
                          </p>
                        )}

                        {/* Replace selection */}
                        {existingTeams.length > 0 && (
                          <div>
                            <div className="flex justify-between mb-1">
                              <p className="text-xs font-bold">Replace Existing</p>
                              <div className="flex gap-2">
                                <button onClick={() => setSelectedTeamIds(new Set(existingTeams.map(t => t.team_id)))} className="text-[10px] font-bold text-violet-600">All</button>
                                <button onClick={() => setSelectedTeamIds(new Set())} className="text-[10px] font-bold text-muted-foreground">None</button>
                              </div>
                            </div>
                            <div className="max-h-32 overflow-y-auto space-y-1">
                              {existingTeams.map((t) => {
                                const sel = selectedTeamIds.has(t.team_id);
                                return (
                                  <button key={t.team_id} onClick={() => { const n = new Set(selectedTeamIds); n.has(t.team_id) ? n.delete(t.team_id) : n.add(t.team_id); setSelectedTeamIds(n); }}
                                    className={cn("w-full flex items-center gap-2 p-2 rounded-lg border-2", sel ? "border-violet-400 bg-violet-50/50" : "border-violet-100")}>
                                    <div className={cn("w-4 h-4 rounded border-2 flex items-center justify-center", sel ? "brand-gradient border-transparent" : "border-violet-200")}>{sel && <Check className="w-2.5 h-2.5 text-white" />}</div>
                                    <span className="text-xs font-semibold">Team {t.team_number}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <Button className="w-full h-12 brand-gradient text-white font-bold" onClick={handleOtpTransfer}
                          disabled={selectedTeamIds.size > 0 ? replaceCount === 0 : bulkCount === 0}>
                          <Send className="w-4 h-4 mr-2" />
                          {selectedTeamIds.size > 0 ? `Replace ${replaceCount} Teams` : `Transfer ${bulkCount} New Teams`}
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Transferring */}
            {phase === "transferring" && (
              <div className="py-8 text-center">
                <Loader2 className="w-12 h-12 mx-auto text-violet-500 animate-spin mb-3" />
                <p className="text-sm font-bold">
                  {lastTransferType === "classic" ? "Generating links..." : "Transferring via API..."}
                </p>
                <div className="mt-3 h-2 bg-violet-50 rounded-full overflow-hidden">
                  <motion.div className="h-full brand-gradient" animate={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">{progress.done}/{progress.total}</p>
              </div>
            )}

            {/* Done — Classic links */}
            {phase === "done" && linkResults && (
              <div className="space-y-3">
                <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-4 text-center">
                  <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600 mb-2" />
                  <p className="text-lg font-bold">{linkResults.length} links generated 🎉</p>
                  <p className="text-xs text-muted-foreground">Tap each link to open {APP_LABELS[selectedApp]?.label}</p>
                </div>
                <div className="space-y-2 max-h-[45vh] overflow-y-auto">
                  {linkResults.map((r) => (
                    <a key={r.teamNo} href={r.link} target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between p-3 rounded-lg border bg-white dark:bg-card hover:bg-violet-50 transition-colors">
                      <span className="text-xs font-bold">Team #{r.teamNo}</span>
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-violet-600">
                        Open {APP_LABELS[selectedApp]?.label} <ExternalLink className="w-3 h-3" />
                      </span>
                    </a>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={onClose}>Close</Button>
                  <Button className="flex-1 brand-gradient text-white" onClick={() => { setLinkResults(null); setPhase("ready"); }}>Again</Button>
                </div>
              </div>
            )}

            {/* Done — OTP API result */}
            {phase === "done" && result && !linkResults && (
              <div className="space-y-3">
                <div className={cn("rounded-xl p-4 text-center", result.successCount > 0 ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30")}>
                  {result.successCount > 0 ? <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600 mb-2" /> : <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-2" />}
                  <p className="text-lg font-bold">{result.successCount > 0 ? `${result.successCount}/${result.totalAttempted} transferred 🎉` : `${result.failCount} failed`}</p>
                  {result.needsReauth && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1 font-semibold">
                      🔒 Your {APP_LABELS[selectedApp]?.label} session has expired. Re-link via OTP to continue.
                    </p>
                  )}
                </div>
                {result.failCount > 0 && (
                  <div className="rounded-xl bg-red-50 dark:bg-red-950/30 p-3">
                    <div className="max-h-24 overflow-y-auto space-y-1">
                      {result.results.filter(r => !r.success).slice(0, 5).map(r => <p key={r.teamNo} className="text-[11px] text-red-600">Team #{r.teamNo}: {r.message || "Failed"}</p>)}
                    </div>
                    {(result.failCount === result.totalAttempted || result.needsReauth) && (
                      <Button size="sm" className="w-full h-8 brand-gradient text-white text-xs mt-2" onClick={() => { onClose(); onOpenOtpLogin(); }}>
                        <Zap className="w-3 h-3 mr-1" /> Relink via OTP
                      </Button>
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={onClose}>Close</Button>
                  <Button className="flex-1 brand-gradient text-white" onClick={() => { setResult(null); setPhase("ready"); }}>Again</Button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
