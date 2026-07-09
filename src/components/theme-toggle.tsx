"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export type Theme = "dark" | "light";
const KEY = "apna-cricket-theme";

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "dark";
  } catch {
    return "dark";
  }
}

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
    root.classList.remove("light");
  } else {
    root.classList.add("light");
    root.classList.remove("dark");
  }
  root.style.colorScheme = theme;
}

export function setTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, theme);
  applyTheme(theme);
}

export function getTheme(): Theme {
  return getStoredTheme();
}

/**
 * Theme toggle button — mounts in profile/settings.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setThemeState] = useState<Theme>(() => (typeof window !== "undefined" ? getStoredTheme() : "dark"));

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  }

  return (
    <button
      onClick={toggle}
      className={cn(
        "inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold border transition-all",
        theme === "dark"
          ? "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
          : "bg-amber-50 border-amber-200 text-amber-900 hover:bg-amber-100",
        className
      )}
      aria-label="Toggle theme"
    >
      {theme === "dark" ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
      {theme === "dark" ? "Dark" : "Light"}
    </button>
  );
}

/**
 * Apply theme on initial load (call from layout root once).
 */
export function useApplyTheme() {
  useEffect(() => {
    applyTheme(getStoredTheme());
  }, []);
}
