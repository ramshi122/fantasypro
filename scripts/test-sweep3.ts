import { cleanPlayerPool, generateSweep } from "@/lib/sweep-generator";
import { getMatchDetail } from "@/lib/api";
import { roleFromPlayerType } from "@/lib/format";

async function test() {
  const detail = await getMatchDetail("118078");
  const left = (detail as any).left_team_players || [];
  const right = (detail as any).right_team_players || [];
  const all = [...left, ...right].filter(Boolean);
  console.log("Total raw:", all.length);

  // Check roles with new signature
  const byRole: any = {};
  for (const p of all) {
    const r = roleFromPlayerType(p.player_type, p.role);
    byRole[r] = (byRole[r] || 0) + 1;
  }
  console.log("By role (with numeric):", byRole);

  console.log("\nGenerating 20 teams...");
  const res = await generateSweep(all, 20, "IND", "AFG");
  console.log("Generated:", res.stats.generated);
  console.log("Duration:", res.stats.durationMs, "ms");
  console.log("Duplicates rejected:", res.stats.duplicates);
  console.log("Unique captains:", res.stats.coverage.uniqueCaptains);
  console.log("Unique VCs:", res.stats.coverage.uniqueViceCaptains);
  console.log("Role dist:", res.stats.roleDistribution);
}
test().catch(e => console.error("ERR:", e));
