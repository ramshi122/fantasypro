import { NextResponse } from "next/server";

/**
 * Admin Broadcast API (FIREBASE-CLEANUP)
 * POST /api/broadcast — send {message, target, type}
 * GET  /api/broadcast?userId=X — get unread broadcasts for user
 * POST /api/broadcast?action=markRead — {broadcastId, userId}
 *
 * No Firebase — uses a server-side in-memory queue (per-instance, cleared
 * on cold start). For per-device persistence, the client also mirrors the
 * broadcast list in localStorage.
 */

export interface Broadcast {
  id: string;
  message: string;
  target: "all" | "active" | "expired";
  type: "info" | "warning" | "success";
  createdAt: number;
  readBy: string[];
}

// In-memory broadcast store (per-instance)
const broadcasts: Broadcast[] = [];
const BROADCAST_MAX = 200;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "markRead") {
      const { broadcastId, userId } = body as { broadcastId: string; userId: string };
      if (!broadcastId || !userId) {
        return NextResponse.json({ status: "fail", message: "Missing fields" }, { status: 200 });
      }
      const b = broadcasts.find((x) => x.id === broadcastId);
      if (b && !b.readBy.includes(userId)) b.readBy.push(userId);
      return NextResponse.json({ status: "success" }, { status: 200 });
    }

    // Default: send broadcast
    const { message, target, type } = body as {
      message: string;
      target: "all" | "active" | "expired";
      type: "info" | "warning" | "success";
    };

    if (!message || !target || !type) {
      return NextResponse.json({ status: "fail", message: "message, target, type required" }, { status: 200 });
    }

    const broadcast: Broadcast = {
      id: `bcast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      message,
      target,
      type,
      createdAt: Date.now(),
      readBy: [],
    };
    broadcasts.unshift(broadcast);
    if (broadcasts.length > BROADCAST_MAX) broadcasts.length = BROADCAST_MAX;

    return NextResponse.json({
      status: "success",
      message: "Broadcast sent",
      broadcast,
    }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ status: "fail", message: err?.message || "Server error" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId") || "anonymous";

    const unread = broadcasts
      .filter((b) => !(b.readBy || []).includes(userId))
      .slice(0, 20);
    return NextResponse.json({ status: "success", broadcasts: unread }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ status: "fail", message: err?.message || "Server error" }, { status: 500 });
  }
}
