import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, orderBy } from "firebase/firestore";

/**
 * Payment List API — admin only
 * Returns all payment orders from Firebase.
 *
 * Query params:
 *   ?status=pending  — only pending orders
 *   ?status=completed — only completed orders
 *   ?status=failed   — only failed orders
 *   (no param)       — all orders
 */

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get("status");

    if (!db) {
      return NextResponse.json({
        status: "fail",
        message: "Firebase not initialized",
        payments: [],
      }, { status: 200 });
    }

    let q;
    if (statusFilter) {
      q = query(collection(db, "payment_orders"), orderBy("createdAt", "desc"));
    } else {
      q = query(collection(db, "payment_orders"), orderBy("createdAt", "desc"));
    }

    const snap = await getDocs(q);
    const payments: any[] = [];

    snap.forEach((doc) => {
      const data = doc.data();
      // Filter by status if specified
      if (statusFilter && data.status !== statusFilter) return;

      payments.push({
        orderId: data.orderId,
        mobile: data.mobile,
        plan: data.plan,
        amount: data.amount,
        keyType: data.keyType,
        label: data.label,
        status: data.status,
        licenseKey: data.licenseKey || null,
        expiresAt: data.expiresAt || null,
        paymentId: data.paymentId || null,
        createdAt: data.createdAt,
        completedAt: data.completedAt || null,
        failedAt: data.failedAt || null,
      });
    });

    // Summary stats
    const summary = {
      total: payments.length,
      pending: payments.filter(p => p.status === "pending").length,
      completed: payments.filter(p => p.status === "completed").length,
      failed: payments.filter(p => p.status === "failed").length,
      totalRevenue: payments
        .filter(p => p.status === "completed")
        .reduce((sum, p) => sum + (p.amount || 0), 0),
    };

    return NextResponse.json({
      status: "success",
      payments,
      summary,
    }, { status: 200 });
  } catch (error) {
    console.error("[Payment List] Error:", error);
    return NextResponse.json({
      status: "fail",
      message: "Server error",
      payments: [],
    }, { status: 200 });
  }
}
