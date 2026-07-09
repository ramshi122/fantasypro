"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Gift,
  Loader2,
  Send,
  Trophy,
  Users,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  fetchFreeContests,
  getLinkedAccount,
  joinFreeContest,
  listFantasyTeams,
  type FantasyApp,
  type FreeContest,
  type MatchInfo,
  type TeamRow,
} from "@/lib/api";
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

  // Fetch free contests when modal opens or app changes
  useEffect(() => {
    if (!open || linkedApps.length === 0) return;
    let active = true;
    (async () => {
      setPhase("loading");
      setError(null);
      try {
        const account = getLinkedAccount(selectedApp);
        if (!account) {
          setError("Account not linked");
          setPhase("ready");
          return;
        }

        // Fetch existing teams on the fantasy platform (for team IDs)
        let teamIds: number[] = [];
        try {
          const existingTeams = await listFantasyTeams({
            fantasyApp: selectedApp,
            authToken: account.token,
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

        const res = await fetchFreeContests({
          fantasyApp: selectedApp,
          authToken: account.token,
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
  }, [open, selectedApp, linkedApps.length, refreshKey, matchId]);

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
    const account = getLinkedAccount(selectedApp);
    if (!account) {
      toast.error("Account not linked");
      return;
    }
    const teamIds = (contest.notJoinedTeamIds || []).slice(0, contest.availableSlots || 0);
    if (teamIds.length === 0) {
      toast.error("No teams available to join");
      return;
    }

    setJoiningContest(contest.contestId);
    setPhase("joining");
    try {
      const res = await joinFreeContest({
        fantasyApp: selectedApp,
        authToken: account.token,
        matchId,
        contestId: contest.contestId,
        teamIds,
      });

      if (res.status === "success" && res.summary.successCount > 0) {
        toast.success(`Joined ${res.summary.successCount} team(s) to ${contest.contestName || "contest"}`);
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
        toast.error(res.message || "Session expired — re-link via OTP");
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
