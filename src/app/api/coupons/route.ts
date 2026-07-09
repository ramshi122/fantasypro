import { NextResponse } from "next/server";
import {
  PREDEFINED_COUPONS,
  ensurePredefinedCoupons,
  fetchCoupon,
  validateCoupon,
  applyCoupon,
  listAllCoupons,
  type PlanType,
} from "@/lib/coupons";

/**
 * Coupons API
 * GET  /api/coupons            → list all
 * GET  /api/coupons?code=X     → fetch one
 * POST /api/coupons?action=validate   → validate {code, planType?}
 * POST /api/coupons?action=apply      → apply {code, planType, amount}
 * POST /api/coupons?action=seed       → seed predefined coupons
 */

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");

    if (code) {
      const coupon = await fetchCoupon(code);
      if (!coupon) {
        return NextResponse.json({ status: "fail", message: "Coupon not found" }, { status: 200 });
      }
      return NextResponse.json({ status: "success", coupon }, { status: 200 });
    }

    const coupons = await listAllCoupons();
    return NextResponse.json({ status: "success", coupons }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ status: "fail", message: err?.message || "Server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "seed") {
      await ensurePredefinedCoupons();
      return NextResponse.json({
        status: "success",
        message: "Predefined coupons seeded",
        coupons: PREDEFINED_COUPONS,
      }, { status: 200 });
    }

    if (action === "validate") {
      const { code, planType } = body as { code: string; planType?: PlanType };
      const result = await validateCoupon(code, planType);
      return NextResponse.json({ status: result.valid ? "success" : "fail", ...result }, { status: 200 });
    }

    if (action === "apply") {
      const { code, planType, amount } = body as {
        code: string;
        planType: PlanType;
        amount: number;
      };
      if (!code || !planType || !Number.isFinite(amount)) {
        return NextResponse.json({ status: "fail", message: "Missing code, planType, or amount" }, { status: 200 });
      }
      const result = await applyCoupon(code, planType, Number(amount));
      return NextResponse.json({ status: result.success ? "success" : "fail", ...result }, { status: 200 });
    }

    return NextResponse.json({ status: "fail", message: "Unknown action" }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ status: "fail", message: err?.message || "Server error" }, { status: 500 });
  }
}
