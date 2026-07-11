import { NextResponse } from "next/server";
import type { Contest, ContestParticipant } from "@/lib/contest";

/**
 * Contest Create/Join API — LOCAL ONLY (per FIREBASE-CLEANUP)
 * ============================================================
 * Contests + participants + wallets + transactions all live in an
 * in-memory server-side Map (per-instance, cleared on cold start).
 *
 * POST /api/contest/create  — Admin creates contest (action: "create")
 * POST /api/contest/create  — User joins contest       (action: "join")
 * POST /api/contest/create  — Leaderboard              (action: "leaderboard")
 * POST /api/contest/create  — Update scores            (action: "update_scores")
 * POST /api/contest/create  — Declare winners          (action: "declare_winners")
 * GET  /api/contest/create  — List all contests
 */

const contests = new Map<string, Contest>();
const participants = new Map<string, ContestParticipant>(); // key: `${contestId}_${userId}`
const wallets = new Map<string, { depositBalance: number; bonusBalance: number; winningBalance: number }>();
const transactions: Array<{
  id: string; userId: string; type: string; amount: number; status: string;
  description: string; contestId?: string | null; createdAt: number; completedAt?: number;
}> = [];

function getWallet(userId: string) {
  let w = wallets.get(userId);
  if (!w) {
    w = { depositBalance: 0, bonusBalance: 0, winningBalance: 0 };
    wallets.set(userId, w);
  }
  return w;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    // ===== CREATE CONTEST (Admin) =====
    if (action === "create") {
      const { name, type, matchId, matchTitle, entryFee, prizePool, prizePoolType, maxSlots, firstPrize, winnerCount, startsAt, createdBy, prizeDistribution } = body;

      if (!name || !matchId || !entryFee || !maxSlots) {
        return NextResponse.json({ status: "fail", message: "Missing required fields" }, { status: 200 });
      }

      const contestId = `CTST_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const contest: Contest = {
        id: contestId,
        name,
        type: type || "mega",
        matchId,
        matchTitle: matchTitle || "",
        entryFee: Number(entryFee),
        prizePool: Number(prizePool || entryFee * maxSlots),
        prizePoolType: prizePoolType || "dynamic",
        maxSlots: Number(maxSlots),
        joinedCount: 0,
        status: "upcoming",
        firstPrize: Number(firstPrize || 0),
        winnerCount: Number(winnerCount || 1),
        createdAt: Date.now(),
        startsAt: startsAt ? Number(startsAt) : null,
        completedAt: null,
        createdBy: createdBy || "admin",
        prizeDistribution: prizeDistribution || [],
      };
      contests.set(contestId, contest);

      return NextResponse.json({ status: "success", contestId, contest }, { status: 200 });
    }

    // ===== JOIN CONTEST (User) =====
    if (action === "join") {
      const { contestId, userId, userMobile, userName, teamId, teamPlayers, captain, viceCaptain, walletBalance } = body;

      if (!contestId || !userId || !teamId) {
        return NextResponse.json({ status: "fail", message: "Missing required fields" }, { status: 200 });
      }

      const contest = contests.get(contestId);
      if (!contest) {
        return NextResponse.json({ status: "fail", message: "Contest not found" }, { status: 200 });
      }

      if (contest.status === "completed" || contest.status === "cancelled") {
        return NextResponse.json({ status: "fail", message: "Contest is " + contest.status }, { status: 200 });
      }

      if (contest.joinedCount >= contest.maxSlots) {
        return NextResponse.json({ status: "fail", message: "Contest is full" }, { status: 200 });
      }

      // Use server-side wallet if available, else fall back to client-provided walletBalance
      const w = getWallet(userId);
      const balance = w.depositBalance + w.bonusBalance + w.winningBalance;
      const effectiveBalance = balance > 0 ? balance : Number(walletBalance || 0);
      if (effectiveBalance < contest.entryFee) {
        return NextResponse.json({ status: "fail", message: "Insufficient wallet balance", code: "INSUFFICIENT_BALANCE" }, { status: 200 });
      }

      const participantId = `${contestId}_${userId}`;
      if (participants.has(participantId)) {
        return NextResponse.json({ status: "fail", message: "Already joined this contest", code: "DUPLICATE_ENTRY" }, { status: 200 });
      }

      const participant: ContestParticipant = {
        contestId,
        userId,
        userMobile: userMobile || "",
        userName: userName || "Player",
        teamId,
        teamPlayers: teamPlayers || [],
        captain,
        viceCaptain,
        rank: 0,
        points: 0,
        joinedAt: Date.now(),
      };
      participants.set(participantId, participant);

      contest.joinedCount += 1;

      // Deduct from wallet + create transaction
      if (w.depositBalance >= contest.entryFee) {
        w.depositBalance -= contest.entryFee;
      } else {
        // Best-effort — clear deposit then take from bonus
        let remaining = contest.entryFee;
        remaining -= w.depositBalance; w.depositBalance = 0;
        if (remaining > 0) { const fromBonus = Math.min(w.bonusBalance, remaining); w.bonusBalance -= fromBonus; remaining -= fromBonus; }
        if (remaining > 0) { w.winningBalance = Math.max(0, w.winningBalance - remaining); }
      }
      const txnId = `TXN_${Date.now()}_${userId}`;
      transactions.unshift({
        id: txnId, userId, type: "contest_join", amount: contest.entryFee,
        status: "completed", description: `Joined ${contest.name}`,
        contestId, createdAt: Date.now(), completedAt: Date.now(),
      });

      return NextResponse.json({
        status: "success",
        message: "Contest joined successfully",
        contestId,
        rank: contest.joinedCount,
      }, { status: 200 });
    }

    // ===== GET LEADERBOARD =====
    if (action === "leaderboard") {
      const { contestId } = body;
      if (!contestId) {
        return NextResponse.json({ status: "fail", message: "Contest ID required" }, { status: 200 });
      }
      const parts = Array.from(participants.values()).filter((p) => p.contestId === contestId);
      parts.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return a.joinedAt - b.joinedAt;
      });
      parts.forEach((p, i) => { p.rank = i + 1; });
      return NextResponse.json({
        status: "success",
        participants: parts,
        totalCount: parts.length,
      }, { status: 200 });
    }

    // ===== UPDATE SCORES =====
    if (action === "update_scores") {
      const { contestId, scores } = body;
      if (!contestId || !scores) {
        return NextResponse.json({ status: "fail", message: "Missing data" }, { status: 200 });
      }
      const all = Array.from(participants.values()).filter((p) => p.contestId === contestId);
      for (const p of all) {
        let totalPoints = 0;
        for (const ps of scores) {
          if (p.teamPlayers.includes(ps.playerId)) {
            let pts = ps.points;
            if (ps.playerId === p.captain) pts *= 2;
            else if (ps.playerId === p.viceCaptain) pts *= 1.5;
            totalPoints += pts;
          }
        }
        p.points = Math.round(totalPoints * 100) / 100;
      }
      all.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return a.joinedAt - b.joinedAt;
      });
      all.forEach((p, i) => { p.rank = i + 1; });
      return NextResponse.json({
        status: "success",
        message: `Updated ${all.length} participants`,
        leaderboard: all.map((p) => ({
          rank: p.rank, userId: p.userId, userName: p.userName, points: p.points,
        })),
      }, { status: 200 });
    }

    // ===== DECLARE WINNERS =====
    if (action === "declare_winners") {
      const { contestId } = body;
      if (!contestId) {
        return NextResponse.json({ status: "fail", message: "Contest ID required" }, { status: 200 });
      }
      const contest = contests.get(contestId);
      if (!contest) {
        return NextResponse.json({ status: "fail", message: "Contest not found" }, { status: 200 });
      }
      const parts = Array.from(participants.values())
        .filter((p) => p.contestId === contestId)
        .sort((a, b) => a.rank - b.rank);
      const { calculatePrize } = await import("@/lib/contest");
      let winnerCount = 0;
      for (const p of parts) {
        const prize = calculatePrize(p.rank, contest);
        if (prize > 0) {
          const w = getWallet(p.userId);
          w.winningBalance += prize;
          transactions.unshift({
            id: `WIN_${Date.now()}_${p.userId}`, userId: p.userId,
            type: "contest_win", amount: prize, status: "completed",
            description: `Won Rank #${p.rank} in ${contest.name}`,
            contestId, createdAt: Date.now(), completedAt: Date.now(),
          });
          (p as any).prizeWon = prize;
          winnerCount++;
        }
      }
      contest.status = "completed";
      contest.completedAt = Date.now();
      return NextResponse.json({
        status: "success",
        message: `Winners declared. ${winnerCount} winners credited.`,
      }, { status: 200 });
    }

    return NextResponse.json({ status: "fail", message: "Invalid action" }, { status: 200 });
  } catch (error) {
    console.error("[Contest API] Error:", error);
    return NextResponse.json({ status: "fail", message: "Server error" }, { status: 500 });
  }
}

// GET — list all contests
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const statusFilter = url.searchParams.get("status");
    const typeFilter = url.searchParams.get("type");

    let contestsArr = Array.from(contests.values());
    if (statusFilter) contestsArr = contestsArr.filter((c) => c.status === statusFilter);
    if (typeFilter) contestsArr = contestsArr.filter((c) => c.type === typeFilter);
    contestsArr.sort((a, b) => b.createdAt - a.createdAt);

    return NextResponse.json({ status: "success", contests: contestsArr }, { status: 200 });
  } catch (error) {
    console.error("[Contest API] GET error:", error);
    return NextResponse.json({ status: "fail", contests: [] }, { status: 200 });
  }
}
