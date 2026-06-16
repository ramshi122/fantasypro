"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  CheckCircle2,
  Copy,
  Crown,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Send,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useApp, useAuth } from "@/lib/store";
import {
  addTeam,
  editTeam,
  listTeams,
  type TeamRow,
  type MatchInfo,
} from "@/lib/api";
import { TeamDisplay } from "./team-display";
import { cn } from "@/lib/utils";
import { shortName, teamColor } from "@/lib/format";

type Step = "idle" | "verifying" | "fetching" | "ready" | "saving" | "done" | "error";

export function TransferFlow({ match }: { match: MatchInfo }) {
  const token = useAuth((s) => s.token);
  const [step, setStep] = useState<Step>("idle");
  const [existingTeams, setExistingTeams] = useState<TeamRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamRow | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const matchId = (match.matchId ?? match.id ?? "") as string;
  const team1Name = typeof match.team1 === "string" ? match.team1 : (match.team1?.shortName || match.team1?.name || "T1") as string;
  const team2Name = typeof match.team2 === "string" ? match.team2 : (match.team2?.shortName || match.team2?.name || "T2") as string;
  const team1Color = teamColor(team1Name);
  const team2Color = teamColor(team2Name);

  async function runFlow() {
    if (!token) {
      toast.error("Not authenticated");
      return;
    }
    setError(null);
    setStep("verifying");
    try {
      // 1. Verify Auth Token (already done at login, but the APK flow re-verifies)
      // We just proceed to fetch teams.
      setStep("fetching");
      const teams = await listTeams(token, matchId);
      setExistingTeams(teams);
      setStep("ready");
    } catch (err: any) {
      setError(err?.message || "Failed to load teams");
      setStep("error");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    runFlow();
  }, [refreshKey]);

  async function handleAddTeam(team: Partial<TeamRow>) {
    setStep("saving");
    try {
      const res = await addTeam(token!, { matchId, team, type: "add" });
      const offline = (res as { offline?: boolean }).offline;
      if (offline) {
        toast.success("Team saved locally (offline mode)");
      } else {
        toast.success("Team added successfully");
      }
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
      if (offline) {
        toast.success("Team updated locally (offline mode)");
      } else {
        toast.success("Team updated");
      }
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

  return (
    <div className="space-y-4">
      {/* Status banner */}
      <div className="bg-white dark:bg-card rounded-2xl border border-violet-100 dark:border-violet-900/30 p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">My Saved Teams</h3>
            <p className="text-[11px] text-muted-foreground">
              Match ID: {matchId || "—"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRefreshKey((k) => k + 1)}
            disabled={step === "verifying" || step === "fetching"}
          >
            <RefreshCw
              className={cn(
                "w-3.5 h-3.5 mr-1.5",
                (step === "verifying" || step === "fetching") && "animate-spin"
              )}
            />
            Refresh
          </Button>
        </div>

        <StepIndicator step={step} />

        {error && (
          <div className="mt-3 text-xs text-red-600 bg-red-50 dark:bg-red-950/30 p-2.5 rounded-lg">
            {error}
          </div>
        )}

        {step === "ready" && existingTeams.length === 0 && !showEditor && (
          <div className="mt-3 text-center py-6">
            <p className="text-sm text-muted-foreground mb-3">
              No teams yet. Generate your first team!
            </p>
            <Button
              onClick={() => {
                setEditingTeam(null);
                setShowEditor(true);
              }}
              className="brand-gradient text-white"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Add New Team
            </Button>
          </div>
        )}
      </div>

      {/* Existing teams list */}
      {step === "ready" && existingTeams.length > 0 && !showEditor && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground">
              {existingTeams.length} team{existingTeams.length !== 1 ? "s" : ""} saved
            </p>
            <Button
              size="sm"
              onClick={() => {
                setEditingTeam(null);
                setShowEditor(true);
              }}
              className="brand-gradient text-white"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Team
            </Button>
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
                <span className="text-xs font-bold text-foreground">
                  Team #{t.teamNo ?? i + 1}
                </span>
                <div className="flex gap-1">
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
              <TransferButtons team={t} match={match} />
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
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const steps = [
    { id: "verifying", label: "Verify Auth", icon: CheckCircle2 },
    { id: "fetching", label: "Fetch Teams", icon: RefreshCw },
    { id: "ready", label: "Ready", icon: Check },
  ];
  const activeIdx = step === "error" ? -1 : steps.findIndex((s) => s.id === step);
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((s, i) => {
        const active = i <= activeIdx;
        const Icon = s.icon;
        return (
          <div key={s.id} className="flex items-center gap-1.5 flex-1">
            <div
              className={cn(
                "w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0",
                active
                  ? "brand-gradient text-white"
                  : "bg-violet-50 dark:bg-violet-900/30 text-muted-foreground"
              )}
            >
              {i < activeIdx ? <Check className="w-3 h-3" /> : i + 1}
            </div>
            <span
              className={cn(
                "text-[10px] font-semibold",
                active ? "text-violet-700 dark:text-violet-300" : "text-muted-foreground"
              )}
            >
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-0.5 rounded-full",
                  i < activeIdx ? "brand-gradient" : "bg-violet-100 dark:bg-violet-900/30"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function TransferButtons({ team, match }: { team: TeamRow; match: MatchInfo }) {
  const [copied, setCopied] = useState(false);

  function buildTeamCode() {
    const players = (team.players || []).map((p) => p.pid ?? p.name).join(",");
    return `${match.matchId ?? match.id}|${players}|C:${team.captain ?? team.c}|VC:${team.viceCaptain ?? team.vc}`;
  }

  function handleCopy() {
    const code = buildTeamCode();
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      toast.success("Team code copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleDream11() {
    const url = match.dream11Url || "https://dream11.com";
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function handleMy11Circle() {
    const url = match.my11circleUrl || "https://www.my11circle.com";
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      <Button
        size="sm"
        variant="outline"
        className="h-9 text-[11px] border-violet-200 hover:bg-violet-50"
        onClick={handleCopy}
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 mr-1 text-emerald-500" />
        ) : (
          <Copy className="w-3.5 h-3.5 mr-1" />
        )}
        {copied ? "Copied" : "Copy"}
      </Button>
      <Button
        size="sm"
        className="h-9 text-[11px] bg-red-600 hover:bg-red-700 text-white"
        onClick={handleDream11}
      >
        <Send className="w-3.5 h-3.5 mr-1" />
        Dream11
      </Button>
      <Button
        size="sm"
        className="h-9 text-[11px] bg-sky-600 hover:bg-sky-700 text-white"
        onClick={handleMy11Circle}
      >
        <ExternalLink className="w-3.5 h-3.5 mr-1" />
        My11
      </Button>
    </div>
  );
}

function TeamEditor({
  team,
  match,
  onClose,
  onSave,
  saving,
}: {
  team: TeamRow | null;
  match: MatchInfo;
  onClose: () => void;
  onSave: (team: Partial<TeamRow>) => void;
  saving: boolean;
}) {
  // Existing players from team being edited, or empty list
  const [playerList, setPlayerList] = useState<
    Array<{ pid: number; name: string; shortName: string; team: string; role: string }>
  >(
    team?.players?.map((p, i) => ({
      pid: Number(p.pid ?? i + 1),
      name: String(p.name || p.shortName || `Player ${i + 1}`),
      shortName: String(p.shortName || p.name || `P${i + 1}`),
      team: String(p.team || ""),
      role: String(p.role || "bat"),
    })) || []
  );
  const [nameInput, setNameInput] = useState("");
  const [teamInput, setTeamInput] = useState("");
  const [roleInput, setRoleInput] = useState("bat");
  const [captain, setCaptain] = useState(
    team ? String(team.captain ?? team.c ?? "") : ""
  );
  const [viceCaptain, setViceCaptain] = useState(
    team ? String(team.viceCaptain ?? team.vc ?? "") : ""
  );

  const matchId = (match.matchId ?? match.id ?? "") as string;
  const team1Name = typeof match.team1 === "string" ? match.team1 : (match.team1?.shortName || match.team1?.name || "T1") as string;
  const team2Name = typeof match.team2 === "string" ? match.team2 : (match.team2?.shortName || match.team2?.name || "T2") as string;

  const ROLES = [
    { id: "wk", label: "WK" },
    { id: "bat", label: "BAT" },
    { id: "ar", label: "AR" },
    { id: "bowl", label: "BOWL" },
  ];

  function addPlayer() {
    const name = nameInput.trim();
    if (!name) return;
    if (playerList.length >= 11) {
      toast.error("Maximum 11 players allowed");
      return;
    }
    const pid = playerList.length + 1;
    const shortName = name.length > 4 ? name.slice(0, 4).toUpperCase() : name.toUpperCase();
    setPlayerList([
      ...playerList,
      { pid, name, shortName, team: teamInput || team1Name, role: roleInput },
    ]);
    setNameInput("");
    // Auto-set captain/vice-captain on first two players
    if (playerList.length === 0) setCaptain(String(pid));
    else if (playerList.length === 1 && !viceCaptain) setViceCaptain(String(pid));
  }

  function removePlayer(pid: number) {
    const next = playerList.filter((p) => p.pid !== pid).map((p, i) => ({ ...p, pid: i + 1 }));
    setPlayerList(next);
    // Reset C/VC if they pointed to removed player
    if (captain === String(pid)) setCaptain(next[0] ? String(next[0].pid) : "");
    if (viceCaptain === String(pid)) setViceCaptain(next[1] ? String(next[1].pid) : "");
  }

  function quickFill() {
    // Pre-fill 11 demo players split 7-4 between team1 and team2
    const demo = [
      { name: "Rohit", team: team1Name, role: "bat" },
      { name: "Shubman", team: team1Name, role: "bat" },
      { name: "Kohli", team: team1Name, role: "bat" },
      { name: "Rahul", team: team1Name, role: "wk" },
      { name: "Hardik", team: team1Name, role: "ar" },
      { name: "Jadeja", team: team1Name, role: "ar" },
      { name: "Bumrah", team: team1Name, role: "bowl" },
      { name: "Nabi", team: team2Name, role: "ar" },
      { name: "Rashid", team: team2Name, role: "bowl" },
      { name: "Gurbaz", team: team2Name, role: "wk" },
      { name: "Ibrahim", team: team2Name, role: "bat" },
    ];
    setPlayerList(
      demo.map((p, i) => ({
        pid: i + 1,
        name: p.name,
        shortName: p.name.slice(0, 4).toUpperCase(),
        team: p.team,
        role: p.role,
      }))
    );
    setCaptain("1");
    setViceCaptain("2");
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
        className="bg-white dark:bg-background w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 brand-gradient text-white p-4 flex items-center justify-between z-10">
          <h3 className="font-bold flex items-center gap-2">
            {team ? "Edit Team" : "Add New Team"}
            <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full">
              {playerList.length}/11 players
            </span>
          </h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Quick-fill button */}
          {playerList.length === 0 && (
            <button
              onClick={quickFill}
              className="w-full text-xs font-semibold text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-900/30 hover:bg-violet-100 dark:hover:bg-violet-900/50 py-2 rounded-lg transition-colors"
            >
              ⚡ Quick-fill with demo squad (11 players)
            </button>
          )}

          {/* Player list */}
          {playerList.length > 0 && (
            <div className="bg-violet-50/30 dark:bg-violet-950/20 rounded-xl p-2 space-y-1.5">
              {playerList.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 bg-white dark:bg-card rounded-lg p-2 border border-violet-50 dark:border-violet-900/30"
                >
                  <span className="w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">
                      {p.name}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {p.team} · {p.role.toUpperCase()}
                    </p>
                  </div>
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      captain === String(p.pid)
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                        : viceCaptain === String(p.pid)
                        ? "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                        : "bg-transparent"
                    }`}
                  >
                    {captain === String(p.pid) ? "C" : viceCaptain === String(p.pid) ? "VC" : ""}
                  </span>
                  <button
                    onClick={() => removePlayer(p.pid)}
                    className="text-red-400 hover:text-red-600 p-1"
                    aria-label="Remove player"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add player form */}
          {playerList.length < 11 && (
            <div className="border border-dashed border-violet-200 dark:border-violet-900/40 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-foreground">Add a player</p>
              <Input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addPlayer();
                  }
                }}
                placeholder="Player name (e.g. Virat Kohli)"
                className="h-9 text-sm"
              />
              <div className="flex gap-2">
                <select
                  value={teamInput}
                  onChange={(e) => setTeamInput(e.target.value)}
                  className="flex-1 h-9 text-xs rounded-lg border border-violet-100 dark:border-violet-900/30 bg-white dark:bg-card px-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
                >
                  <option value="">Team (auto)</option>
                  <option value={team1Name}>{team1Name}</option>
                  <option value={team2Name}>{team2Name}</option>
                </select>
                <div className="flex gap-1">
                  {ROLES.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setRoleInput(r.id)}
                      className={`h-9 px-2 rounded-lg text-[10px] font-bold transition-colors ${
                        roleInput === r.id
                          ? "brand-gradient text-white"
                          : "bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={addPlayer}
                disabled={!nameInput.trim()}
                className="w-full h-9 brand-gradient text-white"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add Player
              </Button>
            </div>
          )}

          {/* Captain / Vice-Captain pickers */}
          {playerList.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-foreground mb-1.5 block flex items-center gap-1">
                  <Crown className="w-3 h-3 text-amber-500" /> Captain
                </label>
                <select
                  value={captain}
                  onChange={(e) => setCaptain(e.target.value)}
                  className="w-full h-10 text-sm rounded-lg border border-violet-100 dark:border-violet-900/30 bg-white dark:bg-card px-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
                >
                  <option value="">Select C</option>
                  {playerList.map((p) => (
                    <option key={p.pid} value={String(p.pid)}>
                      {p.name} ({p.team})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-foreground mb-1.5 block flex items-center gap-1">
                  <Star className="w-3 h-3 text-slate-400" /> Vice-Captain
                </label>
                <select
                  value={viceCaptain}
                  onChange={(e) => setViceCaptain(e.target.value)}
                  className="w-full h-10 text-sm rounded-lg border border-violet-100 dark:border-violet-900/30 bg-white dark:bg-card px-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
                >
                  <option value="">Select VC</option>
                  {playerList.map((p) => (
                    <option key={p.pid} value={String(p.pid)}>
                      {p.name} ({p.team})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Validation hint */}
          {playerList.length > 0 && playerList.length < 11 && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400 text-center">
              Add {11 - playerList.length} more player{11 - playerList.length !== 1 ? "s" : ""} to complete the squad.
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2 sticky bottom-0 bg-white dark:bg-background pb-1">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              className="flex-1 brand-gradient text-white"
              disabled={saving || playerList.length === 0 || !captain || !viceCaptain}
              onClick={() => {
                onSave({
                  players: playerList,
                  captain: captain ? Number(captain) : 1,
                  viceCaptain: viceCaptain ? Number(viceCaptain) : 2,
                  matchId,
                });
              }}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-1.5" />
              )}
              {team ? "Save Changes" : "Add Team"}
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
