import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  increment,
  serverTimestamp,
} from "firebase/firestore";

/**
 * Leaderboard API
 * GET  /api/leaderboard?type=teamGenerators&range=weekly  → top team generators
 * GET  /api/leaderboard?type=contestWinners&range=all      → top contest winners
 * POST /api/leaderboard?action=recordTeamGen   {userId, userName, count, matchId}
 * POST /api/leaderboard?action=recordWin       {userId, userName, prizeWon, contestId, platform}
 *
 * Firebase "leaderboard" collection: {userId, userName, teamCount, totalPrize, weeklyTeamCount, weeklyPrize, lastActive}
 */

export interface LeaderboardEntry {
  userId: string;
  userName: string;
  teamCount: number;
  totalPrize: number;
  weeklyTeamCount: number;
  weeklyPrize: number;
  lastActive: number;
}

const COLLECTION = "leaderboard";

async function getEntry(userId: string): Promise<LeaderboardEntry | null> {
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, COLLECTION, userId));
    if (!snap.exists()) return null;
    return { userId, ...(snap.data() as Omit<LeaderboardEntry, "userId">) };
  } catch {
    return null;
  }
}

async function ensureEntry(userId: string, userName: string): Promise<LeaderboardEntry> {
  const existing = await getEntry(userId);
  if (existing) return existing;
  const fresh: LeaderboardEntry = {
    userId,
    userName,
    teamCount: 0,
    totalPrize: 0,
    weeklyTeamCount: 0,
    weeklyPrize: 0,
    lastActive: Date.now(),
  };
  if (db) {
    try {
      await setDoc(doc(db, COLLECTION, userId), { ...fresh, createdAtTs: serverTimestamp() });
    } catch (err) {
      console.log("[Leaderboard] init failed:", err);
    }
  }
  return fresh;
}

function isThisWeek(ts: number): boolean {
  if (!ts) return false;
  const now = Date.now();
  const weekAgo = now - 7 * 86400000;
  return ts >= weekAgo;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const type = (url.searchParams.get("type") || "teamGenerators") as "teamGenerators" | "contestWinners";
    const range = (url.searchParams.get("range") || "all") as "weekly" | "all";
    const limitN = Math.min(100, Number(url.searchParams.get("limit") || 50));

    if (!db) {
      return NextResponse.json({ status: "success", leaderboard: [] }, { status: 200 });
    }

    let sortField = "teamCount";
    if (type === "contestWinners") sortField = "totalPrize";
    if (range === "weekly") {
      sortField = type === "contestWinners" ? "weeklyPrize" : "weeklyTeamCount";
    }

    try {
      const snap = await getDocs(query(collection(db, COLLECTION), orderBy(sortField, "desc"), limit(limitN)));
      const out: LeaderboardEntry[] = [];
      snap.forEach((d) => {
        const data = d.data() as LeaderboardEntry;
        out.push({ userId: d.id, ...data });
      });
      return NextResponse.json({ status: "success", leaderboard: out, type, range }, { status: 200 });
    } catch (err: any) {
      // orderBy may fail if index missing — fall back to getDocs and sort in-memory
      const snap = await getDocs(collection(db, COLLECTION));
      const all: LeaderboardEntry[] = [];
      snap.forEach((d) => all.push({ userId: d.id, ...(d.data() as Omit<LeaderboardEntry, "userId">) }));
      all.sort((a, b) => (Number((b as any)[sortField]) || 0) - (Number((a as any)[sortField]) || 0));
      return NextResponse.json({ status: "success", leaderboard: all.slice(0, limitN), type, range }, { status: 200 });
    }
  } catch (err: any) {
    return NextResponse.json({ status: "fail", message: err?.message || "Server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "recordTeamGen") {
      const { userId, userName, count, matchId } = body as {
        userId: string;
        userName: string;
        count: number;
        matchId?: string;
      };
      if (!userId || !Number.isFinite(count)) {
        return NextResponse.json({ status: "fail", message: "userId + count required" }, { status: 200 });
      }
      await ensureEntry(userId, userName);
      if (db) {
        try {
          await setDoc(
            doc(db, COLLECTION, userId),
            {
              userName,
              teamCount: increment(Number(count)),
              weeklyTeamCount: increment(Number(count)),
              lastActive: Date.now(),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } catch (err) {
          console.log("[Leaderboard] team-gen update failed:", err);
        }
      }
      return NextResponse.json({ status: "success", message: "Team generation recorded" }, { status: 200 });
    }

    if (action === "recordWin") {
      const { userId, userName, prizeWon, contestId, platform } = body as {
        userId: string;
        userName: string;
        prizeWon: number;
        contestId?: string;
        platform?: string;
      };
      if (!userId || !Number.isFinite(prizeWon)) {
        return NextResponse.json({ status: "fail", message: "userId + prizeWon required" }, { status: 200 });
      }
      await ensureEntry(userId, userName);
      if (db) {
        try {
          await setDoc(
            doc(db, COLLECTION, userId),
            {
              userName,
              totalPrize: increment(Number(prizeWon)),
              weeklyPrize: increment(Number(prizeWon)),
              lastActive: Date.now(),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
          // Also record the contest win
          const contestLogId = `win_${userId}_${contestId || Date.now()}`;
          await setDoc(doc(db, "contest_wins", contestLogId), {
            userId,
            userName,
            contestId: contestId || null,
            platform: platform || null,
            prizeWon: Number(prizeWon),
            createdAt: Date.now(),
            createdAtTs: serverTimestamp(),
          });
        } catch (err) {
          console.log("[Leaderboard] win update failed:", err);
        }
      }
      return NextResponse.json({ status: "success", message: "Contest win recorded" }, { status: 200 });
    }

    // Periodic weekly reset trigger (admin)
    if (action === "resetWeekly") {
      if (db) {
        try {
          const snap = await getDocs(collection(db, COLLECTION));
          const updates = snap.docs.map((d) =>
            setDoc(doc(db, COLLECTION, d.id), { weeklyTeamCount: 0, weeklyPrize: 0 }, { merge: true })
          );
          await Promise.all(updates);
        } catch (err) {
          console.log("[Leaderboard] weekly reset failed:", err);
        }
      }
      return NextResponse.json({ status: "success", message: "Weekly stats reset" }, { status: 200 });
    }

    return NextResponse.json({ status: "fail", message: "Unknown action" }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ status: "fail", message: err?.message || "Server error" }, { status: 500 });
  }
}
