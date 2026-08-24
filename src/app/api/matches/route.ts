import { NextResponse } from "next/server";
import CryptoJS from "crypto-js";

const BACKEND_URL = "https://possible11.com";
const AES_KEY = "coder_bobby_believer01_tg_software";

function decryptAES(encrypted: string): string {
  try {
    return CryptoJS.AES.decrypt(encrypted, AES_KEY).toString(CryptoJS.enc.Utf8);
  } catch {
    return "";
  }
}

/**
 * Proxy for /api/fantasy/matches/{sport}
 * Fetches matches from backend, decrypts each, returns clean JSON.
 * GET /api/matches?sport=cricket
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sport = searchParams.get("sport") || "cricket";

    console.log(`[Matches] Fetching ${sport} matches from backend...`);

    const res = await fetch(`${BACKEND_URL}/api/fantasy/matches/${sport}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/plain, */*",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });

    const responseText = await res.text();
    console.log(`[Matches] Backend response: HTTP ${res.status}, body length: ${responseText.length}`);

    let body: any;
    try {
      body = JSON.parse(responseText);
    } catch {
      const dec = decryptAES(responseText);
      if (dec) {
        try { body = JSON.parse(dec); } catch {
          return NextResponse.json({ status: "fail", message: "Could not parse backend response", data: [] }, { status: 200 });
        }
      } else {
        return NextResponse.json({ status: "fail", message: "Non-JSON response from backend", data: [] }, { status: 200 });
      }
    }

    if (body.status !== "success" || !body.data) {
      console.error(`[Matches] Backend returned status: ${body.status}`);
      return NextResponse.json({ status: "fail", message: body.message || "Backend error", data: [] }, { status: 200 });
    }

    const rawData = body.data;
    const matches: any[] = [];

    if (Array.isArray(rawData)) {
      for (const item of rawData) {
        if (typeof item === "string") {
          const dec = decryptAES(item);
          if (dec) {
            try { matches.push(JSON.parse(dec)); } catch {
              console.warn("[Matches] Failed to parse decrypted match");
            }
          }
        } else if (typeof item === "object" && item !== null) {
          matches.push(item);
        }
      }
    }

    console.log(`[Matches] Decrypted ${matches.length} matches`);

    const response = NextResponse.json({ status: "success", data: matches }, { status: 200 });
    response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    return response;

  } catch (error) {
    console.error("[Matches] Route error:", error);
    return NextResponse.json({
      status: "fail",
      message: error instanceof Error ? error.message : "Server error",
      data: [],
    }, { status: 200 });
  }
}
