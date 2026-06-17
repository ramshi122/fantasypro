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
  Shield,
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
  type BulkTransferItem,
  type BulkTransferResult,
  type FantasyApp,
  type MatchInfo,
  type TeamRow,
} from "@/lib/api";
import { decrypt } from "@/lib/crypto";
import { cn } from "@/lib/utils";

const APP_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  dream11: { label: "Dream11", emoji: "🏏", color: "from-red-500 to-rose-600" },
  my11circle: { label: "My11Circle", emoji: "⭕", color: "from-sky-500 to-blue-600" },
};

interface TransferModalProps {
  open: boolean;
  onClose: () => void;
  match: MatchInfo;
  teams: TeamRow[];
  defaultApp: FantasyApp;
  onOpenOtpLogin: () => void;
}

type Phase = "loading" | "ready" | "link_generating" | "api_transferring" | "done";

interface LinkResult {
  teamNo: number;
  link?: string;
  success: boolean;
  message?: string;
}

export function ApnaTransferModal({
  open, onClose, match, teams, defaultApp, onOpenOtpLogin,
}: TransferModalProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [selectedApp, setSelectedApp] = useState<FantasyApp>(defaultApp);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [linkResults, setLinkResults] = useState<LinkResult[] | null>(null);
  const [apiResult, setApiResult] = useState<BulkTransferResult | null>(null);
  const [matchNumericId, setMatchNumericId] = useState("");
  const [matchDbId, setMatchDbId] = useState("");
  const [playerIdMap, setPlayerIdMap] = useState<Record<string, string>>({});
  const [existingTeams, setExistingTeams] = useState<Array<{ team_id: string; team_number: number }>>([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set());
  const [isLinked, setIsLinked] = useState(false);
  const [linkedMobile, setLinkedMobile] = useState("");
  const [activeTab, setActiveTab] = useState<"links" | "api">("links");

  const validTeams = teams.filter((t) => (t.players?.length || 0) >= 1);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedApp(defaultApp);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLinkResults(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setApiResult(null);

    const account = getLinkedAccount(defaultApp);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLinked(!!account);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLinkedMobile(account?.mobile || "");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveTab(account ? "api" : "links");

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

      // Fetch existing teams if linked
      if (account) {
        try {
          const existing = await listFantasyTeams({ fantasyApp: defaultApp, authToken: account.token, matchId: String(d.id || match.matchId || "") });
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
      setLinkResults(null); // eslint-disable-next-line react-hooks/set-state-in-effect
      setApiResult(null); // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedTeamIds(new Set());
    }
  }, [open]);

  if (!open) return null;

  function buildItems(): BulkTransferItem[] {
    return validTeams.map((t) => ({
      teamNo: t.teamNo ?? 0,
      playerIds: (t.players || []).map((p) => { const fid = String(p.player_fixed_id ?? p.pl_id ?? p.pid ?? ""); return playerIdMap[`${fid}|${selectedApp}`] || fid; }).filter(Boolean),
      captainId: (() => { const c = String(t.captain ?? t.c ?? ""); return playerIdMap[`${c}|${selectedApp}`] || c; })(),
      viceCaptainId: (() => { const v = String(t.viceCaptain ?? t.vc ?? t.vicecaptain ?? ""); return playerIdMap[`${v}|${selectedApp}`] || v; })(),
    }));
  }

  // PATH 1: Generate transfer links via /api/classic/dream11/addteam (NO OTP needed)
  async function handleGenerateLinks() {
    const items = buildItems();
    if (items.length === 0) { toast.error("No teams"); return; }
    setPhase("link_generating");
    setProgress({ done: 0, total: items.length });
    const results: LinkResult[] = [];

    for (let i = 0; i < items.length; i++) {
      const t = items[i];
      let link: string | undefined;

      // Try classic endpoint (no auth)
      try {
        const res = await fetch("https://tgsoftware-api.online/api/classic/dream11/addteam", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tgMatchId: matchDbId || matchNumericId, playerData: t.playerIds, captainData: t.captainId, vicecaptainData: t.viceCaptainId, generateLinkFlag: "general" }),
        });
        if (res.ok) {
          const text = await res.text();
          try {
            const j = JSON.parse(text);
            if (j.status === "success" && j.data) {
              if (typeof j.data === "string") { const dec = decrypt<any>(j.data); if (dec?.link) link = dec.link; }
              else if (typeof j.data === "object" && (j.data as any).link) link = (j.data as any).link;
            }
          } catch {}
        }
      } catch {}

      // Fallback: generate platform deep link
      if (!link) {
        const base = selectedApp === "dream11" ? "https://dream11.com" : "https://www.my11circle.com";
        link = `${base}/team/create?matchId=${matchNumericId}&players=${t.playerIds.join(",")}&captain=${t.captainId}&vicecaptain=${t.viceCaptainId}`;
      }

      results.push({ teamNo: t.teamNo, link, success: true });
      setProgress({ done: i + 1, total: items.length });
      if (i < items.length - 1) await new Promise((r) => setTimeout(r, 150));
    }

    setLinkResults(results);
    setPhase("done");
    toast.success(`${results.length} links generated — tap to open`);
  }

  // PATH 2: Authenticated transfer via /api/fantasy/add-team (OTP required)
  async function handleApiTransfer() {
    const account = getLinkedAccount(selectedApp);
    if (!account) { toast.error("Link via OTP first"); onOpenOtpLogin(); return; }

    const items = buildItems();
    const isReplace = selectedTeamIds.size > 0;
    const selectedIds = Array.from(selectedTeamIds);
    const teamsToSend = isReplace ? Math.min(items.length, selectedIds.length) : Math.min(items.length, Math.max(0, 11 - existingTeams.length));
    if (teamsToSend === 0) { toast.error("No teams to send"); return; }

    setPhase("api_transferring");
    setProgress({ done: 0, total: teamsToSend });

    try {
      const sendItems = items.slice(0, teamsToSend);
      const res = await bulkTransferToLinkedAccount(
        sendItems,
        { matchId: matchNumericId, fantasyApp: selectedApp, authToken: account.token, sportIndex: 0,
          my11circleChallenge: account.my11circleChallenge || undefined, my11circleUserId: account.my11circleUserId || undefined,
          mobileNumber: account.mobile || undefined, replaceMode: isReplace, existingTeamIds: isReplace ? selectedIds.slice(0, teamsToSend) : undefined },
        (done, total) => setProgress({ done, total })
      );
      setApiResult(res);
      setPhase("done");
      if (res.successCount > 0) toast.success(`${res.successCount}/${res.totalAttempted} transferred`);
      else toast.error("Transfer failed — relink OTP");
    } catch (err: any) {
      setApiResult({ totalAttempted: teamsToSend, successCount: 0, failCount: teamsToSend,
        results: items.slice(0, teamsToSend).map((it) => ({ teamNo: it.teamNo, success: false, message: err?.message || "Error" })), transferLinks: [] });
      setPhase("done");
    }
  }

  const replaceCount = Math.min(selectedTeamIds.size, validTeams.length);
  const bulkCount = Math.min(validTeams.length, Math.max(0, 11 - existingTeams.length));

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
                <p className="text-[10px] text-white/80">{validTeams.length} teams ready · Match {matchNumericId}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20"><X className="w-5 h-5" /></button>
          </div>

          <div className="p-4 space-y-4">
            {phase === "loading" && (
              <div className="py-8 text-center">
                <Loader2 className="w-10 h-10 mx-auto text-violet-500 animate-spin mb-3" />
                <p className="text-sm font-semibold">Loading...</p>
              </div>
            )}

            {phase === "ready" && (
              <>
                {/* Tab selector */}
                <div className="flex bg-violet-50 dark:bg-violet-900/20 rounded-xl p-1">
                  <button onClick={() => setActiveTab("links")}
                    className={cn("flex-1 h-9 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1",
                      activeTab === "links" ? "bg-white dark:bg-violet-950 text-violet-700 shadow-sm" : "text-muted-foreground")}>
                    <Link2 className="w-3.5 h-3.5" /> Direct Links
                  </button>
                  <button onClick={() => setActiveTab("api")}
                    className={cn("flex-1 h-9 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1",
                      activeTab === "api" ? "bg-white dark:bg-violet-950 text-violet-700 shadow-sm" : "text-muted-foreground")}>
                    <Send className="w-3.5 h-3.5" /> OTP Transfer
                  </button>
                </div>

                {/* TAB 1: Direct Links (NO OTP) */}
                {activeTab === "links" && (
                  <div className="space-y-3">
                    <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-3">
                      <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">✅ No Login Required</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Generates {APP_LABELS[selectedApp]?.label} links for all {validTeams.length} teams. Tap each link to load the team.
                      </p>
                    </div>
                    <Button className="w-full h-12 brand-gradient text-white font-bold" onClick={handleGenerateLinks} disabled={validTeams.length === 0}>
                      <Link2 className="w-4 h-4 mr-2" /> Generate {validTeams.length} Links
                    </Button>
                  </div>
                )}

                {/* TAB 2: OTP Transfer */}
                {activeTab === "api" && (
                  <div className="space-y-3">
                    {!isLinked ? (
                      <div className="text-center py-4">
                        <Lock className="w-10 h-10 mx-auto text-amber-500 mb-2" />
                        <p className="text-sm font-bold mb-1">OTP Required</p>
                        <p className="text-xs text-muted-foreground mb-3 px-4">
                          Link {APP_LABELS[selectedApp]?.label} via OTP to transfer teams directly via API.
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
                            <p className="text-[10px] text-muted-foreground">Token active · One-time OTP</p>
                          </div>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-white dark:bg-card rounded-xl p-2 border text-center"><p className="text-base font-black">{validTeams.length}</p><p className="text-[8px] text-muted-foreground uppercase">APNA</p></div>
                          <div className="bg-white dark:bg-card rounded-xl p-2 border text-center"><p className="text-base font-black">{existingTeams.length}</p><p className="text-[8px] text-muted-foreground uppercase">Platform</p></div>
                          <div className="bg-white dark:bg-card rounded-xl p-2 border text-center"><p className="text-base font-black">{Math.max(0, 11 - existingTeams.length)}</p><p className="text-[8px] text-muted-foreground uppercase">Slots</p></div>
                        </div>

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

                        <Button className="w-full h-12 brand-gradient text-white font-bold" onClick={handleApiTransfer}
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

            {/* Generating links */}
            {phase === "link_generating" && (
              <div className="py-8 text-center">
                <Loader2 className="w-12 h-12 mx-auto text-violet-500 animate-spin mb-3" />
                <p className="text-sm font-bold">Generating links...</p>
                <div className="mt-3 h-2 bg-violet-50 rounded-full overflow-hidden">
                  <motion.div className="h-full brand-gradient" animate={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">{progress.done}/{progress.total}</p>
              </div>
            )}

            {/* API transferring */}
            {phase === "api_transferring" && (
              <div className="py-8 text-center">
                <Loader2 className="w-12 h-12 mx-auto text-violet-500 animate-spin mb-3" />
                <p className="text-sm font-bold">Transferring via API...</p>
                <div className="mt-3 h-2 bg-violet-50 rounded-full overflow-hidden">
                  <motion.div className="h-full brand-gradient" animate={{ width: `${progress.total > 0 ? (progress.done / progress.total) * 100 : 0}%` }} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">{progress.done}/{progress.total}</p>
              </div>
            )}

            {/* Done — links */}
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

            {/* Done — API result */}
            {phase === "done" && apiResult && (
              <div className="space-y-3">
                <div className={cn("rounded-xl p-4 text-center", apiResult.successCount > 0 ? "bg-emerald-50 dark:bg-emerald-950/30" : "bg-red-50 dark:bg-red-950/30")}>
                  {apiResult.successCount > 0 ? <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-600 mb-2" /> : <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-2" />}
                  <p className="text-lg font-bold">{apiResult.successCount > 0 ? `${apiResult.successCount}/${apiResult.totalAttempted} transferred 🎉` : `${apiResult.failCount} failed`}</p>
                </div>
                {apiResult.failCount > 0 && (
                  <div className="rounded-xl bg-red-50 dark:bg-red-950/30 p-3">
                    <div className="max-h-24 overflow-y-auto space-y-1">
                      {apiResult.results.filter(r => !r.success).slice(0, 5).map(r => <p key={r.teamNo} className="text-[11px] text-red-600">Team #{r.teamNo}: {r.message || "Failed"}</p>)}
                    </div>
                    {apiResult.failCount === apiResult.totalAttempted && (
                      <Button size="sm" className="w-full h-8 brand-gradient text-white text-xs mt-2" onClick={() => { onClose(); onOpenOtpLogin(); }}>
                        <Zap className="w-3 h-3 mr-1" /> Relink via OTP
                      </Button>
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={onClose}>Close</Button>
                  <Button className="flex-1 brand-gradient text-white" onClick={() => { setApiResult(null); setPhase("ready"); }}>Again</Button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
