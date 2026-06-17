import { cleanPlayerPool, generateSweep } from "@/lib/sweep-generator";
import { getMatchDetail } from "@/lib/api";
import { roleFromPlayerType } from "@/lib/format";

async function test() {
  const detail = await getMatchDetail("118078");
  const leftPlayers = (detail as any).left_team_players || [];
  const rightPlayers = (detail as any).right_team_players || [];
  const all = [...leftPlayers, ...rightPlayers].filter(Boolean);
  console.log("Total raw:", all.length);

  const cleaned = cleanPlayerPool(all);
  console.log("After clean:", cleaned.length);

  // Group by role manually
  const byRole: any = { WK: [], BAT: [], AR: [], BOWL: [] };
  for (const p of cleaned) {
    const r = roleFromPlayerType(p.player_type);
    if (byRole[r]) byRole[r].push(p.name);
  }
  console.log("By role:", Object.fromEntries(Object.entries(byRole).map(([k,v]) => [k, (v as any).length])));

  // Try generating just 1 team
  console.log("\nGenerating 1 team...");
  const res = await generateSweep(all, 10 as any, "IND", "AFG", (p) => console.log(`  ${p.phase}: ${p.generated}/${p.total}`));
  console.log("Generated:", res.stats.generated);
  console.log("Attempts:", res.stats.attempts);
}
test().catch(e => console.error("ERR:", e));
