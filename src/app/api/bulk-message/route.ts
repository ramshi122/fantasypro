import { NextResponse } from "next/server";
import { useAdmin } from "@/lib/admin-store";

/**
 * Bulk Message API (WhatsApp / SMS) — LOCAL ONLY (per FIREBASE-CLEANUP)
 * ======================================================================
 * POST /api/bulk-message {message, target, channel}
 *   - target: "all" | "active" | "expired"
 *   - channel: "whatsapp" | "sms"
 *   - Generates WhatsApp links for each user (sourced from local admin store)
 *   - Returns the links array (admin opens them in batch)
 * GET  /api/bulk-message  → list recent bulk jobs (in-memory)
 */

export interface BulkMessageUser {
  userId: string;
  mobile: string;
  name?: string;
}

interface BulkJob {
  id: string;
  message: string;
  target: "all" | "active" | "expired";
  channel: "whatsapp" | "sms";
  recipientCount: number;
  createdAt: number;
}

// In-memory job log (per-instance)
const bulkJobs: BulkJob[] = [];
const BULK_JOBS_MAX = 100;

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

    // Source users from the local admin store (no Firebase)
    let users: BulkMessageUser[] = [];
    const adminState = useAdmin.getState();
    for (const u of adminState.users) {
      const key = adminState.keys.find((k) => k.userName === u.name);
      const mobile = (key as any)?.mobile || (u as any)?.mobile || "";
      if (mobile) users.push({ userId: u.id, mobile: String(mobile), name: u.name });
    }
    for (const k of adminState.keys) {
      if ((k as any).mobile) {
        users.push({ userId: k.key, mobile: String((k as any).mobile), name: k.userName });
      }
    }

    // Filter by target
    const now = Date.now();
    if (target === "active") {
      const activeKeySet = new Set(
        adminState.keys
          .filter((k) => k.status === "active" || k.status === "used")
          .filter((k) => !k.expiresAt || k.expiresAt > now)
          .map((k) => k.key)
      );
      users = users.filter((u) => activeKeySet.has(u.userId) || activeKeySet.size === 0);
    } else if (target === "expired") {
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
      const waNumber = mobile.length === 10 ? `91${mobile}` : mobile;
      if (channel === "whatsapp") {
        return {
          userId: u.userId,
          name: u.name || "",
          mobile,
          url: `https://wa.me/${waNumber}?text=${encodedMessage}`,
        };
      }
      return {
        userId: u.userId,
        name: u.name || "",
        mobile,
        url: `sms:${mobile}?body=${encodedMessage}`,
      };
    });

    // Record the bulk job (in-memory)
    const jobId = `bulk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const job: BulkJob = {
      id: jobId,
      message,
      target,
      channel,
      recipientCount: links.length,
      createdAt: Date.now(),
    };
    bulkJobs.unshift(job);
    if (bulkJobs.length > BULK_JOBS_MAX) bulkJobs.length = BULK_JOBS_MAX;

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
  return NextResponse.json({ status: "success", jobs: bulkJobs.slice(0, 50) }, { status: 200 });
}
