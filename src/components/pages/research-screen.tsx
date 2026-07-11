"use client";

import { Telescope } from "lucide-react";
import { ShopVideoAd } from "@/components/ads/shop-video-ad";
import { CricbuzzResearch } from "@/components/pages/cricbuzz-research";

export function ResearchScreen() {
  return (
    <div className="px-4 py-4 pb-24 space-y-4">
      {/* Header */}
      <div className="brand-gradient rounded-3xl p-5 text-white shadow-lg">
        <div className="flex items-center gap-2 mb-1">
          <Telescope className="w-4 h-4" />
          <h1 className="text-lg font-bold">Research</h1>
        </div>
        <p className="text-xs text-white/80">
          Live match research from Cricbuzz · Verified lineups · Player analysis
        </p>
      </div>

      {/* My Shop Video Ad Banner */}
      <ShopVideoAd />

      {/* Cricbuzz Live Research — Full scraper from cricket-ai-assistant */}
      <CricbuzzResearch />
    </div>
  );
}
