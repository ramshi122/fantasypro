import { NextResponse } from "next/server";

const BACKEND_URL = "https://tgsoftware-api.online";

/**
 * Join a contest with the given team IDs.
 *
 * Routes to the correct platform endpoint (matching original APK):
 *   dream11    → /api/dream11/contest/join-contest
 *   my11circle → /api/my11circle/contest/join-contest
 *
 * The original APK payload:
 *   { authToken, matchId, contestId, teamIds: [parseInt(team_id), ...] }
 *
 * IMPORTANT: The original APK doesn't pre-verify the auth token before joining
 * contests — it just tries and handles errors reactively (faster). We do the same.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fantasyApp, authToken, matchId, contestId, teamIds } = body;

    if (!fantasyApp || !authToken || !matchId || !contestId) {
      return NextResponse.json({
        status: "fail",
        message: "fantasyApp, authToken, matchId, and contestId are required",
        contestId: contestId || "",
        joinResults: [],
        summary: { successCount: 0, failedCount: Array.isArray(teamIds) ? teamIds.length : 0 },
      }, { status: 200 });
    }

    const endpoint =
      fantasyApp === "dream11"
        ? `${BACKEND_URL}/api/dream11/contest/join-contest`
        : `${BACKEND_URL}/api/my11circle/contest/join-contest`;

    // Ensure teamIds are numbers (matches original APK: parseInt(team_id))
    const numericTeamIds: number[] = Array.isArray(teamIds)
      ? teamIds.map((id: any) => typeof id === "number" ? id : parseInt(String(id), 10)).filter((n: number) => !isNaN(n))
      : [];

    console.log(`[Contest][Join] ${fantasyApp} matchId=${matchId} contestId=${contestId} teamIds=${numericTeamIds.length}`);

    const payload: Record<string, unknown> = {
      authToken,
      matchId: String(matchId),
      contestId: String(contestId),
      teamIds: numericTeamIds,
    };

    // Forward user_token if present
    const userToken = request.headers.get("authorization")?.replace("Bearer ", "");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (userToken) headers.Authorization = `Bearer ${userToken}`;

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });

      const responseText = await res.text();
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(responseText);
      } catch {
        console.error(`[Contest][Join] Non-JSON response: HTTP ${res.status}`);
        return NextResponse.json({
          status: "fail",
          message: `Server returned non-JSON response (HTTP ${res.status})`,
          contestId,
          joinResults: [],
          summary: { successCount: 0, failedCount: numericTeamIds.length },
        }, { status: 200 });
      }

      console.log(`[Contest][Join] ${fantasyApp} response: HTTP ${res.status}, status=${data.status}`);

      // Check for token expiry
      const msg = String(data.message || "").toLowerCase();
      const isTokenExpired =
        msg.includes("token expired") ||
        msg.includes("invalid token") ||
        msg.includes("jwt expired") ||
        msg.includes("session expired") ||
        msg.includes("not authenticated") ||
        msg.includes("authentication failed") ||
        msg.includes("proxy returned 400") ||
        msg.includes("proxy returned 401") ||
        msg.includes("proxy returned 403") ||
        res.status === 401 || res.status === 403;

      if (isTokenExpired) {
        return NextResponse.json({
          status: "fail",
          message: `Session expired on ${fantasyApp}. Please re-link your account via OTP verification.`,
          code: "TOKEN_EXPIRED",
          needsReauth: true,
          contestId,
          joinResults: [],
          summary: { successCount: 0, failedCount: numericTeamIds.length },
        }, { status: 200 });
      }

      // Extract join results and summary from response
      const joinResults = Array.isArray(data.joinResults) ? data.joinResults : [];
      const summary = (data.summary as { successCount: number; failedCount: number }) || {
        successCount: joinResults.filter((r: any) => r.success).length,
        failedCount: joinResults.filter((r: any) => !r.success).length,
      };

      return NextResponse.json({
        status: data.status || (res.ok ? "success" : "fail"),
        message: (data.message as string) || "",
        contestId,
        joinResults,
        summary,
      }, { status: 200 });
    } catch (fetchErr) {
      const errMsg = fetchErr instanceof Error ? fetchErr.message : "unknown";
      console.error(`[Contest][Join] Fetch error:`, errMsg);
      return NextResponse.json({
        status: "fail",
        message: `Could not join contest: ${errMsg}`,
        contestId,
        joinResults: [],
        summary: { successCount: 0, failedCount: numericTeamIds.length },
      }, { status: 200 });
    }
  } catch (error) {
    console.error("[Contest][Join] Route error:", error);
    return NextResponse.json({
      status: "fail",
      message: "Server error",
      contestId: "",
      joinResults: [],
      summary: { successCount: 0, failedCount: 0 },
    }, { status: 200 });
  }
}
