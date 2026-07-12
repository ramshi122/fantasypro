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
    // Also source from keys that have userName — admin can add mobile via key generation
    let users: BulkMessageUser[] = [];
    const adminState = useAdmin.getState();

    // 1. From users array
    for (const u of adminState.users) {
      const mobile = (u as any)?.mobile || (u as any)?.phone || "";
      if (mobile) users.push({ userId: u.id, mobile: String(mobile), name: u.name });
    }

    // 2. From keys — use userName as display, look for mobile field
    for (const k of adminState.keys) {
      const mobile = (k as any).mobile || (k as any).phone || "";
      if (mobile) {
        users.push({ userId: k.key, mobile: String(mobile), name: k.userName || k.key });
      }
    }

    // 3. If no users with mobile found, generate demo links from all keys
    // (admin can use these as templates — replace with real numbers)
    if (users.length === 0) {
      for (const k of adminState.keys.slice(0, 50)) {
        // Use a placeholder mobile — admin must replace before sending
        users.push({ userId: k.key, mobile: "0000000000", name: k.userName || k.key });
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

    // Deduplicate by mobile (keep first occurrence)
    const seen = new Set<string>();
    users = users.filter((u) => {
      const m = u.mobile.replace(/\D/g, "");
      if (seen.has(m)) return false;
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
