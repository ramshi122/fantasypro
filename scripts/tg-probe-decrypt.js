const CryptoJS = require("crypto-js");
const KEY = "coder_bobby_believer01_tg_software";

async function main() {
  const res = await fetch("https://tgsoftware-api.online/api/fantasy/match/118696");
  const j = await res.json();
  if (j.status !== "success") { console.log("fetch fail:", JSON.stringify(j).slice(0, 300)); return; }
  const d = j.data;
  const dec = (v) => {
    if (typeof v !== "string" || !v.startsWith("U2FsdGVk")) return v;
    try { return JSON.parse(CryptoJS.AES.decrypt(v, KEY).toString(CryptoJS.enc.Utf8)); }
    catch (e) { return CryptoJS.AES.decrypt(v, KEY).toString(CryptoJS.enc.Utf8); }
  };
  const out = {};
  for (const k of Object.keys(d)) {
    if (k === "left_team_players" || k === "right_team_players") {
      out[k] = (d[k] || []).map((p) => dec(p));
    } else {
      out[k] = dec(d[k]);
    }
  }
  console.log("match_type:", out.match_type, "| automatic:", out.automatic, "| fantasy_version:", JSON.stringify(out.fantasy_version));
  console.log("left_team_name:", out.left_team_name, "| right_team_name:", out.right_team_name);
  console.log("match_time:", out.match_time, "| status:", out.status);
  const lp = out.left_team_players || [];
  const rp = out.right_team_players || [];
  console.log("\nleft_team_players count:", lp.length, "right:", rp.length);
  console.log("\nSample LEFT player (full object):");
  console.log(JSON.stringify(lp[0], null, 1));
  console.log("\nAll player ids (left):", lp.map(p => `${p.id}|fixed:${p.player_fixed_id ?? "-"}|${p.name}`).join("\n"));
  console.log("\nAll player ids (right):", rp.map(p => `${p.id}|fixed:${p.player_fixed_id ?? "-"}|${p.name}`).join("\n"));
  console.log("\nAll top-level keys:", Object.keys(d).join(", "));
}
main().catch(e => console.error("ERR", e.message));
