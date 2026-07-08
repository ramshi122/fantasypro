import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, setDoc, collection, getDocs, query, where, updateDoc, increment, serverTimestamp } from "firebase/firestore";
import type { Contest, ContestParticipant } from "@/lib/contest";

/**
 * Contest Join API
 * POST /api/contest/create  — Admin creates contest
 * POST /api/contest/create?action=join — User joins contest
 * POST /api/contest/create?action=leaderboard — Get live leaderboard
 */

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

      if (db) {
        await setDoc(doc(db, "contests", contestId), { ...contest, createdAtTs: serverTimestamp() });
      }

      return NextResponse.json({ status: "success", contestId, contest }, { status: 200 });
    }

    // ===== JOIN CONTEST (User) =====
    if (action === "join") {
      const { contestId, userId, userMobile, userName, teamId, teamPlayers, captain, viceCaptain, walletBalance } = body;

      if (!contestId || !userId || !teamId) {
        return NextResponse.json({ status: "fail", message: "Missing required fields" }, { status: 200 });
      }

      if (!db) {
        return NextResponse.json({ status: "fail", message: "Database not available" }, { status: 200 });
      }

      // 1. Fetch contest
      const contestDoc = await getDocs(query(collection(db, "contests"), where("id", "==", contestId)));
      if (contestDoc.empty) {
        return NextResponse.json({ status: "fail", message: "Contest not found" }, { status: 200 });
      }
      const contest = contestDoc.docs[0].data() as Contest;

      // 2. Check status
      if (contest.status === "completed" || contest.status === "cancelled") {
        return NextResponse.json({ status: "fail", message: "Contest is " + contest.status }, { status: 200 });
      }

      // 3. Check slots
      if (contest.joinedCount >= contest.maxSlots) {
        return NextResponse.json({ status: "fail", message: "Contest is full" }, { status: 200 });
      }

      // 4. Check wallet balance (server-side)
      if (walletBalance < contest.entryFee) {
        return NextResponse.json({ status: "fail", message: "Insufficient wallet balance", code: "INSUFFICIENT_BALANCE" }, { status: 200 });
      }

      // 5. Check duplicate entry (same user, same contest)
      const existing = await getDocs(query(
        collection(db, "contest_participants"),
        where("contestId", "==", contestId),
        where("userId", "==", userId)
      ));
      if (!existing.empty) {
        return NextResponse.json({ status: "fail", message: "Already joined this contest", code: "DUPLICATE_ENTRY" }, { status: 200 });
      }

      // 6. Add participant
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

      const participantId = `${contestId}_${userId}`;
      await setDoc(doc(db, "contest_participants", participantId), participant);

      // 7. Increment contest joined count
      await updateDoc(doc(db, "contests", contestId), {
        joinedCount: increment(1),
      });

      // 8. Deduct from wallet + create transaction
      await updateDoc(doc(db, "wallets", userId), {
        depositBalance: increment(-contest.entryFee),
        updatedAt: Date.now(),
      });

      await setDoc(doc(db, "transactions", `TXN_${Date.now()}_${userId}`), {
        id: `TXN_${Date.now()}_${userId}`,
        userId,
        type: "contest_join",
        amount: contest.entryFee,
        status: "completed",
        description: `Joined ${contest.name}`,
        contestId,
        createdAt: Date.now(),
        completedAt: Date.now(),
      });

      return NextResponse.json({
        status: "success",
        message: "Contest joined successfully",
        contestId,
        rank: contest.joinedCount + 1,
      }, { status: 200 });
    }

    // ===== GET LEADERBOARD =====
    if (action === "leaderboard") {
      const { contestId } = body;
      if (!contestId || !db) {
        return NextResponse.json({ status: "fail", message: "Contest ID required" }, { status: 200 });
      }

      const participantsSnap = await getDocs(query(
        collection(db, "contest_participants"),
        where("contestId", "==", contestId)
      ));

      const participants: ContestParticipant[] = [];
      participantsSnap.forEach((doc) => {
        participants.push(doc.data() as ContestParticipant);
      });

      // Server-side sorting by points (descending), tie-break by joinedAt (ascending)
      participants.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return a.joinedAt - b.joinedAt;
      });

      // Assign ranks
      participants.forEach((p, i) => {
        p.rank = i + 1;
      });

      return NextResponse.json({
        status: "success",
        participants,
        totalCount: participants.length,
      }, { status: 200 });
    }

    // ===== UPDATE SCORES (Server-side only) =====
    if (action === "update_scores") {
      const { contestId, scores } = body;
      if (!contestId || !scores || !db) {
        return NextResponse.json({ status: "fail", message: "Missing data" }, { status: 200 });
      }

      // Fetch all participants
      const participantsSnap = await getDocs(query(
        collection(db, "contest_participants"),
        where("contestId", "==", contestId)
      ));

      const updates: Promise<void>[] = [];
      const allParticipants: Array<{ id: string; data: ContestParticipant; points: number }> = [];

      participantsSnap.forEach((docSnap) => {
        const p = docSnap.data() as ContestParticipant;
        // Calculate team score from player scores
        let totalPoints = 0;
        for (const playerScore of scores) {
          if (p.teamPlayers.includes(playerScore.playerId)) {
            let pts = playerScore.points;
            if (playerScore.playerId === p.captain) pts *= 2;
            else if (playerScore.playerId === p.viceCaptain) pts *= 1.5;
            totalPoints += pts;
          }
        }
        totalPoints = Math.round(totalPoints * 100) / 100;
        allParticipants.push({ id: docSnap.id, data: p, points: totalPoints });
      });

      // Sort by points (server-side ranking)
      allParticipants.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return a.data.joinedAt - b.data.joinedAt;
      });

      // Update ranks + points in Firestore
      for (let i = 0; i < allParticipants.length; i++) {
        const { id, points } = allParticipants[i];
        const rank = i + 1;
        updates.push(
          updateDoc(doc(db, "contest_participants", id), { points, rank, updatedAt: Date.now() })
        );
      }

      await Promise.all(updates);

      return NextResponse.json({
        status: "success",
        message: `Updated ${allParticipants.length} participants`,
        leaderboard: allParticipants.map((p, i) => ({
          rank: i + 1,
          userId: p.data.userId,
          userName: p.data.userName,
          points: p.points,
        })),
      }, { status: 200 });
    }

    // ===== DECLARE WINNERS =====
    if (action === "declare_winners") {
      const { contestId } = body;
      if (!contestId || !db) {
        return NextResponse.json({ status: "fail", message: "Contest ID required" }, { status: 200 });
      }

      // Fetch contest
      const contestDoc = await getDocs(query(collection(db, "contests"), where("id", "==", contestId)));
      if (contestDoc.empty) {
        return NextResponse.json({ status: "fail", message: "Contest not found" }, { status: 200 });
      }
      const contest = contestDoc.docs[0].data() as Contest;

      // Fetch participants (sorted by rank)
      const participantsSnap = await getDocs(query(
        collection(db, "contest_participants"),
        where("contestId", "==", contestId)
      ));

      const participants: ContestParticipant[] = [];
      participantsSnap.forEach((doc) => participants.push(doc.data() as ContestParticipant));
      participants.sort((a, b) => a.rank - b.rank);

      // Calculate prizes + credit wallets
      const { calculatePrize } = await import("@/lib/contest");
      const prizeUpdates: Promise<void>[] = [];

      for (const p of participants) {
        const prize = calculatePrize(p.rank, contest);
        if (prize > 0) {
          // Credit winning to wallet
          prizeUpdates.push(
            updateDoc(doc(db, "wallets", p.userId), {
              winningBalance: increment(prize),
              updatedAt: Date.now(),
            })
          );
          // Create transaction
          prizeUpdates.push(
            setDoc(doc(db, "transactions", `WIN_${Date.now()}_${p.userId}`), {
              id: `WIN_${Date.now()}_${p.userId}`,
              userId: p.userId,
              type: "contest_win",
              amount: prize,
              status: "completed",
              description: `Won Rank #${p.rank} in ${contest.name}`,
              contestId,
              createdAt: Date.now(),
              completedAt: Date.now(),
            })
          );
          // Update participant with prize
          prizeUpdates.push(
            updateDoc(doc(db, "contest_participants", `${contestId}_${p.userId}`), {
              prizeWon: prize,
            })
          );
        }
      }

      // Mark contest as completed
      prizeUpdates.push(
        updateDoc(doc(db, "contests", contestId), {
          status: "completed",
          completedAt: Date.now(),
        })
      );

      await Promise.all(prizeUpdates);

      return NextResponse.json({
        status: "success",
        message: `Winners declared. ${participants.filter(p => calculatePrize(p.rank, contest) > 0).length} winners credited.`,
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

    if (!db) {
      return NextResponse.json({ status: "fail", contests: [] }, { status: 200 });
    }

    let q = collection(db, "contests");
    const snap = await getDocs(q);

    let contests: Contest[] = [];
    snap.forEach((doc) => {
      const data = doc.data() as Contest;
      if (statusFilter && data.status !== statusFilter) return;
      if (typeFilter && data.type !== typeFilter) return;
      contests.push(data);
    });

    // Sort by createdAt descending
    contests.sort((a, b) => b.createdAt - a.createdAt);

    return NextResponse.json({ status: "success", contests }, { status: 200 });
  } catch (error) {
    console.error("[Contest API] GET error:", error);
    return NextResponse.json({ status: "fail", contests: [] }, { status: 200 });
  }
}
