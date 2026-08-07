"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Search, Calendar, MapPin, Cloud, Activity, Users, Crown,
  TrendingUp, AlertCircle, Loader2, ChevronRight, RefreshCw,
  Trophy, Target, Zap, Shield, X, Sparkles, Star, Info, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getResearchMatches,
  getResearchMatchDetails,
  type ResearchMatch,
  type ResearchMatchDetails,
} from "@/lib/research-api";

interface MatchResearchPageProps {
  onClose?: () => void;
}

// ============================================================
// STANDALONE STATE — completely separate from existing app
// ============================================================
interface BestTeam {
  id: string;
  players: string;  // comma-separated player IDs
  cap: string;      // captain player ID
  vcap: string;     // vice-captain player ID
  likes: string;
  fname: string;    // user first name
  lname: string;    // user last name
  icon: string;     // user avatar
  admin: string;    // "9" = official/admin team
  uid: string;
}

interface ResearchPlayer {
  id: string;
  name: string;
  type: string;     // role type: 1=WK, 2=BAT, 3=AR, 4=BOWL (varies by sport)
  credits: string;
  points: string;
  cap: string;      // captain %
  cvc: string;      // vc %
  icon: string;
  active: string;
  cod?: string;     // team code (e.g. "BPH-W")
  cnam?: string;    // team name (e.g. "Birmingham Phoenix Women")
  [k: string]: unknown;
}

// Role type mapping (from possible11 API)
const ROLE_MAP: Record<string, string> = {
  "1": "WK",     // Wicket Keeper
  "2": "BAT",    // Batsman
  "3": "AR",     // All-Rounder
  "4": "BOWL",   // Bowler
  "6": "BOWL",   // Bowler (alt)
  "7": "BOWL",   // Bowler (alt)
  "9": "WK",     // WK (alt)
};

export function MatchResearchPage({ onClose }: MatchResearchPageProps) {
  const [matches, setMatches] = useState<ResearchMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<ResearchMatch | null>(null);
  const [matchDetails, setMatchDetails] = useState<ResearchMatchDetails | null>(null);
  const [bestTeams, setBestTeams] = useState<BestTeam[]>([]);
  const [players, setPlayers] = useState<ResearchPlayer[]>([]);
  const [voteData, setVoteData] = useState<any>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewingTeam, setViewingTeam] = useState<BestTeam | null>(null);

  const loadMatches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { matches: data, error: err } = await getResearchMatches("cricket", "upcoming");
      if (err) { setError(err); } else { setMatches(data); }
    } catch (e: any) { setError(e?.message || "Failed to load matches"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadMatches(); }, [loadMatches]);

  const loadMatchDetails = useCallback(async (match: ResearchMatch) => {
    setSelectedMatch(match);
    setDetailsLoading(true);
    setMatchDetails(null);
    setBestTeams([]);
    setPlayers([]);
    setVoteData(null);
    try {
      // Fetch match details, best teams, players, and vote data in parallel
      // NOTE: These are STANDALONE API calls via research-proxy — completely
      // separate from the existing app's API, transfer system, or team IDs.
      // Research data is READ-ONLY and never modifies player IDs, team IDs,
      // or transfer mapping.
      const [detailsRes, bestRes, playersRes, voteRes] = await Promise.all([
        getResearchMatchDetails(match.id),
        fetch("/api/research-proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "getBest", mid: match.id, uuid: "web-research", device: "web" }),
        }).then(r => r.json()).catch(() => []),
        fetch("/api/research-proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "getPlayers", mid: match.id, uuid: "web-research", device: "web" }),
        }).then(r => r.json()).catch(() => []),
        fetch("/api/research-proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "getVote", mid: match.id, uuid: "web-research", device: "web" }),
        }).then(r => r.json()).catch(() => null),
      ]);

      if (detailsRes.details) setMatchDetails(detailsRes.details);
      if (Array.isArray(bestRes)) setBestTeams(bestRes);
      if (Array.isArray(playersRes)) setPlayers(playersRes);
      if (voteRes && !voteRes.error) setVoteData(voteRes);

      // === RESOLVE SUGGESTED TEAM PLAYER IDSs TO NAMES + IMAGES ===
      // The getBest API returns comma-separated player IDs (e.g. "1355,65972,...")
      // but NOT names. We need to call getBestPlayers with those IDs to get
      // real player names, images, credits, and roles.
      // Per user spec: "Display the actual player names returned by the API."
      if (Array.isArray(bestRes) && bestRes.length > 0) {
        // Collect ALL unique player IDs from ALL suggested teams
        const allPlayerIds = new Set<string>();
        for (const team of bestRes) {
          const ids = String(team.players || "").split(",").filter(Boolean);
          ids.forEach(id => allPlayerIds.add(id));
        }
        const idsParam = Array.from(allPlayerIds).join(",");

        if (idsParam) {
          try {
            const bestPlayersRes = await fetch("/api/research-proxy", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "getBestPlayers",
                uid: "web-research",
                ids: idsParam,
                uuid: "web-research",
                device: "web",
              }),
            }).then(r => r.json()).catch(() => []);

            if (Array.isArray(bestPlayersRes) && bestPlayersRes.length > 0) {
              // Build a comprehensive player map: id → {name, icon, credits, role, team}
              const resolvedMap = new Map<string, ResearchPlayer>();
              for (const p of bestPlayersRes) {
                resolvedMap.set(String(p.id), {
                  id: String(p.id),
                  name: String(p.name || "Unknown"),
                  type: String(p.type || ""),
                  credits: String(p.credits || "0"),
                  points: String(p.points || "0"),
                  cap: String(p.cap || "0"),
                  cvc: String(p.cvc || "0"),
                  icon: String(p.icon || ""),
                  active: String(p.active || "1"),
                  cod: String(p.cod || ""),
                  cnam: String(p.cnam || ""),
                });
              }
              // Merge: use resolved players as the primary source, add any from getPlayers
              setPlayers(prev => {
                const merged = new Map<string, ResearchPlayer>();
                // Add resolved players first (they have real names)
                for (const [id, p] of resolvedMap) merged.set(id, p);
                // Add any from getPlayers that aren't already in the map
                for (const p of prev) {
                  if (!merged.has(p.id)) merged.set(p.id, p);
                }
                return Array.from(merged.values());
              });
              console.log(`[Research] Resolved ${resolvedMap.size} player names/images from getBestPlayers`);
            }
          } catch (err) {
            console.warn("[Research] Failed to resolve player names:", err);
          }
        }
      }
    } catch (e: any) {
      console.error("[Research] Failed to load details:", e);
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  const filteredMatches = matches.filter((m) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      String(m.name || "").toLowerCase().includes(q) ||
      String(m.cnm1 || "").toLowerCase().includes(q) ||
      String(m.cnm2 || "").toLowerCase().includes(q) ||
      String(m.tour || "").toLowerCase().includes(q)
    );
  });

  // === MATCH LIST VIEW ===
  if (!selectedMatch) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-violet-950/30 to-slate-900">
        {/* Header */}
        <div className="sticky top-0 z-20 bg-gradient-to-r from-violet-700 to-purple-700 text-white p-4 shadow-xl">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                <Search className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base font-black tracking-wide">APNA CRICKET</h1>
                <p className="text-[10px] text-white/80 font-semibold">Match Research Center</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={loadMatches} className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors">
                <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
              </button>
              {onClose && (
                <button onClick={onClose} className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto p-4">
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search matches, teams, series..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-11 pl-10 pr-4 rounded-xl border-2 border-violet-700/50 bg-slate-800 text-sm font-bold text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500"
            />
          </div>

          {loading && (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-12 h-12 text-violet-400 animate-spin mb-3" />
              <p className="text-sm font-bold text-slate-400">Loading matches...</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-20">
              <AlertCircle className="w-12 h-12 text-red-400 mb-3" />
              <p className="text-sm font-bold text-red-400 mb-2">{error}</p>
              <Button onClick={loadMatches} className="bg-violet-600 text-white">Retry</Button>
            </div>
          )}

          {!loading && !error && filteredMatches.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <Calendar className="w-12 h-12 text-slate-600 mb-3" />
              <p className="text-sm font-bold text-slate-400">No upcoming matches found</p>
            </div>
          )}

          {!loading && !error && filteredMatches.length > 0 && (
            <div className="space-y-3">
              {filteredMatches.map((match, i) => (
                <motion.div
                  key={match.id || i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => loadMatchDetails(match)}
                  className="bg-slate-800 rounded-2xl border-2 border-violet-800/50 p-4 cursor-pointer hover:border-violet-500 hover:shadow-lg hover:shadow-violet-900/50 transition-all"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-violet-300 bg-violet-900/50 px-2 py-0.5 rounded-full">
                      {match.tour || match.type || "Cricket"}
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold">{match.date || "TBA"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {match.fl1 && <img src={match.fl1} alt="" className="w-8 h-8 rounded-full" />}
                      <span className="text-sm font-bold text-white">{match.cnm1 || match.cod1 || "T1"}</span>
                    </div>
                    <span className="text-[10px] font-bold text-slate-500 px-2">VS</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{match.cnm2 || match.cod2 || "T2"}</span>
                      {match.fl2 && <img src={match.fl2} alt="" className="w-8 h-8 rounded-full" />}
                    </div>
                  </div>
                  <div className="flex items-center justify-end mt-2">
                    <span className="text-[10px] font-bold text-violet-400 flex items-center gap-0.5">
                      View Research <ChevronRight className="w-3 h-3" />
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // === MATCH DETAILS VIEW ===
  const d = matchDetails || {};

  // HTML stripper — converts HTML to bold readable text
  const stripHtml = (html: string) => {
    return String(html || "")
      .replace(/<h2[^>]*>/gi, "\n\n━━━ ")
      .replace(/<\/h2>/gi, " ━━━\n")
      .replace(/<h3[^>]*>/gi, "\n\n■ ")
      .replace(/<\/h3>/gi, "\n")
      .replace(/<h4[^>]*>/gi, "\n▶ ")
      .replace(/<\/h4>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\n  ● ")
      .replace(/<\/li>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<p[^>]*>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<strong[^>]*>/gi, "")
      .replace(/<\/strong>/gi, "")
      .replace(/<a[^>]*href="([^"]*)"[^>]*>/gi, "$1")
      .replace(/<\/a>/gi, "")
      .replace(/<img[^>]*>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };

  // Parse points table (JSON string)
  let pointsTable: any[] = [];
  try {
    if (d.points) pointsTable = JSON.parse(String(d.points));
  } catch {}

  // Build player ID → name map for C/VC resolution
  const playerMap = new Map<string, string>();
  for (const p of players) {
    playerMap.set(String(p.id), String(p.name || "Unknown"));
  }

  // Get official best team (admin="9")
  const officialTeam = bestTeams.find(t => t.admin === "9") || bestTeams[0];
  const capName = officialTeam ? (playerMap.get(officialTeam.cap) || `Player ${officialTeam.cap}`) : null;
  const vcapName = officialTeam ? (playerMap.get(officialTeam.vcap) || `Player ${officialTeam.vcap}`) : null;

  // Dynamic section config — maps API field to card
  const sections: Array<{ key: string; icon: any; title: string; color: string; content?: string }> = [
    { key: "latest", icon: Activity, title: "Latest Update", color: "from-sky-600 to-blue-700", content: d.latest as string },
    { key: "report", icon: Target, title: "Pitch Report & Weather", color: "from-amber-600 to-orange-700", content: d.report as string },
    { key: "detail", icon: Users, title: "Match Preview & Probable XI", color: "from-emerald-600 to-green-700", content: d.detail as string },
    { key: "squads", icon: Users, title: "Playing XI / Squads", color: "from-teal-600 to-cyan-700", content: d.squads as string },
    { key: "injured", icon: AlertCircle, title: "Injury Updates", color: "from-red-600 to-rose-700", content: d.injured as string },
    { key: "fantasy", icon: Sparkles, title: "Fantasy Insights & Tips", color: "from-pink-600 to-rose-700", content: d.fantasy as string },
  ];

  // Filter to only sections with content
  const activeSections = sections.filter(s => s.content && String(s.content).trim() && String(s.content).trim() !== "null");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-violet-950/20 to-slate-900">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-gradient-to-r from-violet-700 to-purple-700 text-white p-4 shadow-xl">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button onClick={() => setSelectedMatch(null)} className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors">
            <ChevronRight className="w-4 h-4 rotate-180" />
          </button>
          <div className="flex-1">
            <h1 className="text-sm font-black tracking-wide">{selectedMatch?.cnm1 || selectedMatch?.cod1 || "T1"} vs {selectedMatch?.cnm2 || selectedMatch?.cod2 || "T2"}</h1>
            <p className="text-[10px] text-white/80 font-semibold">{selectedMatch?.tour || "Match Research"}</p>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 space-y-4">
        {detailsLoading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-12 h-12 text-violet-400 animate-spin mb-3" />
            <p className="text-sm font-bold text-slate-400">Loading match research...</p>
          </div>
        )}

        {!detailsLoading && (
          <>
            {/* === MATCH OVERVIEW === */}
            <ResearchCard icon={Trophy} title="Match Overview" color="from-violet-600 to-purple-700">
              <div className="space-y-2 text-xs">
                {selectedMatch?.name && <ResearchRow label="Match" value={String(selectedMatch.name)} />}
                {selectedMatch?.tour && <ResearchRow label="Series" value={String(selectedMatch.tour)} />}
                {selectedMatch?.date && <ResearchRow label="Date" value={String(selectedMatch.date)} />}
                {selectedMatch?.type && <ResearchRow label="Format" value={String(selectedMatch.type.toUpperCase())} />}
                {selectedMatch?.cnm1 && <ResearchRow label="Team 1" value={String(selectedMatch.cnm1)} />}
                {selectedMatch?.cnm2 && <ResearchRow label="Team 2" value={String(selectedMatch.cnm2)} />}
                {d.uptime && <ResearchRow label="Updated" value={String(d.uptime)} />}
                {d.mstatus !== undefined && <ResearchRow label="Status" value={String(d.mstatus) === "0" ? "Upcoming" : String(d.mstatus) === "1" ? "Live" : "Completed"} />}
              </div>
            </ResearchCard>

            {/* === C/VC SUGGESTIONS === */}
            {capName && vcapName && (
              <ResearchCard icon={Crown} title="Captain & Vice-Captain Suggestions" color="from-amber-500 to-yellow-600">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-center">
                    <div className="w-10 h-10 mx-auto rounded-full bg-amber-500 flex items-center justify-center mb-2">
                      <Crown className="w-5 h-5 text-white" />
                    </div>
                    <p className="text-[9px] font-bold text-amber-400 uppercase">Captain</p>
                    <p className="text-sm font-black text-white mt-0.5">{capName}</p>
                  </div>
                  <div className="bg-sky-500/10 border border-sky-500/30 rounded-xl p-3 text-center">
                    <div className="w-10 h-10 mx-auto rounded-full bg-sky-500 flex items-center justify-center mb-2">
                      <Zap className="w-5 h-5 text-white" />
                    </div>
                    <p className="text-[9px] font-bold text-sky-400 uppercase">Vice-Captain</p>
                    <p className="text-sm font-black text-white mt-0.5">{vcapName}</p>
                  </div>
                </div>
                {officialTeam && (
                  <p className="text-[10px] text-slate-400 mt-2 text-center">
                    From {officialTeam.admin === "9" ? "Official GL Team" : `${officialTeam.fname} ${officialTeam.lname}`} · {officialTeam.likes} likes
                  </p>
                )}
              </ResearchCard>
            )}

            {/* === DYNAMIC SECTIONS — render ALL available content === */}
            {activeSections.map((section, idx) => (
              <ResearchCard key={section.key} icon={section.icon} title={section.title} color={section.color}>
                <div className="text-xs text-slate-200 whitespace-pre-wrap font-medium leading-relaxed">
                  {stripHtml(section.content!)}
                </div>
              </ResearchCard>
            ))}

            {/* === POINTS TABLE (if available) === */}
            {pointsTable.length > 0 && (
              <ResearchCard icon={TrendingUp} title="Points Table" color="from-indigo-600 to-violet-700">
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="border-b border-slate-700">
                        <th className="text-left p-1 font-bold text-slate-300">Team</th>
                        <th className="text-center p-1 font-bold text-slate-300">P</th>
                        <th className="text-center p-1 font-bold text-slate-300">W</th>
                        <th className="text-center p-1 font-bold text-slate-300">L</th>
                        <th className="text-center p-1 font-bold text-slate-300">Pts</th>
                        <th className="text-center p-1 font-bold text-slate-300">Form</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pointsTable.map((t, i) => (
                        <tr key={i} className="border-b border-slate-800">
                          <td className="p-1 font-bold text-white">{t.cname || t.ccode || "-"}</td>
                          <td className="text-center p-1 text-slate-400">{t.played || "-"}</td>
                          <td className="text-center p-1 text-emerald-400 font-bold">{t.won || "-"}</td>
                          <td className="text-center p-1 text-red-400 font-bold">{t.lost || "-"}</td>
                          <td className="text-center p-1 text-amber-400 font-bold">{t.points || "-"}</td>
                          <td className="text-center p-1 text-slate-400 font-mono text-[8px]">{t.forms || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ResearchCard>
            )}

            {/* (Old Dream Team section removed — replaced by detailed Suggested Teams section below) */}

            {/* === PLAYERS LIST (if available) === */}
            {players.length > 0 && (
              <ResearchCard icon={Users} title={`Players (${players.length})`} color="from-emerald-600 to-teal-700">
                <div className="grid grid-cols-2 gap-1.5">
                  {players.filter(p => p.active === "1" && p.name && !p.name.includes("Footballer")).map((p, i) => (
                    <div key={p.id || i} className="flex items-center gap-1.5 bg-slate-800/50 rounded-lg p-1.5">
                      {p.icon && <img src={p.icon} alt="" className="w-6 h-6 rounded-full flex-shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-white truncate">{p.name}</p>
                        <p className="text-[8px] text-slate-400">Cr: {p.credits} · Sel: {p.cap}%</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ResearchCard>
            )}

            {/* === WINNING POSSIBILITY & PLAYER VOTING (per user spec) === */}
            {voteData && (voteData.count1 || voteData.count2) && (
              <ResearchCard icon={TrendingUp} title="Winning Possibility & Player Voting" color="from-indigo-600 to-violet-700">
                {/* Win probability bar */}
                {voteData.count1 && voteData.count2 && (
                  <div className="mb-3">
                    <p className="text-[10px] font-bold text-slate-300 mb-1.5">Win Probability</p>
                    {(() => {
                      const total = Number(voteData.count1) + Number(voteData.count2);
                      const pct1 = total > 0 ? Math.round((Number(voteData.count1) / total) * 100) : 50;
                      const pct2 = 100 - pct1;
                      const name1 = selectedMatch?.cnm1 || "Team 1";
                      const name2 = selectedMatch?.cnm2 || "Team 2";
                      return (
                        <>
                          <div className="flex items-center justify-between text-[10px] font-bold mb-1">
                            <span className="text-emerald-400">{name1}: {pct1}%</span>
                            <span className="text-rose-400">{name2}: {pct2}%</span>
                          </div>
                          <div className="h-4 rounded-full overflow-hidden flex bg-slate-700">
                            <div className="bg-gradient-to-r from-emerald-500 to-green-500 flex items-center justify-center text-[8px] font-black text-white" style={{ width: `${pct1}%` }}>
                              {pct1 > 15 ? `${pct1}%` : ""}
                            </div>
                            <div className="bg-gradient-to-r from-rose-500 to-red-500 flex items-center justify-center text-[8px] font-black text-white" style={{ width: `${pct2}%` }}>
                              {pct2 > 15 ? `${pct2}%` : ""}
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-[9px] text-slate-500 mt-1">
                            <span>❤ {voteData.count1} votes</span>
                            <span>❤ {voteData.count2} votes</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* Voted players — Captain, VC, Keeper */}
                <div className="grid grid-cols-3 gap-2">
                  {voteData.cap && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-2 text-center">
                      <Crown className="w-4 h-4 text-amber-400 mx-auto mb-1" />
                      <p className="text-[8px] font-bold text-amber-400 uppercase">Captain</p>
                      <p className="text-[10px] font-black text-white mt-0.5 truncate">{playerMap.get(String(voteData.cap)) || `#${voteData.cap}`}</p>
                    </div>
                  )}
                  {voteData.vcap && (
                    <div className="bg-sky-500/10 border border-sky-500/30 rounded-lg p-2 text-center">
                      <Zap className="w-4 h-4 text-sky-400 mx-auto mb-1" />
                      <p className="text-[8px] font-bold text-sky-400 uppercase">Vice-Captain</p>
                      <p className="text-[10px] font-black text-white mt-0.5 truncate">{playerMap.get(String(voteData.vcap)) || `#${voteData.vcap}`}</p>
                    </div>
                  )}
                  {voteData.keeper && (
                    <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-2 text-center">
                      <Shield className="w-4 h-4 text-purple-400 mx-auto mb-1" />
                      <p className="text-[8px] font-bold text-purple-400 uppercase">Keeper</p>
                      <p className="text-[10px] font-black text-white mt-0.5 truncate">{playerMap.get(String(voteData.keeper)) || `#${voteData.keeper}`}</p>
                    </div>
                  )}
                </div>

                {/* Render any additional vote fields dynamically */}
                {Object.entries(voteData)
                  .filter(([k]) => !["cap", "vcap", "keeper", "winner1", "winner2", "count1", "count2"].includes(k))
                  .map(([key, val]) => (
                    <div key={key} className="mt-2 text-[10px] text-slate-400">
                      <span className="font-bold text-slate-300">{key}:</span> {String(val)}
                    </div>
                  ))
                }
              </ResearchCard>
            )}

            {/* === SUGGESTED TEAMS (per user spec — all categories) === */}
            {bestTeams.length > 0 && (
              <ResearchCard icon={Star} title={`Suggested Teams (${bestTeams.length})`} color="from-amber-500 to-orange-600">
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {bestTeams.map((team, i) => {
                    const isOfficial = team.admin === "9";
                    const category = isOfficial ? "Certified Team" : "Expert Team";
                    const categoryColor = isOfficial ? "bg-amber-500" : "bg-slate-600";
                    const playerIds = String(team.players || "").split(",").filter(Boolean);
                    const teamPlayers = playerIds.map(pid => {
                      const p = players.find(pl => String(pl.id) === pid);
                      return p ? { name: p.name, role: ROLE_MAP[p.type] || "BAT", credits: p.credits, icon: p.icon, team: p.cnam || p.cod } : null;
                    }).filter(Boolean);
                    const capName = playerMap.get(team.cap) || `#${team.cap}`;
                    const vcapName = playerMap.get(team.vcap) || `#${team.vcap}`;
                    const totalCredits = teamPlayers.reduce((s, p) => s + Number(p?.credits || 0), 0);

                    return (
                      <div key={team.id || i} className="bg-slate-800/70 rounded-xl border border-slate-700 p-2.5">
                        <div className="flex items-center gap-2 mb-2">
                          {team.icon && team.icon !== "assets/icon/default-male.png" && (
                            <img src={team.icon} alt="" className="w-6 h-6 rounded-full flex-shrink-0" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-black text-white truncate">{team.fname} {team.lname}</p>
                            <span className={cn("text-[7px] font-bold text-white px-1.5 py-0.5 rounded-full", categoryColor)}>
                              {category}
                            </span>
                          </div>
                          <span className="text-[8px] text-slate-400 flex-shrink-0">❤ {team.likes}</span>
                          <button
                            onClick={() => setViewingTeam(team)}
                            className="text-[8px] font-bold text-violet-300 bg-violet-600/30 hover:bg-violet-600/50 px-2 py-1 rounded-lg transition-colors flex items-center gap-0.5 flex-shrink-0"
                          >
                            <Eye className="w-2.5 h-2.5" /> View
                          </button>
                        </div>

                        {/* Player chips with photos */}
                        {teamPlayers.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {teamPlayers.map((p, j) => (
                              <div key={j} className="flex items-center gap-0.5 bg-slate-700/50 rounded px-1 py-0.5">
                                {p?.icon && <img src={p.icon} alt="" className="w-4 h-4 rounded-full flex-shrink-0" />}
                                <span className="text-[7px] font-bold text-slate-200">{String(p?.name || "").slice(0, 10)}</span>
                                {String(playerIds[j]) === team.cap && <Crown className="w-2.5 h-2.5 text-amber-400 flex-shrink-0" />}
                                {String(playerIds[j]) === team.vcap && <Zap className="w-2.5 h-2.5 text-sky-400 flex-shrink-0" />}
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-2 text-[9px]">
                          <span className="bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5">
                            <Crown className="w-2.5 h-2.5" /> {capName}
                          </span>
                          <span className="bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded font-bold flex items-center gap-0.5">
                            <Zap className="w-2.5 h-2.5" /> {vcapName}
                          </span>
                          <span className="text-slate-400 ml-auto">Cr: {totalCredits.toFixed(1)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ResearchCard>
            )}

            {/* === VIEW TEAM MODAL — full 11-player fantasy layout === */}
            {viewingTeam && (
              <TeamViewModal
                team={viewingTeam}
                players={players}
                playerMap={playerMap}
                match={selectedMatch}
                onClose={() => setViewingTeam(null)}
              />
            )}

            {/* === NO DATA FALLBACK === */}
            {activeSections.length === 0 && !detailsLoading && bestTeams.length === 0 && !voteData && (
              <div className="flex flex-col items-center justify-center py-20">
                <AlertCircle className="w-12 h-12 text-slate-600 mb-3" />
                <p className="text-sm font-bold text-slate-400">No research data available for this match yet</p>
                <p className="text-[10px] text-slate-500 mt-1">Check back closer to match time</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// TEAM VIEW MODAL — full 11-player fantasy layout (read-only)
// ============================================================

function TeamViewModal({
  team, players, playerMap, match, onClose,
}: {
  team: BestTeam;
  players: ResearchPlayer[];
  playerMap: Map<string, string>;
  match: ResearchMatch | null;
  onClose: () => void;
}) {
  const playerIds = String(team.players || "").split(",").filter(Boolean);
  const teamPlayers = playerIds.map(pid => {
    const p = players.find(pl => String(pl.id) === pid);
    return p ? {
      id: pid,
      name: p.name,
      role: ROLE_MAP[p.type] || "BAT",
      credits: p.credits,
      icon: p.icon,
      team: p.cnam || p.cod || "",
      isCap: pid === team.cap,
      isVC: pid === team.vcap,
    } : { id: pid, name: `#${pid}`, role: "BAT", credits: "0", icon: "", team: "", isCap: pid === team.cap, isVC: pid === team.vcap };
  });

  // Group by role
  const wk = teamPlayers.filter(p => p.role === "WK");
  const bat = teamPlayers.filter(p => p.role === "BAT");
  const ar = teamPlayers.filter(p => p.role === "AR");
  const bowl = teamPlayers.filter(p => p.role === "BOWL");
  const totalCredits = teamPlayers.reduce((s, p) => s + Number(p.credits || 0), 0);
  const isOfficial = team.admin === "9";

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        className="bg-slate-900 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[95vh] overflow-y-auto border border-slate-700"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-600 to-orange-600 p-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2">
            {team.icon && team.icon !== "assets/icon/default-male.png" && (
              <img src={team.icon} alt="" className="w-8 h-8 rounded-full" />
            )}
            <div>
              <h3 className="text-sm font-black text-white">{team.fname} {team.lname}</h3>
              <div className="flex items-center gap-1.5">
                <span className={cn("text-[8px] font-bold text-white px-1.5 py-0.5 rounded-full", isOfficial ? "bg-amber-800" : "bg-slate-700")}>
                  {isOfficial ? "CERTIFIED" : "EXPERT"}
                </span>
                <span className="text-[8px] text-white/80">❤ {team.likes} · Cr {totalCredits.toFixed(1)}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg bg-white/20 hover:bg-white/30">
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* C/VC banner */}
        <div className="flex gap-2 p-3 bg-slate-800">
          <div className="flex-1 bg-amber-500/15 border border-amber-500/40 rounded-xl p-2 text-center">
            <Crown className="w-4 h-4 text-amber-400 mx-auto mb-0.5" />
            <p className="text-[8px] font-bold text-amber-400">CAPTAIN</p>
            <p className="text-[11px] font-black text-white truncate">{playerMap.get(team.cap) || `#${team.cap}`}</p>
          </div>
          <div className="flex-1 bg-sky-500/15 border border-sky-500/40 rounded-xl p-2 text-center">
            <Zap className="w-4 h-4 text-sky-400 mx-auto mb-0.5" />
            <p className="text-[8px] font-bold text-sky-400">VICE-CAPTAIN</p>
            <p className="text-[11px] font-black text-white truncate">{playerMap.get(team.vcap) || `#${team.vcap}`}</p>
          </div>
        </div>

        {/* Players by role */}
        <div className="p-3 space-y-3">
          {/* WK */}
          {wk.length > 0 && (
            <RoleGroup label="WICKET KEEPERS" color="text-red-400" players={wk} />
          )}
          {/* BAT */}
          {bat.length > 0 && (
            <RoleGroup label="BATTERS" color="text-blue-400" players={bat} />
          )}
          {/* AR */}
          {ar.length > 0 && (
            <RoleGroup label="ALL-ROUNDERS" color="text-emerald-400" players={ar} />
          )}
          {/* BOWL */}
          {bowl.length > 0 && (
            <RoleGroup label="BOWLERS" color="text-purple-400" players={bowl} />
          )}
        </div>
      </motion.div>
    </div>
  );
}

function RoleGroup({ label, color, players }: { label: string; color: string; players: Array<{name: string; icon: string; credits: string; team: string; isCap: boolean; isVC: boolean}> }) {
  return (
    <div>
      <p className={cn("text-[9px] font-black mb-1.5 tracking-wide", color)}>{label} ({players.length})</p>
      <div className="grid grid-cols-2 gap-1.5">
        {players.map((p, i) => (
          <div key={i} className={cn(
            "flex items-center gap-1.5 rounded-lg p-1.5 border",
            p.isCap ? "bg-amber-500/10 border-amber-500/40" : p.isVC ? "bg-sky-500/10 border-sky-500/40" : "bg-slate-800 border-slate-700"
          )}>
            {p.icon ? (
              <img src={p.icon} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-[8px] font-bold text-slate-400 flex-shrink-0">?</div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-0.5">
                <p className="text-[10px] font-black text-white truncate">{p.name}</p>
                {p.isCap && <Crown className="w-2.5 h-2.5 text-amber-400 flex-shrink-0" />}
                {p.isVC && <Zap className="w-2.5 h-2.5 text-sky-400 flex-shrink-0" />}
              </div>
              <p className="text-[7px] text-slate-400">{p.team} · Cr {p.credits}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// HELPER COMPONENTS
// ============================================================

function ResearchCard({ icon: Icon, title, color, children }: { icon: any; title: string; color: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-800 rounded-2xl border border-slate-700 overflow-hidden shadow-lg"
    >
      <div className={cn("bg-gradient-to-r p-3 flex items-center gap-2", color)}>
        <Icon className="w-4 h-4 text-white" />
        <h3 className="text-xs font-black text-white tracking-wide">{title}</h3>
      </div>
      <div className="p-3 bg-slate-800">{children}</div>
    </motion.div>
  );
}

function ResearchRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="font-bold text-violet-300 min-w-[80px] flex-shrink-0">{label}:</span>
      <span className="text-slate-200 font-medium">{value}</span>
    </div>
  );
}
