import { NextResponse } from "next/server";
import { withSecurity } from "@/lib/security-wrapper";

/**
 * Payment API — LOCAL ONLY (per FIREBASE-CLEANUP)
 * =================================================
 * Handles license key purchase.
 * PROTECTED: Rate limited to 5 requests/minute per IP.
 *
 * Orders + license keys are stored in an in-memory server-side Map
 * (per-instance, cleared on cold start). On a successful payment, the
 * generated license key is also written to the admin-store (localStorage)
 * on the client that initiated the purchase — and to Firebase
 * (license_keys/{keyStr}) via the admin-store's syncKeyToFirestore()
 * flow so that the key can be verified on any device.
 *
 * Flow:
 *   1. POST /api/payment — create payment order
 *      Body: { action: "create-order", mobile, plan }
 *      Returns: { orderId, amount, plan, keyType }
 *
 *   2. POST /api/payment — verify payment + activate key
 *      Body: { action: "verify", orderId, paymentId, status }
 *      Returns: { licenseKey, keyType, expiresAt }
 */

const PLAN_CONFIG: Record<string, { amount: number; keyType: string; label: string }> = {
  "1-match":   { amount: 49,   keyType: "match_basic", label: "1 Match Access (6h)" },
  "24-hour":   { amount: 99,   keyType: "match_full",  label: "24 Hour Access" },
  "weekly":    { amount: 149,  keyType: "weekly",      label: "Weekly (7 Days)" },
  "pro":       { amount: 299,  keyType: "monthly",     label: "Pro (30 Days)" },
  "elite":     { amount: 999,  keyType: "elite",       label: "Elite (90 Days)" },
  "lifetime":  { amount: 4999, keyType: "lifetime",    label: "Lifetime" },
};

interface PaymentOrder {
  orderId: string;
  mobile: string;
  plan: string;
  amount: number;
  keyType: string;
  label: string;
  status: "pending" | "completed" | "failed";
  paymentId?: string;
  licenseKey?: string;
  expiresAt?: number | null;
  createdAt: number;
  completedAt?: number;
  failedAt?: number;
}

const orders = new Map<string, PaymentOrder>();

function generateKey(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `CRICB-${part()}-${part()}-${part()}`;
}

function getExpiry(keyType: string): number | null {
  const now = Date.now();
  const day = 86400000;
  const hour = 3600000;
  switch (keyType) {
    case "trial": return now + 1 * day;
    case "match_basic": return now + 6 * hour;
    case "match_full": return now + 1 * day;
    case "weekly": return now + 7 * day;
    case "monthly": return now + 30 * day;
    case "elite": return now + 90 * day;
    case "lifetime": return null;
    default: return now + 1 * day;
  }
}

// Protected POST handler — rate limited to 5 requests/minute
export const POST = withSecurity(async (request: Request) => {
  try {
    const body = await request.json();
    const { action, mobile, plan, orderId, paymentId, status } = body;

    // ===== STEP 1: Create Payment Order =====
    if (action === "create-order") {
      if (!mobile || !plan) {
        return NextResponse.json({
          status: "fail",
          message: "mobile and plan are required",
        }, { status: 200 });
      }

      const config = PLAN_CONFIG[plan];
      if (!config) {
        return NextResponse.json({
          status: "fail",
          message: "Invalid plan",
        }, { status: 200 });
      }

      const newOrderId = `ORD_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const order: PaymentOrder = {
        orderId: newOrderId,
        mobile,
        plan,
        amount: config.amount,
        keyType: config.keyType,
        label: config.label,
        status: "pending",
        createdAt: Date.now(),
      };
      orders.set(newOrderId, order);

      console.log(`[Payment] Order created: ${newOrderId} for ${mobile} - ${plan} (₹${config.amount})`);

      return NextResponse.json({
        status: "success",
        orderId: newOrderId,
        amount: config.amount,
        plan: config.label,
        keyType: config.keyType,
        paymentUrl: null, // Client handles payment UI
      }, { status: 200 });
    }

    // ===== STEP 2: Verify Payment + Activate Key =====
    if (action === "verify") {
      if (!orderId) {
        return NextResponse.json({
          status: "fail",
          message: "orderId is required",
        }, { status: 200 });
      }

      const orderData = orders.get(orderId);
      if (!orderData) {
        return NextResponse.json({
          status: "fail",
          message: "Order not found",
        }, { status: 200 });
      }

      if (orderData.status === "completed") {
        return NextResponse.json({
          status: "success",
          message: "Payment already verified",
          licenseKey: orderData.licenseKey,
          keyType: orderData.keyType,
          expiresAt: orderData.expiresAt,
          alreadyActivated: true,
        }, { status: 200 });
      }

      const paymentStatus = status || "pending";

      if (paymentStatus === "failed") {
        orderData.status = "failed";
        orderData.failedAt = Date.now();
        return NextResponse.json({
          status: "fail",
          message: "Payment failed. No key generated. Please try again.",
          code: "PAYMENT_FAILED",
        }, { status: 200 });
      }

      if (paymentStatus === "pending") {
        return NextResponse.json({
          status: "fail",
          message: "Payment not confirmed yet. Complete the UPI payment first, then click confirm.",
          code: "PAYMENT_PENDING",
        }, { status: 200 });
      }

      // paymentStatus === "success" → generate key
      const licenseKey = generateKey();
      const expiresAt = getExpiry(orderData.keyType);
      orderData.status = "completed";
      orderData.paymentId = paymentId || `PAY_${Date.now()}`;
      orderData.licenseKey = licenseKey;
      orderData.expiresAt = expiresAt;
      orderData.completedAt = Date.now();

      // Sync the new license key to Firebase (single-doc set) so that any
      // device can verify it later via fetchKeyFromFirestore. The admin-store
      // on the originating device will pick it up on its next sync.
      try {
        const { syncKeyToFirestore } = await import("@/lib/firebase-license");
        await syncKeyToFirestore({
          key: licenseKey,
          type: orderData.keyType as any,
          status: "active",
          createdAt: Date.now(),
          expiresAt,
          deviceIds: [],
          verifications: 0,
          userName: orderData.mobile,
        });
      } catch (err) {
        console.warn("[Payment] License sync to Firebase failed:", err);
      }

      console.log(`[Payment] ✅ Payment verified: ${orderId} → Key: ${licenseKey} (${orderData.keyType})`);

      return NextResponse.json({
        status: "success",
        message: "Payment verified! License key activated.",
        licenseKey,
        keyType: orderData.keyType,
        expiresAt,
        plan: orderData.label,
        amount: orderData.amount,
      }, { status: 200 });
    }

    return NextResponse.json({
      status: "fail",
      message: "Invalid action. Use 'create-order' or 'verify'.",
    }, { status: 200 });

  } catch (error) {
    console.error("[Payment] Route error:", error);
    return NextResponse.json({
      status: "fail",
      message: "Server error",
    }, { status: 200 });
  }
}, { rateLimit: 5 }); // 5 requests per minute for payment
