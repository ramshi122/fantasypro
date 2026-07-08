"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Ban,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  CreditCard,
  Crown,
  Delete,
  Download,
  Eye,
  EyeOff,
  Key,
  Loader2,
  Lock,
  LogOut,
  Power,
  Plus,
  RefreshCw,
  Send,
  Settings,
  Shield,
  ShieldCheck,
  Smartphone,
  Trash2,
  Trophy,
  Unlock,
  User,
  Users,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useAdmin, type KeyType, type KeyStatus } from "@/lib/admin-store";
import { ErrorBoundary } from "@/components/error-boundary";
import { cn } from "@/lib/utils";

type Tab = "dashboard" | "licenses" | "devices" | "team-control" | "contests" | "payments" | "matches" | "subscriptions" | "users" | "announcements" | "logs" | "settings";

interface AdminPanelProps {
  open: boolean;
  onClose: () => void;
}

export function AdminPanel({ open, onClose }: AdminPanelProps) {
  const admin = useAdmin();
  const [tab, setTab] = useState<Tab>("dashboard");

  // Login gate
  if (!admin.isAdminAuthenticated) {
    return <AdminLoginModal open={open} onClose={onClose} />;
  }

  if (!open) return null;

  const tabs: Array<{ id: Tab; label: string; icon: typeof Key }> = [
    { id: "dashboard", label: "Dashboard", icon: Activity },
    { id: "licenses", label: "Licenses", icon: Key },
    { id: "devices", label: "Devices", icon: Smartphone },
    { id: "team-control", label: "Generator", icon: Zap },
    { id: "contests", label: "Contests", icon: Trophy },
    { id: "payments", label: "Payments", icon: CreditCard },
    { id: "matches", label: "Matches", icon: Activity },
    { id: "subscriptions", label: "Subs", icon: Crown },
    { id: "users", label: "Users", icon: Users },
    { id: "announcements", label: "Announce", icon: Bell },
    { id: "logs", label: "Logs", icon: Activity },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="bg-slate-900 dark:bg-slate-950 w-full max-w-5xl h-[92vh] rounded-2xl border border-violet-800/40 shadow-2xl flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-violet-900 via-purple-900 to-fuchsia-900 text-white p-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-black text-base flex items-center gap-2">
                    APNA CRICKET ADMIN
                    <span className="text-[9px] bg-emerald-500 px-1.5 py-0.5 rounded-full font-bold">LIVE</span>
                  </h2>
                  <p className="text-[10px] text-white/70">Hidden admin mode · {admin.adminUsername}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-white hover:bg-white/20 h-8 text-xs"
                  onClick={() => {
                    admin.logout();
                    onClose();
                    toast.success("Admin logged out");
                  }}
                >
                  <LogOut className="w-3.5 h-3.5 mr-1" />
                  Logout
                </Button>
                <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/20">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Tab bar */}
            <div className="bg-slate-800/80 border-b border-slate-700 px-2 flex gap-1 overflow-x-auto no-scrollbar">
              {tabs.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-colors",
                      tab === t.id
                        ? "border-violet-500 text-white bg-slate-800"
                        : "border-transparent text-slate-400 hover:text-white hover:bg-slate-800/50"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto scrollbar-thin p-4 bg-slate-900">
              <ErrorBoundary fallback={<div className="p-4 text-center text-red-400 text-xs">Error loading this tab. Try another tab.</div>}>
              {tab === "dashboard" && <DashboardTab />}
              {tab === "licenses" && <LicensesTab />}
              {tab === "devices" && <DevicesTab />}
              {tab === "team-control" && <TeamControlTab />}
              {tab === "contests" && <ContestsTab />}
              {tab === "payments" && <PaymentsTab />}
              {tab === "matches" && <MatchesTab />}
              {tab === "subscriptions" && <SubscriptionsTab />}
              {tab === "users" && <UsersTab />}
              {tab === "announcements" && <AnnouncementsTab />}
              {tab === "logs" && <LogsTab />}
              {tab === "settings" && <SettingsTab />}
              </ErrorBoundary>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------- Login Modal ---------- */

function AdminLoginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const admin = useAdmin();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  function handleLogin() {
    if (!password.trim()) {
      toast.error("Enter password");
      return;
    }
    setLoading(true);
    setTimeout(() => {
      const ok = admin.login("", password);
      setLoading(false);
      if (ok) {
        toast.success("Admin login successful");
      } else {
        toast.error("Invalid password");
      }
    }, 400);
  }

  return (
    <AnimatePresence>
      {open && (
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
            className="bg-slate-900 w-full max-w-sm rounded-2xl border border-violet-800/40 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-br from-violet-900 via-purple-900 to-fuchsia-900 text-white p-5 text-center relative overflow-hidden">
              <div className="absolute -top-8 -right-8 w-32 h-32 bg-white/10 rounded-full" />
              <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-white/5 rounded-full" />
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200 }}
                className="w-14 h-14 mx-auto rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center mb-2"
              >
                <Shield className="w-7 h-7" />
              </motion.div>
              <h2 className="font-black text-lg">APNA CRICKET ADMIN</h2>
              <p className="text-[11px] text-white/70 mt-0.5">Restricted access · Password protected</p>
            </div>

            {/* Form — password only */}
            <div className="p-5 space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-300 mb-1 block">ADMIN PASSWORD</label>
                <div className="relative">
                  <Input
                    type={show ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-12 text-base pr-10"
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    autoFocus
                  />
                  <button
                    onClick={() => setShow((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
                  >
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button
                onClick={handleLogin}
                disabled={loading}
                className="w-full h-11 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white font-bold text-base"
              >
                {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
                {loading ? "Authenticating..." : "Login"}
              </Button>
              <Button variant="ghost" size="sm" className="w-full text-slate-400" onClick={onClose}>
                Close
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------- Dashboard Tab ---------- */

function DashboardTab() {
  // Select raw data and compute stats in useMemo to avoid infinite loop
  const keys = useAdmin((s) => s.keys);
  const devices = useAdmin((s) => s.devices);
  const users = useAdmin((s) => s.users);
  const logs = useAdmin((s) => s.logs);

  const stats = (() => {
    const now = Date.now();
    const todayStart = new Date().setHours(0, 0, 0, 0);
    return {
      totalKeys: keys.length,
      activeKeys: keys.filter((k) => k.status === "active" && (!k.expiresAt || k.expiresAt > now)).length,
      usedKeys: keys.filter((k) => k.status === "used").length,
      expiredKeys: keys.filter((k) => k.status === "expired" || (k.expiresAt && k.expiresAt < now)).length,
      activeDevices: devices.filter((d) => d.status === "allowed").length,
      todayVerifications: logs.filter((l) => l.type === "key_verification" && l.timestamp >= todayStart).length,
      totalUsers: users.length,
      teamsGeneratedToday: logs.filter((l) => l.type === "team_generation" && l.timestamp >= todayStart).length,
    };
  })();

  const cards = [
    { label: "Total Keys", value: stats.totalKeys, icon: Key, color: "from-violet-500 to-purple-600" },
    { label: "Active Keys", value: stats.activeKeys, icon: ShieldCheck, color: "from-emerald-500 to-green-600" },
    { label: "Used Keys", value: stats.usedKeys, icon: Check, color: "from-sky-500 to-blue-600" },
    { label: "Expired Keys", value: stats.expiredKeys, icon: AlertTriangle, color: "from-amber-500 to-orange-600" },
    { label: "Active Devices", value: stats.activeDevices, icon: Smartphone, color: "from-pink-500 to-rose-600" },
    { label: "Today Verifications", value: stats.todayVerifications, icon: Activity, color: "from-cyan-500 to-teal-600" },
    { label: "Total Users", value: stats.totalUsers, icon: Users, color: "from-indigo-500 to-violet-600" },
    { label: "Teams Today", value: stats.teamsGeneratedToday, icon: Zap, color: "from-fuchsia-500 to-pink-600" },
  ];
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-white">Dashboard Overview</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="bg-slate-800 rounded-xl p-3 border border-slate-700">
              <div className={cn("w-8 h-8 rounded-lg bg-gradient-to-br flex items-center justify-center mb-2", c.color)}>
                <Icon className="w-4 h-4 text-white" />
              </div>
              <p className="text-2xl font-black text-white">{c.value}</p>
              <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide">{c.label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Licenses Tab ---------- */

function LicensesTab() {
  const admin = useAdmin();
  const [search, setSearch] = useState("");
  const [bulkCount, setBulkCount] = useState(10);
  const [bulkType, setBulkType] = useState<KeyType>("weekly");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const filtered = admin.keys.filter(
    (k) =>
      k.key.toLowerCase().includes(search.toLowerCase()) ||
      k.userName?.toLowerCase().includes(search.toLowerCase())
  );

  const keyTypes: KeyType[] = ["trial", "match_basic", "match_full", "weekly", "monthly", "elite", "lifetime"];
  const statusColors: Record<KeyStatus, string> = {
    active: "bg-emerald-500",
    used: "bg-sky-500",
    expired: "bg-amber-500",
    suspended: "bg-red-500",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-bold text-white">License Management</h3>
        <div className="flex gap-2 flex-wrap">
          <select
            value={bulkType}
            onChange={(e) => setBulkType(e.target.value as KeyType)}
            className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2 h-8"
          >
            {keyTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            value={bulkCount}
            onChange={(e) => setBulkCount(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2 h-8"
          >
            <option value={1}>Single</option>
            <option value={10}>10 Keys</option>
            <option value={50}>50 Keys</option>
            <option value={100}>100 Keys</option>
            <option value={500}>500 Keys</option>
          </select>
          <Button
            size="sm"
            className="bg-violet-600 hover:bg-violet-700 text-white h-8 text-xs"
            onClick={() => {
              if (bulkCount === 1) {
                const k = admin.generateKey(bulkType);
                toast.success(`Generated: ${k}`);
              } else {
                const keys = admin.generateBulkKeys(bulkCount, bulkType);
                toast.success(`Generated ${keys.length} keys`);
              }
            }}
          >
            <Key className="w-3 h-3 mr-1" />
            Generate
          </Button>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs"
            onClick={() => {
              const fixed = admin.validateAllKeys();
              if (fixed > 0) {
                toast.success(`✅ Validated all keys — ${fixed} key(s) fixed (expired/suspended re-activated, expiry extended)`);
              } else {
                toast.success(`✅ All ${admin.keys.length} keys are already valid`);
              }
            }}
            title="Re-activate any expired/suspended keys and extend past-expiry dates"
          >
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Validate All
          </Button>
          <Button
            size="sm"
            className="bg-sky-600 hover:bg-sky-700 text-white h-8 text-xs"
            onClick={async () => {
              toast.info("Syncing keys to Firebase...");
              try {
                const { initFirebase, bulkSyncKeysToFirestore } = await import("@/lib/firebase-license");
                initFirebase(admin.settings.firebaseConfig);
                const res = await bulkSyncKeysToFirestore(admin.keys);
                if (res.synced > 0) {
                  toast.success(`✅ Synced ${res.synced}/${admin.keys.length} keys to Firebase`);
                } else {
                  toast.error("❌ Firebase not configured — add config in Settings tab");
                }
              } catch (err: any) {
                toast.error(err?.message || "Sync failed");
              }
            }}
            title="Upload all local keys to Firebase Firestore"
          >
            <ShieldCheck className="w-3 h-3 mr-1" />
            Sync Firebase
          </Button>
          <Button
            size="sm"
            className="bg-red-600 hover:bg-red-700 text-white h-8 text-xs"
            onClick={async () => {
              if (!confirm("Suspend ALL active keys in Firebase? Users will be locked out immediately.")) return;
              toast.info("Suspending all keys in Firebase...");
              try {
                const { initFirebase, suspendAllKeysInFirestore } = await import("@/lib/firebase-license");
                initFirebase(admin.settings.firebaseConfig);
                const res = await suspendAllKeysInFirestore();
                if (res.suspended > 0) {
                  toast.success(`🚫 Suspended ${res.suspended} keys in Firebase`);
                } else {
                  toast.error("❌ No keys suspended — Firebase not configured or no active keys");
                }
              } catch (err: any) {
                toast.error(err?.message || "Suspend failed");
              }
            }}
            title="Suspend ALL active keys in Firebase (emergency)"
          >
            <Ban className="w-3 h-3 mr-1" />
            Ban All
          </Button>
        </div>

        {/* Firebase status indicator */}
        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <span className={cn(
            "w-2 h-2 rounded-full",
            admin.settings.firebaseConfig ? "bg-emerald-500" : "bg-slate-600"
          )} />
          {admin.settings.firebaseConfig
            ? "Firebase configured — keys sync on generate"
            : "Firebase NOT configured — keys saved locally only. Add config in Settings."}
        </div>
      </div>

      {/* Search */}
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by key or user..."
        className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-9 text-sm"
      />

      {/* Keys list */}
      <div className="space-y-2 max-h-[60vh] overflow-y-auto scrollbar-thin">
        {filtered.length === 0 ? (
          <p className="text-center text-slate-500 py-8 text-sm">No keys found</p>
        ) : (
          filtered.map((k) => (
            <div key={k.key} className="bg-slate-800 rounded-xl p-3 border border-slate-700">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-xs font-mono text-violet-300 font-bold">{k.key}</code>
                    <span className={cn("text-[8px] font-bold text-white px-1.5 py-0.5 rounded-full uppercase", statusColors[k.status])}>
                      {k.status}
                    </span>
                    <span className="text-[8px] font-bold text-slate-400 bg-slate-700 px-1.5 py-0.5 rounded-full uppercase">
                      {k.type}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {k.userName ? `User: ${k.userName} · ` : ""}
                    Devices: {k.deviceIds.length} · Verifications: {k.verifications}
                    {k.expiresAt && ` · Expires: ${new Date(k.expiresAt).toLocaleDateString()}`}
                  </p>
                </div>
                <div className="flex gap-1">
                  <ActionBtn label="Copy" icon={Copy} onClick={() => { navigator.clipboard.writeText(k.key); toast.success("Key copied"); }} />
                  {k.status === "suspended" ? (
                    <ActionBtn label="Activate" icon={Unlock} onClick={() => admin.activateKey(k.key)} color="emerald" />
                  ) : (
                    <ActionBtn label="Suspend" icon={Ban} onClick={() => admin.suspendKey(k.key)} color="amber" />
                  )}
                  <ActionBtn label="Extend" icon={Power} onClick={() => { admin.extendExpiry(k.key, 7); toast.success("Extended 7 days"); }} color="sky" />
                  <ActionBtn label="Reset" icon={Smartphone} onClick={() => admin.resetDevice(k.key)} color="violet" />
                  <ActionBtn label="Delete" icon={Trash2} onClick={() => admin.deleteKey(k.key)} color="red" />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ActionBtn({
  label,
  icon: Icon,
  onClick,
  color = "slate",
}: {
  label: string;
  icon: typeof Key;
  onClick: () => void;
  color?: "slate" | "emerald" | "amber" | "sky" | "violet" | "red";
}) {
  const colors = {
    slate: "bg-slate-700 hover:bg-slate-600 text-slate-200",
    emerald: "bg-emerald-600 hover:bg-emerald-700 text-white",
    amber: "bg-amber-600 hover:bg-amber-700 text-white",
    sky: "bg-sky-600 hover:bg-sky-700 text-white",
    violet: "bg-violet-600 hover:bg-violet-700 text-white",
    red: "bg-red-600 hover:bg-red-700 text-white",
  };
  return (
    <button
      onClick={onClick}
      className={cn("px-2 h-7 rounded-md text-[10px] font-bold flex items-center gap-1 transition-colors", colors[color])}
      title={label}
    >
      <Icon className="w-2.5 h-2.5" />
      {label}
    </button>
  );
}

/* ---------- Devices Tab ---------- */

function DevicesTab() {
  const admin = useAdmin();
  const [search, setSearch] = useState("");
  const filtered = admin.devices.filter(
    (d) =>
      d.deviceId.toLowerCase().includes(search.toLowerCase()) ||
      d.userName?.toLowerCase().includes(search.toLowerCase()) ||
      d.licenseKey?.toLowerCase().includes(search.toLowerCase())
  );
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-white">Device Binding Manager</h3>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by device ID, user, or license..."
        className="bg-slate-800 border-slate-700 text-white h-9 text-sm"
      />
      <div className="space-y-2 max-h-[60vh] overflow-y-auto scrollbar-thin">
        {filtered.map((d) => (
          <div key={d.deviceId} className="bg-slate-800 rounded-xl p-3 border border-slate-700">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono text-violet-300">{d.deviceId}</code>
                  <span className={cn("text-[8px] font-bold text-white px-1.5 py-0.5 rounded-full uppercase", d.status === "banned" ? "bg-red-500" : "bg-emerald-500")}>
                    {d.status}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  {d.userName ? `User: ${d.userName} · ` : ""}
                  {d.licenseKey ? `License: ${d.licenseKey} · ` : ""}
                  Last: {d.lastLogin ? new Date(d.lastLogin).toLocaleString() : "Never"}
                </p>
              </div>
              <div className="flex gap-1">
                <ActionBtn label="Unbind" icon={Delete} onClick={() => admin.unbindDevice(d.deviceId)} color="amber" />
                <ActionBtn label="Logout" icon={LogOut} onClick={() => admin.forceLogout(d.deviceId)} color="sky" />
                {d.status === "banned" ? (
                  <ActionBtn label="Allow" icon={Unlock} onClick={() => admin.allowDevice(d.deviceId)} color="emerald" />
                ) : (
                  <ActionBtn label="Ban" icon={Ban} onClick={() => admin.banDevice(d.deviceId)} color="red" />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Team Control Tab ---------- */

function TeamControlTab() {
  const admin = useAdmin();
  const features: Array<{ key: keyof typeof admin.settings.teamGenerator; label: string }> = [
    { key: "enabled", label: "Team Generator" },
    { key: "autoTeamGenerator", label: "Auto Team Generator" },
    { key: "glGenerator", label: "GL Generator" },
    { key: "groupCombination", label: "Group Combination" },
    { key: "cheatSheet", label: "Cheat Sheet" },
    { key: "dtAnalysis", label: "DT Analysis" },
    { key: "transferTeam", label: "Transfer Team" },
    { key: "autoPick", label: "Auto Pick" },
  ];
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-white">Team Generator Control</h3>

      {/* Emergency disable */}
      <div className="bg-red-950/40 border border-red-800 rounded-xl p-3">
        <p className="text-xs font-bold text-red-300 mb-2">Emergency Control</p>
        <Button
          size="sm"
          className="bg-red-600 hover:bg-red-700 text-white h-8 text-xs"
          onClick={() => {
            const features = admin.settings.teamGenerator;
            const allOn = Object.values(features).every(Boolean);
            if (allOn) {
              (Object.keys(features) as Array<keyof typeof features>).forEach((k) => {
                if (!features[k]) admin.toggleFeature(k);
                else admin.toggleFeature(k);
              });
              toast.success("All features disabled");
            } else {
              (Object.keys(features) as Array<keyof typeof features>).forEach((k) => {
                if (!features[k]) admin.toggleFeature(k);
              });
              toast.success("All features enabled");
            }
          }}
        >
          <Power className="w-3 h-3 mr-1" />
          Disable Entire Team Generator
        </Button>
      </div>

      {/* Master switches */}
      <div className="space-y-2">
        {features.map((f) => {
          const enabled = admin.settings.teamGenerator[f.key];
          return (
            <label key={f.key} className="flex items-center justify-between bg-slate-800 rounded-xl p-3 border border-slate-700 cursor-pointer">
              <div className="flex items-center gap-2">
                <Zap className={cn("w-4 h-4", enabled ? "text-emerald-400" : "text-slate-500")} />
                <span className="text-xs font-semibold text-white">Enable {f.label}</span>
              </div>
              <button
                onClick={() => admin.toggleFeature(f.key)}
                className={cn(
                  "w-10 h-5 rounded-full transition-colors relative",
                  enabled ? "bg-emerald-500" : "bg-slate-600"
                )}
              >
                <div className={cn("absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform", enabled ? "translate-x-5" : "translate-x-0.5")} />
              </button>
            </label>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Users Tab ---------- */

function UsersTab() {
  const admin = useAdmin();
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-white">User Management</h3>
      <div className="space-y-2 max-h-[65vh] overflow-y-auto scrollbar-thin">
        {admin.users.map((u) => (
          <div key={u.id} className="bg-slate-800 rounded-xl p-3 border border-slate-700">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">{u.name}</span>
                  {u.banned && (
                    <span className="text-[8px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded-full">BANNED</span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Device: {u.device || "—"} · License: {u.license || "—"} · Last: {new Date(u.lastActive).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-1">
                {u.banned ? (
                  <ActionBtn label="Unban" icon={Unlock} onClick={() => admin.unbanUser(u.id)} color="emerald" />
                ) : (
                  <ActionBtn label="Ban" icon={Ban} onClick={() => admin.banUser(u.id)} color="red" />
                )}
                <ActionBtn label="Reset" icon={Key} onClick={() => admin.resetUserLicense(u.id)} color="amber" />
                <ActionBtn label="Delete" icon={Trash2} onClick={() => admin.deleteUser(u.id)} color="red" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Announcements Tab ---------- */

function AnnouncementsTab() {
  const admin = useAdmin();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [target, setTarget] = useState<"all" | "premium" | "selected">("all");

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-white">Announcement Panel</h3>
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 space-y-3">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Announcement title (e.g. Server Maintenance)"
          className="bg-slate-900 border-slate-700 text-white h-9 text-sm"
        />
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Message..."
          className="w-full min-h-[80px] bg-slate-900 border border-slate-700 text-white rounded-lg p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
        <div className="flex gap-2">
          {(["all", "premium", "selected"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTarget(t)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-bold capitalize",
                target === t ? "bg-violet-600 text-white" : "bg-slate-700 text-slate-300"
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <Button
          className="w-full bg-violet-600 hover:bg-violet-700 text-white h-10"
          onClick={() => {
            if (!title.trim() || !message.trim()) {
              toast.error("Enter title and message");
              return;
            }
            admin.sendAnnouncement(title, message, target);
            toast.success(`Announcement sent to ${target} users`);
            setTitle("");
            setMessage("");
          }}
        >
          <Send className="w-4 h-4 mr-2" />
          Send Announcement
        </Button>
      </div>

      {/* History */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-slate-400">Sent Announcements</p>
        {admin.announcements.length === 0 ? (
          <p className="text-center text-slate-500 py-4 text-sm">No announcements sent</p>
        ) : (
          admin.announcements.map((a) => (
            <div key={a.id} className="bg-slate-800 rounded-xl p-3 border border-slate-700">
              <div className="flex items-center gap-2 mb-1">
                <Bell className="w-3.5 h-3.5 text-violet-400" />
                <p className="text-xs font-bold text-white">{a.title}</p>
                <span className="text-[8px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded-full uppercase">{a.target}</span>
              </div>
              <p className="text-[11px] text-slate-400">{a.message}</p>
              <p className="text-[9px] text-slate-600 mt-1">{new Date(a.createdAt).toLocaleString()}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ---------- Logs Tab ---------- */

function LogsTab() {
  const admin = useAdmin();
  const [filter, setFilter] = useState<"today" | "7days" | "30days">("today");
  const now = Date.now();
  const cutoff = filter === "today" ? new Date().setHours(0, 0, 0, 0) : now - (filter === "7days" ? 7 : 30) * 86400000;
  const logs = admin.logs.filter((l) => l.timestamp >= cutoff);

  const typeColors: Record<string, string> = {
    key_verification: "bg-emerald-500",
    login_attempt: "bg-sky-500",
    team_generation: "bg-violet-500",
    device_binding: "bg-amber-500",
    admin_action: "bg-fuchsia-500",
    error: "bg-red-500",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">Live Activity Logs</h3>
        <div className="flex gap-1">
          {(["today", "7days", "30days"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn("px-2 py-1 rounded-md text-[10px] font-bold", filter === f ? "bg-violet-600 text-white" : "bg-slate-800 text-slate-400")}
            >
              {f === "today" ? "Today" : f === "7days" ? "7 Days" : "30 Days"}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5 max-h-[65vh] overflow-y-auto scrollbar-thin">
        {logs.length === 0 ? (
          <p className="text-center text-slate-500 py-8 text-sm">No logs in this period</p>
        ) : (
          logs.map((l) => (
            <div key={l.id} className="bg-slate-800 rounded-lg p-2.5 border border-slate-700 flex items-start gap-2">
              <span className={cn("w-2 h-2 rounded-full mt-1.5 flex-shrink-0", typeColors[l.type] || "bg-slate-500")} />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-white">{l.message}</p>
                <p className="text-[9px] text-slate-500 mt-0.5">
                  {new Date(l.timestamp).toLocaleString()} · {l.type.replace(/_/g, " ")}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
      <Button variant="outline" size="sm" className="text-slate-400" onClick={() => { admin.clearLogs(); toast.success("Logs cleared"); }}>
        <Trash2 className="w-3 h-3 mr-1" />
        Clear All Logs
      </Button>
    </div>
  );
}

/* ---------- Settings Tab ---------- */

function SettingsTab() {
  const admin = useAdmin();
  const [newPassword, setNewPassword] = useState("");
  const [apiUrl, setApiUrl] = useState(admin.settings.apiUrl);
  const [firebase, setFirebase] = useState(admin.settings.firebaseConfig);
  const [prefix, setPrefix] = useState(admin.settings.licensePrefix);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-white">Admin Settings</h3>

      {/* Change password */}
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 space-y-2">
        <p className="text-xs font-bold text-white">Change Admin Password</p>
        <Input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="New password"
          className="bg-slate-900 border-slate-700 text-white h-9 text-sm"
        />
        <Button
          size="sm"
          className="bg-violet-600 hover:bg-violet-700 text-white h-8 text-xs"
          onClick={() => {
            if (!newPassword.trim()) { toast.error("Enter new password"); return; }
            admin.changePassword(newPassword);
            setNewPassword("");
            toast.success("Password changed");
          }}
        >
          <Lock className="w-3 h-3 mr-1" />
          Update Password
        </Button>
      </div>

      {/* API URL — hidden from UI (like original teamgeneration.in) */}
      <input type="hidden" value={apiUrl} readOnly />

      {/* Firebase Config — hidden from UI, hardcoded internally */}
      <input type="hidden" value={firebase} readOnly />

      {/* License prefix */}
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 space-y-2">
        <p className="text-xs font-bold text-white">License Prefix</p>
        <Input
          value={prefix}
          onChange={(e) => setPrefix(e.target.value.toUpperCase())}
          placeholder="CRICB"
          className="bg-slate-900 border-slate-700 text-white h-9 text-sm font-mono uppercase"
        />
        <p className="text-[10px] text-slate-500">Current prefix: <span className="font-mono text-violet-300">{admin.settings.licensePrefix}</span></p>
      </div>

      <Button
        className="w-full bg-violet-600 hover:bg-violet-700 text-white h-10"
        onClick={() => {
          admin.updateSettings({ apiUrl, firebaseConfig: firebase, licensePrefix: prefix || "CRICB" });
          toast.success("Settings saved");
        }}
      >
        <Check className="w-4 h-4 mr-2" />
        Save All Settings
      </Button>
    </div>
  );
}

/* ============== CONTESTS TAB ============== */

type FantasyAppSlug = "dream11" | "my11circle";

interface FreeContest {
  contestId: string;
  contestName?: string;
  totalPrizeAmount?: number;
  prizeDisplayText?: string;
  maxAllowedTeams?: number;
  maxJoinTeamCount?: number;
  joinedTeamIds?: number[];
  joinedCount?: number;
  availableSlots?: number;
  notJoinedTeamIds?: number[];
  canJoinMore?: boolean;
  [k: string]: unknown;
}

interface MyTeam {
  teamId: string;
  teamNo: number | null;
  fantasyApp: string;
}

interface JoinResult {
  status: string;
  message: string;
  contestId: string;
  joinResults: Array<{ teamId: number; success: boolean; error?: string; message?: string }>;
  summary: {
    successCount: number;
    failedCount: number;
    totalCount?: number;
    batches?: number;
    batchSize?: number;
    shuffled?: boolean;
  };
  needsReauth?: boolean;
}

function ContestsTab() {
  const [selectedApp, setSelectedApp] = useState<FantasyAppSlug>("my11circle");
  const [jwtToken, setJwtToken] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [matchId, setMatchId] = useState("");
  const [contestId, setContestId] = useState("");
  const [teamIds, setTeamIds] = useState("");
  const [loading, setLoading] = useState(false);
  const [freeContests, setFreeContests] = useState<FreeContest[]>([]);
  const [myTeams, setMyTeams] = useState<MyTeam[]>([]);
  const [joinResult, setJoinResult] = useState<JoinResult | null>(null);

  // Load JWT from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const t = localStorage.getItem("user_token") || "";
      setJwtToken(t);
    }
  }, []);

  function handleSaveJwt() {
    if (typeof window !== "undefined") {
      if (jwtToken.trim()) {
        localStorage.setItem("user_token", jwtToken.trim());
        toast.success("JWT token saved");
      } else {
        localStorage.removeItem("user_token");
        toast.info("JWT token cleared");
      }
    }
  }

  // Fetch user's already-created teams for this match
  async function handleFetchMyTeams() {
    if (!authToken.trim() || !matchId.trim()) {
      toast.error("Auth token and Match ID required");
      return;
    }
    setLoading(true);
    setMyTeams([]);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (jwtToken.trim()) headers.Authorization = `Bearer ${jwtToken.trim()}`;

      const res = await fetch(`/api/contest/my-teams`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          fantasyApp: selectedApp,
          authToken: authToken.trim(),
          matchId: matchId.trim(),
        }),
      });
      const data = await res.json();
      if (data.status === "success" && Array.isArray(data.teams)) {
        setMyTeams(data.teams);
        // Auto-fill the Team IDs field with all team IDs
        const ids = data.teams.map((t: MyTeam) => t.teamId).filter(Boolean);
        if (ids.length > 0) {
          setTeamIds(ids.join(","));
          toast.success(`Found ${ids.length} teams — auto-filled Team IDs`);
        } else {
          toast.info("No teams found for this match");
        }
      } else {
        toast.error(data.message || "Failed to fetch teams");
      }
    } catch (err: any) {
      toast.error(err?.message || "Network error");
    } finally {
      setLoading(false);
    }
  }

  // Fetch free contests
  async function handleFetchContests() {
    if (!authToken.trim() || !matchId.trim()) {
      toast.error("Auth token and Match ID required");
      return;
    }
    setLoading(true);
    setFreeContests([]);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (jwtToken.trim()) headers.Authorization = `Bearer ${jwtToken.trim()}`;

      const ids = teamIds.split(",").map(t => parseInt(t.trim())).filter(n => !isNaN(n));

      const res = await fetch(`/api/contest/free-status`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          fantasyApp: selectedApp,
          authToken: authToken.trim(),
          matchId: matchId.trim(),
          allTeamIds: ids,
        }),
      });
      const data = await res.json();
      if (data.status === "success" && Array.isArray(data.contests)) {
        setFreeContests(data.contests);
        toast.success(`Found ${data.contests.length} free contests`);
      } else {
        toast.error(data.message || "Failed to fetch contests");
      }
    } catch (err: any) {
      toast.error(err?.message || "Network error");
    } finally {
      setLoading(false);
    }
  }

  // Join a contest — uses /api/contest/join which now batches + shuffles
  async function handleJoinContest(cid?: string) {
    const cId = cid || contestId.trim();
    if (!authToken.trim() || !matchId.trim() || !cId) {
      toast.error("Auth token, Match ID, Contest ID required");
      return;
    }
    const ids = teamIds.split(",").map(t => parseInt(t.trim())).filter(n => !isNaN(n));
    if (ids.length === 0) {
      toast.error("Team IDs required (comma-separated) — or click 'Fetch My Teams'");
      return;
    }
    setLoading(true);
    setJoinResult(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (jwtToken.trim()) headers.Authorization = `Bearer ${jwtToken.trim()}`;

      const res = await fetch(`/api/contest/join`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          fantasyApp: selectedApp,
          authToken: authToken.trim(),
          matchId: matchId.trim(),
          contestId: cId,
          teamIds: ids,
        }),
      });
      const data = await res.json();
      setJoinResult(data);
      if (data.status === "success" || data.status === "partial") {
        const s = data.summary || {};
        const batchesInfo = s.batches ? ` · ${s.batches} batches · shuffled` : "";
        if (data.status === "success") {
          toast.success(`✓ Joined ${s.successCount}/${s.totalCount || ids.length} teams${batchesInfo}`);
        } else {
          toast.warning(`⚠ Partial: ${s.successCount} joined, ${s.failedCount} failed${batchesInfo}`);
        }
      } else if (data.needsReauth) {
        toast.error("Session expired — re-link via OTP");
      } else {
        toast.error(data.message || "Failed to join contest");
      }
    } catch (err: any) {
      toast.error(err?.message || "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 text-slate-200">
      {/* JWT Token Section */}
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
          <Shield className="w-4 h-4 text-amber-400" />
          JWT Token (Admin Auth)
        </h3>
        <p className="text-[10px] text-slate-400 mb-2">
          Backend JWT token for admin API calls. Stored in localStorage as &quot;user_token&quot;.
        </p>
        <div className="flex gap-2">
          <Input
            value={jwtToken}
            onChange={(e) => setJwtToken(e.target.value)}
            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
            className="bg-slate-900 border-slate-700 text-white h-9 text-xs font-mono"
            type="password"
          />
          <Button
            size="sm"
            className="bg-amber-600 hover:bg-amber-700 text-white h-9 text-xs"
            onClick={handleSaveJwt}
          >
            Save
          </Button>
        </div>
        {jwtToken && (
          <p className="text-[9px] text-emerald-400 mt-1">✓ JWT token active</p>
        )}
      </div>

      {/* App Selector */}
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
        <h3 className="text-sm font-bold text-white mb-2">Select Platform</h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setSelectedApp("dream11")}
            className={cn(
              "h-10 rounded-xl text-xs font-bold transition-all border-2",
              selectedApp === "dream11"
                ? "bg-red-600 text-white border-transparent"
                : "bg-slate-900 border-slate-700 text-slate-300"
            )}
          >
            🏏 Dream11
          </button>
          <button
            onClick={() => setSelectedApp("my11circle")}
            className={cn(
              "h-10 rounded-xl text-xs font-bold transition-all border-2",
              selectedApp === "my11circle"
                ? "bg-sky-600 text-white border-transparent"
                : "bg-slate-900 border-slate-700 text-slate-300"
            )}
          >
            ⭕ My11Circle
          </button>
        </div>
      </div>

      {/* Contest Form */}
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 space-y-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Trophy className="w-4 h-4 text-violet-400" />
          Join Contest — {selectedApp === "dream11" ? "Dream11" : "My11Circle"}
        </h3>

        <div>
          <label className="text-[10px] text-slate-400 mb-1 block">Fantasy Auth Token (OTP-linked)</label>
          <Input
            value={authToken}
            onChange={(e) => setAuthToken(e.target.value)}
            placeholder="Token from OTP login..."
            className="bg-slate-900 border-slate-700 text-white h-9 text-xs font-mono"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-slate-400 mb-1 block">Match ID</label>
            <Input
              value={matchId}
              onChange={(e) => setMatchId(e.target.value)}
              placeholder="113526"
              className="bg-slate-900 border-slate-700 text-white h-9 text-xs"
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 mb-1 block">Contest ID</label>
            <Input
              value={contestId}
              onChange={(e) => setContestId(e.target.value)}
              placeholder="contest123"
              className="bg-slate-900 border-slate-700 text-white h-9 text-xs"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-[10px] text-slate-400">Team IDs (comma-separated)</label>
            <button
              onClick={handleFetchMyTeams}
              disabled={loading || !authToken.trim() || !matchId.trim()}
              className="text-[10px] text-sky-400 hover:text-sky-300 disabled:opacity-40 flex items-center gap-1 font-bold"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
              Fetch My Teams
            </button>
          </div>
          <Input
            value={teamIds}
            onChange={(e) => setTeamIds(e.target.value)}
            placeholder="1,2,3,4,5,...,40  (or click Fetch My Teams)"
            className="bg-slate-900 border-slate-700 text-white h-9 text-xs font-mono"
          />
          {myTeams.length > 0 && (
            <p className="text-[9px] text-emerald-400 mt-1">
              ✓ {myTeams.length} teams found · auto-filled
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            className="bg-violet-600 hover:bg-violet-700 text-white h-10 text-xs"
            onClick={handleFetchContests}
            disabled={loading}
          >
            {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Trophy className="w-3 h-3 mr-1" />}
            Fetch Free Contests
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white h-10 text-xs"
            onClick={() => handleJoinContest()}
            disabled={loading}
          >
            {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Send className="w-3 h-3 mr-1" />}
            Join All Teams
          </Button>
        </div>

        {/* Random Mixed Auto Join — fetch + shuffle + join all in one click */}
        <Button
          className="w-full bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-700 hover:to-yellow-700 text-white h-11 text-xs font-bold"
          onClick={async () => {
            if (!authToken.trim() || !matchId.trim() || !contestId.trim()) {
              toast.error("Auth token, Match ID, Contest ID required");
              return;
            }
            setLoading(true);
            toast.info("Fetching all teams + shuffling + joining...");
            try {
              const headers: Record<string, string> = { "Content-Type": "application/json" };
              if (jwtToken.trim()) headers.Authorization = `Bearer ${jwtToken.trim()}`;

              // 1. Fetch all teams
              const teamsRes = await fetch(`/api/contest/my-teams`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                  fantasyApp: selectedApp,
                  authToken: authToken.trim(),
                  matchId: matchId.trim(),
                }),
              });
              const teamsData = await teamsRes.json();
              if (teamsData.status !== "success" || !teamsData.teams?.length) {
                toast.error("No teams found — create teams first");
                setLoading(false);
                return;
              }

              const allIds = teamsData.teams.map((t: any) => parseInt(t.teamId)).filter((n: number) => !isNaN(n));
              if (allIds.length === 0) {
                toast.error("No valid team IDs found");
                setLoading(false);
                return;
              }

              toast.info(`Found ${allIds.length} teams — shuffling randomly...`);

              // 2. Shuffle randomly (Fisher-Yates)
              const shuffled = [...allIds];
              for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
              }

              // 3. Join all shuffled teams to contest
              const joinRes = await fetch(`/api/contest/join`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                  fantasyApp: selectedApp,
                  authToken: authToken.trim(),
                  matchId: matchId.trim(),
                  contestId: contestId.trim(),
                  teamIds: shuffled,
                }),
              });
              const joinData = await joinRes.json();
              setJoinResult(joinData);

              if (joinData.status === "success" || joinData.status === "partial") {
                const s = joinData.summary || {};
                const batchesInfo = s.batches ? ` · ${s.batches} batches · shuffled` : "";
                toast.success(`✓ Random Mixed Join: ${s.successCount}/${s.totalCount || shuffled.length} teams${batchesInfo}`);
              } else if (joinData.needsReauth) {
                toast.error("Session expired — re-link via OTP");
              } else {
                toast.error(joinData.message || "Random join failed");
              }
            } catch (err: any) {
              toast.error(err?.message || "Random join error");
            } finally {
              setLoading(false);
            }
          }}
          disabled={loading}
        >
          {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Zap className="w-3 h-3 mr-1" />}
          Random Mixed Auto Join (All 40 Teams Shuffled)
        </Button>

        {/* Lineup filter info */}
        <div className="bg-amber-950/40 border border-amber-800/50 rounded-lg p-2.5">
          <p className="text-[10px] text-amber-300 font-bold mb-1">
            📋 Lineup Filter (After Lineup Announced)
          </p>
          <p className="text-[9px] text-amber-200/70">
            After lineup is announced, only playing 11 players are shown (11+11 = 22 players).
            Teams with non-playing players are auto-filtered.
          </p>
        </div>

        {/* Batch info banner */}
        <div className="bg-sky-950/40 border border-sky-800/50 rounded-lg p-2.5">
          <p className="text-[10px] text-sky-300 font-bold flex items-center gap-1.5">
            <RefreshCw className="w-3 h-3" />
            Smart Batch Join Active
          </p>
          <p className="text-[9px] text-sky-200/70 mt-0.5">
            Teams are shuffled randomly + sent in batches of 20. All 40 teams will be joined (not just 1-20).
          </p>
        </div>
      </div>

      {/* Free Contests List */}
      {freeContests.length > 0 && (
        <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <h3 className="text-sm font-bold text-white mb-2">Free Contests ({freeContests.length})</h3>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {freeContests.map((c, i) => (
              <div key={i} className="bg-slate-900 rounded-lg p-2.5 border border-slate-700">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-white truncate">
                      {c.contestName || `Contest ${c.contestId}`}
                    </p>
                    <p className="text-[9px] text-slate-400">
                      ID: {c.contestId} · Prize: {c.prizeDisplayText || c.totalPrizeAmount || "N/A"}
                    </p>
                    <p className="text-[9px] text-slate-500">
                      Joined: {c.joinedCount || 0} · Slots: {c.availableSlots ?? "N/A"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 text-[10px] flex-shrink-0"
                    onClick={() => {
                      setContestId(c.contestId);
                      handleJoinContest(c.contestId);
                    }}
                    disabled={loading}
                  >
                    Join All
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Join Result */}
      {joinResult && (
        <div className={cn(
          "rounded-xl p-4 border",
          joinResult.status === "success"
            ? "bg-emerald-950/30 border-emerald-700"
            : joinResult.status === "partial"
            ? "bg-amber-950/30 border-amber-700"
            : "bg-red-950/30 border-red-700"
        )}>
          <h3 className={cn(
            "text-sm font-bold mb-2 flex items-center gap-2",
            joinResult.status === "success"
              ? "text-emerald-400"
              : joinResult.status === "partial"
              ? "text-amber-400"
              : "text-red-400"
          )}>
            {joinResult.status === "success"
              ? <CheckCircle2 className="w-4 h-4" />
              : <AlertTriangle className="w-4 h-4" />}
            Join Result — {joinResult.status.toUpperCase()}
          </h3>
          <p className="text-[10px] text-slate-300 mb-2">{joinResult.message}</p>

          {joinResult.summary && (
            <>
              <div className="grid grid-cols-3 gap-2 text-[10px] mb-2">
                <div className="bg-slate-900 rounded p-2 text-center">
                  <p className="text-emerald-400 font-black text-lg">{joinResult.summary.successCount}</p>
                  <p className="text-slate-500 uppercase">Success</p>
                </div>
                <div className="bg-slate-900 rounded p-2 text-center">
                  <p className="text-red-400 font-black text-lg">{joinResult.summary.failedCount}</p>
                  <p className="text-slate-500 uppercase">Failed</p>
                </div>
                <div className="bg-slate-900 rounded p-2 text-center">
                  <p className="text-sky-400 font-black text-lg">{joinResult.summary.totalCount || (joinResult.summary.successCount + joinResult.summary.failedCount)}</p>
                  <p className="text-slate-500 uppercase">Total</p>
                </div>
              </div>
              {joinResult.summary.batches && (
                <p className="text-[9px] text-sky-300 mb-2">
                  🔄 {joinResult.summary.batches} batches × {joinResult.summary.batchSize} teams
                  {joinResult.summary.shuffled ? " · shuffled randomly" : ""}
                </p>
              )}
            </>
          )}

          {joinResult.joinResults && joinResult.joinResults.length > 0 && (
            <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
              <p className="text-[9px] text-slate-400 font-bold">Per-team results:</p>
              {joinResult.joinResults.map((r: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-[9px] bg-slate-900/50 rounded px-2 py-1">
                  <span className="text-slate-300">Team {r.teamId}</span>
                  <span className={r.success ? "text-emerald-400" : "text-red-400"}>
                    {r.success ? "✓ Joined" : `✗ ${r.error || "Failed"}`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {joinResult.needsReauth && (
            <p className="text-[10px] text-amber-400 mt-2 font-bold">
              ⚠️ Session expired — re-link via OTP
            </p>
          )}
        </div>
      )}

      {/* Backend endpoints info */}
      <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
        <p className="text-[9px] text-slate-500 font-bold mb-1">Backend Endpoints:</p>
        <div className="space-y-0.5 text-[9px] text-slate-400 font-mono">
          <p>Dream11: /api/dream11/contest/all-free-status + /join-contest</p>
          <p>My11Circle: /api/my11circle/contest/all-free-status + /join-contest</p>
          <p>List Teams: /api/fantasy/list-of-teams</p>
          <p>JWT: Bearer token in Authorization header</p>
        </div>
      </div>
    </div>
  );
}

/* ============== PAYMENTS TAB ============== */

interface PaymentOrder {
  orderId: string;
  mobile: string;
  plan: string;
  amount: number;
  keyType: string;
  label: string;
  status: string;
  licenseKey: string | null;
  expiresAt: number | null;
  paymentId: string | null;
  createdAt: number;
  completedAt: number | null;
  failedAt: number | null;
}

function PaymentsTab() {
  const [payments, setPayments] = useState<PaymentOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "completed" | "failed">("all");
  const [summary, setSummary] = useState({ total: 0, pending: 0, completed: 0, failed: 0, totalRevenue: 0 });

  async function fetchPayments() {
    setLoading(true);
    try {
      const statusParam = filter === "all" ? "" : `?status=${filter}`;
      const res = await fetch(`/api/payment/list${statusParam}`);
      const data = await res.json();
      if (data.status === "success") {
        setPayments(data.payments || []);
        setSummary(data.summary || { total: 0, pending: 0, completed: 0, failed: 0, totalRevenue: 0 });
      } else {
        toast.error(data.message || "Failed to fetch payments");
      }
    } catch (err: any) {
      toast.error(err?.message || "Network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPayments();
  }, [filter]);

  function formatDate(ts: number | null): string {
    if (!ts) return "—";
    return new Date(ts).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  const statusColors: Record<string, string> = {
    pending: "bg-amber-500",
    completed: "bg-emerald-500",
    failed: "bg-red-500",
  };

  return (
    <div className="space-y-4 text-slate-200">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-slate-800 rounded-xl p-3 border border-slate-700 text-center">
          <p className="text-2xl font-black text-white">{summary.total}</p>
          <p className="text-[9px] text-slate-400 uppercase">Total</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-3 border border-slate-700 text-center">
          <p className="text-2xl font-black text-amber-400">{summary.pending}</p>
          <p className="text-[9px] text-slate-400 uppercase">Pending</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-3 border border-slate-700 text-center">
          <p className="text-2xl font-black text-emerald-400">{summary.completed}</p>
          <p className="text-[9px] text-slate-400 uppercase">Completed</p>
        </div>
        <div className="bg-slate-800 rounded-xl p-3 border border-slate-700 text-center">
          <p className="text-2xl font-black text-violet-400">₹{summary.totalRevenue}</p>
          <p className="text-[9px] text-slate-400 uppercase">Revenue</p>
        </div>
      </div>

      {/* Filter buttons */}
      <div className="flex gap-1.5">
        {(["all", "pending", "completed", "failed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border-2",
              filter === f
                ? "bg-violet-600 text-white border-transparent"
                : "bg-slate-800 border-slate-700 text-slate-300"
            )}
          >
            {f.toUpperCase()}
          </button>
        ))}
        <button
          onClick={fetchPayments}
          className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-sky-600 text-white ml-auto flex items-center gap-1"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          Refresh
        </button>
      </div>

      {/* Payments list */}
      {loading && payments.length === 0 ? (
        <div className="text-center py-8">
          <Loader2 className="w-8 h-8 mx-auto text-violet-500 animate-spin" />
          <p className="text-xs text-slate-400 mt-2">Loading payments...</p>
        </div>
      ) : payments.length === 0 ? (
        <div className="text-center py-8">
          <CreditCard className="w-10 h-10 mx-auto text-slate-600 mb-2" />
          <p className="text-xs text-slate-400">No payments found</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto scrollbar-thin">
          {payments.map((p, i) => (
            <div key={i} className="bg-slate-800 rounded-xl p-3 border border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "w-2 h-2 rounded-full",
                    statusColors[p.status] || "bg-slate-500"
                  )} />
                  <code className="text-[10px] text-slate-400 font-mono">{p.orderId}</code>
                </div>
                <span className={cn(
                  "text-[9px] font-bold px-2 py-0.5 rounded-full uppercase",
                  p.status === "completed" && "bg-emerald-900/50 text-emerald-400",
                  p.status === "pending" && "bg-amber-900/50 text-amber-400",
                  p.status === "failed" && "bg-red-900/50 text-red-400",
                )}>
                  {p.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div>
                  <p className="text-slate-500">Mobile</p>
                  <p className="text-white font-bold">+91 {p.mobile}</p>
                </div>
                <div>
                  <p className="text-slate-500">Plan</p>
                  <p className="text-white font-bold">{p.label}</p>
                </div>
                <div>
                  <p className="text-slate-500">Amount</p>
                  <p className="text-emerald-400 font-black">₹{p.amount}</p>
                </div>
                <div>
                  <p className="text-slate-500">Created</p>
                  <p className="text-white">{formatDate(p.createdAt)}</p>
                </div>
                {p.licenseKey && (
                  <div className="col-span-2">
                    <p className="text-slate-500">License Key</p>
                    <code className="text-violet-400 font-mono font-bold">{p.licenseKey}</code>
                  </div>
                )}
                {p.completedAt && (
                  <div>
                    <p className="text-slate-500">Completed</p>
                    <p className="text-emerald-400">{formatDate(p.completedAt)}</p>
                  </div>
                )}
                {p.paymentId && (
                  <div>
                    <p className="text-slate-500">Payment ID</p>
                    <code className="text-slate-300 font-mono text-[9px]">{p.paymentId}</code>
                  </div>
                )}
              </div>

              {/* Admin verification info */}
              {p.status === "completed" && (
                <div className="mt-2 bg-emerald-950/30 border border-emerald-800/50 rounded-lg p-2">
                  <p className="text-[9px] text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Payment confirmed — Key auto-activated
                  </p>
                  {p.expiresAt && (
                    <p className="text-[9px] text-emerald-300/70 mt-0.5">
                      Expires: {formatDate(p.expiresAt)}
                    </p>
                  )}
                </div>
              )}

              {p.status === "pending" && (
                <div className="mt-2 bg-amber-950/30 border border-amber-800/50 rounded-lg p-2">
                  <p className="text-[9px] text-amber-400 font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Awaiting payment confirmation from user
                  </p>
                  <p className="text-[9px] text-amber-300/70 mt-0.5">
                    User must click "Yes, Payment Successful" to activate key
                  </p>
                </div>
              )}

              {p.status === "failed" && (
                <div className="mt-2 bg-red-950/30 border border-red-800/50 rounded-lg p-2">
                  <p className="text-[9px] text-red-400 font-bold flex items-center gap-1">
                    <X className="w-3 h-3" />
                    Payment failed — No key generated
                  </p>
                  <p className="text-[9px] text-red-300/70 mt-0.5">
                    Failed at: {formatDate(p.failedAt)}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Payment info */}
      <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
        <p className="text-[9px] text-slate-500 font-bold mb-1">Payment Flow:</p>
        <div className="space-y-0.5 text-[9px] text-slate-400">
          <p>1. User clicks "Buy Now" on plan card</p>
          <p>2. UPI payment screen opens → pays to gostr3248@okhdfcbank</p>
          <p>3. User clicks "I've Paid — Verify & Activate"</p>
          <p>4. Confirmation: "Yes, Payment Successful" or "Payment Failed"</p>
          <p>5. ✅ Success → Key auto-generated + auto-activated</p>
          <p>5. ❌ Failed → No key generated — user can retry</p>
        </div>
        <p className="text-[9px] text-slate-500 mt-2">
          UPI ID: <code className="text-violet-300 font-mono">gostr3248@okhdfcbank</code>
        </p>
      </div>
    </div>
  );
}

/* ============== MATCHES TAB ============== */

interface AdminMatch {
  matchId: string;
  title: string;
  team1: string;
  team2: string;
  startTime: number;
  inDb: boolean;
  supports: string[];
}

function MatchesTab() {
  const [matches, setMatches] = useState<AdminMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "in-db" | "not-db" | "upcoming">("all");
  const [search, setSearch] = useState("");

  async function fetchMatches() {
    setLoading(true);
    try {
      const res = await fetch("/api/matches?sport=cricket");
      const data = await res.json();
      if (data.status === "success") {
        const rawMatches = data.matches || data.data || [];
        if (!Array.isArray(rawMatches) || rawMatches.length === 0) {
          toast.info("No matches found from backend");
          setMatches([]);
          setLoading(false);
          return;
        }
        const adminMatches: AdminMatch[] = rawMatches.map((m: any) => ({
          matchId: String(m.id ?? m._id ?? m.matchId ?? ""),
          title: m.series_name || m.title || `${m.left_team_name || "T1"} vs ${m.right_team_name || "T2"}`,
          team1: m.left_team_name || (typeof m.team1 === "string" ? m.team1 : (m.team1?.shortName || "T1")),
          team2: m.right_team_name || (typeof m.team2 === "string" ? m.team2 : (m.team2?.shortName || "T2")),
          startTime: m.match_time ? new Date(m.match_time).getTime() : (m.start_time ? (m.start_time < 1e12 ? m.start_time * 1000 : m.start_time) : 0),
          inDb: Boolean(m.in_db || m.inDb || m.direct_teams > 0 || false),
          supports: m.fantasy_list || [],
        }));
        setMatches(adminMatches);
        toast.success(`Found ${adminMatches.length} matches`);
      } else {
        toast.error("Failed to fetch matches");
      }
    } catch (err: any) {
      toast.error(err?.message || "Network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchMatches();
  }, []);

  function formatDate(ts: number): string {
    if (!ts) return "—";
    const diff = ts - Date.now();
    if (diff <= 0) return "Live/Ended";
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  }

  const filtered = matches.filter((m) => {
    if (search && !m.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === "in-db" && !m.inDb) return false;
    if (filter === "not-db" && m.inDb) return false;
    if (filter === "upcoming" && m.startTime < Date.now()) return false;
    return true;
  });

  return (
    <div className="space-y-4 text-slate-200">
      <div className="bg-slate-800 rounded-xl p-3 border border-slate-700 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-white">Match Management</p>
          <p className="text-[10px] text-slate-400">View, add to DB, and manage upcoming matches</p>
        </div>
        <Button size="sm" className="bg-sky-600 hover:bg-sky-700 text-white h-8 text-xs" onClick={fetchMatches} disabled={loading}>
          {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
          Refresh
        </Button>
      </div>

      <div className="flex gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search matches..." className="bg-slate-800 border-slate-700 text-white h-9 text-xs flex-1" />
        <select value={filter} onChange={(e) => setFilter(e.target.value as any)} className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2 h-9">
          <option value="all">All</option>
          <option value="in-db">In DB</option>
          <option value="not-db">Not in DB</option>
          <option value="upcoming">Upcoming</option>
        </select>
      </div>

      {loading && matches.length === 0 ? (
        <div className="text-center py-8"><Loader2 className="w-8 h-8 mx-auto text-violet-500 animate-spin" /><p className="text-xs text-slate-400 mt-2">Loading matches...</p></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8"><p className="text-xs text-slate-400">No matches found</p></div>
      ) : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto scrollbar-thin">
          {filtered.map((m, i) => (
            <div key={i} className="bg-slate-800 rounded-xl p-3 border border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white truncate">{m.title}</p>
                  <p className="text-[10px] text-slate-400">{m.team1} vs {m.team2} · {formatDate(m.startTime)}</p>
                </div>
                <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full", m.inDb ? "bg-emerald-900/50 text-emerald-400" : "bg-amber-900/50 text-amber-400")}>
                  {m.inDb ? "✓ In DB" : "⚠ Not in DB"}
                </span>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {m.supports.includes("dream11") && <span className="text-[8px] bg-red-900/50 text-red-400 px-1.5 py-0.5 rounded-full font-bold">D11</span>}
                {m.supports.includes("my11circle") && <span className="text-[8px] bg-sky-900/50 text-sky-400 px-1.5 py-0.5 rounded-full font-bold">M11</span>}
                <Button size="sm" className={cn("h-7 text-[10px]", m.inDb ? "bg-emerald-600 text-white" : "bg-blue-600 hover:bg-blue-700 text-white")}
                  onClick={() => { setMatches(prev => prev.map((x, idx) => idx === i ? { ...x, inDb: !x.inDb } : x)); toast.success(m.inDb ? "Removed from DB" : "Added to DB"); }}>
                  {m.inDb ? <CheckCircle2 className="w-3 h-3 mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
                  {m.inDb ? "In DB" : "Add to DB"}
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[10px] border-violet-600 text-violet-400 hover:bg-violet-900/30"
                  onClick={() => toast.info(`First Stage Mapper for ${m.title} — coming soon`)}>
                  <Zap className="w-3 h-3 mr-1" /> First Stage Mapper
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[10px] border-slate-600 text-slate-300 hover:bg-slate-700"
                  onClick={async () => {
                    toast.info("Fetching match detail...");
                    try { const res = await fetch(`/api/match-detail?matchId=${m.matchId}`); const data = await res.json();
                      if (data.status === "success") {
                        const leftCount = Array.isArray(data.data?.left_team_players) ? data.data.left_team_players.length : (Array.isArray(data.left_team_players) ? data.left_team_players.length : 0);
                        const rightCount = Array.isArray(data.data?.right_team_players) ? data.data.right_team_players.length : (Array.isArray(data.right_team_players) ? data.right_team_players.length : 0);
                        toast.success(`Match loaded: ${leftCount} + ${rightCount} players`);
                      }
                      else toast.error("Failed to load match detail");
                    } catch { toast.error("Network error"); }
                  }}>
                  <Eye className="w-3 h-3 mr-1" /> View Detail
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
        <p className="text-[9px] text-slate-500 font-bold mb-1">Hidden Settings (like original teamgeneration.in):</p>
        <div className="space-y-0.5 text-[9px] text-slate-400">
          <p>✓ API URL: Hidden (hardcoded internally)</p>
          <p>✓ Firebase Config: Hidden (hardcoded internally)</p>
          <p>✓ AES Key: Hidden (server-side only)</p>
          <p>✓ Backend proxy: All API calls via /api/* routes</p>
          <p>✓ No direct server URLs in client code</p>
        </div>
      </div>
    </div>
  );
}

/* ============== SUBSCRIPTIONS TAB ============== */

interface UserSubscription {
  userId: string;
  mobile: string;
  userName: string;
  plan: string;
  planStatus: "active" | "expired" | "none";
  primePlan: boolean;
  currentPlan: string;
  previousPlans: string[];
  expiryDate: number | null;
  createdAt: number;
}

function SubscriptionsTab() {
  const [subscriptions, setSubscriptions] = useState<UserSubscription[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "expired" | "prime" | "free">("all");
  const [showAddPlan, setShowAddPlan] = useState(false);
  const [planUserMobile, setPlanUserMobile] = useState("");
  const [planType, setPlanType] = useState<KeyType>("monthly");

  async function fetchSubscriptions() {
    setLoading(true);
    try {
      const { db } = await import("@/lib/firebase");
      if (!db) {
        const admin = useAdmin.getState();
        const localSubs: UserSubscription[] = admin.keys.slice(0, 50).map((k) => ({
          userId: k.deviceIds[0] || "unknown",
          mobile: k.userName || "—",
          userName: k.userName || "User",
          plan: k.type,
          planStatus: k.status === "active" ? "active" : "expired",
          primePlan: k.type === "elite" || k.type === "lifetime",
          currentPlan: k.type,
          previousPlans: [],
          expiryDate: k.expiresAt,
          createdAt: k.createdAt,
        }));
        setSubscriptions(localSubs);
        toast.success(`Found ${localSubs.length} subscriptions (local)`);
        setLoading(false);
        return;
      }
      const { collection, getDocs } = await import("firebase/firestore");
      const snap = await getDocs(collection(db, "users"));
      const subs: UserSubscription[] = [];
      snap.forEach((doc) => {
        const d = doc.data() as any;
        subs.push({
          userId: d.userId || doc.id, mobile: d.mobile || "—", userName: d.name || "User",
          plan: d.plan || "free", planStatus: d.plan === "free" || !d.plan ? "none" : "active",
          primePlan: d.plan === "elite" || d.plan === "lifetime", currentPlan: d.plan || "free",
          previousPlans: d.previousPlans || [], expiryDate: d.planExpiry || null, createdAt: d.createdAt || 0,
        });
      });
      setSubscriptions(subs);
      toast.success(`Found ${subs.length} user subscriptions`);
    } catch (err: any) { toast.error(err?.message || "Failed to fetch"); }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchSubscriptions(); }, []);

  async function handleAddPlan() {
    if (!planUserMobile.trim()) { toast.error("Enter mobile number"); return; }
    setLoading(true);
    try {
      const admin = useAdmin.getState();
      const key = admin.generateKey(planType);
      const { db } = await import("@/lib/firebase");
      if (db) {
        const { doc, setDoc, collection, query, where, getDocs, updateDoc } = await import("firebase/firestore");
        const { getExpiryForType } = await import("@/lib/admin-store");
        const expiry = getExpiryForType(planType);
        await setDoc(doc(db, "license_keys", key), {
          key, type: planType, status: "active", createdAt: Date.now(), expiresAt: expiry,
          deviceIds: [], verifications: 0, userName: planUserMobile, mobile: planUserMobile,
        });
        const uq = await getDocs(query(collection(db, "users"), where("mobile", "==", planUserMobile)));
        if (!uq.empty) {
          await updateDoc(doc(db, "users", uq.docs[0].id), { plan: planType, planExpiry: expiry, updatedAt: Date.now() });
        }
      }
      toast.success(`Plan ${planType} added for ${planUserMobile}. Key: ${key}`);
      setPlanUserMobile(""); setShowAddPlan(false); fetchSubscriptions();
    } catch (err: any) { toast.error(err?.message || "Failed"); }
    finally { setLoading(false); }
  }

  async function handleDeactivate(userId: string) {
    if (!confirm("Deactivate subscription?")) return;
    try {
      const { db } = await import("@/lib/firebase");
      if (db) { const { doc, updateDoc } = await import("firebase/firestore");
        await updateDoc(doc(db, "users", userId), { plan: "free", planExpiry: null, updatedAt: Date.now() }); }
      toast.success("Deactivated"); fetchSubscriptions();
    } catch (err: any) { toast.error(err?.message || "Failed"); }
  }

  function formatDate(ts: number | null): string {
    if (!ts) return "—";
    return new Date(ts).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }

  const filtered = subscriptions.filter((s) => {
    if (search && !s.mobile.includes(search) && !s.userName.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === "active" && s.planStatus !== "active") return false;
    if (filter === "expired" && s.planStatus !== "expired") return false;
    if (filter === "prime" && !s.primePlan) return false;
    if (filter === "free" && s.plan !== "free") return false;
    return true;
  });

  const planColors: Record<string, string> = {
    trial: "bg-emerald-900/50 text-emerald-400", match_basic: "bg-amber-900/50 text-amber-400",
    match_full: "bg-rose-900/50 text-rose-400", weekly: "bg-sky-900/50 text-sky-400",
    monthly: "bg-sky-900/50 text-sky-400", elite: "bg-violet-900/50 text-violet-400",
    lifetime: "bg-amber-900/50 text-amber-400", free: "bg-slate-700 text-slate-400",
  };

  return (
    <div className="space-y-4 text-slate-200">
      <div className="bg-slate-800 rounded-xl p-3 border border-slate-700 flex items-center justify-between">
        <div><p className="text-sm font-bold text-white">Subscription Management</p>
        <p className="text-[10px] text-slate-400">Manage plans, prime access, mobile numbers — like original teamgeneration.in</p></div>
        <div className="flex gap-2">
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs" onClick={() => setShowAddPlan(!showAddPlan)}>
            <Plus className="w-3 h-3 mr-1" /> Add Plan</Button>
          <Button size="sm" className="bg-sky-600 hover:bg-sky-700 text-white h-8 text-xs" onClick={fetchSubscriptions} disabled={loading}>
            {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />} Refresh</Button>
        </div>
      </div>

      {showAddPlan && (
        <div className="bg-slate-800 rounded-xl p-4 border border-violet-700 space-y-3">
          <p className="text-xs font-bold text-white">Add Subscription Plan (like original Prime Plan)</p>
          <Input value={planUserMobile} onChange={(e) => setPlanUserMobile(e.target.value.replace(/\D/g, "").slice(0, 10))}
            placeholder="User mobile number (10 digits)" className="bg-slate-900 border-slate-700 text-white h-9 text-xs" />
          <div className="grid grid-cols-2 gap-2">
            <select value={planType} onChange={(e) => setPlanType(e.target.value as KeyType)}
              className="bg-slate-900 border border-slate-700 text-white text-xs rounded-lg px-2 h-9">
              <option value="trial">Trial (1 day)</option><option value="match_basic">1 Match (₹49)</option>
              <option value="match_full">24 Hour (₹99)</option><option value="weekly">Weekly (₹149)</option>
              <option value="monthly">Pro (₹299, 30d)</option><option value="elite">Elite (₹999, 90d)</option>
              <option value="lifetime">Lifetime</option>
            </select>
            <Button size="sm" className="bg-violet-600 hover:bg-violet-700 text-white h-9 text-xs" onClick={handleAddPlan} disabled={loading}>
              {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Check className="w-3 h-3 mr-1" />} Activate Plan</Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-2">
        <div className="bg-slate-800 rounded-lg p-2 text-center border border-slate-700">
          <p className="text-lg font-black text-white">{subscriptions.length}</p><p className="text-[9px] text-slate-400 uppercase">Total</p></div>
        <div className="bg-slate-800 rounded-lg p-2 text-center border border-slate-700">
          <p className="text-lg font-black text-emerald-400">{subscriptions.filter(s => s.planStatus === "active").length}</p><p className="text-[9px] text-slate-400 uppercase">Active</p></div>
        <div className="bg-slate-800 rounded-lg p-2 text-center border border-slate-700">
          <p className="text-lg font-black text-violet-400">{subscriptions.filter(s => s.primePlan).length}</p><p className="text-[9px] text-slate-400 uppercase">Prime</p></div>
        <div className="bg-slate-800 rounded-lg p-2 text-center border border-slate-700">
          <p className="text-lg font-black text-slate-400">{subscriptions.filter(s => s.plan === "free").length}</p><p className="text-[9px] text-slate-400 uppercase">Free</p></div>
      </div>

      <div className="flex gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search mobile or name..." className="bg-slate-800 border-slate-700 text-white h-9 text-xs flex-1" />
        <select value={filter} onChange={(e) => setFilter(e.target.value as any)} className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-2 h-9">
          <option value="all">All</option><option value="active">Active</option><option value="expired">Expired</option>
          <option value="prime">Prime</option><option value="free">Free</option>
        </select>
      </div>

      {loading && subscriptions.length === 0 ? (
        <div className="text-center py-8"><Loader2 className="w-8 h-8 mx-auto text-violet-500 animate-spin" /><p className="text-xs text-slate-400 mt-2">Loading...</p></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8"><Crown className="w-10 h-10 mx-auto text-slate-600 mb-2" /><p className="text-xs text-slate-400">No subscriptions found</p></div>
      ) : (
        <div className="space-y-2 max-h-[55vh] overflow-y-auto scrollbar-thin">
          {filtered.map((s, i) => (
            <div key={i} className="bg-slate-800 rounded-xl p-3 border border-slate-700">
              <div className="flex items-center justify-between mb-2">
                <div className="flex-1 min-w-0"><p className="text-xs font-bold text-white">{s.userName}</p><p className="text-[10px] text-slate-400">+91 {s.mobile}</p></div>
                <div className="flex items-center gap-1.5">
                  {s.primePlan && <span className="text-[8px] bg-violet-900/50 text-violet-400 px-1.5 py-0.5 rounded-full font-bold">PRIME</span>}
                  <span className={cn("text-[9px] font-bold px-2 py-0.5 rounded-full uppercase", planColors[s.plan] || planColors.free)}>{s.plan}</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[10px] mb-2">
                <div><p className="text-slate-500">Status</p><p className={cn("font-bold", s.planStatus === "active" ? "text-emerald-400" : "text-slate-400")}>{s.planStatus === "active" ? "✓ Active" : "Free"}</p></div>
                <div><p className="text-slate-500">Expiry</p><p className="text-white">{formatDate(s.expiryDate)}</p></div>
                <div><p className="text-slate-500">Joined</p><p className="text-white">{formatDate(s.createdAt)}</p></div>
              </div>
              <div className="flex gap-1.5">
                {s.planStatus === "active" && <Button size="sm" variant="outline" className="h-7 text-[10px] border-red-600 text-red-400 hover:bg-red-900/30" onClick={() => handleDeactivate(s.userId)}><Ban className="w-3 h-3 mr-1" /> Deactivate</Button>}
                <Button size="sm" variant="outline" className="h-7 text-[10px] border-violet-600 text-violet-400 hover:bg-violet-900/30" onClick={() => { setPlanUserMobile(s.mobile); setShowAddPlan(true); }}><Plus className="w-3 h-3 mr-1" /> Change Plan</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
        <p className="text-[9px] text-slate-500 font-bold mb-1">Plans (like original teamgeneration.in):</p>
        <div className="space-y-0.5 text-[9px] text-slate-400">
          <p>🆓 FREE · 🎟 1 Match ₹49 · ⏰ 24h ₹99 · ⭐ Pro ₹299 · 👑 Elite ₹999 · 💎 Lifetime</p>
          <p>👑 Prime Plan — Add prime access · 📱 Mobile Number — User registered</p>
        </div>
      </div>
    </div>
  );
}
