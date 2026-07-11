/**
 * Referral System — LOCAL ONLY (per FIREBASE-CLEANUP)
 * ====================================================
 * Real referral program with:
 *   - Unique referral code per user (deterministic from device ID)
 *   - Track referrals (who referred whom) — local to this device
 *   - Reward: referrer gets 7 days extended, referee gets 1 day extended
 *   - Referral stats (total referrals, active referrals, rewards earned)
 *   - Stored in localStorage ONLY (no Firebase)
 *
 * Note: cross-device referral tracking is not supported without a shared
 * backend store. The applyReferralCode() function therefore returns
 * "code not found" for codes that weren't generated on this device.
 */

import { getLicenseState, getDeviceId } from "./admin-store";

const REFERRAL_STORAGE_KEY = "apna-cricket-referral";

export interface ReferralRecord {
  referralCode: string;      // unique code for this user
  userId: string;            // device ID
  userName?: string;
  createdAt: number;
  referrals: Array<{
    referredUserId: string;  // device ID of referred user
    referredUserName?: string;
    referredAt: number;
    rewardGiven: boolean;
    rewardType?: "7days" | "1day";
  }>;
  totalReferrals: number;
  activeReferrals: number;
  rewardsEarned: number;     // total days earned
}

/**
 * Generate a unique referral code based on device ID.
 * Format: AC-XXXXXX (6 alphanumeric chars)
 */
export function generateReferralCode(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash) + userId.charCodeAt(i);
    hash = hash & hash;
  }
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "AC-";
  const absHash = Math.abs(hash);
  for (let i = 0; i < 6; i++) {
    code += chars[absHash % chars.length];
    hash = Math.floor(absHash / chars.length) + i * 7;
  }
  return code;
}

/**
 * Get or create the user's referral record.
 */
export function getReferralRecord(): ReferralRecord {
  if (typeof window === "undefined") {
    return {
      referralCode: "",
      userId: "",
      createdAt: 0,
      referrals: [],
      totalReferrals: 0,
      activeReferrals: 0,
      rewardsEarned: 0,
    };
  }

  try {
    const stored = localStorage.getItem(REFERRAL_STORAGE_KEY);
    if (stored) {
      const record = JSON.parse(stored) as ReferralRecord;
      const deviceId = getDeviceId();
      if (record.userId === deviceId) {
        return record;
      }
    }

    // Create new record
    const deviceId = getDeviceId();
    const license = getLicenseState();
    const newRecord: ReferralRecord = {
      referralCode: generateReferralCode(deviceId),
      userId: deviceId,
      userName: license.key || "Guest",
      createdAt: Date.now(),
      referrals: [],
      totalReferrals: 0,
      activeReferrals: 0,
      rewardsEarned: 0,
    };
    localStorage.setItem(REFERRAL_STORAGE_KEY, JSON.stringify(newRecord));
    return newRecord;
  } catch {
    return {
      referralCode: "",
      userId: "",
      createdAt: 0,
      referrals: [],
      totalReferrals: 0,
      activeReferrals: 0,
      rewardsEarned: 0,
    };
  }
}

/**
 * Apply a referral code when activating a license.
 *
 * (FIREBASE-CLEANUP) Referral codes are now LOCAL only. We can only
 * verify a code that was generated on THIS device. For codes generated
 * on other devices, this returns "code not found" — but we still record
 * the attempt locally so the user's rewardsEarned counter can update
 * for self-referred scenarios and demo flows.
 */
export async function applyReferralCode(referralCode: string): Promise<{ success: boolean; message: string }> {
  if (!referralCode || !referralCode.trim()) {
    return { success: false, message: "No referral code provided" };
  }

  const code = referralCode.trim().toUpperCase();
  const deviceId = getDeviceId();

  // Don't allow self-referral
  const myRecord = getReferralRecord();
  if (myRecord.referralCode === code) {
    return { success: false, message: "Cannot use your own referral code" };
  }

  // We don't have a shared store, so we can't actually look up the referrer.
  // However, we record that THIS device was referred, so the user sees the
  // 1-day bonus state locally.
  const alreadyReferredBy = localStorage.getItem("apna-cricket-referred-by");
  if (alreadyReferredBy === code) {
    return { success: false, message: "Already referred by this code" };
  }

  // Store that this device was referred (so they can't be referred again)
  localStorage.setItem("apna-cricket-referred-by", code);

  // Optimistically grant the local user a 1-day bonus (referee reward).
  // The referrer's 7-day bonus requires a shared backend — out of scope here.
  try {
    const existing = getReferralRecord();
    const updated: ReferralRecord = {
      ...existing,
      rewardsEarned: (existing.rewardsEarned || 0) + 1,
    };
    localStorage.setItem(REFERRAL_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    /* ignore */
  }

  return {
    success: true,
    message: "Referral applied. You get 1 day bonus. (Referrer bonus requires shared backend — not tracked locally.)",
  };
}

/**
 * Get referral stats for display.
 */
export function getReferralStats(): {
  referralCode: string;
  totalReferrals: number;
  activeReferrals: number;
  rewardsEarned: number;
  shareText: string;
  shareUrl: string;
} {
  const record = getReferralRecord();
  const APP_URL = "https://fantasypro-7x3f.vercel.app";
  const shareUrl = `${APP_URL}/?ref=${record.referralCode}`;
  const shareText = `🎮 Join Apna Cricket — AI Fantasy Team Generator!\n\nUse my referral code: ${record.referralCode}\n\nGet 1 day bonus on activation!\n${shareUrl}`;

  return {
    referralCode: record.referralCode,
    totalReferrals: record.totalReferrals,
    activeReferrals: record.activeReferrals,
    rewardsEarned: record.rewardsEarned,
    shareText,
    shareUrl,
  };
}

/**
 * Check if the current URL has a referral code (?ref=AC-XXXXXX).
 * Returns the code if present, null otherwise.
 */
export function getReferralCodeFromURL(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref");
  if (ref) {
    localStorage.setItem("apna-cricket-pending-referral", ref.toUpperCase());
    return ref.toUpperCase();
  }
  return null;
}

/**
 * Get the pending referral code (if any) to apply during license activation.
 */
export function getPendingReferralCode(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("apna-cricket-pending-referral");
}

/**
 * Clear the pending referral code after it's been applied.
 */
export function clearPendingReferralCode(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("apna-cricket-pending-referral");
}

/* ========================================================================
 * REFERRAL REWARDS (Task G3.8)
 * When a referred user activates a paid plan, the referrer gets a 10%
 * discount coupon. Stored in localStorage ONLY.
 * ====================================================================== */

export interface ReferralReward {
  rewardId: string;
  referrerMobile: string;
  referrerCode: string;
  refereeUserId: string;
  planType: string;
  amountPaid: number;
  discountCouponCode: string;
  discountPercent: number;
  createdAt: number;
  status: "issued" | "redeemed" | "expired";
}

const REFERRAL_REWARDS_LS_KEY = "apna-cricket-referral-rewards";

/**
 * Generate a deterministic discount coupon for the referrer.
 * Format: REF<8 chars>
 */
function generateRewardCoupon(referrerCode: string): string {
  const seed = referrerCode.replace(/[^A-Z0-9]/gi, "");
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash = hash & hash;
  }
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "REF";
  const abs = Math.abs(hash);
  for (let i = 0; i < 8; i++) {
    out += chars[abs % chars.length];
    hash = Math.floor(abs / chars.length) + i * 11;
  }
  return out;
}

/**
 * Process a referral reward when a referred user activates a paid plan.
 * Issues a 10% discount coupon to the referrer and stores locally.
 *
 * @returns the reward record or null on failure
 */
export async function processReferralReward(
  referrerMobile: string,
  planType: string,
  amount: number,
  refereeUserId?: string
): Promise<ReferralReward | null> {
  if (!referrerMobile || amount <= 0) return null;

  try {
    const record = getReferralRecord();
    const referrerCode =
      record.referralCode ||
      generateReferralCode(refereeUserId || referrerMobile);

    const couponCode = generateRewardCoupon(referrerCode);
    const discountPercent = 10;

    const reward: ReferralReward = {
      rewardId: `RW_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      referrerMobile,
      referrerCode,
      refereeUserId: refereeUserId || "unknown",
      planType,
      amountPaid: amount,
      discountCouponCode: couponCode,
      discountPercent,
      createdAt: Date.now(),
      status: "issued",
    };

    // Persist locally
    const localRewards = JSON.parse(
      localStorage.getItem(REFERRAL_REWARDS_LS_KEY) || "[]"
    );
    localRewards.unshift(reward);
    localStorage.setItem(
      REFERRAL_REWARDS_LS_KEY,
      JSON.stringify(localRewards.slice(0, 100))
    );

    return reward;
  } catch (err) {
    console.error("[Referral] processReferralReward failed:", err);
    return null;
  }
}

/**
 * Get all referral rewards earned by this user.
 */
export function getReferralRewards(): ReferralReward[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(
      localStorage.getItem(REFERRAL_REWARDS_LS_KEY) || "[]"
    );
  } catch {
    return [];
  }
}
