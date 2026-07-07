import { NextResponse } from "next/server";

const BACKEND_URL = "https://tgsoftware-api.online";

/**
 * Fetch all teams already created by the user on Dream11/My11Circle for a match.
 *
 * Routes to:
 *   POST https://tgsoftware-api.online/api/fantasy/list-of-teams
 *   body: { fantasyApp, matchId, authToken }
 *
 * Returns:
 *   { status, teams: [{ teamId, teamNo, fantasyApp }] }
 *
 * Used by the Admin Contests tab to auto-populate the Team IDs field
 * (so the admin doesn't have to type comma-separated IDs manually).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fantasyApp, authToken, matchId } = body;

    if (!fantasyApp || !authToken || !matchId) {
      return NextResponse.json({
        status: "fail",
        message: "fantasyApp, authToken, and matchId are required",
        teams: [],
      }, { status: 200 });
    }

    const endpoint = `${BACKEND_URL}/api/fantasy/list-of-teams`;

    const payload = {
      fantasyApp,
      matchId: String(matchId),
      authToken,
    };

    const userToken = request.headers.get("authorization")?.replace("Bearer ", "");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (userToken) headers.Authorization = `Bearer ${userToken}`;

    console.log(`[Contest][MyTeams] ${fantasyApp} matchId=${matchId}`);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      });

      const responseText = await res.text();
      let data: Record<string, unknown>;
      try {
        // Try JSON first
        data = JSON.parse(responseText);
      } catch {
        // Maybe it's AES-encrypted — but for this route the backend usually
        // returns plain JSON. If not, return empty.
        console.error(`[Contest][MyTeams] Non-JSON response: HTTP ${res.status}`);
        return NextResponse.json({
          status: "fail",
          message: `Server returned non-JSON response (HTTP ${res.status})`,
          teams: [],
        }, { status: 200 });
      }

      const teamsList = Array.isArray(data.teams_list) ? data.teams_list : [];
      const teams = teamsList.map((t: any) => ({
        teamId: String(t.team_id ?? t.teamId ?? ""),
        teamNo: t.team_number ?? t.teamNo ?? null,
        fantasyApp,
      }));

      console.log(`[Contest][MyTeams] ${fantasyApp} found ${teams.length} teams`);

      return NextResponse.json({
        status: data.status || (res.ok ? "success" : "fail"),
        message: (data.message as string) || "",
        teams,
      }, { status: 200 });
    } catch (fetchErr) {
      const errMsg = fetchErr instanceof Error ? fetchErr.message : "unknown";
      console.error(`[Contest][MyTeams] Fetch error:`, errMsg);
      return NextResponse.json({
        status: "fail",
        message: `Could not fetch teams: ${errMsg}`,
        teams: [],
      }, { status: 200 });
    }
  } catch (error) {
    console.error("[Contest][MyTeams] Route error:", error);
    return NextResponse.json({
      status: "fail",
      message: "Server error",
      teams: [],
    }, { status: 200 });
  }
}
