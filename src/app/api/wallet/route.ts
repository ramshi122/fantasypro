import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";

/**
 * Wallet API
 * POST /api/wallet — Get or create wallet
 * POST /api/wallet?action=deposit — Add funds
 * POST /api/wallet?action=withdraw — Withdraw funds
 */

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, userId, mobile, amount, method } = body;

    if (!userId) {
      return NextResponse.json({ status: "fail", message: "User ID required" }, { status: 200 });
    }

    // ===== GET/CREATE WALLET =====
    if (!action || action === "get") {
      if (!db) {
        return NextResponse.json({
          status: "success",
          wallet: { userId, depositBalance: 0, bonusBalance: 0, winningBalance: 0, totalBalance: 0 },
        }, { status: 200 });
      }

      const walletDoc = await getDoc(doc(db, "wallets", userId));
      if (!walletDoc.exists()) {
        // Create new wallet with ₹0 balance
        const newWallet = {
          userId,
          mobile: mobile || "",
          depositBalance: 0,
          bonusBalance: 0,
          winningBalance: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await setDoc(doc(db, "wallets", userId), { ...newWallet, createdAtTs: serverTimestamp() });
        return NextResponse.json({
          status: "success",
          wallet: { ...newWallet, totalBalance: 0 },
        }, { status: 200 });
      }

      const wallet = walletDoc.data();
      const totalBalance = (wallet.depositBalance || 0) + (wallet.bonusBalance || 0) + (wallet.winningBalance || 0);
      return NextResponse.json({
        status: "success",
        wallet: { ...wallet, totalBalance },
      }, { status: 200 });
    }

    // ===== DEPOSIT =====
    if (action === "deposit") {
      if (!amount || amount <= 0) {
        return NextResponse.json({ status: "fail", message: "Invalid amount" }, { status: 200 });
      }

      if (!db) {
        return NextResponse.json({ status: "fail", message: "Database not available" }, { status: 200 });
      }

      // Update wallet
      await updateDoc(doc(db, "wallets", userId), {
        depositBalance: (await getDoc(doc(db, "wallets", userId))).data()?.depositBalance + Number(amount),
        updatedAt: Date.now(),
      });

      // Create transaction
      const txnId = `TXN_DEP_${Date.now()}_${userId}`;
      await setDoc(doc(db, "transactions", txnId), {
        id: txnId,
        userId,
        type: "deposit",
        amount: Number(amount),
        status: "completed",
        description: `Deposit via ${method || "UPI"}`,
        createdAt: Date.now(),
        completedAt: Date.now(),
      });

      return NextResponse.json({ status: "success", message: "Deposit successful", txnId }, { status: 200 });
    }

    // ===== WITHDRAW =====
    if (action === "withdraw") {
      if (!amount || amount <= 0) {
        return NextResponse.json({ status: "fail", message: "Invalid amount" }, { status: 200 });
      }

      if (!db) {
        return NextResponse.json({ status: "fail", message: "Database not available" }, { status: 200 });
      }

      const walletDoc = await getDoc(doc(db, "wallets", userId));
      if (!walletDoc.exists()) {
        return NextResponse.json({ status: "fail", message: "Wallet not found" }, { status: 200 });
      }

      const wallet = walletDoc.data();
      const winBalance = wallet.winningBalance || 0;
      if (winBalance < Number(amount)) {
        return NextResponse.json({ status: "fail", message: "Insufficient winning balance for withdrawal" }, { status: 200 });
      }

      await updateDoc(doc(db, "wallets", userId), {
        winningBalance: winBalance - Number(amount),
        updatedAt: Date.now(),
      });

      const txnId = `TXN_WD_${Date.now()}_${userId}`;
      await setDoc(doc(db, "transactions", txnId), {
        id: txnId,
        userId,
        type: "withdraw",
        amount: Number(amount),
        status: "pending",
        description: `Withdrawal to ${method || "bank"}`,
        createdAt: Date.now(),
      });

      return NextResponse.json({ status: "success", message: "Withdrawal requested", txnId }, { status: 200 });
    }

    // ===== CASHBACK (Task G3.10) =====
    // On team generation: 2% cashback to wallet (₹0.50 per team, max ₹10/day)
    if (action === "cashback") {
      const { matchId, teamCount } = body as {
        matchId?: string;
        teamCount?: number;
      };
      if (!Number.isFinite(teamCount) || teamCount! <= 0) {
        return NextResponse.json({ status: "fail", message: "Invalid teamCount" }, { status: 200 });
      }

      // Cashback: ₹0.50 per team (2% of ₹25 implied), capped at ₹10/day
      const perTeam = 0.5;
      const dailyCap = 10;
      const todayKey = new Date().toISOString().slice(0, 10);
      const dailyTrackerId = `cashback_${userId}_${todayKey}`;

      let alreadyCreditedToday = 0;
      if (db) {
        try {
          const trackerSnap = await getDoc(doc(db, "cashback_trackers", dailyTrackerId));
          if (trackerSnap.exists()) {
            alreadyCreditedToday = Number(trackerSnap.data()?.amount || 0);
          }
        } catch {
          /* ignore */
        }
      }

      const remaining = Math.max(0, dailyCap - alreadyCreditedToday);
      const requested = Number(teamCount) * perTeam;
      const cashbackAmount = Math.min(requested, remaining);
      if (cashbackAmount <= 0) {
        return NextResponse.json({
          status: "success",
          message: "Daily cashback cap reached",
          cashback: 0,
          capped: true,
        }, { status: 200 });
      }

      // Credit wallet
      if (db) {
        try {
          const walletSnap = await getDoc(doc(db, "wallets", userId));
          const currentBonus = walletSnap.exists() ? Number(walletSnap.data()?.bonusBalance || 0) : 0;
          if (!walletSnap.exists()) {
            await setDoc(doc(db, "wallets", userId), {
              userId,
              depositBalance: 0,
              bonusBalance: cashbackAmount,
              winningBalance: 0,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              createdAtTs: serverTimestamp(),
            });
          } else {
            await updateDoc(doc(db, "wallets", userId), {
              bonusBalance: currentBonus + cashbackAmount,
              updatedAt: Date.now(),
            });
          }

          // Update daily tracker
          await setDoc(doc(db, "cashback_trackers", dailyTrackerId), {
            userId,
            date: todayKey,
            amount: alreadyCreditedToday + cashbackAmount,
            updatedAt: Date.now(),
          });

          // Record transaction
          const txnId = `TXN_CB_${Date.now()}_${userId}`;
          await setDoc(doc(db, "transactions", txnId), {
            id: txnId,
            userId,
            type: "cashback",
            amount: cashbackAmount,
            status: "completed",
            description: `Cashback for ${teamCount} team(s) generated${matchId ? ` (match ${matchId})` : ""}`,
            matchId: matchId || null,
            createdAt: Date.now(),
            completedAt: Date.now(),
          });

          return NextResponse.json({
            status: "success",
            message: `₹${cashbackAmount} cashback credited`,
            cashback: cashbackAmount,
            txnId,
          }, { status: 200 });
        } catch (err: any) {
          console.error("[Wallet API] Cashback failed:", err);
          return NextResponse.json({ status: "fail", message: err?.message || "Cashback failed" }, { status: 200 });
        }
      }

      // No DB — return simulated success
      return NextResponse.json({
        status: "success",
        message: `₹${cashbackAmount} cashback (simulated)`,
        cashback: cashbackAmount,
        txnId: `TXN_CB_SIM_${Date.now()}`,
      }, { status: 200 });
    }

    return NextResponse.json({ status: "fail", message: "Invalid action" }, { status: 200 });
  } catch (error) {
    console.error("[Wallet API] Error:", error);
    return NextResponse.json({ status: "fail", message: "Server error" }, { status: 500 });
  }
}
