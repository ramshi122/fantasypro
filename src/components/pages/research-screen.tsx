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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ShopVideoAd } from "@/components/ads/shop-video-ad";
import { CricbuzzResearch } from "@/components/pages/cricbuzz-research";
import { useLicense } from "@/lib/use-license";

export function ResearchScreen() {
  const license = useLicense();

  return (
    <div className="px-4 py-4 pb-24 space-y-4">
      {/* Header */}
      <div className="brand-gradient rounded-3xl p-5 text-white shadow-lg">
        <div className="flex items-center gap-2 mb-1">
          <Telescope className="w-4 h-4" />
          <h1 className="text-lg font-bold">Research</h1>
          {license.isLicensed ? (
            <span className="ml-auto text-[9px] bg-emerald-400 text-emerald-950 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
              <Shield className="w-3 h-3" /> {license.licenseKeyType?.toUpperCase()}
            </span>
          ) : (
            <span className="ml-auto text-[9px] bg-red-400 text-red-950 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
              <Lock className="w-3 h-3" /> LOCKED
            </span>
          )}
        </div>
        <p className="text-xs text-white/80">
          Live match research from Cricbuzz · Verified lineups · Player analysis
        </p>
      </div>

      {/* My Shop Video Ad Banner — always visible (it's an ad) */}
      <ShopVideoAd />

      {/* Cricbuzz Research — LOCKED for non-subscribers */}
      {license.isLicensed ? (
        <CricbuzzResearch />
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
    "🔍 Live match scraping from Cricbuzz",
    "👥 Verified playing XI lineup",
    "🎯 DT Sadhyatha (probability ranking)",
    "🧠 Hack Sheet (insider intel)",
    "🏆 Team generation (1-100 teams)",
    "📤 Transfer to Dream11 & My11Circle",
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-card rounded-2xl p-6 border-2 border-amber-300 dark:border-amber-700 shadow-lg space-y-4"
    >
      {/* Lock icon */}
      <div className="text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center mb-3">
          <Lock className="w-8 h-8 text-amber-500" />
        </div>
        <h2 className="text-base font-bold text-foreground">Research Locked</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Active subscription required to access Cricbuzz Research
        </p>
      </div>

      {/* Features list */}
      <div className="bg-violet-50 dark:bg-violet-950/30 rounded-xl p-3 space-y-2">
        <p className="text-[10px] font-bold text-violet-600 dark:text-violet-400 uppercase mb-2">
          Unlock with subscription:
        </p>
        {features.map((f, i) => (
          <div key={i} className="flex items-center gap-2 text-[11px] text-foreground">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
            <span>{f}</span>
          </div>
        ))}
      </div>

      {/* Price hint */}
      <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl p-3 text-center">
        <p className="text-xs font-bold text-amber-600 dark:text-amber-400">
          Starting from ₹49 only
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          1 Match · 24 Hour · Weekly · Pro · Semi-Annual · Elite · Lifetime
        </p>
      </div>

      {/* Activate button */}
      <Button
        className="w-full h-12 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-700 hover:to-yellow-700 text-white font-bold"
        onClick={onActivate}
      >
        <Crown className="w-5 h-5 mr-1.5" />
        Activate License Key
      </Button>

      <p className="text-[9px] text-center text-muted-foreground">
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
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white dark:bg-card rounded-3xl shadow-2xl max-w-sm w-full p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center">
              <Crown className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">Activate License</h3>
              <p className="text-[10px] text-muted-foreground">Enter your subscription key</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {/* Input */}
        <div>
          <label className="text-[10px] font-bold text-muted-foreground uppercase mb-1 block">
            License Key
          </label>
          <Input
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value.toUpperCase())}
            placeholder="CRICB-XXXX-XXXX-XXXX"
            className="h-11 text-sm font-mono"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleVerify();
            }}
            autoFocus
          />
        </div>

        {/* Activate button */}
        <Button
          className="w-full h-11 bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-700 hover:to-yellow-700 text-white font-bold"
          onClick={handleVerify}
          disabled={verifying}
        >
          {verifying ? (
            <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> Verifying...</>
          ) : (
            <><Zap className="w-4 h-4 mr-1.5" /> Activate Now</>
          )}
        </Button>

        {/* Help */}
        <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl p-2.5 text-[10px] text-muted-foreground text-center">
          <p className="font-bold text-amber-600 dark:text-amber-400 mb-0.5">💡 How to get a key?</p>
          <p>Contact admin via WhatsApp to purchase a subscription</p>
        </div>
      </motion.div>
    </motion.div>
  );
}
