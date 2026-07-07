"use client";

import { useEffect, useState } from "react";
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
import { SplashScreen } from "@/components/splash-screen";
import { AdminPanel } from "@/components/admin/admin-panel";
import { LicenseLockOverlay } from "@/components/admin/license-lock";
import { AnimatePresence, motion } from "framer-motion";

const SPLASH_KEY = "apna-cricket-splash-shown";

export default function Home() {
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const isGuest = useAuth((s) => s.isGuest);
  const setGuest = useAuth((s) => s.setGuest);
  const view = useApp((s) => s.view);
  const [showSplash, setShowSplash] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  // Show splash on first load of each session (not on every navigation)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const shownThisSession = sessionStorage.getItem(SPLASH_KEY);
    if (!shownThisSession) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowSplash(true);
      sessionStorage.setItem(SPLASH_KEY, "1");
    }
  }, []);

  // AUTO-BYPASS: On first load, instantly log in as guest so the user lands
  // straight on the home screen with all features unlocked.
  useEffect(() => {
    if (!isAuthenticated) {
      setGuest();
    }
  }, [isAuthenticated, setGuest]);

  // Splash screen takes priority — it has its own animated exit
  if (showSplash) {
    return <SplashScreen onFinish={() => setShowSplash(false)} duration={3500} />;
  }

  // While the auto-guest effect is running, show a tiny splash
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen brand-gradient flex items-center justify-center">
        <div className="text-center text-white">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center mb-3">
            <span className="text-2xl font-black">AC</span>
          </div>
          <p className="text-sm font-semibold">Loading Apna Cricket...</p>
        </div>
      </div>
    );
  }

  // Show login screen only when explicitly requested
  if (!isGuest && !isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TopHeader onAdminTrigger={() => setShowAdmin(true)} />

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
            {view === "profile" && <ProfileScreen onAdminTrigger={() => setShowAdmin(true)} />}
            {view === "promotions" && <PromotionsScreen />}
            {view === "expert-teams" && <TeamListScreen variant="expert" />}
            {view === "prime-teams" && <TeamListScreen variant="prime" />}
          </motion.div>
        </AnimatePresence>
      </main>

      <BottomNav />

      {/* Hidden Admin Panel — triggered by 5 taps on logo or version text */}
      <AdminPanel open={showAdmin} onClose={() => setShowAdmin(false)} />

      {/* License Lock Overlay — blocks team generator features until verified */}
      <LicenseLockOverlay />
    </div>
  );
}
