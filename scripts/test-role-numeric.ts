import { getMatchDetail } from "@/lib/api";

const detail = await getMatchDetail("118078");
const left = (detail as any).left_team_players || [];
const all = [...left, ...((detail as any).right_team_players || [])].filter(Boolean);

// Show role field distribution
const byRoleNum: Record<string, number> = {};
for (const p of all) {
  const r = String(p.role);
  byRoleNum[r] = (byRoleNum[r] || 0) + 1;
}
console.log("By role (numeric):", byRoleNum);

// Show first 3 players with all fields
for (const p of all.slice(0, 3)) {
  console.log(`\n${p.name}:`);
  console.log("  role:", p.role, "type:", p.player_type);
  console.log("  all keys:", Object.keys(p).join(", "));
}
