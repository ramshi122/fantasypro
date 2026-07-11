import { NextResponse } from "next/server";

/**
 * Leaderboard API — LOCAL ONLY (per FIREBASE-CLEANUP)
 * =====================================================
 * Server-side leaderboard uses an in-memory store (per-instance, cleared on
 * cold start). Each client also mirrors its own stats in localStorage.
 *
 * GET  /api/leaderboard?type=teamGenerators&range=weekly  → top team generators
 * GET  /api/leaderboard?type=contestWinners&range=all      → top contest winners
 * POST /api/leaderboard?action=recordTeamGen   {userId, userName, count, matchId}
 * POST /api/leaderboard?action=recordWin       {userId, userName, prizeWon, ...}
 * POST /api/leaderboard?action=resetWeekly                       (admin reset)
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

const store = new Map<string, LeaderboardEntry>();

function ensureEntry(userId: string, userName: string): LeaderboardEntry {
  let e = store.get(userId);
  if (!e) {
    e = {
      userId,
      userName,
      teamCount: 0,
      totalPrize: 0,
      weeklyTeamCount: 0,
      weeklyPrize: 0,
      lastActive: Date.now(),
    };
    store.set(userId, e);
  }
  return e;
}

function isThisWeek(ts: number): boolean {
  if (!ts) return false;
  return ts >= Date.now() - 7 * 86400000;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const type = (url.searchParams.get("type") || "teamGenerators") as "teamGenerators" | "contestWinners";
    const range = (url.searchParams.get("range") || "all") as "weekly" | "all";
    const limitN = Math.min(100, Number(url.searchParams.get("limit") || 50));

    let sortField: keyof LeaderboardEntry = "teamCount";
    if (type === "contestWinners") sortField = "totalPrize";
    if (range === "weekly") {
      sortField = type === "contestWinners" ? "weeklyPrize" : "weeklyTeamCount";
    }

    // Optional weekly filter — exclude entries whose lastActive is older than 7 days
    const all = Array.from(store.values()).filter((e) =>
      range === "weekly" ? isThisWeek(e.lastActive) : true
    );
    all.sort((a, b) => (Number((b as any)[sortField]) || 0) - (Number((a as any)[sortField]) || 0));

    return NextResponse.json({
      status: "success",
      leaderboard: all.slice(0, limitN),
      type,
      range,
    }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ status: "fail", message: err?.message || "Server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "recordTeamGen") {
      const { userId, userName, count } = body as {
        userId: string;
        userName: string;
        count: number;
      };
      if (!userId || !Number.isFinite(count)) {
        return NextResponse.json({ status: "fail", message: "userId + count required" }, { status: 200 });
      }
      const e = ensureEntry(userId, userName || "User");
      e.userName = userName || e.userName;
      e.teamCount += Number(count);
      e.weeklyTeamCount += Number(count);
      e.lastActive = Date.now();
      return NextResponse.json({ status: "success", message: "Team generation recorded" }, { status: 200 });
    }

    if (action === "recordWin") {
      const { userId, userName, prizeWon } = body as {
        userId: string;
        userName: string;
        prizeWon: number;
      };
      if (!userId || !Number.isFinite(prizeWon)) {
        return NextResponse.json({ status: "fail", message: "userId + prizeWon required" }, { status: 200 });
      }
      const e = ensureEntry(userId, userName || "User");
      e.userName = userName || e.userName;
      e.totalPrize += Number(prizeWon);
      e.weeklyPrize += Number(prizeWon);
      e.lastActive = Date.now();
      return NextResponse.json({ status: "success", message: "Contest win recorded" }, { status: 200 });
    }

    if (action === "resetWeekly") {
      for (const e of store.values()) {
        e.weeklyTeamCount = 0;
        e.weeklyPrize = 0;
      }
      return NextResponse.json({ status: "success", message: "Weekly stats reset" }, { status: 200 });
    }

    return NextResponse.json({ status: "fail", message: "Unknown action" }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ status: "fail", message: err?.message || "Server error" }, { status: 500 });
  }
}
