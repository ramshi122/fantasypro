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

function deepDecrypt(obj: any): any {
  if (typeof obj === "string") {
    if (obj.startsWith("U2FsdGVk")) {
      const dec = decryptAES(obj);
      if (dec) {
        try { return JSON.parse(dec); } catch { return dec; }
      }
    }
    return obj;
  }
  if (Array.isArray(obj)) return obj.map(deepDecrypt);
  if (obj && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj)) {
      out[k] = deepDecrypt(obj[k]);
    }
    return out;
  }
  return obj;
}

/**
 * Proxy for /api/fantasy/match/{matchId}
 * Fetches match detail from backend, decrypts all encrypted fields.
 * GET /api/match-detail?matchId=113517
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const matchId = searchParams.get("matchId");

    if (!matchId) {
      return NextResponse.json({ status: "fail", message: "matchId is required" }, { status: 200 });
    }

    console.log(`[MatchDetail] Fetching match ${matchId} from possible11.com...`);

    // Use possible11.com/admin/api2.php with POST (same as original APK)
    const res = await fetch(`${BACKEND_URL}/admin/api2.php`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/plain, */*",
      },
      body: JSON.stringify({
        action: "getMatchDetails",
        mid: matchId,
        uuid: "web-apna-cricket",
        device: "web",
        osVersion: "unknown",
        model: "browser",
      }),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });

    const responseText = await res.text();
    let body: any;

    try {
      body = JSON.parse(responseText);
    } catch {
      const dec = decryptAES(responseText);
      if (dec) {
        try { body = JSON.parse(dec); } catch {
          return NextResponse.json({ status: "fail", message: "Could not parse response" }, { status: 200 });
        }
      } else {
        return NextResponse.json({ status: "fail", message: "Non-JSON response" }, { status: 200 });
      }
    }

    if (body.status !== "success" || !body.data) {
      return NextResponse.json({ status: "fail", message: body.message || "Backend error" }, { status: 200 });
    }

    // Deep decrypt all encrypted fields in the match data
    const matchData = deepDecrypt(body.data);

    const response = NextResponse.json({ status: "success", data: matchData }, { status: 200 });
    response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    return response;

  } catch (error) {
    console.error("[MatchDetail] Route error:", error);
    return NextResponse.json({
      status: "fail",
      message: error instanceof Error ? error.message : "Server error",
    }, { status: 200 });
  }
}
