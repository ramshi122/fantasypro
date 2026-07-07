"use client";

import { useEffect, useState } from "react";
import { getExpertTeams, getPrimeTeams, type TeamRow } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { TeamDisplay } from "@/components/match/team-display";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowLeft, Crown, Sparkles, Lock, CheckCircle2, Phone } from "lucide-react";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { useLicense } from "@/lib/use-license";
import { cn } from "@/lib/utils";

interface Props {
  variant: "expert" | "prime";
}

export function TeamListScreen({ variant }: Props) {
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const setView = useApp((s) => s.setView);
  const license = useLicense();

  // Expert teams: only monthly, elite, lifetime can access
  // Prime teams: only elite, lifetime can access
  const allowedTiers = variant === "expert"
    ? ["monthly", "elite", "lifetime"]  // Expert: Pro+Elites
    : ["elite", "lifetime"];             // Prime: Elite only

  const hasAccess = license.isLicensed && license.licenseKeyType &&
    allowedTiers.includes(license.licenseKeyType);

  useEffect(() => {
    if (!hasAccess) {
      setLoading(false);
      return;
    }

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
  }, [variant, hasAccess]);

  const isPrime = variant === "prime";
  const Icon = isPrime ? Crown : Sparkles;

  // LOCKED screen — user doesn't have required tier
  if (!hasAccess && !loading) {
    return (
      <div className="px-4 py-4 pb-24 space-y-4">
        {/* Header */}
        <div
          className={cn(
            "rounded-3xl p-5 text-white shadow-lg",
            isPrime
              ? "bg-gradient-to-br from-amber-500 to-orange-600"
              : "brand-gradient"
          )}
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
              ? "Premium curated teams for serious players."
              : "Hand-picked expert teams for every match."}
          </p>
        </div>

        {/* Locked message */}
        <div className="bg-slate-800 rounded-3xl p-6 text-center border border-amber-600/30">
          <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/20 flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-amber-400" />
          </div>
          <h2 className="text-base font-black text-foreground mb-2">
            🔒 {variant === "expert" ? "Expert Teams" : "Prime Teams"} Locked
          </h2>
          <p className="text-xs text-muted-foreground mb-4">
            {variant === "expert" ? (
              <>
                Expert Teams requires <b className="text-foreground">Pro (₹299)</b>, <b className="text-amber-400">Elite (₹999)</b>, or <b className="text-amber-400">Lifetime</b> subscription.
              </>
            ) : (
              <>
                Prime Teams requires <b className="text-amber-400">Elite (₹999)</b> or <b className="text-amber-400">Lifetime</b> subscription.
              </>
            )}
          </p>

          {/* Required tiers */}
          <div className="flex items-center justify-center gap-2 mb-4 flex-wrap">
            {variant === "expert" && (
              <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-sky-500/20 text-sky-400 border border-sky-500/30">
                💎 Pro ₹299
              </span>
            )}
            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30">
              👑 Elite ₹999
            </span>
            <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
              ♾️ Lifetime
            </span>
          </div>

          {/* Current status */}
          {license.isLicensed ? (
            <div className="bg-slate-900/50 rounded-xl p-3 mb-4">
              <p className="text-[10px] text-muted-foreground">Your current plan</p>
              <p className="text-sm font-bold text-foreground capitalize">
                {license.licenseKeyType || "Free"}
              </p>
              <p className="text-[10px] text-amber-400 mt-1">
                ⬆️ Upgrade to {variant === "expert" ? "Pro or higher" : "Elite or higher"} to unlock
              </p>
            </div>
          ) : (
            <div className="bg-slate-900/50 rounded-xl p-3 mb-4">
              <p className="text-[10px] text-muted-foreground">No active license</p>
              <p className="text-sm font-bold text-red-400">Please activate a license key</p>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2">
            <Button
              className="w-full brand-gradient text-white font-bold h-11"
              onClick={() => setView("profile")}
            >
              <Crown className="w-4 h-4 mr-2" />
              View Plans & Upgrade
            </Button>
            <Button
              variant="outline"
              className="w-full h-10 text-xs"
              onClick={() => setView("home")}
            >
              <ArrowLeft className="w-3 h-3 mr-1.5" />
              Back to Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="px-4 py-4 pb-24 space-y-4">
        <div
          className={cn(
            "rounded-3xl p-5 text-white shadow-lg",
            isPrime
              ? "bg-gradient-to-br from-amber-500 to-orange-600"
              : "brand-gradient"
          )}
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
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  // Teams list (user has access)
  return (
    <div className="px-4 py-4 pb-24 space-y-4">
      {/* Header */}
      <div
        className={cn(
          "rounded-3xl p-5 text-white shadow-lg",
          isPrime
            ? "bg-gradient-to-br from-amber-500 to-orange-600"
            : "brand-gradient"
        )}
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
          <span className="ml-auto text-[9px] bg-emerald-500 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
            <CheckCircle2 className="w-2.5 h-2.5" />
            {license.licenseKeyType?.toUpperCase()}
          </span>
        </div>
        <p className="text-xs text-white/80">
          {isPrime
            ? "Premium curated teams for serious players. Subscribe to unlock daily."
            : "Hand-picked expert teams for every match. Use as reference for your combinations."}
        </p>
      </div>

      {/* Teams */}
      {teams.length === 0 ? (
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
