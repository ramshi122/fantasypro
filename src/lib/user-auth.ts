/**
 * User Authentication — LOCAL ONLY (per FIREBASE-CLEANUP)
 * ========================================================
 * Mobile-based user login with referral code support.
 *
 * Flow:
 *   1. User enters mobile number
 *   2. OTP sent (demo: any 4-digit OTP accepted)
 *   3. On verify, user record created/updated in LOCAL STORAGE
 *   4. Referral code auto-generated from mobile number
 *   5. If ?ref=AC-XXXXXX in URL, referral link recorded locally
 *
 * localStorage keys:
 *   - apna-cricket-user: UserRecord
 *   - apna-cricket-pending-referral: pending referral code
 */

const USER_STORAGE_KEY = "apna-cricket-user";

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
 */
export async function sendUserOTP(mobile: string): Promise<{ success: boolean; message: string }> {
  if (!mobile || !/^\d{10}$/.test(mobile)) {
    return { success: false, message: "Enter valid 10-digit mobile number" };
  }
  await new Promise((r) => setTimeout(r, 800));
  return { success: true, message: `OTP sent to ${mobile}` };
}

/**
 * Verify OTP and login/register user (LOCAL ONLY).
 */
export async function verifyUserOTP(
  mobile: string,
  otp: string
): Promise<{ success: boolean; message: string; user?: UserRecord }> {
  if (!otp || otp.length < 4) {
    return { success: false, message: "Enter valid OTP" };
  }

  const referralCode = generateReferralCodeFromMobile(mobile);

  // Check for pending referral code
  let referredBy: string | undefined;
  if (typeof window !== "undefined") {
    const pending = localStorage.getItem("apna-cricket-pending-referral");
    if (pending && pending !== referralCode) {
      referredBy = pending;
    }
  }

  // Look for an existing local user
  const existing = getCurrentUser();
  if (existing && existing.mobile === mobile) {
    // Existing user — update lastLogin
    const finalRecord: UserRecord = {
      ...existing,
      lastLogin: Date.now(),
    };
    if (typeof window !== "undefined") {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(finalRecord));
    }
    return { success: true, message: "Login successful", user: finalRecord };
  }

  // New user — create record
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

  if (typeof window !== "undefined") {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userRecord));
  }

  return { success: true, message: "Registration successful", user: userRecord };
}

/**
 * Logout current user.
 */
export function logoutUser(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(USER_STORAGE_KEY);
}

/**
 * Update user's plan in localStorage.
 */
export async function updateUserPlan(mobile: string, plan: string): Promise<void> {
  const user = getCurrentUser();
  if (!user) return;
  const updated: UserRecord = { ...user, plan };
  if (typeof window !== "undefined") {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(updated));
  }
}

/**
 * Get referral stats for current user (local).
 */
export async function getReferralStatsFromFirebase(): Promise<{
  referralCount: number;
  rewardsEarned: number;
}> {
  const user = getCurrentUser();
  if (!user) return { referralCount: 0, rewardsEarned: 0 };
  return {
    referralCount: user.referralCount || 0,
    rewardsEarned: user.rewardsEarned || 0,
  };
}
