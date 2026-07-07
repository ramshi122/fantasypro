/**
 * Subscription Tier System
 * ========================
 * Defines what features each license key type unlocks.
 *
 * Feature Matrix:
 * ┌─────────────────────────┬─────────┬──────────────┬──────────┬───────────┐
 * │ Feature                 │ Trial   │ Match Basic  │ Match Full│ Pro/Elite │
 * │                         │ (1 day) │ (6h, 1 match)│ (24h)    │ (30/90d)  │
 * ├─────────────────────────┼─────────┼──────────────┼──────────┼───────────┤
 * │ Team Generation         │ ✅ FREE │ ✅ FREE      │ ✅ FREE  │ ✅ FREE   │
 * │ Single Team Transfer    │ 3/day   │ UNLIMITED    │ UNLIMITED│ UNLIMITED │
 * │ Bulk Add All Teams      │ ❌ NO   │ UP TO 11     │ UP TO 11 │ UP TO 40  │
 * │ Per-Team Replace Mode   │ ❌ NO   │ ❌ NO        │ ❌ NO    │ ✅ YES    │
 * │ Bulk Replace All Teams  │ ❌ NO   │ ❌ NO        │ ❌ NO    │ ✅ YES    │
 * │ Multi-Account           │ ❌ NO   │ SINGLE ONLY  │ SINGLE   │ ✅ YES    │
 * │ My11Circle Transfer     │ ❌ NO   │ ❌ NO        │ ✅ YES   │ ✅ YES    │
 * │ Dream11 Transfer        │ ✅ YES  │ ✅ YES       │ ✅ YES   │ ✅ YES    │
 * │ Elite AI (25 checks)    │ ❌ NO   │ ❌ NO        │ ❌ NO    │ Elite only│
 * │ Rank 1-40 Teams         │ ❌ NO   │ ❌ NO        │ ❌ NO    │ Elite only│
 * │ Contest Join            │ ❌ NO   │ ✅ YES       │ ✅ YES   │ ✅ YES    │
 * │ Referral Program        │ ✅ YES  │ ✅ YES       │ ✅ YES   │ ✅ YES    │
 * └─────────────────────────┴─────────┴──────────────┴──────────┴───────────┘
 *
 * Tier hierarchy:
 *   trial       —最基本的 (1 day, limited)
 *   match_basic — 1 match access (6h, single match)
 *   match_full  — 24 hour full access
 *   weekly      — 7 days (same as Pro)
 *   monthly     — Pro tier (30 days)
 *   elite       — Elite tier (90 days, full access + Elite AI)
 *   lifetime    — Elite tier (forever, full access + Elite AI)
 */

import type { KeyType } from "./admin-store";

export type Tier = "trial" | "match_basic" | "match_full" | "weekly" | "monthly" | "elite" | "lifetime";

export interface TierFeatures {
  // Team Generation
  teamGeneration: boolean;
  teamGenerationLimit: number; // max teams per generation

  // Transfer
  singleTransferPerDay: number; // 0 = blocked, -1 = unlimited
  bulkAddLimit: number; // 0 = blocked, 11 = up to 11, 40 = up to 40
  perTeamReplaceMode: boolean;
  bulkReplaceAll: boolean;

  // Multi-Account
  multiAccount: boolean; // Dream11 + My11Circle simultaneously

  // Platform Access
  dream11Transfer: boolean;
  my11CircleTransfer: boolean;

  // Elite AI
  eliteAI: boolean;
  rank1to40Teams: boolean;

  // Contest
  contestJoin: boolean;

  // Referral
  referralProgram: boolean;

  // Metadata
  tierName: string;
  tierColor: string;
  tierEmoji: string;
  tierPrice: string;
  tierDuration: string;
}

/**
 * Get features for a given tier.
 */
export function getTierFeatures(tier: Tier | string | null | undefined): TierFeatures {
  const t = (tier || "trial") as Tier;

  switch (t) {
    case "trial":
      return {
        teamGeneration: true,
        teamGenerationLimit: 10,
        singleTransferPerDay: 3,
        bulkAddLimit: 0,
        perTeamReplaceMode: false,
        bulkReplaceAll: false,
        multiAccount: false,
        dream11Transfer: true,
        my11CircleTransfer: false,
        eliteAI: false,
        rank1to40Teams: false,
        contestJoin: false,
        referralProgram: true,
        tierName: "Trial",
        tierColor: "from-emerald-500 to-green-600",
        tierEmoji: "🆓",
        tierPrice: "FREE",
        tierDuration: "1 Day",
      };

    case "match_basic":
      return {
        teamGeneration: true,
        teamGenerationLimit: 20,
        singleTransferPerDay: -1, // unlimited
        bulkAddLimit: 11,
        perTeamReplaceMode: false,
        bulkReplaceAll: false,
        multiAccount: false,
        dream11Transfer: true,
        my11CircleTransfer: false,
        eliteAI: false,
        rank1to40Teams: false,
        contestJoin: true,
        referralProgram: true,
        tierName: "1 Match",
        tierColor: "from-amber-500 to-orange-600",
        tierEmoji: "🏏",
        tierPrice: "₹49",
        tierDuration: "6 Hours",
      };

    case "match_full":
      return {
        teamGeneration: true,
        teamGenerationLimit: 40,
        singleTransferPerDay: -1,
        bulkAddLimit: 11,
        perTeamReplaceMode: false,
        bulkReplaceAll: false,
        multiAccount: false,
        dream11Transfer: true,
        my11CircleTransfer: true,
        eliteAI: false,
        rank1to40Teams: false,
        contestJoin: true,
        referralProgram: true,
        tierName: "24 Hour",
        tierColor: "from-rose-500 to-pink-600",
        tierEmoji: "⏰",
        tierPrice: "₹99",
        tierDuration: "24 Hours",
      };

    case "weekly":
      return {
        teamGeneration: true,
        teamGenerationLimit: 40,
        singleTransferPerDay: -1,
        bulkAddLimit: 40,
        perTeamReplaceMode: true,
        bulkReplaceAll: true,
        multiAccount: true,
        dream11Transfer: true,
        my11CircleTransfer: true,
        eliteAI: false,
        rank1to40Teams: false,
        contestJoin: true,
        referralProgram: true,
        tierName: "Weekly",
        tierColor: "from-sky-500 to-blue-600",
        tierEmoji: "📅",
        tierPrice: "₹149",
        tierDuration: "7 Days",
      };

    case "monthly":
      return {
        teamGeneration: true,
        teamGenerationLimit: 40,
        singleTransferPerDay: -1,
        bulkAddLimit: 40,
        perTeamReplaceMode: true,
        bulkReplaceAll: true,
        multiAccount: true,
        dream11Transfer: true,
        my11CircleTransfer: true,
        eliteAI: false,
        rank1to40Teams: false,
        contestJoin: true,
        referralProgram: true,
        tierName: "Pro",
        tierColor: "from-sky-500 to-blue-600",
        tierEmoji: "💎",
        tierPrice: "₹299",
        tierDuration: "30 Days",
      };

    case "elite":
      return {
        teamGeneration: true,
        teamGenerationLimit: 500,
        singleTransferPerDay: -1,
        bulkAddLimit: 40,
        perTeamReplaceMode: true,
        bulkReplaceAll: true,
        multiAccount: true,
        dream11Transfer: true,
        my11CircleTransfer: true,
        eliteAI: true,
        rank1to40Teams: true,
        contestJoin: true,
        referralProgram: true,
        tierName: "Elite",
        tierColor: "from-violet-500 to-purple-600",
        tierEmoji: "👑",
        tierPrice: "₹999",
        tierDuration: "90 Days",
      };

    case "lifetime":
      return {
        teamGeneration: true,
        teamGenerationLimit: 500,
        singleTransferPerDay: -1,
        bulkAddLimit: 40,
        perTeamReplaceMode: true,
        bulkReplaceAll: true,
        multiAccount: true,
        dream11Transfer: true,
        my11CircleTransfer: true,
        eliteAI: true,
        rank1to40Teams: true,
        contestJoin: true,
        referralProgram: true,
        tierName: "Lifetime",
        tierColor: "from-amber-500 to-yellow-600",
        tierEmoji: "♾️",
        tierPrice: "₹4999",
        tierDuration: "Forever",
      };

    default:
      return getTierFeatures("trial");
  }
}

/**
 * Check if a feature is accessible for the given tier.
 */
export function hasFeature(tier: Tier | string | null | undefined, feature: keyof TierFeatures): boolean {
  const features = getTierFeatures(tier);
  return Boolean(features[feature]);
}

/**
 * Get team generation limit for tier.
 */
export function getTeamGenerationLimit(tier: Tier | string | null | undefined): number {
  return getTierFeatures(tier).teamGenerationLimit;
}

/**
 * Get bulk add limit for tier.
 */
export function getBulkAddLimit(tier: Tier | string | null | undefined): number {
  return getTierFeatures(tier).bulkAddLimit;
}

/**
 * Get single transfer limit per day for tier.
 * Returns -1 for unlimited.
 */
export function getSingleTransferLimit(tier: Tier | string | null | undefined): number {
  return getTierFeatures(tier).singleTransferPerDay;
}

/**
 * Check if Elite AI is accessible.
 */
export function hasEliteAI(tier: Tier | string | null | undefined): boolean {
  return getTierFeatures(tier).eliteAI;
}

/**
 * Check if My11Circle transfer is accessible.
 */
export function hasMy11Circle(tier: Tier | string | null | undefined): boolean {
  return getTierFeatures(tier).my11CircleTransfer;
}

/**
 * Check if multi-account is accessible.
 */
export function hasMultiAccount(tier: Tier | string | null | undefined): boolean {
  return getTierFeatures(tier).multiAccount;
}

/**
 * Check if contest join is accessible.
 */
export function hasContestJoin(tier: Tier | string | null | undefined): boolean {
  return getTierFeatures(tier).contestJoin;
}
