import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { useAdmin } from "@/lib/admin-store";

/**
 * Bulk Message API (WhatsApp / SMS)
 * POST /api/bulk-message {message, target, channel}
 *   - target: "all" | "active" | "expired"
 *   - channel: "whatsapp" | "sms"
 *   - Generates WhatsApp links for each user
 *   - Returns the links array (admin opens them in batch)
 * GET  /api/bulk-message  → list recent bulk jobs
 */

export interface BulkMessageUser {
  userId: string;
  mobile: string;
  name?: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { message, target, channel } = body as {
      message: string;
      target: "all" | "active" | "expired";
      channel: "whatsapp" | "sms";
    };

    if (!message || !target || !channel) {
      return NextResponse.json({ status: "fail", message: "message, target, channel required" }, { status: 200 });
    }

    // Get users — try Firebase "users" first, then fall back to admin-store local data
    let users: BulkMessageUser[] = [];
    if (db) {
      try {
        const snap = await getDocs(collection(db, "users"));
        snap.forEach((d) => {
          const data = d.data() as any;
          if (data.mobile) {
            users.push({ userId: d.id, mobile: String(data.mobile), name: data.name });
          }
        });
      } catch {
        /* ignore */
      }
    }

    // Fall back to admin store data (client-side — for local admin use only)
    if (users.length === 0) {
      // Note: this only works when called client-side; safe no-op here otherwise
      const adminState = useAdmin.getState();
      for (const u of adminState.users) {
        // Try to find mobile from keys
        const key = adminState.keys.find((k) => k.userName === u.name);
        const mobile = (key as any)?.mobile || (u as any)?.mobile || "";
        if (mobile) users.push({ userId: u.id, mobile: String(mobile), name: u.name });
      }
      for (const k of adminState.keys) {
        if ((k as any).mobile) {
          users.push({ userId: k.key, mobile: String((k as any).mobile), name: k.userName });
        }
      }
    }

    // Filter by target
    const now = Date.now();
    if (target === "active") {
      // Active = license verified + not expired
      const adminState = useAdmin.getState();
      const activeKeySet = new Set(
        adminState.keys
          .filter((k) => k.status === "active" || k.status === "used")
          .filter((k) => !k.expiresAt || k.expiresAt > now)
          .map((k) => k.key)
      );
      users = users.filter((u) => activeKeySet.has(u.userId) || activeKeySet.size === 0);
    } else if (target === "expired") {
      const adminState = useAdmin.getState();
      const expiredKeySet = new Set(
        adminState.keys
          .filter((k) => k.status === "expired" || (k.expiresAt && k.expiresAt <= now))
          .map((k) => k.key)
      );
      users = users.filter((u) => expiredKeySet.has(u.userId));
    }

    // Deduplicate by mobile
    const seen = new Set<string>();
    users = users.filter((u) => {
      const m = u.mobile.replace(/\D/g, "");
      if (seen.has(m) || m.length < 10) return false;
      seen.add(m);
      return true;
    });

    // Generate links
    const encodedMessage = encodeURIComponent(message);
    const links = users.map((u) => {
      const mobile = u.mobile.replace(/\D/g, "");
      // WhatsApp uses country code prefix
      const waNumber = mobile.length === 10 ? `91${mobile}` : mobile;
      if (channel === "whatsapp") {
        return {
          userId: u.userId,
          name: u.name || "",
          mobile,
          url: `https://wa.me/${waNumber}?text=${encodedMessage}`,
        };
      }
      // SMS link
      return {
        userId: u.userId,
        name: u.name || "",
        mobile,
        url: `sms:${mobile}?body=${encodedMessage}`,
      };
    });

    // Record the bulk job
    const jobId = `bulk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    if (db) {
      try {
        await setDoc(doc(db, "bulk_messages", jobId), {
          message,
          target,
          channel,
          recipientCount: links.length,
          createdAt: Date.now(),
          createdAtTs: serverTimestamp(),
        });
      } catch (err) {
        console.log("[BulkMessage] log failed:", err);
      }
    }

    return NextResponse.json({
      status: "success",
      jobId,
      recipientCount: links.length,
      channel,
      links,
    }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ status: "fail", message: err?.message || "Server error" }, { status: 500 });
  }
}

export async function GET() {
  if (!db) {
    return NextResponse.json({ status: "success", jobs: [] }, { status: 200 });
  }
  try {
    const snap = await getDocs(collection(db, "bulk_messages"));
    const jobs: any[] = [];
    snap.forEach((d) => jobs.push({ id: d.id, ...d.data() }));
    jobs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return NextResponse.json({ status: "success", jobs: jobs.slice(0, 50) }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ status: "fail", message: err?.message }, { status: 200 });
  }
}
