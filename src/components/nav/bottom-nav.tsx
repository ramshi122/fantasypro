"use client";

import { Home, Bookmark, Telescope, User } from "lucide-react";
import { useApp, type AppView } from "@/lib/store";
import { cn } from "@/lib/utils";

const ITEMS: { view: AppView; label: string; icon: typeof Home }[] = [
  { view: "home", label: "Home", icon: Home },
  { view: "my-matches", label: "My matches", icon: Bookmark },
  { view: "research", label: "Research", icon: Telescope },
  { view: "profile", label: "User", icon: User },
];

export function BottomNav() {
  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 premium-nav safe-area-bottom">
      <div className="max-w-3xl mx-auto px-2 py-1.5 flex items-center justify-around">
        {ITEMS.map((item) => {
          const active = view === item.view ||
            (item.view === "home" && view === "match-detail");
          const Icon = item.icon;
          return (
            <button
              key={item.view}
              onClick={() => setView(item.view)}
              className={cn(
                "relative flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all min-w-[64px]",
                active && "premium-nav-active"
              )}
            >
              <Icon
                className={cn(
                  "w-5 h-5 transition-all",
                  active
                    ? "text-amber-400 scale-110"
                    : "text-muted-foreground"
                )}
                strokeWidth={active ? 2.5 : 2}
              />
              <span
                className={cn(
                  "text-[10px] font-medium transition-colors",
                  active
                    ? "text-amber-400 font-semibold"
                    : "text-muted-foreground"
                )}
              >
                {item.label}
              </span>
              {active && (
                <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full brand-gradient premium-pulse-dot" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
