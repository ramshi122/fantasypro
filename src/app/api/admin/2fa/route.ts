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

/**
 * Admin 2FA API
 * POST /api/admin/2fa?action=setup      → generate secret + QR URL
 * POST /api/admin/2fa?action=enable     → verify token + enable {token, secret}
 * POST /api/admin/2fa?action=verify     → verify token (login) {token}
 * POST /api/admin/2fa?action=disable    → disable 2FA
 * GET  /api/admin/2fa                   → status check
 *
 * NOTE: This API stores config in localStorage on the calling client.
 * For server-side enforcement, the client must POST the token here.
 */

export async function GET() {
  return NextResponse.json({
    status: "success",
    enabled: is2FAEnabled(),
  }, { status: 200 });
}

export async function POST(request: Request) {
  try {
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
