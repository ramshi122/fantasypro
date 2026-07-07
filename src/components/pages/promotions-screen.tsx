"use client";

import { useEffect, useState } from "react";
import { getPromotions, type PromotionItem } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { ExternalLink, Flame, Gift, Send, Sparkles, Tag, Trophy, Users, Youtube } from "lucide-react";

// Rebrand mapping — replace ALL old "Team Generation" / "TG" / "Believer01" labels
// with Apna Cricket equivalents. Old API labels are never shown to the user.
function rebrand(label?: string): string {
  if (!label) return "Apna Cricket";
  const l = label.toLowerCase();
  if (l.includes("tg group")) return "Apna Cricket Community";
  if (l.includes("tg believer") || l.includes("believer01")) return "Apna Cricket Community";
  if (l.includes("team generation")) return "Apna Cricket";
  if (l.includes("transfer") && l.includes("dream11")) return "Transfer to Dream11";
  if (l.includes("subscribe") && l.includes("channel")) return "Subscribe to Apna Cricket";
  if (l.includes("subscribe")) return "Subscribe to Apna Cricket";
  if (l.includes("myfab11")) return "Play on MyFab11";
  if (l.includes("d11") || l.includes("rules")) return "Dream11 New Rules 2026";
  // Already rebranded
  return label;
}

// Rebuild the description — never reuse the API's old copy
function rebuildDescription(label?: string): string {
  if (!label) return "Tap to explore exclusive Apna Cricket benefits.";
  const l = label.toLowerCase();
  if (l.includes("tg group") || l.includes("believer")) return "Join 50,000+ Apna Cricket players. Get instant match alerts, prime teams & expert tips.";
  if (l.includes("transfer") && l.includes("dream11")) return "One-tap direct team transfer to your Dream11 account. No manual selection needed.";
  if (l.includes("subscribe") && l.includes("telegram")) return "Free prime teams, expert predictions & GL teams delivered daily to your Telegram.";
  if (l.includes("subscribe") && l.includes("channel")) return "Subscribe to Apna Cricket YouTube for team breakdowns, match analysis & winning strategies.";
  if (l.includes("d11") || l.includes("rules")) return "Updated Dream11 rules for 2026 season — new scoring, new credits, new captain rules.";
  if (l.includes("myfab11")) return "Play fantasy cricket on MyFab11 with exclusive Apna Cricket referral bonus.";
  return "Tap to explore exclusive Apna Cricket benefits.";
}

// Pick an icon based on the promo content
function pickIcon(label?: string, type?: string) {
  const l = (label || "").toLowerCase();
  if (l.includes("group") || l.includes("believer") || l.includes("community")) return Users;
  if (l.includes("transfer") || l.includes("dream11")) return Send;
  if (l.includes("telegram")) return Sparkles;
  if (l.includes("youtube") || l.includes("yt")) return Youtube;
  if (l.includes("rule")) return Flame;
  if (l.includes("win") || l.includes("league")) return Trophy;
  if (l.includes("myfab11")) return Trophy;
  if (type === "referral") return Sparkles;
  if (type === "discount") return Tag;
  return Gift;
}

// Sexy gradient palette — Apna Cricket brand colors (violet → pink → amber family)
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

// Action labels per promo type
function ctaLabel(label?: string): string {
  const l = (label || "").toLowerCase();
  if (l.includes("group") || l.includes("believer") || l.includes("community")) return "Join group";
  if (l.includes("transfer") || l.includes("dream11")) return "Transfer now";
  if (l.includes("telegram")) return "Open Telegram";
  if (l.includes("youtube") || l.includes("yt")) return "Subscribe";
  if (l.includes("rule")) return "Read rules";
  if (l.includes("myfab11")) return "Play now";
  return "Claim now";
}

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
            <p className="text-[11px] text-white/80">Exclusive Apna Cricket offers & deals</p>
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
            // IMPORTANT: We completely ignore p.image (old TG banner URLs) and
            // render ONLY new Apna Cricket-branded gradient banners. No old
            // images are ever shown to the user.
            const gradient = GRADIENTS[i % GRADIENTS.length];
            const glow = GLOWS[i % GLOWS.length];
            const Icon = pickIcon(p.title || p.label, p.type);
            const title = rebrand(p.title || p.label);
            const description = rebuildDescription(p.title || p.label);
            const cta = ctaLabel(p.title || p.label);
            const url = p.url || p.link || p.notificationUrl;
            const clickable = url && url !== "#" && url !== "/";

            return (
              <motion.div
                key={(p._id ?? i) as string}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                whileHover={clickable ? { scale: 1.02, y: -2 } : {}}
                className={`rounded-2xl bg-gradient-to-br ${gradient} p-4 text-white shadow-xl ${glow} relative overflow-hidden ${clickable ? "cursor-pointer" : ""}`}
                onClick={() => {
                  if (clickable) {
                    window.open(url, "_blank", "noopener,noreferrer");
                  }
                }}
              >
                {/* Decorative shapes */}
                <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/15 rounded-full blur-sm" />
                <div className="absolute -right-12 -bottom-12 w-32 h-32 bg-white/10 rounded-full" />
                <div className="absolute top-2 right-2 w-16 h-16 border-2 border-white/20 rounded-full" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-white/5 rounded-full blur-2xl" />

                <div className="relative flex items-start gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/25 backdrop-blur-md flex items-center justify-center flex-shrink-0 shadow-lg ring-1 ring-white/30">
                    <Icon className="w-6 h-6 text-white drop-shadow" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-white/80 font-semibold uppercase tracking-wider">
                      Apna Cricket Offer
                    </p>
                    <p className="text-base font-extrabold leading-tight mt-0.5 drop-shadow-sm">
                      {title}
                    </p>
                    <p className="text-xs text-white/85 mt-1 leading-relaxed line-clamp-2">
                      {description}
                    </p>
                    <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold bg-white/25 hover:bg-white/40 backdrop-blur-md px-3 py-1 rounded-full ring-1 ring-white/30">
                      {cta}
                      <ExternalLink className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
