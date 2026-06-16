"use client";

import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { getMatches, type MatchInfo } from "@/lib/api";
import { SportTabs, MatchTabs } from "./sport-tabs";
import { PromoBanners } from "./promo-banners";
import { MatchCard } from "./match-card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function HomeScreen() {
  const sport = useApp((s) => s.sport);
  const tab = useApp((s) => s.matchTab);
  const savedMatches = useApp((s) => s.savedMatches);
  const [matches, setMatches] = useState<MatchInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await getMatches(sport);
      setMatches(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load matches");
      toast.error("Could not load matches. Using demo data.");
      // Demo data fallback so the UI is always functional
      setMatches(getDemoMatches(sport));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [sport]);


  const displayMatches = tab === "saved" ? savedMatches : matches;

  return (
    <div className="px-4 py-4 space-y-4 pb-24">
      <SportTabs />

      <PromoBanners />

      <MatchTabs />

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Accuracy" value="91.2%" gradient="from-violet-500 to-purple-600" />
        <StatCard label="Premium" value="Software" gradient="from-pink-500 to-rose-600" />
        <StatCard label="Active" value={displayMatches.length.toString()} gradient="from-sky-500 to-cyan-600" />
      </div>

      {/* Matches list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      ) : error && displayMatches.length === 0 ? (
        <div className="text-center py-12 px-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center mb-3">
            <AlertCircle className="w-7 h-7 text-red-500" />
          </div>
          <p className="text-sm font-semibold text-foreground mb-1">
            Could not load matches
          </p>
          <p className="text-xs text-muted-foreground mb-4">{error}</p>
          <Button onClick={load} size="sm" variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
      ) : displayMatches.length === 0 ? (
        <div className="text-center py-12 px-4">
          <div className="w-14 h-14 mx-auto rounded-full bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center mb-3">
            <span className="text-2xl">📭</span>
          </div>
          <p className="text-sm font-semibold text-foreground mb-1">
            {tab === "saved" ? "No saved matches" : "No upcoming matches"}
          </p>
          <p className="text-xs text-muted-foreground">
            {tab === "saved"
              ? "Tap the bookmark icon on any match to save it here."
              : "Check back later or try another sport."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayMatches.map((m, i) => (
            <MatchCard key={(m.matchId ?? m.id ?? i) as string} match={m} index={i} />
          ))}
        </div>
      )}

      {/* Footer disclaimer */}
      <div className="pt-4 pb-2 text-center">
        <p className="text-[10px] text-muted-foreground/70 leading-relaxed">
          © 2026 FantasyPro · All Rights Reserved
          <br />
          Developed by FantasyPro Team
        </p>
      </div>
    </div>
  );
}

function StatCard({ label, value, gradient }: { label: string; value: string; gradient: string }) {
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${gradient} p-3 text-white shadow-md`}>
      <p className="text-[10px] font-medium text-white/80">{label}</p>
      <p className="text-base font-black mt-0.5 leading-tight">{value}</p>
    </div>
  );
}

function getDemoMatches(sport: string): MatchInfo[] {
  const now = Date.now();
  const hour = 3600 * 1000;
  if (sport === "cricket") {
    return [
      { matchId: "demo1", title: "Afghanistan in India ODI", team1: { shortName: "IND" }, team2: { shortName: "AFG" }, startTime: now + 13 * hour, series: "Afghanistan in India ODI" },
      { matchId: "demo2", title: "India vs Afghanistan ODI", team1: { shortName: "IND" }, team2: { shortName: "AFG" }, startTime: now + 13 * hour, series: "India vs Afghanistan ODI" },
      { matchId: "demo3", title: "Women's World Trophy T20", team1: { shortName: "IND-W" }, team2: { shortName: "NED-W" }, startTime: now + 18 * hour, series: "Women's World Trophy T20" },
      { matchId: "demo4", title: "Women's T20 World Cup", team1: { shortName: "IND" }, team2: { shortName: "NED" }, startTime: now + 18 * hour, series: "Women's T20 World Cup" },
      { matchId: "demo5", title: "Women's T20 World Cup", team1: { shortName: "SA" }, team2: { shortName: "PAK" }, startTime: now + 22 * hour, series: "Women's T20 World Cup" },
    ];
  }
  return [
    { matchId: "demo1", title: `${sport.toUpperCase()} Match 1`, team1: { shortName: "TEAM A" }, team2: { shortName: "TEAM B" }, startTime: now + 5 * hour, series: `${sport} League` },
    { matchId: "demo2", title: `${sport.toUpperCase()} Match 2`, team1: { shortName: "TEAM C" }, team2: { shortName: "TEAM D" }, startTime: now + 8 * hour, series: `${sport} League` },
  ];
}
