import { generateSweep, cleanPlayerPool } from "@/lib/sweep-generator";
import { getMatchDetail } from "@/lib/api";

async function test() {
  console.log("Fetching match detail...");
  const detail = await getMatchDetail("118078");
  if (!detail) {
    console.log("No detail");
    return;
  }
  const leftPlayers = (detail as any).left_team_players || [];
  const rightPlayers = (detail as any).right_team_players || [];
  const all = [...leftPlayers, ...rightPlayers].filter(Boolean);
  console.log("Total players:", all.length);
  console.log("First player:", JSON.stringify(all[0]).substring(0, 200));

  console.log("\nGenerating 20 teams...");
  const res = await generateSweep(all, 20, "IND", "AFG", (p) => {
    if (p.generated % 5 === 0) console.log(`  ${p.phase}: ${p.generated}/${p.total} - ${p.message}`);
  });
  console.log("\nResult:");
  console.log("  generated:", res.stats.generated);
  console.log("  duration:", res.stats.durationMs, "ms");
  console.log("  duplicates rejected:", res.stats.duplicates);
  console.log("  unique captains:", res.stats.coverage.uniqueCaptains);
  console.log("  unique VCs:", res.stats.coverage.uniqueViceCaptains);
  console.log("  avg exposure:", res.stats.coverage.avgPlayerExposure);
  console.log("  max exposure:", res.stats.coverage.maxPlayerExposure);
  console.log("  role dist:", res.stats.roleDistribution);
  console.log("\n  first team:", JSON.stringify(res.teams[0], null, 2).substring(0, 1500));
}
test().catch(e => { console.error("ERROR:", e); process.exit(1); });
