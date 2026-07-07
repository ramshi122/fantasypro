/**
 * User Authentication + Firebase Integration
 * ===========================================
 * Mobile-based user login with referral code support.
 *
 * Flow:
 *   1. User enters mobile number
 *   2. OTP sent (demo: any 4-digit OTP accepted)
 *   3. On verify, user record created/updated in Firebase
 *   4. Referral code auto-generated from mobile number
 *   5. If ?ref=AC-XXXXXX in URL, referral link created in Firebase
 *
 * Firebase collections:
 *   - users: { mobile, referralCode, createdAt, referralBy, plan }
 *   - referrals: { referralCode, userId, referrals[], rewardsEarned }
 */

import { db } from "./firebase";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";

const USER_STORAGE_KEY = "apna-cricket-user";
const USERS_COLLECTION = "users";

export interface UserRecord {
  mobile: string;
  referralCode: string;
  referredBy?: string;       // referral code of the person who referred them
  createdAt: number;
  lastLogin: number;
  plan: string;              // current license tier
  name?: string;
  rewardsEarned: number;     // total referral reward days
  referralCount: number;     // how many people they referred
}

/**
 * Generate a referral code from mobile number.
 * Format: AC-XXXXXX (6 chars derived from mobile)
 */
export function generateReferralCodeFromMobile(mobile: string): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  // Use mobile digits to create deterministic code
  let hash = 0;
  for (let i = 0; i < mobile.length; i++) {
    hash = ((hash << 5) - hash) + parseInt(mobile[i] || "0");
    hash = hash & hash;
  }
  const absHash = Math.abs(hash);
  let code = "AC-";
  let temp = absHash;
  for (let i = 0; i < 6; i++) {
    code += chars[temp % chars.length];
    temp = Math.floor(temp / chars.length) + i * 13 + parseInt(mobile[i % mobile.length] || "0");
  }
  return code;
}

/**
 * Get the current logged-in user from localStorage.
 */
export function getCurrentUser(): UserRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(USER_STORAGE_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as UserRecord;
  } catch {
    return null;
  }
}

/**
 * Send OTP to mobile number.
 * Demo mode: accepts any 4-digit OTP.
 * Production: would call backend SMS API.
 */
export async function sendUserOTP(mobile: string): Promise<{ success: boolean; message: string }> {
  if (!mobile || !/^\d{10}$/.test(mobile)) {
    return { success: false, message: "Enter valid 10-digit mobile number" };
  }
  // Simulate OTP send delay
  await new Promise((r) => setTimeout(r, 800));
  return { success: true, message: `OTP sent to ${mobile}` };
}

/**
 * Verify OTP and login/register user.
 * - Creates user record in Firebase if new
 * - Updates lastLogin if existing
 * - Applies pending referral code if present
 */
export async function verifyUserOTP(
  mobile: string,
  otp: string
): Promise<{ success: boolean; message: string; user?: UserRecord }> {
  if (!otp || otp.length < 4) {
    return { success: false, message: "Enter valid OTP" };
  }

  // Demo mode: accept any 4+ digit OTP
  // Production: verify against backend

  const referralCode = generateReferralCodeFromMobile(mobile);

  // Check for pending referral code (from URL ?ref=AC-XXXXXX)
  let referredBy: string | undefined;
  if (typeof window !== "undefined") {
    const pending = localStorage.getItem("apna-cricket-pending-referral");
    if (pending && pending !== referralCode) {
      referredBy = pending;
    }
  }

  const userRecord: UserRecord = {
    mobile,
    referralCode,
    referredBy,
    createdAt: Date.now(),
    lastLogin: Date.now(),
    plan: "trial",
    rewardsEarned: referredBy ? 1 : 0, // 1 day bonus if referred
    referralCount: 0,
  };

  // Save to localStorage
  if (typeof window !== "undefined") {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userRecord));
  }

  // Sync to Firebase
  if (db) {
    try {
      // Check if user already exists
      const existingDoc = await getDoc(doc(db, USERS_COLLECTION, mobile));

      if (existingDoc.exists()) {
        // Existing user — update lastLogin
        const existingData = existingDoc.data() as UserRecord;
        const updatedRecord: Partial<UserRecord> = {
          lastLogin: Date.now(),
        };
        await updateDoc(doc(db, USERS_COLLECTION, mobile), {
          ...updatedRecord,
          updatedAt: serverTimestamp(),
        });

        // Use existing referral code (don't change it)
        const finalRecord: UserRecord = {
          ...existingData,
          lastLogin: Date.now(),
        };
        if (typeof window !== "undefined") {
          localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(finalRecord));
        }
        return { success: true, message: "Login successful", user: finalRecord };
      } else {
        // New user — create record
        await setDoc(doc(db, USERS_COLLECTION, mobile), {
          ...userRecord,
          updatedAt: serverTimestamp(),
        });

        // If referred by someone, update referrer's record
        if (referredBy) {
          await applyReferralLink(referredBy, mobile, referralCode);
        }

        return { success: true, message: "Registration successful", user: userRecord };
      }
    } catch (err) {
      console.error("[UserAuth] Firebase sync failed:", err);
      // Continue anyway — localStorage has the record
      return { success: true, message: "Login successful (offline)", user: userRecord };
    }
  }

  return { success: true, message: "Login successful", user: userRecord };
}

/**
 * Apply referral link — update referrer's record with new referral.
 */
async function applyReferralLink(
  referrerCode: string,
  referredMobile: string,
  referredCode: string
): Promise<void> {
  if (!db) return;

  try {
    // Find referrer by referral code
    const q = query(collection(db, USERS_COLLECTION), where("referralCode", "==", referrerCode));
    const snap = await getDocs(q);

    if (snap.empty) {
      console.log("[UserAuth] Referrer not found:", referrerCode);
      return;
    }

    const referrerDoc = snap.docs[0];
    const referrerData = referrerDoc.data() as UserRecord;

    // Update referrer's referral count + rewards
    await updateDoc(referrerDoc.ref, {
      referralCount: (referrerData.referralCount || 0) + 1,
      rewardsEarned: (referrerData.rewardsEarned || 0) + 7, // 7 days bonus
      updatedAt: serverTimestamp(),
    });

    console.log("[UserAuth] Referral link created:", referrerCode, "→", referredCode);
  } catch (err) {
    console.error("[UserAuth] applyReferralLink failed:", err);
  }
}

/**
 * Logout current user.
 */
export function logoutUser(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(USER_STORAGE_KEY);
}

/**
 * Update user's plan in localStorage + Firebase.
 */
export async function updateUserPlan(mobile: string, plan: string): Promise<void> {
  const user = getCurrentUser();
  if (!user) return;

  const updated: UserRecord = { ...user, plan };
  if (typeof window !== "undefined") {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updated));
  }

  if (db) {
    try {
      await updateDoc(doc(db, USERS_COLLECTION, mobile), {
        plan,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("[UserAuth] updateUserPlan failed:", err);
    }
  }
}

/**
 * Get referral stats for current user from Firebase.
 */
export async function getReferralStatsFromFirebase(): Promise<{
  referralCount: number;
  rewardsEarned: number;
}> {
  const user = getCurrentUser();
  if (!user || !db) {
    return { referralCount: 0, rewardsEarned: 0 };
  }

  try {
    const doc = await getDoc(doc(db, USERS_COLLECTION, user.mobile));
    if (!doc.exists()) return { referralCount: 0, rewardsEarned: 0 };
    const data = doc.data() as UserRecord;
    return {
      referralCount: data.referralCount || 0,
      rewardsEarned: data.rewardsEarned || 0,
    };
  } catch {
    return { referralCount: 0, rewardsEarned: 0 };
  }
}
