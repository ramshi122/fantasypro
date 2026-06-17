"use client";

import { Bell, Menu, X } from "lucide-react";
import { useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useApp } from "@/lib/store";
import { useHiddenTrigger } from "@/lib/use-hidden-trigger";

const MENU_ITEMS = [
  { label: "How to generate?", href: "#" },
  { label: "Best tips", href: "#" },
  { label: "Promotions", view: "promotions" as const },
  { label: "Expert Teams", view: "expert-teams" as const },
  { label: "Prime Teams", view: "prime-teams" as const },
  { label: "Privacy Policy", href: "#" },
  { label: "Terms & Conditions", href: "#" },
  { label: "Disclaimer", href: "#" },
  { label: "Contact us", href: "#" },
  { label: "About us", href: "#" },
] as const;

export function TopHeader({ onAdminTrigger }: { onAdminTrigger?: () => void }) {
  const [open, setOpen] = useState(false);
  const setView = useApp((s) => s.setView);
  const trigger = useHiddenTrigger(() => onAdminTrigger?.());

  function handleMenuClick(item: (typeof MENU_ITEMS)[number]) {
    setOpen(false);
    if ("view" in item && item.view) {
      setView(item.view);
    }
  }

  return (
    <header className="sticky top-0 z-40 bg-white/80 dark:bg-background/80 backdrop-blur-xl border-b border-violet-100 dark:border-violet-900/30">
      <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                className="p-2 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
                aria-label="Open menu"
              >
                <Menu className="w-5 h-5 text-violet-700 dark:text-violet-300" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] p-0">
              <SheetHeader className="p-4 brand-gradient">
                <SheetTitle className="text-white flex items-center gap-2">
                  <BrandLogo size={28} />
                  <span>FantasyPro</span>
                </SheetTitle>
              </SheetHeader>
              <nav className="p-2 overflow-y-auto h-[calc(100vh-72px)]">
                {MENU_ITEMS.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => handleMenuClick(item)}
                    className="w-full text-left px-4 py-3 rounded-lg text-sm font-medium hover:bg-violet-50 dark:hover:bg-violet-900/20 text-foreground/80 hover:text-violet-700 dark:hover:text-violet-300 transition-colors flex items-center justify-between group"
                  >
                    {item.label}
                    {"view" in item && item.view && (
                      <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full dark:bg-violet-900/40 dark:text-violet-300">
                        Live
                      </span>
                    )}
                  </button>
                ))}
                <div className="mt-4 p-4 rounded-xl bg-gradient-to-br from-violet-50 to-pink-50 dark:from-violet-950/40 dark:to-pink-950/40">
                  <p className="text-xs font-semibold text-violet-700 dark:text-violet-300 mb-1">
                    Join our community
                  </p>
                  <p className="text-[11px] text-muted-foreground mb-3">
                    Get instant match alerts and tips on Telegram & YouTube.
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 h-8 text-xs bg-sky-500 hover:bg-sky-600">
                      Telegram
                    </Button>
                    <Button size="sm" className="flex-1 h-8 text-xs bg-red-500 hover:bg-red-600">
                      YouTube
                    </Button>
                  </div>
                </div>
              </nav>
            </SheetContent>
          </Sheet>

          {/* Hidden admin trigger — 5 taps on logo within 3 seconds */}
          <div
            onClick={() => trigger.registerTap()}
            onTouchStart={trigger.startLongPress}
            onTouchEnd={trigger.cancelLongPress}
            onMouseDown={trigger.startLongPress}
            onMouseUp={trigger.cancelLongPress}
            onMouseLeave={trigger.cancelLongPress}
            className="select-none"
          >
            <BrandLogo size={32} withText textClassName="text-base" />
          </div>
        </div>

        <button
          className="relative p-2 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5 text-violet-700 dark:text-violet-300" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-pink-500 rounded-full ring-2 ring-white dark:ring-background animate-pulse-glow" />
        </button>
      </div>
    </header>
  );
}
