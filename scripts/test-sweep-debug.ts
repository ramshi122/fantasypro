import { cleanPlayerPool, isValidRoleBalance, isValidSideBalance, isValidCredits, groupByRole, pickTeamByType } from "@/lib/sweep-generator";
import { getMatchDetail } from "@/lib/api";
import { roleFromPlayerType } from "@/lib/format";

const detail = await getMatchDetail("118078");
const all = [...((detail as any).left_team_players || []), ...((detail as any).right_team_players || [])].filter(Boolean);
const cleaned = cleanPlayerPool(all);
const byRole = groupByRole(cleaned);

console.log("Pool by role:", {
  WK: byRole.WK.length,
  BAT: byRole.BAT.length,
  AR: byRole.AR.length,
  BOWL: byRole.BOWL.length,
});

// Try generating one team
const rng = () => Math.random();
const team = pickTeamByType(byRole, "safe", "IND", "AFG", rng);
console.log("\nGenerated team:", team ? team.length + " players" : "null");
if (team) {
  console.log("  Role balance valid:", isValidRoleBalance(team));
  console.log("  Side balance valid:", isValidSideBalance(team, "IND", "AFG"));
  console.log("  Credits valid:", isValidCredits(team));
  const credits = team.reduce((s,p) => s + Number(p.credits), 0);
  console.log("  Total credits:", credits);
  console.log("  Players:", team.map(p => `${p.name}(${p.team_name},${roleFromPlayerType(p.player_type, p.role)},${p.credits}cr)`).join(", "));
}
