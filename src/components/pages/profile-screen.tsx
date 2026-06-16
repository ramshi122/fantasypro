"use client";

import { useApp, useAuth } from "@/lib/store";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Bell, ChevronRight, Crown, HelpCircle, KeyRound, LogOut, Settings, Shield, Star, User } from "lucide-react";
import { toast } from "sonner";

export function ProfileScreen() {
  const user = useAuth((s) => s.user);
  const isGuest = useAuth((s) => s.isGuest);
  const logout = useAuth((s) => s.logout);
  const savedMatches = useApp((s) => s.savedMatches);
  const setView = useApp((s) => s.setView);

  function handleLogout() {
    logout();
    toast.success("Switched to guest mode");
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
              {user?.name || user?.email || "FantasyPro User"}
            </p>
            <p className="text-xs text-white/80 truncate">
              {user?.email || user?.mobile || "Premium Member"}
            </p>
            <div className="mt-1 inline-flex items-center gap-1 text-[10px] bg-white/20 backdrop-blur-sm px-2 py-0.5 rounded-full">
              {isGuest ? (
                <>
                  <User className="w-2.5 h-2.5" />
                  Guest Mode
                </>
              ) : (
                <>
                  <Crown className="w-2.5 h-2.5" />
                  {user?.plan || "Free"} Plan
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Guest mode banner with CTA to use real token */}
      {isGuest && (
        <div className="rounded-2xl bg-gradient-to-br from-violet-50 to-pink-50 dark:from-violet-950/40 dark:to-pink-950/40 border border-violet-200 dark:border-violet-800 p-4">
          <div className="flex items-start gap-3">
            <KeyRound className="w-5 h-5 text-violet-600 dark:text-violet-300 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-foreground mb-0.5">Guest Mode</p>
              <p className="text-xs text-muted-foreground mb-2">
                You're browsing as guest. All features work locally. Add a real Dream11 token to transfer teams directly to your account.
              </p>
              <Button
                size="sm"
                className="brand-gradient text-white h-8 text-xs"
                onClick={() => toast.info("Open the Login screen from the menu to enter a real token")}
              >
                Use Real Token
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Saved" value={savedMatches.length.toString()} icon={Star} />
        <StatCard label="Plan" value={user?.plan || "Free"} icon={Crown} />
        <StatCard label="Status" value="Active" icon={Shield} />
      </div>

      {/* Sections */}
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
        <p className="text-[10px] text-muted-foreground mb-3">
          FantasyPro v1.0.0 · © 2026
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
