import { NextResponse } from "next/server";
import { decrypt } from "@/lib/crypto";

const BACKEND_URL = "https://possible11.com";

/**
 * Classic addteam endpoint — generates a direct transfer link (no OTP required).
 *
 * Routes to the correct platform endpoint (matching original APK):
 *   dream11    → /api/classic/dream11/addteam
 *   my11circle → /api/classic/my11circle/addteam
 *   jumbo      → /api/classic/jumbo/addteam
 *
 * The response contains AES-encrypted data that needs to be decrypted to get the link.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fantasyApp, tgMatchId, playerData, captainData, vicecaptainData } = body;

    if (!fantasyApp || !tgMatchId || !playerData || !captainData || !vicecaptainData) {
      return NextResponse.json(
        { error: "fantasyApp, tgMatchId, playerData, captainData, and vicecaptainData are required" },
        { status: 400 }
      );
    }

    // Route to the correct platform endpoint (matching original APK)
    let endpoint = "";
    if (fantasyApp === "dream11") {
      endpoint = `${BACKEND_URL}/api/classic/dream11/addteam`;
    } else if (fantasyApp === "my11circle") {
      endpoint = `${BACKEND_URL}/api/classic/my11circle/addteam`;
    } else if (fantasyApp === "jumbo") {
      endpoint = `${BACKEND_URL}/api/classic/jumbo/addteam`;
    } else {
      endpoint = `${BACKEND_URL}/api/classic/dream11/addteam`;
    }

    // Build the payload matching original APK's classic addteam format
    const payload = {
      tgMatchId,
      playerData,
      captainData,
      vicecaptainData,
      generateLinkFlag: "general",
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });

    const responseText = await res.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(responseText);
    } catch {
      return NextResponse.json({
        status: "fail",
        error: `Server returned non-JSON response (HTTP ${res.status})`,
        httpStatus: res.status,
      }, { status: 200 });
    }

    // The original APK's classic addteam returns encrypted data in data.data
    // that needs to be decrypted to get the link
    let link: string | null = null;
    const dataField = (data as any).data;
    if (dataField && typeof dataField === "string") {
      try {
        const decrypted = decrypt<string>(dataField);
        if (decrypted) {
          try {
            const parsed = JSON.parse(decrypted);
            link = parsed.link || null;
          } catch {
            // decryption succeeded but not JSON — check if it's a URL
            if (typeof decrypted === "string" && decrypted.startsWith("http")) {
              link = decrypted;
            }
          }
        }
      } catch {
        // If decryption fails, try direct access
        if (typeof dataField === "object" && dataField.link) {
          link = dataField.link;
        }
      }
    } else if (typeof dataField === "object" && dataField?.link) {
      link = dataField.link;
    }

    return NextResponse.json({
      status: (data.status as string) || (res.ok ? "success" : "error"),
      link,
      message: (data.message as string) || "",
      httpStatus: res.status,
    }, { status: 200 });
  } catch (error) {
    console.error("Classic addteam error:", error);
    return NextResponse.json(
      { status: "fail", error: "Failed to create transfer link" },
      { status: 200 }
    );
  }
}
