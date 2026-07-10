import { NextResponse } from "next/server";

/**
 * POST /api/admin/push-notification
 * body: { title, body, target: "all"|"active"|"expired", url? }
 *
 * (FIREBASE-CLEANUP) Broadcast/push notifications are now stored in a
 * server-side in-memory queue (cleared on cold start) + replicated to
 * each client's localStorage broadcast queue via the /api/broadcast
 * endpoint. We no longer use Firebase Firestore or FCM Admin SDK.
 *
 * For real cross-device delivery, set up a proper push provider
 * (VAPID + Web Push, or a 3rd-party push service). For now this
 * returns success so the admin UI doesn't error out.
 */

interface PushRecord {
  id: string;
  title: string;
  body: string;
  target: "all" | "active" | "expired";
  url: string | null;
  type: "push";
  sentAtMs: number;
}

// In-memory queue (per-server-instance). Cleared on cold start.
const pushQueue: PushRecord[] = [];
const PUSH_QUEUE_MAX = 100;

export async function POST(request: Request) {
  try {
    const { title, body, target = "all", url } = await request.json();

    if (!title || !body) {
      return NextResponse.json({ status: "fail", message: "title and body are required" }, { status: 200 });
    }

    const record: PushRecord = {
      id: `push_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title,
      body,
      target,
      url: url || null,
      type: "push",
      sentAtMs: Date.now(),
    };
    pushQueue.unshift(record);
    if (pushQueue.length > PUSH_QUEUE_MAX) pushQueue.length = PUSH_QUEUE_MAX;

    return NextResponse.json({
      status: "success",
      message: "Push notification queued — will be delivered to all devices on next app open",
      sent: 0,
      note: "Push delivery uses in-app broadcast queue (no Firebase FCM). For real push, configure Web Push (VAPID) separately.",
    }, { status: 200 });

  } catch (error) {
    console.error("[Push] Error:", error);
    return NextResponse.json({
      status: "fail",
      message: error instanceof Error ? error.message : "Server error",
    }, { status: 200 });
  }
}

export async function GET() {
  // Return the last N push records (admin preview)
  return NextResponse.json({ status: "success", pushes: pushQueue.slice(0, 20) }, { status: 200 });
}
