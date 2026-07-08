"use client";

import { useEffect, useState } from "react";
import { useApp, useAuth } from "@/lib/store";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  CreditCard,
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
import { UserLoginButton } from "@/components/auth/mobile-login-modal";
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
      {/* Profile header — shows real user login details */}
      <UserProfileHeader />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Saved" value={savedMatches.length.toString()} icon={Star} />
        <StatCard label="Plan" value={user?.plan || "Free"} icon={Crown} />
        <StatCard label="Status" value="Active" icon={Shield} />
      </div>

      {/* License Activation + Countdown */}
      <LicenseActivationCard />

      {/* User Mobile Login */}
      <UserLoginButton />

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

      {/* Referral Program Section */}
      <ReferralSection />

      {/* License Plans Section */}
      <LicensePlansSection />

      {/* Feature Matrix Section */}
      <FeatureMatrixSection />

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

/* ============== Referral Section ============== */

function ReferralSection() {
  const [referralCode, setReferralCode] = useState("");
  const [stats, setStats] = useState({ totalReferrals: 0, activeReferrals: 0, rewardsEarned: 0 });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Lazy import to avoid SSR issues
    import("@/lib/referral").then(({ getReferralStats }) => {
      const s = getReferralStats();
      setReferralCode(s.referralCode);
      setStats({
        totalReferrals: s.totalReferrals,
        activeReferrals: s.activeReferrals,
        rewardsEarned: s.rewardsEarned,
      });
    });
  }, []);

  function handleCopyCode() {
    if (!referralCode) return;
    navigator.clipboard.writeText(referralCode);
    setCopied(true);
    toast.success("Referral code copied!");
    setTimeout(() => setCopied(false), 2000);
  }

  function handleShareWhatsApp() {
    import("@/lib/referral").then(({ getReferralStats }) => {
      const s = getReferralStats();
      const text = encodeURIComponent(s.shareText);
      window.open(`https://wa.me/?text=${text}`, "_blank");
    });
  }

  function handleShareTelegram() {
    import("@/lib/referral").then(({ getReferralStats }) => {
      const s = getReferralStats();
      const text = encodeURIComponent(s.shareText);
      const url = encodeURIComponent(s.shareUrl);
      window.open(`https://t.me/share/url?url=${url}&text=${text}`, "_blank");
    });
  }

  return (
    <div className="bg-gradient-to-br from-violet-600 to-fuchsia-600 rounded-2xl p-4 text-white shadow-lg">
      <div className="flex items-center gap-2 mb-3">
        <Users className="w-5 h-5" />
        <h3 className="font-bold text-sm">Refer & Earn</h3>
      </div>
      <p className="text-[11px] text-white/80 mb-3">
        Share your referral code with friends. When they activate a license, you get <b>7 days bonus</b> and they get <b>1 day bonus</b>!
      </p>

      {/* Referral code display */}
      <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3 mb-3">
        <p className="text-[10px] text-white/70 mb-1">Your Referral Code</p>
        <div className="flex items-center justify-between">
          <code className="text-lg font-black tracking-wider">{referralCode || "Loading..."}</code>
          <button
            onClick={handleCopyCode}
            className="text-[10px] bg-white/20 hover:bg-white/30 px-2 py-1 rounded-md font-bold flex items-center gap-1"
          >
            {copied ? <CheckCircle2 className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-white/15 rounded-lg p-2 text-center">
          <p className="text-lg font-black">{stats.totalReferrals}</p>
          <p className="text-[9px] text-white/70">Total Referrals</p>
        </div>
        <div className="bg-white/15 rounded-lg p-2 text-center">
          <p className="text-lg font-black">{stats.activeReferrals}</p>
          <p className="text-[9px] text-white/70">Active</p>
        </div>
        <div className="bg-white/15 rounded-lg p-2 text-center">
          <p className="text-lg font-black">{stats.rewardsEarned}</p>
          <p className="text-[9px] text-white/70">Days Earned</p>
        </div>
      </div>

      {/* Share buttons */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="sm"
          className="bg-emerald-500 hover:bg-emerald-600 text-white h-9 text-xs"
          onClick={handleShareWhatsApp}
        >
          <Bell className="w-3 h-3 mr-1" />
          Share WhatsApp
        </Button>
        <Button
          size="sm"
          className="bg-sky-500 hover:bg-sky-600 text-white h-9 text-xs"
          onClick={handleShareTelegram}
        >
          <Link2 className="w-3 h-3 mr-1" />
          Share Telegram
        </Button>
      </div>
    </div>
  );
}

/* ============== License Plans Section ============== */

function LicensePlansSection() {
  const [paymentPlan, setPaymentPlan] = useState<any>(null);
  const [userMobile, setUserMobile] = useState("");

  useEffect(() => {
    import("@/lib/user-auth").then(({ getCurrentUser }) => {
      const user = getCurrentUser();
      if (user) setUserMobile(user.mobile);
    });
  }, []);

  const plans = [
    {
      id: "1-match",
      name: "1 Match",
      price: 49,
      priceDisplay: "₹49",
      duration: "6 Hours",
      tagline: "Single match access",
      color: "from-amber-500 to-orange-600",
      keyType: "match_basic",
      features: ["Team Generation: FREE", "Single Transfer: UNLIMITED", "Bulk Add: UP TO 11 TEAMS", "Contest Join: YES"],
    },
    {
      id: "24-hour",
      name: "24 Hour",
      price: 99,
      priceDisplay: "₹99",
      duration: "24 Hours",
      tagline: "Full access 24h",
      color: "from-rose-500 to-pink-600",
      keyType: "match_full",
      features: ["Team Generation: FREE", "Single Transfer: UNLIMITED", "Bulk Add: UP TO 11 TEAMS", "My11Circle: UNLOCKED"],
    },
    {
      id: "pro",
      name: "Pro",
      price: 299,
      priceDisplay: "₹299",
      duration: "30 Days",
      tagline: "Play More. Win More.",
      color: "from-sky-500 to-blue-600",
      keyType: "monthly",
      features: ["Team Generation: FREE", "Single Transfer: UNLIMITED", "Bulk Add: UP TO 40 TEAMS", "Multi-Account: YES"],
    },
    {
      id: "elite",
      name: "Elite",
      price: 999,
      priceDisplay: "₹999",
      duration: "90 Days",
      tagline: "Dominate. Always.",
      color: "from-violet-500 to-purple-600",
      keyType: "elite",
      badge: "BEST VALUE",
      features: ["Team Generation: FREE", "Bulk Add: UP TO 40 TEAMS", "My11Circle: UNLOCKED", "Elite AI: UNLOCKED"],
    },
    {
      id: "lifetime",
      name: "Lifetime",
      price: 4999,
      priceDisplay: "₹4999",
      duration: "Forever",
      tagline: "Forever access",
      color: "from-amber-500 to-yellow-600",
      keyType: "lifetime",
      features: ["Everything in Elite", "Lifetime access", "All future features", "Priority support"],
    },
  ];

  function handleBuy(plan: any) {
    // Try to get mobile from user-auth if not loaded yet
    if (!userMobile) {
      import("@/lib/user-auth").then(({ getCurrentUser }) => {
        const user = getCurrentUser();
        if (user && user.mobile) {
          setUserMobile(user.mobile);
          setPaymentPlan(plan);
        } else {
          toast.error("Please login with mobile number first (Profile → Login with Mobile)");
        }
      });
      return;
    }
    setPaymentPlan(plan);
  }

  async function handlePaymentSuccess(licenseKey: string, keyType: string, expiresAt: number | null) {
    // Auto-activate the key
    import("@/lib/admin-store").then(({ setLicenseVerified }) => {
      setLicenseVerified(licenseKey, keyType as any);
      toast.success("License auto-activated! All features unlocked.");
      // Reload page to update UI
      setTimeout(() => window.location.reload(), 1000);
    });
    setPaymentPlan(null);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Crown className="w-4 h-4 text-amber-500" />
        <h3 className="font-bold text-sm text-foreground">Choose Your Power</h3>
      </div>

      {/* Plan cards with Buy buttons */}
      <div className="grid grid-cols-1 gap-2">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={cn(
              "rounded-2xl p-4 text-white shadow-lg relative overflow-hidden bg-gradient-to-br",
              plan.color
            )}
          >
            {plan.badge && (
              <span className="absolute top-2 right-2 bg-amber-400 text-amber-950 text-[8px] font-black px-1.5 py-0.5 rounded-full">
                {plan.badge}
              </span>
            )}
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-lg font-black">{plan.name}</p>
                <p className="text-[10px] text-white/80">{plan.tagline}</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-black">{plan.priceDisplay}</p>
                <p className="text-[10px] text-white/80">{plan.duration}</p>
              </div>
            </div>
            <div className="space-y-1 mb-3">
              {plan.features.map((f, i) => (
                <p key={i} className="text-[10px] text-white/90 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                  {f}
                </p>
              ))}
            </div>
            <Button
              className="w-full bg-white text-violet-700 hover:bg-white/90 font-bold h-9 text-xs"
              onClick={() => handleBuy(plan)}
            >
              <CreditCard className="w-3 h-3 mr-1" />
              Buy Now · {plan.priceDisplay}
            </Button>
          </div>
        ))}
      </div>

      <p className="text-center text-[10px] text-muted-foreground">
        🔒 Secure payment · Key auto-activates after payment confirmation
      </p>

      {/* Payment Modal */}
      {paymentPlan && (
        <PaymentModalLazy
          plan={paymentPlan}
          mobile={userMobile}
          onClose={() => setPaymentPlan(null)}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  );
}

/* Payment Modal lazy load */
function PaymentModalLazy({
  plan,
  mobile,
  onClose,
  onPaymentSuccess,
}: {
  plan: any;
  mobile: string;
  onClose: () => void;
  onPaymentSuccess: (licenseKey: string, keyType: string, expiresAt: number | null) => void;
}) {
  const [Modal, setModal] = useState<any>(null);

  useEffect(() => {
    import("@/components/payment/payment-modal").then((mod) => {
      setModal(() => mod.PaymentModal);
    });
  }, []);

  if (!Modal) return null;

  return (
    <Modal
      open={true}
      plan={plan}
      mobile={mobile}
      onClose={onClose}
      onPaymentSuccess={onPaymentSuccess}
    />
  );
}

/* ============== Feature Matrix Section ============== */

function FeatureMatrixSection() {
  const [activeTier, setActiveTier] = useState<string>("elite");

  // Load current license tier
  useEffect(() => {
    import("@/lib/admin-store").then(({ getLicenseState }) => {
      const state = getLicenseState();
      if (state.keyType) {
        setActiveTier(state.keyType);
      }
    });
  }, []);

  const tiers = [
    { id: "trial", name: "Trial", price: "FREE", duration: "1 Day" },
    { id: "match_basic", name: "1 Match", price: "₹49", duration: "6h" },
    { id: "match_full", name: "24 Hour", price: "₹99", duration: "24h" },
    { id: "weekly", name: "Weekly", price: "₹149", duration: "7d" },
    { id: "monthly", name: "Pro", price: "₹299", duration: "30d" },
    { id: "elite", name: "Elite", price: "₹999", duration: "90d" },
    { id: "lifetime", name: "Lifetime", price: "₹4999", duration: "∞" },
  ];

  const features = [
    { label: "Team Generation", key: "teamGenerationLimit", type: "limit" },
    { label: "Dream11 Transfer", key: "dream11Transfer", type: "transfer" },
    { label: "My11Circle Transfer", key: "my11CircleTransfer", type: "transfer" },
    { label: "Contest Join", key: "contestJoin", type: "boolean" },
    { label: "Expert Teams", key: "expertTeams", type: "boolean" },
    { label: "Prime Teams", key: "primeTeams", type: "boolean" },
    { label: "Elite AI", key: "eliteAI", type: "boolean" },
    { label: "Multi-Platform", key: "multiPlatform", type: "boolean" },
    { label: "Referral Program", key: "referralProgram", type: "boolean" },
  ];

  function getFeatureValue(tierId: string, feature: any) {
    // Lazy import to avoid SSR
    return import("@/lib/subscription").then(({ getTierFeatures }) => {
      const f = getTierFeatures(tierId);
      const val = (f as any)[feature.key];
      if (feature.type === "boolean") {
        return val ? "✅" : "❌";
      }
      if (feature.type === "limit") {
        if (val === 0) return "❌";
        if (val === -1) return "∞";
        return val.toString();
      }
      return String(val);
    });
  }

  const [featureValues, setFeatureValues] = useState<Record<string, Record<string, string>>>({});

  useEffect(() => {
    // Load all feature values
    const loadFeatures = async () => {
      const { getTierFeatures } = await import("@/lib/subscription");
      const values: Record<string, Record<string, string>> = {};
      for (const tier of tiers) {
        values[tier.id] = {};
        const f = getTierFeatures(tier.id);
        for (const feature of features) {
          const val = (f as any)[feature.key];
          if (val === undefined || val === null) {
            values[tier.id][feature.key] = "❌";
            continue;
          }
          if (feature.type === "boolean") {
            values[tier.id][feature.key] = val ? "✅" : "❌";
          } else if (feature.type === "limit") {
            if (val === 0) values[tier.id][feature.key] = "❌";
            else if (val === -1) values[tier.id][feature.key] = "∞";
            else values[tier.id][feature.key] = String(val);
          } else if (feature.type === "transfer") {
            // transfer values: "locked" | "3/day" | "enabled" | "unlimited"
            if (val === "locked") values[tier.id][feature.key] = "❌";
            else if (val === "3/day") values[tier.id][feature.key] = "3/day";
            else if (val === "unlimited") values[tier.id][feature.key] = "∞";
            else if (val === "enabled") values[tier.id][feature.key] = "✅";
            else values[tier.id][feature.key] = String(val);
          }
        }
      }
      setFeatureValues(values);
    };
    loadFeatures();
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Shield className="w-4 h-4 text-violet-500" />
        <h3 className="font-bold text-sm text-foreground">Feature Matrix — What You Get</h3>
      </div>

      {/* Tier selector */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
        {tiers.map((tier) => (
          <button
            key={tier.id}
            onClick={() => setActiveTier(tier.id)}
            className={cn(
              "flex-shrink-0 px-3 py-2 rounded-lg text-[10px] font-bold transition-all border-2",
              activeTier === tier.id
                ? "brand-gradient text-white border-transparent shadow-md"
                : "bg-card border-violet-200 dark:border-violet-900/30 text-foreground"
            )}
          >
            {tier.name}
            <p className="text-[8px] opacity-70 mt-0.5">{tier.price}</p>
          </button>
        ))}
      </div>

      {/* Feature list for selected tier */}
      <div className="bg-white dark:bg-card rounded-2xl border border-violet-100 dark:border-violet-900/30 overflow-hidden">
        {features.map((feature, i) => {
          const value = featureValues[activeTier]?.[feature.key] || "...";
          const isYes = value === "✅" || value === "∞";
          return (
            <div
              key={feature.key}
              className={cn(
                "flex items-center justify-between px-3 py-2.5",
                i !== features.length - 1 && "border-b border-violet-50 dark:border-violet-900/20"
              )}
            >
              <span className="text-[11px] text-foreground font-medium">{feature.label}</span>
              <span className={cn(
                "text-xs font-black",
                isYes ? "text-emerald-600 dark:text-emerald-400" : value === "❌" ? "text-red-500" : "text-violet-600 dark:text-violet-400"
              )}>
                {value === "✅" ? "YES" : value === "❌" ? "NO" : value === "∞" ? "UNLIMITED" : value}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-center text-[10px] text-muted-foreground">
        Your current tier is highlighted. Upgrade to unlock more features.
      </p>
    </div>
  );
}

/* ============== License Activation Card with Countdown ============== */

function LicenseActivationCard() {
  const [keyInput, setKeyInput] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [licenseInfo, setLicenseInfo] = useState<{
    key: string;
    keyType: string;
    verified: boolean;
    expiresAt: number | null;
  } | null>(null);
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, mins: 0, secs: 0, expired: false });

  // Load license state on mount
  useEffect(() => {
    import("@/lib/admin-store").then(({ getLicenseState }) => {
      const state = getLicenseState();
      if (state.verified && state.key) {
        // Get key type from admin store
        import("@/lib/admin-store").then(({ useAdmin }) => {
          const admin = useAdmin.getState();
          const keyObj = admin.keys.find((k) => k.key === state.key);
          setLicenseInfo({
            key: state.key,
            keyType: keyObj?.type || "unknown",
            verified: true,
            expiresAt: keyObj?.expiresAt ?? null,
          });
        });
      }
    });
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!licenseInfo?.expiresAt) return;

    const updateCountdown = () => {
      const now = Date.now();
      const diff = licenseInfo.expiresAt! - now;

      if (diff <= 0) {
        setCountdown({ days: 0, hours: 0, mins: 0, secs: 0, expired: true });
        return;
      }

      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);

      setCountdown({ days, hours, mins, secs, expired: false });
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [licenseInfo]);

  async function handleActivate() {
    if (!keyInput.trim()) {
      toast.error("Enter license key");
      return;
    }
    setVerifying(true);
    try {
      const { useLicense } = await import("@/lib/use-license");
      // Create a temporary hook instance is not possible, so use admin store directly
      const { useAdmin, setLicenseVerified } = await import("@/lib/admin-store");
      const admin = useAdmin.getState();
      const { getDeviceId } = await import("@/lib/admin-store");
      const deviceId = getDeviceId();
      const result = admin.verifyLicense(keyInput.trim().toUpperCase(), deviceId);

      if (result.valid) {
        setLicenseVerified(keyInput.trim().toUpperCase(), result.keyType);
        const keyObj = admin.keys.find((k) => k.key === keyInput.trim().toUpperCase());
        setLicenseInfo({
          key: keyInput.trim().toUpperCase(),
          keyType: result.keyType || keyObj?.type || "unknown",
          verified: true,
          expiresAt: keyObj?.expiresAt ?? null,
        });
        toast.success("License activated successfully!");
        setKeyInput("");
      } else {
        toast.error(result.message || "Activation failed");
      }
    } catch (err: any) {
      toast.error(err?.message || "Activation error");
    } finally {
      setVerifying(false);
    }
  }

  function handleDeactivate() {
    import("@/lib/admin-store").then(({ clearLicense }) => {
      clearLicense();
      setLicenseInfo(null);
      setCountdown({ days: 0, hours: 0, mins: 0, secs: 0, expired: false });
      toast.info("License deactivated");
    });
  }

  // License tier info
  const tierInfo: Record<string, { label: string; color: string; emoji: string }> = {
    trial: { label: "Trial (1 Day Free)", color: "from-emerald-500 to-green-600", emoji: "🆓" },
    match_basic: { label: "1 Match Access (6h)", color: "from-amber-500 to-orange-600", emoji: "🏏" },
    match_full: { label: "24 Hour Access", color: "from-rose-500 to-pink-600", emoji: "⏰" },
    weekly: { label: "Weekly (7 Days)", color: "from-sky-500 to-blue-600", emoji: "📅" },
    monthly: { label: "Pro (30 Days)", color: "from-sky-500 to-blue-600", emoji: "💎" },
    elite: { label: "Elite (90 Days)", color: "from-violet-500 to-purple-600", emoji: "👑" },
    lifetime: { label: "Lifetime Access", color: "from-amber-500 to-yellow-600", emoji: "♾️" },
  };

  const tier = licenseInfo ? tierInfo[licenseInfo.keyType] || tierInfo.trial : null;

  return (
    <div className="space-y-3">
      {licenseInfo && licenseInfo.verified ? (
        // Active License Card
        <div className={cn("rounded-2xl p-4 text-white shadow-lg bg-gradient-to-br", tier?.color || "from-violet-500 to-purple-600")}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{tier?.emoji}</span>
              <div>
                <p className="text-[10px] text-white/70 uppercase tracking-wider">License Active</p>
                <p className="text-sm font-black">{tier?.label || "Active"}</p>
              </div>
            </div>
            <CheckCircle2 className="w-5 h-5 text-white" />
          </div>

          {/* Key display */}
          <div className="bg-white/15 backdrop-blur-sm rounded-lg p-2 mb-3">
            <p className="text-[9px] text-white/70 mb-0.5">License Key</p>
            <code className="text-xs font-mono font-bold tracking-wider">{licenseInfo.key}</code>
          </div>

          {/* Countdown timer */}
          {licenseInfo.expiresAt && !countdown.expired ? (
            <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3">
              <p className="text-[10px] text-white/70 mb-2 text-center uppercase tracking-wider">⏳ Expires In</p>
              <div className="grid grid-cols-4 gap-2">
                <div className="text-center bg-white/15 rounded-lg p-1.5">
                  <p className="text-lg font-black tabular-nums">{countdown.days}</p>
                  <p className="text-[8px] text-white/70 uppercase">Days</p>
                </div>
                <div className="text-center bg-white/15 rounded-lg p-1.5">
                  <p className="text-lg font-black tabular-nums">{countdown.hours}</p>
                  <p className="text-[8px] text-white/70 uppercase">Hrs</p>
                </div>
                <div className="text-center bg-white/15 rounded-lg p-1.5">
                  <p className="text-lg font-black tabular-nums">{countdown.mins}</p>
                  <p className="text-[8px] text-white/70 uppercase">Min</p>
                </div>
                <div className="text-center bg-white/15 rounded-lg p-1.5">
                  <p className="text-lg font-black tabular-nums animate-pulse">{countdown.secs}</p>
                  <p className="text-[8px] text-white/70 uppercase">Sec</p>
                </div>
              </div>
            </div>
          ) : countdown.expired ? (
            <div className="bg-red-500/30 backdrop-blur-sm rounded-xl p-3 text-center">
              <p className="text-sm font-bold">⚠ License Expired</p>
              <p className="text-[10px] text-white/80 mt-1">Activate a new key to continue</p>
            </div>
          ) : (
            <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3 text-center">
              <p className="text-2xl font-black">♾️ Lifetime</p>
              <p className="text-[10px] text-white/80 mt-1">Never expires</p>
            </div>
          )}

          {/* Deactivate button */}
          <Button
            size="sm"
            variant="outline"
            className="w-full mt-3 bg-white/10 border-white/30 text-white hover:bg-white/20 h-8 text-xs"
            onClick={handleDeactivate}
          >
            <Trash2 className="w-3 h-3 mr-1" />
            Deactivate
          </Button>
        </div>
      ) : (
        // Activation form
        <div className="bg-white dark:bg-card rounded-2xl border border-violet-100 dark:border-violet-900/30 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-500" />
            <h3 className="font-bold text-sm text-foreground">Activate License Key</h3>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Enter your license key to unlock all features. Get keys from admin via WhatsApp.
          </p>
          <Input
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value.toUpperCase())}
            placeholder="CRICB-XXXX-XXXX-XXXX"
            className="bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800 h-11 text-sm font-mono font-bold tracking-wider"
          />
          <Button
            className="w-full h-11 brand-gradient text-white font-bold text-sm"
            onClick={handleActivate}
            disabled={verifying}
          >
            {verifying ? (
              <>
                <div className="w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Activating...
              </>
            ) : (
              <>
                <Shield className="w-4 h-4 mr-2" />
                Activate License
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ============== User Profile Header (replaces Guest banner) ============== */

function UserProfileHeader() {
  const [userRecord, setUserRecord] = useState<{
    mobile: string;
    referralCode: string;
    plan: string;
    referralCount: number;
    rewardsEarned: number;
  } | null>(null);
  const [licenseTier, setLicenseTier] = useState<string | null>(null);

  useEffect(() => {
    // Load user record from localStorage
    import("@/lib/user-auth").then(({ getCurrentUser }) => {
      const user = getCurrentUser();
      if (user) {
        setUserRecord({
          mobile: user.mobile,
          referralCode: user.referralCode,
          plan: user.plan,
          referralCount: user.referralCount || 0,
          rewardsEarned: user.rewardsEarned || 0,
        });
      }
    });

    // Load license tier
    import("@/lib/admin-store").then(({ getLicenseState }) => {
      const state = getLicenseState();
      if (state.keyType) {
        setLicenseTier(state.keyType);
      }
    });
  }, []);

  // Tier info for display
  const tierInfo: Record<string, { label: string; emoji: string; color: string }> = {
    trial: { label: "Trial", emoji: "🆓", color: "from-emerald-500 to-green-600" },
    match_basic: { label: "1 Match", emoji: "🏏", color: "from-amber-500 to-orange-600" },
    match_full: { label: "24 Hour", emoji: "⏰", color: "from-rose-500 to-pink-600" },
    weekly: { label: "Weekly", emoji: "📅", color: "from-sky-500 to-blue-600" },
    monthly: { label: "Pro", emoji: "💎", color: "from-sky-500 to-blue-600" },
    elite: { label: "Elite", emoji: "👑", color: "from-violet-500 to-purple-600" },
    lifetime: { label: "Lifetime", emoji: "♾️", color: "from-amber-500 to-yellow-600" },
  };

  const tier = licenseTier ? tierInfo[licenseTier] : null;

  return (
    <div className={cn(
      "rounded-3xl p-5 text-white shadow-lg relative overflow-hidden bg-gradient-to-br",
      tier?.color || "from-violet-600 to-fuchsia-600"
    )}>
      <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full" />
      <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-white/5 rounded-full" />

      <div className="relative flex items-center gap-3">
        {/* Avatar */}
        <div className="w-16 h-16 rounded-full bg-white/25 backdrop-blur-sm flex items-center justify-center text-3xl">
          {tier?.emoji || "👤"}
        </div>

        <div className="flex-1 min-w-0">
          {userRecord ? (
            <>
              {/* Logged-in user details */}
              <p className="text-base font-bold truncate">
                +91 {userRecord.mobile}
              </p>
              <p className="text-xs text-white/80 truncate">
                Code: {userRecord.referralCode}
              </p>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[10px] bg-white/20 backdrop-blur-sm px-2 py-0.5 rounded-full">
                  <Crown className="w-2.5 h-2.5" />
                  {tier?.label || "Free"} Plan
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] bg-white/20 backdrop-blur-sm px-2 py-0.5 rounded-full">
                  <Users className="w-2.5 h-2.5" />
                  {userRecord.referralCount} Referrals
                </span>
              </div>
            </>
          ) : (
            <>
              {/* Not logged in — show login prompt */}
              <p className="text-base font-bold truncate">
                Welcome to Apna Cricket
              </p>
              <p className="text-xs text-white/80 truncate">
                Login to unlock all features
              </p>
              <div className="mt-1 inline-flex items-center gap-1 text-[10px] bg-white/20 backdrop-blur-sm px-2 py-0.5 rounded-full">
                <Crown className="w-2.5 h-2.5" />
                Guest Mode
              </div>
            </>
          )}
        </div>
      </div>

      {/* User stats row — only if logged in */}
      {userRecord && (
        <div className="relative mt-3 grid grid-cols-3 gap-2">
          <div className="bg-white/15 backdrop-blur-sm rounded-lg p-2 text-center">
            <p className="text-sm font-black">{userRecord.referralCount}</p>
            <p className="text-[8px] text-white/70 uppercase">Referrals</p>
          </div>
          <div className="bg-white/15 backdrop-blur-sm rounded-lg p-2 text-center">
            <p className="text-sm font-black">{userRecord.rewardsEarned}</p>
            <p className="text-[8px] text-white/70 uppercase">Days Earned</p>
          </div>
          <div className="bg-white/15 backdrop-blur-sm rounded-lg p-2 text-center">
            <p className="text-sm font-black">{tier?.label || "Free"}</p>
            <p className="text-[8px] text-white/70 uppercase">Plan</p>
          </div>
        </div>
      )}
    </div>
  );
}
