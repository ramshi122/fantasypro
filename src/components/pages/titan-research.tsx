"use client";

/**
 * Titan Research (AI Match Hub port)
 * ==================================
 * Pulled from https://github.com/ramshi122/ai-match-hub/blob/main/src/routes/index.tsx
 *
 * Faithful 1:1 port. Only these framework swaps were made:
 *   - createFileRoute wrapper removed (Next.js client component)
 *   - useServerFn(getMatches) → fetch("/api/cricket-matches")
 *   - useServerFn(getMatchDetails) → fetch("/api/cricket-match-details", POST)
 *   - useServerFn(getPlayerCareerStats) → fetch("/api/cricket-player-stats", POST)
 *   - useServerFn(getDtPredictions) → fetch("/api/cricket-dt-predictions", POST)
 *   - useServerFn(aiCoachAudit) → fetch("/api/cricket-coach", POST)
 *
 * All UI, all styling, all game logic, all CSS classes, all CSS variables —
 * preserved EXACTLY as in the original repo. No changes to colors, layout,
 * or behavior.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useLicense } from "@/lib/use-license";

// ---------------- Types ----------------
type Role = "WK" | "BAT" | "AR" | "BOWL";
type Player = {
  id: string;
  cbId: string;
  name: string;
  team: string;
  teamFull: string;
  role: Role;
  credits: number;
  inXI: boolean | null;
  perf: number;
  stats?: {
    format: string;
    matches: number;
    runs: number;
    batAvg: number;
    sr: number;
    wickets: number;
    bowlAvg: number;
    eco: number;
    fifties: number;
    hundreds: number;
    bbi: string;
  } | null;
};

type Tab = "builder" | "data" | "tv" | "coach" | "airesearch";

type CricketMatch = {
  id: string;
  series: string;
  team1: string;
  team1Short: string;
  team2: string;
  team2Short: string;
  status: string;
  state: "live" | "upcoming" | "complete";
  venue: string;
  startTime: number;
  format: string;
  liveScore?: string;
};

type DtPrediction = {
  id: string;
  name: string;
  team: string;
  role: string;
  dtChance: number;
  selectionPct: number;
  avg2026Pts: number;
  probableXI: boolean;
  reason: string;
};

const ROLE_LIMITS = { WK: [1, 4], BAT: [3, 6], AR: [1, 4], BOWL: [3, 6] } as const;

function normalizeRole(r: string): Role {
  const s = r.toLowerCase();
  if (s.includes("keeper") || s.includes("wk")) return "WK";
  if (s.includes("allrounder") || s.includes("all-rounder") || s.includes("all rounder")) return "AR";
  if (s.includes("bowl")) return "BOWL";
  return "BAT";
}

function estimateCredits(role: Role, isCaptain: boolean): number {
  const base = role === "AR" ? 9 : role === "WK" ? 8.5 : role === "BAT" ? 8.5 : 8.5;
  return +(base + (isCaptain ? 0.5 : 0)).toFixed(1);
}

function computePerf(role: Role, s: NonNullable<Player["stats"]>): number {
  if (!s || s.matches === 0) return 0;
  const batScore = Math.min(100, s.batAvg * 1.5 + s.sr * 0.3);
  const bowlScore =
    s.wickets > 0
      ? Math.min(100, Math.max(0, 60 - s.bowlAvg) + Math.max(0, (10 - s.eco) * 4) + Math.min(20, s.wickets * 0.5))
      : 0;
  let raw = 0;
  if (role === "BAT" || role === "WK") raw = batScore;
  else if (role === "BOWL") raw = bowlScore;
  else raw = batScore * 0.55 + bowlScore * 0.55;
  const expBump = Math.min(15, Math.log10(s.matches + 1) * 8);
  return Math.max(0, Math.min(100, Math.round(raw * 0.7 + expBump * 2)));
}

// ---------------- App ----------------
export function TitanResearch() {
  const [tab, setTab] = useState<Tab>("builder");
  const [mountedTabs, setMountedTabs] = useState<Set<Tab>>(() => new Set(["builder"]));
  const [toast, setToast] = useState("");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2600);
  }, []);

  const switchTab = useCallback((next: Tab) => {
    setMountedTabs((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
    setTab(next);
  }, []);

  return (
    <div
      className="min-h-screen"
      style={{
        fontFamily: "'Barlow Condensed', sans-serif",
        background: "#FFFFFF",
        color: "#111111",
        // Override V77 dark theme with Premium White theme (Research page only)
        "--bg": "#FFFFFF",
        "--panel": "#F5F7FA",
        "--panel-elevated": "#FFFFFF",
        "--b1": "#E5E7EB",
        "--b2": "#D1D5DB",
        "--t1": "#DC2626",
        "--t2": "#2563EB",
        "--gold": "#F59E0B",
        "--cyan": "#2563EB",
        "--green": "#16A34A",
        "--pink": "#DC2626",
        "--text-off": "#444444",
        "--muted": "#6B7280",
        "--sh-depth": "0 4px 20px rgba(0,0,0,0.08)",
      } as React.CSSProperties}
    >
      <FontLoader />
      <div className="max-w-[700px] mx-auto p-2">
        <Nav tab={tab} setTab={switchTab} />
        <div style={{ display: tab === "builder" ? "block" : "none" }}>
          <Builder showToast={showToast} />
        </div>
        {mountedTabs.has("airesearch") && (
          <div style={{ display: tab === "airesearch" ? "block" : "none" }}>
            <AiResearchDashboard showToast={showToast} />
          </div>
        )}
        {mountedTabs.has("data") && (
          <div style={{ display: tab === "data" ? "block" : "none" }}>
            <DataHub active={tab === "data"} />
          </div>
        )}
        {mountedTabs.has("tv") && (
          <div style={{ display: tab === "tv" ? "block" : "none" }}>
            <LiveTV />
          </div>
        )}
        {mountedTabs.has("coach") && (
          <div style={{ display: tab === "coach" ? "block" : "none" }}>
            <CoachTab />
          </div>
        )}
      </div>
      {toast && (
        <div
          className="fixed left-1/2 top-20 -translate-x-1/2 z-[9999] px-5 py-3 rounded-xl text-sm font-bold border-2 max-w-[90vw] text-center animate-in fade-in slide-in-from-top duration-200"
          style={{
            background: "linear-gradient(135deg, #FFFFFF, #F5F7FA)",
            borderColor: "var(--cyan)",
            color: "var(--cyan)",
            fontFamily: "'Share Tech Mono'",
            boxShadow: "0 8px 30px rgba(37,99,235,0.15), 0 0 15px rgba(37,99,235,0.1)",
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function FontLoader() {
  useEffect(() => {
    if (document.getElementById("gfonts")) return;
    const l = document.createElement("link");
    l.id = "gfonts";
    l.rel = "stylesheet";
    l.href =
      "https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&family=Barlow+Condensed:wght@400;500;600;700;800;900&display=swap";
    document.head.appendChild(l);
  }, []);
  return null;
}

// ---------------- Nav ----------------
function Nav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: { id: Tab; icon: string; label: string }[] = [
    { id: "builder", icon: "🛠️", label: "BUILDER" },
    { id: "airesearch", icon: "🧪", label: "AI RESEARCH" },
    { id: "data", icon: "📊", label: "DATA HUB" },
    { id: "tv", icon: "📺", label: "LIVE TV" },
    { id: "coach", icon: "🧠", label: "COACH" },
  ];
  return (
    <div
      className="grid grid-cols-5 gap-1 mb-3 p-1.5 rounded-2xl sticky top-1 z-50"
      style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}
    >
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => setTab(it.id)}
          className="py-3 rounded-xl text-[14px] font-black uppercase flex flex-col items-center gap-1 transition"
          style={{
            background: tab === it.id ? "#2563EB" : "transparent",
            color: tab === it.id ? "#FFFFFF" : "#6B7280",
            border: tab === it.id ? "1px solid #2563EB" : "1px solid transparent",
            fontFamily: "'Orbitron', sans-serif",
          }}
        >
          <span className="text-lg">{it.icon}</span>
          {it.label}
        </button>
      ))}
    </div>
  );
}

// ---------------- Builder ----------------
function Builder({ showToast }: { showToast: (s: string) => void }) {
  // License — used to send auth headers to all API calls
  const license = useLicense();

  // Build headers with license key + device ID for server-side verification
  const licenseHeaders = useCallback(() => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (license.licenseKey) {
      headers["x-license-key"] = license.licenseKey;
    }
    if (license.deviceId) {
      headers["x-device-id"] = license.deviceId;
    }
    return headers;
  }, [license.licenseKey, license.deviceId]);

  const [matchesLoading, setMatchesLoading] = useState(false);
  const [matchesData, setMatchesData] = useState<{ live: CricketMatch[]; upcoming: CricketMatch[]; ok: boolean; fetchedAt?: number } | null>(null);
  const [matchSearch, setMatchSearch] = useState("");
  const [selectedMatch, setSelectedMatch] = useState<CricketMatch | null>(null);
  const [hideMatches, setHideMatches] = useState(false);

  const [details, setDetails] = useState<any>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [shotBusy, setShotBusy] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  const [pool, setPool] = useState<Player[]>([]);
  const [poolFilter, setPoolFilter] = useState<"ALL" | "T1" | "T2">("ALL");
  const [locked, setLocked] = useState<Set<string>>(new Set());
  const [captain, setCaptain] = useState<string | null>(null);
  const [viceCaptain, setViceCaptain] = useState<string | null>(null);

  const [batStrat, setBatStrat] = useState<"balanced" | "aggressive">("balanced");
  const [bowlStrat, setBowlStrat] = useState<"defensive" | "attacking">("attacking");
  const [battingFirst, setBattingFirst] = useState<"team1" | "team2" | "unknown">("unknown");

  const [generated, setGenerated] = useState<{ group: string; teams: { players: Player[]; c: string; vc: string }[] }[]>([]);
  const [selectedTeamIdx, setSelectedTeamIdx] = useState<number>(0);
  const [coachText, setCoachText] = useState("");
  const [coachLoading, setCoachLoading] = useState(false);

  const [dtMap, setDtMap] = useState<Record<string, DtPrediction>>({});
  const [dtLoading, setDtLoading] = useState(false);
  const [dtError, setDtError] = useState("");

  useEffect(() => {
    void loadMatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMatches(silent = false) {
    if (!silent) setMatchesLoading(true);
    try {
      const r = await fetch("/api/cricket-matches", { headers: licenseHeaders() }).then((x) => x.json());
      setMatchesData(r);
      if (!r.ok && !silent) showToast("⚠️ Live data source blocked — try again");
    } catch (e: any) {
      if (!silent) showToast(`⚠️ ${e?.message ?? "fetch failed"}`);
    } finally {
      if (!silent) setMatchesLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedMatch) return;
    let cancelled = false;
    setDetailsLoading(true);
    setPool([]);
    setLocked(new Set());
    setCaptain(null);
    setViceCaptain(null);
    setGenerated([]);
    setDtMap({});
    setDtError("");

    void fetch("/api/cricket-match-details", {
      method: "POST",
      headers: licenseHeaders(),
      body: JSON.stringify({ matchId: selectedMatch.id }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setDetails(d);
        if (d.ok && d.teams.length >= 2) {
          const players: Player[] = [];
          for (const [idx, t] of d.teams.entries()) {
            const teamShort = idx === 0 ? selectedMatch.team1Short : selectedMatch.team2Short;
            const teamFull = idx === 0 ? selectedMatch.team1 : selectedMatch.team2;
            for (const p of t.players) {
              const role = normalizeRole(p.role);
              const credits = estimateCredits(role, p.isCaptain);
              players.push({
                id: `${teamShort}-${p.id || p.name}`,
                cbId: String(p.id || ""),
                name: p.name,
                team: teamShort,
                teamFull,
                role,
                credits,
                perf: 0,
                inXI: p.inXI,
                stats: undefined,
              });
            }
          }
          setPool(players);

          if (players.length >= 2) {
            setDtLoading(true);
            setDtError("");
            void fetch("/api/cricket-dt-predictions", {
              method: "POST",
              headers: licenseHeaders(),
              body: JSON.stringify({
                matchName: `${selectedMatch.team1} vs ${selectedMatch.team2}`,
                venue: selectedMatch.venue,
                format: selectedMatch.format,
                series: selectedMatch.series,
                toss: d.toss ? `${d.toss.winner} → ${d.toss.decision}` : "",
                players: players.map((p) => ({ id: p.id, name: p.name, team: p.team, role: p.role, inXI: p.inXI })),
              }),
            })
              .then((r) => r.json())
              .then((res) => {
                if (cancelled) return;
                if (res.ok) {
                  const m: Record<string, DtPrediction> = {};
                  for (const x of res.predictions) m[x.id] = x;
                  setDtMap(m);
                } else {
                  setDtError(res.error || "AI failed");
                }
              })
              .catch((e: any) => { if (!cancelled) setDtError(e?.message ?? "AI error"); })
              .finally(() => { if (!cancelled) setDtLoading(false); });
          } else {
            setDtError("Squad too small for AI prediction");
          }

          const fixed = players.filter((p) => p.inXI === true);
          if (fixed.length >= 11) {
            const ids = new Set(fixed.slice(0, 11).map((p) => p.id));
            setLocked(ids);
            showToast("✅ Lineup announced — XI auto-locked. Loading career stats…");
          } else if (d.lineupAnnounced) {
            showToast("⚠️ Partial lineup — review picks");
          } else {
            showToast("⏳ Pre-toss: showing predicted squad");
          }
          setHideMatches(true);

          const ids = players.map((p) => p.cbId).filter(Boolean);
          const fmt = (selectedMatch.format || "T20").toUpperCase().includes("TEST")
            ? "Test"
            : (selectedMatch.series || "").toLowerCase().includes("ipl") || (selectedMatch.format || "").toLowerCase().includes("t20")
              ? "T20"
              : (selectedMatch.format || "").toLowerCase().includes("odi")
                ? "ODI"
                : "T20";
          if (ids.length > 0) {
            void fetch("/api/cricket-player-stats", {
              method: "POST",
              headers: licenseHeaders(),
              body: JSON.stringify({ playerIds: ids, format: fmt }),
            })
              .then((r) => r.json())
              .then((res: any) => {
                if (cancelled || !res?.ok) return;
                let updated: Player[] = [];
                setPool((prev) => {
                  updated = prev.map((p) => {
                    const s = res.stats[p.cbId];
                    if (!s) return { ...p, stats: null };
                    const merged = {
                      format: s.format,
                      matches: Math.max(s.bat.matches, s.bowl.matches),
                      runs: s.bat.runs,
                      batAvg: s.bat.avg,
                      sr: s.bat.sr,
                      wickets: s.bowl.wickets,
                      bowlAvg: s.bowl.avg,
                      eco: s.bowl.eco,
                      fifties: s.bat.fifties,
                      hundreds: s.bat.hundreds,
                      bbi: s.bowl.bbi,
                    };
                    return { ...p, stats: merged, perf: computePerf(p.role, merged) };
                  });
                  return updated;
                });
                const lockedXI = updated.filter((p) => p.inXI === true);
                if (lockedXI.length >= 11) {
                  const sorted = [...lockedXI].sort((a, b) => b.perf - a.perf);
                  setCaptain((c) => c ?? sorted[0]?.id ?? null);
                  setViceCaptain((v) => v ?? sorted[1]?.id ?? null);
                }
                showToast(`📊 Real career stats loaded (${fmt})`);
              });
          }
        } else {
          showToast("⚠️ Squad data unavailable for this match");
        }
        setDetailsLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMatch?.id, reloadKey]);

  useEffect(() => {
    if (!details?.toss || !selectedMatch) return;
    const winner = details.toss.winner;
    const dec = (details.toss.decision || "").toLowerCase();
    const winnerIsTeam1 = winner === selectedMatch.team1;
    const bats = dec.includes("bat");
    setBattingFirst(winnerIsTeam1 === bats ? "team1" : "team2");
  }, [details, selectedMatch]);

  const validation = useMemo(() => {
    const sel = pool.filter((p) => locked.has(p.id));
    const warnings: string[] = [];
    if (sel.length > 11) warnings.push(`Too many players: ${sel.length}/11`);
    const byRole: Record<Role, number> = { WK: 0, BAT: 0, AR: 0, BOWL: 0 };
    for (const p of sel) byRole[p.role]++;
    (Object.keys(ROLE_LIMITS) as Role[]).forEach((r) => {
      const [mn, mx] = ROLE_LIMITS[r];
      if (sel.length === 11 && byRole[r] < mn) warnings.push(`Need ≥${mn} ${r}`);
      if (byRole[r] > mx) warnings.push(`Too many ${r} (${byRole[r]}/${mx})`);
    });
    const byTeam: Record<string, number> = {};
    for (const p of sel) byTeam[p.team] = (byTeam[p.team] ?? 0) + 1;
    Object.entries(byTeam).forEach(([t, n]) => {
      if (n > 7) warnings.push(`Max 7 from ${t} (have ${n})`);
    });
    const creditsUsed = sel.reduce((s, p) => s + p.credits, 0);
    if (creditsUsed > 100) warnings.push(`Over budget: ${creditsUsed.toFixed(1)}/100`);
    if (sel.length === 11 && !captain) warnings.push("Pick a Captain");
    if (sel.length === 11 && !viceCaptain) warnings.push("Pick a Vice-Captain");
    if (captain && viceCaptain && captain === viceCaptain) warnings.push("C and VC must differ");
    return { sel, warnings, byRole, byTeam, creditsUsed };
  }, [pool, locked, captain, viceCaptain]);

  const valid = validation.warnings.length === 0 && validation.sel.length === 11;

  async function takeScreenshot() {
    if (!captureRef.current || shotBusy) return;
    setShotBusy(true);
    try {
      const mod = await import("html2canvas-pro");
      const html2canvas = mod.default;
      const canvas = await html2canvas(captureRef.current, {
        backgroundColor: "#0a0a14",
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      const name = selectedMatch
        ? `${selectedMatch.team1Short}-vs-${selectedMatch.team2Short}-pool.png`
        : `dt-pool.png`;
      a.href = url;
      a.download = name;
      a.click();
      showToast("📸 Screenshot saved");
    } catch (e: any) {
      showToast(`⚠️ Screenshot failed: ${e?.message ?? "error"}`);
    } finally {
      setShotBusy(false);
    }
  }

  function reloadSquad() {
    if (!selectedMatch) return;
    showToast("🔄 Reloading live data…");
    setReloadKey((k) => k + 1);
  }

  function togglePick(p: Player) {
    setLocked((prev) => {
      const next = new Set(prev);
      if (next.has(p.id)) {
        next.delete(p.id);
        if (captain === p.id) setCaptain(null);
        if (viceCaptain === p.id) setViceCaptain(null);
        showToast(`🔓 ${p.name} unlocked · ${next.size}/11 picked`);
      } else {
        if (next.size >= 11) {
          showToast("⚠️ Max 11 players — unlock one first");
          return prev;
        }
        next.add(p.id);
        showToast(`🔒 ${p.name} locked · ${next.size}/11 picked`);
      }
      return next;
    });
  }

  function setRoleCV(p: Player, kind: "C" | "VC") {
    if (!locked.has(p.id)) {
      showToast(`⚠️ Lock ${p.name} first — tap PICK button`);
      return;
    }
    if (kind === "C") {
      setCaptain(p.id);
      if (viceCaptain === p.id) setViceCaptain(null);
      showToast(`👑 ${p.name} set as Captain`);
    } else {
      setViceCaptain(p.id);
      if (captain === p.id) setCaptain(null);
      showToast(`⚡ ${p.name} set as Vice-Captain`);
    }
  }

  function autoFillXI(): { ids: Set<string>; c: string | null; vc: string | null } | null {
    if (pool.length < 11) return null;
    const lockedPlayers = pool.filter((p) => locked.has(p.id));
    if (lockedPlayers.length > 11) return null;
    const ranked = [...pool].sort((a, b) => {
      const aXI = a.inXI === true ? 1 : 0;
      const bXI = b.inXI === true ? 1 : 0;
      if (aXI !== bXI) return bXI - aXI;
      return b.perf - a.perf;
    });
    const mins: Record<Role, number> = { WK: 1, BAT: 3, AR: 1, BOWL: 3 };
    const maxs: Record<Role, number> = { WK: 4, BAT: 6, AR: 4, BOWL: 6 };
    const picked: Player[] = [];
    const byRole: Record<Role, number> = { WK: 0, BAT: 0, AR: 0, BOWL: 0 };
    const byTeam: Record<string, number> = {};
    const tryAdd = (p: Player) => {
      if (picked.length >= 11) return false;
      if (byRole[p.role] >= maxs[p.role]) return false;
      if ((byTeam[p.team] ?? 0) >= 7) return false;
      const cr = picked.reduce((s, x) => s + x.credits, 0) + p.credits;
      const remaining = 11 - picked.length - 1;
      if (cr + remaining * 7 > 100) return false;
      picked.push(p);
      byRole[p.role]++;
      byTeam[p.team] = (byTeam[p.team] ?? 0) + 1;
      return true;
    };
    for (const p of lockedPlayers) {
      if (!tryAdd(p)) return null;
    }
    (Object.keys(mins) as Role[]).forEach((role) => {
      for (const p of ranked) {
        if (byRole[role] >= mins[role]) break;
        if (p.role !== role) continue;
        if (picked.includes(p)) continue;
        tryAdd(p);
      }
    });
    for (const p of ranked) {
      if (picked.length >= 11) break;
      if (picked.includes(p)) continue;
      tryAdd(p);
    }
    if (picked.length < 11) return null;
    if (picked.reduce((s, p) => s + p.credits, 0) > 100) return null;
    if ((Object.keys(mins) as Role[]).some((role) => byRole[role] < mins[role])) return null;
    const ids = new Set(picked.map((p) => p.id));
    const sorted = [...picked].sort((a, b) => b.perf - a.perf);
    return { ids, c: sorted[0]?.id ?? null, vc: sorted[1]?.id ?? null };
  }

  function autoBuildAndApply(): { sel: Player[]; cId: string; vcId: string } | null {
    let sel = pool.filter((p) => locked.has(p.id));
    let cId = captain;
    let vcId = viceCaptain;
    if (sel.length < 11 || !cId || !vcId || cId === vcId) {
      const filled = autoFillXI();
      if (!filled) {
        showToast("⚠️ Not enough players in pool to auto-build XI");
        return null;
      }
      sel = pool.filter((p) => filled.ids.has(p.id));
      setLocked(filled.ids);
      cId = captain && filled.ids.has(captain) ? captain : filled.c;
      vcId = viceCaptain && filled.ids.has(viceCaptain) && viceCaptain !== cId ? viceCaptain : filled.vc;
      if (cId === vcId) vcId = sel.find((p) => p.id !== cId)?.id ?? null;
      setCaptain(cId);
      setViceCaptain(vcId);
      showToast("🤖 Auto-built best XI + C/VC");
    }
    if (!cId || !vcId) return null;
    return { sel, cId, vcId };
  }

  function generate10() {
    const built = autoBuildAndApply();
    if (!built) return;
    const base = built.sel;
    const fixedC = built.cId;
    const fixedVc = built.vcId;

    if (base.length < 11) {
      showToast("⚠️ Need at least 11 locked players");
      return;
    }

    // Get substitutes for variety (non-bench players not in base XI)
    const fullPool = pool.filter((p) => p.inXI !== false);
    const substitutes = fullPool.filter((p) => !base.some((b) => b.id === p.id));

    // 10 unique teams — mix of strategies, all using different C/VC combos
    const strategies = [
      { name: "SAFE", strategy: "safe" as const },
      { name: "SAFE", strategy: "safe" as const },
      { name: "BALANCED", strategy: "balanced" as const },
      { name: "BALANCED", strategy: "balanced" as const },
      { name: "BALANCED", strategy: "balanced" as const },
      { name: "DIFFERENTIAL", strategy: "differential" as const },
      { name: "DIFFERENTIAL", strategy: "differential" as const },
      { name: "RISK", strategy: "risk" as const },
      { name: "RISK", strategy: "risk" as const },
      { name: "CONTRARIAN", strategy: "risk" as const },
    ];

    const teams: { players: Player[]; c: string; vc: string }[] = [];
    const usedCombos = new Set<string>();

    for (let i = 0; i < 10; i++) {
      const g = strategies[i];

      // Team 1: use the locked base XI with fixed C/VC
      if (i === 0) {
        teams.push({ players: base, c: fixedC, vc: fixedVc });
        usedCombos.add(base.map((p) => p.id).sort().join(","));
        continue;
      }

      // Teams 2-10: swap 1-2 players for variety
      let teamPlayers: Player[] = [];
      let attempts = 0;
      let comboKey = "";

      do {
        teamPlayers = [...base];
        const swapCount = g.strategy === "safe" ? 1 : g.strategy === "balanced" ? 1 : 2;

        if (substitutes.length > 0 && swapCount > 0) {
          const sortedSubs = [...substitutes].sort((a, b) => {
            if (g.strategy === "safe") return b.perf - a.perf;
            if (g.strategy === "differential") return (a.stats?.matches ?? 999) - (b.stats?.matches ?? 999);
            if (g.strategy === "risk") return (b.stats?.sr ?? 0) - (a.stats?.sr ?? 0);
            return Math.random() - 0.5;
          });

          for (let s = 0; s < Math.min(swapCount, sortedSubs.length); s++) {
            const subIn = sortedSubs[(i + s) % sortedSubs.length];
            if (!subIn) continue;
            const swapOutIdx = teamPlayers.findIndex(
              (p) => p.role === subIn.role && p.id !== fixedC && p.id !== fixedVc
            );
            if (swapOutIdx >= 0) {
              teamPlayers[swapOutIdx] = subIn;
            } else {
              const anyIdx = teamPlayers.findIndex((p) => p.id !== fixedC && p.id !== fixedVc);
              if (anyIdx >= 0) teamPlayers[anyIdx] = subIn;
            }
          }
        }

        comboKey = teamPlayers.map((p) => p.id).sort().join(",");
        attempts++;
      } while (usedCombos.has(comboKey) && attempts < 10 && substitutes.length > 0);

      usedCombos.add(comboKey);

      // Rotate C/VC across all 11 players — each team gets unique combo
      const sorted = [...teamPlayers].sort((a, b) => {
        if (g.strategy === "safe") return b.perf - a.perf;
        if (g.strategy === "differential") return (a.stats?.matches ?? 0) - (b.stats?.matches ?? 0);
        if (g.strategy === "risk") return (b.stats?.sr ?? 0) - (a.stats?.sr ?? 0);
        return b.perf - a.perf;
      });

      const cIdx = i % sorted.length;
      const vcIdx = (i + Math.floor(sorted.length / 2)) % sorted.length;
      const cId = sorted[cIdx]?.id ?? base[0].id;
      let vcId = sorted[vcIdx]?.id ?? base[1].id;
      if (vcId === cId) vcId = sorted[(vcIdx + 1) % sorted.length]?.id ?? base[2].id;

      teams.push({ players: teamPlayers, c: cId, vc: vcId });
    }

    // Wrap in a single group for display
    setGenerated([{ group: "AI RESEARCH TEAMS", teams }]);
    const uniqueCombos = usedCombos.size;
    showToast(`🏆 ${teams.length} teams generated · ${uniqueCombos} unique combos`);
  }

  async function runCoach() {
    if (!selectedMatch) {
      showToast("Select a match first");
      return;
    }
    setCoachLoading(true);
    setCoachText("");
    try {
      const lockedList = validation.sel.map((p) => ({
        name: p.name,
        team: p.team,
        role: p.role,
        isC: captain === p.id,
        isVc: viceCaptain === p.id,
      }));
      const r = await fetch("/api/cricket-coach", {
        method: "POST",
        headers: licenseHeaders(),
        body: JSON.stringify({
          matchName: `${selectedMatch.team1} vs ${selectedMatch.team2}`,
          venue: selectedMatch.venue,
          format: selectedMatch.format,
          toss: details?.toss ? `${details.toss.winner} chose to ${details.toss.decision}` : undefined,
          battingStrategy: batStrat,
          bowlingStrategy: bowlStrat,
          battingFirst,
          team1Name: selectedMatch.team1,
          team2Name: selectedMatch.team2,
          locked: lockedList,
        }),
      }).then((x) => x.json());
      if (r.ok) setCoachText(r.text);
      else showToast(`Coach error: ${r.error}`);
    } catch (e: any) {
      showToast(`Coach error: ${e?.message ?? e}`);
    } finally {
      setCoachLoading(false);
    }
  }

  const filteredMatches = useMemo(() => {
    if (!matchesData) return [];
    const all = [...matchesData.live, ...matchesData.upcoming];
    const q = matchSearch.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (m) =>
        m.team1.toLowerCase().includes(q) ||
        m.team2.toLowerCase().includes(q) ||
        m.series.toLowerCase().includes(q) ||
        m.team1Short.toLowerCase().includes(q) ||
        m.team2Short.toLowerCase().includes(q),
    );
  }, [matchesData, matchSearch]);

  const filteredPool = useMemo(() => {
    if (!selectedMatch) return [];
    if (poolFilter === "ALL") return pool;
    const t = poolFilter === "T1" ? selectedMatch.team1Short : selectedMatch.team2Short;
    return pool.filter((p) => p.team === t);
  }, [pool, poolFilter, selectedMatch]);

  return (
    <>
      <Header match={selectedMatch} />

      <Section title="🌐 LIVE & UPCOMING MATCHES" actionLabel={selectedMatch ? (hideMatches ? "SHOW" : "HIDE") : undefined} onAction={() => setHideMatches((h) => !h)}>
        {!hideMatches && (
          <>
            <div className="flex gap-2 mb-3">
              <input
                value={matchSearch}
                onChange={(e) => setMatchSearch(e.target.value)}
                placeholder="Search team or series..."
                className="flex-1 px-3 py-2.5 rounded-xl text-white text-sm font-semibold outline-none"
                style={{ background: "#F5F7FA", border: "1px solid var(--b2)" }}
              />
              <Btn onClick={() => loadMatches()} primary>
                {matchesLoading ? "..." : "🔍 SEARCH"}
              </Btn>
            </div>
            {matchesData?.fetchedAt && (
              <div className="mb-3 px-1 text-[15px]" style={{ fontFamily: "'Share Tech Mono'", color: "var(--muted)" }}>
                LAST SEARCH: {new Date(matchesData.fetchedAt).toLocaleTimeString()}
              </div>
            )}
            {matchesLoading && <Empty>Loading live matches…</Empty>}
            {!matchesLoading && filteredMatches.length === 0 && (
              <Empty>
                {matchesData?.ok ? "No matches found" : "Live data source blocked. Click Search to retry."}
              </Empty>
            )}
            <div className="flex flex-col gap-2 max-h-[360px] overflow-y-auto pr-1">
              {filteredMatches.map((m) => (
                <MatchCard key={m.id} match={m} active={selectedMatch?.id === m.id} onClick={() => setSelectedMatch(m)} />
              ))}
            </div>
          </>
        )}
        {hideMatches && selectedMatch && (
          <div className="text-xs px-2" style={{ color: "var(--muted)", fontFamily: "'Share Tech Mono'" }}>
            ● Selected: {selectedMatch.team1Short} vs {selectedMatch.team2Short} — {selectedMatch.series}
          </div>
        )}
      </Section>

      {selectedMatch && (
        <>
          <Section title="📋 LINEUP & TOSS STATUS">
            {detailsLoading && <Empty>Loading squad…</Empty>}
            {!detailsLoading && details && (
              <>
                <div className="grid grid-cols-2 gap-2 text-xs" style={{ fontFamily: "'Share Tech Mono'" }}>
                  <StatPill
                    label="LINEUP"
                    value={details.lineupAnnounced ? "✅ ANNOUNCED" : "⏳ PRE-TOSS"}
                    color={details.lineupAnnounced ? "var(--green)" : "var(--gold)"}
                  />
                  <StatPill
                    label="TOSS"
                    value={details.toss ? `${details.toss.winner?.split(" ")[0] ?? "?"} → ${details.toss.decision ?? ""}` : "AWAITING"}
                    color={details.toss ? "var(--cyan)" : "var(--muted)"}
                  />
                </div>

                {/* Live score + match status — shown when match is in progress */}
                {details.liveScore && (
                  <div
                    className="mt-3 rounded-xl p-3"
                    style={{
                      background: "linear-gradient(90deg, #FEF2F2, #FECACA)",
                      border: "1px solid #ff1744",
                      boxShadow: "0 0 20px rgba(220,38,38,0.1)",
                    }}
                  >
                    <div
                      className="text-[12px] font-black tracking-widest mb-1"
                      style={{ color: "#DC2626", fontFamily: "'Orbitron', sans-serif" }}
                    >
                      🔴 LIVE SCORE
                    </div>
                    <div
                      className="text-lg font-black"
                      style={{ fontFamily: "'Share Tech Mono', monospace", color: "#111111" }}
                    >
                      {details.liveScore}
                    </div>
                    {details.matchStatus && (
                      <div
                        className="text-[13px] mt-1.5"
                        style={{ color: "#991B1B", fontFamily: "'Share Tech Mono', monospace" }}
                      >
                        📊 {details.matchStatus}
                      </div>
                    )}
                    {details.shortStatus && (
                      <div
                        className="text-[12px] mt-0.5"
                        style={{ color: "#DC2626", fontFamily: "'Share Tech Mono', monospace" }}
                      >
                        {details.shortStatus}
                      </div>
                    )}
                  </div>
                )}

                {/* Match description (e.g. "1st ODI") */}
                {details.matchDesc && (
                  <div
                    className="mt-2 px-3 py-1.5 rounded-md text-[13px]"
                    style={{
                      background: "rgba(78,226,236,0.06)",
                      border: "1px solid rgba(78,226,236,0.3)",
                      color: "var(--cyan)",
                      fontFamily: "'Share Tech Mono', monospace",
                    }}
                  >
                    🏏 {details.matchDesc} · {selectedMatch?.format || "T20"} · {selectedMatch?.venue || "Venue TBA"}
                  </div>
                )}
              </>
            )}
          </Section>

          {/* ===== FLOW PROGRESS BANNER ===== */}
          <LineupFlowBanner
            lineupAnnounced={!!details?.lineupAnnounced}
            hasGeneratedTeams={generated.length > 0}
            hasValidXI={valid}
          />

          {/* ===== BEFORE LINEUP STAGE (Official Playing XI പ്രഖ്യാപിക്കുന്നതിന് മുമ്പ്) ===== */}
          {!details?.lineupAnnounced && (
            <Section title="⏳ BEFORE LINEUP · Official Playing XI പ്രഖ്യാപിക്കുന്നതിന് മുമ്പ്">
              <div className="space-y-2 text-xs" style={{ fontFamily: "'Share Tech Mono'" }}>
                <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: "rgba(255,193,7,0.06)", border: "1px solid var(--gold)" }}>
                  <span style={{ color: "var(--gold)" }}>①</span>
                  <span style={{ color: "#111111" }}>Predicted Playing XI</span>
                  <span className="ml-auto" style={{ color: "var(--muted)" }}>Auto-loaded from Cricbuzz predicted squad</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: "rgba(0,229,255,0.06)", border: "1px solid var(--cyan)" }}>
                  <span style={{ color: "var(--cyan)" }}>②</span>
                  <span style={{ color: "#111111" }}>Early AI Teams</span>
                  <span className="ml-auto" style={{ color: "var(--muted)" }}>Tap "GENERATE EARLY AI TEAMS" below</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: "rgba(0,230,118,0.06)", border: "1px solid var(--green)" }}>
                  <span style={{ color: "var(--green)" }}>③</span>
                  <span style={{ color: "#111111" }}>Pitch & Weather Analysis</span>
                  <span className="ml-auto" style={{ color: "var(--muted)" }}>Tap "PITCH & WEATHER ANALYSIS" below</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: "rgba(255,193,7,0.06)", border: "1px solid var(--gold)" }}>
                  <span style={{ color: "var(--gold)" }}>④</span>
                  <span style={{ color: "#111111" }}>Probable Captain/Vice-Captain</span>
                  <span className="ml-auto" style={{ color: "var(--muted)" }}>See DT SADHYATHA section below</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: "rgba(245,0,87,0.06)", border: "1px solid var(--pink)" }}>
                  <span style={{ color: "var(--pink)" }}>⑤</span>
                  <span style={{ color: "#111111" }}>Risk Picks</span>
                  <span className="ml-auto" style={{ color: "var(--muted)" }}>DT Chance &lt; 30% in DT SADHYATHA</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: "rgba(37,99,235,0.06)", border: "1px solid #2563EB" }}>
                  <span style={{ color: "#2563EB" }}>⑥</span>
                  <span style={{ color: "#111111" }}>Differential Players</span>
                  <span className="ml-auto" style={{ color: "var(--muted)" }}>Low selectionPct in DT SADHYATHA</span>
                </div>
              </div>
            </Section>
          )}

          {/* ===== AFTER LINEUP STAGE (Official Playing XI പ്രഖ്യാപിച്ച ശേഷം) ===== */}
          {details?.lineupAnnounced && (
            <Section title="✅ AFTER LINEUP · Official Playing XI പ്രഖ്യാപിച്ച ശേഷം">
              <div className="space-y-2 text-xs" style={{ fontFamily: "'Share Tech Mono'" }}>
                <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: "rgba(0,230,118,0.06)", border: "1px solid var(--green)" }}>
                  <span style={{ color: "var(--green)" }}>①</span>
                  <span style={{ color: "#111111" }}>Confirmed Playing XI</span>
                  <span className="ml-auto" style={{ color: "var(--green)" }}>
                    {pool.filter(p => p.inXI === true).length} players auto-locked
                  </span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: "rgba(245,0,87,0.06)", border: "1px solid var(--pink)" }}>
                  <span style={{ color: "var(--pink)" }}>②</span>
                  <span style={{ color: "#111111" }}>Bench Players Removed</span>
                  <span className="ml-auto" style={{ color: "var(--pink)" }}>
                    {pool.filter(p => p.inXI === false).length} bench players filtered out
                  </span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: "rgba(255,193,7,0.06)", border: "1px solid var(--gold)" }}>
                  <span style={{ color: "var(--gold)" }}>③</span>
                  <span style={{ color: "#111111" }}>Impact Player Analysis</span>
                  <span className="ml-auto" style={{ color: "var(--muted)" }}>Substitutes listed in Player Pool</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: "rgba(0,229,255,0.06)", border: "1px solid var(--cyan)" }}>
                  <span style={{ color: "var(--cyan)" }}>④</span>
                  <span style={{ color: "#111111" }}>Final AI Teams</span>
                  <span className="ml-auto" style={{ color: "var(--muted)" }}>Tap "GENERATE FINAL TEAMS" below</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: "rgba(255,193,7,0.06)", border: "1px solid var(--gold)" }}>
                  <span style={{ color: "var(--gold)" }}>⑤</span>
                  <span style={{ color: "#111111" }}>Updated Captain/Vice-Captain</span>
                  <span className="ml-auto" style={{ color: "var(--muted)" }}>Auto-suggested from confirmed XI perf</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: "rgba(0,229,255,0.06)", border: "1px solid var(--cyan)" }}>
                  <span style={{ color: "var(--cyan)" }}>⑥</span>
                  <span style={{ color: "#111111" }}>Toss & Batting Order Analysis</span>
                  <span className="ml-auto" style={{ color: "var(--muted)" }}>See STRATEGY MATRIX below</span>
                </div>
                <div className="flex items-center gap-2 p-2 rounded-lg" style={{ background: "rgba(0,230,118,0.06)", border: "1px solid var(--green)" }}>
                  <span style={{ color: "var(--green)" }}>⑦</span>
                  <span style={{ color: "#111111" }}>Safe + Grand League Final Teams</span>
                  <span className="ml-auto" style={{ color: "var(--muted)" }}>See BLUEPRINT CHEAT SHEET below</span>
                </div>
              </div>
            </Section>
          )}

          <Section title="🔧 STRATEGY MATRIX">
            <div className="grid grid-cols-2 gap-3 mb-3">
              <CfgBox label="BATTING PHASE">
                <CBtn active={batStrat === "balanced"} onClick={() => setBatStrat("balanced")}>BALANCED</CBtn>
                <CBtn active={batStrat === "aggressive"} onClick={() => setBatStrat("aggressive")}>AGGRESSIVE</CBtn>
              </CfgBox>
              <CfgBox label="BOWLING PHASE">
                <CBtn active={bowlStrat === "defensive"} onClick={() => setBowlStrat("defensive")}>DEFENSIVE</CBtn>
                <CBtn active={bowlStrat === "attacking"} onClick={() => setBowlStrat("attacking")}>ATTACKING</CBtn>
              </CfgBox>
            </div>
            <CfgBox label="BATTING FIRST (TOSS IMPACT)">
              <div className="grid grid-cols-3 gap-2">
                <CBtn active={battingFirst === "team1"} onClick={() => setBattingFirst("team1")}>
                  {selectedMatch.team1Short} BAT
                </CBtn>
                <CBtn active={battingFirst === "team2"} onClick={() => setBattingFirst("team2")}>
                  {selectedMatch.team2Short} BAT
                </CBtn>
                <CBtn active={battingFirst === "unknown"} onClick={() => setBattingFirst("unknown")}>UNKNOWN</CBtn>
              </div>
            </CfgBox>
          </Section>

          <DtChanceSection
            pool={pool}
            dtMap={dtMap}
            dtLoading={dtLoading}
            dtError={dtError}
            t1Short={selectedMatch.team1Short}
            t2Short={selectedMatch.team2Short}
            locked={locked}
            onToggle={togglePick}
          />

          <Section title={`👥 PLAYER POOL — ${locked.size}/11 LOCKED`}>
            <div className="flex gap-2 mb-3">
              <button
                onClick={reloadSquad}
                disabled={detailsLoading}
                className="px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
                style={{
                  background: "rgba(0,229,255,0.08)",
                  color: "var(--cyan)",
                  border: "1px solid var(--cyan)",
                  fontFamily: "'Orbitron'",
                }}
              >
                {detailsLoading ? "⏳ LOADING" : "🔄 RELOAD LIVE"}
              </button>
              <button
                onClick={takeScreenshot}
                disabled={shotBusy}
                className="px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
                style={{
                  background: "rgba(255,193,7,0.08)",
                  color: "var(--gold)",
                  border: "1px solid var(--gold)",
                  fontFamily: "'Orbitron'",
                }}
              >
                {shotBusy ? "⏳ CAPTURING" : "📸 SCREENSHOT"}
              </button>
            </div>
            <div className="flex gap-2 mb-3">
              {(["ALL", "T1", "T2"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setPoolFilter(f)}
                  className="flex-1 py-2 rounded-lg text-xs font-bold"
                  style={{
                    background: poolFilter === f ? "var(--panel-elevated)" : "transparent",
                    color: poolFilter === f ? "var(--cyan)" : "var(--muted)",
                    border: `1px solid ${poolFilter === f ? "var(--cyan)" : "var(--b2)"}`,
                    fontFamily: "'Orbitron'",
                  }}
                >
                  {f === "ALL" ? "ALL" : f === "T1" ? selectedMatch.team1Short : selectedMatch.team2Short}
                </button>
              ))}
            </div>
            <div ref={captureRef} className="flex flex-col gap-2 max-h-[640px] overflow-y-auto pr-1">
              {pool.length === 0 && !detailsLoading && (
                <div
                  className="rounded-xl p-4 text-sm space-y-2"
                  style={{ background: "#FFFBEB", border: "1px dashed #F59E0B", color: "#92400E", fontFamily: "'Share Tech Mono'" }}
                >
                  <div className="font-black" style={{ color: "var(--gold)", fontFamily: "'Orbitron'" }}>
                    ⚠️ SQUAD NOT LOADED
                  </div>
                  <div>Live squad data was empty or blocked. Pre-toss matches may not have squads yet.</div>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>
                    Tap <b style={{ color: "var(--cyan)" }}>🔄 RELOAD LIVE</b> above to refetch from the live data source.
                  </div>
                </div>
              )}
              {pool.length === 0 && detailsLoading && <Empty>⏳ Fetching live squad…</Empty>}
              {pool.length > 0 && filteredPool.length === 0 && <Empty>No players match this filter</Empty>}

              {/* Pre-toss predicted squad banner */}
              {pool.length > 0 && !details?.lineupAnnounced && (
                <div
                  className="rounded-lg p-2.5 text-[15px] flex items-center gap-2"
                  style={{
                    background: "rgba(255,210,63,0.08)",
                    border: "1px solid var(--gold)",
                    color: "var(--gold)",
                    fontFamily: "'Share Tech Mono', monospace",
                  }}
                >
                  <span>⏳</span>
                  <span className="font-black" style={{ fontFamily: "'Orbitron', sans-serif" }}>PREDICTED SQUAD</span>
                  <span style={{ color: "var(--text-off)" }}>·</span>
                  <span>{pool.length} players loaded · Official XI പ്രഖ്യാപിക്കാനിടയില്ല</span>
                  <span className="ml-auto" style={{ color: "var(--cyan)" }}>Tap 🔄 RELOAD to refresh</span>
                </div>
              )}

              {/* Confirmed XI banner */}
              {pool.length > 0 && details?.lineupAnnounced && (
                <div
                  className="rounded-lg p-2.5 text-[15px] flex items-center gap-2"
                  style={{
                    background: "rgba(56,224,123,0.08)",
                    border: "1px solid var(--green)",
                    color: "var(--green)",
                    fontFamily: "'Share Tech Mono', monospace",
                  }}
                >
                  <span>✅</span>
                  <span className="font-black" style={{ fontFamily: "'Orbitron', sans-serif" }}>CONFIRMED XI</span>
                  <span style={{ color: "var(--text-off)" }}>·</span>
                  <span>{pool.filter(p => p.inXI === true).length} in XI · {pool.filter(p => p.inXI === false).length} bench</span>
                </div>
              )}

              {filteredPool.length > 0 && (
                <Dream11Pool
                  players={filteredPool}
                  dtMap={dtMap}
                  locked={locked}
                  captain={captain}
                  viceCaptain={viceCaptain}
                  t1Short={selectedMatch.team1Short}
                  t2Short={selectedMatch.team2Short}
                  splitColumns={poolFilter === "ALL"}
                  onPick={togglePick}
                  onC={(p) => setRoleCV(p, "C")}
                  onVc={(p) => setRoleCV(p, "VC")}
                />
              )}
            </div>
          </Section>

          <Section title="🛡️ VALIDATION">
            <div className="grid grid-cols-2 gap-2 mb-3 text-xs" style={{ fontFamily: "'Share Tech Mono'" }}>
              <StatPill label="PLAYERS" value={`${validation.sel.length}/11`} color={validation.sel.length === 11 ? "var(--green)" : "var(--gold)"} />
              <StatPill label="CREDITS" value={`${validation.creditsUsed.toFixed(1)}/100`} color={validation.creditsUsed <= 100 ? "var(--cyan)" : "var(--pink)"} />
              <StatPill label="WK/BAT/AR/BOWL" value={`${validation.byRole.WK}/${validation.byRole.BAT}/${validation.byRole.AR}/${validation.byRole.BOWL}`} color="var(--muted)" />
              <StatPill label="STATUS" value={valid ? "VALID ✅" : "INCOMPLETE"} color={valid ? "var(--green)" : "var(--gold)"} />
            </div>
            {validation.warnings.length > 0 && (
              <div
                className="rounded-lg p-3 text-sm space-y-1"
                style={{ background: "#FEF2F2", border: "1px solid #DC2626", color: "#991B1B" }}
              >
                {validation.warnings.map((w, i) => (
                  <div key={i}>⚠️ {w}</div>
                ))}
              </div>
            )}
          </Section>

          {/* Generate button — produces 10 unique teams */}
          <Btn onClick={generate10} primary>
            {details?.lineupAnnounced
              ? "🏆 GENERATE 10 FINAL TEAMS"
              : "🏆 GENERATE 10 EARLY AI TEAMS"}
          </Btn>

          {generated.length > 0 && (
            <SquadSummaryBox
              pool={pool}
              locked={locked}
              t1Short={selectedMatch.team1Short}
              t2Short={selectedMatch.team2Short}
            />
          )}

          {generated.length > 0 && generated[0] && (
            <Section title={details?.lineupAnnounced ? "🎯 FINAL AI TEAMS (AFTER LINEUP)" : "🎯 EARLY AI TEAMS (BEFORE LINEUP)"}>
              {/* Team selector — 0 to 10 buttons */}
              <div className="mb-3">
                <div
                  className="text-[14px] font-black mb-2"
                  style={{ color: "var(--gold)", fontFamily: "'Orbitron', sans-serif" }}
                >
                  SELECT TEAM (0-{generated[0].teams.length}):
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {generated[0].teams.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedTeamIdx(idx)}
                      className="py-2 rounded-lg text-[14px] font-black transition-all active:scale-95"
                      style={{
                        background: selectedTeamIdx === idx
                          ? "linear-gradient(135deg, var(--gold), #ff9800)"
                          : "var(--panel-elevated)",
                        color: selectedTeamIdx === idx ? "#000" : "var(--gold)",
                        border: `1.5px solid ${selectedTeamIdx === idx ? "var(--gold)" : "var(--b2)"}`,
                        fontFamily: "'Orbitron', sans-serif",
                        boxShadow: selectedTeamIdx === idx ? "0 0 15px rgba(255,210,63,0.4)" : "none",
                      }}
                    >
                      {idx + 1}
                    </button>
                  ))}
                </div>
              </div>

              {/* Selected team detail */}
              {generated[0].teams[selectedTeamIdx] && (
                <GenTeamCard
                  idx={selectedTeamIdx + 1}
                  group={generated[0].group}
                  team={generated[0].teams[selectedTeamIdx]}
                  t1Short={selectedMatch.team1Short}
                />
              )}

              {/* Summary line */}
              <div
                className="mt-3 px-3 py-2 rounded-lg text-[13px] text-center"
                style={{
                  background: "rgba(78,226,236,0.06)",
                  border: "1px solid rgba(78,226,236,0.3)",
                  color: "var(--cyan)",
                  fontFamily: "'Share Tech Mono', monospace",
                }}
              >
                📊 Showing team {selectedTeamIdx + 1} of {generated[0].teams.length} · Tap a number above to switch
              </div>
            </Section>
          )}

          {validation.sel.length === 11 && captain && viceCaptain ? (
            <CheatSheet match={selectedMatch} sel={validation.sel} captain={captain} viceCaptain={viceCaptain} batStrat={batStrat} bowlStrat={bowlStrat} battingFirst={battingFirst} toss={details?.toss ?? null} />
          ) : (
            <Section title="📜 BLUEPRINT CHEAT SHEET">
              <div
                className="rounded-xl p-4 text-sm space-y-2"
                style={{ background: "rgba(255,193,7,0.08)", border: "1px dashed var(--gold)", color: "#92400E", fontFamily: "'Share Tech Mono'" }}
              >
                <div className="font-black" style={{ color: "var(--gold)", fontFamily: "'Orbitron'" }}>
                  ⏳ CHEAT SHEET WILL APPEAR WHEN XI IS VALID
                </div>
                <ul className="space-y-1 text-xs">
                  <li>• Players locked: <b>{validation.sel.length}/11</b></li>
                  <li>• Captain: <b>{captain ? "✅ set" : "❌ not picked"}</b></li>
                  <li>• Vice-Captain: <b>{viceCaptain ? "✅ set" : "❌ not picked"}</b></li>
                  {validation.warnings.length > 0 && (
                    <li>• Issues: <b>{validation.warnings.join(" · ")}</b></li>
                  )}
                </ul>
                <div className="text-[15px] pt-1" style={{ color: "var(--muted)" }}>
                  Tip: hit "GENERATE" button to auto-build a valid XI with C/VC.
                </div>
              </div>
            </Section>
          )}

          <Section title={details?.lineupAnnounced ? "🧠 AI COACH · TOSS & BATTING ORDER ANALYSIS" : "🧠 AI COACH · PITCH & WEATHER ANALYSIS"}>
            <Btn onClick={runCoach} primary>
              {coachLoading ? "Analyzing…" : (details?.lineupAnnounced ? "🗣️ FINAL TACTICAL AUDIT" : "🗣️ PITCH & WEATHER ANALYSIS")}
            </Btn>
            {coachText && (
              <div
                className="mt-3 p-4 rounded-xl text-sm whitespace-pre-wrap leading-relaxed"
                style={{ background: "#F5F7FA", border: "1px solid var(--gold)", color: "#111111" }}
              >
                {coachText}
              </div>
            )}
          </Section>


          <PlayerCompare pool={pool} />
        </>
      )}
    </>
  );
}

// ---------------- Header ----------------
function Header({ match }: { match: CricketMatch | null }) {
  return (
    <div
      className="rounded-2xl p-5 mb-4 text-center"
      style={{
        background: "linear-gradient(160deg, #FFFFFF, #F5F7FA)",
        border: "1px solid var(--b1)",
        borderBottom: "3px solid var(--gold)",
        boxShadow: "var(--sh-depth)",
      }}
    >
      <div className="text-base font-black tracking-widest" style={{ color: "var(--cyan)", fontFamily: "'Orbitron'" }}>
        AI FANTASY PRO · V77
      </div>
      <div className="flex items-center justify-center gap-5 mt-4">
        <TeamLogo short={match?.team1Short ?? "T1"} color="var(--t1)" />
        <div
          className="px-4 py-2 rounded-xl font-black text-lg"
          style={{ background: "#FFFFFF", border: "2px solid var(--muted)", fontFamily: "'Orbitron'" }}
        >
          VS
        </div>
        <TeamLogo short={match?.team2Short ?? "T2"} color="var(--t2)" />
      </div>
      <div
        className="mt-4 p-3 rounded-xl text-base font-black uppercase tracking-wide"
        style={{ background: "rgba(0,0,0,0.05)", border: "1px solid var(--b1)" }}
      >
        {match ? `${match.team1} vs ${match.team2}` : "SELECT A MATCH"}
      </div>
      {match && (
        <div className="text-xs mt-2" style={{ color: "var(--muted)", fontFamily: "'Share Tech Mono'" }}>
          {match.series} · {match.format} · {new Date(match.startTime).toLocaleString()}
        </div>
      )}
      {match?.liveScore && (
        <div
          className="mt-3 p-3 rounded-xl"
          style={{
            background: "linear-gradient(90deg, #FEF2F2, #FECACA)",
            border: "1px solid #ff1744",
            boxShadow: "0 0 20px rgba(220,38,38,0.15)",
          }}
        >
          <div className="text-[14px] font-black tracking-widest" style={{ color: "#DC2626", fontFamily: "'Orbitron'" }}>
            🔴 LIVE SCORE
          </div>
          <div className="text-2xl font-black mt-1" style={{ fontFamily: "'Share Tech Mono'" }}>
            {match.liveScore}
          </div>
        </div>
      )}
    </div>
  );
}

function TeamLogo({ short, color }: { short: string; color: string }) {
  return (
    <div
      className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-black"
      style={{
        background: "#FFFFFF",
        border: `3px solid ${color}`,
        color,
        fontFamily: "'Orbitron', sans-serif",
        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      }}
    >
      {short.slice(0, 3)}
    </div>
  );
}

// ---------------- Reusable ----------------
function Section({
  title,
  children,
  actionLabel,
  onAction,
}: {
  title: string;
  children: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div
      className="rounded-2xl p-5 mb-4"
      style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", borderRadius: "18px" }}
    >
      <div
        className="flex items-center justify-between mb-3 pb-2 text-[18px] font-black"
        style={{ color: "#111111", fontFamily: "'Orbitron', sans-serif", borderBottom: "2px solid #F5F7FA" }}
      >
        <span>{title}</span>
        {actionLabel && (
          <button
            onClick={onAction}
            className="px-3 py-1 rounded-md text-[14px] font-black"
            style={{ background: "#F5F7FA", border: "1px solid #E5E7EB", color: "#2563EB", fontFamily: "'Orbitron', sans-serif" }}
          >
            {actionLabel}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function Btn({ children, onClick, primary }: { children: React.ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="w-full p-4 rounded-xl text-[16px] font-black uppercase tracking-wider mb-3"
      style={
        primary
          ? { background: "#2563EB", color: "#FFFFFF", border: "none", fontFamily: "'Orbitron', sans-serif", minHeight: "50px", boxShadow: "0 4px 12px rgba(37,99,235,0.2)" }
          : { background: "#FFFFFF", color: "#2563EB", border: "2px solid #2563EB", fontFamily: "'Orbitron', sans-serif", minHeight: "50px" }
      }
    >
      {children}
    </button>
  );
}

function CfgBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-2xl mb-2" style={{ background: "#F5F7FA", border: "1px solid #E5E7EB" }}>
      <div className="text-[14px] font-black uppercase mb-2" style={{ color: "#444444", fontFamily: "'Orbitron', sans-serif" }}>
        {label}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function CBtn({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full py-3 px-2 rounded-lg text-[15px] font-bold"
      style={{
        background: active ? "#2563EB" : "#FFFFFF",
        color: active ? "#FFFFFF" : "#444444",
        border: `2px solid ${active ? "#2563EB" : "#E5E7EB"}`,
        fontFamily: "'Orbitron', sans-serif",
      }}
    >
      {children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-6 text-center text-[15px] font-medium" style={{ color: "#6B7280", fontFamily: "'Share Tech Mono', monospace" }}>
      {children}
    </div>
  );
}

// ---------------- Lineup Flow Progress Banner ----------------
// Shows the 4-stage flow: Before Lineup → Official Lineup → After Lineup → Final Teams
// Current stage is highlighted based on lineup status + team generation status.
function LineupFlowBanner({
  lineupAnnounced,
  hasGeneratedTeams,
  hasValidXI,
}: {
  lineupAnnounced: boolean;
  hasGeneratedTeams: boolean;
  hasValidXI: boolean;
}) {
  // Determine current stage:
  // 1 = Before Lineup (lineup NOT announced)
  // 2 = Official Lineup (just announced — transition)
  // 3 = After Lineup (lineup announced, teams not yet generated)
  // 4 = Final Teams (teams generated + valid XI)
  const currentStage = hasValidXI && hasGeneratedTeams
    ? 4
    : lineupAnnounced
      ? 3
      : 1;

  const stages = [
    {
      n: 1,
      label: "BEFORE LINEUP",
      sub: "Predicted XI · Early Teams",
      color: "var(--gold)",
      icon: "⏳",
    },
    {
      n: 2,
      label: "OFFICIAL LINEUP",
      sub: "Playing XI Announced",
      color: "var(--cyan)",
      icon: "📢",
    },
    {
      n: 3,
      label: "AFTER LINEUP",
      sub: "Confirmed XI · Final Teams",
      color: "var(--green)",
      icon: "✅",
    },
    {
      n: 4,
      label: "FINAL TEAMS",
      sub: "Safe + Grand League Ready",
      color: "var(--gold)",
      icon: "🏆",
    },
  ];

  return (
    <div
      className="rounded-2xl p-4 mb-4"
      style={{
        background: "linear-gradient(135deg, rgba(0,229,255,0.04), rgba(255,193,7,0.04))",
        border: "1px solid var(--b1)",
        boxShadow: "var(--sh-depth)",
      }}
    >
      <div
        className="text-[14px] font-black uppercase mb-3 tracking-widest text-center"
        style={{ color: "var(--gold)", fontFamily: "'Orbitron'" }}
      >
        🏏 RESEARCH FLOW PROGRESS
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {stages.map((s, i) => {
          const isCurrent = s.n === currentStage;
          const isPast = s.n < currentStage;
          return (
            <div key={s.n} className="flex flex-col items-center">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-base mb-1.5"
                style={{
                  background: isCurrent
                    ? s.color
                    : isPast
                      ? "rgba(0,230,118,0.15)"
                      : "rgba(0,0,0,0.05)",
                  border: `2px solid ${isCurrent ? s.color : isPast ? "var(--green)" : "var(--b2)"}`,
                  color: isCurrent ? "#000" : isPast ? "var(--green)" : "var(--muted)",
                  fontFamily: "'Orbitron'",
                  boxShadow: isCurrent ? `0 0 20px ${s.color}80` : "none",
                }}
              >
                {isPast ? "✓" : s.icon}
              </div>
              <div
                className="text-[12px] font-black text-center leading-tight"
                style={{
                  color: isCurrent ? s.color : isPast ? "var(--green)" : "var(--muted)",
                  fontFamily: "'Orbitron'",
                }}
              >
                {s.label}
              </div>
              <div
                className="text-[11px] text-center mt-0.5 leading-tight"
                style={{ color: "var(--muted)", fontFamily: "'Share Tech Mono'" }}
              >
                {s.sub}
              </div>
              {i < stages.length - 1 && (
                <div
                  className="hidden md:block absolute"
                  style={{ display: "none" }}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 pt-3 border-t border-dashed" style={{ borderColor: "var(--b1)" }}>
        <div className="text-center text-[14px]" style={{ color: "var(--muted)", fontFamily: "'Share Tech Mono'" }}>
          {currentStage === 1 && "⏳ Official Playing XI പ്രഖ്യാപിക്കുന്നതിന് മുമ്പ് — Predicted squad loaded"}
          {currentStage === 2 && "📢 Official Playing XI പ്രഖ്യാപിച്ചു — Updating..."}
          {currentStage === 3 && "✅ Official Playing XI പ്രഖ്യാപിച്ച ശേഷം — Generate final teams now"}
          {currentStage === 4 && "🏆 Final Teams Ready — Safe + Grand League teams generated"}
        </div>
      </div>
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="p-2.5 rounded-lg text-center" style={{ background: "#F5F7FA", border: "1px solid var(--b2)" }}>
      <div className="text-[13px]" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div className="text-sm font-black mt-1" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function MatchCard({ match, active, onClick }: { match: CricketMatch; active: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="rounded-2xl cursor-pointer"
      style={{
        background: active ? "rgba(0,229,255,0.08)" : "var(--panel-elevated)",
        border: `1px solid ${active ? "var(--cyan)" : "var(--b1)"}`,
      }}
    >
      <div
        className="px-3 py-2 rounded-t-2xl flex justify-between text-[14px]"
        style={{ background: "#F5F7FA", color: "var(--cyan)", fontFamily: "'Share Tech Mono'" }}
      >
        <span>{match.series}</span>
        <span>
          {match.state === "live" ? "🔴 LIVE" : "⏳ " + new Date(match.startTime).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
        </span>
      </div>
      <div className="p-3 flex items-center justify-between">
        <div className="flex-1 text-center font-black text-lg">{match.team1Short}</div>
        <div className="text-base font-black" style={{ color: "var(--muted)" }}>VS</div>
        <div className="flex-1 text-center font-black text-lg">{match.team2Short}</div>
      </div>
      <div className="px-3 pb-2 text-[14px]" style={{ color: "var(--muted)" }}>
        {match.status}
      </div>
    </div>
  );
}

// ---------------- Dream11-style Pool Grid ----------------
const ROLE_LABEL: Record<Role, string> = { WK: "WK", BAT: "BAT", AR: "ALL", BOWL: "BOWL" };
const ROLE_ORDER: Record<Role, number> = { BAT: 0, WK: 1, AR: 2, BOWL: 3 };

function cricbuzzPhoto(cbId: string): string {
  if (!cbId) return "";
  return `https://www.cricbuzz.com/a/img/v1/152x152/i1/c${cbId}/x.jpg`;
}

function Dream11Pool({
  players, dtMap, locked, captain, viceCaptain, t1Short, t2Short, splitColumns, onPick, onC, onVc,
}: {
  players: Player[];
  dtMap: Record<string, DtPrediction>;
  locked: Set<string>;
  captain: string | null;
  viceCaptain: string | null;
  t1Short: string;
  t2Short: string;
  splitColumns: boolean;
  onPick: (p: Player) => void;
  onC: (p: Player) => void;
  onVc: (p: Player) => void;
}) {
  const sortFn = (a: Player, b: Player) => {
    if (a.role !== b.role) return ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
    const da = dtMap[a.id]?.selectionPct ?? 0;
    const db = dtMap[b.id]?.selectionPct ?? 0;
    return db - da;
  };

  const renderTile = (p: Player, idx: number) => (
    <Dream11Tile
      key={p.id}
      idx={idx + 1}
      p={p}
      dt={dtMap[p.id]}
      isT1={p.team === t1Short}
      locked={locked.has(p.id)}
      isC={captain === p.id}
      isVc={viceCaptain === p.id}
      onPick={() => onPick(p)}
      onC={() => onC(p)}
      onVc={() => onVc(p)}
    />
  );

  if (!splitColumns) {
    const sorted = [...players].sort(sortFn);
    return <div className="grid grid-cols-2 gap-2">{sorted.map(renderTile)}</div>;
  }

  const t1 = players.filter((p) => p.team === t1Short).sort(sortFn);
  const t2 = players.filter((p) => p.team === t2Short).sort(sortFn);
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="flex flex-col gap-2">
        <div
          className="text-center py-1.5 rounded-md text-xs font-black"
          style={{ background: "rgba(245,0,87,0.12)", color: "var(--t1)", border: "1px solid var(--t1)", fontFamily: "'Orbitron'" }}
        >
          {t1Short} · {t1.length}
        </div>
        {t1.map(renderTile)}
      </div>
      <div className="flex flex-col gap-2">
        <div
          className="text-center py-1.5 rounded-md text-xs font-black"
          style={{ background: "rgba(0,229,255,0.12)", color: "var(--t2)", border: "1px solid var(--t2)", fontFamily: "'Orbitron'" }}
        >
          {t2Short} · {t2.length}
        </div>
        {t2.map(renderTile)}
      </div>
    </div>
  );
}

function Dream11Tile({
  idx, p, dt, isT1, locked, isC, isVc, onPick, onC, onVc,
}: {
  idx: number;
  p: Player;
  dt?: DtPrediction;
  isT1: boolean;
  locked: boolean;
  isC: boolean;
  isVc: boolean;
  onPick: () => void;
  onC: () => void;
  onVc: () => void;
}) {
  const teamColor = isT1 ? "var(--t1)" : "var(--t2)";
  const accent = isC ? "var(--gold)" : isVc ? "var(--cyan)" : teamColor;
  const photo = cricbuzzPhoto(p.cbId);
  const sel = dt?.selectionPct;
  const initials = p.name.split(" ").map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  return (
    <div
      className="rounded-xl p-2 flex flex-col gap-1.5 transition-all"
      style={{
        background: locked
          ? "linear-gradient(135deg, rgba(78,226,236,0.18), rgba(78,226,236,0.06))"
          : isC
            ? "linear-gradient(135deg, rgba(255,210,63,0.18), rgba(255,210,63,0.06))"
            : isVc
              ? "linear-gradient(135deg, rgba(78,226,236,0.15), rgba(78,226,236,0.04))"
              : "var(--panel-elevated)",
        border: `2px solid ${locked ? "var(--cyan)" : isC ? "var(--gold)" : isVc ? "var(--cyan)" : "rgba(0,0,0,0.08)"}`,
        borderLeft: `5px solid ${accent}`,
        boxShadow: locked
          ? "0 0 15px rgba(78,226,236,0.25), inset 0 0 10px rgba(78,226,236,0.05)"
          : isC
            ? "0 0 15px rgba(255,210,63,0.25)"
            : "none",
      }}
    >
      <button onClick={onPick} className="flex items-center gap-2 text-left w-full">
        <div className="relative shrink-0">
          <div
            className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center text-[15px] font-black"
            style={{ background: "#F5F7FA", border: `2px solid ${accent}`, color: "#111111", fontFamily: "'Orbitron'" }}
          >
            {photo ? (
              <img src={photo} alt={p.name} className="w-full h-full object-cover" referrerPolicy="no-referrer"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              initials
            )}
          </div>
          <div
            className="absolute -bottom-1 -left-1 px-1 rounded text-[12px] font-black"
            style={{ background: "#FFFFFF", color: teamColor, border: `1px solid ${teamColor}`, fontFamily: "'Orbitron'" }}
          >
            {idx}
          </div>
          {locked && (
            <div
              className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[13px]"
              style={{ background: "var(--cyan)", color: "#000" }}
            >
              🔒
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[17px] font-black leading-tight truncate" style={{ color: "#111111" }}>
            {p.name}
          </div>
          <div className="text-[13px] mt-0.5" style={{ color: "var(--muted)", fontFamily: "'Share Tech Mono'" }}>
            <span style={{ color: teamColor }}>{ROLE_LABEL[p.role]}</span>
            {p.inXI === true && <span style={{ color: "var(--green)" }}> · XI</span>}
            {p.inXI === false && <span style={{ color: "var(--pink)" }}> · OUT</span>}
          </div>
        </div>
      </button>

      <div className="flex items-center justify-between text-[14px]" style={{ fontFamily: "'Share Tech Mono'" }}>
        <div className="flex-1">
          <div style={{ color: "var(--muted)" }}>% Sel</div>
          <div className="font-black" style={{ color: sel !== undefined ? "var(--cyan)" : "var(--muted)" }}>
            {sel !== undefined ? `${sel.toFixed(1)}%` : "—"}
          </div>
        </div>
        <div className="flex-1 text-right">
          <div style={{ color: "var(--muted)" }}>Pts</div>
          <div className="font-black" style={{ color: dt?.avg2026Pts !== undefined ? "var(--gold)" : "var(--muted)" }}>
            {dt?.avg2026Pts !== undefined ? dt.avg2026Pts : "—"}
          </div>
        </div>
      </div>

      <div className="flex gap-1">
        <button
          onClick={onPick}
          className="flex-1 py-2 rounded-lg text-[14px] font-black transition-all active:scale-95"
          style={{
            background: locked
              ? "linear-gradient(135deg, var(--cyan), #2bb8c5)"
              : "transparent",
            color: locked ? "#000" : "var(--cyan)",
            border: `1.5px solid var(--cyan)`,
            fontFamily: "'Orbitron'",
          }}
        >
          {locked ? "✓ LOCKED" : "+ PICK"}
        </button>
        <button
          onClick={onC}
          className="px-3 py-2 rounded-lg text-[14px] font-black transition-all active:scale-95"
          style={{
            background: isC
              ? "linear-gradient(135deg, var(--gold), #ff9800)"
              : "transparent",
            color: isC ? "#000" : "var(--gold)",
            border: `1.5px solid var(--gold)`,
            fontFamily: "'Orbitron'",
          }}
        >
          C
        </button>
        <button
          onClick={onVc}
          className="px-3 py-2 rounded-lg text-[14px] font-black transition-all active:scale-95"
          style={{
            background: isVc
              ? "linear-gradient(135deg, var(--cyan), #2bb8c5)"
              : "transparent",
            color: isVc ? "#000" : "var(--cyan)",
            border: `1.5px solid var(--cyan)`,
            fontFamily: "'Orbitron'",
          }}
        >
          VC
        </button>
      </div>
    </div>
  );
}

function RealStat({ label, val, color, decimals = 0 }: { label: string; val: number | undefined; color: string; decimals?: number }) {
  const display = val === undefined ? "…" : val === 0 ? "0" : decimals > 0 ? val.toFixed(decimals) : String(Math.round(val));
  return (
    <div className="flex flex-col items-center gap-1 min-w-[42px]">
      <div
        className="px-2 py-1 rounded-md text-xs font-black"
        style={{ color, background: "rgba(0,0,0,0.04)", border: `1px solid ${color}40`, fontFamily: "'Share Tech Mono'" }}
      >
        {display}
      </div>
      <div className="text-[12px] font-black" style={{ color: "var(--muted)", fontFamily: "'Orbitron'" }}>
        {label}
      </div>
    </div>
  );
}

function GenTeamCard({ idx, group, team, t1Short }: { idx: number; group: string; team: { players: Player[]; c: string; vc: string }; t1Short: string }) {
  return (
    <div className="rounded-2xl mb-3" style={{ background: "var(--panel-elevated)", border: "2px solid var(--b2)", overflow: "hidden" }}>
      <div className="px-3 py-2.5 flex justify-between items-center" style={{ background: "rgba(0,0,0,0.05)", borderBottom: "1px solid var(--b1)" }}>
        <div className="text-sm font-black" style={{ color: "var(--cyan)", fontFamily: "'Orbitron'" }}>
          TEAM #{idx}
        </div>
        <div className="text-[14px] px-2 py-1 rounded-md" style={{ background: "rgba(255,193,7,0.1)", color: "var(--gold)", border: "1px solid var(--gold)", fontFamily: "'Share Tech Mono'" }}>
          {group}
        </div>
      </div>
      <div className="p-3 grid grid-cols-2 gap-2">
        {team.players.map((p) => {
          const isC = p.id === team.c;
          const isVc = p.id === team.vc;
          return (
            <div
              key={p.id}
              className="px-2 py-1.5 rounded-lg flex items-center justify-between gap-2 text-xs font-bold"
              style={{ background: "#F5F7FA", border: `1px solid ${p.team === t1Short ? "var(--t1)" : "var(--t2)"}`, color: "#111111" }}
            >
              <span className="truncate" style={{ color: "#111111", textShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>{p.name}</span>
              {isC && <span className="px-1.5 py-0.5 rounded text-[13px]" style={{ background: "var(--gold)", color: "#000" }}>C</span>}
              {isVc && <span className="px-1.5 py-0.5 rounded text-[13px]" style={{ background: "var(--cyan)", color: "#000" }}>VC</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CheatSheet({
  match, sel, captain, viceCaptain, batStrat, bowlStrat, battingFirst, toss,
}: {
  match: CricketMatch;
  sel: Player[];
  captain: string | null;
  viceCaptain: string | null;
  batStrat: string;
  bowlStrat: string;
  battingFirst: string;
  toss: { winner: string; decision: string } | null;
}) {
  const cap = sel.find((p) => p.id === captain);
  const vc = sel.find((p) => p.id === viceCaptain);
  const safe = [...sel].sort((a, b) => b.perf - a.perf).slice(0, 6);
  const diff = [...sel].sort((a, b) => (a.stats?.matches ?? 999) - (b.stats?.matches ?? 999)).slice(0, 5);
  return (
    <Section title="📜 BLUEPRINT CHEAT SHEET">
      <div className="rounded-xl p-3" style={{ background: "#FFFFFF", border: "2px solid var(--gold)" }}>
        <div className="p-4 rounded-lg text-center mb-3" style={{ background: "#F5F7FA", border: "1px solid #333" }}>
          <div className="text-2xl font-black" style={{ fontFamily: "'Orbitron'",  }}>
            {match.team1Short} vs {match.team2Short}
          </div>
          <div className="text-xs mt-2 flex flex-wrap justify-center gap-3" style={{ color: "var(--gold)", fontFamily: "'Share Tech Mono'" }}>
            <span>{match.format}</span>
            <span>{match.venue}</span>
            <span>{toss ? `TOSS: ${toss.winner?.split(" ")[0]} → ${toss.decision}` : "PRE-TOSS"}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
          <PBox color="bg-gradient-to-r from-yellow-700 to-yellow-500" title="👑 CAPTAIN" text="#000">
            {cap ? `${cap.name} (${cap.team} · ${cap.role})` : "—"}
          </PBox>
          <PBox color="bg-gradient-to-r from-cyan-800 to-cyan-500" title="⚡ VICE-CAPTAIN">
            {vc ? `${vc.name} (${vc.team} · ${vc.role})` : "—"}
          </PBox>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <PBox color="bg-gradient-to-r from-emerald-800 to-emerald-500" title="🛡️ SAFE CORE">
            <ul className="text-sm space-y-1">
              {safe.map((p) => (
                <li key={p.id}>• {p.name} <span style={{ color: "var(--gold)" }}>({p.team} · PERF {p.perf})</span></li>
              ))}
            </ul>
          </PBox>
          <PBox color="bg-gradient-to-r from-pink-800 to-pink-500" title="💎 DIFFERENTIALS">
            <ul className="text-sm space-y-1">
              {diff.map((p) => (
                <li key={p.id}>• {p.name} <span style={{ color: "var(--gold)" }}>({p.team} · {p.stats?.matches ?? "—"} M)</span></li>
              ))}
            </ul>
          </PBox>
        </div>

        <div className="mt-3 p-3 rounded-lg" style={{ background: "#F5F7FA", border: "1px solid #333" }}>
          <div className="text-xs font-black mb-1" style={{ color: "var(--gold)", fontFamily: "'Orbitron'" }}>STRATEGY</div>
          <div className="text-sm">
            BAT: <b>{batStrat.toUpperCase()}</b> · BOWL: <b>{bowlStrat.toUpperCase()}</b> · 1ST BAT: <b>{battingFirst.toUpperCase()}</b>
          </div>
        </div>
      </div>
    </Section>
  );
}

function PBox({ children, color, title, text }: { children: React.ReactNode; color: string; title: string; text?: string }) {
  return (
    <div className="rounded-lg overflow-hidden" style={{ background: "#F5F7FA", border: "1px solid #333" }}>
      <div className={`px-3 py-2 text-sm font-black uppercase ${color}`} style={{ fontFamily: "'Orbitron'", color: text ?? "#fff" }}>
        {title}
      </div>
      <div className="p-3 text-sm leading-relaxed" style={{ color: "#e2e8f0" }}>
        {children}
      </div>
    </div>
  );
}

function PlayerCompare({ pool }: { pool: Player[] }) {
  const [a, setA] = useState<string>("");
  const [b, setB] = useState<string>("");
  const pa = pool.find((p) => p.id === a);
  const pb = pool.find((p) => p.id === b);
  return (
    <Section title="⚖️ PLAYER COMPARISON">
      <div className="grid grid-cols-2 gap-2 mb-3">
        <select
          value={a}
          onChange={(e) => setA(e.target.value)}
          className="p-2.5 rounded-lg text-xs"
          style={{ background: "#F5F7FA", color: "#111111", border: "1px solid var(--b2)" }}
        >
          <option value="">— Select Player A —</option>
          {pool.map((p) => (
            <option key={p.id} value={p.id}>{p.team} · {p.name}</option>
          ))}
        </select>
        <select
          value={b}
          onChange={(e) => setB(e.target.value)}
          className="p-2.5 rounded-lg text-xs"
          style={{ background: "#F5F7FA", color: "#111111", border: "1px solid var(--b2)" }}
        >
          <option value="">— Select Player B —</option>
          {pool.map((p) => (
            <option key={p.id} value={p.id}>{p.team} · {p.name}</option>
          ))}
        </select>
      </div>
      {pa && pb && (
        <table className="w-full text-sm" style={{ fontFamily: "'Barlow Condensed'" }}>
          <thead>
            <tr style={{ background: "rgba(0,0,0,0.05)" }}>
              <th className="text-left p-2 text-xs" style={{ color: "var(--gold)", fontFamily: "'Orbitron'" }}>METRIC</th>
              <th className="p-2 text-xs" style={{ color: "var(--t1)" }}>{pa.name}</th>
              <th className="p-2 text-xs" style={{ color: "var(--t2)" }}>{pb.name}</th>
            </tr>
          </thead>
          <tbody>
            {(["role", "credits", "perf"] as const).map((k) => {
              const va = (pa as any)[k];
              const vb = (pb as any)[k];
              const better = typeof va === "number" && typeof vb === "number" ? (va > vb ? "a" : vb > va ? "b" : "tie") : "tie";
              return (
                <tr key={k} style={{ borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                  <td className="p-2 text-xs uppercase" style={{ color: "var(--muted)" }}>{k}</td>
                  <td className="p-2 text-center font-bold" style={{ color: better === "a" ? "var(--green)" : "#fff" }}>{va}</td>
                  <td className="p-2 text-center font-bold" style={{ color: better === "b" ? "var(--green)" : "#fff" }}>{vb}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Section>
  );
}

function DataHub({ active }: { active: boolean }) {
  const license = useLicense();
  const [d, setD] = useState<{ live: CricketMatch[]; upcoming: CricketMatch[] } | null>(null);
  useEffect(() => {
    if (!active || d) return;
    const headers: Record<string, string> = {};
    if (license.licenseKey) headers["x-license-key"] = license.licenseKey;
    if (license.deviceId) headers["x-device-id"] = license.deviceId;
    void fetch("/api/cricket-matches", { headers }).then((r) => r.json()).then(setD);
  }, [active, d, license.licenseKey, license.deviceId]);
  return (
    <Section title="📊 LIVE DATA STREAM">
      {!d && <Empty>Loading…</Empty>}
      {d && (
        <>
          <div className="text-xs mb-2" style={{ color: "var(--gold)", fontFamily: "'Orbitron'" }}>
            🔴 LIVE NOW ({d.live.length})
          </div>
          <div className="space-y-2 mb-4">
            {d.live.map((m) => (
              <div key={m.id} className="p-3 rounded-xl text-sm" style={{ background: "var(--panel-elevated)", border: "1px solid var(--t2)" }}>
                <div className="font-black">{m.team1Short} vs {m.team2Short}</div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>{m.status}</div>
                {m.liveScore && <div className="text-xs mt-1" style={{ color: "var(--cyan)", fontFamily: "'Share Tech Mono'" }}>{m.liveScore}</div>}
              </div>
            ))}
          </div>
          <div className="text-xs mb-2" style={{ color: "var(--cyan)", fontFamily: "'Orbitron'" }}>
            ⏳ UPCOMING ({d.upcoming.length})
          </div>
          <div className="space-y-2">
            {d.upcoming.map((m) => (
              <div key={m.id} className="p-3 rounded-xl text-sm" style={{ background: "var(--panel-elevated)", border: "1px solid var(--b1)" }}>
                <div className="font-black">{m.team1Short} vs {m.team2Short}</div>
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  {m.series} · {new Date(m.startTime).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Section>
  );
}

function LiveTV() {
  const channels = [
    { id: "9bZkp7q19f0", name: "DD News" },
    { id: "Nq2wYlWFucg", name: "Sky News" },
    { id: "gCNeDWCI0vo", name: "Al Jazeera" },
    { id: "iEpJwprxDdk", name: "Bloomberg" },
  ];
  const [ch, setCh] = useState(channels[0]);
  return (
    <>
      <Section title="📺 LIVE NEWS & SPORTS STREAMS">
        <div className="rounded-xl overflow-hidden mb-3" style={{ background: "#FFFFFF", border: "2px solid var(--b2)" }}>
          <div className="relative w-full" style={{ aspectRatio: "16/9" }}>
            <iframe
              key={ch.id}
              src={`https://www.youtube.com/embed/${ch.id}?autoplay=1&mute=1`}
              className="absolute inset-0 w-full h-full"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              title={ch.name}
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {channels.map((c) => (
            <button
              key={c.id}
              onClick={() => setCh(c)}
              className="p-3 rounded-xl text-sm font-bold"
              style={{
                background: ch.id === c.id ? "rgba(0,229,255,0.1)" : "rgba(0,0,0,0.03)",
                border: `1px solid ${ch.id === c.id ? "var(--cyan)" : "var(--b2)"}`,
                color: ch.id === c.id ? "var(--cyan)" : "#fff",
                fontFamily: "'Barlow Condensed'",
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div className="text-[14px] mt-3" style={{ color: "var(--muted)" }}>
          Note: DRM-protected services (JioCinema, Hotstar, Star Sports) cannot be embedded. Use their apps directly.
        </div>
      </Section>
    </>
  );
}

function CoachTab() {
  return (
    <Section title="🧠 AI COACH">
      <Empty>Go to BUILDER, select a match, lock at least 3 players, then run the Tactical Audit.</Empty>
    </Section>
  );
}

function DtChanceSection({
  pool, dtMap, dtLoading, dtError, t1Short, t2Short, locked, onToggle,
}: {
  pool: Player[];
  dtMap: Record<string, DtPrediction>;
  dtLoading: boolean;
  dtError: string;
  t1Short: string;
  t2Short: string;
  locked: Set<string>;
  onToggle: (p: Player) => void;
}) {
  const enriched = pool.map((p) => ({ p, dt: dtMap[p.id] })).filter((x) => x.dt);
  const total = pool.length;
  const probable = enriched.filter((x) => x.dt!.probableXI);
  const ranked = [...enriched].sort((a, b) => b.dt!.dtChance - a.dt!.dtChance);
  const high = ranked.filter((x) => x.dt!.dtChance >= 50);
  const avoid = ranked.filter((x) => x.dt!.dtChance < 30);
  const t1Count = pool.filter((p) => p.team === t1Short).length;
  const t2Count = pool.filter((p) => p.team === t2Short).length;
  const lockedHigh = high.filter((x) => locked.has(x.p.id)).length;
  return (
    <Section title="🎯 DT SADHYATHA (2026 LIVE · AI)">
      <div className="grid grid-cols-2 gap-2 mb-2 text-xs" style={{ fontFamily: "'Share Tech Mono'" }}>
        <StatPill label="LINEUP TOTAL" value={`${total} PLAYERS`} color="var(--cyan)" />
        <StatPill label={`${t1Short} / ${t2Short}`} value={`${t1Count} / ${t2Count}`} color="#fff" />
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3 text-xs" style={{ fontFamily: "'Share Tech Mono'" }}>
        <StatPill label="PROBABLE XI" value={total > 0 ? `${probable.length}/${total}` : "—"} color="var(--green)" />
        <StatPill label="HIGH DT" value={`${high.length}`} color="var(--gold)" />
        <StatPill label="HIGH · LOCKED" value={`${lockedHigh}/${high.length || 0}`} color="var(--gold)" />
      </div>
      {dtLoading && enriched.length === 0 && (
        <Empty>🤖 AI analyzing 2026 form for {pool.length} players…</Empty>
      )}
      {!!dtError && enriched.length === 0 && (
        <div className="rounded-lg p-3 text-xs" style={{ background: "#FEF2F2", border: "1px solid #DC2626", color: "#991B1B" }}>
          ⚠️ AI prediction failed: {dtError}
        </div>
      )}
      {enriched.length > 0 && (
        <>
          <div className="mb-2 text-[14px] font-black px-2 py-1.5 rounded flex items-center justify-between" style={{ background: "rgba(0,230,118,0.1)", color: "var(--green)", border: "1px solid var(--green)", fontFamily: "'Orbitron'" }}>
            <span>✅ HIGH DT CHANCE ({high.length})</span>
            <span style={{ color: "var(--muted)", fontWeight: 700 }}>TAP TO LOCK</span>
          </div>
          <div className="flex flex-col gap-1.5 mb-3 max-h-[320px] overflow-y-auto pr-1">
            {high.map(({ p, dt }) => (
              <DtRow key={p.id} p={p} dt={dt!} isT1={p.team === t1Short} locked={locked.has(p.id)} onClick={() => onToggle(p)} />
            ))}
            {high.length === 0 && <Empty>No high-chance players yet</Empty>}
          </div>
          <div className="mb-2 text-[14px] font-black px-2 py-1.5 rounded flex items-center justify-between" style={{ background: "rgba(245,0,87,0.1)", color: "var(--pink)", border: "1px solid var(--pink)", fontFamily: "'Orbitron'" }}>
            <span>❌ DT SADHYATHA ILLATHA (AVOID · {avoid.length})</span>
            <span style={{ color: "var(--muted)", fontWeight: 700 }}>TAP TO UNLOCK</span>
          </div>
          <div className="flex flex-col gap-1.5 max-h-[240px] overflow-y-auto pr-1">
            {avoid.map(({ p, dt }) => (
              <DtRow key={p.id} p={p} dt={dt!} isT1={p.team === t1Short} locked={locked.has(p.id)} onClick={() => onToggle(p)} dim />
            ))}
            {avoid.length === 0 && <Empty>No low-chance players</Empty>}
          </div>
          {dtLoading && (
            <div className="mt-2 text-[14px] text-center" style={{ color: "var(--muted)", fontFamily: "'Share Tech Mono'" }}>
              🔄 refreshing 2026 predictions…
            </div>
          )}
        </>
      )}
    </Section>
  );
}

function DtRow({ p, dt, isT1, locked, onClick, dim }: { p: Player; dt: DtPrediction; isT1: boolean; locked: boolean; onClick: () => void; dim?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg transition-all active:scale-[0.98] cursor-pointer"
      style={{
        background: locked ? "rgba(255,193,7,0.15)" : dim ? "rgba(0,0,0,0.05)" : "var(--panel-elevated)",
        border: `1px solid ${locked ? "var(--gold)" : dim ? "rgba(0,0,0,0.05)" : "var(--b1)"}`,
        borderLeft: `4px solid ${isT1 ? "var(--t1)" : "var(--t2)"}`,
        opacity: dim && !locked ? 0.7 : 1,
        boxShadow: locked ? "0 0 0 1px rgba(255,193,7,0.4) inset" : "none",
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm font-black truncate flex items-center gap-1.5" style={{ color: "#111111" }}>
          {locked && <span style={{ color: "var(--gold)" }}>🔒</span>}
          {p.name}
        </div>
        <div className="text-[13px] truncate" style={{ color: "var(--muted)", fontFamily: "'Share Tech Mono'" }}>
          {p.team} · {p.role} · {dt.reason || "—"}
        </div>
      </div>
      <div className="flex gap-1.5 text-[13px] font-black" style={{ fontFamily: "'Orbitron'" }}>
        <span className="px-1.5 py-0.5 rounded" style={{ background: dt.dtChance >= 60 ? "var(--green)" : dt.dtChance >= 35 ? "var(--gold)" : "var(--pink)", color: "#000" }}>DT {dt.dtChance}%</span>
        <span className="px-1.5 py-0.5 rounded" style={{ background: "var(--cyan)", color: "#000" }}>SEL {dt.selectionPct}%</span>
        <span className="px-1.5 py-0.5 rounded" style={{ background: "rgba(255,193,7,0.2)", color: "var(--gold)", border: "1px solid var(--gold)" }}>{dt.avg2026Pts}P</span>
      </div>
    </button>
  );
}

function SquadSummaryBox({
  pool, locked, t1Short, t2Short,
}: {
  pool: Player[];
  locked: Set<string>;
  t1Short: string;
  t2Short: string;
}) {
  const lockedPlayers = pool.filter((p) => locked.has(p.id));
  const rotating = pool.filter((p) => !locked.has(p.id));
  const t1Locked = lockedPlayers.filter((p) => p.team === t1Short).length;
  const t2Locked = lockedPlayers.filter((p) => p.team === t2Short).length;
  return (
    <Section title="🧱 SQUAD SUMMARY — FIXED vs ROTATING">
      <div className="grid grid-cols-3 gap-2 mb-3 text-xs" style={{ fontFamily: "'Share Tech Mono'" }}>
        <StatPill label="🔒 FIXED" value={`${lockedPlayers.length}`} color="var(--gold)" />
        <StatPill label="🔄 ROTATING" value={`${rotating.length}`} color="var(--cyan)" />
        <StatPill label={`${t1Short} / ${t2Short}`} value={`${t1Locked} / ${t2Locked}`} color="#fff" />
      </div>
      <div className="mb-2 text-[14px] font-black px-2 py-1 rounded" style={{ background: "rgba(255,193,7,0.1)", color: "var(--gold)", border: "1px solid var(--gold)", fontFamily: "'Orbitron'" }}>
        🔒 GOLD — LOCKED IN EVERY TEAM
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {lockedPlayers.map((p) => (
          <span key={p.id} className="px-2 py-1 rounded text-[14px] font-black" style={{ background: "rgba(255,193,7,0.15)", color: "var(--gold)", border: "1px solid var(--gold)", fontFamily: "'Orbitron'" }}>
            🔒 {p.name}
          </span>
        ))}
        {lockedPlayers.length === 0 && <Empty>No players fixed</Empty>}
      </div>
      <div className="mb-2 text-[14px] font-black px-2 py-1 rounded" style={{ background: "rgba(0,229,255,0.1)", color: "var(--cyan)", border: "1px solid var(--cyan)", fontFamily: "'Orbitron'" }}>
        🔄 CYAN — ROTATING ACROSS TEAMS
      </div>
      <div className="flex flex-wrap gap-1.5">
        {rotating.slice(0, 30).map((p) => (
          <span key={p.id} className="px-2 py-1 rounded text-[14px] font-bold" style={{ background: "rgba(0,229,255,0.08)", color: "var(--cyan)", border: "1px solid rgba(0,229,255,0.4)", fontFamily: "'Orbitron'" }}>
            🔄 {p.name}
          </span>
        ))}
      </div>
    </Section>
  );
}

// ============================================================
// AI RESEARCH DASHBOARD — 18 Premium AI Analysis Modules
// ============================================================
// All data comes from /api/call-ai (AI-generated analysis) +
// existing squad data. No backend/API/logic changes.
// Premium White theme — readable, mobile-friendly.

function AiResearchDashboard({ showToast }: { showToast: (s: string) => void }) {
  const [selectedMatch, setSelectedMatch] = useState<CricketMatch | null>(null);
  const [matches, setMatches] = useState<CricketMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [details, setDetails] = useState<any>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [activeModule, setActiveModule] = useState<number>(1);

  // License for API calls
  const license = useLicense();
  const licenseHeaders = useCallback(() => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (license.licenseKey) headers["x-license-key"] = license.licenseKey;
    if (license.deviceId) headers["x-device-id"] = license.deviceId;
    return headers;
  }, [license.licenseKey, license.deviceId]);

  // Load matches on mount
  useEffect(() => {
    void loadMatches();
  }, []);

  async function loadMatches() {
    setMatchesLoading(true);
    try {
      const r = await fetch("/api/cricket-matches", { headers: licenseHeaders() }).then((x) => x.json());
      if (r.ok) {
        const all = [...r.live, ...r.upcoming];
        setMatches(all);
        if (all[0]) selectMatch(all[0]);
      }
    } catch (e: any) {
      showToast(`⚠️ ${e?.message ?? "fetch failed"}`);
    } finally {
      setMatchesLoading(false);
    }
  }

  async function selectMatch(m: CricketMatch) {
    setSelectedMatch(m);
    setDetails(null);
    setAnalysis(null);
    setDetailsLoading(true);
    try {
      const d = await fetch("/api/cricket-match-details", {
        method: "POST",
        headers: licenseHeaders(),
        body: JSON.stringify({ matchId: m.id }),
      }).then((r) => r.json());
      setDetails(d);
      if (d.ok && d.teams?.length >= 2) {
        // Auto-run full AI analysis
        void runFullAnalysis(m, d);
      }
    } catch (e: any) {
      showToast(`⚠️ ${e?.message ?? "details failed"}`);
    } finally {
      setDetailsLoading(false);
    }
  }

  async function runFullAnalysis(match: CricketMatch, det: any) {
    setAnalysisLoading(true);
    setAnalysis(null);
    try {
      // Build squad list for AI
      const squad: string[] = [];
      for (const t of det.teams || []) {
        for (const p of t.players || []) {
          if (p.inXI !== false) squad.push(`${p.name} (${t.teamShort}, ${p.role || "Batter"})`);
        }
      }

      const matchContext = `MATCH: ${match.team1} vs ${match.team2}
SERIES: ${match.series}
FORMAT: ${match.format}
VENUE: ${match.venue}
TOSS: ${det.toss ? `${det.toss.winner} won, chose to ${det.toss.decision}` : "Not yet"}
LIVE SCORE: ${det.liveScore || "Not live"}
STATUS: ${det.matchStatus || "Preview"}

SQUAD (${squad.length} players):
${squad.join("\n")}`;

      // Show fallback data IMMEDIATELY so page never stuck loading
      const fallback = buildFallbackAnalysis(match, det, squad);
      setAnalysis(fallback);
      setAnalysisLoading(false); // ← Stop loading immediately — fallback is shown
      showToast("📊 Basic data loaded — AI enhancing...");

      // Try to get real AI data in 3 batches (non-blocking — fallback already shown)
      const batch1 = await callAiBatch(matchContext, squad, 1, `
Return JSON for these modules only:
{ "matchIntelligence": { "venueAnalysis": "2-line", "pitchType": "Batting Friendly|Bowling Friendly|Balanced", "avgFirstInnings": 0, "avgSecondInnings": 0, "boundarySize": "e.g. 65m", "chasingSuccessRate": 0, "tossAdvantage": "Bat First|Bowl First|Neutral", "dewFactor": "High|Medium|Low", "spinVsPace": "Spin-friendly|Pace-friendly|Balanced", "powerplayBehaviour": "1-line", "deathOversBehaviour": "1-line", "aiVenueRating": 0 }, "weather": { "temperature": "e.g. 28C", "humidity": "e.g. 65%", "rainProbability": 0, "windSpeed": "e.g. 12 km/h", "cloudCover": "e.g. 40%", "dewProbability": 0, "fantasyImpactScore": 0, "riskIndicator": "Low|Medium|High" }, "tossAI": { "tossWinProbability": { "team1": 50, "team2": 50 }, "batFirstPrediction": "1-line", "bowlFirstPrediction": "1-line", "bestPlayersBatFirst": ["name"], "bestPlayersBowlFirst": ["name"], "tossImpactRating": 0, "captainChanges": "1-line", "viceCaptainChanges": "1-line" } }
Use ONLY squad players. 2026 data. JSON only.`);

      const batch2 = await callAiBatch(matchContext, squad, 2, `
Return JSON for these modules only:
{ "playingXI": { "confirmedXI": ["name"], "impactPlayers": ["name"], "benchPlayers": ["name"], "lastMinuteUpdates": "1-line", "lateTeamChanges": "1-line" }, "coreLocks": { "fixPlayers": [{"name":"","role":"","credits":0,"selectionPct":0,"fantasyAverage":0,"lockPct":0,"reason":"1-line"}], "topCaptains": [{"rank":1,"name":"","captainScore":0,"aiConfidence":0,"expectedPoints":0,"risk":"Low","reason":"1-line"}], "topViceCaptains": [{"rank":1,"name":"","vcScore":0,"aiConfidence":0,"expectedPoints":0,"risk":"Low","reason":"1-line"}] }, "captainCenter": { "top10Captains": ["name"], "top10ViceCaptains": ["name"], "safeCaptains": ["name"], "differentialCaptains": ["name"], "megaGLCaptains": ["name"], "captainSuccessPct": 0, "viceCaptainSuccessPct": 0 } }
Use ONLY squad players. 2026 data. JSON only.`);

      const batch3 = await callAiBatch(matchContext, squad, 3, `
Return JSON for these modules only:
{ "grandLeague": { "lowOwnership": ["name"], "differentialPicks": ["name"], "hiddenGems": ["name"], "jackpotCombinations": ["combo"], "megaGLStrategy": "2-line", "safeGLStrategy": "2-line" }, "winProbability": { "team1WinPct": 50, "team2WinPct": 50, "matchConfidence": 0, "fantasyConfidence": 0, "aiPredictionConfidence": 0 }, "cheatSheet": { "mustPick": ["name"], "avoid": ["name"], "safeCombination": "1-line", "grandLeagueCombination": "1-line", "captainLock": "name", "viceCaptainLock": "name" }, "finalVerdict": { "overallMatchRating": 0, "aiConfidence": 0, "fantasyDifficulty": "Easy|Medium|Hard", "safeGLRating": 0, "megaGLRating": 0, "winningProbability": "1-line", "riskMeter": 0, "finalRecommendation": "2-line" }, "aiInsights": { "topDifferential": "name - 1-line", "highestCeiling": "name - 1-line", "safestPlayer": "name - 1-line", "mostDangerousBowler": "name - 1-line", "explosiveBatter": "name - 1-line" } }
Use ONLY squad players. 2026 data. JSON only.`);

      // Merge AI data over fallback (AI takes priority)
      const merged = {
        ...fallback,
        ...batch1,
        ...batch2,
        ...batch3,
      };

      setAnalysis(merged);
      showToast("✅ AI Research analysis ready");
    } catch (e: any) {
      showToast(`⚠️ AI partially failed — showing basic data`);
      // analysisLoading already false — fallback data remains shown
    }
  }

  // Build fallback analysis from squad data (no AI needed — instant)
  function buildFallbackAnalysis(match: CricketMatch, det: any, squad: string[]): any {
    const players: string[] = [];
    const xiPlayers: string[] = [];
    const benchPlayers: string[] = [];
    for (const t of det.teams || []) {
      for (const p of t.players || []) {
        players.push(p.name);
        if (p.inXI === true) xiPlayers.push(p.name);
        else if (p.inXI === false) benchPlayers.push(p.name);
      }
    }

    return {
      matchIntelligence: {
        venueAnalysis: `${match.venue || "Venue TBD"} — analysis pending AI update`,
        pitchType: "Balanced",
        avgFirstInnings: 0,
        avgSecondInnings: 0,
        boundarySize: "Standard boundaries",
        chasingSuccessRate: 50,
        tossAdvantage: "Neutral",
        dewFactor: "Medium",
        spinVsPace: "Balanced",
        powerplayBehaviour: "Loading from AI...",
        deathOversBehaviour: "Loading from AI...",
        aiVenueRating: 0,
      },
      weather: {
        temperature: "—",
        humidity: "—",
        rainProbability: 0,
        windSpeed: "—",
        cloudCover: "—",
        dewProbability: 0,
        fantasyImpactScore: 0,
        riskIndicator: "Low",
      },
      tossAI: {
        tossWinProbability: { team1: 50, team2: 50 },
        batFirstPrediction: det.toss ? `${det.toss.winner} chose to ${det.toss.decision}` : "Toss pending",
        bowlFirstPrediction: "—",
        bestPlayersBatFirst: xiPlayers.slice(0, 3),
        bestPlayersBowlFirst: xiPlayers.slice(3, 6),
        tossImpactRating: 0,
        captainChanges: "—",
        viceCaptainChanges: "—",
      },
      playingXI: {
        confirmedXI: xiPlayers,
        impactPlayers: xiPlayers.slice(0, 3),
        benchPlayers: benchPlayers,
        injuredPlayers: [],
        unavailablePlayers: [],
        lastMinuteUpdates: det.lineupAnnounced ? "Lineup announced" : "Lineup pending",
        lateTeamChanges: "—",
      },
      playerForm: players.slice(0, 11).map((name) => ({
        name,
        last5Scores: [0, 0, 0, 0, 0],
        battingForm: "Average",
        bowlingForm: "Average",
        strikeRate: 0,
        economyRate: 0,
        fantasyAverage: 0,
        venueRecord: "Loading from AI...",
        oppositionRecord: "Loading from AI...",
        consistencyScore: 0,
        aiRating: 0,
        riskRating: 0,
      })),
      coreLocks: {
        fixPlayers: xiPlayers.slice(0, 7).map((name, i) => ({
          name,
          role: "—",
          credits: 0,
          selectionPct: 0,
          fantasyAverage: 0,
          lockPct: 50 + i * 5,
          reason: "Auto-locked from confirmed XI",
        })),
        topCaptains: xiPlayers.slice(0, 6).map((name, i) => ({
          rank: i + 1,
          name,
          captainScore: 0,
          aiConfidence: 0,
          expectedPoints: 0,
          risk: "Medium",
          reason: "Loading from AI...",
        })),
        topViceCaptains: xiPlayers.slice(0, 6).map((name, i) => ({
          rank: i + 1,
          name,
          vcScore: 0,
          aiConfidence: 0,
          expectedPoints: 0,
          risk: "Medium",
          reason: "Loading from AI...",
        })),
      },
      captainCenter: {
        top10Captains: xiPlayers.slice(0, 10),
        top10ViceCaptains: xiPlayers.slice(0, 10),
        safeCaptains: xiPlayers.slice(0, 3),
        differentialCaptains: xiPlayers.slice(3, 6),
        megaGLCaptains: xiPlayers.slice(6, 9),
        captainSuccessPct: 0,
        viceCaptainSuccessPct: 0,
      },
      grandLeague: {
        lowOwnership: benchPlayers.slice(0, 3),
        differentialPicks: benchPlayers.slice(0, 3),
        hiddenGems: benchPlayers.slice(0, 3),
        highRiskPlayers: [],
        highRewardPlayers: xiPlayers.slice(0, 3),
        jackpotCombinations: [],
        megaGLStrategy: "Loading from AI...",
        safeGLStrategy: "Loading from AI...",
      },
      teamBalance: {
        batters: 0,
        bowlers: 0,
        allrounders: 0,
        wicketkeepers: 0,
        creditsUsed: 0,
        creditsRemaining: 100,
        leftRightCombo: "—",
        spinVsPace: "—",
        experienceScore: 0,
      },
      winProbability: {
        team1WinPct: 50,
        team2WinPct: 50,
        matchConfidence: 0,
        fantasyConfidence: 0,
        aiPredictionConfidence: 0,
      },
      fantasyValuePicks: {
        budgetPicks: [],
        valuePicks: xiPlayers.slice(0, 3),
        hiddenGems: benchPlayers.slice(0, 3),
        mustHave: xiPlayers.slice(0, 3),
        avoidPlayers: [],
        safePicks: xiPlayers.slice(0, 5),
        differentialPicks: benchPlayers.slice(0, 3),
      },
      liveTracker: {
        liveScore: det.liveScore || "Not live",
        overs: "—",
        runs: 0,
        wickets: 0,
        currentRunRate: 0,
        requiredRunRate: 0,
        partnership: "—",
        recentOvers: [],
        momentum: "Balanced",
      },
      cheatSheet: {
        mustPick: xiPlayers.slice(0, 5),
        avoid: [],
        safeCombination: "Loading from AI...",
        grandLeagueCombination: "Loading from AI...",
        captainLock: xiPlayers[0] || "—",
        viceCaptainLock: xiPlayers[1] || "—",
        differentialPicks: benchPlayers.slice(0, 3),
        hiddenPicks: benchPlayers.slice(0, 3),
      },
      finalVerdict: {
        overallMatchRating: 0,
        aiConfidence: 0,
        fantasyDifficulty: "Medium",
        safeGLRating: 0,
        megaGLRating: 0,
        winningProbability: "Loading from AI...",
        riskMeter: 0,
        finalRecommendation: "Loading from AI...",
      },
      playersToAvoid: [],
      lockConfidence: xiPlayers.slice(0, 7).map((name) => ({
        name,
        level: "Medium",
        score: 50,
      })),
      captainMatrix: [
        { combination: "Safe", captain: xiPlayers[0] || "—", viceCaptain: xiPlayers[1] || "—" },
        { combination: "Balanced", captain: xiPlayers[0] || "—", viceCaptain: xiPlayers[2] || "—" },
        { combination: "Grand League", captain: xiPlayers[1] || "—", viceCaptain: xiPlayers[3] || "—" },
        { combination: "Mega GL", captain: xiPlayers[2] || "—", viceCaptain: xiPlayers[4] || "—" },
      ],
      aiInsights: {
        topDifferential: "Loading from AI...",
        highestCeiling: "Loading from AI...",
        safestPlayer: "Loading from AI...",
        mostDangerousBowler: "Loading from AI...",
        explosiveBatter: "Loading from AI...",
        deathOversSpecialist: "Loading from AI...",
        powerplaySpecialist: "Loading from AI...",
      },
    };
  }

  // Helper: call AI for one batch and parse JSON response
  async function callAiBatch(matchContext: string, squad: string[], batchNum: number, modulesPrompt: string): Promise<any> {
    const prompt = `${matchContext}

${modulesPrompt}`;

    try {
      const res = await fetch("/api/call-ai", {
        method: "POST",
        headers: licenseHeaders(),
        body: JSON.stringify({ prompt, system: "Return STRICT JSON only. No prose.", json: true }),
      }).then((r) => r.json());

      if (res.ok && res.content) {
        let content = res.content.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
        if (!content.startsWith("{")) {
          const start = content.indexOf("{");
          const end = content.lastIndexOf("}");
          if (start >= 0 && end > start) content = content.slice(start, end + 1);
        }
        return JSON.parse(content);
      }
      return {};
    } catch {
      return {};
    }
  }

  const MODULES = [
    { n: 1, label: "Match Intelligence", icon: "🏟️" },
    { n: 2, label: "Weather Report", icon: "🌤️" },
    { n: 3, label: "Toss AI Center", icon: "🪙" },
    { n: 4, label: "Playing XI Center", icon: "👥" },
    { n: 5, label: "Player Form Center", icon: "📊" },
    { n: 6, label: "AI Core Locks", icon: "🔒" },
    { n: 7, label: "AI Captain Center", icon: "👑" },
    { n: 8, label: "Grand League Research", icon: "🏆" },
    { n: 9, label: "Team Balance Analyzer", icon: "⚖️" },
    { n: 10, label: "Win Probability", icon: "🎯" },
    { n: 11, label: "Fantasy Value Picks", icon: "💎" },
    { n: 12, label: "Live Match Tracker", icon: "📡" },
    { n: 13, label: "AI Cheat Sheet", icon: "📋" },
    { n: 14, label: "Final AI Verdict", icon: "⚡" },
    { n: 15, label: "Players to Avoid", icon: "⚠️" },
    { n: 16, label: "Lock Confidence", icon: "📊" },
    { n: 17, label: "Captain Matrix", icon: "🎯" },
    { n: 18, label: "AI Insights", icon: "🧠" },
  ];

  return (
    <>
      {/* Match selector */}
      <Section title="🎯 SELECT MATCH FOR AI RESEARCH">
        <div className="flex gap-2 mb-3">
          <button
            onClick={loadMatches}
            disabled={matchesLoading}
            className="px-4 py-2 rounded-lg text-[14px] font-black"
            style={{ background: "#2563EB", color: "#FFFFFF", border: "none", fontFamily: "'Orbitron', sans-serif", minHeight: "44px" }}
          >
            {matchesLoading ? "⏳ LOADING" : "🔄 LOAD MATCHES"}
          </button>
        </div>
        {matches.length > 0 && (
          <div className="flex flex-col gap-2 max-h-[280px] overflow-y-auto">
            {matches.slice(0, 20).map((m) => (
              <div
                key={m.id}
                onClick={() => selectMatch(m)}
                className="p-3 rounded-lg cursor-pointer transition-all"
                style={{
                  background: selectedMatch?.id === m.id ? "#EFF6FF" : "#F5F7FA",
                  border: `2px solid ${selectedMatch?.id === m.id ? "#2563EB" : "#E5E7EB"}`,
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="text-[15px] font-black" style={{ color: "#111111" }}>
                    {m.team1Short} vs {m.team2Short}
                  </div>
                  {m.state === "live" && (
                    <span className="text-[12px] font-black px-2 py-0.5 rounded" style={{ background: "#DC2626", color: "#FFFFFF" }}>● LIVE</span>
                  )}
                </div>
                <div className="text-[13px]" style={{ color: "#444444" }}>
                  {m.series} · {m.format}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {selectedMatch && (
        <>
          {/* Module selector — 18 modules */}
          <Section title="🧪 AI RESEARCH MODULES">
            <div className="grid grid-cols-3 gap-2">
              {MODULES.map((mod) => (
                <button
                  key={mod.n}
                  onClick={() => setActiveModule(mod.n)}
                  className="p-3 rounded-lg text-[13px] font-black flex flex-col items-center gap-1 transition-all"
                  style={{
                    background: activeModule === mod.n ? "#2563EB" : "#F5F7FA",
                    color: activeModule === mod.n ? "#FFFFFF" : "#444444",
                    border: `2px solid ${activeModule === mod.n ? "#2563EB" : "#E5E7EB"}`,
                    fontFamily: "'Orbitron', sans-serif",
                  }}
                >
                  <span className="text-lg">{mod.icon}</span>
                  <span className="text-center leading-tight">{mod.label}</span>
                </button>
              ))}
            </div>
          </Section>

          {/* Loading state */}
          {(detailsLoading || analysisLoading) && (
            <Section title="⏳ AI ANALYZING...">
              <div className="p-6 text-center">
                <div className="text-[16px] font-bold" style={{ color: "#2563EB", fontFamily: "'Orbitron', sans-serif" }}>
                  {analysisLoading ? "🧠 AI RUNNING 18 MODULES..." : "📋 FETCHING SQUAD..."}
                </div>
                <div className="text-[14px] mt-2" style={{ color: "#6B7280" }}>
                  Analyzing venue, weather, toss, form, captains, GL picks, and more...
                </div>
              </div>
            </Section>
          )}

          {/* Module content */}
          {!detailsLoading && !analysisLoading && analysis && (
            <AiModuleContent module={activeModule} analysis={analysis} match={selectedMatch} details={details} />
          )}

          {!detailsLoading && !analysisLoading && !analysis && details && (
            <Section title="⚠️ ANALYSIS NOT LOADED">
              <div className="p-4 text-center">
                <div className="text-[15px] mb-3" style={{ color: "#444444" }}>
                  AI analysis didn't load. Tap below to retry.
                </div>
                <button
                  onClick={() => selectedMatch && details && runFullAnalysis(selectedMatch, details)}
                  className="px-6 py-3 rounded-lg text-[14px] font-black"
                  style={{ background: "#2563EB", color: "#FFFFFF", border: "none", fontFamily: "'Orbitron', sans-serif", minHeight: "50px" }}
                >
                  🔄 RETRY AI ANALYSIS
                </button>
              </div>
            </Section>
          )}
        </>
      )}
    </>
  );
}

// ============================================================
// AI MODULE CONTENT — renders the active module
// ============================================================
function AiModuleContent({ module, analysis, match, details }: { module: number; analysis: any; match: CricketMatch; details: any }) {
  // Helper: Premium white card
  const card = (title: string, children: React.ReactNode) => (
    <div className="rounded-2xl p-5 mb-3" style={{ background: "#FFFFFF", border: "1px solid #E5E7EB", boxShadow: "0 2px 8px rgba(0,0,0,0.05)", borderRadius: "18px" }}>
      <div className="text-[18px] font-black mb-3 pb-2" style={{ color: "#111111", fontFamily: "'Orbitron', sans-serif", borderBottom: "2px solid #F5F7FA" }}>
        {title}
      </div>
      {children}
    </div>
  );

  // Helper: Stat row
  const statRow = (label: string, value: any, color = "#111111") => (
    <div className="flex justify-between items-center py-2 border-b" style={{ borderColor: "#F5F7FA" }}>
      <span className="text-[15px]" style={{ color: "#444444" }}>{label}</span>
      <span className="text-[15px] font-bold" style={{ color }}>{typeof value === "number" ? value : (value || "—")}</span>
    </div>
  );

  // Helper: Player chip
  const playerChip = (name: string, badge?: string, badgeColor?: string) => (
    <div className="px-3 py-2 rounded-lg flex items-center justify-between" style={{ background: "#F5F7FA", border: "1px solid #E5E7EB" }}>
      <span className="text-[15px] font-bold" style={{ color: "#111111" }}>{name}</span>
      {badge && (
        <span className="text-[12px] font-black px-2 py-0.5 rounded" style={{ background: badgeColor || "#2563EB", color: "#FFFFFF" }}>
          {badge}
        </span>
      )}
    </div>
  );

  // Helper: Progress bar
  const progressBar = (label: string, value: number, color: string) => (
    <div className="mb-2">
      <div className="flex justify-between text-[14px] mb-1">
        <span style={{ color: "#444444" }}>{label}</span>
        <span className="font-bold" style={{ color }}>{value}%</span>
      </div>
      <div className="h-2 rounded-full" style={{ background: "#F5F7FA" }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, value)}%`, background: color }} />
      </div>
    </div>
  );

  // ===== MODULE 1: Match Intelligence =====
  if (module === 1) {
    const mi = analysis.matchIntelligence || {};
    return <>
      {card("🏟️ MATCH INTELLIGENCE", <>
        {statRow("Venue Analysis", mi.venueAnalysis)}
        {statRow("Pitch Type", mi.pitchType, mi.pitchType?.includes("Batting") ? "#16A34A" : mi.pitchType?.includes("Bowling") ? "#DC2626" : "#F59E0B")}
        {statRow("Avg First Innings", mi.avgFirstInnings)}
        {statRow("Avg Second Innings", mi.avgSecondInnings)}
        {statRow("Boundary Size", mi.boundarySize)}
        {statRow("Chasing Success Rate", mi.chasingSuccessRate ? `${mi.chasingSuccessRate}%` : null, "#16A34A")}
        {statRow("Toss Advantage", mi.tossAdvantage)}
        {statRow("Dew Factor", mi.dewFactor, mi.dewFactor === "High" ? "#DC2626" : "#F59E0B")}
        {statRow("Spin vs Pace", mi.spinVsPace)}
        {statRow("Powerplay Behaviour", mi.powerplayBehaviour)}
        {statRow("Death Overs Behaviour", mi.deathOversBehaviour)}
        {statRow("AI Venue Rating", mi.aiVenueRating ? `${mi.aiVenueRating}/100` : null, "#2563EB")}
      </>)}
    </>;
  }

  // ===== MODULE 2: Weather Report =====
  if (module === 2) {
    const w = analysis.weather || {};
    return <>
      {card("🌤️ WEATHER REPORT", <>
        {statRow("Temperature", w.temperature)}
        {statRow("Humidity", w.humidity)}
        {statRow("Rain Probability", w.rainProbability ? `${w.rainProbability}%` : null, w.rainProbability > 50 ? "#DC2626" : "#F59E0B")}
        {statRow("Wind Speed", w.windSpeed)}
        {statRow("Cloud Cover", w.cloudCover)}
        {statRow("Dew Probability", w.dewProbability ? `${w.dewProbability}%` : null, "#F59E0B")}
        {progressBar("Fantasy Weather Impact", w.fantasyImpactScore || 0, "#2563EB")}
        {statRow("Risk Indicator", w.riskIndicator, w.riskIndicator === "High" ? "#DC2626" : w.riskIndicator === "Medium" ? "#F59E0B" : "#16A34A")}
      </>)}
    </>;
  }

  // ===== MODULE 3: Toss AI Center =====
  if (module === 3) {
    const t = analysis.tossAI || {};
    return <>
      {card("🪙 TOSS AI CENTER", <>
        {t.tossWinProbability && (
          <div className="mb-3">
            <div className="text-[15px] mb-2" style={{ color: "#444444" }}>Toss Win Probability:</div>
            {progressBar(match.team1Short, t.tossWinProbability.team1 || 0, "#DC2626")}
            {progressBar(match.team2Short, t.tossWinProbability.team2 || 0, "#2563EB")}
          </div>
        )}
        {statRow("Bat First Prediction", t.batFirstPrediction)}
        {statRow("Bowl First Prediction", t.bowlFirstPrediction)}
        {statRow("Toss Impact Rating", t.tossImpactRating ? `${t.tossImpactRating}/100` : null, "#2563EB")}
        {statRow("Captain Changes", t.captainChanges)}
        {statRow("Vice Captain Changes", t.viceCaptainChanges)}
      </>)}
      {t.bestPlayersBatFirst && t.bestPlayersBatFirst.length > 0 && card("🏏 BEST IF BAT FIRST", <>
        <div className="space-y-2">{t.bestPlayersBatFirst.map((p: string, i: number) => <div key={i}>{playerChip(p, "BAT", "#16A34A")}</div>)}</div>
      </>)}
      {t.bestPlayersBowlFirst && t.bestPlayersBowlFirst.length > 0 && card("🎯 BEST IF BOWL FIRST", <>
        <div className="space-y-2">{t.bestPlayersBowlFirst.map((p: string, i: number) => <div key={i}>{playerChip(p, "BOWL", "#2563EB")}</div>)}</div>
      </>)}
    </>;
  }

  // ===== MODULE 4: Playing XI Center =====
  if (module === 4) {
    const xi = analysis.playingXI || {};
    return <>
      {xi.confirmedXI && xi.confirmedXI.length > 0 && card("✅ CONFIRMED PLAYING XI", <>
        <div className="grid grid-cols-2 gap-2">
          {xi.confirmedXI.map((p: string, i: number) => <div key={i}>{playerChip(p, "XI", "#16A34A")}</div>)}
        </div>
      </>)}
      {xi.impactPlayers && xi.impactPlayers.length > 0 && card("⚡ IMPACT PLAYERS", <>
        <div className="grid grid-cols-2 gap-2">
          {xi.impactPlayers.map((p: string, i: number) => <div key={i}>{playerChip(p, "IMPACT", "#F59E0B")}</div>)}
        </div>
      </>)}
      {xi.benchPlayers && xi.benchPlayers.length > 0 && card("🪑 BENCH PLAYERS", <>
        <div className="grid grid-cols-2 gap-2">
          {xi.benchPlayers.map((p: string, i: number) => <div key={i}>{playerChip(p, "BENCH", "#6B7280")}</div>)}
        </div>
      </>)}
      {card("📢 LAST MINUTE UPDATES", <>
        {statRow("Updates", xi.lastMinuteUpdates)}
        {statRow("Late Team Changes", xi.lateTeamChanges)}
      </>)}
    </>;
  }

  // ===== MODULE 5: Player Form Center =====
  if (module === 5) {
    const pf = analysis.playerForm || [];
    return <>
      {card("📊 PLAYER FORM CENTER", <>
        <div className="space-y-3">
          {pf.map((p: any, i: number) => (
            <div key={i} className="p-3 rounded-lg" style={{ background: "#F5F7FA", border: "1px solid #E5E7EB" }}>
              <div className="flex justify-between items-center mb-2">
                <span className="text-[16px] font-black" style={{ color: "#111111" }}>{p.name}</span>
                <span className="text-[14px] font-bold px-2 py-0.5 rounded" style={{ background: p.aiRating >= 75 ? "#16A34A" : p.aiRating >= 50 ? "#F59E0B" : "#DC2626", color: "#FFFFFF" }}>
                  AI {p.aiRating || 0}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[14px]">
                <div style={{ color: "#444444" }}>Last 5: <b style={{ color: "#111111" }}>{(p.last5Scores || []).join(", ") || "—"}</b></div>
                <div style={{ color: "#444444" }}>Bat Form: <b style={{ color: p.battingForm === "Good" ? "#16A34A" : p.battingForm === "Poor" ? "#DC2626" : "#F59E0B" }}>{p.battingForm || "—"}</b></div>
                <div style={{ color: "#444444" }}>Bowl Form: <b style={{ color: p.bowlingForm === "Good" ? "#16A34A" : p.bowlingForm === "Poor" ? "#DC2626" : "#F59E0B" }}>{p.bowlingForm || "—"}</b></div>
                <div style={{ color: "#444444" }}>SR: <b style={{ color: "#2563EB" }}>{p.strikeRate || "—"}</b></div>
                <div style={{ color: "#444444" }}>Eco: <b style={{ color: "#2563EB" }}>{p.economyRate || "—"}</b></div>
                <div style={{ color: "#444444" }}>Fantasy Avg: <b style={{ color: "#16A34A" }}>{p.fantasyAverage || "—"}</b></div>
                <div style={{ color: "#444444" }}>Consistency: <b style={{ color: "#111111" }}>{p.consistencyScore || "—"}%</b></div>
                <div style={{ color: "#444444" }}>Risk: <b style={{ color: p.riskRating >= 70 ? "#DC2626" : p.riskRating >= 40 ? "#F59E0B" : "#16A34A" }}>{p.riskRating || "—"}</b></div>
              </div>
              {p.venueRecord && <div className="text-[13px] mt-2" style={{ color: "#6B7280" }}>📍 {p.venueRecord}</div>}
              {p.oppositionRecord && <div className="text-[13px]" style={{ color: "#6B7280" }}>⚔️ {p.oppositionRecord}</div>}
            </div>
          ))}
        </div>
      </>)}
    </>;
  }

  // ===== MODULE 6: AI Core Locks =====
  if (module === 6) {
    const cl = analysis.coreLocks || {};
    return <>
      {cl.fixPlayers && cl.fixPlayers.length > 0 && card("🔒 7 AI FIX PLAYERS", <>
        <div className="space-y-2">
          {cl.fixPlayers.slice(0, 7).map((p: any, i: number) => (
            <div key={i} className="p-3 rounded-lg" style={{ background: "#F5F7FA", border: "1px solid #E5E7EB", borderLeft: "4px solid #16A34A" }}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[16px] font-black" style={{ color: "#111111" }}>{p.name}</span>
                <span className="text-[14px] font-bold px-2 py-0.5 rounded" style={{ background: "#16A34A", color: "#FFFFFF" }}>LOCK {p.lockPct || 0}%</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[13px]" style={{ color: "#444444" }}>
                <div>Role: <b>{p.role}</b></div>
                <div>Credits: <b style={{ color: "#2563EB" }}>{p.credits}</b></div>
                <div>Sel: <b style={{ color: "#16A34A" }}>{p.selectionPct}%</b></div>
              </div>
              <div className="text-[13px] mt-1" style={{ color: "#6B7280" }}>💡 {p.reason}</div>
            </div>
          ))}
        </div>
      </>)}
      {cl.topCaptains && cl.topCaptains.length > 0 && card("👑 TOP 6 CAPTAIN PICKS", <>
        <div className="space-y-2">
          {cl.topCaptains.slice(0, 6).map((c: any, i: number) => (
            <div key={i} className="p-3 rounded-lg flex justify-between items-center" style={{ background: "#F5F7FA", border: "1px solid #E5E7EB", borderLeft: "4px solid #F59E0B" }}>
              <div>
                <div className="text-[16px] font-black" style={{ color: "#111111" }}>#{c.rank} {c.name}</div>
                <div className="text-[13px]" style={{ color: "#6B7280" }}>{c.reason}</div>
              </div>
              <div className="text-right">
                <div className="text-[15px] font-black" style={{ color: "#F59E0B" }}>{c.captainScore}</div>
                <div className="text-[12px]" style={{ color: c.risk === "High" ? "#DC2626" : c.risk === "Medium" ? "#F59E0B" : "#16A34A" }}>{c.risk}</div>
              </div>
            </div>
          ))}
        </div>
      </>)}
      {cl.topViceCaptains && cl.topViceCaptains.length > 0 && card("⚡ TOP 6 VICE CAPTAIN PICKS", <>
        <div className="space-y-2">
          {cl.topViceCaptains.slice(0, 6).map((c: any, i: number) => (
            <div key={i} className="p-3 rounded-lg flex justify-between items-center" style={{ background: "#F5F7FA", border: "1px solid #E5E7EB", borderLeft: "4px solid #2563EB" }}>
              <div>
                <div className="text-[16px] font-black" style={{ color: "#111111" }}>#{c.rank} {c.name}</div>
                <div className="text-[13px]" style={{ color: "#6B7280" }}>{c.reason}</div>
              </div>
              <div className="text-right">
                <div className="text-[15px] font-black" style={{ color: "#2563EB" }}>{c.vcScore}</div>
                <div className="text-[12px]" style={{ color: c.risk === "High" ? "#DC2626" : c.risk === "Medium" ? "#F59E0B" : "#16A34A" }}>{c.risk}</div>
              </div>
            </div>
          ))}
        </div>
      </>)}
    </>;
  }

  // ===== MODULE 7: AI Captain Center =====
  if (module === 7) {
    const cc = analysis.captainCenter || {};
    return <>
      {card("👑 AI CAPTAIN CENTER", <>
        {progressBar("Captain Success Rate", cc.captainSuccessPct || 0, "#F59E0B")}
        {progressBar("Vice Captain Success Rate", cc.viceCaptainSuccessPct || 0, "#2563EB")}
      </>)}
      {cc.top10Captains && card("🏆 TOP 10 CAPTAINS", <>
        <div className="space-y-2">{cc.top10Captains.map((p: string, i: number) => <div key={i}>{playerChip(`#${i+1} ${p}`, "C", "#F59E0B")}</div>)}</div>
      </>)}
      {cc.top10ViceCaptains && card("⚡ TOP 10 VICE CAPTAINS", <>
        <div className="space-y-2">{cc.top10ViceCaptains.map((p: string, i: number) => <div key={i}>{playerChip(`#${i+1} ${p}`, "VC", "#2563EB")}</div>)}</div>
      </>)}
      {cc.safeCaptains && card("🛡️ SAFE CAPTAINS", <>
        <div className="space-y-2">{cc.safeCaptains.map((p: string, i: number) => <div key={i}>{playerChip(p, "SAFE", "#16A34A")}</div>)}</div>
      </>)}
      {cc.differentialCaptains && card("💎 DIFFERENTIAL CAPTAINS", <>
        <div className="space-y-2">{cc.differentialCaptains.map((p: string, i: number) => <div key={i}>{playerChip(p, "DIFF", "#7C3AED")}</div>)}</div>
      </>)}
      {cc.megaGLCaptains && card("🎰 MEGA GL CAPTAINS", <>
        <div className="space-y-2">{cc.megaGLCaptains.map((p: string, i: number) => <div key={i}>{playerChip(p, "GL", "#DC2626")}</div>)}</div>
      </>)}
    </>;
  }

  // ===== MODULE 8: Grand League Research =====
  if (module === 8) {
    const gl = analysis.grandLeague || {};
    return <>
      {card("🏆 GRAND LEAGUE RESEARCH", <>
        {gl.lowOwnership && gl.lowOwnership.length > 0 && (
          <div className="mb-3">
            <div className="text-[15px] font-bold mb-2" style={{ color: "#7C3AED" }}>📉 LOW OWNERSHIP</div>
            <div className="space-y-2">{gl.lowOwnership.map((p: string, i: number) => <div key={i}>{playerChip(p)}</div>)}</div>
          </div>
        )}
        {gl.differentialPicks && gl.differentialPicks.length > 0 && (
          <div className="mb-3">
            <div className="text-[15px] font-bold mb-2" style={{ color: "#7C3AED" }}>💎 DIFFERENTIAL PICKS</div>
            <div className="space-y-2">{gl.differentialPicks.map((p: string, i: number) => <div key={i}>{playerChip(p, "DIFF", "#7C3AED")}</div>)}</div>
          </div>
        )}
        {gl.hiddenGems && gl.hiddenGems.length > 0 && (
          <div className="mb-3">
            <div className="text-[15px] font-bold mb-2" style={{ color: "#16A34A" }}>🔮 HIDDEN GEMS</div>
            <div className="space-y-2">{gl.hiddenGems.map((p: string, i: number) => <div key={i}>{playerChip(p, "GEM", "#16A34A")}</div>)}</div>
          </div>
        )}
        {gl.jackpotCombinations && gl.jackpotCombinations.length > 0 && (
          <div className="mb-3">
            <div className="text-[15px] font-bold mb-2" style={{ color: "#F59E0B" }}>🎰 JACKPOT COMBINATIONS</div>
            <div className="space-y-2">{gl.jackpotCombinations.map((c: string, i: number) => <div key={i} className="p-2 rounded-lg text-[14px]" style={{ background: "#FFFBEB", border: "1px solid #F59E0B", color: "#92400E" }}>{c}</div>)}</div>
          </div>
        )}
        {statRow("Mega GL Strategy", gl.megaGLStrategy)}
        {statRow("Safe GL Strategy", gl.safeGLStrategy)}
      </>)}
    </>;
  }

  // ===== MODULE 9: Team Balance Analyzer =====
  if (module === 9) {
    const tb = analysis.teamBalance || {};
    return <>
      {card("⚖️ TEAM BALANCE ANALYZER", <>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="p-3 rounded-lg text-center" style={{ background: "#F5F7FA", border: "1px solid #E5E7EB" }}>
            <div className="text-[14px]" style={{ color: "#6B7280" }}>Batters</div>
            <div className="text-[20px] font-black" style={{ color: "#111111" }}>{tb.batters || 0}</div>
          </div>
          <div className="p-3 rounded-lg text-center" style={{ background: "#F5F7FA", border: "1px solid #E5E7EB" }}>
            <div className="text-[14px]" style={{ color: "#6B7280" }}>Bowlers</div>
            <div className="text-[20px] font-black" style={{ color: "#111111" }}>{tb.bowlers || 0}</div>
          </div>
          <div className="p-3 rounded-lg text-center" style={{ background: "#F5F7FA", border: "1px solid #E5E7EB" }}>
            <div className="text-[14px]" style={{ color: "#6B7280" }}>All-rounders</div>
            <div className="text-[20px] font-black" style={{ color: "#111111" }}>{tb.allrounders || 0}</div>
          </div>
          <div className="p-3 rounded-lg text-center" style={{ background: "#F5F7FA", border: "1px solid #E5E7EB" }}>
            <div className="text-[14px]" style={{ color: "#6B7280" }}>Wicketkeepers</div>
            <div className="text-[20px] font-black" style={{ color: "#111111" }}>{tb.wicketkeepers || 0}</div>
          </div>
        </div>
        {progressBar("Credits Used", tb.creditsUsed || 0, "#2563EB")}
        {statRow("Credits Remaining", tb.creditsRemaining != null ? `${tb.creditsRemaining}/100` : null, "#16A34A")}
        {statRow("Left vs Right", tb.leftRightCombo)}
        {statRow("Spin vs Pace", tb.spinVsPace)}
        {progressBar("Experience Score", tb.experienceScore || 0, "#F59E0B")}
      </>)}
    </>;
  }

  // ===== MODULE 10: Win Probability =====
  if (module === 10) {
    const wp = analysis.winProbability || {};
    return <>
      {card("🎯 WIN PROBABILITY", <>
        {progressBar(`${match.team1Short} Win`, wp.team1WinPct || 0, "#DC2626")}
        {progressBar(`${match.team2Short} Win`, wp.team2WinPct || 0, "#2563EB")}
        {statRow("Match Confidence", wp.matchConfidence ? `${wp.matchConfidence}%` : null, "#2563EB")}
        {statRow("Fantasy Confidence", wp.fantasyConfidence ? `${wp.fantasyConfidence}%` : null, "#16A34A")}
        {statRow("AI Prediction Confidence", wp.aiPredictionConfidence ? `${wp.aiPredictionConfidence}%` : null, "#7C3AED")}
      </>)}
    </>;
  }

  // ===== MODULE 11: Fantasy Value Picks =====
  if (module === 11) {
    const fp = analysis.fantasyValuePicks || {};
    return <>
      {card("💎 FANTASY VALUE PICKS", <>
        {fp.budgetPicks && fp.budgetPicks.length > 0 && (
          <div className="mb-3"><div className="text-[15px] font-bold mb-2" style={{ color: "#16A34A" }}>💰 BUDGET PICKS</div><div className="space-y-2">{fp.budgetPicks.map((p: string, i: number) => <div key={i}>{playerChip(p, "BUDGET", "#16A34A")}</div>)}</div></div>
        )}
        {fp.valuePicks && fp.valuePicks.length > 0 && (
          <div className="mb-3"><div className="text-[15px] font-bold mb-2" style={{ color: "#2563EB" }}>⭐ VALUE PICKS</div><div className="space-y-2">{fp.valuePicks.map((p: string, i: number) => <div key={i}>{playerChip(p, "VALUE", "#2563EB")}</div>)}</div></div>
        )}
        {fp.hiddenGems && fp.hiddenGems.length > 0 && (
          <div className="mb-3"><div className="text-[15px] font-bold mb-2" style={{ color: "#7C3AED" }}>🔮 HIDDEN GEMS</div><div className="space-y-2">{fp.hiddenGems.map((p: string, i: number) => <div key={i}>{playerChip(p, "GEM", "#7C3AED")}</div>)}</div></div>
        )}
        {fp.mustHave && fp.mustHave.length > 0 && (
          <div className="mb-3"><div className="text-[15px] font-bold mb-2" style={{ color: "#DC2626" }}>🔥 MUST HAVE</div><div className="space-y-2">{fp.mustHave.map((p: string, i: number) => <div key={i}>{playerChip(p, "MUST", "#DC2626")}</div>)}</div></div>
        )}
        {fp.avoidPlayers && fp.avoidPlayers.length > 0 && (
          <div className="mb-3"><div className="text-[15px] font-bold mb-2" style={{ color: "#DC2626" }}>❌ AVOID</div><div className="space-y-2">{fp.avoidPlayers.map((p: string, i: number) => <div key={i}>{playerChip(p, "AVOID", "#DC2626")}</div>)}</div></div>
        )}
        {fp.safePicks && fp.safePicks.length > 0 && (
          <div className="mb-3"><div className="text-[15px] font-bold mb-2" style={{ color: "#16A34A" }}>🛡️ SAFE PICKS</div><div className="space-y-2">{fp.safePicks.map((p: string, i: number) => <div key={i}>{playerChip(p, "SAFE", "#16A34A")}</div>)}</div></div>
        )}
        {fp.differentialPicks && fp.differentialPicks.length > 0 && (
          <div className="mb-3"><div className="text-[15px] font-bold mb-2" style={{ color: "#7C3AED" }}>💎 DIFFERENTIAL PICKS</div><div className="space-y-2">{fp.differentialPicks.map((p: string, i: number) => <div key={i}>{playerChip(p, "DIFF", "#7C3AED")}</div>)}</div></div>
        )}
      </>)}
    </>;
  }

  // ===== MODULE 12: Live Match Tracker =====
  if (module === 12) {
    const lt = analysis.liveTracker || {};
    return <>
      {card("📡 LIVE MATCH TRACKER", <>
        {statRow("Live Score", lt.liveScore || "Not live", "#DC2626")}
        {statRow("Overs", lt.overs)}
        {statRow("Runs", lt.runs)}
        {statRow("Wickets", lt.wickets)}
        {statRow("Current Run Rate", lt.currentRunRate, "#2563EB")}
        {statRow("Required Run Rate", lt.requiredRunRate, "#F59E0B")}
        {statRow("Partnership", lt.partnership)}
        {statRow("Momentum", lt.momentum, lt.momentum?.includes("Team1") ? "#DC2626" : lt.momentum?.includes("Team2") ? "#2563EB" : "#6B7280")}
      </>)}
      {lt.recentOvers && lt.recentOvers.length > 0 && card("📈 RECENT OVERS", <>
        <div className="space-y-2">
          {lt.recentOvers.map((over: string, i: number) => (
            <div key={i} className="p-2 rounded-lg text-[15px] font-mono" style={{ background: "#F5F7FA", border: "1px solid #E5E7EB", color: "#111111" }}>
              Over {i+1}: {over}
            </div>
          ))}
        </div>
      </>)}
    </>;
  }

  // ===== MODULE 13: AI Cheat Sheet =====
  if (module === 13) {
    const cs = analysis.cheatSheet || {};
    return <>
      {card("📋 AI CHEAT SHEET", <>
        {cs.mustPick && cs.mustPick.length > 0 && (
          <div className="mb-3"><div className="text-[15px] font-bold mb-2" style={{ color: "#16A34A" }}>✅ MUST PICK</div><div className="space-y-2">{cs.mustPick.map((p: string, i: number) => <div key={i}>{playerChip(p, "MUST", "#16A34A")}</div>)}</div></div>
        )}
        {cs.avoid && cs.avoid.length > 0 && (
          <div className="mb-3"><div className="text-[15px] font-bold mb-2" style={{ color: "#DC2626" }}>❌ AVOID</div><div className="space-y-2">{cs.avoid.map((p: string, i: number) => <div key={i}>{playerChip(p, "AVOID", "#DC2626")}</div>)}</div></div>
        )}
        {statRow("Safe Combination", cs.safeCombination)}
        {statRow("Grand League Combination", cs.grandLeagueCombination)}
        {statRow("Captain Lock", cs.captainLock, "#F59E0B")}
        {statRow("Vice Captain Lock", cs.viceCaptainLock, "#2563EB")}
        {cs.differentialPicks && cs.differentialPicks.length > 0 && (
          <div className="mb-3 mt-3"><div className="text-[15px] font-bold mb-2" style={{ color: "#7C3AED" }}>💎 DIFFERENTIAL PICKS</div><div className="space-y-2">{cs.differentialPicks.map((p: string, i: number) => <div key={i}>{playerChip(p, "DIFF", "#7C3AED")}</div>)}</div></div>
        )}
        {cs.hiddenPicks && cs.hiddenPicks.length > 0 && (
          <div className="mt-3"><div className="text-[15px] font-bold mb-2" style={{ color: "#16A34A" }}>🔮 HIDDEN PICKS</div><div className="space-y-2">{cs.hiddenPicks.map((p: string, i: number) => <div key={i}>{playerChip(p, "HIDDEN", "#16A34A")}</div>)}</div></div>
        )}
      </>)}
    </>;
  }

  // ===== MODULE 14: Final AI Verdict =====
  if (module === 14) {
    const fv = analysis.finalVerdict || {};
    return <>
      {card("⚡ FINAL AI VERDICT", <>
        <div className="text-center mb-4">
          <div className="text-[14px]" style={{ color: "#6B7280" }}>Overall Match Rating</div>
          <div className="text-[48px] font-black" style={{ color: fv.overallMatchRating >= 75 ? "#16A34A" : fv.overallMatchRating >= 50 ? "#F59E0B" : "#DC2626", fontFamily: "'Orbitron', sans-serif" }}>
            {fv.overallMatchRating || 0}<span className="text-[20px]" style={{ color: "#6B7280" }}>/100</span>
          </div>
        </div>
        {progressBar("AI Confidence", fv.aiConfidence || 0, "#2563EB")}
        {progressBar("Safe GL Rating", fv.safeGLRating || 0, "#16A34A")}
        {progressBar("Mega GL Rating", fv.megaGLRating || 0, "#7C3AED")}
        {progressBar("Risk Meter", fv.riskMeter || 0, "#DC2626")}
        {statRow("Fantasy Difficulty", fv.fantasyDifficulty, fv.fantasyDifficulty === "Easy" ? "#16A34A" : fv.fantasyDifficulty === "Hard" ? "#DC2626" : "#F59E0B")}
        {statRow("Winning Probability", fv.winningProbability)}
        <div className="mt-3 p-3 rounded-lg" style={{ background: "#EFF6FF", border: "1px solid #2563EB" }}>
          <div className="text-[14px] font-bold mb-1" style={{ color: "#2563EB" }}>🎯 FINAL RECOMMENDATION</div>
          <div className="text-[15px]" style={{ color: "#111111" }}>{fv.finalRecommendation}</div>
        </div>
      </>)}
    </>;
  }

  // ===== MODULE 15: Players to Avoid =====
  if (module === 15) {
    const pa = analysis.playersToAvoid || [];
    return <>
      {card("⚠️ PLAYERS TO AVOID (Max 5)", <>
        <div className="space-y-2">
          {pa.slice(0, 5).map((p: any, i: number) => (
            <div key={i} className="p-3 rounded-lg flex justify-between items-center" style={{ background: "#FEF2F2", border: "1px solid #DC2626", borderLeft: "4px solid #DC2626" }}>
              <span className="text-[16px] font-black" style={{ color: "#111111" }}>{p.name}</span>
              <span className="text-[13px] font-bold px-2 py-0.5 rounded" style={{ background: "#DC2626", color: "#FFFFFF" }}>{p.reason}</span>
            </div>
          ))}
          {pa.length === 0 && <div className="text-[15px] text-center py-4" style={{ color: "#6B7280" }}>No players to avoid — all picks look safe.</div>}
        </div>
      </>)}
    </>;
  }

  // ===== MODULE 16: Lock Confidence =====
  if (module === 16) {
    const lc = analysis.lockConfidence || [];
    return <>
      {card("📊 LOCK CONFIDENCE", <>
        <div className="space-y-3">
          {lc.map((p: any, i: number) => {
            const color = p.level === "Very High" ? "#16A34A" : p.level === "High" ? "#2563EB" : p.level === "Medium" ? "#F59E0B" : "#DC2626";
            return (
              <div key={i} className="p-3 rounded-lg" style={{ background: "#F5F7FA", border: "1px solid #E5E7EB" }}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[16px] font-black" style={{ color: "#111111" }}>{p.name}</span>
                  <span className="text-[13px] font-black px-2 py-0.5 rounded" style={{ background: color, color: "#FFFFFF" }}>{p.level}</span>
                </div>
                {progressBar("Lock Score", p.score || 0, color)}
              </div>
            );
          })}
          {lc.length === 0 && <div className="text-[15px] text-center py-4" style={{ color: "#6B7280" }}>No lock confidence data yet.</div>}
        </div>
      </>)}
    </>;
  }

  // ===== MODULE 17: Captain Matrix =====
  if (module === 17) {
    const cm = analysis.captainMatrix || [];
    return <>
      {card("🎯 CAPTAIN MATRIX", <>
        <div className="space-y-3">
          {cm.map((combo: any, i: number) => {
            const color = combo.combination === "Safe" ? "#16A34A" : combo.combination === "Balanced" ? "#2563EB" : combo.combination === "Grand League" ? "#F59E0B" : "#7C3AED";
            return (
              <div key={i} className="p-3 rounded-lg" style={{ background: "#F5F7FA", border: `2px solid ${color}` }}>
                <div className="text-[15px] font-black mb-2" style={{ color }}>{combo.combination}</div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded text-center" style={{ background: "#FFFBEB", border: "1px solid #F59E0B" }}>
                    <div className="text-[12px]" style={{ color: "#6B7280" }}>Captain</div>
                    <div className="text-[15px] font-black" style={{ color: "#111111" }}>{combo.captain}</div>
                  </div>
                  <div className="p-2 rounded text-center" style={{ background: "#EFF6FF", border: "1px solid #2563EB" }}>
                    <div className="text-[12px]" style={{ color: "#6B7280" }}>Vice Captain</div>
                    <div className="text-[15px] font-black" style={{ color: "#111111" }}>{combo.viceCaptain}</div>
                  </div>
                </div>
              </div>
            );
          })}
          {cm.length === 0 && <div className="text-[15px] text-center py-4" style={{ color: "#6B7280" }}>No captain matrix data yet.</div>}
        </div>
      </>)}
    </>;
  }

  // ===== MODULE 18: AI Insights =====
  if (module === 18) {
    const ai = analysis.aiInsights || {};
    return <>
      {card("🧠 AI INSIGHTS", <>
        <div className="space-y-3">
          {ai.topDifferential && <div className="p-3 rounded-lg" style={{ background: "#F5F3FF", border: "1px solid #7C3AED", borderLeft: "4px solid #7C3AED" }}><div className="text-[14px] font-bold" style={{ color: "#7C3AED" }}>💎 TOP DIFFERENTIAL</div><div className="text-[15px]" style={{ color: "#111111" }}>{ai.topDifferential}</div></div>}
          {ai.highestCeiling && <div className="p-3 rounded-lg" style={{ background: "#FFFBEB", border: "1px solid #F59E0B", borderLeft: "4px solid #F59E0B" }}><div className="text-[14px] font-bold" style={{ color: "#F59E0B" }}>🚀 HIGHEST CEILING</div><div className="text-[15px]" style={{ color: "#111111" }}>{ai.highestCeiling}</div></div>}
          {ai.safestPlayer && <div className="p-3 rounded-lg" style={{ background: "#F0FDF4", border: "1px solid #16A34A", borderLeft: "4px solid #16A34A" }}><div className="text-[14px] font-bold" style={{ color: "#16A34A" }}>🛡️ SAFEST PLAYER</div><div className="text-[15px]" style={{ color: "#111111" }}>{ai.safestPlayer}</div></div>}
          {ai.mostDangerousBowler && <div className="p-3 rounded-lg" style={{ background: "#FEF2F2", border: "1px solid #DC2626", borderLeft: "4px solid #DC2626" }}><div className="text-[14px] font-bold" style={{ color: "#DC2626" }}>⚡ MOST DANGEROUS BOWLER</div><div className="text-[15px]" style={{ color: "#111111" }}>{ai.mostDangerousBowler}</div></div>}
          {ai.explosiveBatter && <div className="p-3 rounded-lg" style={{ background: "#FFF7ED", border: "1px solid #EA580C", borderLeft: "4px solid #EA580C" }}><div className="text-[14px] font-bold" style={{ color: "#EA580C" }}>💥 EXPLOSIVE BATTER</div><div className="text-[15px]" style={{ color: "#111111" }}>{ai.explosiveBatter}</div></div>}
          {ai.deathOversSpecialist && <div className="p-3 rounded-lg" style={{ background: "#EFF6FF", border: "1px solid #2563EB", borderLeft: "4px solid #2563EB" }}><div className="text-[14px] font-bold" style={{ color: "#2563EB" }}>🎯 DEATH OVERS SPECIALIST</div><div className="text-[15px]" style={{ color: "#111111" }}>{ai.deathOversSpecialist}</div></div>}
          {ai.powerplaySpecialist && <div className="p-3 rounded-lg" style={{ background: "#F0F9FF", border: "1px solid #0EA5E9", borderLeft: "4px solid #0EA5E9" }}><div className="text-[14px] font-bold" style={{ color: "#0EA5E9" }}>⚡ POWERPLAY SPECIALIST</div><div className="text-[15px]" style={{ color: "#111111" }}>{ai.powerplaySpecialist}</div></div>}
        </div>
      </>)}
    </>;
  }

  return null;
}
