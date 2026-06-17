import { getMatchDetail } from "@/lib/api";
import { roleFromPlayerType } from "@/lib/format";

const detail = await getMatchDetail("118078");
const left = (detail as any).left_team_players || [];
const right = (detail as any).right_team_players || [];
const all = [...left, ...right].filter(Boolean);

const byType: Record<string, number> = {};
const byRole: Record<string, number> = {};
for (const p of all) {
  const t = p.player_type || "unknown";
  byType[t] = (byType[t] || 0) + 1;
  const r = roleFromPlayerType(p.player_type);
  byRole[r] = (byRole[r] || 0) + 1;
}
console.log("By player_type:", byType);
console.log("By detected role:", byRole);

// Show role distribution requirement
console.log("\nGenerator requires:");
console.log("  1+ WK");
console.log("  3-6 BAT");
console.log("  1-4 AR");
console.log("  3-6 BOWL");
