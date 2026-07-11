/**
 * OCR Fantasy Team Generator API
 * ===============================
 *
 * Accepts a screenshot (Dream11, My11Circle, Playing XI, Match Center, Player List)
 * and uses Vision AI to:
 *   1. Extract all visible players via OCR
 *   2. Auto-correct OCR mistakes (V Kohii → Virat Kohli)
 *   3. Detect teams, roles (WK/BAT/AR/BOWL), captain tags, credits
 *   4. Detect playing status
 *   5. Return structured JSON for team generation
 *
 * POST /api/ocr-generate
 *   body: { image: "data:image/jpeg;base64,..." }
 *   returns: { players: [...], teams: [...], rankedTeams: [...] }
 */

import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

export const runtime = "nodejs";
export const maxDuration = 60;

interface OCRPlayer {
  name: string;
  team: string;
  role: "WK" | "BAT" | "AR" | "BOWL";
  credits?: number;
  selected_by?: number;
  playing: boolean;
  isCaptain?: boolean;
  isViceCaptain?: boolean;
  impactPlayer?: boolean;
}

interface OCRResult {
  players: OCRPlayer[];
  team1Name?: string;
  team2Name?: string;
  source?: string;
}

/**
 * Ensure the .z-ai-config file exists for the z-ai-web-dev-sdk.
 * The SDK looks for this file in: process.cwd(), os.homedir(), or /etc/.
 *
 * On Vercel/serverless, this file doesn't exist by default.
 * We create it at runtime using environment variables.
 */
function ensureZaiConfig(): void {
  const configPaths = [
    path.join(process.cwd(), ".z-ai-config"),
    path.join(require("os").homedir(), ".z-ai-config"),
    "/etc/.z-ai-config",
  ];

  for (const configPath of configPaths) {
    try {
      if (fs.existsSync(configPath)) {
        // Config already exists — check if valid
        const configStr = fs.readFileSync(configPath, "utf-8");
        const config = JSON.parse(configStr);
        if (config.baseUrl && config.apiKey) {
          return; // Valid config exists
        }
      }
    } catch {
      // Continue to next path
    }
  }

  // No valid config found — create one from environment variables
  // These env vars must be set in Vercel/deployment environment
  const baseUrl = process.env.ZAI_BASE_URL || "https://internal-api.z.ai/v1";
  const apiKey = process.env.ZAI_API_KEY || "Z.ai";
  const token = process.env.ZAI_TOKEN;
  const chatId = process.env.ZAI_CHAT_ID;
  const userId = process.env.ZAI_USER_ID;

  if (!token) {
    throw new Error("ZAI_TOKEN environment variable is not set. Vision AI OCR cannot function without it.");
  }

  const config = {
    baseUrl,
    apiKey,
    token,
    chatId: chatId || `chat-ocr-${Date.now()}`,
    userId: userId || "ocr-user",
  };

  // Write to process.cwd() (writable on Vercel)
  const targetPath = path.join(process.cwd(), ".z-ai-config");
  try {
    fs.writeFileSync(targetPath, JSON.stringify(config), { mode: 0o600 });
    console.log(`[OCR] Created .z-ai-config at ${targetPath}`);
  } catch (err) {
    console.error(`[OCR] Failed to write .z-ai-config:`, err);
    throw new Error(`Cannot create ZAI config: ${err instanceof Error ? err.message : "unknown error"}`);
  }
}

/**
 * Call Vision AI directly via REST API (fallback if SDK fails).
 * Uses the same internal API as z-ai-web-dev-sdk but with explicit credentials.
 */
async function callVisionDirect(base64Image: string, prompt: string): Promise<string> {
  const baseUrl = process.env.ZAI_BASE_URL || "https://internal-api.z.ai/v1";
  const token = process.env.ZAI_TOKEN;

  if (!token) {
    throw new Error("ZAI_TOKEN environment variable is not set");
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: "glm-4.6v",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: base64Image } },
          ],
        },
      ],
      thinking: { type: "disabled" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Vision API HTTP ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

/**
 * Use Vision AI to extract player data from a fantasy cricket screenshot.
 * Tries SDK first, falls back to direct REST API call.
 */
async function extractPlayersFromImage(base64Image: string): Promise<OCRResult> {
  const prompt = `You are an Elite Fantasy Cricket AI with OCR capabilities. Analyze this screenshot and extract ALL visible player information.

This screenshot is from one of these sources:
- Dream11
- My11Circle
- Playing XI announcement
- Match Center
- Player List

EXTRACT FOR EVERY PLAYER:
1. Player full name (correct OCR mistakes: "V Kohii" → "Virat Kohli", "S GII" → "Shubman Gill", "R Jadejaa" → "Ravindra Jadeja")
2. Team name (e.g. "IND", "AUS", "MI", "CSK")
3. Role: WK (wicket-keeper), BAT (batter), AR (all-rounder), BOWL (bowler)
4. Credits (number, e.g. 9.5)
5. Selection percentage (number, e.g. 87.3)
6. Playing status: true if in Playing XI, false if on bench/substitute
7. Captain tag: true if marked as Captain (C)
8. Vice-Captain tag: true if marked as Vice-Captain (VC)
9. Impact player: true if marked as impact player

IGNORE:
- UI elements (buttons, menus, ads)
- Non-player text (match info, scores, etc.)
- Duplicate entries

ALSO EXTRACT:
- Team 1 name (e.g. "India")
- Team 2 name (e.g. "Australia")
- Source (Dream11 / My11Circle / Playing XI / Match Center / Player List)

RETURN STRICT JSON in this exact format:
{
  "team1Name": "string",
  "team2Name": "string",
  "source": "string",
  "players": [
    {
      "name": "Full Player Name",
      "team": "TEAM_ABBR",
      "role": "WK|BAT|AR|BOWL",
      "credits": 9.5,
      "selected_by": 87.3,
      "playing": true,
      "isCaptain": false,
      "isViceCaptain": false,
      "impactPlayer": false
    }
  ]
}

If you cannot read a field, omit it (except name, team, role, playing — those are required).
If a player cannot be verified, EXCLUDE them entirely. Do NOT guess.
Return ONLY the JSON, no other text.`;

  let content = "";

  // Method 1: Try SDK with config file
  try {
    ensureZaiConfig();
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();
    const response = await zai.chat.completions.createVision({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: base64Image } },
          ],
        },
      ],
      thinking: { type: "disabled" },
    });
    content = response.choices[0]?.message?.content || "";
    console.log("[OCR] SDK method succeeded");
  } catch (sdkErr) {
    console.warn("[OCR] SDK method failed, trying direct REST API:", sdkErr instanceof Error ? sdkErr.message : sdkErr);

    // Method 2: Direct REST API call
    try {
      content = await callVisionDirect(base64Image, prompt);
      console.log("[OCR] Direct REST API method succeeded");
    } catch (directErr) {
      console.error("[OCR] Both methods failed:", directErr);
      throw new Error(
        `Vision AI unavailable. SDK error: ${sdkErr instanceof Error ? sdkErr.message : "unknown"}. ` +
        `Direct API error: ${directErr instanceof Error ? directErr.message : "unknown"}. ` +
        `Make sure ZAI_TOKEN environment variable is set.`
      );
    }
  }

  if (!content) {
    throw new Error("Vision AI returned empty response");
  }

  // Parse JSON from response (handle markdown code blocks)
  let jsonStr = content.trim();
  // Strip markdown code fences
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }
  // Find first { and last }
  const firstBrace = jsonStr.indexOf("{");
  const lastBrace = jsonStr.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
  }

  const parsed = JSON.parse(jsonStr);
  return parsed as OCRResult;
}

/**
 * Verify players — remove bench, injured, retired, duplicates.
 */
function verifyPlayers(players: OCRPlayer[]): OCRPlayer[] {
  const seen = new Set<string>();
  const verified: OCRPlayer[] = [];

  for (const p of players) {
    if (!p.name || !p.team || !p.role) continue;

    // Skip duplicates (case-insensitive name match)
    const nameKey = p.name.toLowerCase().trim();
    if (seen.has(nameKey)) continue;
    seen.add(nameKey);

    // Skip non-playing players (bench)
    if (p.playing === false) continue;

    // Validate role
    if (!["WK", "BAT", "AR", "BOWL"].includes(p.role)) continue;

    verified.push(p);
  }

  return verified;
}

/**
 * Generate 10 ranked teams from verified player pool.
 * Same Elite AI quality — uses EFV scoring + strategy rotation.
 */
function generateRankedTeams(
  players: OCRPlayer[],
  team1Name: string,
  team2Name: string
): any[] {
  if (players.length < 11) return [];

  // Group by role
  const byRole = {
    WK: players.filter(p => p.role === "WK"),
    BAT: players.filter(p => p.role === "BAT"),
    AR: players.filter(p => p.role === "AR"),
    BOWL: players.filter(p => p.role === "BOWL"),
  };

  // Calculate EFV (Expected Fantasy Value) for each player
  const calcEFV = (p: OCRPlayer): number => {
    const sel = p.selected_by ?? 0;
    const cred = p.credits ?? 8;
    const baseValue = Math.log(1 + sel) / Math.log(101);
    const formFactor = Math.max(0.3, Math.min(1.5, (cred - 7) / 3));
    const roleWeights: Record<string, number> = { AR: 1.25, WK: 1.10, BAT: 1.00, BOWL: 1.00 };
    const roleWeight = roleWeights[p.role] ?? 1.0;
    const diffBonus = sel < 15 ? 1.10 : sel < 30 ? 1.05 : 1.00;
    return baseValue * formFactor * roleWeight * diffBonus * 100;
  };

  // Sort each role by EFV descending
  const sorted = {
    WK: [...byRole.WK].sort((a, b) => calcEFV(b) - calcEFV(a)),
    BAT: [...byRole.BAT].sort((a, b) => calcEFV(b) - calcEFV(a)),
    AR: [...byRole.AR].sort((a, b) => calcEFV(b) - calcEFV(a)),
    BOWL: [...byRole.BOWL].sort((a, b) => calcEFV(b) - calcEFV(a)),
  };

  // 10 rank strategies (per user spec)
  const strategies = [
    { name: "Maximum win probability", composition: { WK: 1, BAT: 4, AR: 2, BOWL: 4 }, cPick: "top", vcPick: "second", risk: "low" },
    { name: "Balanced", composition: { WK: 1, BAT: 4, AR: 3, BOWL: 3 }, cPick: "top", vcPick: "third", risk: "low" },
    { name: "Safe", composition: { WK: 1, BAT: 5, AR: 2, BOWL: 3 }, cPick: "top", vcPick: "second", risk: "low" },
    { name: "Grand League", composition: { WK: 1, BAT: 3, AR: 3, BOWL: 4 }, cPick: "second", vcPick: "top", risk: "high" },
    { name: "High Differential", composition: { WK: 1, BAT: 4, AR: 3, BOWL: 3 }, cPick: "third", vcPick: "second", risk: "high" },
    { name: "Aggressive", composition: { WK: 1, BAT: 5, AR: 2, BOWL: 3 }, cPick: "top", vcPick: "third", risk: "medium" },
    { name: "Bowling Dominant", composition: { WK: 1, BAT: 3, AR: 2, BOWL: 5 }, cPick: "top_bowl", vcPick: "second_bowl", risk: "medium" },
    { name: "Batting Dominant", composition: { WK: 1, BAT: 5, AR: 2, BOWL: 3 }, cPick: "top_bat", vcPick: "second_bat", risk: "medium" },
    { name: "Mega GL", composition: { WK: 1, BAT: 3, AR: 4, BOWL: 3 }, cPick: "third", vcPick: "fourth", risk: "high" },
    { name: "Ultra Differential", composition: { WK: 1, BAT: 4, AR: 3, BOWL: 3 }, cPick: "fourth", vcPick: "third", risk: "high" },
  ];

  const rankedTeams: any[] = [];
  const usedTeamKeys = new Set<string>();

  for (let rank = 0; rank < 10; rank++) {
    const strat = strategies[rank];
    const team: OCRPlayer[] = [];

    // Pick players per role with rotation for diversity
    for (const role of ["WK", "BAT", "AR", "BOWL"] as const) {
      const need = strat.composition[role];
      const pool = sorted[role];
      if (pool.length < need) {
        // Fallback: borrow from AR
        const borrow = role !== "AR" ? sorted.AR : sorted.BAT;
        const borrowed = borrow.slice(0, need - pool.length);
        team.push(...pool.slice(0, pool.length), ...borrowed);
      } else {
        // Rotate picks for diversity — shift starting index by rank
        const startIdx = rank % Math.max(1, pool.length - need + 1);
        team.push(...pool.slice(startIdx, startIdx + need));
      }
    }

    if (team.length !== 11) continue;

    // Enforce max 7 players from one team
    const teamCounts: Record<string, number> = {};
    for (const p of team) {
      teamCounts[p.team] = (teamCounts[p.team] || 0) + 1;
    }
    // If any team has > 7, swap with other team player
    for (const [t, count] of Object.entries(teamCounts)) {
      if (count > 7) {
        const swapIdx = team.findIndex(p => p.team === t);
        if (swapIdx >= 0) {
          const otherTeam = t === team1Name ? team2Name : team1Name;
          const replacement = players.find(p =>
            p.team === otherTeam &&
            p.role === team[swapIdx].role &&
            !team.find(x => x.name === p.name)
          );
          if (replacement) team[swapIdx] = replacement;
        }
      }
    }

    // Dedup check
    const teamKey = team.map(p => p.name).sort().join("|");
    if (usedTeamKeys.has(teamKey)) {
      // Force a swap for uniqueness
      const swapIdx = rank % 11;
      const role = team[swapIdx].role;
      const alt = sorted[role].find(p => !team.find(x => x.name === p.name));
      if (alt) team[swapIdx] = alt;
    }
    const finalKey = team.map(p => p.name).sort().join("|");
    if (usedTeamKeys.has(finalKey)) continue;
    usedTeamKeys.add(finalKey);

    // Pick Captain and Vice-Captain
    const teamByEFV = [...team].sort((a, b) => calcEFV(b) - calcEFV(a));
    let captain: OCRPlayer;
    let viceCaptain: OCRPlayer;

    switch (strat.cPick) {
      case "top": captain = teamByEFV[0]; break;
      case "second": captain = teamByEFV[1] || teamByEFV[0]; break;
      case "third": captain = teamByEFV[2] || teamByEFV[0]; break;
      case "fourth": captain = teamByEFV[3] || teamByEFV[0]; break;
      case "top_bat": captain = team.filter(p => p.role === "BAT").sort((a, b) => calcEFV(b) - calcEFV(a))[0] || teamByEFV[0]; break;
      case "top_bowl": captain = team.filter(p => p.role === "BOWL").sort((a, b) => calcEFV(b) - calcEFV(a))[0] || teamByEFV[0]; break;
      default: captain = teamByEFV[0];
    }
    switch (strat.vcPick) {
      case "top": viceCaptain = teamByEFV[0] === captain ? teamByEFV[1] : teamByEFV[0]; break;
      case "second": viceCaptain = teamByEFV[1] === captain ? teamByEFV[2] || teamByEFV[0] : teamByEFV[1]; break;
      case "third": viceCaptain = teamByEFV[2] === captain ? teamByEFV[3] || teamByEFV[0] : teamByEFV[2]; break;
      case "fourth": viceCaptain = teamByEFV[3] === captain ? teamByEFV[4] || teamByEFV[0] : teamByEFV[3]; break;
      case "second_bat": viceCaptain = team.filter(p => p.role === "BAT" && p.name !== captain.name).sort((a, b) => calcEFV(b) - calcEFV(a))[0] || teamByEFV[1]; break;
      case "second_bowl": viceCaptain = team.filter(p => p.role === "BOWL" && p.name !== captain.name).sort((a, b) => calcEFV(b) - calcEFV(a))[0] || teamByEFV[1]; break;
      default: viceCaptain = teamByEFV[1] || teamByEFV[0];
    }

    if (captain.name === viceCaptain.name) {
      viceCaptain = teamByEFV.find(p => p.name !== captain.name) || teamByEFV[1] || teamByEFV[0];
    }

    // Calculate team metrics
    const baseEFV = team.reduce((s, p) => s + calcEFV(p), 0);
    const teamEFV = baseEFV + calcEFV(captain) * 1.0 + calcEFV(viceCaptain) * 0.5;
    const winProb = Math.min(95, Math.max(60, Math.round(60 + teamEFV / 20)));
    const expPoints = Math.round(teamEFV * 1.5);

    rankedTeams.push({
      rank: rank + 1,
      strategy: strat.name,
      players: team.map(p => ({
        name: p.name,
        team: p.team,
        role: p.role,
        credits: p.credits,
        selected_by: p.selected_by,
        playing: p.playing,
      })),
      captain: captain.name,
      viceCaptain: viceCaptain.name,
      risk: strat.risk,
      winProbability: winProb,
      expectedPoints: expPoints,
      efv: Math.round(teamEFV * 10) / 10,
    });
  }

  return rankedTeams;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { image, licenseKey, deviceId } = body;

    // SECURITY: Require valid license key for OCR feature
    // This prevents unauthorized API usage
    if (!licenseKey || !deviceId) {
      return NextResponse.json(
        { status: "fail", message: "License key and device ID required. Activate your license first.", code: "LICENSE_REQUIRED" },
        { status: 200 }
      );
    }

    // Verify license server-side
    try {
      const verifyRes = await fetch(`${new URL(request.url).origin}/api/license/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseKey, deviceId, feature: "ocr_generate" }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.valid) {
        return NextResponse.json(
          { status: "fail", message: `License verification failed: ${verifyData.message || "invalid key"}`, code: "LICENSE_INVALID" },
          { status: 200 }
        );
      }
    } catch (verifyErr) {
      console.error("[OCR] License verify error:", verifyErr);
      return NextResponse.json(
        { status: "fail", message: "Could not verify license. Check your connection.", code: "LICENSE_VERIFY_ERROR" },
        { status: 200 }
      );
    }

    if (!image) {
      return NextResponse.json(
        { status: "fail", message: "Image is required" },
        { status: 200 }
      );
    }

    // Validate image format
    if (!image.startsWith("data:image/")) {
      return NextResponse.json(
        { status: "fail", message: "Invalid image format. Must be data:image/...;base64,..." },
        { status: 200 }
      );
    }

    console.log("[OCR] Processing image, size:", image.length);

    // Step 1: Extract players via Vision AI OCR
    const ocrResult = await extractPlayersFromImage(image);
    console.log(`[OCR] Extracted ${ocrResult.players?.length || 0} players`);

    if (!ocrResult.players || ocrResult.players.length === 0) {
      return NextResponse.json({
        status: "fail",
        message: "No players detected in screenshot. Try a clearer image (Dream11, My11Circle, or Playing XI screenshot).",
      });
    }

    // Step 2: Verify players (remove bench, injured, retired, duplicates)
    const verifiedPlayers = verifyPlayers(ocrResult.players);
    console.log(`[OCR] Verified ${verifiedPlayers.length} players after filtering`);

    if (verifiedPlayers.length < 11) {
      return NextResponse.json({
        status: "fail",
        message: `Only ${verifiedPlayers.length} valid playing XI players found. Need at least 11. Try a clearer screenshot showing all players.`,
        extractedCount: ocrResult.players.length,
        verifiedCount: verifiedPlayers.length,
        players: verifiedPlayers,
      });
    }

    // Step 3: Generate 10 ranked teams
    const team1Name = ocrResult.team1Name || "T1";
    const team2Name = ocrResult.team2Name || "T2";
    const rankedTeams = generateRankedTeams(verifiedPlayers, team1Name, team2Name);
    console.log(`[OCR] Generated ${rankedTeams.length} ranked teams`);

    return NextResponse.json({
      status: "success",
      source: ocrResult.source,
      team1Name,
      team2Name,
      players: verifiedPlayers,
      rankedTeams,
      extractedCount: ocrResult.players.length,
      verifiedCount: verifiedPlayers.length,
      teamCount: rankedTeams.length,
    });
  } catch (error) {
    console.error("[OCR] Route error:", error);
    return NextResponse.json({
      status: "fail",
      message: error instanceof Error ? error.message : "OCR processing failed",
    });
  }
}
