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

export function classForRole(role?: string | number): string {
  const r = String(role || "").toLowerCase();
  if (r === "wk" || r.includes("keeper")) return "bg-amber-500";
  if (r === "bat" || r.includes("bats") || r.includes("batter")) return "bg-sky-500";
  if (r === "ar" || r.includes("all")) return "bg-emerald-500";
  if (r === "bowl" || r.includes("bowl") || r.includes("pacer")) return "bg-rose-500";
  if (r === "gk" || r.includes("goalkeeper")) return "bg-yellow-500";
  if (r === "def" || r.includes("def")) return "bg-blue-500";
  if (r === "mid" || r.includes("mid")) return "bg-green-500";
  if (r === "fwd" || r.includes("fwd") || r.includes("strik")) return "bg-red-500";
  return "bg-slate-500";
}

export function roleLabel(role?: string | number): string {
  // Numeric role from API: 0=batter, 1=batter, 2=bowler/all-rounder, 3=keeper, 4=pacer
  // We'll detect from player_type string if present, otherwise fallback to numeric mapping.
  if (typeof role === "number") {
    // Numeric fallback (rarely used since player_type is always present)
    if (role === 0) return "BAT";
    if (role === 1) return "BAT";
    if (role === 2) return "AR";
    if (role === 3) return "WK";
    if (role === 4) return "BOWL";
  }
  const r = String(role || "").toLowerCase();
  if (r === "wk" || r.includes("keeper")) return "WK";
  if (r === "bat" || r.includes("bats") || r.includes("batter")) return "BAT";
  if (r === "ar" || r.includes("all")) return "AR";
  if (r === "bowl" || r.includes("bowl") || r.includes("pacer")) return "BOWL";
  if (r === "gk" || r.includes("keeper")) return "GK";
  if (r === "def" || r.includes("def")) return "DEF";
  if (r === "mid" || r.includes("mid")) return "MID";
  if (r === "fwd" || r.includes("fwd") || r.includes("strik")) return "FWD";
  return (String(role) || "?").toUpperCase().slice(0, 4);
}

/**
 * Convert API player_type (e.g. "batter", "pacer", "wicket-keeper") to
 * a short code used for the role badge UI.
 *
 * Backend uses numeric `role` field (0=WK, 1=BAT, 2=AR, 3=BOWL) which is more
 * reliable than player_type (which only has "batter"/"pacer"). We try numeric
 * first, then fall back to player_type string.
 */
export function roleFromPlayerType(playerType?: string, roleNum?: number): string {
  // Numeric role takes priority
  if (typeof roleNum === "number") {
    if (roleNum === 0) return "WK";
    if (roleNum === 1) return "BAT";
    if (roleNum === 2) return "AR";
    if (roleNum === 3) return "BOWL";
  }
  const p = (playerType || "").toLowerCase();
  if (p.includes("keeper") || p.includes("wk")) return "WK";
  if (p.includes("pacer") || p.includes("bowler") || p.includes("bowl")) return "BOWL";
  if (p.includes("all")) return "AR";
  if (p.includes("batter") || p.includes("bat")) return "BAT";
  if (p.includes("keeper")) return "GK";
  if (p.includes("def")) return "DEF";
  if (p.includes("mid")) return "MID";
  if (p.includes("forward") || p.includes("fwd") || p.includes("striker")) return "FWD";
  return "BAT"; // default fallback (most common)
}
