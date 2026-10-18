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
 * Deep-decrypt: recursively walk an object and decrypt any string starting with "U2FsdGVk".
 */
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
 * Proxy for matches listing.
 * Fetches from possible11.com/admin/api2.php (POST with action=getMatches)
 * and also tries /api/fantasy/matches/{sport} (GET) as fallback.
 * Decrypts all encrypted fields server-side and returns clean JSON.
 *
 * GET /api/matches?sport=cricket
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sport = searchParams.get("sport") || "cricket";

    console.log(`[Matches] Fetching ${sport} matches from backend...`);

    // PRIMARY: Use POST to /admin/api2.php (same as original APK)
    let matches: any[] = [];

    try {
      const res = await fetch(`${BACKEND_URL}/admin/api2.php`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/plain, */*",
        },
        body: JSON.stringify({
          action: "getMatches",
          sport,
          matchState: "upcoming",
          uuid: "web-apna-cricket",
          device: "web",
          osVersion: "unknown",
          model: "browser",
        }),
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      });

      const responseText = await res.text();
      console.log(`[Matches] POST /admin/api2.php response: HTTP ${res.status}, body length: ${responseText.length}`);

      let body: any;
      try {
        body = JSON.parse(responseText);
      } catch {
        // Response might be encrypted
        const dec = decryptAES(responseText);
        if (dec) {
          try { body = JSON.parse(dec); } catch { body = null; }
        }
      }

      if (body) {
        // The response could be an array directly or {status, data} object
        let rawData: any;
        if (Array.isArray(body)) {
          rawData = body;
        } else if (body.status === "success" && body.data) {
          rawData = body.data;
        } else if (body.data) {
          rawData = body.data;
        }

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
              matches.push(deepDecrypt(item));
            }
          }
        }
      }
    } catch (postErr: any) {
      console.warn(`[Matches] POST /admin/api2.php failed: ${postErr?.message}, trying GET fallback...`);
    }

    // FALLBACK: GET /api/fantasy/matches/{sport} if POST returned 0 matches
    if (matches.length === 0) {
      try {
        const res2 = await fetch(`${BACKEND_URL}/api/fantasy/matches/${sport}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/plain, */*",
          },
          signal: AbortSignal.timeout(15000),
          cache: "no-store",
        });

        const responseText2 = await res2.text();
        let body2: any;
        try {
          body2 = JSON.parse(responseText2);
        } catch {
          const dec = decryptAES(responseText2);
          if (dec) {
            try { body2 = JSON.parse(dec); } catch { body2 = null; }
          }
        }

        if (body2) {
          let rawData2: any;
          if (Array.isArray(body2)) {
            rawData2 = body2;
          } else if (body2.data) {
            rawData2 = body2.data;
          }

          if (Array.isArray(rawData2)) {
            for (const item of rawData2) {
              if (typeof item === "string") {
                const dec = decryptAES(item);
                if (dec) {
                  try { matches.push(JSON.parse(dec)); } catch {
                    console.warn("[Matches] Failed to parse decrypted match (fallback)");
                  }
                }
              } else if (typeof item === "object" && item !== null) {
                matches.push(deepDecrypt(item));
              }
            }
          }
        }
      } catch (getErr: any) {
        console.warn(`[Matches] GET fallback also failed: ${getErr?.message}`);
      }
    }

    console.log(`[Matches] Returning ${matches.length} matches`);

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
