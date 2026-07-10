import { NextResponse } from "next/server";

/**
 * POST /api/admin/push-notification
 * body: { title, body, target: "all"|"active"|"expired", url? }
 *
 * Sends push notification via Firebase Cloud Messaging (FCM).
 * Also saves broadcast to Firestore for in-app display.
 *
 * NOTE: Firebase Admin SDK requires service account credentials.
 * Since we can't use Admin SDK in this environment (no service account key),
 * we save the broadcast to Firestore and use client-side FCM on next app load.
 *
 * For real push notifications, user needs:
 * 1. App open (PWA notification permission granted)
 * 2. FCM token saved in Firestore "push_tokens" collection
 * 3. Service worker (sw.js) handles push events
 */
export async function POST(request: Request) {
  try {
    const { title, body, target = "all", url } = await request.json();

    if (!title || !body) {
      return NextResponse.json({ status: "fail", message: "title and body are required" }, { status: 200 });
    }

    // Save broadcast to Firestore (for both push + in-app)
    const { db } = await import("@/lib/firebase");
    if (!db) {
      return NextResponse.json({ status: "fail", message: "Firebase not initialized" }, { status: 200 });
    }

    const { addDoc, collection, serverTimestamp } = await import("firebase/firestore");

    await addDoc(collection(db, "broadcasts"), {
      title,
      body,
      target,
      url: url || null,
      type: "push",
      sentAt: serverTimestamp(),
      sentAtMs: Date.now(),
    });

    // Also save to push_notifications collection for FCM
    await addDoc(collection(db, "push_notifications"), {
      title,
      body,
      target,
      url: url || null,
      status: "pending",
      createdAt: serverTimestamp(),
      createdAtMs: Date.now(),
    });

    return NextResponse.json({
      status: "success",
      message: "Push notification queued — will be delivered to all devices on next app open",
      sent: 0,
      note: "Real-time FCM requires Firebase Admin SDK (server-side). Broadcast saved for client-side delivery.",
    }, { status: 200 });

  } catch (error) {
    console.error("[Push] Error:", error);
    return NextResponse.json({
      status: "fail",
      message: error instanceof Error ? error.message : "Server error",
    }, { status: 200 });
  }
}
