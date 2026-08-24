import { NextResponse } from "next/server";
import { checkRateLimit, getClientIP } from "@/lib/security";

const BACKEND_URL = "https://possible11.com";

/**
 * Proxy for /api/{platform}/add-match
 * Adds a match to the main DB (like original teamgeneration.in admin "Add to DB" button).
 * POST /api/matches/add
 * body: { platform: "my11circle"|"jumbo", matchId, sport?, authToken? }
 */
async function handler(request: Request) {
  try {
    // Rate limit: 30/min per IP
    const ip = getClientIP(request);
    if (!checkRateLimit(`add-match:${ip}`, 30, 60000)) {
      return NextResponse.json({ status: "fail", message: "Rate limit exceeded" }, { status: 429 });
    }

    const body = await request.json();
    const { platform = "my11circle", matchId, sport = "cricket", authToken = null } = body;

    if (!matchId) {
      return NextResponse.json({ status: "fail", message: "matchId is required" }, { status: 200 });
    }

    const validPlatforms = ["my11circle", "jumbo"];
    if (!validPlatforms.includes(platform)) {
      return NextResponse.json({ status: "fail", message: "Invalid platform" }, { status: 200 });
    }

    console.log(`[AddMatch] Adding ${platform} match ${matchId} to DB...`);

    // Build request body matching original APK format
    const reqBody: any = { sport };
    if (platform === "my11circle") {
      reqBody.my11circleMatchId = String(matchId);
      if (authToken) reqBody.authToken = authToken;
    } else if (platform === "jumbo") {
      reqBody.jumboMatchId = String(matchId);
    }

    const res = await fetch(`${BACKEND_URL}/api/${platform}/add-match`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/plain, */*",
      },
      body: JSON.stringify(reqBody),
      signal: AbortSignal.timeout(30000),
      cache: "no-store",
    });

    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json({ status: "fail", message: "Non-JSON response from backend" }, { status: 200 });
    }

    // Match already exists = success (idempotent)
    if (res.status === 409 || data.message?.includes("already exists")) {
      return NextResponse.json({
        status: "success",
        message: "Match already exists in DB",
        matchId,
        alreadyExists: true,
      }, { status: 200 });
    }

    if (res.status === 200 && data.success !== false) {
      return NextResponse.json({
        status: "success",
        message: data.message || "Match added to main DB!",
        matchId,
      }, { status: 200 });
    }

    return NextResponse.json({
      status: "fail",
      message: data.message || data.error || `Backend error (HTTP ${res.status})`,
    }, { status: 200 });

  } catch (error) {
    console.error("[AddMatch] Route error:", error);
    return NextResponse.json({
      status: "fail",
      message: error instanceof Error ? error.message : "Server error",
    }, { status: 200 });
  }
}

export const POST = handler;
