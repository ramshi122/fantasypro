/**
 * Cricket Coach API — ported from ai-match-hub/src/lib/coach.functions.ts
 * aiCoachAudit server fn → Next.js POST endpoint
 *
 * Uses our /api/call-ai endpoint (z-ai-web-dev-sdk) to generate a tactical audit.
 */

import { NextResponse } from "next/server";
import { verifyLicenseFromRequest, licenseErrorResponse } from "@/lib/api-license-guard";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    // LICENSE CHECK — verify subscription before processing
    const licenseCheck = await verifyLicenseFromRequest(request);
    if (!licenseCheck.valid) {
      return licenseErrorResponse(licenseCheck);
    }
    const data = await request.json();

    if (!data?.matchName || !data?.team1Name || !data?.team2Name) {
      return NextResponse.json({ ok: false, error: "matchName + team1Name + team2Name required", text: "" });
    }

    const prompt = `You are an elite fantasy cricket tactician. Give a concise tactical audit (max 220 words, plain text with short headed sections) for this matchup.

Match: ${data.matchName}
Format: ${data.format ?? "T20"}
Venue: ${data.venue ?? "Unknown"}
Toss: ${data.toss ?? "Not yet"}
Batting first: ${data.battingFirst}
Strategy: batting=${data.battingStrategy}, bowling=${data.bowlingStrategy}

Locked picks (${data.locked?.length ?? 0}/11):
${(data.locked ?? []).map((p: any) => `- ${p.name} (${p.team}, ${p.role})${p.isC ? " [C]" : ""}${p.isVc ? " [VC]" : ""}`).join("\n") || "None yet"}

Cover:
1) Pitch & venue read in 2 lines.
2) Toss impact on captaincy.
3) 2-3 specific player recommendations consistent with locked picks.
4) Captain / Vice-captain advice.
5) One risk/differential pick.

Be specific and tactical. Do not list disclaimers.`;

    const aiRes = await fetch(new URL("/api/call-ai", request.url).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text().catch(() => "");
      return NextResponse.json({ ok: false, error: `AI HTTP ${aiRes.status}: ${txt.slice(0, 200)}`, text: "" });
    }

    const aiData = await aiRes.json();
    if (!aiData.ok) {
      return NextResponse.json({ ok: false, error: aiData.error || "AI failed", text: "" });
    }

    return NextResponse.json({ ok: true, text: aiData.content });
  } catch (error) {
    console.error("[CricketCoach] Error:", error);
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Server error",
      text: "",
    });
  }
}
