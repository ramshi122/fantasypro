/**
 * Server Time API
 * =================
 *
 * Returns the current server time for accurate expiry calculations.
 * All devices use this instead of device Date.now() to ensure
 * identical expiry countdown.
 *
 * GET /api/admin/time
 *   returns: { serverTime: number, timezone: string }
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    status: "success",
    serverTime: Date.now(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    iso: new Date().toISOString(),
  });
}
