"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, KeyRound, Loader2, Shield, Sparkles, Zap, Lock, ArrowRight } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { useAuth } from "@/lib/store";
import { verifyAuth } from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginScreen() {
  const setAuth = useAuth((s) => s.setAuth);
  const [token, setToken] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) {
      toast.error("Please paste your access token");
      return;
    }
    setLoading(true);
    try {
      const res = await verifyAuth(token.trim());
      // Strict check: backend must return status:"success" and not validToken:false
      const ok =
        !!res &&
        res.status === "success" &&
        res.validToken !== false;
      if (ok) {
        setAuth(token.trim(), {
          name: res.name,
          email: res.email,
          mobile: res.mobile,
          userId: res.userId,
          plan: res.plan,
        });
        toast.success("Welcome to FantasyPro! 🎉");
      } else {
        toast.error(res?.message || "Invalid token. Please check and try again.");
      }
    } catch (err: any) {
      toast.error(err?.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full brand-gradient relative overflow-hidden flex flex-col">
      {/* Decorative blurred shapes */}
      <div className="absolute -top-32 -left-20 w-80 h-80 bg-pink-400/40 rounded-full blur-3xl" />
      <div className="absolute -bottom-32 -right-20 w-96 h-96 bg-violet-500/30 rounded-full blur-3xl" />
      <div className="absolute top-1/3 right-1/4 w-64 h-64 bg-fuchsia-300/30 rounded-full blur-3xl" />

      <div className="relative flex-1 flex flex-col px-6 py-10 max-w-md mx-auto w-full">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center pt-6 pb-10"
        >
          <div className="flex justify-center mb-6">
            <BrandLogo size={72} />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">
            Welcome 👋
          </h1>
          <p className="text-white/80 mt-1 text-sm">
            Login or Sign Up
          </p>
          <p className="text-white/70 text-xs mt-4 leading-relaxed">
            Sign in to create high-quality teams, transfer and join seamlessly.
          </p>
        </motion.div>

        {/* Feature pills */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="grid grid-cols-3 gap-2 mb-8"
        >
          <div className="glass-card rounded-2xl p-3 text-center">
            <Shield className="w-5 h-5 text-white mx-auto mb-1" />
            <p className="text-[10px] text-white font-semibold">Secure & Safe</p>
            <p className="text-[9px] text-white/70">Protected</p>
          </div>
          <div className="glass-card rounded-2xl p-3 text-center">
            <Zap className="w-5 h-5 text-white mx-auto mb-1" />
            <p className="text-[10px] text-white font-semibold">Fast & Reliable</p>
            <p className="text-[9px] text-white/70">Instant teams</p>
          </div>
          <div className="glass-card rounded-2xl p-3 text-center">
            <Sparkles className="w-5 h-5 text-white mx-auto mb-1" />
            <p className="text-[10px] text-white font-semibold">Smart Teams</p>
            <p className="text-[9px] text-white/70">AI-powered</p>
          </div>
        </motion.div>

        {/* Login form */}
        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="glass-card rounded-3xl p-6 shadow-2xl"
        >
          <h2 className="text-white text-lg font-bold mb-1">Sign in to continue</h2>
          <p className="text-white/70 text-xs mb-5">
            Paste your access token from the Telegram channel to login.
          </p>

          <div className="space-y-3">
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/70" />
              <Input
                type={show ? "text" : "password"}
                placeholder="Paste your access token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="pl-10 pr-10 bg-white/15 border-white/25 text-white placeholder:text-white/60 h-12 rounded-xl focus-visible:ring-white/40"
                autoComplete="off"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white"
                tabIndex={-1}
              >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <Button
              type="submit"
              disabled={loading || !token.trim()}
              className="w-full h-12 rounded-xl bg-white text-violet-700 hover:bg-white/90 font-bold text-base shadow-lg disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4 mr-2" />
                  Sign In Securely
                </>
              )}
            </Button>

            <button
              type="button"
              onClick={() => {
                setAuth("guest_skip_" + Date.now(), {
                  name: "Guest User",
                  plan: "Browse Only",
                });
                toast.success("Bypassed login — browsing as guest");
              }}
              disabled={loading}
              className="w-full h-11 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-sm backdrop-blur-sm transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              Skip — Browse as Guest
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="mt-5 pt-4 border-t border-white/15 text-center">
            <p className="text-white/70 text-[11px] leading-relaxed">
              Need a token?{" "}
              <a
                href="https://t.me"
                target="_blank"
                rel="noopener noreferrer"
                className="text-white font-semibold underline underline-offset-2"
              >
                Get it on Telegram
              </a>
            </p>
          </div>
        </motion.form>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-auto pt-8 text-center"
        >
          <p className="text-white/60 text-[11px]">
            🔒 End-to-end AES encrypted · Developed by FantasyPro
          </p>
        </motion.div>
      </div>
    </div>
  );
}
