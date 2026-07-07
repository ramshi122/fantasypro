"use client";

import { useEffect, useState } from "react";
import { useApp, useAuth } from "@/lib/store";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import {
  Bell,
  ChevronRight,
  Crown,
  HelpCircle,
  Link2,
  LogOut,
  Plus,
  Settings,
  Shield,
  Star,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  listLinkedAccounts,
  unlinkFantasyApp,
  type FantasyApp,
  type LinkedFantasyAccount,
} from "@/lib/api";
import { OtpLoginModal } from "@/components/auth/otp-login-modal";
import { motion, AnimatePresence } from "framer-motion";
import { useHiddenTrigger } from "@/lib/use-hidden-trigger";
import { cn } from "@/lib/utils";

const APP_META: Record<FantasyApp, { label: string; emoji: string; color: string }> = {
  dream11: { label: "Dream11", emoji: "🏏", color: "from-red-500 to-rose-600" },
  my11circle: { label: "My11Circle", emoji: "⭕", color: "from-sky-500 to-blue-600" },
  myteam11: { label: "MyTeam11", emoji: "👥", color: "from-emerald-500 to-green-600" },
  vision11: { label: "Vision11", emoji: "👁️", color: "from-violet-500 to-purple-600" },
};

export function ProfileScreen({ onAdminTrigger }: { onAdminTrigger?: () => void }) {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const savedMatches = useApp((s) => s.savedMatches);
  const setView = useApp((s) => s.setView);
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedFantasyAccount[]>([]);
  const [showOtpLogin, setShowOtpLogin] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const versionTrigger = useHiddenTrigger(() => onAdminTrigger?.());

  // Refresh linked accounts list on mount + when refreshKey changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLinkedAccounts(listLinkedAccounts());
  }, [refreshKey]);

  function handleLogout() {
    logout();
    toast.success("Logged out");
    setView("home");
  }

  function handleUnlink(app: FantasyApp) {
    unlinkFantasyApp(app);
    setLinkedAccounts(listLinkedAccounts());
    toast.success(`${APP_META[app].label} unlinked`);
  }

  function handleLinked(app: FantasyApp) {
    setShowOtpLogin(false);
    setRefreshKey((k) => k + 1);
    toast.success(`${APP_META[app].label} linked successfully`);
  }

  const sections = [
    {
      title: "Account",
      items: [
        { icon: Crown, label: "Subscription Plan", value: user?.plan || "Free", color: "text-amber-500" },
        { icon: Star, label: "Saved Matches", value: savedMatches.length.toString(), color: "text-violet-500" },
        { icon: Bell, label: "Notifications", value: "On", color: "text-pink-500" },
      ],
    },
    {
      title: "Settings",
      items: [
        { icon: Settings, label: "App Settings", value: "", color: "text-sky-500" },
        { icon: Shield, label: "Privacy & Security", value: "", color: "text-emerald-500" },
        { icon: HelpCircle, label: "Help & Support", value: "", color: "text-orange-500" },
      ],
    },
  ];

  return (
    <div className="px-4 py-4 pb-24 space-y-4">
      {/* Profile header */}
      <div className="brand-gradient rounded-3xl p-5 text-white shadow-lg relative overflow-hidden">
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full" />
        <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-white/5 rounded-full" />

        <div className="relative flex items-center gap-3">
          <div className="w-16 h-16 rounded-full bg-white/25 backdrop-blur-sm flex items-center justify-center">
            <User className="w-8 h-8 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-bold truncate">
              {user?.name || "Apna Cricket User"}
            </p>
            <p className="text-xs text-white/80 truncate">
              {user?.email || user?.mobile || "Premium Member"}
            </p>
            <div className="mt-1 inline-flex items-center gap-1 text-[10px] bg-white/20 backdrop-blur-sm px-2 py-0.5 rounded-full">
              <Crown className="w-2.5 h-2.5" />
              {user?.plan || "Free"} Plan
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Saved" value={savedMatches.length.toString()} icon={Star} />
        <StatCard label="Plan" value={user?.plan || "Free"} icon={Crown} />
        <StatCard label="Status" value="Active" icon={Shield} />
      </div>

      {/* Linked Fantasy Accounts */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5" />
            Linked Fantasy Accounts
          </h3>
          <button
            onClick={() => setShowOtpLogin(true)}
            className="text-[11px] font-bold text-violet-600 dark:text-violet-300 flex items-center gap-1 hover:underline"
          >
            <Plus className="w-3 h-3" />
            Link New
          </button>
        </div>

        {linkedAccounts.length === 0 ? (
          <div className="bg-white dark:bg-card rounded-2xl border border-dashed border-violet-200 dark:border-violet-800 p-5 text-center">
            <Users className="w-8 h-8 mx-auto text-violet-300 mb-2" />
            <p className="text-sm font-semibold text-foreground mb-0.5">No accounts linked</p>
            <p className="text-[11px] text-muted-foreground mb-3">
              Link your Dream11/My11Circle account via OTP to enable direct team transfer.
              Login is required only once.
            </p>
            <Button
              size="sm"
              className="brand-gradient text-white h-8 text-xs"
              onClick={() => setShowOtpLogin(true)}
            >
              <Plus className="w-3 h-3 mr-1" />
              Link Account
            </Button>
          </div>
        ) : (
          <div className="bg-white dark:bg-card rounded-2xl border border-violet-100 dark:border-violet-900/30 overflow-hidden">
            <AnimatePresence>
              {linkedAccounts.map((acc, i) => {
                const meta = APP_META[acc.app];
                return (
                  <motion.div
                    key={acc.app}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ delay: i * 0.05 }}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3.5",
                      i !== linkedAccounts.length - 1 && "border-b border-violet-50 dark:border-violet-900/20"
                    )}
                  >
                    <div className={cn("w-10 h-10 rounded-xl bg-gradient-to-br flex items-center justify-center text-xl flex-shrink-0", meta.color)}>
                      {meta.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground">{meta.label}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {acc.mobile ? `+91 ${acc.mobile}` : "Linked"}
                        {acc.linkedAt && (
                          <span className="ml-1.5">
                            · {new Date(acc.linkedAt).toLocaleDateString()}
                          </span>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => handleUnlink(acc.app)}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      Unlink
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Other sections */}
      {sections.map((section) => (
        <div key={section.title} className="space-y-2">
          <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider px-1">
            {section.title}
          </h3>
          <div className="bg-white dark:bg-card rounded-2xl border border-violet-100 dark:border-violet-900/30 overflow-hidden">
            {section.items.map((item, i) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors ${
                    i !== section.items.length - 1
                      ? "border-b border-violet-50 dark:border-violet-900/20"
                      : ""
                  }`}
                >
                  <Icon className={`w-5 h-5 ${item.color}`} />
                  <span className="flex-1 text-left text-sm font-medium text-foreground">
                    {item.label}
                  </span>
                  {item.value && (
                    <span className="text-xs text-muted-foreground font-medium">
                      {item.value}
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-muted-foreground/50" />
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Brand + Logout */}
      <div className="text-center py-4">
        <div className="flex justify-center mb-3">
          <BrandLogo size={36} />
        </div>
        <p
          className="text-[10px] text-muted-foreground mb-3 cursor-pointer select-none"
          onClick={() => versionTrigger.registerTap()}
        >
          Apna Cricket v1.0.0 · © 2026
        </p>
        <Button
          variant="outline"
          className="w-full h-11 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
          onClick={handleLogout}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Logout
        </Button>
      </div>

      {/* OTP Login modal */}
      <OtpLoginModal
        open={showOtpLogin}
        onClose={() => setShowOtpLogin(false)}
        onLinked={(app) => handleLinked(app)}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Star;
}) {
  return (
    <div className="bg-white dark:bg-card rounded-2xl border border-violet-100 dark:border-violet-900/30 p-3 text-center">
      <Icon className="w-4 h-4 text-violet-500 mx-auto mb-1" />
      <p className="text-sm font-black text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
