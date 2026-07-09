import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

/**
 * Admin Broadcast API
 * POST /api/broadcast — send {message, target, type}
 * GET  /api/broadcast?userId=X — get unread broadcasts for user
 * POST /api/broadcast?action=markRead — {broadcastId, userId}
 */

export interface Broadcast {
  id: string;
  message: string;
  target: "all" | "active" | "expired";
  type: "info" | "warning" | "success";
  createdAt: number;
  readBy: string[];
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "markRead") {
      const { broadcastId, userId } = body as { broadcastId: string; userId: string };
      if (!broadcastId || !userId) {
        return NextResponse.json({ status: "fail", message: "Missing fields" }, { status: 200 });
      }
      if (db) {
        try {
          // Fetch existing readBy array via direct doc read
          let readBy: string[] = [];
          try {
            const d = await import("firebase/firestore");
            const ds = await d.getDoc(d.doc(db, "broadcasts", broadcastId));
            if (ds.exists()) readBy = (ds.data() as any)?.readBy || [];
          } catch {
            /* ignore */
          }
          if (!readBy.includes(userId)) readBy.push(userId);
          await updateDoc(doc(db, "broadcasts", broadcastId), { readBy });
        } catch {
          /* ignore */
        }
      }
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

    const broadcast = {
      message,
      target,
      type,
      createdAt: Date.now(),
      readBy: [],
    };

    if (db) {
      try {
        const ref = await addDoc(collection(db, "broadcasts"), {
          ...broadcast,
          createdAtTs: serverTimestamp(),
        });
        return NextResponse.json({
          status: "success",
          message: "Broadcast sent",
          broadcast: { ...broadcast, id: ref.id },
        }, { status: 200 });
      } catch (err: any) {
        console.error("[Broadcast] send failed:", err);
        return NextResponse.json({ status: "fail", message: err?.message || "DB error" }, { status: 200 });
      }
    }

    return NextResponse.json({
      status: "success",
      message: "Broadcast queued (no DB)",
      broadcast: { ...broadcast, id: `local_${Date.now()}` },
    }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ status: "fail", message: err?.message || "Server error" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId") || "anonymous";

    if (db) {
      try {
        const snap = await getDocs(query(collection(db, "broadcasts"), orderBy("createdAt", "desc")));
        const all: Broadcast[] = [];
        snap.forEach((d) => {
          const data = d.data() as any;
          all.push({
            id: d.id,
            message: data.message,
            target: data.target,
            type: data.type,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : Number(data.createdAt || 0),
            readBy: data.readBy || [],
          });
        });
        // Filter unread for this user
        const unread = all.filter((b) => !(b.readBy || []).includes(userId));
        return NextResponse.json({ status: "success", broadcasts: unread.slice(0, 20) }, { status: 200 });
      } catch (err: any) {
        console.error("[Broadcast] fetch failed:", err);
      }
    }

    return NextResponse.json({ status: "success", broadcasts: [] }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ status: "fail", message: err?.message || "Server error" }, { status: 500 });
  }
}
