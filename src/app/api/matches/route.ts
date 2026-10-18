import { NextResponse } from "next/server";
import { buildMatchDetail, fetchP11Matches } from "@/lib/match-data-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/matches?sport=cricket   → list of matches (possible11.com, normalised)
 * GET /api/matches?id=94692        → single match incl. squads + real lineup_status
 *
 * possible11.com must be called server-side: its CORS preflight does not allow
 * the Content-Type header, so direct browser calls were blocked.
 */
export async function GET(request: Request) {
  const noCache = (res: NextResponse) => {
    res.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    res.headers.set("Pragma", "no-cache");
    res.headers.set("Expires", "0");
    return res;
  };

  try {
    const { searchParams } = new URL(request.url);
    const sport = searchParams.get("sport") || "cricket";
    const id = searchParams.get("id");

    if (id) {
      const match = await buildMatchDetail(id, sport);
      return noCache(NextResponse.json({ status: "success", match, data: match }, { status: 200 }));
    }

    const matches = await fetchP11Matches(sport);
    console.log(`[Matches] ${matches.length} ${sport} matches from possible11.com`);
    return noCache(NextResponse.json({ status: "success", data: matches }, { status: 200 }));
  } catch (error) {
    console.error("[Matches] Route error:", error);
    return NextResponse.json(
      { status: "fail", message: error instanceof Error ? error.message : "Server error", data: [] },
      { status: 200 }
    );
  }
}
