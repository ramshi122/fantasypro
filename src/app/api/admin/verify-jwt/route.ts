import { NextResponse } from "next/server";

/**
 * Server-side JWT Verification API
 * =================================
 *
 * Verifies a JWT token against the server-side secret stored in Vercel
 * environment variables (JWT_SECRET or ADMIN_JWT_SECRET).
 *
 * The secret is NEVER sent to the client — only the verification result.
 *
 * POST /api/admin/verify-jwt
 * Body: { token: string }
 *
 * Returns:
 *   200 — { verified: true, message: "JWT Verified", serverConnected: true }
 *   200 — { verified: false, message: "Invalid JWT", serverConnected: true }
 *   200 — { verified: false, message: "JWT Not Configured", serverConnected: true, configured: false }
 *   500 — { verified: false, message: "Server error", serverConnected: false }
 *
 * Security:
 *   - JWT_SECRET is read from process.env — NEVER exposed to client
 *   - Token is verified using jsonwebtoken library (if available) or
 *     manual base64 decode + HMAC verification
 *   - No secret values are ever returned in the response
 */

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const token = String(body?.token || "").trim();

    // Check if server-side JWT secret is configured
    const jwtSecret = process.env.JWT_SECRET || process.env.ADMIN_JWT_SECRET || "";

    if (!jwtSecret) {
      // Secret not configured in Vercel environment
      return NextResponse.json({
        verified: false,
        serverConnected: true,
        configured: false,
        message: "JWT Not Configured — set JWT_SECRET or ADMIN_JWT_SECRET in Vercel Environment Variables",
      }, { status: 200 });
    }

    if (!token) {
      return NextResponse.json({
        verified: false,
        serverConnected: true,
        configured: true,
        message: "No token provided — enter a JWT token first",
      }, { status: 200 });
    }

    // Verify the JWT token
    // Try using jsonwebtoken library first (if installed)
    try {
      const jwt = await import("jsonwebtoken");
      try {
        const decoded = jwt.verify(token, jwtSecret);
        // Token is valid
        return NextResponse.json({
          verified: true,
          serverConnected: true,
          configured: true,
          message: "JWT Verified — token is valid",
          payload: {
            // Only return non-sensitive fields from the decoded payload
            iss: (decoded as any).iss,
            sub: (decoded as any).sub,
            aud: (decoded as any).aud,
            exp: (decoded as any).exp,
            iat: (decoded as any).iat,
          },
        }, { status: 200 });
      } catch (verifyErr: any) {
        // Token verification failed
        const errorMsg = verifyErr?.name === "TokenExpiredError"
          ? "JWT Expired — token has expired"
          : verifyErr?.name === "JsonWebTokenError"
          ? "Invalid JWT — signature verification failed"
          : "Invalid JWT — verification failed";
        return NextResponse.json({
          verified: false,
          serverConnected: true,
          configured: true,
          message: errorMsg,
        }, { status: 200 });
      }
    } catch (importErr) {
      // jsonwebtoken not installed — fall back to manual verification
      console.log("[VerifyJWT] jsonwebtoken not available, using manual verification");

      // Manual JWT structure check (3 parts separated by dots)
      const parts = token.split(".");
      if (parts.length !== 3) {
        return NextResponse.json({
          verified: false,
          serverConnected: true,
          configured: true,
          message: "Invalid JWT — must have 3 parts (header.payload.signature)",
        }, { status: 200 });
      }

      // Decode header + payload (base64url)
      try {
        const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf-8"));
        const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf-8"));

        // Check if token is expired
        if (payload.exp && Date.now() / 1000 > payload.exp) {
          return NextResponse.json({
            verified: false,
            serverConnected: true,
            configured: true,
            message: "JWT Expired — token has expired",
          }, { status: 200 });
        }

        // Verify signature using crypto
        const crypto = await import("crypto");
        const data = parts[0] + "." + parts[1];
        const expectedSig = crypto
          .createHmac("sha256", jwtSecret)
          .update(data)
          .digest("base64url");

        if (expectedSig !== parts[2]) {
          return NextResponse.json({
            verified: false,
            serverConnected: true,
            configured: true,
            message: "Invalid JWT — signature verification failed",
          }, { status: 200 });
        }

        // Token is valid
        return NextResponse.json({
          verified: true,
          serverConnected: true,
          configured: true,
          message: "JWT Verified — token is valid",
          payload: {
            iss: payload.iss,
            sub: payload.sub,
            aud: payload.aud,
            exp: payload.exp,
            iat: payload.iat,
          },
        }, { status: 200 });
      } catch (decodeErr) {
        return NextResponse.json({
          verified: false,
          serverConnected: true,
          configured: true,
          message: "Invalid JWT — could not decode token",
        }, { status: 200 });
      }
    }
  } catch (error: any) {
    console.error("[VerifyJWT] Server error:", error);
    return NextResponse.json({
      verified: false,
      serverConnected: false,
      configured: false,
      message: "Server error — could not verify JWT",
    }, { status: 500 });
  }
}

/**
 * GET endpoint — check if JWT secret is configured (without revealing it).
 * Useful for checking server status without sending a token.
 */
export async function GET() {
  try {
    const jwtSecret = process.env.JWT_SECRET || process.env.ADMIN_JWT_SECRET || "";
    return NextResponse.json({
      serverConnected: true,
      configured: !!jwtSecret,
      message: jwtSecret
        ? "Server connected — JWT secret configured"
        : "Server connected — JWT secret NOT configured. Set JWT_SECRET or ADMIN_JWT_SECRET in Vercel Environment Variables",
    }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({
      serverConnected: false,
      configured: false,
      message: "Server error",
    }, { status: 500 });
  }
}
