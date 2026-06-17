"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Crown,
  ExternalLink,
  Gift,
  Loader2,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Star,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useApp, useAuth } from "@/lib/store";
import {
  addTeam,
  editTeam,
  getLocalTeams,
  getMatchDetail,
  listFantasyTeams,
  saveFantasyToken,
  getFantasyToken,
  type MatchInfo,
  type MatchPlayer,
  type TeamRow,
  type FantasyApp,
} from "@/lib/api";
import { TeamDisplay } from "./team-display";
import { AutoGenerator } from "./auto-generator";
import { ApnaTransferModal } from "./apna-transfer-modal";
import { FreeContestsModal } from "./free-contests-modal";
import { OtpLoginModal } from "@/components/auth/otp-login-modal";
import {
  autoReplaceNonPlaying,
  buildPlayingPlayerSet,
  filterPlayingPlayers,
  getNonPlayingPlayersInTeam,
  isLineupAnnounced,
} from "@/lib/lineup";
import { useLicense } from "@/lib/use-license";
import { cn } from "@/lib/utils";
import { roleFromPlayerType, shortName, teamColor } from "@/lib/format";

type Step = "loading" | "ready" | "saving" | "error";

export function TransferFlow({ match }: { match: MatchInfo }) {
  const token = useAuth((s) => s.token);
  const isGuest = useAuth((s) => s.isGuest);
  const license = useLicense();
  const [step, setStep] = useState<Step>("loading");
  const [existingTeams, setExistingTeams] = useState<TeamRow[]>([]);
  const [players, setPlayers] = useState<MatchPlayer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamRow | null>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [showSweepGenerator, setShowSweepGenerator] = useState(false);
  const [showBulkTransfer, setShowBulkTransfer] = useState(false);
  const [selectedTransferApp, setSelectedTransferApp] = useState<FantasyApp>("dream11");
  const [showFreeContests, setShowFreeContests] = useState(false);
  const [showOtpLogin, setShowOtpLogin] = useState(false);
  const [linkedApp, setLinkedApp] = useState<FantasyApp | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lineupAnnounced, setLineupAnnounced] = useState(false);
  const [playingPlayerIds, setPlayingPlayerIds] = useState<Set<string>>(new Set());
  const [matchSupportsDream11, setMatchSupportsDream11] = useState(false);

  const matchId = (match.matchId ?? match.id ?? "") as string;
  const team1Name = (typeof match.team1 === "string" ? match.team1 : (match.team1?.shortName || match.team1?.name)) as string ||
    (match as any).left_team_name || "T1";
  const team2Name = (typeof match.team2 === "string" ? match.team2 : (match.team2?.shortName || match.team2?.name)) as string ||
    (match as any).right_team_name || "T2";
  const team1Color = teamColor(team1Name);
  const team2Color = teamColor(team2Name);

  const loadAll = useCallback(async () => {
    setStep("loading");
    setError(null);
    try {
      // 1. Fetch match detail (real players) in parallel with team list
      const [matchDetail, teams] = await Promise.all([
        getMatchDetail(matchId).catch(() => null),
        listFantasyTeams({
          fantasyApp: "dream11",
          authToken: token || "guest",
          matchId,
        }).catch(() => [] as TeamRow[]),
      ]);

      // Extract players from match detail
      let allPlayers: MatchPlayer[] = [];
      if (matchDetail) {
        const leftPlayers = (matchDetail as any).left_team_players || [];
        const rightPlayers = (matchDetail as any).right_team_players || [];
        allPlayers = [...leftPlayers, ...rightPlayers].filter(Boolean);

        // Detect lineup status
        const lineupStatus = (matchDetail as any).lineup_status;
        const announced = Number(lineupStatus) === 1;
        setLineupAnnounced(announced);

        // Build set of confirmed playing player IDs
        const playingSet = buildPlayingPlayerSet(allPlayers, announced);
        setPlayingPlayerIds(playingSet);

        // Filter players: after lineup, only show confirmed playing XI
        const visiblePlayers = filterPlayingPlayers(allPlayers, announced);
        setPlayers(visiblePlayers);

        // Detect if match supports Dream11 transfer:
        // Check if fantasy_version includes "dream11" OR any player has dream11 in fantasy_id_list
        const versions = (matchDetail as any).fantasy_version || [];
        const versionSupportsD11 = versions.some((v: any) => v.name === "dream11");
        const playerSupportsD11 = visiblePlayers.some((p: any) => {
          const fil = p.fantasy_id_list || [];
          return fil.some((f: any) => f.name === "dream11");
        });
        setMatchSupportsDream11(versionSupportsD11 || playerSupportsD11);
      } else {
        setPlayers([]);
        setLineupAnnounced(false);
        setPlayingPlayerIds(new Set());
      }

      // Merge: localStorage teams take priority (they're the ones the user created)
      const localTeams = getLocalTeams(matchId);
      const merged = [...localTeams];
      // Add any backend teams not already in local
      for (const t of teams) {
        if (!merged.find((m) => m.teamId === t.teamId)) {
          merged.push(t);
        }
      }
      setExistingTeams(merged);
      setStep("ready");
    } catch (err: any) {
      setError(err?.message || "Failed to load match data.");
      setStep("error");
    }
  }, [matchId, token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAll();
  }, [loadAll, refreshKey]);

  // Check if user already has a Dream11 token saved
  useEffect(() => {
    const t = getFantasyToken("dream11");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (t) setLinkedApp("dream11");
  }, []);

  async function handleAddTeam(team: Partial<TeamRow>) {
    setStep("saving");
    try {
      const res = await addTeam(token!, { matchId, team, type: "add" });
      const offline = (res as { offline?: boolean }).offline;
      toast.success(offline ? "Team saved locally" : "Team added successfully");
      setShowEditor(false);
      setEditingTeam(null);
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      toast.error(err?.message || "Failed to add team");
      setStep("ready");
    }
  }

  async function handleEditTeam(teamId: string, team: Partial<TeamRow>) {
    setStep("saving");
    try {
      const res = await editTeam(token!, { matchId, teamId, team, type: "edit" });
      const offline = (res as { offline?: boolean }).offline;
      toast.success(offline ? "Team updated locally" : "Team updated");
      setShowEditor(false);
      setEditingTeam(null);
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      toast.error(err?.message || "Failed to update team");
      setStep("ready");
    }
  }

  async function handleDeleteTeam(teamId: string) {
    setStep("saving");
    try {
      await editTeam(token!, { matchId, teamId, team: {}, type: "delete" });
      toast.success("Team deleted");
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete team");
      setStep("ready");
    }
  }

  function handleTransfer(team: TeamRow, app: FantasyApp) {
    // Open the APNA Transfer modal for the selected app (same as toolbar buttons)
    if (!license.requireLicense()) return;
    setSelectedTransferApp(app);
    setShowBulkTransfer(true);
  }

  function handleLinkApp(app: FantasyApp, authToken: string) {
    saveFantasyToken(app, authToken);
    setLinkedApp(app);
    setShowLinkModal(false);
    toast.success(`${app} linked successfully`);
  }

  // Auto-replace non-playing players in the given teams
  function handleAutoReplaceAll(teamsToFix: TeamRow[]) {
    try {
      const all = JSON.parse(localStorage.getItem("fantasypro-local-teams") || "{}");
      const list = all[matchId] || [];
      let totalReplaced = 0;

      for (const team of teamsToFix) {
        const idx = list.findIndex(
          (t: TeamRow) => t._id === team._id || t.teamId === team.teamId
        );
        if (idx === -1) continue;

        const { updatedTeam, replaced } = autoReplaceNonPlaying(
          list[idx],
          players as MatchPlayer[],
          true
        );
        list[idx] = updatedTeam;
        totalReplaced += replaced.length;
      }

      all[matchId] = list;
      localStorage.setItem("fantasypro-local-teams", JSON.stringify(all));

      if (totalReplaced > 0) {
        toast.success(`Replaced ${totalReplaced} non-playing player(s) across ${teamsToFix.length} team(s)`);
      } else {
        toast.info("No replacements available — all non-playing players kept (insufficient playing XI)");
      }
      setRefreshKey((k) => k + 1);
    } catch (err: any) {
      toast.error("Failed to auto-replace players");
    }
  }

  // Called after the auto-generator has finished. The generator already saved
  // teams to localStorage via bulkAddTeams(), so we just need to refresh the
  // view and show a success toast.
  function handleBulkAddTeams(teams: TeamRow[]) {
    toast.success(`Generated ${teams.length} unique teams`);
    setRefreshKey((k) => k + 1);
  }

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <div className="bg-white dark:bg-card rounded-2xl border border-violet-100 dark:border-violet-900/30 p-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              My Teams
              {lineupAnnounced ? (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                  PLAYING XI CONFIRMED
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                  LINEUP PENDING
                </span>
              )}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Match ID: {matchId || "—"} · {players.length} players available
              {lineupAnnounced && " · only confirmed playing XI shown"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={step === "loading"}
          >
            <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", step === "loading" && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {/* Lineup warning — show if teams have non-playing players */}
        {lineupAnnounced && existingTeams.length > 0 && (() => {
          const teamsWithIssues = existingTeams.filter((t) =>
            getNonPlayingPlayersInTeam(t, true, playingPlayerIds).length > 0
          );
          if (teamsWithIssues.length === 0) return null;
          return (
            <div className="mt-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3">
              <p className="text-xs font-bold text-amber-700 dark:text-amber-300 mb-1">
                ⚠️ Lineup Updated — {teamsWithIssues.length} team(s) have non-playing players
              </p>
              <p className="text-[11px] text-muted-foreground mb-2">
                The official Playing XI has been announced. Some of your teams contain players who are not in the final lineup. Auto-replace them now.
              </p>
              <Button
                size="sm"
                className="h-8 text-xs bg-amber-500 hover:bg-amber-600 text-white"
                onClick={() => handleAutoReplaceAll(teamsWithIssues)}
              >
                <RefreshCw className="w-3 h-3 mr-1" />
                Auto-Replace Non-Playing Players
              </Button>
            </div>
          );
        })()}

        {/* Transfer Flow step indicator */}
        <TransferStepIndicator
          linked={!!linkedApp}
          teamsCount={existingTeams.length}
        />

        {/* Dream11 link status */}
        <div className="mt-3 flex items-center gap-2 text-[11px]">
          <span
            className={cn(
              "px-2 py-0.5 rounded-full font-semibold",
              linkedApp === "dream11"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
            )}
          >
            {linkedApp === "dream11" ? "✓ Dream11 linked" : "Dream11 not linked"}
          </span>
          {!linkedApp && (
            <button
              onClick={() => setShowOtpLogin(true)}
              className="text-violet-600 dark:text-violet-300 font-semibold underline"
            >
              Link via OTP →
            </button>
          )}
        </div>

        {error && (
          <div className="mt-3 text-xs text-red-600 bg-red-50 dark:bg-red-950/30 p-2.5 rounded-lg flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {step === "ready" && existingTeams.length === 0 && !showEditor && (
          <div className="mt-3 space-y-3">
            <div className="text-center py-2">
              <p className="text-sm text-muted-foreground mb-3">
                No teams yet. Auto-generate up to 500 teams or build one manually from {players.length} real players.
              </p>
              {/* License lock banner */}
              {!license.isLicensed && (
                <div className="mb-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 p-3 text-center">
                  <div className="flex items-center justify-center gap-1.5 mb-1">
                    <Lock className="w-4 h-4 text-amber-600" />
                    <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
                      License Required to Generate Teams
                    </p>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Activate your CRICB license key to unlock team generation, auto pick, GL generator & more.
                  </p>
                </div>
              )}
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <Button
                  onClick={() => license.requireLicense() && setShowSweepGenerator(true)}
                  className={cn(license.isLicensed ? "brand-gradient text-white" : "bg-slate-300 text-slate-500 dark:bg-slate-700 dark:text-slate-400")}
                  disabled={players.length < 11}
                >
                  {license.isLicensed ? <Zap className="w-4 h-4 mr-1.5" /> : <Lock className="w-4 h-4 mr-1.5" />}
                  {license.isLicensed ? "Auto Generate Teams" : "Auto Generate (Locked)"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => license.requireLicense() && (() => {
                    setEditingTeam(null);
                    setShowEditor(true);
                  })()}
                  disabled={players.length === 0}
                  className={cn(!license.isLicensed && "border-amber-300 text-amber-600 dark:border-amber-800 dark:text-amber-400")}
                >
                  {license.isLicensed ? <Plus className="w-4 h-4 mr-1.5" /> : <Lock className="w-4 h-4 mr-1.5" />}
                  {license.isLicensed ? "Build Manually" : "Build (Locked)"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Existing teams list */}
      {step === "ready" && existingTeams.length > 0 && !showEditor && (
        <div className="space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs font-semibold text-muted-foreground">
              {existingTeams.length} team{existingTeams.length !== 1 ? "s" : ""} saved
            </p>
            <div className="flex gap-1.5 flex-wrap">
              {/* Transfer to Dream11 — always show */}
              <Button
                size="sm"
                onClick={() => {
                  if (!license.requireLicense()) return;
                  setSelectedTransferApp("dream11");
                  setShowBulkTransfer(true);
                }}
                className={cn(
                  license.isLicensed ? "bg-red-600 hover:bg-red-700 text-white" : "bg-slate-300 text-slate-500 dark:bg-slate-700",
                  !license.isLicensed && "cursor-pointer"
                )}
                disabled={existingTeams.length === 0}
              >
                {license.isLicensed ? <Send className="w-3.5 h-3.5 mr-1" /> : <Lock className="w-3.5 h-3.5 mr-1" />}
                {license.isLicensed ? "🏏 Dream11" : "Dream11 🔒"}
              </Button>
              {/* Transfer to My11Circle — always show */}
              <Button
                size="sm"
                onClick={() => {
                  if (!license.requireLicense()) return;
                  setSelectedTransferApp("my11circle");
                  setShowBulkTransfer(true);
                }}
                className={cn(
                  license.isLicensed ? "bg-sky-600 hover:bg-sky-700 text-white" : "bg-slate-300 text-slate-500 dark:bg-slate-700",
                  !license.isLicensed && "cursor-pointer"
                )}
                disabled={existingTeams.length === 0}
              >
                {license.isLicensed ? <Send className="w-3.5 h-3.5 mr-1" /> : <Lock className="w-3.5 h-3.5 mr-1" />}
                {license.isLicensed ? "⭕ My11Circle" : "My11 🔒"}
              </Button>
              <Button
                size="sm"
                onClick={() => license.requireLicense() && setShowFreeContests(true)}
                className={cn(
                  license.isLicensed ? "bg-amber-500 hover:bg-amber-600 text-white" : "bg-slate-300 text-slate-500 dark:bg-slate-700"
                )}
                disabled={existingTeams.length === 0}
              >
                {license.isLicensed ? <Gift className="w-3.5 h-3.5 mr-1" /> : <Lock className="w-3.5 h-3.5 mr-1" />}
                {license.isLicensed ? "Free Contests" : "Contests 🔒"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => license.requireLicense() && setShowSweepGenerator(true)}
                disabled={players.length < 11}
                className={cn(
                  "border-violet-200 text-violet-700 dark:text-violet-300",
                  !license.isLicensed && "border-amber-300 text-amber-600 dark:border-amber-800 dark:text-amber-400"
                )}
              >
                {license.isLicensed ? <Zap className="w-3.5 h-3.5 mr-1" /> : <Lock className="w-3.5 h-3.5 mr-1" />}
                {license.isLicensed ? "Auto Generate" : "Generate 🔒"}
              </Button>
              <Button
                size="sm"
                onClick={() => license.requireLicense() && (() => {
                  setEditingTeam(null);
                  setShowEditor(true);
                })()}
                className={cn(
                  license.isLicensed ? "brand-gradient text-white" : "bg-slate-300 text-slate-500 dark:bg-slate-700"
                )}
                disabled={players.length === 0}
              >
                {license.isLicensed ? <Plus className="w-4 h-4 mr-1" /> : <Lock className="w-4 h-4 mr-1" />}
                {license.isLicensed ? "Add Team" : "Add 🔒"}
              </Button>
            </div>
          </div>

          {existingTeams.map((t, i) => (
            <motion.div
              key={(t._id ?? t.teamId ?? i) as string}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="space-y-2"
            >
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  Team #{t.teamNo ?? i + 1}
                  {t.transferred && (
                    <span className="text-[9px] bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 px-1.5 py-0.5 rounded-full">
                      TRANSFERRED
                    </span>
                  )}
                  {lineupAnnounced && getNonPlayingPlayersInTeam(t, true, playingPlayerIds).length > 0 && (
                    <span className="text-[9px] bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 px-1.5 py-0.5 rounded-full font-bold animate-pulse">
                      ⚠ {getNonPlayingPlayersInTeam(t, true, playingPlayerIds).length} NON-PLAYING
                    </span>
                  )}
                </span>
                <div className="flex gap-1 flex-wrap">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => {
                      setEditingTeam(t);
                      setShowEditor(true);
                    }}
                  >
                    <Pencil className="w-3 h-3 mr-1" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px] text-violet-700 dark:text-violet-300"
                    onClick={() => {
                      setEditingTeam(t);
                      setShowEditor(true);
                    }}
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Replace
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px] text-red-600 hover:text-red-700"
                    onClick={() => handleDeleteTeam((t._id ?? t.teamId ?? "") as string)}
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
              <TeamDisplay
                team={t}
                team1Name={team1Name}
                team2Name={team2Name}
                team1Color={team1Color}
                team2Color={team2Color}
              />
              <TransferButtons
                team={t}
                match={match}
                linked={linkedApp === "dream11"}
                onTransfer={(app) => handleTransfer(t, app)}
                onLinkClick={() => setShowOtpLogin(true)}
                onJoinContests={() => setShowFreeContests(true)}
              />
            </motion.div>
          ))}
        </div>
      )}

      {/* Editor modal */}
      <AnimatePresence>
        {showEditor && (
          <TeamEditor
            key={(editingTeam?._id ?? editingTeam?.teamId ?? "new") as string}
            team={editingTeam}
            match={match}
            players={players}
            team1Name={team1Name}
            team2Name={team2Name}
            team1Color={team1Color}
            team2Color={team2Color}
            lineupAnnounced={lineupAnnounced}
            onClose={() => {
              setShowEditor(false);
              setEditingTeam(null);
              setStep("ready");
            }}
            onSave={(team) => {
              if (editingTeam?._id || editingTeam?.teamId) {
                handleEditTeam(
                  (editingTeam._id ?? editingTeam.teamId ?? "") as string,
                  team
                );
              } else {
                handleAddTeam(team);
              }
            }}
            saving={step === "saving"}
          />
        )}
      </AnimatePresence>

      {/* Link Dream11 modal (legacy — kept for backward compat) */}
      <AnimatePresence>
        {showLinkModal && (
          <LinkFantasyAppModal
            onClose={() => setShowLinkModal(false)}
            onLink={handleLinkApp}
          />
        )}
      </AnimatePresence>

      {/* OTP Login modal (mobile + OTP → links fantasy account) */}
      <OtpLoginModal
        open={showOtpLogin}
        onClose={() => setShowOtpLogin(false)}
        onLinked={(app, mobile, authToken) => {
          setLinkedApp(app);
          setShowOtpLogin(false);
          toast.success(`${app} linked via OTP (${mobile})`);
        }}
      />

      {/* APNA-style Transfer modal */}
      <ApnaTransferModal
        open={showBulkTransfer}
        defaultApp={selectedTransferApp}
        onClose={() => {
          setShowBulkTransfer(false);
          setRefreshKey((k) => k + 1);
        }}
        match={match}
        teams={existingTeams}
        onOpenOtpLogin={() => {
          setShowBulkTransfer(false);
          setShowOtpLogin(true);
        }}
      />

      {/* Free Contests modal */}
      <FreeContestsModal
        open={showFreeContests}
        onClose={() => setShowFreeContests(false)}
        match={match}
        teams={existingTeams}
        onOpenOtpLogin={() => {
          setShowFreeContests(false);
          setShowOtpLogin(true);
        }}
      />

      {/* Auto Team Generator (Sweep) modal */}
      <AnimatePresence>
        {showSweepGenerator && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setShowSweepGenerator(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              className="bg-background w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[95vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <AutoGenerator
                match={match}
                onClose={() => setShowSweepGenerator(false)}
                onGenerated={(teams) => {
                  handleBulkAddTeams(teams);
                  setShowSweepGenerator(false);
                }}
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TransferStepIndicator({ linked, teamsCount }: { linked: boolean; teamsCount: number }) {
  const steps = [
    { id: "fetch", label: "Fetch Players", done: true },
    { id: "build", label: "Build Team", done: teamsCount > 0 },
    { id: "link", label: "Link Dream11", done: linked },
    { id: "transfer", label: "Transfer", done: false },
  ];
  return (
    <div className="flex items-center gap-1">
      {steps.map((s, i) => {
        const active = s.done;
        const Icon = active ? Check : (i + 1).toString().padStart(1, "0");
        return (
          <div key={s.id} className="flex items-center gap-1.5 flex-1">
            <div
              className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0",
                active ? "brand-gradient text-white" : "bg-violet-50 dark:bg-violet-900/30 text-muted-foreground"
              )}
            >
              {typeof Icon === "string" ? Icon : <Check className="w-3 h-3" />}
            </div>
            <span className={cn("text-[10px] font-semibold", active ? "text-violet-700 dark:text-violet-300" : "text-muted-foreground")}>
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <div className={cn("flex-1 h-0.5 rounded-full", active && i < steps.length - 1 ? "brand-gradient" : "bg-violet-100 dark:bg-violet-900/30")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function TransferButtons({
  team,
  match,
  linked,
  onTransfer,
  onLinkClick,
  onJoinContests,
}: {
  team: TeamRow;
  match: MatchInfo;
  linked: boolean;
  onTransfer: (app: FantasyApp) => void;
  onLinkClick: () => void;
  onJoinContests: () => void;
}) {
  const [copied, setCopied] = useState(false);

  function buildTeamCode() {
    const players = (team.players || []).map((p) => p.player_fixed_id ?? p.pid ?? p.name).join(",");
    return `${match.matchId ?? match.id}|${players}|C:${team.captain ?? team.c}|VC:${team.viceCaptain ?? team.vc}`;
  }

  function handleCopy() {
    navigator.clipboard.writeText(buildTeamCode()).then(() => {
      setCopied(true);
      toast.success("Team code copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="grid grid-cols-4 gap-1.5">
      <Button
        size="sm"
        variant="outline"
        className="h-9 text-[11px] border-violet-200 hover:bg-violet-50"
        onClick={handleCopy}
      >
        {copied ? <Check className="w-3.5 h-3.5 mr-0.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 mr-0.5" />}
        {copied ? "Copied" : "Copy"}
      </Button>
      <Button
        size="sm"
        className={cn(
          "h-9 text-[11px] text-white",
          team.transferred ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"
        )}
        onClick={() => (linked ? onTransfer("dream11") : onLinkClick())}
        disabled={team.transferred}
      >
        {team.transferred ? <Check className="w-3.5 h-3.5 mr-0.5" /> : <Send className="w-3.5 h-3.5 mr-0.5" />}
        {team.transferred ? "Sent" : "Dream11"}
      </Button>
      <Button
        size="sm"
        className="h-9 text-[11px] bg-sky-600 hover:bg-sky-700 text-white"
        onClick={() => (linked ? onTransfer("my11circle") : onLinkClick())}
        disabled={team.transferred}
      >
        <ExternalLink className="w-3.5 h-3.5 mr-0.5" />
        My11
      </Button>
      <Button
        size="sm"
        className="h-9 text-[11px] bg-amber-500 hover:bg-amber-600 text-white"
        onClick={onJoinContests}
      >
        <Gift className="w-3.5 h-3.5 mr-0.5" />
        Join
      </Button>
    </div>
  );
}

/* ---------- Team Editor with REAL player picker ---------- */

function TeamEditor({
  team,
  match,
  players,
  team1Name,
  team2Name,
  team1Color,
  team2Color,
  lineupAnnounced,
  onClose,
  onSave,
  saving,
}: {
  team: TeamRow | null;
  match: MatchInfo;
  players: MatchPlayer[];
  team1Name: string;
  team2Name: string;
  team1Color: string;
  team2Color: string;
  lineupAnnounced: boolean;
  onClose: () => void;
  onSave: (team: Partial<TeamRow>) => void;
  saving: boolean;
}) {
  // Initialize selected player IDs from the team being edited
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(
      (team?.players || []).map((p) => String(p.player_fixed_id ?? p.pl_id ?? p.pid ?? p.name))
    )
  );
  const [captain, setCaptain] = useState(
    team ? String(team.captain ?? team.c ?? "") : ""
  );
  const [viceCaptain, setViceCaptain] = useState(
    team ? String(team.viceCaptain ?? team.vc ?? team.vicecaptain ?? "") : ""
  );
  const [search, setSearch] = useState("");
  const [filterTeam, setFilterTeam] = useState<string>("all");
  const [filterRole, setFilterRole] = useState<string>("all");

  const matchId = (match.matchId ?? match.id ?? "") as string;

  const filteredPlayers = players.filter((p) => {
    const name = String(p.name || "");
    if (search && !name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterTeam !== "all" && p.team_name !== filterTeam) return false;
    if (filterRole !== "all") {
      const r = roleFromPlayerType(p.player_type);
      if (r !== filterRole) return false;
    }
    return true;
  });

  function togglePlayer(p: MatchPlayer) {
    const id = String(p.player_fixed_id ?? p.pl_id ?? p.pid ?? p.name);
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
      // Reset C/VC if removed
      if (captain === id) setCaptain("");
      if (viceCaptain === id) setViceCaptain("");
    } else {
      if (next.size >= 11) {
        toast.error("Maximum 11 players selected");
        return;
      }
      next.add(id);
      // Auto-assign C/VC to first two
      if (!captain) setCaptain(id);
      else if (!viceCaptain && id !== captain) setViceCaptain(id);
    }
    setSelectedIds(next);
  }

  const selectedPlayers = players.filter((p) =>
    selectedIds.has(String(p.player_fixed_id ?? p.pl_id ?? p.pid ?? p.name))
  );

  const t1Count = selectedPlayers.filter((p) => p.team_name === team1Name).length;
  const t2Count = selectedPlayers.filter((p) => p.team_name === team2Name).length;
  const totalCredits = selectedPlayers.reduce((sum, p) => sum + (Number(p.credits) || 0), 0);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
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
        <div className="sticky top-0 brand-gradient text-white p-4 flex items-center justify-between z-10">
          <h3 className="font-bold flex items-center gap-2">
            {team ? "Edit Team" : "Build New Team"}
            <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full">
              {selectedIds.size}/11
            </span>
          </h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Lineup status notice */}
          {lineupAnnounced ? (
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  Playing XI Confirmed
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Only confirmed playing XI players are shown. Bench, retired, and unavailable players are hidden.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
                  Lineup Not Yet Announced
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  All available players are shown. Teams will be auto-refreshed when the official Playing XI is confirmed.
                </p>
              </div>
            </div>
          )}

          {/* Squad summary */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="rounded-lg bg-violet-50 dark:bg-violet-900/20 p-2">
              <p className="text-[10px] text-muted-foreground">{team1Name}</p>
              <p className="text-sm font-bold text-violet-700 dark:text-violet-300">{t1Count}</p>
            </div>
            <div className="rounded-lg bg-pink-50 dark:bg-pink-900/20 p-2">
              <p className="text-[10px] text-muted-foreground">{team2Name}</p>
              <p className="text-sm font-bold text-pink-700 dark:text-pink-300">{t2Count}</p>
            </div>
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 p-2">
              <p className="text-[10px] text-muted-foreground">Credits</p>
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{totalCredits.toFixed(1)}</p>
            </div>
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 p-2">
              <p className="text-[10px] text-muted-foreground">Left</p>
              <p className="text-sm font-bold text-amber-700 dark:text-amber-300">{(100 - totalCredits).toFixed(1)}</p>
            </div>
          </div>

          {/* Search + filters */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search players by name..."
                className="pl-9 h-9 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={filterTeam}
                onChange={(e) => setFilterTeam(e.target.value)}
                className="flex-1 h-8 text-xs rounded-lg border border-violet-100 dark:border-violet-900/30 bg-white dark:bg-card px-2 focus:outline-none"
              >
                <option value="all">All teams</option>
                <option value={team1Name}>{team1Name}</option>
                <option value={team2Name}>{team2Name}</option>
              </select>
              <div className="flex gap-1">
                {["all", "WK", "BAT", "AR", "BOWL"].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setFilterRole(r)}
                    className={cn(
                      "h-8 px-2 rounded-lg text-[10px] font-bold transition-colors",
                      filterRole === r
                        ? "brand-gradient text-white"
                        : "bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300"
                    )}
                  >
                    {r === "all" ? "ALL" : r}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Selected players (chips at top) */}
          {selectedPlayers.length > 0 && (
            <div className="bg-violet-50/30 dark:bg-violet-950/20 rounded-xl p-2">
              <p className="text-[10px] font-semibold text-muted-foreground mb-1.5 px-1">
                Selected ({selectedPlayers.length}/11)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {selectedPlayers.map((p) => {
                  const id = String(p.player_fixed_id ?? p.pl_id ?? p.pid ?? p.name);
                  const isC = captain === id;
                  const isVC = viceCaptain === id;
                  return (
                    <button
                      key={id}
                      onClick={() => togglePlayer(p)}
                      className={cn(
                        "inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md text-white",
                        p.team_name === team1Name ? "bg-violet-500" : "bg-pink-500"
                      )}
                    >
                      {p.name}
                      {isC && <Crown className="w-2.5 h-2.5 text-amber-300" />}
                      {isVC && <Star className="w-2.5 h-2.5 text-slate-200" />}
                      <X className="w-2.5 h-2.5 opacity-70" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Player list */}
          <div className="space-y-1.5 max-h-[40vh] overflow-y-auto scrollbar-thin pr-1">
            {filteredPlayers.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-6">
                {players.length === 0
                  ? "No player data available for this match."
                  : "No players match your filters."}
              </p>
            ) : (
              filteredPlayers.map((p) => {
                const id = String(p.player_fixed_id ?? p.pl_id ?? p.pid ?? p.name);
                const isSelected = selectedIds.has(id);
                const isC = captain === id;
                const isVC = viceCaptain === id;
                const role = roleFromPlayerType(p.player_type);
                return (
                  <button
                    key={id}
                    onClick={() => togglePlayer(p)}
                    className={cn(
                      "w-full flex items-center gap-2 p-2 rounded-lg border transition-colors text-left",
                      isSelected
                        ? "border-violet-300 bg-violet-50 dark:bg-violet-900/20 dark:border-violet-700"
                        : "border-violet-50 dark:border-violet-900/30 bg-white dark:bg-card hover:bg-violet-50/50 dark:hover:bg-violet-900/10"
                    )}
                  >
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0 overflow-hidden"
                      style={{ backgroundColor: p.team_name === team1Name ? team1Color : team2Color }}
                    >
                      {p.image ? (
                        <img
                          src={p.image}
                          alt={p.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                          }}
                        />
                      ) : (
                        shortName(p.name, 3)
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{p.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {p.team_name} · {role} · {p.credits}cr · {p.selected_by ?? p.sel}%
                      </p>
                    </div>
                    <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded", roleBadgeClass(role))}>
                      {role}
                    </span>
                    {isSelected && (
                      <Check className="w-4 h-4 text-violet-600 dark:text-violet-400 flex-shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Captain / Vice-Captain pickers */}
          {selectedPlayers.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1">
                  <Crown className="w-3 h-3 text-amber-500" /> Captain (2x points)
                </label>
                <select
                  value={captain}
                  onChange={(e) => setCaptain(e.target.value)}
                  className="w-full h-9 text-xs rounded-lg border border-violet-100 dark:border-violet-900/30 bg-white dark:bg-card px-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
                >
                  <option value="">Select Captain</option>
                  {selectedPlayers.map((p) => {
                    const id = String(p.player_fixed_id ?? p.pl_id ?? p.pid ?? p.name);
                    return (
                      <option key={id} value={id}>
                        {p.name} ({p.team_name})
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1">
                  <Star className="w-3 h-3 text-slate-400" /> Vice-Captain (1.5x)
                </label>
                <select
                  value={viceCaptain}
                  onChange={(e) => setViceCaptain(e.target.value)}
                  className="w-full h-9 text-xs rounded-lg border border-violet-100 dark:border-violet-900/30 bg-white dark:bg-card px-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
                >
                  <option value="">Select VC</option>
                  {selectedPlayers
                    .filter((p) => String(p.player_fixed_id ?? p.pl_id ?? p.pid ?? p.name) !== captain)
                    .map((p) => {
                      const id = String(p.player_fixed_id ?? p.pl_id ?? p.pid ?? p.name);
                      return (
                        <option key={id} value={id}>
                          {p.name} ({p.team_name})
                        </option>
                      );
                    })}
                </select>
              </div>
            </div>
          )}

          {/* Validation */}
          {selectedPlayers.length > 0 && selectedPlayers.length < 11 && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 text-center">
              Add {11 - selectedPlayers.length} more player{11 - selectedPlayers.length !== 1 ? "s" : ""} (max 11).
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1 sticky bottom-0 bg-white dark:bg-background pb-1">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              className="flex-1 brand-gradient text-white"
              disabled={saving || selectedPlayers.length === 0 || !captain || !viceCaptain}
              onClick={() => {
                onSave({
                  players: selectedPlayers.map((p) => ({
                    pid: p.player_fixed_id ?? p.pid,
                    name: p.name,
                    shortName: shortName(p.name, 4),
                    team: p.team_name,
                    role: roleFromPlayerType(p.player_type),
                    credits: p.credits,
                    selected_by: p.selected_by ?? p.sel,
                    image: p.image,
                    player_fixed_id: p.player_fixed_id,
                  })),
                  captain,
                  viceCaptain,
                  c: captain,
                  vc: viceCaptain,
                  matchId,
                });
              }}
            >
              {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5" />}
              {team ? "Save Changes" : "Add Team"}
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function roleBadgeClass(role: string): string {
  switch (role) {
    case "WK": return "bg-amber-500";
    case "BAT": return "bg-sky-500";
    case "AR": return "bg-emerald-500";
    case "BOWL": return "bg-rose-500";
    default: return "bg-slate-500";
  }
}

/* ---------- Link Fantasy App Modal ---------- */

function LinkFantasyAppModal({
  onClose,
  onLink,
}: {
  onClose: () => void;
  onLink: (app: FantasyApp, token: string) => void;
}) {
  const [app, setApp] = useState<FantasyApp>("dream11");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLink() {
    if (!token.trim()) {
      toast.error("Please enter your auth token");
      return;
    }
    setLoading(true);
    // Simulate verification (in real mode, calls verifyFantasyAuth)
    await new Promise((r) => setTimeout(r, 800));
    onLink(app, token.trim());
    setLoading(false);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        className="bg-white dark:bg-background w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 brand-gradient text-white p-4 flex items-center justify-between">
          <h3 className="font-bold">Link Fantasy App</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Link your Dream11/My11Circle account so we can transfer teams directly. Your token is stored locally in this browser.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setApp("dream11")}
              className={cn(
                "p-3 rounded-xl border-2 transition-colors text-center",
                app === "dream11"
                  ? "border-red-500 bg-red-50 dark:bg-red-950/30"
                  : "border-violet-100 dark:border-violet-900/30"
              )}
            >
              <div className="text-2xl mb-1">🏏</div>
              <p className="text-xs font-bold">Dream11</p>
            </button>
            <button
              onClick={() => setApp("my11circle")}
              className={cn(
                "p-3 rounded-xl border-2 transition-colors text-center",
                app === "my11circle"
                  ? "border-sky-500 bg-sky-50 dark:bg-sky-950/30"
                  : "border-violet-100 dark:border-violet-900/30"
              )}
            >
              <div className="text-2xl mb-1">⭕</div>
              <p className="text-xs font-bold">My11Circle</p>
            </button>
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground mb-1.5 block">
              {app === "dream11" ? "Dream11" : "My11Circle"} Auth Token
            </label>
            <Input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste your auth token here..."
              className="h-10"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Find your token in the {app === "dream11" ? "Dream11" : "My11Circle"} app settings.
            </p>
          </div>

          <Button
            className="w-full brand-gradient text-white h-11"
            disabled={loading || !token.trim()}
            onClick={handleLink}
          >
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {loading ? "Linking..." : `Link ${app === "dream11" ? "Dream11" : "My11Circle"}`}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
