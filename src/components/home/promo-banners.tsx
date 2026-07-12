"use client";

import { ExternalLink, Flame, Send, Sparkles, Trophy, Users } from "lucide-react";
import { motion } from "framer-motion";

const BANNERS = [
  {
    title: "Join Apna Cricket Group",
    subtitle: "Instant alerts & expert tips",
    cta: "Join now",
    gradient: "from-amber-600 via-orange-600 to-yellow-600",
    icon: Users,
    glow: "shadow-amber-500/40",
  },
  {
    title: "Transfer to Dream11",
    subtitle: "One-tap direct team transfer",
    cta: "Transfer",
    gradient: "from-pink-600 via-rose-600 to-red-600",
    icon: Send,
    glow: "shadow-pink-500/40",
  },
  {
    title: "Win Grand Leagues",
    subtitle: "AI-powered team combinations",
    cta: "Try now",
    gradient: "from-amber-500 via-orange-500 to-pink-600",
    icon: Trophy,
    glow: "shadow-amber-500/40",
  },
  {
    title: "Subscribe on Telegram",
    subtitle: "Free prime teams daily",
    cta: "Subscribe",
    gradient: "from-sky-500 via-blue-600 to-indigo-600",
    icon: Sparkles,
    glow: "shadow-sky-500/40",
  },
  {
    title: "Hot Picks Today",
    subtitle: "Trending players & captain picks",
    cta: "View picks",
    gradient: "from-emerald-500 via-teal-500 to-cyan-600",
    icon: Flame,
    glow: "shadow-emerald-500/40",
  },
];

export function PromoBanners() {
  return (
    <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 pb-2">
      {BANNERS.map((b, i) => {
        const Icon = b.icon;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.08, duration: 0.4 }}
            whileHover={{ scale: 1.03, y: -2 }}
            className={`flex-shrink-0 w-[280px] h-[110px] rounded-2xl bg-gradient-to-br ${b.gradient} p-3.5 flex items-center justify-between text-white shadow-xl ${b.glow} relative overflow-hidden cursor-pointer`}
          >
            {/* Decorative shapes */}
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/15 rounded-full blur-sm" />
            <div className="absolute -right-12 -bottom-12 w-32 h-32 bg-white/10 rounded-full" />
            <div className="absolute top-2 right-2 w-16 h-16 border-2 border-white/20 rounded-full" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-white/5 rounded-full blur-2xl" />

            <div className="relative z-10 flex-1 min-w-0">
              <p className="text-[10px] text-white/80 font-semibold uppercase tracking-wider">
                {b.subtitle}
              </p>
              <p className="text-base font-extrabold leading-tight mt-0.5 drop-shadow-sm">
                {b.title}
              </p>
              <button className="mt-2 text-[11px] font-bold bg-white/25 hover:bg-white/40 px-3 py-1 rounded-full backdrop-blur-md transition-colors flex items-center gap-1">
                {b.cta}
                <ExternalLink className="w-2.5 h-2.5" />
              </button>
            </div>
            <div className="relative z-10 w-14 h-14 rounded-2xl bg-white/25 backdrop-blur-md flex items-center justify-center shadow-lg ring-1 ring-white/30">
              <Icon className="w-7 h-7 text-white drop-shadow" />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
