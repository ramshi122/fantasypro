"use client";

import { useApp } from "@/lib/store";
import { MatchCard } from "@/components/home/match-card";
import { shouldShowMatchCard } from "@/lib/api";
import { Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MyMatchesScreen() {
  const savedMatches = useApp((s) => s.savedMatches);
  const setView = useApp((s) => s.setView);

  // Apply the same visibility rule as the home screen:
  //   Hide saved matches where NEITHER Dream11 NOR My11Circle is supported.
  const visibleSaved = savedMatches.filter(shouldShowMatchCard);

  return (
    <div className="px-4 py-4 pb-24 space-y-4">
      <div className="brand-gradient rounded-3xl p-5 text-white shadow-lg">
        <div className="flex items-center gap-2 mb-1">
          <Bookmark className="w-4 h-4" fill="currentColor" />
          <h1 className="text-lg font-bold">My Matches</h1>
        </div>
        <p className="text-xs text-white/80">
          Your bookmarked matches appear here for quick access.
        </p>
        <div className="mt-3 text-3xl font-black">
          {visibleSaved.length}
          <span className="text-sm font-medium text-white/80 ml-1.5">saved</span>
        </div>
      </div>

      {visibleSaved.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto rounded-full bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center mb-3">
            <Bookmark className="w-8 h-8 text-violet-400" />
          </div>
          <p className="text-sm font-semibold mb-1">No saved matches yet</p>
          <p className="text-xs text-muted-foreground mb-4 px-6">
            Bookmark matches from the home screen to access them quickly here.
          </p>
          <Button onClick={() => setView("home")} className="brand-gradient text-white">
            Browse Matches
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleSaved.map((m, i) => (
            <MatchCard key={(m.matchId ?? m.id ?? i) as string} match={m} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
