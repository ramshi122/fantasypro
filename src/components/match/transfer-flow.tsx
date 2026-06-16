"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Send,
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
      await addTeam(token!, { matchId, team, type: "add" });
      toast.success("Team added successfully");
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
      await editTeam(token!, { matchId, teamId, team, type: "edit" });
      toast.success("Team updated");
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
  const [players, setPlayers] = useState<string>(
    team ? (team.players || []).map((p) => p.shortName || p.name || "").join(", ") : ""
  );
  const [captain, setCaptain] = useState(team ? String(team.captain ?? team.c ?? "") : "");
  const [viceCaptain, setViceCaptain] = useState(team ? String(team.viceCaptain ?? team.vc ?? "") : "");

  const matchId = (match.matchId ?? match.id ?? "") as string;

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
          <h3 className="font-bold">
            {team ? "Edit Team" : "Add New Team"}
          </h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs font-semibold text-foreground mb-1.5 block">
              Players (comma separated)
            </label>
            <textarea
              value={players}
              onChange={(e) => setPlayers(e.target.value)}
              placeholder="VK, RS, KL, ..."
              className="w-full min-h-[80px] rounded-xl border border-violet-100 dark:border-violet-900/30 bg-violet-50/30 dark:bg-violet-950/20 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Enter 11 player short names separated by commas.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-foreground mb-1.5 block">
                Captain #
              </label>
              <Input
                value={captain}
                onChange={(e) => setCaptain(e.target.value)}
                placeholder="1"
                className="h-10"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-foreground mb-1.5 block">
                Vice-Captain #
              </label>
              <Input
                value={viceCaptain}
                onChange={(e) => setViceCaptain(e.target.value)}
                placeholder="2"
                className="h-10"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              className="flex-1 brand-gradient text-white"
              disabled={saving || !players.trim()}
              onClick={() => {
                const playerList = players
                  .split(",")
                  .map((p) => p.trim())
                  .filter(Boolean)
                  .map((name, i) => ({
                    pid: i + 1,
                    shortName: name,
                    name,
                  }));
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
