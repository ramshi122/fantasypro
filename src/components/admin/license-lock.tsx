"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Check,
  CheckCircle2,
  Loader2,
  Lock,
  ShieldCheck,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  getDeviceId,
  getLicenseState,
  setLicenseVerified,
  clearLicense,
  useAdmin,
} from "@/lib/admin-store";

/**
 * License Lock Overlay
 * --------------------
 * Blocks team generator features until a valid CRICB license key is verified.
 *
 * When license is NOT verified:
 *  - Shows lock overlay over team generator buttons
 *  - "License Required" popup with key input
 *  - After verification: stores in localStorage, auto-verifies on next launch
 *
 * When license IS verified:
 *  - All features unlocked
 *  - Auto-login enabled
 *  - Device bound
 */
export function LicenseLockOverlay() {
  const [licenseState, setLicenseState] = useState(getLicenseState());
  const [showActivate, setShowActivate] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [verifying, setVerifying] = useState(false);
  const admin = useAdmin();

  // Auto-verify on app launch if license exists
  useEffect(() => {
    if (licenseState.verified && licenseState.key) {
      const result = admin.verifyLicense(licenseState.key, licenseState.deviceId);
      if (!result.valid) {
        // License became invalid — clear it
        clearLicense();
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLicenseState({ verified: false, key: null, deviceId: getDeviceId() });
      }
    }
  }, []);

  function handleVerify() {
    if (!keyInput.trim()) {
      toast.error("Enter your license key");
      return;
    }
    setVerifying(true);
    setTimeout(() => {
      const deviceId = getDeviceId();
      const result = admin.verifyLicense(keyInput.trim().toUpperCase(), deviceId);
      setVerifying(false);
      if (result.valid) {
        setLicenseVerified(keyInput.trim().toUpperCase());
        setLicenseState({ verified: true, key: keyInput.trim().toUpperCase(), deviceId });
        setShowActivate(false);
        setKeyInput("");
        toast.success("License activated! All features unlocked.");
      } else {
        toast.error(result.message);
      }
    }, 800);
  }

  // If license is verified, don't render the overlay
  if (licenseState.verified) return null;

  return (
    <>
      {/* Floating lock button — always visible when license not active */}
      <button
        onClick={() => setShowActivate(true)}
        className="fixed bottom-20 right-4 z-30 w-12 h-12 rounded-full bg-amber-500 hover:bg-amber-600 text-white shadow-xl shadow-amber-500/40 flex items-center justify-center"
        aria-label="Activate License"
      >
        <Lock className="w-5 h-5" />
        <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full ring-2 ring-white animate-pulse" />
      </button>

      {/* Activate License Modal */}
      <AnimatePresence>
        {showActivate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
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
                  className="w-14 h-14 mx-auto rounded-2xl bg-white/25 backdrop-blur-md flex items-center justify-center mb-2"
                >
                  <Lock className="w-7 h-7" />
                </motion.div>
                <h2 className="font-black text-lg">License Required</h2>
                <p className="text-[11px] text-white/80 mt-0.5">
                  Activate your CRICB license key to unlock all team generation features
                </p>
              </div>

              {/* Locked features list */}
              <div className="p-4 space-y-3">
                <div className="space-y-1.5">
                  {[
                    "Generate Team",
                    "Auto Pick",
                    "GL Generate",
                    "Cheat Sheet",
                    "DT Analysis",
                  ].map((f) => (
                    <div key={f} className="flex items-center gap-2 text-xs">
                      <Lock className="w-3 h-3 text-amber-500" />
                      <span className="text-muted-foreground">{f}</span>
                      <span className="ml-auto text-[9px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 px-1.5 py-0.5 rounded-full">
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
                    className="h-11 font-mono text-sm tracking-wider"
                    onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                  />
                </div>

                <Button
                  onClick={handleVerify}
                  disabled={verifying || !keyInput.trim()}
                  className="w-full h-11 brand-gradient text-white font-bold"
                >
                  {verifying ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4 mr-2" />
                      Activate License
                    </>
                  )}
                </Button>

                <div className="text-[10px] text-muted-foreground text-center pt-2 border-t">
                  <p className="font-semibold mb-0.5">After verification:</p>
                  <div className="flex items-center justify-center gap-3 text-emerald-600 dark:text-emerald-400">
                    <span className="flex items-center gap-0.5"><Check className="w-2.5 h-2.5" /> License Active</span>
                    <span className="flex items-center gap-0.5"><Check className="w-2.5 h-2.5" /> Features Unlocked</span>
                    <span className="flex items-center gap-0.5"><Check className="w-2.5 h-2.5" /> Device Bound</span>
                  </div>
                </div>

                <p className="text-[9px] text-muted-foreground text-center">
                  Demo keys: CRICB-DEMO-TEST-KEY1, CRICB-DEMO-TEST-KEY3
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
