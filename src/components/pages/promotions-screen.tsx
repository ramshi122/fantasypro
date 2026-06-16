"use client";

import { useEffect, useState } from "react";
import { getPromotions, type PromotionItem } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { ExternalLink, Flame, Gift, Send, Sparkles, Tag, Trophy, Users } from "lucide-react";

// Rebrand mapping — replace old "Team Generation" labels with FantasyPro equivalents
function rebrand(label?: string): string {
  if (!label) return "";
  const l = label.toLowerCase();
  if (l.includes("tg group")) return "FantasyPro Group";
  if (l.includes("tg believer") || l.includes("believer01")) return "FantasyPro Community";
  if (l.includes("team generation")) return "FantasyPro";
  return label;
}

// Pick an icon based on the promo content
function pickIcon(label?: string, type?: string) {
  const l = (label || "").toLowerCase();
  if (l.includes("group") || l.includes("community")) return Users;
  if (l.includes("transfer") || l.includes("dream11")) return Send;
  if (l.includes("telegram") || l.includes("subscribe") || l.includes("channel")) return Sparkles;
  if (l.includes("rule")) return Flame;
  if (l.includes("win") || l.includes("league")) return Trophy;
  if (type === "referral") return Sparkles;
  if (type === "discount") return Tag;
  return Gift;
}

// Sexy gradient palette (new FantasyPro brand colors)
const GRADIENTS = [
  "from-violet-600 via-purple-600 to-fuchsia-600",
  "from-pink-600 via-rose-600 to-red-600",
  "from-sky-500 via-blue-600 to-indigo-600",
  "from-emerald-500 via-teal-500 to-cyan-600",
  "from-amber-500 via-orange-500 to-pink-600",
  "from-fuchsia-600 via-pink-600 to-rose-600",
];

const GLOWS = [
  "shadow-violet-500/40",
  "shadow-pink-500/40",
  "shadow-sky-500/40",
  "shadow-emerald-500/40",
  "shadow-amber-500/40",
  "shadow-fuchsia-500/40",
];

export function PromotionsScreen() {
  const [items, setItems] = useState<PromotionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await getPromotions();
        if (active) {
          setItems(data);
          if (data.length === 0) setError("No promotions available right now.");
        }
      } catch (err: any) {
        if (active) {
          setError(err?.message || "Could not load promotions.");
          setItems([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="px-4 py-4 pb-24 space-y-4">
      {/* Header with brand gradient + decorative shapes */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="brand-gradient rounded-3xl p-5 text-white shadow-xl shadow-violet-500/30 relative overflow-hidden"
      >
        <div className="absolute -top-8 -right-8 w-32 h-32 bg-white/15 rounded-full blur-sm" />
        <div className="absolute -bottom-12 -left-8 w-40 h-40 bg-white/10 rounded-full" />
        <div className="absolute top-1/2 right-1/4 w-20 h-20 border-2 border-white/20 rounded-full" />

        <div className="relative flex items-center gap-2 mb-1">
          <div className="w-9 h-9 rounded-xl bg-white/25 backdrop-blur-md flex items-center justify-center">
            <Gift className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight">Promotions</h1>
            <p className="text-[11px] text-white/80">Exclusive FantasyPro offers & deals</p>
          </div>
        </div>
      </motion.div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center mb-3">
            <Gift className="w-8 h-8 text-violet-400" />
          </div>
          <p className="text-sm font-semibold mb-1">No promotions available</p>
          <p className="text-xs text-muted-foreground px-6">
            {error || "Check back later for new offers."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((p, i) => {
            const gradient = GRADIENTS[i % GRADIENTS.length];
            const glow = GLOWS[i % GLOWS.length];
            const Icon = pickIcon(p.title || p.label, p.type);
            const hasImage = !!p.image;
            const displayTitle = rebrand(p.title || p.label);
            return (
              <motion.div
                key={(p._id ?? i) as string}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                whileHover={{ scale: 1.02, y: -2 }}
                className={`rounded-2xl ${hasImage ? "overflow-hidden" : `bg-gradient-to-br ${gradient} p-4 text-white`} shadow-xl ${glow} relative cursor-pointer overflow-hidden`}
                onClick={() => {
                  if (p.url || p.link) {
                    window.open(p.url || p.link, "_blank", "noopener,noreferrer");
                  }
                }}
              >
                {hasImage ? (
                  <>
                    <img
                      src={p.image!}
                      alt={displayTitle || "Promotion"}
                      className="w-full h-36 object-cover"
                    />
                    {/* Sexy gradient overlay with brand colors */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-violet-900/80 via-black/40 to-pink-900/40" />
                    {/* Decorative shapes */}
                    <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/10 rounded-full blur-sm" />
                    <div className="absolute top-3 right-3 w-16 h-16 border-2 border-white/20 rounded-full" />

                    <div className="absolute inset-0 flex items-end p-4">
                      <div className="flex items-end gap-3 w-full">
                        <div className="w-11 h-11 rounded-xl bg-white/25 backdrop-blur-md flex items-center justify-center flex-shrink-0 ring-1 ring-white/30 shadow-lg">
                          <Icon className="w-5 h-5 text-white drop-shadow" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-base font-extrabold text-white leading-tight drop-shadow-sm">
                            {displayTitle}
                          </p>
                          {p.description && (
                            <p className="text-xs text-white/85 mt-0.5 line-clamp-2">{p.description}</p>
                          )}
                          <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-bold bg-white/25 hover:bg-white/40 backdrop-blur-md px-2.5 py-1 rounded-full ring-1 ring-white/30">
                            Claim now
                            <ExternalLink className="w-3 h-3" />
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="relative flex items-start gap-3">
                    {/* Decorative shapes */}
                    <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/15 rounded-full blur-sm" />
                    <div className="absolute -right-12 -bottom-12 w-32 h-32 bg-white/10 rounded-full" />
                    <div className="absolute top-2 right-2 w-16 h-16 border-2 border-white/20 rounded-full" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-white/5 rounded-full blur-2xl" />

                    <div className="relative w-12 h-12 rounded-2xl bg-white/25 backdrop-blur-md flex items-center justify-center flex-shrink-0 shadow-lg ring-1 ring-white/30">
                      <Icon className="w-6 h-6 text-white drop-shadow" />
                    </div>
                    <div className="relative flex-1 min-w-0">
                      <p className="text-[10px] text-white/80 font-semibold uppercase tracking-wider">
                        FantasyPro Offer
                      </p>
                      <p className="text-base font-extrabold leading-tight mt-0.5 drop-shadow-sm">
                        {displayTitle}
                      </p>
                      {p.description && (
                        <p className="text-xs text-white/85 mt-1 leading-relaxed">
                          {p.description}
                        </p>
                      )}
                      <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold bg-white/25 hover:bg-white/40 backdrop-blur-md px-3 py-1 rounded-full ring-1 ring-white/30">
                        Claim now
                        <ExternalLink className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
