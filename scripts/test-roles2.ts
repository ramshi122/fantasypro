import { getMatchDetail } from "@/lib/api";
import { roleFromPlayerType } from "@/lib/format";

const detail = await getMatchDetail("118078");
const all = [...((detail as any).left_team_players || []), ...((detail as any).right_team_players || [])].filter(Boolean);

// Show each player's role detection
const team = ["Rahmanullah Gurbaz", "Shubman Gill", "Hashmatullah Shahidi", "Rohit Sharma", "Shreyas Iyer", "Yashasvi Jaiswal", "Darwish Rasooli", "Nitish K Reddy", "Gurnoor Brar", "Rashid Khan", "Arshdeep Singh"];

for (const name of team) {
  const p = all.find(x => x.name === name);
  if (p) {
    const r = roleFromPlayerType(p.player_type, p.role);
    console.log(`${name}: role=${p.role} type=${p.player_type} → ${r}`);
  }
}

// Test counts
const counts: any = { WK: 0, BAT: 0, AR: 0, BOWL: 0 };
for (const name of team) {
  const p = all.find(x => x.name === name);
  if (p) {
    const r = roleFromPlayerType(p.player_type, p.role);
    counts[r] = (counts[r] || 0) + 1;
  }
}
console.log("\nCounts:", counts);
console.log("WK valid:", counts.WK >= 1 && counts.WK <= 8);
console.log("BAT valid:", counts.BAT >= 3 && counts.BAT <= 8);
console.log("AR valid:", counts.AR >= 1 && counts.AR <= 8);
console.log("BOWL valid:", counts.BOWL >= 3 && counts.BOWL <= 8);
