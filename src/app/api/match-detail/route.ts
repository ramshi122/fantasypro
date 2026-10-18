import { NextResponse } from "next/server";
import { buildMatchDetail } from "@/lib/match-data-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/match-detail?matchId=94692
 *
 * Returns match info + REAL squads (left_team_players / right_team_players).
 *
 * possible11.com getMatchDetails returns an array of HTML preview blocks
 * (no players, no {status,data} wrapper) and getPlayers returns masked names,
 * so players are loaded from Cricbuzz using possible11's `crickid`.
 * See src/lib/match-data-server.ts.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const matchId = searchParams.get("matchId");
    const sport = searchParams.get("sport") || "cricket";

    if (!matchId) {
      return NextResponse.json({ status: "fail", message: "matchId is required" }, { status: 200 });
    }

    const data = await buildMatchDetail(matchId, sport);
    const total = data.left_team_players.length + data.right_team_players.length;
    console.log(
      `[MatchDetail] ${matchId}: ${data.left_team_players.length}+${data.right_team_players.length} players (cricbuzz=${data.cricbuzzId ?? "n/a"}, lineup=${data.lineup_status})`
    );

    const response = NextResponse.json(
      {
        status: "success",
        data,
        message: total === 0 ? "Squads not announced yet for this match" : undefined,
      },
      { status: 200 }
    );
    response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    return response;
  } catch (error) {
    console.error("[MatchDetail] Route error:", error);
    return NextResponse.json(
      { status: "fail", message: error instanceof Error ? error.message : "Server error" },
      { status: 200 }
    );
  }
}
