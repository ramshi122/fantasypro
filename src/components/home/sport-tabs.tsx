"use client";

import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Sport } from "@/lib/api";

const SPORTS: { id: Sport; label: string; emoji: string }[] = [
  { id: "cricket", label: "Cricket", emoji: "🏏" },
  { id: "football", label: "Football", emoji: "⚽" },
  { id: "basketball", label: "Basketball", emoji: "🏀" },
  { id: "kabaddi", label: "Kabaddi", emoji: "🤼" },
];

export function SportTabs() {
  const sport = useApp((s) => s.sport);
  const setSport = useApp((s) => s.setSport);

  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
      {SPORTS.map((s) => {
        const active = sport === s.id;
        return (
          <button
            key={s.id}
            onClick={() => setSport(s.id)}
            className={cn(
              "flex-shrink-0 px-4 h-9 rounded-full text-sm font-semibold transition-all flex items-center gap-1.5",
              active
                ? "brand-gradient text-black shadow-md shadow-amber-500/30"
                : "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 hover:bg-amber-100"
            )}
          >
            <span className="text-base">{s.emoji}</span>
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

export function MatchTabs() {
  const tab = useApp((s) => s.matchTab);
  const setTab = useApp((s) => s.setMatchTab);

  return (
    <div className="flex bg-amber-50 dark:bg-amber-950/20 rounded-xl p-1">
      {(["upcoming", "saved"] as const).map((t) => (
        <button
          key={t}
          onClick={() => setTab(t)}
          className={cn(
            "flex-1 h-9 rounded-lg text-sm font-semibold transition-all capitalize",
            tab === t
              ? "bg-white text-amber-700 shadow-sm dark:bg-amber-950 dark:text-amber-200"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t === "upcoming" ? "Upcoming Matches" : "Saved Matches"}
        </button>
      ))}
    </div>
  );
}
