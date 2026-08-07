"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Telescope,
  Lock,
  Crown,
  CheckCircle2,
  Loader2,
  X,
  Zap,
  Shield,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ShopVideoAd } from "@/components/ads/shop-video-ad";
import { TitanResearch } from "@/components/pages/titan-research";
import { useLicense } from "@/lib/use-license";

export function ResearchScreen() {
  const license = useLicense();

  return (
    <div className="pb-24 space-y-4" style={{ background: "var(--bg)", minHeight: "100vh" }}>
      {/* Header — V77 theme (dark navy + gold + cyan) */}
      <div
        className="rounded-2xl p-5 shadow-lg"
        style={{
          background: "linear-gradient(160deg, #111520, #06090e)",
          border: "1px solid var(--b1)",
          borderBottom: "3px solid var(--gold)",
          boxShadow: "var(--sh-depth)",
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <Telescope className="w-4 h-4" style={{ color: "var(--cyan)" }} />
          <h1 className="text-lg font-bold" style={{ color: "var(--gold)", fontFamily: "'Orbitron', sans-serif", letterSpacing: "0.1em" }}>
            RESEARCH
          </h1>
          {license.isLicensed ? (
            <span
              className="ml-auto text-[9px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1"
              style={{
                background: "rgba(56,224,123,0.15)",
                color: "var(--green)",
                border: "1px solid var(--green)",
                fontFamily: "'Orbitron', sans-serif",
              }}
            >
              <Shield className="w-3 h-3" /> {license.licenseKeyType?.toUpperCase() || "ACTIVE"}
            </span>
          ) : (
            <span
              className="ml-auto text-[9px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1"
              style={{
                background: "rgba(255,61,139,0.15)",
                color: "var(--pink)",
                border: "1px solid var(--pink)",
                fontFamily: "'Orbitron', sans-serif",
              }}
            >
              <Lock className="w-3 h-3" /> LOCKED
            </span>
          )}
        </div>
        <p className="text-xs" style={{ color: "var(--text-off)", fontFamily: "'Share Tech Mono', monospace" }}>
          Live match research · Verified lineups · Player analysis
        </p>
        {/* License expiry info if licensed */}
        {license.isLicensed && license.expiresAt && (
          <div
            className="mt-2 px-2.5 py-1 rounded-md text-[10px]"
            style={{
              background: "rgba(78,226,236,0.06)",
              border: "1px solid rgba(78,226,236,0.3)",
              color: "var(--cyan)",
              fontFamily: "'Share Tech Mono', monospace",
            }}
          >
            ✓ Verified · Expires: {new Date(license.expiresAt).toLocaleDateString()}
          </div>
        )}
      </div>

      {/* My Shop Video Ad Banner — always visible (it's an ad) */}
      <ShopVideoAd />

      {/* === STANDALONE MATCH RESEARCH BUTTON (per user spec) === */}
      {/* Completely independent module — separate API, separate data */}
      <button
        onClick={() => useApp.getState().setView("match-research")}
        className="w-full rounded-2xl p-4 flex items-center gap-3 transition-all hover:scale-[1.01]"
        style={{
          background: "linear-gradient(135deg, #7C3AED, #EC4899)",
          boxShadow: "0 4px 15px rgba(124, 58, 237, 0.3)",
        }}
      >
        <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
          <Telescope className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 text-left">
          <p className="text-sm font-bold text-white">Match Research Center</p>
          <p className="text-[10px] text-white/80">Pitch · Weather · H2H · Playing XI · C/VC Picks</p>
        </div>
        <ChevronRight className="w-5 h-5 text-white/80" />
      </button>

      {/* Research — LOCKED for non-subscribers */}
      {license.isLicensed ? (
        <TitanResearch />
      ) : (
        <ResearchLockScreen
          onActivate={() => license.setShowActivate(true)}
        />
      )}

      {/* License Activate Modal */}
      <AnimatePresence>
        {license.showActivate && (
          <LicenseActivateModal
            keyInput={license.keyInput}
            setKeyInput={license.setKeyInput}
            verifying={license.verifying}
            onActivate={license.activate}
            onClose={() => license.setShowActivate(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ============== Lock Screen (shown when not subscribed) ============== */

function ResearchLockScreen({ onActivate }: { onActivate: () => void }) {
  const features = [
    "🔍 Live match scraping (Cricbuzz real-time)",
    "👥 Verified playing XI lineup (Before + After)",
    "🎯 DT probability ranking (2026 AI)",
    "🧠 AI tactical analysis & insights",
    "🏆 40 team generation (Safe + GL)",
    "📊 Real-time career stats from Cricbuzz",
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-6 space-y-4"
      style={{
        background: "var(--panel)",
        border: "2px solid var(--gold)",
        boxShadow: "var(--sh-depth)",
      }}
    >
      {/* Lock icon */}
      <div className="text-center">
        <div
          className="w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-3"
          style={{
            background: "rgba(255,210,63,0.08)",
            border: "2px solid var(--gold)",
          }}
        >
          <Lock className="w-8 h-8" style={{ color: "var(--gold)" }} />
        </div>
        <h2 className="text-base font-bold" style={{ color: "var(--gold)", fontFamily: "'Orbitron', sans-serif", letterSpacing: "0.1em" }}>
          RESEARCH LOCKED
        </h2>
        <p className="text-xs mt-1" style={{ color: "var(--text-off)", fontFamily: "'Share Tech Mono', monospace" }}>
          Active subscription required to access Research
        </p>
      </div>

      {/* Features list */}
      <div
        className="rounded-xl p-3 space-y-2"
        style={{
          background: "rgba(78,226,236,0.04)",
          border: "1px solid rgba(78,226,236,0.2)",
        }}
      >
        <p
          className="text-[10px] font-bold uppercase mb-2"
          style={{ color: "var(--cyan)", fontFamily: "'Orbitron', sans-serif" }}
        >
          Unlock with subscription:
        </p>
        {features.map((f, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px]" style={{ color: "var(--text-off)" }}>
            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--green)" }} />
            <span>{f}</span>
          </div>
        ))}
      </div>

      {/* Price hint */}
      <div
        className="rounded-xl p-3 text-center"
        style={{
          background: "rgba(255,210,63,0.06)",
          border: "1px solid rgba(255,210,63,0.3)",
        }}
      >
        <p className="text-xs font-bold" style={{ color: "var(--gold)", fontFamily: "'Orbitron', sans-serif" }}>
          Starting from ₹49 only
        </p>
        <p className="text-[10px] mt-0.5" style={{ color: "var(--text-off)", fontFamily: "'Share Tech Mono', monospace" }}>
          1 Match · 24 Hour · Weekly · Pro · Semi-Annual · Elite · Lifetime
        </p>
      </div>

      {/* Activate button */}
      <Button
        className="w-full h-12 font-bold"
        style={{
          background: "linear-gradient(135deg, var(--gold), #ff9800)",
          color: "#000",
          border: "none",
          fontFamily: "'Orbitron', sans-serif",
          letterSpacing: "0.1em",
        }}
        onClick={onActivate}
      >
        <Crown className="w-5 h-5 mr-1.5" />
        ACTIVATE LICENSE KEY
      </Button>

      <p className="text-[9px] text-center" style={{ color: "var(--text-off)", fontFamily: "'Share Tech Mono', monospace" }}>
        💡 Don&apos;t have a key? Contact admin to purchase a subscription
      </p>
    </motion.div>
  );
}

/* ============== License Activate Modal ============== */

function LicenseActivateModal({
  keyInput,
  setKeyInput,
  verifying,
  onActivate,
  onClose,
}: {
  keyInput: string;
  setKeyInput: (v: string) => void;
  verifying: boolean;
  onActivate: (key: string) => Promise<any>;
  onClose: () => void;
}) {
  async function handleVerify() {
    if (!keyInput.trim()) {
      toast.error("Please enter your license key");
      return;
    }
    const result = await onActivate(keyInput);
    if (result?.success) {
      toast.success(result.message || "✅ License Key Verified Successfully");
      onClose();
    } else {
      toast.error(result?.message || "Verification failed");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="rounded-3xl shadow-2xl max-w-sm w-full p-5 space-y-4"
        style={{
          background: "var(--panel)",
          border: "2px solid var(--gold)",
          boxShadow: "var(--sh-depth)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, var(--gold), #ff9800)" }}
            >
              <Crown className="w-5 h-5 text-black" />
            </div>
            <div>
              <h3 className="text-sm font-bold" style={{ color: "var(--gold)", fontFamily: "'Orbitron', sans-serif" }}>
                ACTIVATE LICENSE
              </h3>
              <p className="text-[10px]" style={{ color: "var(--text-off)", fontFamily: "'Share Tech Mono', monospace" }}>
                Enter your subscription key
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full"
            style={{ background: "rgba(255,255,255,0.05)" }}
          >
            <X className="w-4 h-4" style={{ color: "var(--text-off)" }} />
          </button>
        </div>

        {/* Input */}
        <div>
          <label
            className="text-[10px] font-bold uppercase mb-1 block"
            style={{ color: "var(--cyan)", fontFamily: "'Orbitron', sans-serif" }}
          >
            License Key
          </label>
          <Input
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value.toUpperCase())}
            placeholder="CRICB-XXXX-XXXX-XXXX"
            className="h-11 text-sm font-mono"
            style={{
              background: "rgba(0,0,0,0.5)",
              border: "1px solid var(--b2)",
              color: "var(--gold)",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleVerify();
            }}
            autoFocus
          />
        </div>

        {/* Activate button */}
        <Button
          className="w-full h-11 font-bold"
          style={{
            background: "linear-gradient(135deg, var(--gold), #ff9800)",
            color: "#000",
            border: "none",
            fontFamily: "'Orbitron', sans-serif",
            letterSpacing: "0.1em",
          }}
          onClick={handleVerify}
          disabled={verifying}
        >
          {verifying ? (
            <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> VERIFYING...</>
          ) : (
            <><Zap className="w-4 h-4 mr-1.5" /> ACTIVATE NOW</>
          )}
        </Button>

        {/* Help */}
        <div
          className="rounded-xl p-2.5 text-[10px] text-center"
          style={{
            background: "rgba(78,226,236,0.04)",
            border: "1px solid rgba(78,226,236,0.2)",
            color: "var(--text-off)",
            fontFamily: "'Share Tech Mono', monospace",
          }}
        >
          <p className="font-bold mb-0.5" style={{ color: "var(--cyan)" }}>💡 How to get a key?</p>
          <p>Contact admin via WhatsApp to purchase a subscription</p>
        </div>
      </motion.div>
    </motion.div>
  );
}
