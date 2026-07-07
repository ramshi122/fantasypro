import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";

/**
 * Payment API — handles license key purchase
 *
 * Flow:
 *   1. POST /api/payment — create payment order
 *      Body: { mobile, plan, amount }
 *      Returns: { orderId, paymentUrl }
 *
 *   2. POST /api/payment — verify payment + activate key
 *      Body: { orderId, paymentId, status }
 *      Returns: { success, licenseKey, keyType, expiresAt }
 *
 * In production, this would integrate with Razorpay/PhonePe/Stripe.
 * Demo mode: auto-approves payment, generates + activates key immediately.
 */

const PLAN_CONFIG: Record<string, { amount: number; keyType: string; label: string }> = {
  "1-match":   { amount: 49,   keyType: "match_basic", label: "1 Match Access (6h)" },
  "24-hour":   { amount: 99,   keyType: "match_full",  label: "24 Hour Access" },
  "weekly":    { amount: 149,  keyType: "weekly",      label: "Weekly (7 Days)" },
  "pro":       { amount: 299,  keyType: "monthly",     label: "Pro (30 Days)" },
  "elite":     { amount: 999,  keyType: "elite",       label: "Elite (90 Days)" },
  "lifetime":  { amount: 4999, keyType: "lifetime",    label: "Lifetime" },
};

// Generate license key
function generateKey(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `CRICB-${part()}-${part()}-${part()}`;
}

// Get expiry for key type
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

export async function POST(request: Request) {
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

      // Generate order ID
      const newOrderId = `ORD_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      // Store order in Firebase
      if (db) {
        try {
          await setDoc(doc(db, "payment_orders", newOrderId), {
            orderId: newOrderId,
            mobile,
            plan,
            amount: config.amount,
            keyType: config.keyType,
            label: config.label,
            status: "pending",
            createdAt: Date.now(),
            createdAtTs: serverTimestamp(),
          });
        } catch (err) {
          console.error("[Payment] Order creation failed:", err);
        }
      }

      console.log(`[Payment] Order created: ${newOrderId} for ${mobile} - ${plan} (₹${config.amount})`);

      return NextResponse.json({
        status: "success",
        orderId: newOrderId,
        amount: config.amount,
        plan: config.label,
        keyType: config.keyType,
        // Demo mode: payment URL is the verify endpoint
        // Production: would return Razorpay/PhonePe checkout URL
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

      // Get order from Firebase
      let orderData: any = null;
      if (db) {
        try {
          const orderDoc = await getDoc(doc(db, "payment_orders", orderId));
          if (orderDoc.exists()) {
            orderData = orderDoc.data();
          }
        } catch (err) {
          console.error("[Payment] Order fetch failed:", err);
        }
      }

      if (!orderData) {
        return NextResponse.json({
          status: "fail",
          message: "Order not found",
        }, { status: 200 });
      }

      if (orderData.status === "completed") {
        // Already completed — return existing key
        return NextResponse.json({
          status: "success",
          message: "Payment already verified",
          licenseKey: orderData.licenseKey,
          keyType: orderData.keyType,
          expiresAt: orderData.expiresAt,
          alreadyActivated: true,
        }, { status: 200 });
      }

      // Demo mode: auto-approve payment
      // Production: verify paymentId with Razorpay/PhonePe API
      const paymentStatus = status || "success";

      if (paymentStatus !== "success") {
        return NextResponse.json({
          status: "fail",
          message: "Payment failed or cancelled",
        }, { status: 200 });
      }

      // Generate license key
      const licenseKey = generateKey();
      const expiresAt = getExpiry(orderData.keyType);

      // Update order in Firebase
      if (db) {
        try {
          await updateDoc(doc(db, "payment_orders", orderId), {
            status: "completed",
            paymentId: paymentId || `PAY_${Date.now()}`,
            licenseKey,
            expiresAt,
            completedAt: Date.now(),
            completedAtTs: serverTimestamp(),
          });

          // Also store in license_keys collection
          await setDoc(doc(db, "license_keys", licenseKey), {
            key: licenseKey,
            type: orderData.keyType,
            status: "active",
            createdAt: Date.now(),
            expiresAt,
            deviceIds: [],
            verifications: 0,
            userName: orderData.mobile,
            paymentOrderId: orderId,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          console.error("[Payment] Activation failed:", err);
        }
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
}
