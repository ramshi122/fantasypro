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
                ? "brand-gradient text-white shadow-md shadow-violet-500/30"
                : "bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 hover:bg-violet-100"
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
    <div className="flex bg-violet-50 dark:bg-violet-900/20 rounded-xl p-1">
      {(["upcoming", "saved"] as const).map((t) => (
        <button
          key={t}
          onClick={() => setTab(t)}
          className={cn(
            "flex-1 h-9 rounded-lg text-sm font-semibold transition-all capitalize",
            tab === t
              ? "bg-white text-violet-700 shadow-sm dark:bg-violet-950 dark:text-violet-200"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t === "upcoming" ? "Upcoming Matches" : "Saved Matches"}
        </button>
      ))}
    </div>
  );
}
