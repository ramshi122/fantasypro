import { NextResponse } from "next/server";

const GOSCORER_API = "https://api.goscorer.com";

/**
 * Proxy for CREX (cricketexchange) live match data
 * GET /api/cricket-live?type=live
 * GET /api/cricket-live?type=upcoming
 * GET /api/cricket-live?type=scorecard&matchId=XXX
 * GET /api/cricket-live?type=commentary&matchId=XXX
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "live";
    const matchId = searchParams.get("matchId");

    let endpoint = "";
    switch (type) {
      case "live":
        endpoint = "/api/v3/getLiveMatches";
        break;
      case "upcoming":
        endpoint = "/api/v3/getUpcomingMatches";
        break;
      case "recent":
        endpoint = "/api/v3/getRecentMatches";
        break;
      case "scorecard":
        endpoint = `/api/v3/getScorecard?matchId=${matchId}`;
        break;
      case "commentary":
        endpoint = `/api/v3/getCommentary?matchId=${matchId}`;
        break;
      case "matchInfo":
        endpoint = `/api/v3/getMatchInfo?matchId=${matchId}`;
        break;
      default:
        endpoint = "/api/v3/getLiveMatches";
    }

    console.log(`[CricketLive] Fetching: ${GOSCORER_API}${endpoint}`);

    const res = await fetch(`${GOSCORER_API}${endpoint}`, {
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
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json({ status: "fail", message: "Non-JSON response" }, { status: 200 });
    }

    // Parse live matches into readable format
    if (type === "live" && data && typeof data === "object") {
      const matches = Object.entries(data).map(([key, v]: [string, any]) => ({
        matchId: key,
        team1Code: v.b || "?",
        team2Code: v.c || "?",
        team1Score: v.j || "",
        team2Score: v.k || "",
        result: v.res || "",
        format: v.fo || "",
        startTime: v.ti || 0,
        finishTime: v.finishTime || 0,
        venue: v.v || "",
        status: v.es_id || 0,
        winningTeam: v.wp || "",
        matchType: v.fo || "",
        eventStatus: v.es_id || 0,
        isLive: v.j ? true : false,
        isFinished: v.finishTime ? true : false,
        InningsStatus: v.n || 0,
        currentInnings: v.oi || "0",
      }));

      const response = NextResponse.json({
        status: "success",
        type: "live",
        count: matches.length,
        data: matches,
      }, { status: 200 });
      response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
      return response;
    }

    // For other types, pass through
    const response = NextResponse.json({
      status: "success",
      type,
      data,
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
