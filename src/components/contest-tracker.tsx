"use client";

/**
 * Contest Profit/Loss Tracker UI
 * ==============================
 * Shows total invested, total won, profit %, win rate, plus a per-contest
 * list with delete + edit-result controls.
 *
 * Reads from the contest-tracker module (localStorage).
 *
 * Additive — does not modify any existing component.
 */

import { useEffect, useMemo, useState } from "react";
import {
  TrendingUp,
  TrendingDown,
  Trophy,
  Wallet,
  Percent,
  Trash2,
  Plus,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  addContestResult,
  deleteContestResult,
  getContestRecords,
  getContestStats,
  getProfitLoss,
  updateContestResult,
  type ContestRecord,
  type ContestResult,
} from "@/lib/contest-tracker";

export function ContestTracker() {
  const [records, setRecords] = useState<ContestRecord[]>([]);
  const [stats, setStats] = useState<ReturnType<typeof getContestStats> | null>(null);
  const [pnl, setPnl] = useState<ReturnType<typeof getProfitLoss> | null>(null);
  const [showForm, setShowForm] = useState(false);

  function refresh() {
    setRecords(getContestRecords());
    setStats(getContestStats());
    setPnl(getProfitLoss());
  }

  useEffect(() => {
    refresh();
    // Re-read on storage changes (multi-tab sync)
    const handler = () => refresh();
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const cards = useMemo(() => {
    if (!stats) return [];
    return [
      {
        label: "Total Invested",
        value: `₹${stats.totalInvested.toLocaleString("en-IN")}`,
        icon: Wallet,
        color: "from-slate-600 to-slate-700",
      },
      {
        label: "Total Won",
        value: `₹${stats.totalWon.toLocaleString("en-IN")}`,
        icon: Trophy,
        color: "from-amber-500 to-orange-600",
      },
      {
        label: "Net Profit",
        value: `${stats.netProfit >= 0 ? "+" : "-"}₹${Math.abs(stats.netProfit).toLocaleString("en-IN")}`,
        icon: stats.netProfit >= 0 ? TrendingUp : TrendingDown,
        color: stats.netProfit >= 0 ? "from-emerald-500 to-green-600" : "from-rose-500 to-red-600",
      },
      {
        label: "Profit %",
        value: `${stats.profitPercent.toFixed(1)}%`,
        icon: Percent,
        color: stats.profitPercent >= 0 ? "from-emerald-500 to-green-600" : "from-rose-500 to-red-600",
      },
      {
        label: "Win Rate",
        value: `${stats.winRate.toFixed(1)}%`,
        icon: TrendingUp,
        color: "from-violet-500 to-purple-600",
      },
      {
        label: "Total Contests",
        value: `${stats.totalContests}`,
        icon: Trophy,
        color: "from-sky-500 to-blue-600",
      },
    ];
  }, [stats]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-black text-white flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            Contest Profit/Loss Tracker
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Track every contest: entry fee, prize, result. ROI auto-calculated.
          </p>
        </div>
        <Button
          size="sm"
          className="bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white h-8 text-xs"
          onClick={() => setShowForm((s) => !s)}
        >
          <Plus className="w-3 h-3 mr-1" />
          Add Contest
        </Button>
      </div>

      {/* Stat cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className={cn(
                  "rounded-xl p-3 bg-gradient-to-br text-white shadow-lg",
                  card.color
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <Icon className="w-3.5 h-3.5 opacity-80" />
                </div>
                <div className="text-[10px] uppercase tracking-wide opacity-80">{card.label}</div>
                <div className="text-lg font-black leading-tight">{card.value}</div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add contest form */}
      {showForm && (
        <AddContestForm
          onAdded={() => {
            refresh();
            setShowForm(false);
          }}
        />
      )}

      {/* P&L Breakdown */}
      {pnl && pnl.breakdown.byPlatform && Object.keys(pnl.breakdown.byPlatform).length > 0 && (
        <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-3">
          <h4 className="text-xs font-bold text-white mb-2">By Platform</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {Object.entries(pnl.breakdown.byPlatform).map(([platform, data]) => (
              <div
                key={platform}
                className="rounded-lg bg-slate-900/50 p-2 text-xs flex items-center justify-between"
              >
                <span className="font-bold text-slate-200 uppercase">{platform}</span>
                <span
                  className={cn(
                    "font-bold",
                    data.net >= 0 ? "text-emerald-400" : "text-rose-400"
                  )}
                >
                  {data.net >= 0 ? "+" : "-"}₹{Math.abs(data.net).toLocaleString("en-IN")}
                  <span className="text-slate-500 font-normal ml-1">
                    ({data.contests}c)
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent contests */}
      <div className="rounded-xl border border-slate-700 bg-slate-800/50 overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-700 bg-slate-900/50">
          <h4 className="text-xs font-bold text-white">Contest History</h4>
        </div>
        {records.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-xs">
            No contests tracked yet. Click "Add Contest" to start tracking your P&L.
          </div>
        ) : (
          <div className="divide-y divide-slate-700/50 max-h-80 overflow-y-auto">
            {records.map((c) => (
              <ContestRow key={c.id} record={c} onChanged={refresh} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ContestRow({ record, onChanged }: { record: ContestRecord; onChanged: () => void }) {
  const net = record.prizeWon - record.entryFee * record.teamsJoined;
  const dateStr = new Date(record.date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });

  const resultColor: Record<ContestResult, string> = {
    won: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    lost: "bg-rose-500/20 text-rose-300 border-rose-500/40",
    draw: "bg-amber-500/20 text-amber-300 border-amber-500/40",
    pending: "bg-slate-500/20 text-slate-300 border-slate-500/40",
  };

  return (
    <div className="px-3 py-2 flex items-center gap-2 text-xs hover:bg-slate-800/40">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white truncate">
            {record.matchName || record.contestId}
          </span>
          <span
            className={cn(
              "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border",
              resultColor[record.result]
            )}
          >
            {record.result}
          </span>
        </div>
        <div className="text-[10px] text-slate-500">
          {record.platform || "—"} · {dateStr} · {record.teamsJoined} team(s)
        </div>
      </div>
      <div className="text-right">
        <div className="text-slate-400 text-[10px]">
          Fee ₹{record.entryFee} → Won ₹{record.prizeWon}
        </div>
        <div
          className={cn(
            "font-bold",
            net >= 0 ? "text-emerald-400" : "text-rose-400"
          )}
        >
          {net >= 0 ? "+" : "-"}₹{Math.abs(net).toLocaleString("en-IN")}
        </div>
      </div>
      <select
        value={record.result}
        onChange={(e) => {
          updateContestResult(record.id, { result: e.target.value as ContestResult });
          onChanged();
        }}
        className="bg-slate-900 border border-slate-700 text-slate-200 rounded text-[10px] px-1 py-0.5"
      >
        <option value="won">Won</option>
        <option value="lost">Lost</option>
        <option value="draw">Draw</option>
        <option value="pending">Pending</option>
      </select>
      <button
        onClick={() => {
          deleteContestResult(record.id);
          onChanged();
        }}
        className="p-1 rounded hover:bg-rose-500/20 text-rose-400"
        title="Delete"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

function AddContestForm({ onAdded }: { onAdded: () => void }) {
  const [matchName, setMatchName] = useState("");
  const [platform, setPlatform] = useState("dream11");
  const [entryFee, setEntryFee] = useState("");
  const [teamsJoined, setTeamsJoined] = useState("1");
  const [prizeWon, setPrizeWon] = useState("");
  const [result, setResult] = useState<ContestResult>("pending");
  const [saving, setSaving] = useState(false);

  function handleSave() {
    setSaving(true);
    addContestResult({
      contestId: `manual_${Date.now()}`,
      matchName: matchName || "Manual Entry",
      platform,
      entryFee: Number(entryFee) || 0,
      teamsJoined: Number(teamsJoined) || 1,
      prizeWon: Number(prizeWon) || 0,
      result,
    });
    setSaving(false);
    onAdded();
  }

  return (
    <div className="rounded-xl border border-violet-700/40 bg-slate-800/50 p-3 space-y-2">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <Input
          placeholder="Match / Contest name"
          value={matchName}
          onChange={(e) => setMatchName(e.target.value)}
          className="bg-slate-900 border-slate-700 text-white h-9 text-xs"
        />
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="bg-slate-900 border border-slate-700 text-slate-200 rounded h-9 text-xs px-2"
        >
          <option value="dream11">Dream11</option>
          <option value="my11circle">My11Circle</option>
          <option value="myteam11">MyTeam11</option>
          <option value="vision11">Vision11</option>
          <option value="jumbo">Jumbo</option>
        </select>
        <Input
          type="number"
          placeholder="Entry fee ₹"
          value={entryFee}
          onChange={(e) => setEntryFee(e.target.value)}
          className="bg-slate-900 border-slate-700 text-white h-9 text-xs"
        />
        <Input
          type="number"
          placeholder="Teams joined"
          value={teamsJoined}
          onChange={(e) => setTeamsJoined(e.target.value)}
          className="bg-slate-900 border-slate-700 text-white h-9 text-xs"
        />
        <Input
          type="number"
          placeholder="Prize won ₹"
          value={prizeWon}
          onChange={(e) => setPrizeWon(e.target.value)}
          className="bg-slate-900 border-slate-700 text-white h-9 text-xs"
        />
        <select
          value={result}
          onChange={(e) => setResult(e.target.value as ContestResult)}
          className="bg-slate-900 border border-slate-700 text-slate-200 rounded h-9 text-xs px-2"
        >
          <option value="won">Won</option>
          <option value="lost">Lost</option>
          <option value="draw">Draw</option>
          <option value="pending">Pending</option>
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          className="text-slate-400 h-8 text-xs"
          onClick={onAdded}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
          Save
        </Button>
      </div>
    </div>
  );
}

export default ContestTracker;
