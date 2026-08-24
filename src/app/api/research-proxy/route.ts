import { NextResponse } from "next/server";

/**
 * APNA CRICKET — Standalone Research API Proxy
 * ==============================================
 *
 * Completely independent server-side proxy for the research module.
 * Does NOT use any existing API routes, middleware, or auth.
 *
 * Forwards POST requests to the external research API.
 * Keeps the external API URL server-side only (not exposed to client).
 *
 * Error isolation: all errors return a JSON error response.
 * Never impacts other API routes or the main app.
 */

const EXTERNAL_API_URL = "https://possible11.com/admin/api2.php";
const S3_BASE_URL = "https://possible11.s3.ap-south-1.amazonaws.com";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (!action) {
      return NextResponse.json(
        { error: "Missing 'action' parameter" },
        { status: 400 }
      );
    }

    // === S3 FALLBACK: Some actions use S3 JSON files instead of the PHP API ===
    // The external app checks a "server" flag — we try the PHP API first,
    // and if it fails, fall back to S3 static JSON.
    const s3Fallbacks: Record<string, (b: any) => string | null> = {
      getMatches: (b) => `${S3_BASE_URL}/js/${b.sport || "cricket"}-matches-${b.matchState || "upcoming"}.json?t=${Date.now()}`,
      getMatchDetails: (b) => b.mid ? `${S3_BASE_URL}/js/matches/${b.mid}.json?t=${Date.now()}` : null,
      getInfo: () => `${S3_BASE_URL}/js/info.json?t=${Date.now()}`,
      getSlides: () => `${S3_BASE_URL}/js/slider.json?t=${Date.now()}`,
      getPlayerTypes: (b) => `${S3_BASE_URL}/js/playerTypes-${b.sport || "cricket"}.json`,
    };

    // Try the PHP API first
    try {
      const apiRes = await fetch(EXTERNAL_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12000),
      });

      if (apiRes.ok) {
        const text = await apiRes.text();
        try {
          const data = JSON.parse(text);
          return NextResponse.json(data);
        } catch {
          // Not JSON — try S3 fallback
        }
      }
    } catch {
      // PHP API failed — try S3 fallback below
    }

    // === S3 FALLBACK ===
    const s3Url = s3Fallbacks[action]?.(body);
    if (s3Url) {
      try {
        const s3Res = await fetch(s3Url, {
          method: "GET",
          signal: AbortSignal.timeout(10000),
        });
        if (s3Res.ok) {
          const s3Data = await s3Res.json();
          return NextResponse.json(s3Data);
        }
      } catch {
        // S3 also failed
      }
    }

    // Both PHP API and S3 failed
    return NextResponse.json(
      { error: `Could not fetch data for action: ${action}` },
      { status: 502 }
    );
  } catch (error) {
    console.error("[ResearchProxy] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Also support GET for S3 direct fetches
export async function GET(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const mid = url.searchParams.get("mid");
  const sport = url.searchParams.get("sport") || "cricket";

  if (!action) {
    return NextResponse.json({ error: "Missing 'action' parameter" }, { status: 400 });
  }

  // Build S3 URL for GET requests
  let s3Url: string | null = null;
  if (action === "getMatches") {
    const matchState = url.searchParams.get("matchState") || "upcoming";
    s3Url = `${S3_BASE_URL}/js/${sport}-matches-${matchState}.json?t=${Date.now()}`;
  } else if (action === "getMatchDetails" && mid) {
    s3Url = `${S3_BASE_URL}/js/matches/${mid}.json?t=${Date.now()}`;
  } else if (action === "getInfo") {
    s3Url = `${S3_BASE_URL}/js/info.json?t=${Date.now()}`;
  }

  if (!s3Url) {
    return NextResponse.json({ error: "Unsupported GET action" }, { status: 400 });
  }

  try {
    const res = await fetch(s3Url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      return NextResponse.json({ error: `S3 returned ${res.status}` }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[ResearchProxy] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch from S3" }, { status: 502 });
  }
}
