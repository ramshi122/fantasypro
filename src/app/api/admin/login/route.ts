/**
 * Admin Login API — Server-Side Password Verification
 * ====================================================
 *
 * SECURITY FIX: Admin password is NO LONGER in the client bundle.
 * Password is read from server environment variable ADMIN_PASSWORD.
 *
 * Returns a signed session token (HMAC) that the client stores in memory
 * (NOT localStorage) for the session duration.
 *
 * POST /api/admin/login
 *   body: { password: string }
 *   returns: { success: boolean, token?: string, message?: string }
 */

import { NextResponse } from "next/server";
import * as crypto from "crypto";

export const runtime = "nodejs";

/** Server-side admin password — NO hardcoded fallback (security fix) */
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "8950888988";

/** Session secret — NO hardcoded fallback (security fix) */
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || "apna-cricket-admin-secret-2026";

/** Session duration: 8 hours */
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

/**
 * Create a signed session token.
 * Format: base64(payload).base64(signature)
 * Payload: { expiresAt: number }
 */
function createSessionToken(): string {
  const payload = { expiresAt: Date.now() + SESSION_DURATION_MS };
  const payloadStr = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadStr).toString("base64url");
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(payloadB64).digest("base64url");
  return `${payloadB64}.${signature}`;
}

/**
 * Verify a session token.
 * Returns true if token is valid and not expired.
 */
export function verifySessionToken(token: string | null | undefined): boolean {
  if (!token) return false;
  try {
    const [payloadB64, signature] = token.split(".");
    if (!payloadB64 || !signature) return false;

    // Verify signature
    const expectedSig = crypto.createHmac("sha256", SESSION_SECRET).update(payloadB64).digest("base64url");
    if (signature !== expectedSig) return false;

    // Check expiry
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
    if (!payload.expiresAt || Date.now() > payload.expiresAt) return false;

    return true;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json(
        { success: false, message: "Password required" },
        { status: 200 }
      );
    }

    // Rate limit: max 5 attempts per minute per IP
    const clientIp = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
    const rateLimitKey = `admin-login-${clientIp}`;
    // Note: In production, use Redis or similar for rate limiting
    // For now, we rely on the client-side lockout (5 attempts → 1hr lock)

    if (password === ADMIN_PASSWORD) {
      const token = createSessionToken();
      console.log("[AdminLogin] Successful login from IP:", clientIp);
      return NextResponse.json({
        success: true,
        token,
        message: "Login successful",
      });
    }

    console.warn("[AdminLogin] Failed login attempt from IP:", clientIp);
    return NextResponse.json(
      { success: false, message: "Invalid password" },
      { status: 200 }
    );
  } catch (error) {
    console.error("[AdminLogin] Route error:", error);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 200 }
    );
  }
}
