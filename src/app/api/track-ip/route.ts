import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";

/**
 * IP Tracking API
 * GET  /api/track-ip?action=isBlocked&ip=X → check if IP is blocked
 * POST /api/track-ip                       → log IP {deviceId, action}
 * POST /api/track-ip?action=block          → block IP {ip}
 * POST /api/track-ip?action=unblock        → unblock IP {ip}
 * GET  /api/track-ip?deviceId=X             → list logs for device
 */

function getClientIP(request: Request): string {
  // Read standard forwarded-for headers
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
 * Log an IP record. Server-side helper for use in API routes.
 */
export async function logIP(
  request: Request,
  deviceId: string,
  action: string
): Promise<void> {
  const ip = getClientIP(request);
  if (!db) {
    // Local fallback
    return;
  }
  try {
    await addDoc(collection(db, "ip_logs"), {
      ip,
      deviceId,
      action,
      userAgent: request.headers.get("user-agent") || "",
      timestamp: Date.now(),
      createdAtTs: serverTimestamp(),
    });
  } catch (err) {
    console.log("[TrackIP] log failed:", err);
  }
}

/**
 * Check if an IP is blocked.
 */
export async function isIPBlocked(ip: string): Promise<boolean> {
  if (!db || !ip) return false;
  try {
    const snap = await getDoc(doc(db, "blocked_ips", ip));
    return snap.exists();
  } catch {
    return false;
  }
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

    if (deviceId && db) {
      try {
        const snap = await getDocs(query(collection(db, "ip_logs"), where("deviceId", "==", deviceId)));
        const logs: any[] = [];
        snap.forEach((d) => logs.push({ id: d.id, ...d.data() }));
        return NextResponse.json({ status: "success", logs }, { status: 200 });
      } catch (err: any) {
        return NextResponse.json({ status: "fail", message: err?.message }, { status: 200 });
      }
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

    // Block / unblock
    if (action === "block") {
      const { ip, reason } = body as { ip: string; reason?: string };
      if (!ip || !db) return NextResponse.json({ status: "fail", message: "ip required" }, { status: 200 });
      await setDocOnBlockedIps(ip, reason || "Blocked by admin");
      return NextResponse.json({ status: "success", message: "IP blocked" }, { status: 200 });
    }
    if (action === "unblock") {
      const { ip } = body as { ip: string };
      if (!ip || !db) return NextResponse.json({ status: "fail", message: "ip required" }, { status: 200 });
      try {
        const { deleteDoc } = await import("firebase/firestore");
        await deleteDoc(doc(db, "blocked_ips", ip));
      } catch (err) {
        console.log("[TrackIP] unblock failed:", err);
      }
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

// Helper to write to blocked_ips collection
async function setDocOnBlockedIps(ip: string, reason: string) {
  if (!db) return;
  try {
    await setDoc(doc(db, "blocked_ips", ip), {
      ip,
      reason,
      bannedAt: Date.now(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.log("[TrackIP] block write failed:", err);
  }
}
