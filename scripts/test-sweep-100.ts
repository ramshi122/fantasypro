import { generateSweep } from "@/lib/sweep-generator";
import { getMatchDetail } from "@/lib/api";

const detail = await getMatchDetail("118078");
const all = [...((detail as any).left_team_players || []), ...((detail as any).right_team_players || [])].filter(Boolean);

console.log("Generating 100 teams...");
const start = Date.now();
const res = await generateSweep(all, 100, "IND", "AFG");
console.log(`Generated ${res.stats.generated} teams in ${Date.now() - start}ms`);
console.log("Unique captains:", res.stats.coverage.uniqueCaptains);
console.log("Unique VCs:", res.stats.coverage.uniqueViceCaptains);
console.log("Avg exposure:", res.stats.coverage.avgPlayerExposure);
console.log("Max exposure:", res.stats.coverage.maxPlayerExposure);
console.log("Duplicates rejected:", res.stats.duplicates);
console.log("Role dist:", res.stats.roleDistribution);

console.log("\nGenerating 500 teams...");
const start2 = Date.now();
const res2 = await generateSweep(all, 500, "IND", "AFG");
console.log(`Generated ${res2.stats.generated} teams in ${Date.now() - start2}ms`);
console.log("Unique captains:", res2.stats.coverage.uniqueCaptains);
console.log("Unique VCs:", res2.stats.coverage.uniqueViceCaptains);
console.log("Avg exposure:", res2.stats.coverage.avgPlayerExposure);
console.log("Max exposure:", res2.stats.coverage.maxPlayerExposure);
console.log("Duplicates rejected:", res2.stats.duplicates);
