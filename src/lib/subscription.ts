/**
 * Subscription Tier System — APNA CRICKET
 * =======================================
 * Server-side source of truth for all tier features.
 * Matches /api/license/verify route exactly.
 *
 * ⚠️ Frontend checks are for UI only. All real enforcement is server-side.
 */

import type { KeyType } from "./admin-store";

export type Tier = KeyType;

export interface TierFeatures {
  // Team Generation
  teamGeneration: boolean;
  teamGenerationLimit: number;

  // Transfer
  dream11Transfer: "locked" | "3/day" | "unlimited";
  my11CircleTransfer: "locked" | "enabled" | "unlimited";
  contestJoin: boolean;
  multiPlatform: boolean;

  // Premium Features
  expertTeams: boolean;
  primeTeams: boolean;
  eliteAI: boolean;

  // NEW Premium Features (locked by subscription)
  autoJoinContest: boolean;        // Auto-Join All Contests
  autoTransferScheduler: boolean;  // Auto-Transfer on lineup
  contestTracker: boolean;         // Contest Profit/Loss Tracker
  multiMatchGenerator: boolean;    // Multi-Match Generator
  pushNotifications: boolean;      // Firebase Push Notifications
  whatsappShare: boolean;          // WhatsApp Direct Send
  multiLanguage: boolean;          // Multi-Language support
  playerFormDashboard: boolean;    // Player Form Dashboard
  captainRotation: boolean;        // Smart Captain Rotation
  teamBackup: boolean;             // Team Backup/Restore
  cricketLivePage: boolean;        // CREX Cricket Live page
  serverSideAutoJoin: boolean;     // Server-side auto-join (cron)

  // NEW v2 Features (multi-account + copy-paste)
  multiAccountDream11: boolean;    // Up to 5 Dream11 accounts
  multiAccountMy11Circle: boolean; // Up to 5 My11Circle accounts
  bulkCopyPaste: boolean;          // Bulk team copy-paste between matches

  // Referral
  referralProgram: boolean;

  // Metadata
  tierName: string;
  tierColor: string;
  tierEmoji: string;
  tierPrice: string;
  tierDuration: string;
}

export function getTierFeatures(tier: Tier | string | null | undefined): TierFeatures {
  const t = (tier || "trial") as Tier;

  switch (t) {
    case "trial":
      return {
        teamGeneration: true, teamGenerationLimit: 10,
        dream11Transfer: "3/day", my11CircleTransfer: "locked",
        contestJoin: false, multiPlatform: false,
        expertTeams: false, primeTeams: false, eliteAI: false,
        autoJoinContest: false, autoTransferScheduler: false, contestTracker: false,
        multiMatchGenerator: false, pushNotifications: false, whatsappShare: false,
        multiLanguage: false, playerFormDashboard: false, captainRotation: false,
        teamBackup: false, cricketLivePage: false, serverSideAutoJoin: false,
        multiAccountDream11: false, multiAccountMy11Circle: false, bulkCopyPaste: false,
        referralProgram: true,
        tierName: "Trial", tierColor: "from-emerald-500 to-green-600",
        tierEmoji: "🆓", tierPrice: "FREE", tierDuration: "Unlimited",
      };

    case "match_basic":
      return {
        teamGeneration: true, teamGenerationLimit: 20,
        dream11Transfer: "unlimited", my11CircleTransfer: "locked",
        contestJoin: true, multiPlatform: false,
        expertTeams: false, primeTeams: false, eliteAI: false,
        autoJoinContest: true, autoTransferScheduler: false, contestTracker: false,
        multiMatchGenerator: false, pushNotifications: false, whatsappShare: false,
        multiLanguage: false, playerFormDashboard: false, captainRotation: false,
        teamBackup: true, cricketLivePage: true, serverSideAutoJoin: false,
        multiAccountDream11: false, multiAccountMy11Circle: false, bulkCopyPaste: true,
        referralProgram: true,
        tierName: "1 Match", tierColor: "from-amber-500 to-orange-600",
        tierEmoji: "🎟", tierPrice: "₹49", tierDuration: "1 Match",
      };

    case "match_full":
      return {
        teamGeneration: true, teamGenerationLimit: 40,
        dream11Transfer: "unlimited", my11CircleTransfer: "enabled",
        contestJoin: true, multiPlatform: false,
        expertTeams: false, primeTeams: false, eliteAI: false,
        autoJoinContest: true, autoTransferScheduler: false, contestTracker: true,
        multiMatchGenerator: false, pushNotifications: false, whatsappShare: true,
        multiLanguage: false, playerFormDashboard: false, captainRotation: false,
        teamBackup: true, cricketLivePage: true, serverSideAutoJoin: false,
        multiAccountDream11: false, multiAccountMy11Circle: false, bulkCopyPaste: true,
        referralProgram: true,
        tierName: "24 Hours", tierColor: "from-rose-500 to-pink-600",
        tierEmoji: "⏰", tierPrice: "₹99", tierDuration: "24 Hours",
      };

    case "weekly":
      return {
        teamGeneration: true, teamGenerationLimit: 40,
        dream11Transfer: "unlimited", my11CircleTransfer: "enabled",
        contestJoin: true, multiPlatform: false,
        expertTeams: false, primeTeams: false, eliteAI: false,
        autoJoinContest: true, autoTransferScheduler: false, contestTracker: true,
        multiMatchGenerator: false, pushNotifications: true, whatsappShare: true,
        multiLanguage: true, playerFormDashboard: false, captainRotation: false,
        teamBackup: true, cricketLivePage: true, serverSideAutoJoin: false,
        multiAccountDream11: false, multiAccountMy11Circle: false, bulkCopyPaste: true,
        referralProgram: true,
        tierName: "Weekly", tierColor: "from-sky-500 to-blue-600",
        tierEmoji: "📅", tierPrice: "₹149", tierDuration: "7 Days",
      };

    case "monthly":
      return {
        teamGeneration: true, teamGenerationLimit: 40,
        dream11Transfer: "unlimited", my11CircleTransfer: "enabled",
        contestJoin: true, multiPlatform: false,
        expertTeams: true, primeTeams: false, eliteAI: false,
        autoJoinContest: true, autoTransferScheduler: true, contestTracker: true,
        multiMatchGenerator: true, pushNotifications: true, whatsappShare: true,
        multiLanguage: true, playerFormDashboard: true, captainRotation: true,
        teamBackup: true, cricketLivePage: true, serverSideAutoJoin: false,
        multiAccountDream11: true, multiAccountMy11Circle: true, bulkCopyPaste: true,
        referralProgram: true,
        tierName: "Pro", tierColor: "from-sky-500 to-blue-600",
        tierEmoji: "⭐", tierPrice: "₹299", tierDuration: "30 Days",
      };

    case "half_yearly":
      return {
        teamGeneration: true, teamGenerationLimit: 100,
        dream11Transfer: "unlimited", my11CircleTransfer: "unlimited",
        contestJoin: true, multiPlatform: true,
        expertTeams: true, primeTeams: true, eliteAI: false,
        autoJoinContest: true, autoTransferScheduler: true, contestTracker: true,
        multiMatchGenerator: true, pushNotifications: true, whatsappShare: true,
        multiLanguage: true, playerFormDashboard: true, captainRotation: true,
        teamBackup: true, cricketLivePage: true, serverSideAutoJoin: false,
        multiAccountDream11: true, multiAccountMy11Circle: true, bulkCopyPaste: true,
        referralProgram: true,
        tierName: "Semi-Annual", tierColor: "from-indigo-500 to-violet-600",
        tierEmoji: "🔮", tierPrice: "₹499", tierDuration: "180 Days",
      };

    case "elite":
      return {
        teamGeneration: true, teamGenerationLimit: 500,
        dream11Transfer: "unlimited", my11CircleTransfer: "unlimited",
        contestJoin: true, multiPlatform: true,
        expertTeams: true, primeTeams: true, eliteAI: true,
        autoJoinContest: true, autoTransferScheduler: true, contestTracker: true,
        multiMatchGenerator: true, pushNotifications: true, whatsappShare: true,
        multiLanguage: true, playerFormDashboard: true, captainRotation: true,
        teamBackup: true, cricketLivePage: true, serverSideAutoJoin: true,
        multiAccountDream11: true, multiAccountMy11Circle: true, bulkCopyPaste: true,
        referralProgram: true,
        tierName: "Elite", tierColor: "from-violet-500 to-purple-600",
        tierEmoji: "👑", tierPrice: "₹999", tierDuration: "90 Days",
      };

    case "lifetime":
      return {
        teamGeneration: true, teamGenerationLimit: 500,
        dream11Transfer: "unlimited", my11CircleTransfer: "unlimited",
        contestJoin: true, multiPlatform: true,
        expertTeams: true, primeTeams: true, eliteAI: true,
        autoJoinContest: true, autoTransferScheduler: true, contestTracker: true,
        multiMatchGenerator: true, pushNotifications: true, whatsappShare: true,
        multiLanguage: true, playerFormDashboard: true, captainRotation: true,
        teamBackup: true, cricketLivePage: true, serverSideAutoJoin: true,
        multiAccountDream11: true, multiAccountMy11Circle: true, bulkCopyPaste: true,
        referralProgram: true,
        tierName: "Lifetime", tierColor: "from-amber-500 to-yellow-600",
        tierEmoji: "💎", tierPrice: "—", tierDuration: "Forever",
      };

    default:
      return getTierFeatures("trial");
  }
}

// Helper functions for frontend UI checks (NOT for security — server verifies)
export function hasFeature(tier: string | null, feature: keyof TierFeatures): boolean {
  return Boolean(getTierFeatures(tier)[feature]);
}

export function getTeamGenerationLimit(tier: string | null): number {
  return getTierFeatures(tier).teamGenerationLimit;
}

export function canDream11Transfer(tier: string | null): boolean {
  return getTierFeatures(tier).dream11Transfer !== "locked";
}

export function canMy11CircleTransfer(tier: string | null): boolean {
  return getTierFeatures(tier).my11CircleTransfer !== "locked";
}

export function canJoinContest(tier: string | null): boolean {
  return getTierFeatures(tier).contestJoin;
}

export function canAccessExpertTeams(tier: string | null): boolean {
  return getTierFeatures(tier).expertTeams;
}

export function canAccessPrimeTeams(tier: string | null): boolean {
  return getTierFeatures(tier).primeTeams;
}

export function canAccessEliteAI(tier: string | null): boolean {
  return getTierFeatures(tier).eliteAI;
}

export function canMultiPlatform(tier: string | null): boolean {
  return getTierFeatures(tier).multiPlatform;
}

export function canMultiAccountDream11(tier: string | null): boolean {
  return getTierFeatures(tier).multiAccountDream11;
}

export function canMultiAccountMy11Circle(tier: string | null): boolean {
  return getTierFeatures(tier).multiAccountMy11Circle;
}

export function canBulkCopyPaste(tier: string | null): boolean {
  return getTierFeatures(tier).bulkCopyPaste;
}

/** Get max accounts for a platform based on tier */
export function getMaxAccountsForPlatform(tier: string | null, app: string): number {
  const features = getTierFeatures(tier);
  if (app === "dream11") return features.multiAccountDream11 ? 5 : 1;
  if (app === "my11circle") return features.multiAccountMy11Circle ? 5 : 1;
  // Other platforms (jumbo, myteam11, vision11) — single account only for now
  return 1;
}

/**
 * Check a feature via SERVER-SIDE API.
 * This is the REAL check — frontend checks are only for UI.
 *
 * Usage:
 *   const result = await checkFeatureServerSide(licenseKey, deviceId, "my11circle_transfer");
 *   if (!result.valid) { // blocked }
 */
export async function checkFeatureServerSide(
  licenseKey: string,
  deviceId: string,
  feature: string,
  action?: "check" | "increment_transfer" | "increment_team_gen"
): Promise<{
  valid: boolean;
  message?: string;
  code?: string;
  tier?: string;
  features?: TierFeatures;
  remaining?: {
    dream11Transfers: number;  // -1 = unlimited, 0 = locked/used
    teamGeneration: number;
  };
}> {
  try {
    const res = await fetch("/api/license/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ licenseKey, deviceId, feature, action }),
    });
    const data = await res.json();
    return data;
  } catch {
    return { valid: false, message: "Server error", code: "NETWORK_ERROR" };
  }
}
