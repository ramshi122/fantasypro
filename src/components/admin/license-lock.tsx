"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  CheckCircle2,
  Loader2,
  Lock,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useLicense } from "@/lib/use-license";

/**
 * License Lock Overlay
 * --------------------
 * When license is NOT verified:
 *  - Floating lock button visible (always)
 *  - "License Required" modal when user tries to use locked features
 *  - ALL team generation features are locked (buttons disabled)
 *
 * When license IS verified:
 *  - All features unlocked
 *  - No lock button
 *  - Auto-login enabled
 */
export function LicenseLockOverlay() {
  const {
    isLicensed,
    licenseKey,
    showActivate,
    setShowActivate,
    keyInput,
    setKeyInput,
    verifying,
    activate,
  } = useLicense();

  async function handleVerify() {
    if (!keyInput.trim()) {
      toast.error("Enter your license key");
      return;
    }
    const result = await activate(keyInput);
    if (result?.success) {
      toast.success(result.message);
    } else {
      toast.error(result?.message || "Verification failed");
    }
  }

  // If licensed, don't render anything
  if (isLicensed) return null;

  return (
    <>
      {/* Floating lock button — always visible when license not active */}
      <button
        onClick={() => setShowActivate(true)}
        className="fixed bottom-20 right-4 z-30 w-14 h-14 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-xl shadow-amber-500/50 flex items-center justify-center animate-pulse-glow"
        aria-label="Activate License"
      >
        <Lock className="w-6 h-6" />
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full ring-2 ring-white flex items-center justify-center">
          <span className="text-[8px] font-black text-white">!</span>
        </span>
      </button>

      {/* Full-screen lock overlay — blocks all interaction when modal is open */}
      <AnimatePresence>
        {showActivate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[95] bg-black/90 backdrop-blur-md flex items-center justify-center p-4"
            onClick={() => setShowActivate(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 text-white p-5 text-center relative overflow-hidden">
                <div className="absolute -top-8 -right-8 w-32 h-32 bg-white/10 rounded-full" />
                <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-white/5 rounded-full" />
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200 }}
                  className="w-16 h-16 mx-auto rounded-2xl bg-white/25 backdrop-blur-md flex items-center justify-center mb-2"
                >
                  <Lock className="w-8 h-8" />
                </motion.div>
                <h2 className="font-black text-xl">🔒 License Required</h2>
                <p className="text-[11px] text-white/80 mt-1">
                  Activate your CRICB license key to unlock all team generation features
                </p>
              </div>

              {/* Locked features list */}
              <div className="p-4 space-y-3">
                <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl p-3 space-y-1.5">
                  <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wide mb-1">
                    Locked Features:
                  </p>
                  {[
                    "Generate Team",
                    "Auto Team Generator",
                    "GL Generator",
                    "Auto Pick",
                    "Cheat Sheet",
                    "DT Analysis",
                    "Bulk Transfer",
                    "Free Contests",
                  ].map((f) => (
                    <div key={f} className="flex items-center gap-2 text-xs">
                      <Lock className="w-3 h-3 text-amber-500 flex-shrink-0" />
                      <span className="text-muted-foreground">{f}</span>
                      <span className="ml-auto text-[9px] font-bold bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 px-1.5 py-0.5 rounded-full">
                        LOCKED
                      </span>
                    </div>
                  ))}
                </div>

                <div>
                  <label className="text-[11px] font-bold text-foreground mb-1 block">
                    LICENSE KEY
                  </label>
                  <Input
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value.toUpperCase())}
                    placeholder="CRICB-XXXX-XXXX-XXXX"
                    className="h-12 font-mono text-sm tracking-wider"
                    onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                    autoFocus
                  />
                </div>

                <Button
                  onClick={handleVerify}
                  disabled={verifying || !keyInput.trim()}
                  className="w-full h-12 brand-gradient text-white font-bold text-base"
                >
                  {verifying ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-5 h-5 mr-2" />
                      Activate License
                    </>
                  )}
                </Button>

                <div className="text-[10px] text-muted-foreground text-center pt-2 border-t">
                  <p className="font-semibold mb-0.5">After verification:</p>
                  <div className="grid grid-cols-2 gap-1 text-emerald-600 dark:text-emerald-400">
                    <span className="flex items-center gap-0.5 justify-center"><Check className="w-2.5 h-2.5" /> License Active</span>
                    <span className="flex items-center gap-0.5 justify-center"><Check className="w-2.5 h-2.5" /> All Features Unlocked</span>
                    <span className="flex items-center gap-0.5 justify-center"><Check className="w-2.5 h-2.5" /> Device Bound</span>
                    <span className="flex items-center gap-0.5 justify-center"><Check className="w-2.5 h-2.5" /> Auto Login Enabled</span>
                  </div>
                </div>

                <div className="text-[9px] text-muted-foreground text-center bg-violet-50 dark:bg-violet-950/20 rounded-lg p-2">
                  Demo keys: <span className="font-mono font-bold">CRICB-DEMO-TEST-KEY1</span> · <span className="font-mono font-bold">CRICB-DEMO-TEST-KEY3</span>
                </div>

                <button
                  onClick={() => setShowActivate(false)}
                  className="w-full text-[11px] text-muted-foreground hover:text-foreground"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
