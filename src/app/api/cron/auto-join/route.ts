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
 * GET /api/cron/auto-join
 * Called by Vercel Cron every 5 minutes.
 *
 * (FIREBASE-CLEANUP) We no longer fetch fantasy tokens from Firebase.
 * The auto-join cron is effectively a no-op on the server — fantasy tokens
 * live in localStorage on each user's device, and auto-join runs client-side
 * per-device. This endpoint still returns success so the cron job does not
 * fail, but processes zero tokens.
 *
 * To re-enable server-side auto-join, integrate a real shared token store
 * (e.g. a managed Postgres table, encrypted Redis, or per-user OAuth
 * refresh-token storage) — do NOT use Firebase.
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret (prevent unauthorized access)
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET || "apna-cricket-cron-2026";
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ status: "fail", message: "Unauthorized" }, { status: 401 });
    }

    // No shared token store — server-side auto-join is disabled.
    return NextResponse.json({
      status: "success",
      message: "Auto-join is client-side only (per-device localStorage). No shared token store available.",
      processed: 0,
      joined: 0,
      totalTokens: 0,
    }, { status: 200 });
  } catch (error) {
    console.error("[AutoJoin] Fatal error:", error);
    return NextResponse.json({
      status: "fail",
      message: error instanceof Error ? error.message : "Server error",
    }, { status: 200 });
  }
}

// Keep decryptAES exported in case future server-side logic needs it.
export { decryptAES, BACKEND_URL };
