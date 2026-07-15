"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Crown, Loader2, X, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { AdminPanel } from "@/components/admin/admin-panel";
import { LicenseLockOverlay } from "@/components/admin/license-lock";
import { AdminPWAInstaller } from "./pwa-installer";

/**
 * Admin Standalone Page (/admin)
 * =================================
 *
 * LOCKED: Admin password required to access.
 * Normal users CANNOT access this page — they see only a lock screen.
 *
 * Only admin with correct password can see the Admin Panel.
 */

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [verifying, setVerifying] = useState(false);

  // Set page title + meta for PWA
  useEffect(() => {
    document.title = "ADMIN — Apna Cricket";
    const manifestLink = document.querySelector('link[rel="manifest"]');
    if (manifestLink) {
      manifestLink.setAttribute("href", "/admin-manifest.json");
    } else {
      const link = document.createElement("link");
      link.rel = "manifest";
      link.href = "/admin-manifest.json";
      document.head.appendChild(link);
    }
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute("content", "#f59e0b");
    } else {
      const meta = document.createElement("meta");
      meta.name = "theme-color";
      meta.content = "#f59e0b";
      document.head.appendChild(meta);
    }

    // Check if admin session exists in sessionStorage
    const session = sessionStorage.getItem("apna-admin-session");
    if (session) {
      setAuthenticated(true);
    }
  }, []);

  // === Admin Login ===
  async function handleLogin() {
    if (!password.trim()) {
      toast.error("Password required");
      return;
    }
    setVerifying(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (data.success && data.token) {
        sessionStorage.setItem("apna-admin-session", data.token);
        setAuthenticated(true);
        toast.success("✅ Admin access granted");
      } else {
        toast.error("❌ Wrong password — access denied");
        setPassword("");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setVerifying(false);
    }
  }

  // === Lock Screen (shown to non-admin users) ===
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 flex items-center justify-center p-4">
        <AdminPWAInstaller />
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm"
        >
          {/* Lock icon */}
          <div className="text-center mb-6">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring" }}
              className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-xl mb-3"
            >
              <Lock className="w-10 h-10 text-white" />
            </motion.div>
            <h1 className="text-xl font-black text-white">ADMIN ACCESS</h1>
            <p className="text-[11px] text-white/50 mt-1">
              🔒 Restricted area — Admin only
            </p>
          </div>

          {/* Login form */}
          <div className="bg-white/5 backdrop-blur-xl rounded-2xl p-5 border border-white/10 shadow-2xl space-y-3">
            <div>
              <label className="text-[10px] font-bold text-white/60 uppercase mb-1.5 block">
                Admin Password
              </label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter admin password"
                className="h-12 bg-white/5 border-white/20 text-white placeholder:text-white/30"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleLogin();
                }}
                autoFocus
              />
            </div>

            <Button
              className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold"
              onClick={handleLogin}
              disabled={verifying}
            >
              {verifying ? (
                <><Loader2 className="w-5 h-5 mr-1.5 animate-spin" /> Verifying...</>
              ) : (
                <><Shield className="w-5 h-5 mr-1.5" /> Unlock Admin</>
              )}
            </Button>

            {/* Warning */}
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-2.5 text-center">
              <p className="text-[9px] text-red-300/80 font-bold">
                ⚠️ UNAUTHORIZED ACCESS PROHIBITED
              </p>
              <p className="text-[8px] text-red-300/50 mt-0.5">
                This area is restricted to authorized administrators only.
                All access attempts are logged.
              </p>
            </div>
          </div>

          {/* Footer */}
          <p className="text-center text-[9px] text-white/30 mt-4">
            Apna Cricket · Admin Panel v1.0 · Protected
          </p>
        </motion.div>
      </div>
    );
  }

  // === Authenticated — show Admin Panel ===
  return (
    <div className="min-h-screen bg-background">
      <AdminPWAInstaller />
      <AdminPanel open={true} onClose={() => {}} />
      <LicenseLockOverlay />
    </div>
  );
}
