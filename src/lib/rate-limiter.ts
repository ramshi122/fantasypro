import { NextResponse } from "next/server";

/**
 * Server-Side Rate Limiter
 * ========================
 *
 * Prevents brute-force attacks on license verification + API routes.
 * Tracks requests per IP address using in-memory Map.
 *
 * Limits:
 *   - License verify: 10 requests per 5 minutes per IP
 *   - API routes: 60 requests per minute per IP
 *   - Admin login: 5 attempts per 15 minutes per IP
 *
 * If limit exceeded → returns 429 Too Many Requests
 *
 * NOTE: In-memory storage resets on server restart (Vercel serverless).
 * For production, use Redis or Vercel KV. But this is sufficient for
 * basic brute-force protection.
 */

interface RateLimitEntry {
  count: number;
  firstRequestAt: number;
  lockedUntil: number | null;
}

// In-memory rate limit storage (per server instance)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Rate limit configurations
const RATE_LIMITS = {
  licenseVerify: { maxRequests: 10, windowMs: 5 * 60 * 1000, lockMs: 30 * 60 * 1000 }, // 10 per 5min, lock 30min
  apiRoute: { maxRequests: 60, windowMs: 60 * 1000, lockMs: 5 * 60 * 1000 },           // 60 per 1min, lock 5min
  adminLogin: { maxRequests: 5, windowMs: 15 * 60 * 1000, lockMs: 60 * 60 * 1000 },    // 5 per 15min, lock 1hr
  transfer: { maxRequests: 20, windowMs: 60 * 1000, lockMs: 10 * 60 * 1000 },          // 20 per 1min, lock 10min
};

export type RateLimitType = keyof typeof RATE_LIMITS;

/**
 * Get client IP from request.
 * Handles Vercel's x-forwarded-for header.
 */
function getClientIP(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIP = request.headers.get("x-real-ip");
  if (realIP) return realIP;
  return "unknown";
}

/**
 * Check if a request should be rate-limited.
 * Returns { allowed: true } if OK, { allowed: false, retryAfter } if blocked.
 */
export function checkRateLimit(
  request: Request,
  type: RateLimitType = "apiRoute"
): { allowed: boolean; retryAfter?: number; remaining?: number } {
  const ip = getClientIP(request);
  const config = RATE_LIMITS[type];
  const key = `${type}:${ip}`;
  const now = Date.now();

  // Clean up old entries (prevent memory leak)
  if (rateLimitStore.size > 1000) {
    for (const [k, entry] of rateLimitStore.entries()) {
      if (now - entry.firstRequestAt > config.windowMs * 2) {
        rateLimitStore.delete(k);
      }
    }
  }

  const entry = rateLimitStore.get(key);

  // Check if currently locked
  if (entry?.lockedUntil && entry.lockedUntil > now) {
    const retryAfter = Math.ceil((entry.lockedUntil - now) / 1000);
    return { allowed: false, retryAfter };
  }

  // Check if window has expired — reset
  if (entry && now - entry.firstRequestAt > config.windowMs) {
    rateLimitStore.delete(key);
  }

  const current = rateLimitStore.get(key) || { count: 0, firstRequestAt: now, lockedUntil: null };

  // Check if limit exceeded
  if (current.count >= config.maxRequests) {
    // Lock the IP
    current.lockedUntil = now + config.lockMs;
    rateLimitStore.set(key, current);
    console.warn(`[RateLimit] ❌ ${type} limit exceeded for IP ${ip} — locked for ${config.lockMs / 1000}s`);
    return { allowed: false, retryAfter: Math.ceil(config.lockMs / 1000) };
  }

  // Increment count
  current.count++;
  rateLimitStore.set(key, current);

  const remaining = config.maxRequests - current.count;
  return { allowed: true, remaining };
}

/**
 * Create a rate limit error response.
 */
export function rateLimitErrorResponse(retryAfter: number) {
  return NextResponse.json(
    {
      ok: false,
      error: "Too many requests. Please try again later.",
      code: "RATE_LIMITED",
      retryAfter,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": "60",
        "X-RateLimit-Remaining": "0",
      },
    }
  );
}

/**
 * Get client IP for logging (without exposing to client).
 */
export function logClientIP(request: Request, action: string): void {
  const ip = getClientIP(request);
  const forwarded = request.headers.get("x-forwarded-for") || "";
  console.log(`[Security] ${action} from IP: ${ip} (forwarded: ${forwarded})`);
}
