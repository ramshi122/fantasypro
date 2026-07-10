"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { MatchInfo, Sport } from "./api";

/* ---------- Auth Store ---------- */

interface AuthState {
  token: string | null;
  user: {
    name?: string;
    email?: string;
    mobile?: string;
    userId?: string;
    plan?: string;
  } | null;
  isAuthenticated: boolean;
  isGuest: boolean;
  setAuth: (token: string, user: AuthState["user"]) => void;
  setGuest: () => void;
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      // Auto-login as guest on first load — bypasses Apna Cricket login
      // entirely so all features work without any external tokens.
      isGuest: true,
      setAuth: (token, user) =>
        set({ token, user, isAuthenticated: true, isGuest: false }),
      setGuest: () =>
        set({
          token: "guest_" + Date.now(),
          user: { name: "Guest User", plan: "Browse + Local Teams" },
          isAuthenticated: true,
          isGuest: true,
        }),
      logout: () =>
        set({
          token: "guest_" + Date.now(),
          user: { name: "Guest User", plan: "Browse + Local Teams" },
          isAuthenticated: true,
          isGuest: true,
        }),
    }),
    {
      name: "apna-cricket-auth",
      storage: createJSONStorage(() => localStorage),
    }
  )
);

/* ---------- App View Store ---------- */

export type AppView =
  | "home"
  | "my-matches"
  | "research"
  | "profile"
  | "promotions"
  | "match-detail"
  | "expert-teams"
  | "prime-teams"
  | "contact"
  | "cricket-live"
  | "contest-tracker"
  | "player-form"
  | "whatsapp-share";

interface AppState {
  view: AppView;
  sport: Sport;
  matchTab: "upcoming" | "saved";
  activeMatch: MatchInfo | null;
  setView: (v: AppView) => void;
  setSport: (s: Sport) => void;
  setMatchTab: (t: "upcoming" | "saved") => void;
  openMatch: (m: MatchInfo) => void;
  closeMatch: () => void;
  savedMatches: MatchInfo[];
  toggleSaveMatch: (m: MatchInfo) => void;
  isSaved: (id?: string | number) => boolean;
}

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      view: "home",
      sport: "cricket",
      matchTab: "upcoming",
      activeMatch: null,
      savedMatches: [],
      setView: (v) => set({ view: v }),
      setSport: (s) => set({ sport: s }),
      setMatchTab: (t) => set({ matchTab: t }),
      openMatch: (m) => set({ activeMatch: m, view: "match-detail" }),
      closeMatch: () =>
        set({ activeMatch: null, view: get().activeMatch ? "home" : get().view }),
      toggleSaveMatch: (m) => {
        const id = (m.matchId ?? m.id ?? "") as string | number;
        const saved = get().savedMatches;
        const exists = saved.some(
          (s) => (s.matchId ?? s.id) === id
        );
        if (exists) {
          set({
            savedMatches: saved.filter((s) => (s.matchId ?? s.id) !== id),
          });
        } else {
          set({ savedMatches: [...saved, { ...m, isSaved: true }] });
        }
      },
      isSaved: (id) => {
        if (!id) return false;
        return get().savedMatches.some((s) => (s.matchId ?? s.id) === id);
      },
    }),
    {
      name: "apna-cricket-app",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        savedMatches: s.savedMatches,
        sport: s.sport,
      }),
    }
  )
);
