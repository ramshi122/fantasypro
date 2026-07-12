import { NextResponse } from "next/server";
import {
  generate2FASecret,
  generateBackupCodes,
  getQRCodeURL,
  save2FAConfig,
  verify2FASecret,
  get2FAConfig,
  is2FAEnabled,
  disable2FA,
  type TwoFactorConfig,
} from "@/lib/admin-2fa";
import { verifySessionToken } from "@/app/api/admin/login/route";

/**
 * Admin 2FA API
 * SECURITY FIX: All actions now require valid admin session token.
 * POST /api/admin/2fa?action=setup      → generate secret + QR URL
 * POST /api/admin/2fa?action=enable     → verify token + enable {token, secret}
 * POST /api/admin/2fa?action=verify     → verify token (login) {token}
 * POST /api/admin/2fa?action=disable    → disable 2FA
 * GET  /api/admin/2fa                   → status check
 */

/** Verify admin session token from request */
function checkAdminAuth(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  const adminToken = authHeader?.replace("Bearer ", "") ||
    new URL(request.url).searchParams.get("adminToken");
  if (!adminToken) return false;
  return verifySessionToken(adminToken);
}

export async function GET(request: Request) {
  // SECURITY: Require admin auth
  if (!checkAdminAuth(request)) {
    return NextResponse.json({ status: "fail", message: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    status: "success",
    enabled: is2FAEnabled(),
  }, { status: 200 });
}

export async function POST(request: Request) {
  try {
    // SECURITY: Require admin auth for all 2FA actions
    if (!checkAdminAuth(request)) {
      return NextResponse.json({ status: "fail", message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    if (action === "setup") {
      const secret = generate2FASecret();
      const qrUrl = getQRCodeURL(secret);
      // Save temporarily as not-yet-enabled
      const config: TwoFactorConfig = {
        secret,
        enabled: false,
        createdAt: Date.now(),
        backupCodes: [],
      };
      save2FAConfig(config);
      return NextResponse.json({
        status: "success",
        secret,
        qrUrl,
        manualEntry: `ApnaCricket:Admin — ${secret}`,
      }, { status: 200 });
    }

    if (action === "enable") {
      const { token, secret } = body as { token: string; secret: string };
      if (!token || !secret) {
        return NextResponse.json({ status: "fail", message: "token + secret required" }, { status: 200 });
      }
      const valid = verify2FASecret(token, secret);
      if (!valid) {
        return NextResponse.json({ status: "fail", message: "Invalid token — try again" }, { status: 200 });
      }
      const backupCodes = generateBackupCodes();
      const config: TwoFactorConfig = {
        secret,
        enabled: true,
        createdAt: Date.now(),
        backupCodes,
      };
      save2FAConfig(config);
      return NextResponse.json({
        status: "success",
        message: "2FA enabled",
        backupCodes,
      }, { status: 200 });
    }

    if (action === "verify") {
      const { token } = body as { token: string };
      if (!token) {
        return NextResponse.json({ status: "fail", message: "token required" }, { status: 200 });
      }
      const config = get2FAConfig();
      if (!config) {
        return NextResponse.json({ status: "fail", message: "2FA not configured" }, { status: 200 });
      }
      const valid = verify2FASecret(token, config.secret);
      if (!valid) {
        return NextResponse.json({ status: "fail", message: "Invalid 2FA code" }, { status: 200 });
      }
      return NextResponse.json({ status: "success", message: "2FA verified" }, { status: 200 });
    }

    if (action === "disable") {
      disable2FA();
      return NextResponse.json({ status: "success", message: "2FA disabled" }, { status: 200 });
    }

    return NextResponse.json({ status: "fail", message: "Unknown action" }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ status: "fail", message: err?.message || "Server error" }, { status: 500 });
  }
}
