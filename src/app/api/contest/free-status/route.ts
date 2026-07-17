import { NextResponse } from "next/server";
import { verifyLicenseFromRequest, licenseErrorResponse } from "@/lib/api-license-guard";

const BACKEND_URL = "https://tgsoftware-api.online";

/**
 * Fetch all free contests available for a match + the user's linked account.
 *
 * Routes to the correct platform endpoint (matching original APK):
 *   dream11    → /api/dream11/contest/all-free-status
 *   my11circle → /api/my11circle/contest/all-free-status
 *
 * The original APK payload:
 *   { authToken, matchId, allTeamIds: [parseInt(team_id), ...] }
 *
 * Response (on success):
 *   { status: "success", contests: [{ contestId, contestName, ... }] }
 */
export async function POST(request: Request) {
  try {
    // LICENSE CHECK — verify subscription before fetching free contests
    const licenseCheck = await verifyLicenseFromRequest(request);
    if (!licenseCheck.valid) {
      return licenseErrorResponse(licenseCheck);
    }
    const body = await request.json();
    const { fantasyApp, authToken, matchId, allTeamIds } = body;

    if (!fantasyApp || !authToken || !matchId) {
      return NextResponse.json(
        { status: "fail", message: "fantasyApp, authToken, and matchId are required", contests: [] },
        { status: 200 }
      );
    }

    const endpoint =
      fantasyApp === "dream11"
        ? `${BACKEND_URL}/api/dream11/contest/all-free-status`
        : `${BACKEND_URL}/api/my11circle/contest/all-free-status`;

    // Ensure allTeamIds are numbers (matches original APK: parseInt(team_id))
    const numericTeamIds: number[] = Array.isArray(allTeamIds)
      ? allTeamIds.map((id: any) => typeof id === "number" ? id : parseInt(String(id), 10)).filter((n: number) => !isNaN(n))
      : [];

    console.log(`[Contest][FreeStatus] ${fantasyApp} matchId=${matchId} teamIds=${numericTeamIds.length}`);

    const payload: Record<string, unknown> = {
      authToken,
      matchId: String(matchId),
      allTeamIds: numericTeamIds,
    };

    // Forward user_token if present (the original APK sends it as Bearer)
    const userToken = request.headers.get("authorization")?.replace("Bearer ", "");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (userToken) headers.Authorization = `Bearer ${userToken}`;

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
        data = JSON.parse(responseText);
      } catch {
        console.error(`[Contest][FreeStatus] Non-JSON response: HTTP ${res.status}`);
        return NextResponse.json({
          status: "fail",
          message: `Server returned non-JSON response (HTTP ${res.status})`,
          contests: [],
        }, { status: 200 });
      }

      console.log(`[Contest][FreeStatus] ${fantasyApp} response: HTTP ${res.status}, status=${data.status}, contests=${Array.isArray(data.contests) ? data.contests.length : 0}`);

      // Pass through the backend response
      return NextResponse.json({
        status: data.status || (res.ok ? "success" : "fail"),
        message: (data.message as string) || "",
        contests: Array.isArray(data.contests) ? data.contests : [],
      }, { status: 200 });
    } catch (fetchErr) {
      const errMsg = fetchErr instanceof Error ? fetchErr.message : "unknown";
      console.error(`[Contest][FreeStatus] Fetch error:`, errMsg);
      return NextResponse.json({
        status: "fail",
        message: `Could not fetch free contests: ${errMsg}`,
        contests: [],
      }, { status: 200 });
    }
  } catch (error) {
    console.error("[Contest][FreeStatus] Route error:", error);
    return NextResponse.json({
      status: "fail",
      message: "Server error",
      contests: [],
    }, { status: 200 });
  }
}
