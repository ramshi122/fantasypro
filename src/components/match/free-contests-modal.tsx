"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronRight,
  Gift,
  Loader2,
  Send,
  Trophy,
  Users,
  X,
  Zap,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  fetchFreeContestsForAccount,
  getLinkedAccount,
  joinAllAccountsContest,
  joinFreeContestForAccount,
  listFantasyTeamsForAccount,
  setActiveFantasyAccount,
  type FantasyApp,
  type FreeContest,
  type MatchInfo,
  type TeamRow,
} from "@/lib/api";
import { getActiveAccountsForApp, getAccountLimit } from "@/lib/multi-accounts";
import { useLicense } from "@/lib/use-license";
import { cn } from "@/lib/utils";

const APP_LABELS: Record<FantasyApp, { label: string; emoji: string; color: string }> = {
  dream11: { label: "Dream11", emoji: "🏏", color: "from-red-500 to-rose-600" },
  my11circle: { label: "My11Circle", emoji: "⭕", color: "from-sky-500 to-blue-600" },
  myteam11: { label: "MyTeam11", emoji: "👥", color: "from-emerald-500 to-green-600" },
  vision11: { label: "Vision11", emoji: "👁️", color: "from-violet-500 to-purple-600" },
};

interface FreeContestsModalProps {
  open: boolean;
  onClose: () => void;
  match: MatchInfo;
  teams: TeamRow[];
  onOpenOtpLogin: () => void;
}

type Phase = "loading" | "ready" | "joining" | "done";

export function FreeContestsModal({
  open,
  onClose,
  match,
  teams,
  onOpenOtpLogin,
}: FreeContestsModalProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [contests, setContests] = useState<FreeContest[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<FantasyApp>("my11circle");
  const [linkedApps, setLinkedApps] = useState<FantasyApp[]>([]);
  const [joiningContest, setJoiningContest] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [joinMode, setJoinMode] = useState<"spread-repeat" | "spread-no-repeat" | "same-teams" | "random">("random");
  const [showJoinMode, setShowJoinMode] = useState(false);

  // === MULTI-ACCOUNT SELECTOR for Join Contest ===
  const [selectedJoinAccountIds, setSelectedJoinAccountIds] = useState<string[]>([]);
  const availableJoinAccounts = selectedApp ? getActiveAccountsForApp(selectedApp) : [];

  // Reset account selection when app changes
  useEffect(() => {
    setSelectedJoinAccountIds([]);
  }, [selectedApp]);

  // CRITICAL: useLicense MUST be called before any conditional return.
  // Previously it was after `if (!open) return null;` which violated
  // React's Rules of Hooks and caused "Join contest button click error".
  const license = useLicense();
  const canUseMultiAccount = license.isPro || license.isElite;

  const matchId = (match.matchId ?? match.id ?? "") as string;
  const validTeams = teams.filter((t) => (t.players?.length || 0) === 11);

  // Load linked apps on open
  useEffect(() => {
    if (!open) return;
    const apps: FantasyApp[] = [];
    for (const a of ["dream11", "my11circle", "jumbo", "myteam11", "vision11"] as FantasyApp[]) {
      const acct = getLinkedAccount(a);
      if (acct) apps.push(a);
    }
    setLinkedApps(apps);
    if (apps.length > 0) setSelectedApp(apps[0]);
  }, [open]);

  // Fetch free contests when modal opens or app changes OR when the selected
  // account changes. Per user spec: "When Account #2 is selected, every API
  // must use Account #2's authentication token and user ID only."
  useEffect(() => {
    if (!open || linkedApps.length === 0) return;
    let active = true;
    (async () => {
      setPhase("loading");
      setError(null);
      try {
        // Determine the target account: first user-selected, otherwise default.
        // Per user spec: "fetch real Dream11 data for the selected account
        // before enabling Join Contest or Transfer."
        const allAccounts = getActiveAccountsForApp(selectedApp);
        const targetAccount =
          allAccounts.find(a => selectedJoinAccountIds.includes(a.id)) ||
          allAccounts.find(a => a.isDefault) ||
          allAccounts[0];

        if (!targetAccount) {
          setError("Account not linked");
          setPhase("ready");
          return;
        }

        // Mark this as the active account so legacy code paths resolve it correctly
        setActiveFantasyAccount(selectedApp, targetAccount.id);

        // Fetch existing teams on the fantasy platform using the per-account API
        // (so Account #2's teams don't leak into Account #1's view).
        let teamIds: number[] = [];
        try {
          const existingTeams = await listFantasyTeamsForAccount({
            accountId: targetAccount.id,
            fantasyApp: selectedApp,
            matchId,
          });
          teamIds = existingTeams
            .map((t) => Number(t.team_id ?? t.teamId))
            .filter((n) => !isNaN(n) && n > 0);
        } catch {
          // ignore — use team numbers from local teams as fallback
        }

        // Fallback: if no existing team IDs, use local team numbers
        if (teamIds.length === 0) {
          teamIds = validTeams.map((t) => Number(t.teamNo)).filter((n) => n > 0);
        }

        if (teamIds.length === 0) {
          setError("No teams available. Generate teams and transfer them first.");
          setContests([]);
          setPhase("ready");
          return;
        }

        // Fetch free contests using the per-account API (auto-refreshes token
        // if expired, caches result per-account so Account #1 cache doesn't
        // bleed into Account #2).
        const res = await fetchFreeContestsForAccount({
          accountId: targetAccount.id,
          fantasyApp: selectedApp,
          matchId,
          allTeamIds: teamIds,
        });

        if (!active) return;

        if (res.status === "success") {
          setContests(res.contests);
          if (res.contests.length === 0) {
            setError("No free contests available for this match right now.");
          }
        } else {
          setError(res.message || "Failed to fetch free contests");
          setContests([]);
        }
        setPhase("ready");
      } catch (err: any) {
        if (!active) return;
        setError(err?.message || "Network error");
        setContests([]);
        setPhase("ready");
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedApp, linkedApps.length, refreshKey, matchId, selectedJoinAccountIds]);

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setPhase("loading");
      setContests([]);
      setError(null);
      setJoiningContest(null);
    }
  }, [open]);

  if (!open) return null;

  async function handleJoinContest(contest: FreeContest) {
    // Determine target account: first user-selected (multi-select), otherwise default.
    // Per user spec: "When Account #2 is selected, every API must use Account #2's
    // authentication token and user ID only."
    const allAccounts = getActiveAccountsForApp(selectedApp);
    const targetAccount =
      allAccounts.find(a => selectedJoinAccountIds.includes(a.id)) ||
      allAccounts.find(a => a.isDefault) ||
      allAccounts[0];

    if (!targetAccount || !targetAccount.id) {
      toast.error("Account not linked");
      return;
    }

    const allAvailable = contest.notJoinedTeamIds || [];
    const slots = contest.availableSlots || 0;
    const numToJoin = Math.min(slots, allAvailable.length);

    let teamIds: number[] = [];

    if (joinMode === "random") {
      // Fisher-Yates shuffle for mixed random selection
      const shuffled = [...allAvailable];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      teamIds = shuffled.slice(0, numToJoin);
    } else if (joinMode === "spread-repeat") {
      // Each contest gets next set of teams, wraps around
      const contestIdx = contests.findIndex(c => c.contestId === contest.contestId);
      const startIdx = (contestIdx * numToJoin) % allAvailable.length;
      teamIds = [];
      for (let i = 0; i < numToJoin; i++) {
        teamIds.push(allAvailable[(startIdx + i) % allAvailable.length]);
      }
    } else if (joinMode === "spread-no-repeat") {
      // Each contest gets next unique teams, no reuse
      const contestIdx = contests.findIndex(c => c.contestId === contest.contestId);
      const startIdx = contestIdx * numToJoin;
      teamIds = allAvailable.slice(startIdx, startIdx + numToJoin);
      if (teamIds.length < numToJoin) {
        // Not enough unique teams — take what's available
        teamIds = allAvailable.slice(0, numToJoin);
      }
    } else if (joinMode === "same-teams") {
      // Every contest gets same teams from Team 1
      teamIds = allAvailable.slice(0, numToJoin);
    }

    if (teamIds.length === 0) {
      toast.error("No teams available to join");
      return;
    }

    console.log(`[Contest][Join] Account=${targetAccount.id} (${targetAccount.label}), Mode: ${joinMode}, Available: ${allAvailable.length}, Joining: ${teamIds.length} teams: [${teamIds.join(",")}]`);

    setJoiningContest(contest.contestId);
    setPhase("joining");
    try {
      // Use the per-account API: this threads the accountId through the
      // cache + token-refresh logic so Account #2's join uses Account #2's
      // token (NOT Account #1's) and any token refresh is persisted back
      // to Account #2 only.
      const res = await joinFreeContestForAccount({
        accountId: targetAccount.id,
        fantasyApp: selectedApp,
        matchId,
        contestId: contest.contestId,
        teamIds,
      });

      if (res.status === "success" && res.summary.successCount > 0) {
        toast.success(`Joined ${res.summary.successCount} team(s) to ${contest.contestName || "contest"} (${targetAccount.label || targetAccount.id})`);
        // Update local state to mark teams as joined
        setContests((prev) =>
          prev.map((c) => {
            if (c.contestId !== contest.contestId) return c;
            const newJoined = [...(c.joinedTeamIds || []), ...teamIds];
            return {
              ...c,
              joinedTeamIds: newJoined,
              joinedCount: newJoined.length,
              availableSlots: Math.max((c.maxAllowedTeams || 0) - newJoined.length, 0),
              notJoinedTeamIds: (c.notJoinedTeamIds || []).filter((id) => !teamIds.includes(id)),
              canJoinMore: newJoined.length < (c.maxAllowedTeams || 0) && (c.notJoinedTeamIds || []).length > teamIds.length,
            };
          })
        );
        setPhase("done");
      } else if (res.needsReauth) {
        // Token expired — prompt re-link via OTP
        toast.error(res.message || `Session expired for ${targetAccount.label || "account"} — re-link via OTP`);
        setTimeout(() => onOpenOtpLogin(), 800);
        setPhase("ready");
      } else {
        toast.error(res.message || "Failed to join contest");
        setPhase("ready");
      }
    } catch (err: any) {
      toast.error(err?.message || "Join failed");
      setPhase("ready");
    } finally {
      setJoiningContest(null);
    }
  }

  // ============================================================
  // MULTI-ACCOUNT JOIN — joins contest with ALL linked accounts
  // ============================================================
  // Per user spec: "1 time all account transfer and join contest all account
  // different team dream11 3 / my11 2"
  //
  // Account limits (enforced in multi-accounts.ts):
  //   - Dream11: max 3 accounts
  //   - My11Circle: max 2 accounts
  //
  // Each account gets DIFFERENT teams (no overlap). Teams split round-robin.
  //
  // Subscription gating (license/canUseMultiAccount declared at top of component):
  //   - Trial/match_basic: single account only (multi-account locked)
  //   - Pro (monthly)/Elite/Lifetime: multi-account unlocked

  async function handleJoinAllAccounts(contest: FreeContest) {
    // Subscription check — multi-account is Pro/Elite only
    if (!canUseMultiAccount) {
      toast.error("🔒 Multi-account join is a Pro/Elite feature. Upgrade to join with multiple accounts.");
      return;
    }

    // Get ALL active accounts for the selected platform
    const allAccounts = getActiveAccountsForApp(selectedApp);
    if (allAccounts.length === 0) {
      toast.error(`No ${APP_LABELS[selectedApp]?.label || selectedApp} accounts linked`);
      return;
    }

    if (allAccounts.length === 1) {
      toast.info("Only 1 account linked — use single join instead");
      return;
    }

    // Check account limit
    const limit = getAccountLimit(selectedApp);
    if (allAccounts.length > limit) {
      toast.error(`Max ${limit} accounts allowed for ${APP_LABELS[selectedApp]?.label}. You have ${allAccounts.length}.`);
      return;
    }

    const allAvailable = contest.notJoinedTeamIds || [];
    const slots = contest.availableSlots || 0;
    const numToJoin = Math.min(slots, allAvailable.length);

    if (numToJoin === 0) {
      toast.error("No teams available to join");
      return;
    }

    // Shuffle teams first (for random distribution across accounts)
    const shuffled = [...allAvailable];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const teamIds = shuffled.slice(0, numToJoin);

    // Build accounts array for the API
    const accountsPayload = allAccounts.map((acc) => ({
      authToken: acc.token,
      mobile: acc.mobile || undefined,
      my11circleChallenge: acc.my11circleChallenge || undefined,
      my11circleUserId: acc.my11circleUserId || undefined,
    }));

    console.log(
      `[Contest][JoinAll] ${selectedApp} — ${allAccounts.length} accounts, ` +
      `${teamIds.length} teams, contest=${contest.contestId}`
    );

    setJoiningContest(contest.contestId);
    setPhase("joining");
    try {
      const res = await joinAllAccountsContest({
        fantasyApp: selectedApp,
        accounts: accountsPayload,
        matchId,
        contestId: contest.contestId,
        teamIds,
      });

      if (res.status === "success" || res.summary.successCount > 0) {
        // Build per-account summary
        const accountSummary = res.accountResults
          .map((ar, i) => `Acct${i + 1}(${ar.mobile}): ${ar.successCount}/${ar.successCount + ar.failedCount}`)
          .join(" | ");

        toast.success(
          `✅ Joined ${res.summary.successCount}/${teamIds.length} teams across ${allAccounts.length} accounts\n${accountSummary}`
        );

        // Update local state
        setContests((prev) =>
          prev.map((c) => {
            if (c.contestId !== contest.contestId) return c;
            return {
              ...c,
              joinedTeamIds: [...(c.joinedTeamIds || []), ...teamIds],
              joinedCount: (c.joinedTeamIds?.length || 0) + teamIds.length,
              availableSlots: Math.max((c.maxAllowedTeams || 0) - ((c.joinedTeamIds?.length || 0) + teamIds.length), 0),
              notJoinedTeamIds: (c.notJoinedTeamIds || []).filter((id) => !teamIds.includes(id)),
              canJoinMore: false, // multi-account join is one-shot
            };
          })
        );
        setPhase("done");
      } else if (res.accountResults.some(ar => ar.error?.includes("Session expired"))) {
        toast.error("One or more accounts have expired sessions — re-link via OTP");
        setTimeout(() => onOpenOtpLogin(), 800);
        setPhase("ready");
      } else {
        toast.error(res.message || "Failed to join contest with multiple accounts");
        setPhase("ready");
      }
    } catch (err: any) {
      toast.error(err?.message || "Multi-account join failed");
      setPhase("ready");
    } finally {
      setJoiningContest(null);
    }
  }

  const linkedAndSupported = linkedApps;

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
          <div className="brand-gradient text-white p-4 flex items-center justify-between sticky top-0 z-10">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-white/25 backdrop-blur-md flex items-center justify-center">
                <Gift className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm">Free Contests</h3>
                <p className="text-[10px] text-white/80">
                  {validTeams.length} teams · {linkedApps.length} account(s) linked
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* Team Assignment Mode selector (like STAR11) */}
            <div className="bg-white dark:bg-card rounded-xl p-3 border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setShowJoinMode(v => !v)}
                className="w-full flex items-center justify-between"
              >
                <div>
                  <p className="text-xs font-bold text-foreground">Team Assignment Mode</p>
                  <p className="text-[10px] text-muted-foreground">Choose how teams are assigned to contests</p>
                </div>
                <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", showJoinMode && "rotate-90")} />
              </button>

              {showJoinMode && (
                <div className="mt-3 space-y-2">
                  {[
                    { id: "spread-repeat", label: "Spread & Repeat", desc: "Each contest gets the next set of teams. Wraps back to Team 1 when exhausted.", example: "Contest A → T1,T2\nContest B → T3,T4\nContest C → T5,T1 (wraps)" },
                    { id: "spread-no-repeat", label: "Spread (No Repeat)", desc: "Each contest gets unique teams. Teams are never reused across contests.", example: "Contest A → T1,T2\nContest B → T3,T4\nContest C → T5 (only 1 left)" },
                    { id: "same-teams", label: "Same Teams", desc: "Every contest gets the same set of teams starting from Team 1.", example: "Contest A → T1,T2\nContest B → T1,T2\nContest C → T1,T2" },
                    { id: "random", label: "Random Teams", desc: "Each contest gets a randomly picked set. Every run gives different combos.", example: "Contest A → T3,T1\nContest B → T5,T2\nContest C → T4,T3" },
                  ].map(m => (
                    <button
                      key={m.id}
                      onClick={() => { setJoinMode(m.id as any); toast.success(`Mode: ${m.label}`); }}
                      className={cn(
                        "w-full text-left p-2.5 rounded-lg border-2 transition-all",
                        joinMode === m.id
                          ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30"
                          : "border-slate-200 dark:border-slate-700 hover:border-violet-300"
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <div className={cn(
                          "w-4 h-4 rounded-full border-2 flex-shrink-0 mt-0.5",
                          joinMode === m.id ? "border-violet-500 bg-violet-500" : "border-slate-300"
                        )}>
                          {joinMode === m.id && <div className="w-1.5 h-1.5 bg-white rounded-full m-auto mt-0.5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-bold text-foreground">{m.label}</p>
                          <p className="text-[9px] text-muted-foreground mt-0.5">{m.desc}</p>
                          <div className="mt-1 bg-slate-50 dark:bg-slate-800/50 rounded p-1.5">
                            <p className="text-[8px] italic text-muted-foreground">Example:</p>
                            {m.example.split("\n").map((line, i) => (
                              <p key={i} className="text-[8px] text-foreground font-mono">{line}</p>
                            ))}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {!showJoinMode && (
                <p className="text-[9px] text-muted-foreground mt-1">
                  Current: <span className="font-bold text-violet-600">{joinMode === "random" ? "Random Teams" : joinMode === "spread-repeat" ? "Spread & Repeat" : joinMode === "spread-no-repeat" ? "Spread (No Repeat)" : "Same Teams"}</span>
                </p>
              )}
            </div>

            {/* If no linked accounts */}
            {linkedApps.length === 0 ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center mb-3">
                  <Users className="w-8 h-8 text-violet-400" />
                </div>
                <p className="text-sm font-bold mb-1">No linked accounts</p>
                <p className="text-xs text-muted-foreground mb-4 px-6">
                  Link your Dream11 or My11Circle account via OTP to join free contests.
                </p>
                <Button
                  className="brand-gradient text-white"
                  onClick={() => {
                    onClose();
                    onOpenOtpLogin();
                  }}
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Link Account via OTP
                </Button>
              </div>
            ) : (
              <>
                {/* App selector */}
                <div>
                  <label className="text-xs font-semibold text-foreground mb-1.5 block">
                    Select Account:
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {linkedAndSupported.map((app) => (
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
                        {APP_LABELS[app].emoji} {APP_LABELS[app].label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Loading */}
                {phase === "loading" && (
                  <div className="py-8 text-center">
                    <Loader2 className="w-10 h-10 mx-auto text-violet-500 animate-spin mb-3" />
                    <p className="text-sm font-semibold">Fetching free contests...</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Checking {APP_LABELS[selectedApp].label} for available free contests
                    </p>
                  </div>
                )}

                {/* Error */}
                {error && phase !== "loading" && (
                  <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Contests list */}
                {phase !== "loading" && contests.length > 0 && (
                  <div className="space-y-3">
                    {/* === MULTI-ACCOUNT SELECTOR for Join Contest === */}
                    {availableJoinAccounts.length > 1 && (
                      <div className="p-3 rounded-xl border border-violet-200 dark:border-violet-900/30 bg-violet-50/30 dark:bg-violet-950/20">
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-[11px] font-bold text-foreground">
                            Select Accounts ({availableJoinAccounts.length} linked):
                          </label>
                          <div className="flex gap-2">
                            <button onClick={() => setSelectedJoinAccountIds(availableJoinAccounts.map(a => a.id))} className="text-[10px] font-bold text-violet-600 dark:text-violet-400 hover:underline">Select All</button>
                            <button onClick={() => setSelectedJoinAccountIds([])} className="text-[10px] font-bold text-slate-500 hover:underline">Deselect All</button>
                          </div>
                        </div>
                        <div className="space-y-1.5 max-h-32 overflow-y-auto">
                          {availableJoinAccounts.map((acc, i) => {
                            const isSelected = selectedJoinAccountIds.includes(acc.id);
                            return (
                              <label key={acc.id} className={cn("flex items-center gap-2.5 p-2 rounded-lg border cursor-pointer transition-all", isSelected ? "border-violet-500 bg-violet-100 dark:bg-violet-900/40" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-card hover:border-violet-300")}>
                                <input type="checkbox" checked={isSelected} onChange={(e) => { if (e.target.checked) setSelectedJoinAccountIds(prev => [...prev, acc.id]); else setSelectedJoinAccountIds(prev => prev.filter(id => id !== acc.id)); }} className="w-4 h-4 accent-violet-600" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-foreground truncate">{acc.label || `Account ${i + 1}`}</p>
                                  <p className="text-[10px] text-muted-foreground">{acc.mobile ? `📱 ${acc.mobile}` : "No mobile"}{acc.isDefault ? " · ⭐" : ""}</p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                        {selectedJoinAccountIds.length > 1 && (
                          <div className="mt-2 p-2 rounded-lg bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800">
                            <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">⚡ {selectedJoinAccountIds.length} accounts selected — each will join independently</p>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Join All button — auto-join all available contests */}
                    {phase === "ready" && contests.some(c => c.canJoinMore && (c.availableSlots || 0) > 0) && (
                      <Button
                        size="sm"
                        className="w-full h-10 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-bold text-xs"
                        onClick={async () => {
                          const joinable = contests.filter(c => c.canJoinMore && (c.availableSlots || 0) > 0);
                          if (joinable.length === 0) return;
                          toast.info(`Auto-joining ${joinable.length} contest(s)...`);
                          for (const c of joinable) {
                            await handleJoinContest(c);
                          }
                          toast.success(`✓ Auto-joined all ${joinable.length} contest(s)!`);
                        }}
                      >
                        <Zap className="w-3.5 h-3.5 mr-1.5" />
                        Auto-Join All Contests ({contests.filter(c => c.canJoinMore && (c.availableSlots || 0) > 0).length})
                      </Button>
                    )}
                    {contests.map((c, i) => {
                      const isJoining = joiningContest === c.contestId;
                      const slots = c.availableSlots || 0;
                      const joined = c.joinedCount || 0;
                      const max = c.maxAllowedTeams || c.maxJoinTeamCount || 1;
                      const canJoin = c.canJoinMore && slots > 0 && phase !== "joining";
                      const prize = c.prizeDisplayText ||
                        (c.totalPrizeAmount ? `₹${Number(c.totalPrizeAmount).toLocaleString("en-IN")}` : "Free");

                      return (
                        <motion.div
                          key={c.contestId}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className={cn(
                            "rounded-2xl border-2 p-4 transition-all",
                            canJoin
                              ? "border-violet-200 dark:border-violet-800 bg-white dark:bg-card"
                              : "border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20"
                          )}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-start gap-2.5">
                              <div className={cn(
                                "w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center flex-shrink-0",
                                APP_LABELS[selectedApp].color
                              )}>
                                <Trophy className="w-5 h-5 text-white" />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-foreground">
                                  {c.contestName || "Free Contest"}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  Prize: {prize} · Max {max} team(s)
                                </p>
                              </div>
                            </div>
                            {joined > 0 && (
                              <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <Check className="w-2.5 h-2.5" />
                                {joined} joined
                              </span>
                            )}
                          </div>

                          {/* Slots indicator */}
                          <div className="flex items-center gap-2 mb-3 text-[11px]">
                            <div className="flex-1 h-1.5 bg-violet-100 dark:bg-violet-900/30 rounded-full overflow-hidden">
                              <div
                                className="h-full brand-gradient transition-all"
                                style={{ width: `${(joined / max) * 100}%` }}
                              />
                            </div>
                            <span className="text-muted-foreground font-semibold tabular-nums">
                              {joined}/{max}
                            </span>
                          </div>

                          {/* Join button */}
                          {canJoin ? (
                            <div className="space-y-2">
                              <Button
                                size="sm"
                                className="w-full h-9 brand-gradient text-white text-xs font-bold"
                                onClick={() => handleJoinContest(c)}
                                disabled={isJoining}
                              >
                                {isJoining ? (
                                  <>
                                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                    Joining {slots} team(s)...
                                  </>
                                ) : (
                                  <>
                                    <Send className="w-3.5 h-3.5 mr-1.5" />
                                    Join with {slots} team(s)
                                  </>
                                )}
                              </Button>

                              {/* Multi-Account Join — Pro/Elite only */}
                              {getActiveAccountsForApp(selectedApp).length > 1 && (
                                <Button
                                  size="sm"
                                  className={cn(
                                    "w-full h-9 text-xs font-bold border-2",
                                    canUseMultiAccount
                                      ? "bg-gradient-to-r from-emerald-500 to-teal-600 text-white border-transparent hover:from-emerald-600 hover:to-teal-700"
                                      : "bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-700 cursor-not-allowed"
                                  )}
                                  onClick={() => canUseMultiAccount ? handleJoinAllAccounts(c) : toast.error("🔒 Multi-account join is a Pro/Elite feature")}
                                  disabled={isJoining}
                                >
                                  {canUseMultiAccount ? (
                                    <>
                                      <Users className="w-3.5 h-3.5 mr-1.5" />
                                      Join All Accounts ({getActiveAccountsForApp(selectedApp).length} acct)
                                    </>
                                  ) : (
                                    <>
                                      <Lock className="w-3.5 h-3.5 mr-1.5" />
                                      Multi-Account (Pro/Elite)
                                    </>
                                  )}
                                </Button>
                              )}
                            </div>
                          ) : joined > 0 ? (
                            <div className="text-center text-xs font-semibold text-emerald-600 dark:text-emerald-400 py-1.5">
                              <CheckCircle2 className="w-4 h-4 inline mr-1" />
                              All slots filled
                            </div>
                          ) : (
                            <div className="text-center text-xs text-muted-foreground py-1.5">
                              No available teams to join
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                {/* Refresh button */}
                {phase === "ready" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-8 text-xs"
                    onClick={() => setRefreshKey((k) => k + 1)}
                  >
                    Refresh Contests
                  </Button>
                )}

                {/* Info note */}
                <div className="rounded-xl bg-violet-50/50 dark:bg-violet-950/20 p-3 text-[11px] text-muted-foreground">
                  <p className="font-semibold text-foreground mb-1">How it works:</p>
                  <ul className="space-y-0.5">
                    <li>• Free contests are available on {APP_LABELS[selectedApp].label}</li>
                    <li>• You need teams already transferred to your account</li>
                    <li>• Each contest has a max team limit</li>
                    <li>• We auto-join all available teams with one tap</li>
                  </ul>
                </div>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
