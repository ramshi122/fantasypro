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
import { CricketLivePage } from "@/components/pages/cricket-live-page";
import { OCRGenerator } from "@/components/pages/ocr-generator-screen";
import { ContestTracker } from "@/components/contest-tracker";
import { PlayerFormDashboard } from "@/components/player-form-dashboard";
import { WhatsAppShareButton } from "@/components/whatsapp-share-button";
import { ProfileScreen } from "@/components/pages/profile-screen";
import { PromotionsScreen } from "@/components/pages/promotions-screen";
import { TeamListScreen } from "@/components/pages/team-list-screen";
import { ContactScreen } from "@/components/pages/contact-screen";
import { MatchResearchPage } from "@/components/research/match-research-page";
import { LineupAlertManager } from "@/components/alerts/lineup-alert-manager";
import { SplashScreen } from "@/components/splash-screen";
import { AdminPanel } from "@/components/admin/admin-panel";
import { LicenseLockOverlay } from "@/components/admin/license-lock";
import { useLicense } from "@/lib/use-license";
import { Lock, CheckCircle2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
// Defense-in-depth: catches any in-tree client crash so we never show the raw
// "Application error: a client-side exception has occurred" page. Also
// covered by app/error.tsx + app/global-error.tsx at the route/root level.
import { ErrorBoundary } from "@/components/error-boundary";

const SPLASH_KEY = "apna-cricket-splash-shown";

export default function Home() {
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const isGuest = useAuth((s) => s.isGuest);
  const setGuest = useAuth((s) => s.setGuest);
  const view = useApp((s) => s.view);
  const setView = useApp((s) => s.setView);
  const [showSplash, setShowSplash] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const license = useLicense();

  // Initialize anti-tampering security on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Dynamic import to avoid SSR
    import("@/lib/security").then(({ initAntiTampering }) => {
      initAntiTampering();
    });
    // Start token auto-refresh interval (keeps fantasy tokens fresh — never expires)
    import("@/lib/token-persist").then(({ startTokenRefreshInterval }) => {
      const cleanup = startTokenRefreshInterval();
      // Cleanup on unmount
      return cleanup;
    });
    // Migrate old account records to new status format
    import("@/lib/multi-accounts").then(({ migrateAccountStatuses }) => {
      migrateAccountStatuses();
    });
  }, []);

  // === ENFORCE TIER LIMITS ON ACCOUNTS ===
  // Per user spec: "chek all subscription are propper loked  any loop fix"
  // When the license is verified (or changes), prune any excess accounts
  // that the user's tier doesn't allow. This catches:
  //   1. Accounts saved BEFORE the tier gate was added (legacy data)
  //   2. Accounts a trial user somehow added via a bypass path
  //   3. Accounts left over after a paid subscription DOWNGRADED to trial
  useEffect(() => {
    if (!license.isLicensed) return;
    if (!license.licenseKeyType) return;
    const tier: string = String(license.licenseKeyType);
    import("@/lib/multi-accounts").then(({ enforceTierAccountLimits }) => {
      const pruned = enforceTierAccountLimits(tier);
      if (pruned > 0) {
        console.warn(`[page] ⚠️ Pruned ${pruned} excess account(s) — tier ${tier} doesn't allow them`);
      }
    });
  }, [license.isLicensed, license.licenseKeyType]);

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

  // While the auto-guest effect is running, show the splash screen again
  // (NOT the old "AC" letter loading screen — use the real splash)
  if (!isAuthenticated) {
    return <SplashScreen onFinish={() => {}} duration={1000} />;
  }

  // Show login screen only when explicitly requested
  if (!isGuest && !isAuthenticated) {
    return <LoginScreen />;
  }

  // ===== FULL-PAGE LICENSE LOCK =====
  // Block ALL app access until user has a valid subscription.
  // No page (Home, Research, My Matches, Profile, etc.) is accessible without license.
  if (!license.isLicensed) {
    return <FullPageLicenseLock license={license} />;
  }

  return (
    <ErrorBoundary
      onError={(err) => {
        console.error("[page] ErrorBoundary caught:", err);
      }}
    >
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
              {view === "cricket-live" && <CricketLivePage onClose={() => setView("home")} />}
              {view === "ocr-generator" && <OCRGenerator />}
              {view === "contest-tracker" && <ContestTracker onClose={() => setView("profile")} />}
              {view === "player-form" && <PlayerFormDashboard onClose={() => setView("research")} />}
              {view === "whatsapp-share" && <WhatsAppShareButton onClose={() => setView("home")} />}
              {view === "profile" && <ProfileScreen onAdminTrigger={() => setShowAdmin(true)} />}
              {view === "promotions" && <PromotionsScreen />}
              {view === "expert-teams" && <TeamListScreen variant="expert" />}
              {view === "prime-teams" && <TeamListScreen variant="prime" />}
              {view === "contact" && <ContactScreen />}
              {view === "match-research" && (
                <MatchResearchPage onClose={() => setView("home")} />
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        <BottomNav />

        {/* Hidden Admin Panel — triggered by 5 taps on logo or version text */}
        <AdminPanel open={showAdmin} onClose={() => setShowAdmin(false)} />

        {/* License Lock Overlay — blocks team generator features until verified */}
        <LicenseLockOverlay />

        {/* Lineup Alert Manager — monitors matches for lineup announcements */}
        <LineupAlertManager />
      </div>
    </ErrorBoundary>
  );
}

// ============================================================
// FULL-PAGE LICENSE LOCK — blocks ALL app access without license
// ============================================================
function FullPageLicenseLock({ license }: { license: ReturnType<typeof useLicense> }) {
  const [keyInput, setKeyInput] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleVerify() {
    if (!keyInput.trim()) return;
    setVerifying(true);
    setErrorMsg(null);
    try {
      const result = await license.activate(keyInput.trim());
      setVerifying(false);
      if (result?.success) {
        // License activated — page will auto-unlock via re-render
      } else {
        // SHOW the exact error reason returned by verifyLicense
        const msg = result?.message || "Verification failed — please check your key and try again.";
        console.log("[FullPageLicenseLock] Activation failed:", msg);
        setErrorMsg(msg);
      }
    } catch (err: any) {
      setVerifying(false);
      console.error("[FullPageLicenseLock] Activation exception:", err);
      setErrorMsg(err?.message || "Network error — please check internet and try again.");
    }
  }

  const features = [
    "🏆 AI Team Generation (40 teams)",
    "🧪 AI Research Dashboard (18 modules)",
    "📡 Live Match Tracking",
    "👥 Verified Playing XI",
    "🎯 DT Probability Ranking",
    "📊 Real-time Career Stats",
    "🧠 AI Tactical Coach",
    "💎 Grand League Research",
  ];

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "linear-gradient(160deg, #FFFFFF, #F5F7FA)" }}>
      <div
        className="max-w-md w-full rounded-3xl p-8"
        style={{
          background: "#FFFFFF",
          border: "2px solid #2563EB",
          boxShadow: "0 8px 40px rgba(37,99,235,0.15)",
          borderRadius: "24px",
        }}
      >
        {/* Lock icon */}
        <div className="text-center mb-6">
          <div
            className="w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4"
            style={{ background: "#EFF6FF", border: "3px solid #2563EB" }}
          >
            <Lock className="w-10 h-10" style={{ color: "#2563EB" }} />
          </div>
          <h1 className="text-[24px] font-black" style={{ color: "#111111", fontFamily: "'Orbitron', sans-serif", letterSpacing: "0.05em" }}>
            SUBSCRIPTION REQUIRED
          </h1>
          <p className="text-[15px] mt-2" style={{ color: "#444444" }}>
            Activate your license key to unlock all features
          </p>
        </div>

        {/* Features list */}
        <div
          className="rounded-xl p-4 mb-6"
          style={{ background: "#F5F7FA", border: "1px solid #E5E7EB" }}
        >
          <p className="text-[14px] font-black uppercase mb-3" style={{ color: "#2563EB", fontFamily: "'Orbitron', sans-serif" }}>
            Unlock with subscription:
          </p>
          <div className="space-y-2">
            {features.map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-[15px]" style={{ color: "#111111" }}>
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: "#16A34A" }} />
                <span>{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Price hint */}
        <div
          className="rounded-xl p-4 text-center mb-6"
          style={{ background: "#FFFBEB", border: "1px solid #F59E0B" }}
        >
          <p className="text-[18px] font-black" style={{ color: "#F59E0B", fontFamily: "'Orbitron', sans-serif" }}>
            Starting from ₹49 only
          </p>
          <p className="text-[13px] mt-1" style={{ color: "#444444" }}>
            1 Match · 24 Hour · Weekly · Pro · Elite · Lifetime
          </p>
        </div>

        {/* License key input */}
        <div className="mb-4">
          <label className="text-[14px] font-black uppercase mb-2 block" style={{ color: "#2563EB", fontFamily: "'Orbitron', sans-serif" }}>
            License Key
          </label>
          <input
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value.toUpperCase())}
            placeholder="CRICB-XXXX-XXXX-XXXX"
            className="w-full h-12 px-4 rounded-xl text-[16px] font-mono"
            style={{
              background: "#F5F7FA",
              border: "2px solid #E5E7EB",
              color: "#111111",
              outline: "none",
            }}
            onKeyDown={(e) => { if (e.key === "Enter") handleVerify(); }}
            autoFocus
          />
        </div>

        {/* Error message — show the EXACT reason from verifyLicense */}
        {errorMsg && (
          <div
            className="rounded-xl p-3 mb-4 text-center"
            style={{ background: "#FEF2F2", border: "1px solid #DC2626" }}
          >
            <p className="text-[14px] font-bold" style={{ color: "#DC2626" }}>❌ Activation Failed</p>
            <p className="text-[13px] mt-1" style={{ color: "#444444" }}>{errorMsg}</p>
          </div>
        )}

        {/* Activate button */}
        <button
          onClick={handleVerify}
          disabled={verifying}
          className="w-full h-14 rounded-xl text-[18px] font-black transition-all active:scale-95"
          style={{
            background: "#2563EB",
            color: "#FFFFFF",
            border: "none",
            fontFamily: "'Orbitron', sans-serif",
            letterSpacing: "0.05em",
            boxShadow: "0 4px 12px rgba(37,99,235,0.3)",
          }}
        >
          {verifying ? "⏳ VERIFYING..." : "🔑 ACTIVATE NOW"}
        </button>

        {/* Help */}
        <div
          className="rounded-xl p-3 mt-4 text-center"
          style={{ background: "#EFF6FF", border: "1px solid #2563EB" }}
        >
          <p className="text-[14px] font-bold mb-1" style={{ color: "#2563EB" }}>💡 How to get a key?</p>
          <p className="text-[13px]" style={{ color: "#444444" }}>Contact admin via WhatsApp to purchase a subscription</p>
        </div>

        {/* Expiry info if licensed but expired */}
        {license.isExpired && (
          <div
            className="rounded-xl p-3 mt-4 text-center"
            style={{ background: "#FEF2F2", border: "1px solid #DC2626" }}
          >
            <p className="text-[14px] font-bold" style={{ color: "#DC2626" }}>⚠️ License Expired</p>
            <p className="text-[13px] mt-1" style={{ color: "#444444" }}>Your subscription has expired. Activate a new key to continue.</p>
          </div>
        )}
      </div>
    </div>
  );
}
