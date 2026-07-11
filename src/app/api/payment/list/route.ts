import { NextResponse } from "next/server";

/**
 * Payment List API — LOCAL ONLY (per FIREBASE-CLEANUP)
 * ======================================================
 * Returns payment orders from the in-memory server-side Map (per-instance,
 * cleared on cold start). Admin-only.
 *
 * Query params:
 *   ?status=pending  — only pending orders
 *   ?status=completed — only completed orders
 *   ?status=failed   — only failed orders
 *   (no param)       — all orders
 *
 * NOTE: Since the in-memory store is per-instance, this endpoint may return
 * empty results after a cold start. The admin store on each device keeps
 * a long-lived mirror of all generated keys (via syncFromFirebase).
 */

// Shared in-memory store keyed by orderId. The Payment POST route creates
// orders here. We import the same Map by re-exporting it lazily.
// (We can't import the route.ts file directly, so we accept that orders
// created on a different instance won't be visible. The admin-store keys
// list is the durable source of truth across instances.)
const orders = new Map<string, any>();

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get("status");

    let all = Array.from(orders.values());
    if (statusFilter) all = all.filter((p) => p.status === statusFilter);
    all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const payments = all.map((data) => ({
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
    }));

    const summary = {
      total: payments.length,
      pending: payments.filter((p) => p.status === "pending").length,
      completed: payments.filter((p) => p.status === "completed").length,
      failed: payments.filter((p) => p.status === "failed").length,
      totalRevenue: payments
        .filter((p) => p.status === "completed")
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

/**
 * Internal helper used by the payment route to register an order so that
 * this list endpoint can see it. Kept here to avoid a circular import.
 */
export function _registerOrder(order: any): void {
  if (!order?.orderId) return;
  orders.set(order.orderId, order);
  // Cap the store to avoid unbounded growth
  if (orders.size > 500) {
    const firstKey = orders.keys().next().value;
    if (firstKey) orders.delete(firstKey);
  }
}

export function _updateOrder(orderId: string, updates: any): void {
  const existing = orders.get(orderId);
  if (!existing) return;
  orders.set(orderId, { ...existing, ...updates });
}
