"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  Crown,
  Download,
  IndianRupee,
  Loader2,
  PieChart as PieIcon,
  RefreshCw,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import {
  getAnalytics,
  getDailyTeamGenerationTrend,
  getPopularMatches,
  readEvents,
  clearAnalytics,
} from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAdmin } from "@/lib/admin-store";

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

type Range = "today" | "week" | "month" | "all";

export function AnalyticsTab() {
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<Range>("week");
  const [payments, setPayments] = useState<PaymentOrder[]>([]);
  const [analyticsTick, setAnalyticsTick] = useState(0);

  const admin = useAdmin();
  const users = useAdmin((s) => s.users);
  const devices = useAdmin((s) => s.devices);
  const logs = useAdmin((s) => s.logs);

  async function fetchPayments() {
    setLoading(true);
    try {
      const res = await fetch("/api/payment/list");
      const data = await res.json();
      if (data.status === "success") {
        setPayments(data.payments || []);
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
  }, []);

  // Force re-render helper
  function refresh() {
    setAnalyticsTick((t) => t + 1);
  }

  // Get fresh analytics snapshot
  const analytics = getAnalytics();
  const trend = getDailyTeamGenerationTrend();
  const popular = getPopularMatches(10);
  // touch tick so React re-renders
  void analyticsTick;

  // === USER STATS ===
  const now = Date.now();
  const day = 86400000;
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const weekStart = now - 7 * day;

  const totalUsers = users.length || Math.max(1, devices.length);
  const activeUsersToday = users.filter((u) => u.lastActive >= todayStart).length
    + devices.filter((d) => d.lastLogin >= todayStart).length;
  const newUsersThisWeek = users.filter((u) => u.lastActive >= weekStart).length
    + devices.filter((d) => d.lastLogin >= weekStart).length;

  // === TEAM GENERATION STATS ===
  const events = readEvents();
  const teamGenEvents = events.filter((e) => e.type === "team_generation");
  const teamsGeneratedToday = teamGenEvents
    .filter((e) => e.timestamp >= todayStart)
    .reduce((acc, e) => acc + Number(e.data?.teamCount || 1), 0);
  const teamsGeneratedThisWeek = teamGenEvents
    .filter((e) => e.timestamp >= weekStart)
    .reduce((acc, e) => acc + Number(e.data?.teamCount || 1), 0);
  const teamsGeneratedTotal = teamGenEvents.reduce(
    (acc, e) => acc + Number(e.data?.teamCount || 1),
    0
  );

  // === REVENUE STATS ===
  const completedPayments = payments.filter((p) => p.status === "completed");
  const revenueByPlan: Record<string, { count: number; amount: number }> = {};
  let totalRevenue = 0;
  for (const p of completedPayments) {
    const plan = p.keyType || p.plan || "trial";
    if (!revenueByPlan[plan]) revenueByPlan[plan] = { count: 0, amount: 0 };
    revenueByPlan[plan].count += 1;
    revenueByPlan[plan].amount += Number(p.amount || 0);
    totalRevenue += Number(p.amount || 0);
  }

  // Filter revenue by range
  function inRange(ts: number): boolean {
    if (range === "today") return ts >= todayStart;
    if (range === "week") return ts >= weekStart;
    if (range === "month") return ts >= now - 30 * day;
    return true;
  }

  const rangedPayments = completedPayments.filter((p) => inRange(p.createdAt || p.completedAt || 0));
  const rangedRevenue = rangedPayments.reduce((acc, p) => acc + Number(p.amount || 0), 0);

  // Growth: this week vs last week
  const lastWeekStart = now - 14 * day;
  const lastWeekRevenue = completedPayments
    .filter((p) => {
      const ts = p.createdAt || p.completedAt || 0;
      return ts >= lastWeekStart && ts < weekStart;
    })
    .reduce((acc, p) => acc + Number(p.amount || 0), 0);
  const growthPct = lastWeekRevenue === 0
    ? (rangedRevenue > 0 ? 100 : 0)
    : ((rangedRevenue - lastWeekRevenue) / lastWeekRevenue) * 100;

  // === CHART DATA ===
  const maxTrend = Math.max(1, ...trend.map((t) => t.count));
  const planColors: Record<string, string> = {
    trial: "#94a3b8",
    match_basic: "#60a5fa",
    match_full: "#3b82f6",
    weekly: "#a78bfa",
    monthly: "#8b5cf6",
    elite: "#f59e0b",
    lifetime: "#10b981",
  };

  function exportCSV() {
    const rows = ["timestamp,type,matchId,teamCount"];
    for (const e of events.slice(-500)) {
      rows.push(
        `${new Date(e.timestamp).toISOString()},${e.type},${e.data?.matchId || ""},${e.data?.teamCount || ""}`
      );
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Analytics exported");
  }

  return (
    <div className="space-y-4 text-slate-200">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4 text-violet-400" />
          Analytics & Revenue
        </h3>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[10px] text-slate-300"
            onClick={exportCSV}
          >
            <Download className="w-3 h-3 mr-1" />
            CSV
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[10px] text-slate-300"
            onClick={() => {
              if (confirm("Clear all analytics events?")) {
                clearAnalytics();
                refresh();
                toast.success("Analytics cleared");
              }
            }}
          >
            Clear
          </Button>
          <Button
            size="sm"
            className="h-7 text-[10px] bg-sky-600 text-white"
            onClick={async () => {
              await fetchPayments();
              refresh();
            }}
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Refresh
          </Button>
        </div>
      </div>

      {/* User stats */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard
          label="Total Users"
          value={totalUsers}
          icon={<Users className="w-3.5 h-3.5" />}
          color="from-violet-500 to-purple-600"
        />
        <StatCard
          label="Active Today"
          value={activeUsersToday}
          icon={<Activity className="w-3.5 h-3.5" />}
          color="from-emerald-500 to-green-600"
        />
        <StatCard
          label="New This Week"
          value={newUsersThisWeek}
          icon={<TrendingUp className="w-3.5 h-3.5" />}
          color="from-sky-500 to-blue-600"
        />
      </div>

      {/* Team generation stats */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard
          label="Teams Today"
          value={teamsGeneratedToday}
          icon={<Trophy className="w-3.5 h-3.5" />}
          color="from-amber-500 to-orange-600"
        />
        <StatCard
          label="Teams Week"
          value={teamsGeneratedThisWeek}
          icon={<BarChart3 className="w-3.5 h-3.5" />}
          color="from-fuchsia-500 to-pink-600"
        />
        <StatCard
          label="Teams Total"
          value={teamsGeneratedTotal}
          icon={<Trophy className="w-3.5 h-3.5" />}
          color="from-rose-500 to-red-600"
        />
      </div>

      {/* Daily trend chart */}
      <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700">
        <h4 className="text-[11px] font-bold text-slate-200 mb-3 flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5 text-violet-400" />
          Daily Team Generation (Last 7 days)
        </h4>
        <div className="flex items-end justify-between h-32 gap-2">
          {trend.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1">
              <span className="text-[9px] font-bold text-slate-300">{d.count}</span>
              <div
                className="w-full bg-gradient-to-t from-violet-600 to-fuchsia-500 rounded-t-md transition-all hover:opacity-80"
                style={{ height: `${(d.count / maxTrend) * 100}%`, minHeight: d.count > 0 ? "4px" : "2px" }}
              />
              <span className="text-[9px] text-slate-400">{d.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Revenue section */}
      <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
            <IndianRupee className="w-3.5 h-3.5 text-emerald-400" />
            Revenue
          </h4>
          <div className="flex gap-1">
            {(["today", "week", "month", "all"] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  "px-2 py-1 rounded text-[9px] font-bold uppercase",
                  range === r
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-700 text-slate-300"
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-slate-900/70 rounded-lg p-2 border border-slate-700">
            <p className="text-[9px] text-slate-400 uppercase">Revenue</p>
            <p className="text-lg font-black text-emerald-400">₹{rangedRevenue.toLocaleString("en-IN")}</p>
          </div>
          <div className="bg-slate-900/70 rounded-lg p-2 border border-slate-700">
            <p className="text-[9px] text-slate-400 uppercase">Orders</p>
            <p className="text-lg font-black text-slate-100">{rangedPayments.length}</p>
          </div>
          <div className="bg-slate-900/70 rounded-lg p-2 border border-slate-700">
            <p className="text-[9px] text-slate-400 uppercase">Growth</p>
            <p
              className={cn(
                "text-lg font-black",
                growthPct >= 0 ? "text-emerald-400" : "text-red-400"
              )}
            >
              {growthPct >= 0 ? "+" : ""}
              {growthPct.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Plan distribution */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[9px] font-bold text-slate-400 uppercase mb-1.5 flex items-center gap-1">
              <PieIcon className="w-3 h-3" /> Plan Distribution
            </p>
            <div className="space-y-1.5">
              {Object.entries(revenueByPlan).length === 0 ? (
                <p className="text-[10px] text-slate-500">No revenue yet</p>
              ) : (
                Object.entries(revenueByPlan)
                  .sort((a, b) => b[1].amount - a[1].amount)
                  .map(([plan, stats]) => (
                    <div key={plan} className="flex items-center gap-1.5">
                      <div
                        className="w-2.5 h-2.5 rounded-sm"
                        style={{ backgroundColor: planColors[plan] || "#888" }}
                      />
                      <span className="text-[10px] font-bold text-slate-200 flex-1 capitalize">
                        {plan.replace("_", " ")}
                      </span>
                      <span className="text-[10px] text-slate-400">{stats.count}</span>
                      <span className="text-[10px] font-bold text-emerald-400 w-14 text-right">
                        ₹{stats.amount}
                      </span>
                    </div>
                  ))
              )}
            </div>
          </div>
          {/* Pie chart visual */}
          <div>
            <div className="w-full aspect-square max-w-[120px] mx-auto relative">
              <SimplePieChart
                data={Object.entries(revenueByPlan).map(([plan, stats]) => ({
                  label: plan,
                  value: stats.amount,
                  color: planColors[plan] || "#888",
                }))}
              />
            </div>
            <p className="text-center text-[10px] font-black text-emerald-400 mt-1">
              ₹{totalRevenue.toLocaleString("en-IN")} Total
            </p>
          </div>
        </div>
      </div>

      {/* Popular matches */}
      <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700">
        <h4 className="text-[11px] font-bold text-slate-200 mb-2 flex items-center gap-1.5">
          <Trophy className="w-3.5 h-3.5 text-amber-400" />
          Most Popular Matches (by teams generated)
        </h4>
        {popular.length === 0 ? (
          <p className="text-[10px] text-slate-500 py-2 text-center">No match data yet</p>
        ) : (
          <div className="space-y-1.5">
            {popular.map((m, i) => (
              <div
                key={m.matchId}
                className="flex items-center gap-2 bg-slate-900/40 rounded-lg p-2 border border-slate-700/50"
              >
                <span
                  className={cn(
                    "w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black",
                    i === 0
                      ? "bg-amber-500 text-white"
                      : i === 1
                      ? "bg-slate-400 text-white"
                      : i === 2
                      ? "bg-orange-700 text-white"
                      : "bg-slate-700 text-slate-300"
                  )}
                >
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-slate-100 truncate">
                    {m.matchName || m.matchId}
                  </p>
                  <p className="text-[8px] text-slate-500">
                    Last: {new Date(m.lastGenerated).toLocaleString("en-IN")}
                  </p>
                </div>
                <span className="text-[10px] font-black text-violet-400">{m.teamCount}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent events feed */}
      <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700">
        <h4 className="text-[11px] font-bold text-slate-200 mb-2">Recent Events</h4>
        {analytics.recent.length === 0 ? (
          <p className="text-[10px] text-slate-500 py-2 text-center">No events yet</p>
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto scrollbar-thin">
            {analytics.recent.slice(0, 30).map((e, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-[10px] py-1 px-2 hover:bg-slate-900/50 rounded"
              >
                <span className="text-slate-500 w-20">
                  {new Date(e.timestamp).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="font-bold text-violet-400 w-24 truncate">{e.type}</span>
                <span className="text-slate-400 flex-1 truncate">
                  {Object.entries(e.data)
                    .map(([k, v]) => `${k}=${String(v).slice(0, 30)}`)
                    .join(", ")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className={cn("rounded-xl p-2.5 bg-gradient-to-br text-white", color)}>
      <div className="flex items-center justify-between">
        <span className="text-[9px] uppercase font-bold opacity-80">{label}</span>
        {icon}
      </div>
      <p className="text-xl font-black mt-0.5">{value.toLocaleString("en-IN")}</p>
    </div>
  );
}

/** Precompute pie chart slices from data — pure helper */
function computePieSlices(
  data: Array<{ label: string; value: number; color: string }>,
  total: number
): Array<{
  label: string;
  value: number;
  color: string;
  startAngle: number;
  endAngle: number;
  isFull: boolean;
}> {
  let cumulative = 0;
  return data.map((d) => {
    const startAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2;
    cumulative += d.value;
    const endAngle = (cumulative / total) * 2 * Math.PI - Math.PI / 2;
    return {
      ...d,
      startAngle,
      endAngle,
      isFull: data.length === 1 || d.value === total,
    };
  });
}

/** Simple SVG pie chart — no external deps */
function SimplePieChart({
  data,
}: {
  data: Array<{ label: string; value: number; color: string }>;
}) {
  const total = data.reduce((acc, d) => acc + d.value, 0);
  if (total === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-600 text-[10px]">
        No data
      </div>
    );
  }
  const radius = 45;
  const cx = 50;
  const cy = 50;
  const slices = computePieSlices(data, total);

  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      <circle cx={cx} cy={cy} r={radius} fill="#1e293b" stroke="#334155" strokeWidth="1" />
      {slices.map((d, i) => {
        if (d.isFull) {
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={radius}
              fill={d.color}
              stroke="#0f172a"
              strokeWidth="0.5"
            />
          );
        }
        const x1 = cx + radius * Math.cos(d.startAngle);
        const y1 = cy + radius * Math.sin(d.startAngle);
        const x2 = cx + radius * Math.cos(d.endAngle);
        const y2 = cy + radius * Math.sin(d.endAngle);
        const largeArc = d.endAngle - d.startAngle > Math.PI ? 1 : 0;
        return (
          <path
            key={i}
            d={`M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`}
            fill={d.color}
            stroke="#0f172a"
            strokeWidth="0.5"
          />
        );
      })}
      <circle cx={cx} cy={cy} r={18} fill="#1e293b" />
    </svg>
  );
}
