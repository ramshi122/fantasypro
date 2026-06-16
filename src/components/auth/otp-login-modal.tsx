"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Lock,
  Phone,
  RefreshCw,
  Shield,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  sendFantasyOtp,
  verifyFantasyOtp,
  saveFantasyToken,
  type FantasyApp,
  type SendOtpResult,
} from "@/lib/api";
import { cn } from "@/lib/utils";

interface OtpLoginModalProps {
  open: boolean;
  onClose: () => void;
  onLinked: (app: FantasyApp, mobile: string, token: string) => void;
  defaultApp?: FantasyApp;
}

const APPS: Array<{
  id: FantasyApp;
  label: string;
  emoji: string;
  color: string;
  desc: string;
}> = [
  { id: "dream11", label: "Dream11", emoji: "🏏", color: "from-red-500 to-rose-600", desc: "Most popular fantasy cricket" },
  { id: "my11circle", label: "My11Circle", emoji: "⭕", color: "from-sky-500 to-blue-600", desc: "Circle of fantasy experts" },
  { id: "myteam11", label: "MyTeam11", emoji: "👥", color: "from-emerald-500 to-green-600", desc: "Play & win daily" },
  { id: "vision11", label: "Vision11", emoji: "👁️", color: "from-violet-500 to-purple-600", desc: "Vision your win" },
];

type Phase = "select-app" | "enter-mobile" | "enter-otp" | "linking" | "done";

export function OtpLoginModal({
  open,
  onClose,
  onLinked,
  defaultApp,
}: OtpLoginModalProps) {
  const [phase, setPhase] = useState<Phase>("select-app");
  const [selectedApp, setSelectedApp] = useState<FantasyApp>(defaultApp || "dream11");
  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpState, setOtpState] = useState<SendOtpResult | null>(null);
  const [resendTimer, setResendTimer] = useState(0);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setPhase("select-app");
      setMobile("");
      setOtp("");
      setOtpState(null);
      setResendTimer(0);
    }
  }, [open]);

  // Resend countdown
  useEffect(() => {
    if (resendTimer <= 0) return;
    const t = setInterval(() => setResendTimer((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [resendTimer]);

  async function handleSendOtp() {
    if (!/^\d{10}$/.test(mobile)) {
      toast.error("Please enter a valid 10-digit mobile number");
      return;
    }
    setLoading(true);
    try {
      const res = await sendFantasyOtp({ fantasyApp: selectedApp, mobileNumber: mobile });
      if (res.status === "success") {
        setOtpState(res);
        setPhase("enter-otp");
        setResendTimer(30);
        toast.success(`OTP sent to ${mobile}`);
      } else {
        toast.error(res.message || "Failed to send OTP");
      }
    } catch (err: any) {
      toast.error(err?.message || "Network error");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp() {
    if (!/^\d{6}$/.test(otp)) {
      toast.error("Please enter the 6-digit OTP");
      return;
    }
    setLoading(true);
    setPhase("linking");
    try {
      const res = await verifyFantasyOtp({
        fantasyApp: selectedApp,
        mobileNumber: mobile,
        verificationCode: otp,
        state: otpState?.state,
        reasonCode: otpState?.reasonCode,
        challenge: otpState?.challenge,
        login_auth_token: otpState?.login_auth_token,
        userId: otpState?.userId,
      });
      if (res.status === "success" && res.token) {
        saveFantasyToken(selectedApp, res.token);
        // Also store my11circle extras if present
        if (selectedApp === "my11circle" && res.my11circleChallenge) {
          localStorage.setItem(
            "fantasypro-my11circle-extras",
            JSON.stringify({
              challenge: res.my11circleChallenge,
              userId: res.my11circleUserId,
              mobile,
            })
          );
        }
        setPhase("done");
        toast.success(`${APPS.find((a) => a.id === selectedApp)?.label} linked successfully!`);
        setTimeout(() => {
          onLinked(selectedApp, mobile, res.token!);
        }, 1200);
      } else {
        toast.error(res.message || "Invalid OTP");
        setPhase("enter-otp");
      }
    } catch (err: any) {
      toast.error(err?.message || "Verification failed");
      setPhase("enter-otp");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  const app = APPS.find((a) => a.id === selectedApp)!;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          className="bg-white dark:bg-background w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[95vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className={cn("bg-gradient-to-br p-5 text-white relative overflow-hidden", app.color)}>
            <div className="absolute -top-8 -right-8 w-32 h-32 bg-white/10 rounded-full" />
            <div className="absolute -bottom-12 -left-8 w-32 h-32 bg-white/5 rounded-full" />
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-3">
                {phase !== "select-app" && phase !== "done" && (
                  <button
                    onClick={() => setPhase(phase === "enter-otp" ? "enter-mobile" : "select-app")}
                    className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}
                <div>
                  <h3 className="font-bold text-lg flex items-center gap-2">
                    <span className="text-2xl">{app.emoji}</span>
                    {phase === "select-app" && "Link Fantasy Account"}
                    {phase === "enter-mobile" && `Login to ${app.label}`}
                    {phase === "enter-otp" && `Verify ${app.label} OTP`}
                    {phase === "linking" && "Linking..."}
                    {phase === "done" && "Linked!"}
                  </h3>
                  <p className="text-xs text-white/80 mt-0.5">
                    {phase === "select-app" && "Choose your fantasy platform"}
                    {phase === "enter-mobile" && app.desc}
                    {phase === "enter-otp" && `Enter the 6-digit code sent to ${mobile}`}
                    {phase === "linking" && "Verifying with backend..."}
                    {phase === "done" && "You can now bulk transfer teams"}
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="p-1 rounded-full hover:bg-white/20">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="p-5">
            {/* Phase 1: Select App */}
            {phase === "select-app" && (
              <div className="space-y-2">
                {APPS.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => {
                      setSelectedApp(a.id);
                      setPhase("enter-mobile");
                    }}
                    className={cn(
                      "w-full p-3 rounded-xl border-2 transition-all text-left flex items-center gap-3",
                      "border-violet-100 dark:border-violet-900/30 hover:border-violet-300 hover:bg-violet-50/50 dark:hover:bg-violet-900/10"
                    )}
                  >
                    <div className={cn("w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center text-2xl flex-shrink-0", a.color)}>
                      {a.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground">{a.label}</p>
                      <p className="text-xs text-muted-foreground">{a.desc}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  </button>
                ))}
                <div className="mt-4 p-3 rounded-xl bg-violet-50/50 dark:bg-violet-950/20 text-[11px] text-muted-foreground">
                  <p className="flex items-start gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-violet-500 mt-0.5 flex-shrink-0" />
                    <span>
                      OTP is sent directly by {`${APPS.map(a=>a.label).join("/")}`} via TeamGeneration&apos;s secure proxy.
                      Your credentials are stored locally on this device only.
                    </span>
                  </p>
                </div>
              </div>
            )}

            {/* Phase 2: Enter Mobile */}
            {phase === "enter-mobile" && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-foreground mb-1.5 block">
                    {app.label} Mobile Number
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
                      placeholder="9848579715"
                      className="pl-10 h-12 text-base tracking-wider"
                      autoFocus
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5">
                    Enter the mobile number registered with your {app.label} account.
                  </p>
                </div>

                <Button
                  onClick={handleSendOtp}
                  disabled={loading || mobile.length !== 10}
                  className="w-full h-12 brand-gradient text-white font-bold"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Sending OTP...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      Send OTP
                    </>
                  )}
                </Button>

                <div className="text-center text-[11px] text-muted-foreground">
                  By continuing, you agree to {app.label}&apos;s Terms of Service.
                </div>
              </div>
            )}

            {/* Phase 3: Enter OTP */}
            {phase === "enter-otp" && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-foreground mb-1.5 block">
                    Verification Code
                  </label>
                  <Input
                    type="tel"
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    placeholder="••••••"
                    className="h-14 text-center text-2xl tracking-[0.5em] font-bold"
                    autoFocus
                  />
                  <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
                    {otpState?.retries_left != null && (
                      <span>{otpState.retries_left} attempt(s) remaining · </span>
                    )}
                    Sent to {mobile} ({app.label})
                  </p>
                </div>

                <Button
                  onClick={handleVerifyOtp}
                  disabled={loading || otp.length !== 6}
                  className="w-full h-12 brand-gradient text-white font-bold"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4 mr-2" />
                      Verify & Link
                    </>
                  )}
                </Button>

                <div className="flex items-center justify-between text-[11px]">
                  <button
                    onClick={() => setPhase("enter-mobile")}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    Change number
                  </button>
                  <button
                    onClick={resendTimer === 0 ? handleSendOtp : undefined}
                    disabled={resendTimer > 0 || loading}
                    className={cn(
                      "font-semibold",
                      resendTimer > 0 ? "text-muted-foreground" : "text-violet-600 dark:text-violet-300 hover:underline"
                    )}
                  >
                    {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend OTP"}
                  </button>
                </div>
              </div>
            )}

            {/* Phase 4: Linking */}
            {phase === "linking" && (
              <div className="py-8 text-center">
                <Loader2 className="w-12 h-12 mx-auto text-violet-500 animate-spin mb-3" />
                <p className="text-sm font-semibold text-foreground">Linking {app.label}...</p>
                <p className="text-xs text-muted-foreground mt-1">Verifying OTP with backend</p>
              </div>
            )}

            {/* Phase 5: Done */}
            {phase === "done" && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-8 text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, delay: 0.1 }}
                  className="w-16 h-16 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center mb-3"
                >
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
                </motion.div>
                <p className="text-base font-bold text-foreground">{app.label} Linked!</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {mobile} · You can now bulk transfer teams
                </p>
              </motion.div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
