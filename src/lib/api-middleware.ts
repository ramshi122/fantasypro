import { NextResponse } from "next/server";
import { checkRateLimit, getClientIP, validateOrigin } from "@/lib/security";

/**
 * API Security Middleware
 * =======================
 * Apply to all API routes:
 *   1. Rate limiting (prevents brute force)
 *   2. Origin validation (prevents CSRF)
 *   3. Request logging
 *
 * Usage:
 *   import { withSecurity } from "@/lib/api-middleware";
 *
 *   export const POST = withSecurity(async (request) => {
 *     // Your handler
 *   }, { rateLimit: 10 }); // 10 requests per minute
 */

interface SecurityOptions {
  rateLimit?: number;    // max requests per minute
  requireOrigin?: boolean; // require valid origin
}

export function withSecurity(
  handler: (request: Request) => Promise<NextResponse> | NextResponse,
  options: SecurityOptions = {}
) {
  return async (request: Request): Promise<NextResponse> => {
    const ip = getClientIP(request);
    const endpoint = new URL(request.url).pathname;

    // 1. Origin validation
    if (options.requireOrigin !== false) {
      if (!validateOrigin(request)) {
        console.warn(`[Security] Blocked invalid origin: ${ip} → ${endpoint}`);
        return NextResponse.json(
          { status: "fail", message: "Access denied — invalid origin" },
          { status: 403 }
        );
      }
    }

    // 2. Rate limiting
    const maxRequests = options.rateLimit || 30;
    const rateLimit = checkRateLimit(ip, endpoint, maxRequests);

    if (!rateLimit.allowed) {
      const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
      console.warn(`[Security] Rate limited: ${ip} → ${endpoint} (max ${maxRequests}/min)`);

      return NextResponse.json(
        {
          status: "fail",
          message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
          code: "RATE_LIMITED",
        },
        {
          status: 429,
          headers: {
            "Retry-After": retryAfter.toString(),
            "X-RateLimit-Limit": maxRequests.toString(),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": rateLimit.resetAt.toString(),
          },
        }
      );
    }

    // 3. Log request (for audit)
    console.log(`[API] ${request.method} ${endpoint} from ${ip}`);

    // 4. Call the actual handler
    try {
      const response = await handler(request);

      // Add rate limit headers to response
      response.headers.set("X-RateLimit-Limit", maxRequests.toString());
      response.headers.set("X-RateLimit-Remaining", rateLimit.remaining.toString());
      response.headers.set("X-RateLimit-Reset", rateLimit.resetAt.toString());

      return response;
    } catch (err) {
      console.error(`[API] Error in ${endpoint}:`, err);
      return NextResponse.json(
        { status: "fail", message: "Internal server error" },
        { status: 500 }
      );
    }
  };
}
