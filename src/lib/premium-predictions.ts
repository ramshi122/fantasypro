/**
 * Premium Predictions
 * ===================
 * Expert match predictions: winner, top batsman, top bowler, best C/VC.
 * Stored in Firebase "predictions" collection.
 * Access: Elite + Lifetime only.
 */

import { db } from "./firebase";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
} from "firebase/firestore";
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

const COLLECTION = "predictions";

const ELITE_PLANS: KeyType[] = ["elite", "lifetime"];

export function canAccessPredictions(plan?: KeyType | null): boolean {
  return !!plan && ELITE_PLANS.includes(plan);
}

/**
 * Get prediction for a match.
 */
export async function getPrediction(matchId: string): Promise<MatchPrediction | null> {
  if (!db || !matchId) return null;
  try {
    const snap = await getDoc(doc(db, COLLECTION, matchId));
    if (snap.exists()) {
      return { matchId, ...snap.data() } as MatchPrediction;
    }
    return null;
  } catch (err) {
    console.error("[Predictions] get failed:", err);
    return null;
  }
}

/**
 * Create or update a prediction for a match.
 */
export async function createPrediction(
  matchId: string,
  data: Omit<MatchPrediction, "matchId" | "createdAt">
): Promise<MatchPrediction | null> {
  if (!db || !matchId) return null;
  try {
    const prediction: MatchPrediction = {
      ...data,
      matchId,
      createdAt: Date.now(),
    };
    await setDoc(doc(db, COLLECTION, matchId), {
      ...prediction,
      updatedAt: serverTimestamp(),
    });
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
  if (!db) return [];
  try {
    const q = query(collection(db, COLLECTION), orderBy("createdAt", "desc"), limit(limitCount));
    const snap = await getDocs(q);
    const out: MatchPrediction[] = [];
    snap.forEach((d) => out.push({ matchId: d.id, ...d.data() } as MatchPrediction));
    return out;
  } catch {
    return [];
  }
}

/**
 * Get predictions for a list of match IDs (batch).
 */
export async function getPredictionsForMatches(matchIds: string[]): Promise<MatchPrediction[]> {
  if (!db || matchIds.length === 0) return [];
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
