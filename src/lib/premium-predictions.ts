/**
 * Premium Predictions — LOCAL ONLY (per FIREBASE-CLEANUP)
 * ========================================================
 * Expert match predictions: winner, top batsman, top bowler, best C/VC.
 * Stored in localStorage. Access: Elite + Lifetime only.
 */

import type { KeyType } from "./admin-store";

export interface MatchPrediction {
  matchId: string;
  matchName?: string;
  predictedWinner: string;
  topBatsman: string;
  topBowler: string;
  bestCaptain: string;
  bestViceCaptain: string;
  tossPrediction?: string;
  scorePrediction?: string;
  confidence: number; // 0-100
  expertNote?: string;
  createdAt: number;
  createdBy?: string;
}

const LS_KEY = "apna-cricket-predictions";

const ELITE_PLANS: KeyType[] = ["elite", "lifetime"];

export function canAccessPredictions(plan?: KeyType | null): boolean {
  return !!plan && ELITE_PLANS.includes(plan);
}

function readAll(): Record<string, MatchPrediction> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, MatchPrediction>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_KEY, JSON.stringify(map));
}

/**
 * Get prediction for a match.
 */
export async function getPrediction(matchId: string): Promise<MatchPrediction | null> {
  if (!matchId) return null;
  try {
    const all = readAll();
    return all[matchId] || null;
  } catch (err) {
    console.error("[Predictions] get failed:", err);
    return null;
  }
}

/**
 * Create or update a prediction for a match (local).
 */
export async function createPrediction(
  matchId: string,
  data: Omit<MatchPrediction, "matchId" | "createdAt">
): Promise<MatchPrediction | null> {
  if (!matchId) return null;
  try {
    const prediction: MatchPrediction = {
      ...data,
      matchId,
      createdAt: Date.now(),
    };
    const all = readAll();
    all[matchId] = prediction;
    writeAll(all);
    return prediction;
  } catch (err) {
    console.error("[Predictions] create failed:", err);
    return null;
  }
}

/**
 * List recent predictions (admin/expert view).
 */
export async function listPredictions(limitCount = 20): Promise<MatchPrediction[]> {
  try {
    const all = readAll();
    return Object.values(all)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, limitCount);
  } catch {
    return [];
  }
}

/**
 * Get predictions for a list of match IDs (batch).
 */
export async function getPredictionsForMatches(matchIds: string[]): Promise<MatchPrediction[]> {
  if (matchIds.length === 0) return [];
  const out: MatchPrediction[] = [];
  for (const id of matchIds.slice(0, 10)) {
    const p = await getPrediction(id);
    if (p) out.push(p);
  }
  return out;
}

/**
 * Check if user plan allows premium predictions.
 */
export function checkPredictionAccess(plan?: KeyType | null): {
  allowed: boolean;
  message: string;
} {
  if (canAccessPredictions(plan)) {
    return { allowed: true, message: "Premium prediction access granted" };
  }
  return {
    allowed: false,
    message: "Premium predictions require Elite or Lifetime plan. Upgrade to unlock.",
  };
}
