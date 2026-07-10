"use client";

/**
 * Admin Live Dashboard
 * ====================
 * Real-time admin panel tab showing:
 *   - Live user count (from Firebase-synced admin store)
 *   - Active transfers count (today's transfer / team_generation events)
 *   - Revenue today (sum of today's completed payments)
 *   - Auto-refresh every 5 seconds
 *   - Real-time charts (last 7 days teams + revenue sparkline)
 *
 * This is ADDITIVE — does NOT replace the existing DashboardTab.
 * Wired up as a new "Live" tab in the admin panel.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Activity,
  Users,
  TrendingUp,
  IndianRupee,
  RefreshCw,
  Zap,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAdmin } from "@/lib/admin-store";
import { readEvents, getDailyTeamGenerationTrend } from "@/lib/analytics";

interface PaymentOrder {
  orderId: string;
  amount: number;
  status: string;
  createdAt: number;
  completedAt: number | null;
}

interface LiveData {
  activeUsers: number;
  totalUsers: number;
  activeDevices: number;
  activeTransfers: number;
  teamsGeneratedToday: number;
  revenueToday: number;
  todayVerifications: number;
  lastUpdated: number;
}

const REFRESH_MS = 5_000;

export function AdminLiveDashboard() {
  const admin = useAdmin();
  const users = useAdmin((s) => s.users);
  const devices = useAdmin((s) => s.devices);
  const keys = useAdmin((s) => s.keys);
  const logs = useAdmin((s) => s.logs);
  const lastSyncedAt = useAdmin((s) => s.lastSyncedAt);
  const isSyncing = useAdmin((s) => s.isSyncing);

  const [data, setData] = useState<LiveData>({
    activeUsers: 0,
    totalUsers: 0,
    activeDevices: 0,
    activeTransfers: 0,
    teamsGeneratedToday: 0,
    revenueToday: 0,
    todayVerifications: 0,
    lastUpdated: Date.now(),
  });
  const [payments, setPayments] = useState<PaymentOrder[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(false);

  // Fetch payments (separate from the 5s loop — only every 60s)
  const fetchPayments = useCallback(async () => {
    try {
      const res = await fetch("/api/payment/list");
      const json = await res.json();
      if (json?.status === "success") {
        setPayments(json.payments || []);
      }
    } catch {
      /* ignore — keep stale */
    }
  }, []);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  // Compute live data from store + payments + analytics events
  const compute = useCallback(() => {
    const now = Date.now();
    const todayStart = new Date().setHours(0, 0, 0, 0);

    // Active users = users seen in the last 5 minutes (lastActive) OR
    // fallback to total users / active devices.
    const fiveMinAgo = now - 5 * 60 * 1000;
    const activeUsers = users.filter(
      (u) => !u.banned && (u.lastActive || 0) >= fiveMinAgo
    ).length;

    // Active transfers = today's transfer / team_generation events
    const events = readEvents();
    const transfersToday = events.filter(
      (e) =>
        (e.type === "transfer" || e.type === "team_generation") &&
        e.timestamp >= todayStart
    ).length;

    const teamsGeneratedToday = logs.filter(
      (l) => l.type === "team_generation" && l.timestamp >= todayStart
    ).length;

    const todayVerifications = logs.filter(
      (l) => l.type === "key_verification" && l.timestamp >= todayStart
    ).length;

    // Revenue today = sum of completed payments created today
    const revenueToday = payments
      .filter(
        (p) =>
          p.status === "completed" ||
          p.status === "success" ||
          (p.completedAt && p.completedAt >= todayStart)
      )
      .filter((p) => p.createdAt >= todayStart)
      .reduce((acc, p) => acc + Number(p.amount || 0), 0);

    setData({
      activeUsers,
      totalUsers: users.length,
      activeDevices: devices.filter((d) => d.status === "allowed").length,
      activeTransfers: transfersToday,
      teamsGeneratedToday,
      revenueToday,
      todayVerifications,
      lastUpdated: now,
    });
  }, [users, devices, logs, payments]);

  // 5-second auto-refresh
  useEffect(() => {
    compute();
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      compute();
    }, REFRESH_MS);
    return () => clearInterval(interval);
  }, [compute, autoRefresh]);

  // Refresh payments every 60s
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchPayments();
    }, 60_000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchPayments]);

  // 7-day teams trend
  const trend = useMemo(() => getDailyTeamGenerationTrend(), [data.lastUpdated]);
  const maxTrend = Math.max(1, ...trend.map((t) => t.count));

  // 7-day revenue sparkline (from payments)
  const revenueTrend = useMemo(() => {
    const now = new Date();
    const out: Array<{ label: string; total: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const start = d.getTime();
      const end = start + 86400000;
      const total = payments
        .filter((p) => p.createdAt >= start && p.createdAt < end)
        .filter((p) => p.status === "completed" || p.status === "success" || p.completedAt)
        .reduce((acc, p) => acc + Number(p.amount || 0), 0);
      out.push({ label: d.toLocaleDateString("en-US", { weekday: "short" }), total });
    }
    return out;
  }, [payments, data.lastUpdated]);
  const maxRevenue = Math.max(1, ...revenueTrend.map((r) => r.total));

  const cards = [
    {
      label: "Active Users (5m)",
      value: data.activeUsers,
      sub: `${data.totalUsers} total`,
      icon: Users,
      color: "from-violet-500 to-purple-600",
    },
    {
      label: "Active Transfers (today)",
      value: data.activeTransfers,
      sub: `${data.teamsGeneratedToday} teams gen`,
      icon: Zap,
      color: "from-emerald-500 to-green-600",
    },
    {
      label: "Revenue Today",
      value: `₹${data.revenueToday.toLocaleString("en-IN")}`,
      sub: `${payments.length} payments all-time`,
      icon: IndianRupee,
      color: "from-amber-500 to-orange-600",
    },
    {
      label: "Verifications Today",
      value: data.todayVerifications,
      sub: `${keys.length} total keys`,
      icon: Activity,
      color: "from-sky-500 to-blue-600",
    },
  ];

  const secondsAgo = Math.floor((Date.now() - data.lastUpdated) / 1000);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-black text-white flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            Live Dashboard
            <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded-full font-bold">
              AUTO-REFRESH 5s
            </span>
          </h3>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Last updated {secondsAgo}s ago · Synced{" "}
            {lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString() : "never"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={autoRefresh ? "default" : "outline"}
            className={
              autoRefresh
                ? "bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs"
                : "text-slate-300 h-8 text-xs"
            }
            onClick={() => setAutoRefresh((v) => !v)}
          >
            {autoRefresh ? <Wifi className="w-3 h-3 mr-1" /> : <WifiOff className="w-3 h-3 mr-1" />}
            {autoRefresh ? "Live" : "Paused"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-slate-300 h-8 text-xs"
            disabled={isSyncing || loading}
            onClick={async () => {
              setLoading(true);
              try {
                await admin.syncFromFirebase();
                await fetchPayments();
                compute();
              } finally {
                setLoading(false);
              }
            }}
          >
            <RefreshCw className={cn("w-3 h-3 mr-1", (isSyncing || loading) && "animate-spin")} />
            Sync Now
          </Button>
        </div>
      </div>

      {/* Live stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className={cn(
                "rounded-xl p-3 bg-gradient-to-br text-white shadow-lg relative overflow-hidden",
                card.color
              )}
            >
              <div className="absolute -top-4 -right-4 w-16 h-16 bg-white/10 rounded-full" />
              <div className="flex items-center justify-between mb-1 relative">
                <Icon className="w-4 h-4 opacity-80" />
              </div>
              <div className="text-[10px] uppercase tracking-wide opacity-80 relative">
                {card.label}
              </div>
              <div className="text-2xl font-black leading-tight relative">{card.value}</div>
              <div className="text-[9px] opacity-70 mt-0.5 relative">{card.sub}</div>
            </div>
          );
        })}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Teams generated trend */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-3">
          <h4 className="text-xs font-bold text-white mb-2 flex items-center gap-1">
            <Zap className="w-3 h-3 text-violet-400" />
            Teams Generated — Last 7 Days
          </h4>
          <div className="flex items-end gap-1.5 h-32">
            {trend.map((t, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                <div className="text-[9px] text-slate-400">{t.count}</div>
                <div
                  className="w-full bg-gradient-to-t from-violet-600 to-fuchsia-500 rounded-t"
                  style={{ height: `${(t.count / maxTrend) * 100}%`, minHeight: "2px" }}
                />
                <div className="text-[9px] text-slate-500">{t.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Revenue trend */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-3">
          <h4 className="text-xs font-bold text-white mb-2 flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-emerald-400" />
            Revenue — Last 7 Days
          </h4>
          <div className="flex items-end gap-1.5 h-32">
            {revenueTrend.map((r, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                <div className="text-[9px] text-slate-400">
                  {r.total > 0 ? `₹${r.total >= 1000 ? `${(r.total / 1000).toFixed(1)}k` : r.total}` : ""}
                </div>
                <div
                  className="w-full bg-gradient-to-t from-emerald-600 to-green-500 rounded-t"
                  style={{ height: `${(r.total / maxRevenue) * 100}%`, minHeight: "2px" }}
                />
                <div className="text-[9px] text-slate-500">{r.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent activity feed */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-700 bg-slate-900/50 flex items-center justify-between">
          <h4 className="text-xs font-bold text-white">Recent Activity (Live)</h4>
          <span className="text-[9px] text-slate-500">{logs.length} logs</span>
        </div>
        <div className="divide-y divide-slate-700/50 max-h-64 overflow-y-auto">
          {logs.length === 0 ? (
            <div className="p-4 text-center text-slate-500 text-xs">No activity yet.</div>
          ) : (
            logs
              .slice()
              .sort((a, b) => b.timestamp - a.timestamp)
              .slice(0, 30)
              .map((log) => (
                <div key={log.id} className="px-3 py-1.5 flex items-center gap-2 text-[11px]">
                  <span
                    className={cn(
                      "w-1.5 h-1.5 rounded-full shrink-0",
                      log.type === "team_generation"
                        ? "bg-emerald-400"
                        : log.type === "key_verification"
                        ? "bg-sky-400"
                        : log.type === "error"
                        ? "bg-rose-400"
                        : log.type === "admin_action"
                        ? "bg-violet-400"
                        : "bg-slate-400"
                    )}
                  />
                  <span className="text-slate-300 truncate flex-1">{log.message}</span>
                  <span className="text-slate-500 shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
}

export default AdminLiveDashboard;
