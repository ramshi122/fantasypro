/**
 * Format a future timestamp (ms or ISO string) into "12h 53m 27s" style countdown.
 */
export function formatCountdown(target: string | number | undefined): string {
  if (!target) return "--";
  const ts = typeof target === "string" ? new Date(target).getTime() : Number(target);
  // If seconds, convert to ms
  const ms = ts < 1e12 ? ts * 1000 : ts;
  const diff = ms - Date.now();
  if (diff <= 0) return "Live";
  const totalSec = Math.floor(diff / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  return `${h}h ${m}m ${s}s`;
}

export function isMatchLive(target: string | number | undefined): boolean {
  if (!target) return false;
  const ts = typeof target === "string" ? new Date(target).getTime() : Number(target);
  const ms = ts < 1e12 ? ts * 1000 : ts;
  return ms <= Date.now();
}

export function getInitials(name?: string): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/**
 * Pick a stable team color based on team name.
 */
const TEAM_COLORS = [
  "#7C3AED", "#EC4899", "#06B6D4", "#10B981", "#F59E0B",
  "#EF4444", "#8B5CF6", "#3B82F6", "#84CC16", "#F97316",
];

export function teamColor(seed?: string): string {
  if (!seed) return TEAM_COLORS[0];
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return TEAM_COLORS[h % TEAM_COLORS.length];
}

export function shortName(name?: string, max = 4): string {
  if (!name) return "?";
  if (name.length <= max) return name.toUpperCase();
  // Try uppercase first letters
  const parts = name.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, max).toUpperCase();
}

export function classForRole(role?: string): string {
  switch ((role || "").toLowerCase()) {
    case "wk":
    case "wicket-keeper":
    case "wicketkeeper":
      return "bg-amber-500";
    case "bat":
    case "batsman":
    case "batter":
      return "bg-sky-500";
    case "ar":
    case "all-rounder":
    case "allrounder":
      return "bg-emerald-500";
    case "bowl":
    case "bowler":
      return "bg-rose-500";
    case "gk":
    case "goalkeeper":
      return "bg-yellow-500";
    case "def":
    case "defender":
      return "bg-blue-500";
    case "mid":
    case "midfielder":
      return "bg-green-500";
    case "fwd":
    case "forward":
    case "st":
    case "striker":
      return "bg-red-500";
    default:
      return "bg-slate-500";
  }
}

export function roleLabel(role?: string): string {
  const r = (role || "").toLowerCase();
  if (r === "wk" || r.includes("keeper")) return "WK";
  if (r === "bat" || r.includes("bats") || r.includes("batter")) return "BAT";
  if (r === "ar" || r.includes("all")) return "AR";
  if (r === "bowl" || r.includes("bowl")) return "BOWL";
  if (r === "gk" || r.includes("keeper")) return "GK";
  if (r === "def" || r.includes("def")) return "DEF";
  if (r === "mid" || r.includes("mid")) return "MID";
  if (r === "fwd" || r.includes("fwd") || r.includes("strik")) return "FWD";
  return (role || "?").toUpperCase().slice(0, 4);
}
