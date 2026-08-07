"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Calendar, MapPin, Cloud, Activity, Users, Crown,
  TrendingUp, AlertCircle, Loader2, ChevronRight, RefreshCw,
  Trophy, Target, Zap, Shield, X, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getResearchMatches,
  getResearchMatchDetails,
  getResearchBestPlayers,
  type ResearchMatch,
  type ResearchMatchDetails,
  type ResearchBestPlayer,
} from "@/lib/research-api";

/**
 * APNA CRICKET — Match Research Page (Standalone Module)
 * ========================================================
 *
 * Completely independent from the rest of the application.
 * Uses its own API service (research-api.ts), own state, own types.
 * Does NOT import or reuse any existing match data, research data,
 * or fantasy data.
 *
 * Branding: "APNA CRICKET" — no references to any other app.
 */

interface MatchResearchPageProps {
  onClose?: () => void;
}

export function MatchResearchPage({ onClose }: MatchResearchPageProps) {
  const [matches, setMatches] = useState<ResearchMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<ResearchMatch | null>(null);
  const [matchDetails, setMatchDetails] = useState<ResearchMatchDetails | null>(null);
  const [bestPlayers, setBestPlayers] = useState<ResearchBestPlayer[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const loadMatches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { matches: data, error: err } = await getResearchMatches("cricket", "upcoming");
      if (err) {
        setError(err);
      } else {
        setMatches(data);
      }
    } catch (e: any) {
      setError(e?.message || "Failed to load matches");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMatches(); }, [loadMatches]);

  const loadMatchDetails = useCallback(async (match: ResearchMatch) => {
    setSelectedMatch(match);
    setDetailsLoading(true);
    setMatchDetails(null);
    setBestPlayers([]);
    try {
      const [detailsRes, bestRes] = await Promise.all([
        getResearchMatchDetails(match.MID),
        getResearchBestPlayers(match.MID),
      ]);
      if (detailsRes.details) setMatchDetails(detailsRes.details);
      if (bestRes.best) setBestPlayers(bestRes.best);
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
      String(m.title || "").toLowerCase().includes(q) ||
      String(m.team1 || "").toLowerCase().includes(q) ||
      String(m.team2 || "").toLowerCase().includes(q) ||
      String(m.series || "").toLowerCase().includes(q)
    );
  });

  // === MATCH LIST VIEW ===
  if (!selectedMatch) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-amber-50 dark:from-violet-950/30 dark:via-background dark:to-amber-950/20">
        <div className="sticky top-0 z-20 bg-gradient-to-r from-violet-600 to-purple-600 text-white p-4 shadow-lg">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
                <Search className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base font-black">APNA CRICKET</h1>
                <p className="text-[10px] text-white/80">Match Research Center</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={loadMatches} className="p-2 rounded-lg bg-white/20 hover:bg-white/30">
                <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
              </button>
              {onClose && (
                <button onClick={onClose} className="p-2 rounded-lg bg-white/20 hover:bg-white/30">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="max-w-3xl mx-auto p-4">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search matches, teams, series..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-11 pl-10 pr-4 rounded-xl border-2 border-violet-200 dark:border-violet-900/30 bg-white dark:bg-card text-sm font-medium focus:outline-none focus:border-violet-500"
            />
          </div>

          {loading && (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-12 h-12 text-violet-500 animate-spin mb-3" />
              <p className="text-sm font-bold text-muted-foreground">Loading matches...</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center py-20">
              <AlertCircle className="w-12 h-12 text-red-500 mb-3" />
              <p className="text-sm font-bold text-red-600 mb-2">{error}</p>
              <Button onClick={loadMatches} className="bg-violet-600 text-white">
                <RefreshCw className="w-4 h-4 mr-2" /> Retry
              </Button>
            </div>
          )}

          {!loading && !error && filteredMatches.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <Calendar className="w-12 h-12 text-muted-foreground mb-3" />
              <p className="text-sm font-bold text-muted-foreground">No upcoming matches found</p>
            </div>
          )}

          {!loading && !error && filteredMatches.length > 0 && (
            <div className="space-y-3">
              {filteredMatches.map((match, i) => (
                <motion.div
                  key={match.MID || i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => loadMatchDetails(match)}
                  className="bg-white dark:bg-card rounded-2xl border-2 border-violet-100 dark:border-violet-900/30 p-4 cursor-pointer hover:border-violet-400 hover:shadow-lg transition-all"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-950/40 px-2 py-0.5 rounded-full">
                      {match.series || match.matchType || "Cricket"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{match.matchTime || "TBA"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {match.team1Logo && <img src={match.team1Logo} alt="" className="w-8 h-8 rounded-full" />}
                      <span className="text-sm font-bold">{match.team1 || match.team1Short || "T1"}</span>
                    </div>
                    <span className="text-[10px] font-bold text-muted-foreground px-2">VS</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{match.team2 || match.team2Short || "T2"}</span>
                      {match.team2Logo && <img src={match.team2Logo} alt="" className="w-8 h-8 rounded-full" />}
                    </div>
                  </div>
                  {match.venue && (
                    <div className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground">
                      <MapPin className="w-3 h-3" /> {match.venue}
                    </div>
                  )}
                  <div className="flex items-center justify-end mt-2">
                    <span className="text-[10px] font-bold text-violet-600 dark:text-violet-400 flex items-center gap-0.5">
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
  const details = matchDetails?.details || {};

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-amber-50 dark:from-violet-950/30 dark:via-background dark:to-amber-950/20">
      <div className="sticky top-0 z-20 bg-gradient-to-r from-violet-600 to-purple-600 text-white p-4 shadow-lg">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <button onClick={() => setSelectedMatch(null)} className="p-2 rounded-lg bg-white/20 hover:bg-white/30">
            <ChevronRight className="w-4 h-4 rotate-180" />
          </button>
          <div className="flex-1">
            <h1 className="text-sm font-black">{selectedMatch?.team1 || "T1"} vs {selectedMatch?.team2 || "T2"}</h1>
            <p className="text-[10px] text-white/80">{selectedMatch?.series || "Match Research"}</p>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-2 rounded-lg bg-white/20 hover:bg-white/30">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto p-4 space-y-4">
        {detailsLoading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-12 h-12 text-violet-500 animate-spin mb-3" />
            <p className="text-sm font-bold text-muted-foreground">Loading match research...</p>
          </div>
        )}

        {!detailsLoading && (
          <>
            {selectedMatch?.venue && (
              <ResearchCard icon={Trophy} title="Match Overview" color="from-violet-500 to-purple-600">
                <div className="space-y-1.5 text-xs">
                  <ResearchRow label="Venue" value={String(selectedMatch.venue)} />
                  {selectedMatch?.matchTime && <ResearchRow label="Match Time" value={String(selectedMatch.matchTime)} />}
                  {selectedMatch?.matchType && <ResearchRow label="Format" value={String(selectedMatch.matchType)} />}
                  {details.match_info && <ResearchRow label="Info" value={String(details.match_info)} />}
                </div>
              </ResearchCard>
            )}

            {details.pitch_report && (
              <ResearchCard icon={Target} title="Pitch Report" color="from-amber-500 to-orange-600">
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{String(details.pitch_report)}</p>
              </ResearchCard>
            )}

            {details.weather && (
              <ResearchCard icon={Cloud} title="Weather Report" color="from-sky-500 to-blue-600">
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{String(details.weather)}</p>
              </ResearchCard>
            )}

            {(details.venue || details.ground_stats || details.avg_score) && (
              <ResearchCard icon={MapPin} title="Venue & Ground Stats" color="from-emerald-500 to-green-600">
                <div className="space-y-1.5 text-xs">
                  {details.venue && <ResearchRow label="Venue" value={String(details.venue)} />}
                  {details.avg_score && <ResearchRow label="Average Score" value={String(details.avg_score)} />}
                  {details.ground_stats && <ResearchRow label="Ground Stats" value={String(details.ground_stats)} />}
                </div>
              </ResearchCard>
            )}

            {details.head_to_head && (
              <ResearchCard icon={Shield} title="Head-to-Head" color="from-rose-500 to-pink-600">
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{String(details.head_to_head)}</p>
              </ResearchCard>
            )}

            {details.toss && (
              <ResearchCard icon={Activity} title="Toss Analysis" color="from-indigo-500 to-violet-600">
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{String(details.toss)}</p>
              </ResearchCard>
            )}

            {details.playing_xi && (
              <ResearchCard icon={Users} title="Playing XI (Confirmed)" color="from-emerald-600 to-teal-600">
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{String(details.playing_xi)}</p>
              </ResearchCard>
            )}

            {details.probable_xi && (
              <ResearchCard icon={Users} title="Probable XI" color="from-amber-600 to-yellow-600">
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{String(details.probable_xi)}</p>
              </ResearchCard>
            )}

            {details.injury && (
              <ResearchCard icon={AlertCircle} title="Injury Updates" color="from-red-500 to-rose-600">
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{String(details.injury)}</p>
              </ResearchCard>
            )}

            {details.captain_picks && (
              <ResearchCard icon={Crown} title="Captain Picks" color="from-amber-500 to-yellow-600">
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{String(details.captain_picks)}</p>
              </ResearchCard>
            )}

            {details.vc_picks && (
              <ResearchCard icon={Zap} title="Vice-Captain Picks" color="from-sky-500 to-cyan-600">
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{String(details.vc_picks)}</p>
              </ResearchCard>
            )}

            {details.win_probability && (
              <ResearchCard icon={TrendingUp} title="Win Probability" color="from-violet-500 to-purple-600">
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{String(details.win_probability)}</p>
              </ResearchCard>
            )}

            {details.fantasy_tips && (
              <ResearchCard icon={Sparkles} title="Fantasy Insights" color="from-pink-500 to-rose-600">
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{String(details.fantasy_tips)}</p>
              </ResearchCard>
            )}

            {bestPlayers.length > 0 && (
              <ResearchCard icon={Crown} title="AI Captain & VC Suggestions" color="from-amber-500 to-orange-600">
                <div className="space-y-2">
                  {bestPlayers.map((bp, i) => (
                    <div key={i} className="flex items-start gap-2 bg-white/50 dark:bg-card/50 rounded-lg p-2">
                      <div className={cn(
                        "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white flex-shrink-0",
                        String(bp.type || "").includes("cap") ? "bg-amber-500" : "bg-sky-500"
                      )}>
                        {String(bp.type || "").includes("cap") ? "C" : "VC"}
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-bold">{bp.name}</p>
                        {bp.reason && <p className="text-[10px] text-muted-foreground mt-0.5">{bp.reason}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </ResearchCard>
            )}

            {!matchDetails && !detailsLoading && (
              <div className="flex flex-col items-center justify-center py-20">
                <AlertCircle className="w-12 h-12 text-muted-foreground mb-3" />
                <p className="text-sm font-bold text-muted-foreground">No research data available for this match yet</p>
                <p className="text-[10px] text-muted-foreground mt-1">Check back closer to match time</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ResearchCard({ icon: Icon, title, color, children }: { icon: any; title: string; color: string; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-white dark:bg-card rounded-2xl border-2 border-slate-100 dark:border-slate-800 overflow-hidden">
      <div className={cn("bg-gradient-to-r p-3 flex items-center gap-2", color)}>
        <Icon className="w-4 h-4 text-white" />
        <h3 className="text-xs font-black text-white">{title}</h3>
      </div>
      <div className="p-3">{children}</div>
    </motion.div>
  );
}

function ResearchRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="font-bold text-foreground min-w-[80px] flex-shrink-0">{label}:</span>
      <span className="text-muted-foreground">{value}</span>
    </div>
  );
}
