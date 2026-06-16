"use client";

import { useEffect } from "react";
import { useAuth, useApp } from "@/lib/store";
import { LoginScreen } from "@/components/auth/login-screen";
import { TopHeader } from "@/components/nav/top-header";
import { BottomNav } from "@/components/nav/bottom-nav";
import { HomeScreen } from "@/components/home/home-screen";
import { MatchDetailScreen } from "@/components/match/match-detail-screen";
import { MyMatchesScreen } from "@/components/pages/my-matches-screen";
import { ResearchScreen } from "@/components/pages/research-screen";
import { ProfileScreen } from "@/components/pages/profile-screen";
import { PromotionsScreen } from "@/components/pages/promotions-screen";
import { TeamListScreen } from "@/components/pages/team-list-screen";
import { AnimatePresence, motion } from "framer-motion";

export default function Home() {
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const isGuest = useAuth((s) => s.isGuest);
  const setGuest = useAuth((s) => s.setGuest);
  const view = useApp((s) => s.view);

  // AUTO-BYPASS: On first load, instantly log in as guest so the user lands
  // straight on the home screen with all features unlocked. No login screen
  // ever appears unless the user explicitly chooses "Sign In" with a real token.
  useEffect(() => {
    if (!isAuthenticated) {
      setGuest();
    }
  }, [isAuthenticated, setGuest]);

  // While the auto-guest effect is running, show a splash
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen brand-gradient flex items-center justify-center">
        <div className="text-center text-white">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center mb-3">
            <span className="text-3xl font-black">F</span>
          </div>
          <p className="text-sm font-semibold">Loading FantasyPro...</p>
        </div>
      </div>
    );
  }

  // Show login screen only when explicitly requested (e.g. user clicked "Use Real Token")
  // We never reach here in normal flow because isGuest=true means isAuthenticated=true.
  if (!isGuest && !isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopHeader />

      <main className="flex-1 max-w-3xl mx-auto w-full">
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {view === "home" && <HomeScreen />}
            {view === "match-detail" && <MatchDetailScreen />}
            {view === "my-matches" && <MyMatchesScreen />}
            {view === "research" && <ResearchScreen />}
            {view === "profile" && <ProfileScreen />}
            {view === "promotions" && <PromotionsScreen />}
            {view === "expert-teams" && <TeamListScreen variant="expert" />}
            {view === "prime-teams" && <TeamListScreen variant="prime" />}
          </motion.div>
        </AnimatePresence>
      </main>

      <BottomNav />
    </div>
  );
}
