/**
 * Security wrapper for API routes — server-side only
 * Simplified version that works with Next.js server components
 */

import { NextResponse } from "next/server";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

function getClientIP(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIP = request.headers.get("x-real-ip");
  if (realIP) return realIP;
  return "unknown";
}

function validateOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");

  // Allow same-origin (no origin = same-origin)
  if (!origin && !referer) return true;

  const allowedHosts = [host, "localhost:3000"].filter(Boolean);

  // Also allow Vercel domains
  const refererHost = referer ? new URL(referer).host : "";
  const originHost = origin ? new URL(origin).host : "";

  if (originHost && (allowedHosts.includes(originHost) || originHost.endsWith(".vercel.app"))) return true;
  if (refererHost && (allowedHosts.includes(refererHost) || refererHost.endsWith(".vercel.app"))) return true;

  return false;
}

function checkRateLimit(ip: string, endpoint: string, maxRequests: number, windowMs: number = 60000) {
  const key = `${ip}:${endpoint}`;
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
}

export function withSecurity(
  handler: (request: Request) => Promise<NextResponse> | NextResponse,
  options: { rateLimit?: number } = {}
) {
  return async (request: Request): Promise<NextResponse> => {
    const ip = getClientIP(request);
    const endpoint = new URL(request.url).pathname;
    const maxRequests = options.rateLimit || 30;

    // Rate limiting
    const rateLimit = checkRateLimit(ip, endpoint, maxRequests);
    if (!rateLimit.allowed) {
      const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
      return NextResponse.json(
        { status: "fail", message: `Rate limited. Retry in ${retryAfter}s.`, code: "RATE_LIMITED" },
        { status: 429, headers: { "Retry-After": retryAfter.toString() } }
      );
    }

    // Log
    console.log(`[API] ${request.method} ${endpoint} from ${ip}`);

    try {
      const response = await handler(request);
      response.headers.set("X-RateLimit-Remaining", rateLimit.remaining.toString());
      return response;
    } catch (err) {
      console.error(`[API] Error in ${endpoint}:`, err);
      return NextResponse.json({ status: "fail", message: "Internal server error" }, { status: 500 });
    }
  };
}
