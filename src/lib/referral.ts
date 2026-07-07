/**
 * Referral System
 * ===============
 * Real referral program with:
 *   - Unique referral code per user
 *   - Track referrals (who referred whom)
 *   - Reward: referrer gets 7 days extended, referee gets 1 day extended
 *   - Referral stats (total referrals, active referrals, rewards earned)
 *   - Stored in localStorage + synced to Firebase
 */

import { db } from "./firebase";
import {
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { getLicenseState, getDeviceId } from "./admin-store";

const REFERRAL_COLLECTION = "referrals";
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
  // Use device ID to create deterministic code
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
      // Validate device ID matches
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

    // Sync to Firebase (async, non-blocking)
    if (db) {
      setDoc(doc(db, REFERRAL_COLLECTION, newRecord.referralCode), {
        ...newRecord,
        updatedAt: serverTimestamp(),
      }).catch((err) => console.log("[Referral] Sync failed:", err));
    }

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
 * This links the new user to the referrer.
 *
 * Returns true if the referral was applied successfully.
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

  if (!db) {
    return { success: false, message: "Firebase not available — referral skipped" };
  }

  try {
    // Find the referrer in Firebase
    const referrerDoc = await getDoc(doc(db, REFERRAL_COLLECTION, code));
    if (!referrerDoc.exists()) {
      return { success: false, message: "Referral code not found" };
    }

    const referrerData = referrerDoc.data() as ReferralRecord;

    // Check if this device was already referred
    const alreadyReferred = referrerData.referrals?.some(
      (r) => r.referredUserId === deviceId
    );
    if (alreadyReferred) {
      return { success: false, message: "Already referred by this code" };
    }

    // Add referral to referrer's record
    const newReferral = {
      referredUserId: deviceId,
      referredUserName: "New User",
      referredAt: Date.now(),
      rewardGiven: true,
      rewardType: "7days" as const,
    };

    const updatedReferrals = [...(referrerData.referrals || []), newReferral];
    const updatedRecord: Partial<ReferralRecord> = {
      referrals: updatedReferrals,
      totalReferrals: updatedReferrals.length,
      activeReferrals: updatedReferrals.filter((r) => r.rewardGiven).length,
      rewardsEarned: (referrerData.rewardsEarned || 0) + 7,
    };

    await updateDoc(doc(db, REFERRAL_COLLECTION, code), {
      ...updatedRecord,
      updatedAt: serverTimestamp(),
    });

    // Store that this device was referred (so they can't be referred again)
    localStorage.setItem("apna-cricket-referred-by", code);

    return {
      success: true,
      message: "Referral applied! Referrer gets 7 days bonus. You get 1 day bonus.",
    };
  } catch (err) {
    console.error("[Referral] applyReferralCode failed:", err);
    return { success: false, message: "Referral error — try again" };
  }
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
  const shareUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/?ref=${record.referralCode}`;
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
    // Store in localStorage for later use during license activation
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
