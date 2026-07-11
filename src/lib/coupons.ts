/**
 * Coupon System — LOCAL ONLY (per FIREBASE-CLEANUP)
 * =================================================
 * Pre-defined coupons: CRIC10 (10%), CRIC20 (20%), CRIC50 (₹50 off)
 * Plus referral-issued coupons (stored in localStorage).
 *
 * Used coupon counters are tracked in localStorage (per-device). Cross-
 * device usage limits are not enforced without a shared backend.
 */

export type DiscountType = "percent" | "flat";
export type PlanType =
  | "trial"
  | "match_basic"
  | "match_full"
  | "weekly"
  | "monthly"
  | "elite"
  | "lifetime";

export interface Coupon {
  code: string;
  discountType: DiscountType;
  value: number;          // percent (1-100) or flat ₹ amount
  maxUses: number;        // 0 = unlimited
  usedCount: number;
  validUntil: number;     // timestamp
  source?: string;
  referrerMobile?: string;
  createdAt?: number;
  description?: string;
}

const CUSTOM_COUPONS_LS_KEY = "apna-cricket-custom-coupons";
const USAGE_LS_KEY = "apna-cricket-coupon-usage";

/** Predefined coupon catalog (same on every phone — deterministic seed). */
export const PREDEFINED_COUPONS: Array<Partial<Coupon> & { code: string; description: string }> = [
  {
    code: "CRIC10",
    discountType: "percent",
    value: 10,
    maxUses: 1000,
    usedCount: 0,
    validUntil: Date.now() + 365 * 86400000,
    description: "10% off any plan",
  },
  {
    code: "CRIC20",
    discountType: "percent",
    value: 20,
    maxUses: 500,
    usedCount: 0,
    validUntil: Date.now() + 365 * 86400000,
    description: "20% off (monthly+ only)",
  },
  {
    code: "CRIC50",
    discountType: "flat",
    value: 50,
    maxUses: 1000,
    usedCount: 0,
    validUntil: Date.now() + 365 * 86400000,
    description: "₹50 off (elite+ only)",
  },
];

/** Local-only custom coupon store (referral coupons). */
function readCustomCoupons(): Record<string, Coupon> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_COUPONS_LS_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeCustomCoupons(map: Record<string, Coupon>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CUSTOM_COUPONS_LS_KEY, JSON.stringify(map));
}

/** Per-device usage counters (code → usedCount). */
function readUsage(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(USAGE_LS_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeUsage(map: Record<string, number>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(USAGE_LS_KEY, JSON.stringify(map));
}

/**
 * No-op for compatibility — predefined coupons are seeded inline above.
 */
export async function ensurePredefinedCoupons(): Promise<void> {
  // Nothing to do — coupons are static.
}

/**
 * Get a coupon from predefined catalog or local custom store.
 */
export async function fetchCoupon(code: string): Promise<Coupon | null> {
  if (!code) return null;
  const upper = code.trim().toUpperCase();

  // Check predefined first
  const predefined = PREDEFINED_COUPONS.find((c) => c.code === upper);
  if (predefined) {
    const usage = readUsage()[upper] || 0;
    return { ...(predefined as Coupon), usedCount: usage };
  }

  // Custom (referral) coupons live only in localStorage
  const custom = readCustomCoupons()[upper];
  if (custom) {
    const usage = readUsage()[upper] || 0;
    return { ...custom, usedCount: usage };
  }

  return null;
}

/**
 * Validate a coupon (without applying).
 * Returns validity + discount info.
 */
export async function validateCoupon(
  code: string,
  planType?: PlanType
): Promise<{ valid: boolean; coupon?: Coupon; message: string }> {
  const coupon = await fetchCoupon(code);
  if (!coupon) {
    return { valid: false, message: "Coupon not found" };
  }
  if (coupon.validUntil && coupon.validUntil < Date.now()) {
    return { valid: false, coupon, message: "Coupon expired" };
  }
  if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
    return { valid: false, coupon, message: "Coupon usage limit reached" };
  }
  // Plan restrictions
  if (coupon.code === "CRIC20" && planType && !["monthly", "elite", "lifetime"].includes(planType)) {
    return { valid: false, coupon, message: "CRIC20 valid only on Monthly/Elite/Lifetime plans" };
  }
  if (coupon.code === "CRIC50" && planType && !["elite", "lifetime"].includes(planType)) {
    return { valid: false, coupon, message: "CRIC50 valid only on Elite/Lifetime plans" };
  }
  return { valid: true, coupon, message: "Coupon applied" };
}

/**
 * Apply a coupon — increments local usedCount.
 * Returns the discount amount in ₹.
 */
export async function applyCoupon(
  code: string,
  planType: PlanType,
  amount: number
): Promise<{ success: boolean; discount: number; finalAmount: number; message: string }> {
  const validation = await validateCoupon(code, planType);
  if (!validation.valid || !validation.coupon) {
    return { success: false, discount: 0, finalAmount: amount, message: validation.message };
  }

  const coupon = validation.coupon;
  let discount = 0;
  if (coupon.discountType === "percent") {
    discount = Math.round((amount * coupon.value) / 100);
  } else {
    discount = Math.min(coupon.value, amount);
  }

  const finalAmount = Math.max(0, amount - discount);

  // Increment local usedCount
  const usage = readUsage();
  usage[coupon.code] = (usage[coupon.code] || 0) + 1;
  writeUsage(usage);

  return {
    success: true,
    discount,
    finalAmount,
    message: `₹${discount} discount applied`,
  };
}

/**
 * Get discount amount without applying (preview).
 */
export async function getCouponDiscount(
  code: string,
  amount: number
): Promise<number> {
  const coupon = await fetchCoupon(code);
  if (!coupon) return 0;
  if (coupon.validUntil && coupon.validUntil < Date.now()) return 0;
  if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) return 0;
  if (coupon.discountType === "percent") {
    return Math.round((amount * coupon.value) / 100);
  }
  return Math.min(coupon.value, amount);
}

/**
 * List all coupons (admin) — predefined + local custom.
 */
export async function listAllCoupons(): Promise<Coupon[]> {
  const out: Coupon[] = [];
  const usage = readUsage();
  for (const p of PREDEFINED_COUPONS) {
    out.push({ ...(p as Coupon), usedCount: usage[p.code] || 0 });
  }
  for (const c of Object.values(readCustomCoupons())) {
    out.push({ ...c, usedCount: usage[c.code] || 0 });
  }
  return out;
}

/**
 * Add a custom coupon (admin / referral system).
 */
export async function addCustomCoupon(coupon: Coupon): Promise<void> {
  const map = readCustomCoupons();
  map[coupon.code] = coupon;
  writeCustomCoupons(map);
}
