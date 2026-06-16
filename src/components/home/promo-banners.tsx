"use client";

import { ExternalLink, Flame, Sparkles } from "lucide-react";

const BANNERS = [
  {
    title: "Join TG Group",
    subtitle: "Get instant alerts & tips",
    cta: "Join now",
    gradient: "from-violet-500 to-purple-600",
    icon: Sparkles,
  },
  {
    title: "Transfer to Dream11",
    subtitle: "One-tap team transfer",
    cta: "Transfer",
    gradient: "from-pink-500 to-rose-600",
    icon: ExternalLink,
  },
  {
    title: "D11 New Rules",
    subtitle: "Updated for 2026 season",
    cta: "Learn more",
    gradient: "from-sky-500 to-cyan-600",
    icon: Flame,
  },
  {
    title: "Subscribe on Telegram",
    subtitle: "Free prime teams daily",
    cta: "Subscribe",
    gradient: "from-blue-500 to-indigo-600",
    icon: Sparkles,
  },
];

export function PromoBanners() {
  return (
    <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
      {BANNERS.map((b, i) => {
        const Icon = b.icon;
        return (
          <div
            key={i}
            className={`flex-shrink-0 w-[280px] h-[90px] rounded-2xl bg-gradient-to-br ${b.gradient} p-3 flex items-center justify-between text-white shadow-lg relative overflow-hidden cursor-pointer hover:scale-[1.02] transition-transform`}
          >
            <div className="absolute -right-4 -top-4 w-20 h-20 bg-white/10 rounded-full" />
            <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-white/5 rounded-full" />
            <div className="relative z-10 flex-1">
              <p className="text-xs text-white/80 font-medium">{b.subtitle}</p>
              <p className="text-base font-bold leading-tight mt-0.5">{b.title}</p>
              <button className="mt-1.5 text-[11px] font-semibold bg-white/20 hover:bg-white/30 px-2.5 py-1 rounded-full backdrop-blur-sm">
                {b.cta} →
              </button>
            </div>
            <div className="relative z-10 w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <Icon className="w-6 h-6 text-white" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
