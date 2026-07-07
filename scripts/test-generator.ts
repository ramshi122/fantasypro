/**
 * Test the sweep generator with a real player pool to find why teams fail.
 */
import { generateSweep, cleanPlayerPool } from "../src/lib/sweep-generator";
import type { MatchPlayer } from "../src/lib/api";

// Simulate a typical match player pool (22 players, uneven role distribution)
const testPool: MatchPlayer[] = [
  // WK (2 players)
  { name: "WK1", player_type: "keeper", role: 0, credits: 9, selected_by: 60, team_name: "T1", player_fixed_id: "wk1" },
  { name: "WK2", player_type: "keeper", role: 0, credits: 8, selected_by: 30, team_name: "T2", player_fixed_id: "wk2" },
  // BAT (4 players — LOW count)
  { name: "BAT1", player_type: "batter", role: 1, credits: 10, selected_by: 70, team_name: "T1", player_fixed_id: "bat1" },
  { name: "BAT2", player_type: "batter", role: 1, credits: 9, selected_by: 50, team_name: "T1", player_fixed_id: "bat2" },
  { name: "BAT3", player_type: "batter", role: 1, credits: 8, selected_by: 40, team_name: "T2", player_fixed_id: "bat3" },
  { name: "BAT4", player_type: "batter", role: 1, credits: 7, selected_by: 20, team_name: "T2", player_fixed_id: "bat4" },
  // AR (3 players)
  { name: "AR1", player_type: "allrounder", role: 2, credits: 9.5, selected_by: 65, team_name: "T1", player_fixed_id: "ar1" },
  { name: "AR2", player_type: "allrounder", role: 2, credits: 8.5, selected_by: 35, team_name: "T2", player_fixed_id: "ar2" },
  { name: "AR3", player_type: "allrounder", role: 2, credits: 7.5, selected_by: 15, team_name: "T2", player_fixed_id: "ar3" },
  // BOWL (5 players)
  { name: "BOWL1", player_type: "pacer", role: 3, credits: 9, selected_by: 55, team_name: "T1", player_fixed_id: "bowl1" },
  { name: "BOWL2", player_type: "pacer", role: 3, credits: 8.5, selected_by: 45, team_name: "T1", player_fixed_id: "bowl2" },
  { name: "BOWL3", player_type: "pacer", role: 3, credits: 8, selected_by: 30, team_name: "T2", player_fixed_id: "bowl3" },
  { name: "BOWL4", player_type: "pacer", role: 3, credits: 7.5, selected_by: 20, team_name: "T2", player_fixed_id: "bowl4" },
  { name: "BOWL5", player_type: "pacer", role: 3, credits: 7, selected_by: 10, team_name: "T1", player_fixed_id: "bowl5" },
];

async function run() {
  console.log("=== Test 1: 20 teams, Smart Auto ===");
  const cleaned = cleanPlayerPool(testPool);
  console.log("Cleaned pool:", cleaned.length, "players");
  console.log("Roles:", {
    WK: cleaned.filter(p => p.player_type === "keeper").length,
    BAT: cleaned.filter(p => p.player_type === "batter").length,
    AR: cleaned.filter(p => p.player_type === "allrounder").length,
    BOWL: cleaned.filter(p => p.player_type === "pacer").length,
  });

  const res = await generateSweep(cleaned, 20, "T1", "T2", (p) => {
    if (p.generated % 5 === 0) console.log(`  Progress: ${p.generated}/${p.total} - ${p.message}`);
  });

  console.log("Result:", {
    requested: res.stats.requested,
    generated: res.stats.generated,
    duplicates: res.stats.duplicates,
    attempts: res.stats.attempts,
    durationMs: res.stats.durationMs,
  });
  console.log("Teams generated:", res.teams.length);

  if (res.teams.length === 0) {
    console.log("❌ FAILED — no teams generated!");
  } else {
    console.log("✅ SUCCESS — generated teams!");
    // Show first team
    const t = res.teams[0];
    console.log("First team players:", t.players?.length);
    console.log("First team C:", t.captain);
    console.log("First team VC:", t.viceCaptain);
  }
}

run().catch(console.error);
