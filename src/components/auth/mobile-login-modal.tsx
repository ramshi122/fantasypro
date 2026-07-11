"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, Lock, Loader2, X, CheckCircle2, ChevronRight, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  sendUserOTP,
  verifyUserOTP,
  getCurrentUser,
  logoutUser,
  type UserRecord,
} from "@/lib/user-auth";
import { cn } from "@/lib/utils";

interface MobileLoginModalProps {
  open: boolean;
  onClose: () => void;
  onLogin: (user: UserRecord) => void;
}

type Phase = "enter-mobile" | "enter-otp" | "success";

export function MobileLoginModal({ open, onClose, onLogin }: MobileLoginModalProps) {
  const [phase, setPhase] = useState<Phase>("enter-mobile");
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [user, setUser] = useState<UserRecord | null>(null);

  // Check for pending referral code on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const pending = localStorage.getItem("apna-cricket-pending-referral");
      if (pending) {
        setReferralCode(pending);
      }
    }
  }, [open]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setPhase("enter-mobile");
      setMobile("");
      setOtp("");
      setLoading(false);
    }
  }, [open]);

  if (!open) return null;

  async function handleSendOTP() {
    if (!mobile || !/^\d{10}$/.test(mobile)) {
      toast.error("Enter valid 10-digit mobile number");
      return;
    }
    setLoading(true);
    try {
      const res = await sendUserOTP(mobile);
      if (res.success) {
        toast.success(res.message);
        setPhase("enter-otp");
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to send OTP");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOTP() {
    if (!otp || otp.length < 4) {
      toast.error("Enter valid OTP (4 digits)");
      return;
    }
    setLoading(true);
    try {
      const res = await verifyUserOTP(mobile, otp);
      if (res.success && res.user) {
        setUser(res.user);
        setPhase("success");
        toast.success(res.message);
        // Clear pending referral
        if (typeof window !== "undefined") {
          localStorage.removeItem("apna-cricket-pending-referral");
        }
        // Notify parent after short delay (so user sees success screen)
        setTimeout(() => {
          onLogin(res.user!);
          onClose();
        }, 1500);
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err?.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-card w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden border border-violet-500/30"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="brand-gradient p-5 text-white relative">
            <button
              onClick={onClose}
              className="absolute top-3 right-3 p-1 rounded-full hover:bg-white/20"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 mb-1">
              <Phone className="w-5 h-5" />
              <h3 className="font-bold text-base">Login with Mobile</h3>
            </div>
            <p className="text-[11px] text-white/80">
              Login to unlock referral program + sync across devices
            </p>
          </div>

          <div className="p-5 space-y-4">
            {referralCode && phase === "enter-mobile" && (
              <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-3 flex items-center gap-2">
                <Gift className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <div>
                  <p className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                    Referral code detected: {referralCode}
                  </p>
                  <p className="text-[9px] text-emerald-600 dark:text-emerald-400">
                    You'll get 1 day bonus on login!
                  </p>
                </div>
              </div>
            )}

            {phase === "enter-mobile" && (
              <>
                <div>
                  <label className="text-xs font-bold text-foreground mb-1.5 block">
                    Mobile Number
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-muted-foreground">+91</span>
                    <Input
                      type="tel"
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
                      placeholder="9876543210"
                      className="bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800 h-11 text-sm font-bold tracking-wider"
                      onKeyDown={(e) => e.key === "Enter" && handleSendOTP()}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    We'll send an OTP to verify your number
                  </p>
                </div>
                <Button
                  className="w-full h-11 brand-gradient text-white font-bold"
                  onClick={handleSendOTP}
                  disabled={loading || mobile.length !== 10}
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Phone className="w-4 h-4 mr-2" />
                  )}
                  Send OTP
                </Button>
              </>
            )}

            {phase === "enter-otp" && (
              <>
                <div className="text-center mb-2">
                  <p className="text-xs text-muted-foreground">OTP sent to</p>
                  <p className="text-sm font-bold text-foreground">+91 {mobile}</p>
                </div>
                <div>
                  <label className="text-xs font-bold text-foreground mb-1.5 block">
                    Enter OTP
                  </label>
                  <Input
                    type="tel"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="1234"
                    className="bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800 h-12 text-center text-xl font-black tracking-[0.5em]"
                    onKeyDown={(e) => e.key === "Enter" && handleVerifyOTP()}
                    autoFocus
                  />
                  <p className="text-[10px] text-muted-foreground mt-1 text-center">
                    Demo mode: Enter any 4+ digit OTP
                  </p>
                </div>
                <Button
                  className="w-full h-11 brand-gradient text-white font-bold"
                  onClick={handleVerifyOTP}
                  disabled={loading || otp.length < 4}
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                  )}
                  Verify & Login
                </Button>
                <button
                  onClick={() => setPhase("enter-mobile")}
                  className="w-full text-[11px] text-violet-600 dark:text-violet-400 font-bold hover:underline"
                >
                  ← Change mobile number
                </button>
              </>
            )}

            {phase === "success" && user && (
              <div className="text-center py-4">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.1 }}
                  className="w-16 h-16 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center mb-3"
                >
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                </motion.div>
                <h3 className="text-sm font-black text-foreground">Login Successful!</h3>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Welcome, +91 {mobile}
                </p>
                {user.referralCode && (
                  <div className="mt-3 bg-violet-50 dark:bg-violet-950/30 rounded-xl p-2.5 border border-violet-200 dark:border-violet-800">
                    <p className="text-[10px] text-muted-foreground">Your Referral Code</p>
                    <p className="text-sm font-black text-violet-600 dark:text-violet-400 tracking-wider">
                      {user.referralCode}
                    </p>
                  </div>
                )}
                {user.referredBy && (
                  <p className="text-[10px] text-emerald-600 mt-2">
                    ✓ Referred by: {user.referredBy} (+1 day bonus)
                  </p>
                )}
              </div>
            )}

            {/* Referral info */}
            {phase === "enter-mobile" && (
              <div className="bg-violet-50/50 dark:bg-violet-950/20 rounded-xl p-3">
                <p className="text-[10px] font-bold text-violet-700 dark:text-violet-300 mb-1">
                  Why login?
                </p>
                <ul className="space-y-0.5 text-[10px] text-muted-foreground">
                  <li className="flex items-center gap-1">
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" />
                    Get your unique referral code
                  </li>
                  <li className="flex items-center gap-1">
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" />
                    Earn 7 days bonus per referral
                  </li>
                  <li className="flex items-center gap-1">
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" />
                    Sync license across devices
                  </li>
                  <li className="flex items-center gap-1">
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" />
                    Track referral rewards
                  </li>
                </ul>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ============== User Login Button (for profile page) ============== */

export function UserLoginButton() {
  const [showLogin, setShowLogin] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserRecord | null>(null);

  useEffect(() => {
    setCurrentUser(getCurrentUser());
  }, []);

  function handleLogout() {
    logoutUser();
    setCurrentUser(null);
    toast.info("Logged out");
  }

  if (currentUser) {
    return (
      <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <div>
              <p className="text-xs font-bold text-foreground">+91 {currentUser.mobile}</p>
              <p className="text-[10px] text-muted-foreground">
                Code: {currentUser.referralCode} · Referrals: {currentUser.referralCount}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs border-red-200 text-red-600"
            onClick={handleLogout}
          >
            Logout
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Button
        className="w-full h-11 brand-gradient text-white font-bold"
        onClick={() => setShowLogin(true)}
      >
        <Phone className="w-4 h-4 mr-2" />
        Login with Mobile
        <ChevronRight className="w-4 h-4 ml-1" />
      </Button>
      <MobileLoginModal
        open={showLogin}
        onClose={() => setShowLogin(false)}
        onLogin={(user) => {
          setCurrentUser(user);
          toast.success(`Welcome, +91 ${user.mobile}!`);
        }}
      />
    </>
  );
}
