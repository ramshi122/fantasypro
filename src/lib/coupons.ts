/**
 * Coupon System
 * =============
 * Pre-defined coupons: CRIC10 (10%), CRIC20 (20%), CRIC50 (₹50 off)
 * Plus referral-issued coupons.
 *
 * Firebase collection "coupons": {code, discountType, value, maxUses, usedCount, validUntil}
 */

import { db } from "./firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  serverTimestamp,
  increment,
} from "firebase/firestore";

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

/** Predefined coupon catalog */
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

/**
 * Ensure predefined coupons exist in Firebase.
 * Safe to call multiple times.
 */
export async function ensurePredefinedCoupons(): Promise<void> {
  if (!db) return;
  for (const c of PREDEFINED_COUPONS) {
    try {
      const ref = doc(db, "coupons", c.code);
      const existing = await getDoc(ref);
      if (!existing.exists()) {
        await setDoc(ref, {
          ...c,
          createdAt: Date.now(),
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      console.log("[Coupons] ensure failed:", c.code, err);
    }
  }
}

/**
 * Get a coupon from Firebase or predefined list.
 */
export async function fetchCoupon(code: string): Promise<Coupon | null> {
  if (!code) return null;
  const upper = code.trim().toUpperCase();

  // Check predefined first
  const predefined = PREDEFINED_COUPONS.find((c) => c.code === upper);
  if (predefined) {
    // Try to fetch latest usedCount from Firebase
    if (db) {
      try {
        const snap = await getDoc(doc(db, "coupons", upper));
        if (snap.exists()) {
          return { ...(predefined as Coupon), ...snap.data() } as Coupon;
        }
      } catch {
        // fallthrough
      }
    }
    return predefined as Coupon;
  }

  // Referral coupons live only in Firebase
  if (db) {
    try {
      const snap = await getDoc(doc(db, "coupons", upper));
      if (snap.exists()) {
        return { code: upper, ...(snap.data() as Omit<Coupon, "code">) };
      }
    } catch {
      // fallthrough
    }
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
 * Apply a coupon — increments usedCount in Firebase.
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

  // Increment usedCount in Firebase
  if (db) {
    try {
      await updateDoc(doc(db, "coupons", coupon.code), {
        usedCount: increment(1),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.log("[Coupons] apply failed to sync:", err);
    }
  }

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
 * List all coupons (admin).
 */
export async function listAllCoupons(): Promise<Coupon[]> {
  if (!db) return PREDEFINED_COUPONS as Coupon[];
  try {
    const snap = await getDocs(collection(db, "coupons"));
    const out: Coupon[] = [];
    snap.forEach((d) => out.push({ code: d.id, ...(d.data() as Omit<Coupon, "code">) }));
    // Merge predefined
    for (const p of PREDEFINED_COUPONS) {
      if (!out.find((c) => c.code === p.code)) out.push(p as Coupon);
    }
    return out;
  } catch {
    return PREDEFINED_COUPONS as Coupon[];
  }
}
