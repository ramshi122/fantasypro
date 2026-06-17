// Quick test of the generator engine
import { generateTeams, rankPlayers, validateTeam } from "../src/lib/generator";

// Mock 30 players similar to the real API
const mockPlayers = [];
const roles = ["batter", "pacer", "wicket-keeper", "all-rounder"];
const teams = ["IND", "AFG"];
const names = {
  IND: ["Rohit", "Kohli", "Gill", "Rahul", "Bumrah", "Siraj", "Jadeja", "Pandya", "Sky", "Ishan", "Shami", "Kuldeep", "Ashwin", "Sundar"],
  AFG: ["Gurbaz", "Rashid", "Nabi", "Ibrahim", "Omarzai", "Shahidi", "Zia", "Saleem", "Atal", "Rasooli", "Khil", "Bilal", "Fareed", "Mehmood"],
};
let pid = 1;
for (const t of teams) {
  for (let i = 0; i < 14; i++) {
    const name = names[t][i];
    const r = roles[i % 4];
    mockPlayers.push({
      name,
      team_name: t,
      player_type: r,
      credits: 7 + (i % 3),
      selected_by: Math.floor(80 - i * 5),
      player_fixed_id: String(pid),
      pl_id: String(pid),
      pid: pid,
    });
    pid++;
  }
}

console.log(`Total players: ${mockPlayers.length}`);
const ranked = rankPlayers(mockPlayers);
console.log("Ranked by role:");
const byRole = { WK: 0, BAT: 0, AR: 0, BOWL: 0 };
for (const p of ranked) byRole[p.role]++;
console.log(byRole);

// Try generating 20 teams
console.log("\nGenerating 20 teams...");
const start = Date.now();
const result = await generateTeams(mockPlayers, {
  count: 20,
  team1Name: "IND",
  team2Name: "AFG",
});
console.log(`Generated ${result.teams.length} teams in ${Date.now() - start}ms`);
console.log(`Duplicates prevented: ${result.duplicatesPrevented}`);
console.log(`Attempts: ${result.attempts}`);

// Validate every team
let validCount = 0;
for (const t of result.teams) {
  const v = validateTeam(ranked, "IND", "AFG");
  if (v.ok) validCount++;
}
console.log(`Valid teams: ${validCount}/${result.teams.length}`);

// Check uniqueness
const keys = new Set();
let duplicates = 0;
for (const t of result.teams) {
  const k = (t.players || []).map(p => p.player_fixed_id || p.pid).sort().join("|");
  if (keys.has(k)) duplicates++;
  keys.add(k);
}
console.log(`Duplicate teams in result: ${duplicates}`);

// Check C/VC uniqueness
const cvPairs = new Set();
let cvDups = 0;
for (const t of result.teams) {
  const pair = `${t.captain}|${t.viceCaptain}`;
  if (cvPairs.has(pair)) cvDups++;
  cvPairs.add(pair);
}
console.log(`Duplicate C/VC pairs: ${cvDups}`);
console.log(`Unique C/VC pairs: ${cvPairs.size}`);

// Sample team
if (result.teams[0]) {
  const t = result.teams[0];
  console.log("\nSample team #1:");
  console.log("  Players:", t.players?.map(p => `${p.name}(${p.team})`).join(", "));
  console.log("  Captain:", t.players?.find(p => String(p.player_fixed_id || p.pid) === String(t.captain))?.name);
  console.log("  VC:", t.players?.find(p => String(p.player_fixed_id || p.pid) === String(t.viceCaptain))?.name);
  console.log("  Total credits:", t.players?.reduce((s, p) => s + Number(p.credits || 0), 0));
}
