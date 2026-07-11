import { NextResponse } from "next/server";

const GOSCORER_API = "https://api.goscorer.com";

function extractTeamNames(result: string): { team1?: string; team2?: string } {
  if (!result) return {};
  // "Los Angeles Knight Riders won by 18 runs"
  const m1 = result.match(/^(.+?) won by/);
  if (m1) return { team1: m1[1].trim() };
  // "X beat Y by..."
  const m2 = result.match(/^(.+?) beat (.+?) by/);
  if (m2) return { team1: m2[1].trim(), team2: m2[2].trim() };
  // "X won the toss and elected to bat"
  const m3 = result.match(/^(.+?) won the toss/);
  if (m3) return { team1: m3[1].trim() };
  return {};
}

/**
 * CREX Cricket Live — scraped from api.goscorer.com
 * GET /api/cricket-live?type=live
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "live";

    if (type !== "live") {
      return NextResponse.json({ status: "fail", message: "Only type=live supported", data: [] }, { status: 200 });
    }

    console.log("[CricketLive] Fetching from api.goscorer.com...");

    const res = await fetch(`${GOSCORER_API}/api/v3/getLiveMatches`, {
      method: "GET",
      headers: {
        "Accept": "application/json, text/plain, */*",
        "User-Agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36",
        "Origin": "https://crex.com",
        "Referer": "https://crex.com/",
      },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });

    const text = await res.text();
    let rawData: any;
    try {
      rawData = JSON.parse(text);
    } catch {
      return NextResponse.json({ status: "fail", message: "Non-JSON response", data: [] }, { status: 200 });
    }

    if (!rawData || typeof rawData !== "object") {
      return NextResponse.json({ status: "fail", message: "Invalid data", data: [] }, { status: 200 });
    }

    // Parse all matches with full data extraction
    const matches = Object.entries(rawData).map(([key, v]: [string, any]) => {
      const result = v.res || "";
      const names = extractTeamNames(result);

      return {
        matchId: key,
        team1Code: v.b || "?",
        team2Code: v.c || "?",
        team1Name: names.team1 || "",
        team2Name: names.team2 || "",
        team1Score: v.j || "",
        team2Score: v.k || "",
        result: result,
        format: v.fo || "",
        startTime: v.ti || 0,
        finishTime: v.finishTime || 0,
        venue: v.v || "",
        status: v.es_id || 0,
        winningTeam: v.wp || "",
        isLive: v.j ? true : false,
        isFinished: v.finishTime ? true : false,
        currentInnings: v.oi || "0",
        inningsStatus: v.n || 0,
        // Raw encoded fields for debugging
        rawQ: v.q || "",
        rawR: v.r || "",
        rawA: v.a || "",
        rawFlb: v.flb || "",
      };
    });

    // Sort: live first, then upcoming, then finished
    matches.sort((a, b) => {
      if (a.isLive && !a.isFinished && !(b.isLive && !b.isFinished)) return -1;
      if (!(a.isLive && !a.isFinished) && b.isLive && !b.isFinished) return 1;
      return (a.startTime || 0) - (b.startTime || 0);
    });

    console.log(`[CricketLive] Parsed ${matches.length} matches (${matches.filter(m => m.isLive && !m.isFinished).length} live)`);

    const response = NextResponse.json({
      status: "success",
      type: "live",
      count: matches.length,
      liveCount: matches.filter(m => m.isLive && !m.isFinished).length,
      upcomingCount: matches.filter(m => !m.isLive && !m.isFinished).length,
      finishedCount: matches.filter(m => m.isFinished).length,
      data: matches,
      source: "api.goscorer.com (CREX Cricket Exchange)",
    }, { status: 200 });
    response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    return response;

  } catch (error) {
    console.error("[CricketLive] Error:", error);
    return NextResponse.json({
      status: "fail",
      message: error instanceof Error ? error.message : "Server error",
      data: [],
    }, { status: 200 });
  }
}
