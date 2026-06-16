"use client";

import { useEffect, useState } from "react";
import { getExpertTeams, getPrimeTeams, type TeamRow } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { TeamDisplay } from "@/components/match/team-display";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, Crown, Sparkles } from "lucide-react";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";

interface Props {
  variant: "expert" | "prime";
}

export function TeamListScreen({ variant }: Props) {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const setView = useApp((s) => s.setView);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = variant === "expert" ? await getExpertTeams() : await getPrimeTeams();
        if (active) setTeams(data);
      } catch {
        if (active) toast.error(`Could not load ${variant} teams.`);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [variant]);

  const isPrime = variant === "prime";
  const Icon = isPrime ? Crown : Sparkles;

  return (
    <div className="px-4 py-4 pb-24 space-y-4">
      <div
        className={`rounded-3xl p-5 text-white shadow-lg ${
          isPrime
            ? "bg-gradient-to-br from-amber-500 to-orange-600"
            : "brand-gradient"
        }`}
      >
        <div className="flex items-center gap-2 mb-1">
          <button
            onClick={() => setView("home")}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center backdrop-blur-sm"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <Icon className="w-4 h-4" />
          <h1 className="text-lg font-bold capitalize">{variant} Teams</h1>
        </div>
        <p className="text-xs text-white/80">
          {isPrime
            ? "Premium curated teams for serious players. Subscribe to unlock daily."
            : "Hand-picked expert teams for every match. Use as reference for your combinations."}
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-2xl" />
          ))}
        </div>
      ) : teams.length === 0 ? (
        <div className="text-center py-12">
          <Icon className="w-12 h-12 mx-auto text-violet-300 mb-3" />
          <p className="text-sm font-semibold mb-1">No {variant} teams available</p>
          <p className="text-xs text-muted-foreground mb-4">
            Check back closer to match time.
          </p>
          <Button onClick={() => setView("home")} className="brand-gradient text-white">
            Back to Home
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {teams.map((t, i) => (
            <motion.div
              key={(t._id ?? t.teamId ?? i) as string}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="space-y-1.5"
            >
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold flex items-center gap-1.5 capitalize">
                  <Icon className="w-3.5 h-3.5 text-violet-500" />
                  {variant} Team #{t.teamNo ?? i + 1}
                </span>
              </div>
              <TeamDisplay team={t} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
