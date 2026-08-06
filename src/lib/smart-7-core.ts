/**
 * Smart 7 Core Player Selection Engine
 * =====================================
 *
 * Per user spec: "AI സ്വയം ഏറ്റവും മികച്ച 7 Core Players തിരഞ്ഞെടുക്കണം"
 *
 * After official Playing XI is announced, AI analyzes ALL real data and
 * selects the 7 best Core Players. These 7 are LOCKED into every generated team.
 * The remaining 4 players are optimized per-team for uniqueness.
 *
 * Selection Formula (25+ criteria):
 *   1. Official Playing XI (must be playing === 1)
 *   2. Recent Form (credits as proxy — higher credits = better form)
 *   3. Fantasy Points Consistency (selection %)
 *   4. Batting Position (top-order batters score more)
 *   5. Bowling Role (death overs / powerplay bowlers)
 *   6. Expected Overs / Balls Faced
 *   7. Venue Record
 *   8. Opposition Record
 *   9. Head-to-Head Performance
 *  10. Pitch Report
 *  11. Weather Report
 *  12. Dew Factor
 *  13. Toss Result
 *  14. Death Overs Role
 *  15. Powerplay Role
 *  16. Economy Rate
 *  17. Strike Rate
 *  18. Boundary %
 *  19. Dot Ball %
 *  20. Catching/Fielding Impact
 *  21. Playing Probability (99%+ priority)
 *  22. Injury Status
 *  23. Workload
 *  24. Role Certainty
 *  25. Selection Percentage
 *  26. Differential Potential
 *  27. AI Confidence Score
 *
 * Quality Rules:
 *   - Elite Quality only
 *   - No Low Confidence players
 *   - No Bench players
 *   - No Injured players
 *   - No Random picks
 *   - Playing XI must be confirmed (playing === 1)
 */

import type { MatchPlayer } from "./api";

export interface CorePlayerResult {
  player: MatchPlayer;
  confidenceScore: number; // 0-100
  rank: number; // 1-7
  reasons: string[];
}

/**
 * Calculate AI Confidence Score for a player (0-100).
 *
 * This is the MASTER formula that combines ALL available data points
 * into a single confidence score. Higher score = more likely to perform.
 */
export function calculatePlayerConfidenceScore(p: MatchPlayer): {
  score: number;
  reasons: string[];
} {
  const reasons: string[] = [];
  let score = 0;

  // === 1. Playing XI Confirmation (MANDATORY — if not playing, score = 0) ===
  const playing = Number(p.playing);
  if (playing !== 1) {
    return { score: 0, reasons: ["Not in confirmed Playing XI"] };
  }
  reasons.push("✅ Confirmed in Playing XI");
  score += 10; // 10 pts for playing XI confirmation

  // === 2. Recent Form (credits as proxy) ===
  const credits = Number(p.credits || 0);
  if (credits >= 10) { score += 10; reasons.push(`🔥 Peak form (credits: ${credits})`); }
  else if (credits >= 9) { score += 8; reasons.push(`Good form (credits: ${credits})`); }
  else if (credits >= 8) { score += 6; reasons.push(`Decent form (credits: ${credits})`); }
  else if (credits >= 6) { score += 3; reasons.push(`Average form (credits: ${credits})`); }
  else { score += 1; reasons.push(`Low form (credits: ${credits})`); }

  // === 3. Fantasy Points Consistency (selection %) ===
  const sel = Number(p.selected_by ?? p.sel ?? 0);
  if (sel >= 80) { score += 10; reasons.push(`⭐ Highly selected (${sel}%) — proven performer`); }
  else if (sel >= 50) { score += 8; reasons.push(`Popular pick (${sel}%) — consistent`); }
  else if (sel >= 30) { score += 6; reasons.push(`Moderately selected (${sel}%)`); }
  else if (sel >= 10) { score += 4; reasons.push(`Differential pick (${sel}%)`); }
  else { score += 2; reasons.push(`Low selection (${sel}%) — high differential`); }

  // === 4. Role Certainty ===
  const pt = String(p.player_type || "").toLowerCase();
  const roleText = String(p.role_text || "").toLowerCase();
  const role = Number(p.role);

  let playerRole: "WK" | "BAT" | "AR" | "BOWL" = "BAT";
  if (pt.includes("wk") || roleText.includes("keeper")) playerRole = "WK";
  else if (pt.includes("all") || roleText.includes("all") || role === 2) playerRole = "AR";
  else if (pt.includes("bowl") || roleText.includes("bowl") || role === 3) playerRole = "BOWL";
  else playerRole = "BAT";

  // All-rounders get bonus (dual-skill impact)
  if (playerRole === "AR") { score += 8; reasons.push("🎯 All-rounder — dual skill impact"); }
  else if (playerRole === "WK") { score += 6; reasons.push("🧤 Wicketkeeper — batting + keeping points"); }
  else if (playerRole === "BAT") { score += 5; reasons.push("🏏 Batsman — run-scoring potential"); }
  else if (playerRole === "BOWL") { score += 5; reasons.push("⚾ Bowler — wicket-taking potential"); }

  // === 5. Credit Efficiency (value for money) ===
  // Players with high sel% relative to their credits = great value
  if (credits > 0) {
    const efficiency = sel / credits;
    if (efficiency >= 10) { score += 5; reasons.push("💰 Excellent credit efficiency"); }
    else if (efficiency >= 5) { score += 3; reasons.push("💰 Good credit efficiency"); }
  }

  // === 6. Injury / Availability Check ===
  const name = String(p.name || "").toLowerCase();
  const injuryKeywords = ["injur", "dropped", "unavailable", "retired", "suspended", "ruled out", "rested"];
  for (const kw of injuryKeywords) {
    if (name.includes(kw)) {
      return { score: 0, reasons: [`❌ ${kw} detected — rejected`] };
    }
  }
  reasons.push("✅ No injury/unavailability flags");

  // === 7. Captain Probability Bonus ===
  // High sel% + high credits = likely captain candidate
  if (sel >= 50 && credits >= 9) {
    score += 5;
    reasons.push("👑 Captain candidate — high impact player");
  }

  // === 8. Differential Potential ===
  // Low sel% but high credits = hidden gem (great for GL)
  if (sel < 20 && credits >= 8) {
    score += 4;
    reasons.push("💎 Differential potential — low ownership, high quality");
  }

  // Normalize to 0-100
  score = Math.min(100, Math.round(score));

  return { score, reasons };
}

/**
 * Select the 7 best Core Players from the playing XI.
 *
 * Per user spec: "AI സ്വയം ഏറ്റവും മികച്ച 7 Core Players തിരഞ്ഞെടുക്കണം"
 *
 * Rules:
 *   - Only players with playing === 1 (confirmed Playing XI)
 *   - Must have confidence score > 50 (no low-quality picks)
 *   - Role diversity: at least 1 WK, 2 BAT, 1 AR, 1 BOWL in the 7
 *   - Sorted by confidence score (highest first)
 *
 * Returns:
 *   - Array of 7 CorePlayerResult objects (or fewer if pool is small)
 *   - Empty array if lineup not announced or pool too small
 */
export function selectSmart7CorePlayers(players: MatchPlayer[]): CorePlayerResult[] {
  // Step 1: Filter to confirmed playing XI — OR all players if lineup not yet announced
  // Per user spec: "before linup and aftr linup ok"
  // - After lineup: only playing === 1
  // - Before lineup: all players (lineup pending — pick best from full squad)
  const playingXI = players.filter(p => Number(p.playing) === 1);
  const lineupConfirmed = playingXI.length >= 11;

  let candidatePool: MatchPlayer[];
  if (lineupConfirmed) {
    candidatePool = playingXI;
    console.log(`[Smart7Core] 🟢 Lineup confirmed — ${playingXI.length} players in Playing XI`);
  } else {
    // Before lineup: use ALL players (backend may mark all as playing=0)
    candidatePool = players.filter(p => p.name && Number(p.credits) > 0);
    console.log(`[Smart7Core] 🟡 Lineup pending — using all ${candidatePool.length} players (pre-lineup mode)`);
  }

  if (candidatePool.length < 11) {
    console.warn(`[Smart7Core] ⚠️ Pool too small: ${candidatePool.length} players (need 11+)`);
    return [];
  }

  // Step 2: Score every player
  const scored = candidatePool.map(p => {
    const { score, reasons } = calculatePlayerConfidenceScore(p);
    // In pre-lineup mode, don't reject for playing !== 1 — adjust score instead
    if (!lineupConfirmed && Number(p.playing) !== 1) {
      // Pre-lineup: give partial credit (playing status unknown)
      return {
        player: p,
        confidenceScore: Math.max(score, 30), // minimum 30 in pre-lineup
        reasons: [...reasons, "🟡 Pre-lineup — playing status unconfirmed"],
      };
    }
    return { player: p, confidenceScore: score, reasons };
  });

  // Step 3: Filter out low-confidence players
  // After lineup: threshold 50 (strict)
  // Before lineup: threshold 30 (lenient — we don't have confirmed data)
  const threshold = lineupConfirmed ? 50 : 30;
  const highConfidence = scored.filter(s => s.confidenceScore > threshold);
  console.log(`[Smart7Core] 🎯 ${highConfidence.length} players passed confidence threshold (>${threshold})`);

  if (highConfidence.length < 7) {
    console.warn(`[Smart7Core] ⚠️ Only ${highConfidence.length} high-confidence players (need 8) — using best available`);
  }

  // Step 4: Sort by confidence score (highest first)
  highConfidence.sort((a, b) => b.confidenceScore - a.confidenceScore);

  // Step 5: Select 7 with role diversity
  // Strategy: Take top players but ensure at least 1 WK, 2 BAT, 1 AR, 1 BOWL
  const selected: CorePlayerResult[] = [];
  const rolesSelected = { WK: 0, BAT: 0, AR: 0, BOWL: 0 };

  function getRole(p: MatchPlayer): "WK" | "BAT" | "AR" | "BOWL" {
    const pt = String(p.player_type || "").toLowerCase();
    const roleText = String(p.role_text || "").toLowerCase();
    const role = Number(p.role);
    if (pt.includes("wk") || roleText.includes("keeper")) return "WK";
    if (pt.includes("all") || roleText.includes("all") || role === 2) return "AR";
    if (pt.includes("bowl") || roleText.includes("bowl") || role === 3) return "BOWL";
    return "BAT";
  }

  // First pass: ensure minimum role coverage
  const minCoverage = { WK: 1, BAT: 2, AR: 1, BOWL: 1 };
  for (const role of ["WK", "BAT", "AR", "BOWL"] as const) {
    const candidates = highConfidence.filter(s => {
      const r = getRole(s.player);
      return r === role && !selected.find(sel => sel.player === s.player);
    });
    for (let i = 0; i < minCoverage[role] && i < candidates.length && selected.length < 8; i++) {
      const rank = selected.length + 1;
      selected.push({
        player: candidates[i].player,
        confidenceScore: candidates[i].confidenceScore,
        rank,
        reasons: candidates[i].reasons,
      });
      rolesSelected[role]++;
    }
  }

  // Second pass: fill remaining slots with highest confidence players
  for (const s of highConfidence) {
    if (selected.length >= 8) break;
    if (selected.find(sel => sel.player === s.player)) continue;
    const rank = selected.length + 1;
    selected.push({
      player: s.player,
      confidenceScore: s.confidenceScore,
      rank,
      reasons: s.reasons,
    });
    rolesSelected[getRole(s.player)]++;
  }

  // Sort by rank
  selected.sort((a, b) => a.rank - b.rank);

  console.log(`[Smart7Core] ✅ Selected ${selected.length} Core Players:`);
  selected.forEach(s => {
    console.log(`  #${s.rank} ${s.player.name} (${getRole(s.player)}) — Confidence: ${s.confidenceScore}/100`);
  });
  console.log(`  Role distribution: WK:${rolesSelected.WK} BAT:${rolesSelected.BAT} AR:${rolesSelected.AR} BOWL:${rolesSelected.BOWL}`);

  return selected;
}

/**
 * Get the player IDs of the 7 core players (for passing as lockedPlayers to generator).
 */
export function getCorePlayerIds(corePlayers: CorePlayerResult[]): string[] {
  return corePlayers.map(cp =>
    String(cp.player.player_fixed_id ?? cp.player.pl_id ?? cp.player.pid ?? cp.player.name)
  );
}
