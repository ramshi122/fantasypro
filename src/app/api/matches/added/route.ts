import { NextResponse } from "next/server";

const BACKEND_URL = "https://tgsoftware-api.online"; // FIX: fantasy endpoints (OTP/auth/transfer/contest) live here — possible11.com 404s them all

/**
 * Proxy for /api/{platform}/added-matches
 * Returns matches already added to DB by admin.
 * GET /api/matches/added?platform=my11circle|jumbo
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform") || "my11circle";

    console.log(`[AddedMatches] Fetching ${platform} added matches...`);

    const res = await fetch(`${BACKEND_URL}/api/${platform}/added-matches`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/plain, */*",
      },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });

    const text = await res.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ status: "fail", message: "Non-JSON response" }, { status: 200 });
    }

    if (!body.success) {
      return NextResponse.json({ status: "fail", message: body.message || "Backend error", data: [] }, { status: 200 });
    }

    const matches = (body.matches || []).map((m: any) => ({
      matchId: String(m.my11circleMatchId || m.jumboMatchId || m.matchId || ""),
      teams: m.teams || "",
      team1: m.teams ? m.teams.split(" vs ")[0] : "",
      team2: m.teams ? m.teams.split(" vs ")[1] : "",
      matchTime: m.matchTime || null,
      startTime: m.matchTime ? new Date(m.matchTime).getTime() : 0,
      sportIndex: m.sportIndex,
      source: m.source || platform,
    }));

    const response = NextResponse.json({
      status: "success",
      count: body.count || matches.length,
      matchIds: body.matchIds || [],
      directMatchIds: body.directMatchIds || [],
      mappedMatchIds: body.mappedMatchIds || [],
      data: matches,
    }, { status: 200 });

    response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    return response;

  } catch (error) {
    console.error("[AddedMatches] Route error:", error);
    return NextResponse.json({
      status: "fail",
      message: error instanceof Error ? error.message : "Server error",
      data: [],
    }, { status: 200 });
  }
}
