import { NextResponse } from "next/server";

/**
 * IP Tracking API — LOCAL ONLY (per FIREBASE-CLEANUP)
 * =====================================================
 * Uses a server-side in-memory Map (per-instance, cleared on cold start).
 * Cross-instance blocking is not enforced without a shared backend.
 *
 * GET  /api/track-ip?action=isBlocked&ip=X → check if IP is blocked
 * POST /api/track-ip                       → log IP {deviceId, action}
 * POST /api/track-ip?action=block          → block IP {ip}
 * POST /api/track-ip?action=unblock        → unblock IP {ip}
 * GET  /api/track-ip?deviceId=X            → list logs for device
 */

interface IpLog {
  id: string;
  ip: string;
  deviceId: string;
  action: string;
  userAgent: string;
  timestamp: number;
}

const blockedIps = new Map<string, { ip: string; reason: string; bannedAt: number }>();
const ipLogs: IpLog[] = [];
const IP_LOG_MAX = 1000;

function getClientIP(request: Request): string {
  const headers = request.headers;
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xReal = headers.get("x-real-ip");
  if (xReal) return xReal;
  const cfConnecting = headers.get("cf-connecting-ip");
  if (cfConnecting) return cfConnecting;
  return "0.0.0.0";
}

/**
 * Log an IP record. Server-side helper.
 */
export async function logIP(
  request: Request,
  deviceId: string,
  action: string
): Promise<void> {
  const ip = getClientIP(request);
  const entry: IpLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ip,
    deviceId,
    action,
    userAgent: request.headers.get("user-agent") || "",
    timestamp: Date.now(),
  };
  ipLogs.unshift(entry);
  if (ipLogs.length > IP_LOG_MAX) ipLogs.length = IP_LOG_MAX;
}

/**
 * Check if an IP is blocked (in-memory).
 */
export async function isIPBlocked(ip: string): Promise<boolean> {
  if (!ip) return false;
  return blockedIps.has(ip);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action");
    const ip = url.searchParams.get("ip");
    const deviceId = url.searchParams.get("deviceId");

    if (action === "isBlocked" && ip) {
      const blocked = await isIPBlocked(ip);
      return NextResponse.json({ status: "success", blocked, ip }, { status: 200 });
    }

    if (deviceId) {
      const logs = ipLogs.filter((l) => l.deviceId === deviceId).slice(0, 100);
      return NextResponse.json({ status: "success", logs }, { status: 200 });
    }

    return NextResponse.json({ status: "fail", message: "Missing params" }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ status: "fail", message: err?.message || "Server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "block") {
      const { ip, reason } = body as { ip: string; reason?: string };
      if (!ip) return NextResponse.json({ status: "fail", message: "ip required" }, { status: 200 });
      blockedIps.set(ip, { ip, reason: reason || "Blocked by admin", bannedAt: Date.now() });
      return NextResponse.json({ status: "success", message: "IP blocked" }, { status: 200 });
    }
    if (action === "unblock") {
      const { ip } = body as { ip: string };
      if (!ip) return NextResponse.json({ status: "fail", message: "ip required" }, { status: 200 });
      blockedIps.delete(ip);
      return NextResponse.json({ status: "success", message: "IP unblocked" }, { status: 200 });
    }

    // Default: log IP
    const { deviceId, action: logAction } = body as { deviceId: string; action: string };
    if (!deviceId || !logAction) {
      return NextResponse.json({ status: "fail", message: "deviceId + action required" }, { status: 200 });
    }
    const ip = getClientIP(request);
    const blocked = await isIPBlocked(ip);
    if (blocked) {
      return NextResponse.json({ status: "fail", message: "IP blocked", blocked: true }, { status: 200 });
    }
    await logIP(request, deviceId, logAction);
    return NextResponse.json({ status: "success", ip, logged: true }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ status: "fail", message: err?.message || "Server error" }, { status: 500 });
  }
}
