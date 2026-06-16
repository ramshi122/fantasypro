"use client";

import { useEffect, useState } from "react";
import { getPromotions, type PromotionItem } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { ExternalLink, Gift, Sparkles, Tag } from "lucide-react";
import { toast } from "sonner";

const GRADIENTS = [
  "from-violet-500 to-purple-600",
  "from-pink-500 to-rose-600",
  "from-sky-500 to-cyan-600",
  "from-emerald-500 to-green-600",
  "from-amber-500 to-orange-600",
  "from-indigo-500 to-blue-600",
];

export function PromotionsScreen() {
  const [items, setItems] = useState<PromotionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await getPromotions();
        if (active) setItems(data);
      } catch {
        if (active) {
          toast.error("Could not load promotions.");
          // fallback demo
          setItems([
            { _id: "p1", title: "Refer & Earn ₹100", description: "Invite friends and earn ₹100 instantly.", type: "referral" },
            { _id: "p2", title: "Prime Subscription Discount", description: "Get 30% off on annual Prime plan.", type: "discount" },
            { _id: "p3", title: "Free Prime Teams", description: "Free daily prime teams for new users.", type: "freebie" },
          ]);
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
      <div className="brand-gradient rounded-3xl p-5 text-white shadow-lg">
        <div className="flex items-center gap-2 mb-1">
          <Gift className="w-4 h-4" />
          <h1 className="text-lg font-bold">Promotions</h1>
        </div>
        <p className="text-xs text-white/80">
          Exclusive offers and deals for FantasyPro users.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-muted-foreground">No promotions available right now.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((p, i) => {
            const gradient = GRADIENTS[i % GRADIENTS.length];
            const Icon = p.type === "referral" ? Sparkles : p.type === "discount" ? Tag : Gift;
            const hasImage = !!p.image;
            return (
              <motion.div
                key={(p._id ?? i) as string}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className={`rounded-2xl ${hasImage ? "overflow-hidden" : `bg-gradient-to-br ${gradient} p-4 text-white`} shadow-lg relative cursor-pointer hover:scale-[1.02] transition-transform`}
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
                      alt={p.title || "Promotion"}
                      className="w-full h-32 object-cover"
                    />
                    {p.title && (
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent flex items-end p-3">
                        <div>
                          <p className="text-sm font-bold text-white leading-tight">{p.title}</p>
                          {p.description && (
                            <p className="text-xs text-white/85 mt-0.5 line-clamp-2">{p.description}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="relative flex items-start gap-3">
                    <div className="absolute -right-4 -top-4 w-20 h-20 bg-white/10 rounded-full" />
                    <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-white/5 rounded-full" />
                    <div className="relative w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="relative flex-1 min-w-0">
                      <p className="text-sm font-bold leading-tight">
                        {p.title}
                      </p>
                      {p.description && (
                        <p className="text-xs text-white/85 mt-1 leading-relaxed">
                          {p.description}
                        </p>
                      )}
                      <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold bg-white/20 hover:bg-white/30 backdrop-blur-sm px-2.5 py-1 rounded-full">
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
