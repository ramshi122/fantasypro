"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useApp } from "@/lib/store";
import { getMatches, shouldShowMatchCard, type MatchInfo } from "@/lib/api";
import { SportTabs, MatchTabs } from "./sport-tabs";
import { PromoBanners } from "./promo-banners";
import { MatchCard } from "./match-card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

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
      if (data.length === 0) {
        setError("No matches returned by the API. Try another sport.");
        setMatches([]);
      } else {
        // Filter: hide matches where NEITHER Dream11 NOR My11Circle is supported.
        // Visibility rule:
        //   Dream11 available → show
        //   My11Circle available → show
        //   Both available → show
        //   Neither available → HIDE
        const visible = data.filter(shouldShowMatchCard);
        const hiddenCount = data.length - visible.length;
        if (hiddenCount > 0) {
          console.log(`[home] Filtered out ${hiddenCount} match(es) with no Dream11/My11Circle support`);
        }
        setMatches(visible);
      }
    } catch (err: any) {
      console.error("[home] getMatches failed:", err);
      setError(err?.message || "Failed to load matches from the server.");
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [sport]);


  const displayMatches = tab === "saved"
    ? savedMatches.filter(shouldShowMatchCard)
    : matches;

  return (
    <div className="px-4 py-4 space-y-4 pb-24">
      {/* Apna Cricket Premium Branding Video Banner */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="block w-full rounded-2xl overflow-hidden shadow-xl relative bg-gradient-to-br from-slate-950 via-violet-950 to-slate-950 border border-amber-600/30"
      >
        <div className="relative aspect-video flex items-center justify-center">
          {/* Logo with 3D-style glow */}
          <div className="relative z-10 text-center">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.8, ease: "backOut" }}
              className="w-28 h-28 mx-auto mb-3 rounded-2xl overflow-hidden shadow-2xl ring-2 ring-amber-400/50"
              style={{ boxShadow: "0 0 40px rgba(251, 191, 36, 0.4)" }}
            >
              <img
                src="/logo-square.png"
                alt="Apna Cricket"
                className="w-full h-full object-cover"
              />
            </motion.div>
            <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500 drop-shadow-lg">
              APNA CRICKET
            </h2>
            <p className="text-[10px] text-amber-200/80 font-bold tracking-[0.3em] uppercase mt-1">
              Fantasy Team
            </p>
            <p className="text-[9px] text-slate-400 mt-2 font-medium">
              Pick • Strategize • Win
            </p>
          </div>

          {/* Animated shimmer overlay */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-amber-400/10 to-transparent"
            initial={{ x: "-100%" }}
            animate={{ x: "100%" }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      </motion.div>

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
          © 2026 Apna Cricket · All Rights Reserved
          <br />
          Developed by Apna Cricket Team
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
