import { NextResponse } from "next/server";

const BACKEND_URL = "https://possible11.com";

/**
 * Verify the auth token before starting transfers.
 * This matches the ORIGINAL APK flow exactly:
 * 1. Call /api/fantasy/auth/verify with {fantasyApp, authToken, matchId}
 * 2. If validToken is true, proceed with transfers
 * 3. If updateUiToken is true and authToken is returned, update the stored token
 * 4. If validToken is false, the token is expired and needs re-linking
 *
 * IMPORTANT: This endpoint should ONLY be called for transfer operations,
 * NOT for contest joining. The original APK doesn't verify before joining
 * contests - it just tries and handles errors reactively (faster).
 *
 * my11circle requires additional fields: my11circleChallenge, my11circleUserId, my11circleMobile
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fantasyApp, authToken, matchId, my11circleChallenge, my11circleUserId, my11circleMobile } = body;

    if (!fantasyApp || !authToken) {
      return NextResponse.json(
        { validToken: false, error: "fantasyApp and authToken are required" },
        { status: 200 }
      );
    }

    const payload: Record<string, string | null> = { fantasyApp, authToken };
    if (matchId) payload.matchId = String(matchId);

    // my11circle-specific fields (matching original APK exactly)
    if (fantasyApp === "my11circle") {
      if (my11circleChallenge) payload.my11circleChallenge = String(my11circleChallenge);
      if (my11circleUserId) payload.my11circleUserId = String(my11circleUserId);
      if (my11circleMobile) payload.my11circleMobile = String(my11circleMobile);
    }

    console.log(`[AuthVerify] Verifying ${fantasyApp} token (len: ${String(authToken).length})`);

    try {
      const res = await fetch(`${BACKEND_URL}/api/fantasy/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      });

      const responseText = await res.text();
      let data: Record<string, unknown>;

      try {
        data = JSON.parse(responseText);
      } catch {
        console.error(`[AuthVerify] Non-JSON response: HTTP ${res.status}`);
        // Can't verify - assume token is OK to try transfer
        // This prevents false "token expired" errors from network issues
        return NextResponse.json({
          validToken: null,
          retryable: true,
          message: "Could not verify token - server returned unexpected response",
        }, { status: 200 });
      }

      console.log(`[AuthVerify] ${fantasyApp} response: HTTP ${res.status}, validToken=${data.validToken}, updateUiToken=${!!data.updateUiToken}`);

      // If the backend returns HTTP 401/403, treat as token expired
      if (res.status === 401 || res.status === 403) {
        console.error(`[AuthVerify] HTTP ${res.status} - treating as token expired`);
        return NextResponse.json({
          validToken: false,
          error: "Token expired or invalid",
          needsReauth: true,
        }, { status: 200 });
      }

      // Pass through the backend response
      return NextResponse.json(data, { status: 200 });
    } catch (fetchErr) {
      const errMsg = fetchErr instanceof Error ? fetchErr.message : "unknown";
      console.error(`[AuthVerify] Fetch error:`, errMsg);
      // Network error - can't verify, but don't block transfer
      // This prevents false "token expired" errors from timeouts
      return NextResponse.json({
        validToken: null,
        retryable: true,
        message: "Could not verify token due to network error",
      }, { status: 200 });
    }
  } catch (error) {
    console.error("[AuthVerify] Route error:", error);
    return NextResponse.json(
      { validToken: null, retryable: true, error: "Failed to verify auth" },
      { status: 200 }
    );
  }
}
