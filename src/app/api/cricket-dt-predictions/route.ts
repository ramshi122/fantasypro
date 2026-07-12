/**
 * Cricket DT Predictions API — ported from ai-match-hub/src/lib/cricket.functions.ts
 * getDtPredictions server fn → Next.js POST endpoint
 *
 * Uses our /api/call-ai endpoint (z-ai-web-dev-sdk) to compute DT predictions
 * grounded in 2026 form.
 *
 * POST body: {
 *   matchName: string,
 *   venue?: string,
 *   format?: string,
 *   series?: string,
 *   toss?: string,
 *   players: { id, name, team, role, inXI?: boolean | null }[]
 * }
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

    // Basic validation
    if (!data?.matchName || !Array.isArray(data?.players) || data.players.length === 0) {
      return NextResponse.json({ ok: false, error: "matchName + players[] required", predictions: [] });
    }

    const format = data.format || "T20";

    const sys = `You are a Dream11 fantasy cricket analyst. STRICT RULES:
1. USE ONLY 2026 LATEST DATA (current season form, recent 2026 matches). DO NOT use 2024 or earlier stats as primary signal.
2. Ground every estimate in actual 2026 player form. If a player has no 2026 appearances, set dtChance and selectionPct LOW.
3. Estimate dtChance = probability (0-100) the player makes the Dream Team for THIS match given 2026 form, role, venue, opposition and toss.
4. Estimate selectionPct = realistic Dream11 ownership % (0-100).
5. avg2026Pts = estimated average fantasy points using Dream11 ${format} scoring from 2026 matches only.
6. probableXI = true if the player is in the most likely starting XI for this match.
7. Return ONLY valid JSON. No prose. No markdown.`;

    const user = `MATCH: ${data.matchName}
SERIES: ${data.series || ""}
FORMAT: ${format}
VENUE: ${data.venue || ""}
TOSS: ${data.toss || "not yet"}

SQUAD (${data.players.length} players):
${data.players.map((p: any) => `- ${p.id} | ${p.name} | ${p.team} | ${p.role}${p.inXI === true ? " | ANNOUNCED XI" : p.inXI === false ? " | BENCH" : ""}`).join("\n")}

Return JSON of exact shape:
{ "predictions": [ { "id": "<id from above>", "dtChance": number, "selectionPct": number, "avg2026Pts": number, "probableXI": boolean, "reason": "<<=80 chars, mention 2026 form>" } ] }
Include EVERY player from the squad above. dtChance must be calibrated: top 11 probable XI players should average 55-90, bench 5-30.`;

    // Call our existing /api/call-ai endpoint
    const aiRes = await fetch(new URL("/api/call-ai", request.url).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: user, system: sys, json: true }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text().catch(() => "");
      return NextResponse.json({ ok: false, error: `AI HTTP ${aiRes.status}: ${txt.slice(0, 200)}`, predictions: [] });
    }

    const aiData = await aiRes.json();
    if (!aiData.ok) {
      return NextResponse.json({ ok: false, error: aiData.error || "AI failed", predictions: [] });
    }

    const content: string = aiData.content || "{}";
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      const m = content.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : { predictions: [] };
    }

    const arr: any[] = Array.isArray(parsed?.predictions) ? parsed.predictions : [];
    const byId = new Map<string, any>();
    for (const it of arr) if (it?.id) byId.set(String(it.id), it);

    const num = (v: any, d = 0) => {
      const n = Number(v);
      return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : d;
    };

    const predictions = data.players.map((p: any) => {
      const x = byId.get(p.id) ?? {};
      return {
        id: p.id,
        name: p.name,
        team: p.team,
        role: p.role,
        dtChance: num(x.dtChance, p.inXI === true ? 50 : 20),
        selectionPct: num(x.selectionPct, p.inXI === true ? 40 : 15),
        avg2026Pts: Math.max(0, Math.min(150, Number(x.avg2026Pts) || 0)),
        probableXI: typeof x.probableXI === "boolean" ? x.probableXI : p.inXI === true,
        reason: String(x.reason ?? "").slice(0, 120),
      };
    });

    return NextResponse.json({ ok: true, predictions });
  } catch (error) {
    console.error("[CricketDtPredictions] Error:", error);
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Server error",
      predictions: [],
    });
  }
}
