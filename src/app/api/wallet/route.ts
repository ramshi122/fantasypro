import { NextResponse } from "next/server";
import {
  wallets,
  transactions,
  getOrCreateWallet,
  recordTxn,
} from "@/lib/server-wallet-store";

/**
 * Wallet API — LOCAL ONLY (per FIREBASE-CLEANUP)
 * ===============================================
 * Wallets are stored in an in-memory server-side Map (per-instance, cleared
 * on cold start). Each client also mirrors its own wallet in localStorage.
 *
 * POST /api/wallet — Get or create wallet
 * POST /api/wallet?action=deposit — Add funds
 * POST /api/wallet?action=withdraw — Withdraw funds
 * POST /api/wallet?action=cashback — Team-gen cashback (₹0.50/team, max ₹10/day)
 */

const cashbackTrackers = new Map<string, { userId: string; date: string; amount: number }>();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, userId, mobile, amount, method } = body;

    if (!userId) {
      return NextResponse.json({ status: "fail", message: "User ID required" }, { status: 200 });
    }

    // ===== GET/CREATE WALLET =====
    if (!action || action === "get") {
      const w = getOrCreateWallet(userId, mobile || "");
      const totalBalance = w.depositBalance + w.bonusBalance + w.winningBalance;
      return NextResponse.json({
        status: "success",
        wallet: { ...w, totalBalance },
      }, { status: 200 });
    }

    // ===== DEPOSIT =====
    if (action === "deposit") {
      if (!amount || amount <= 0) {
        return NextResponse.json({ status: "fail", message: "Invalid amount" }, { status: 200 });
      }
      const w = getOrCreateWallet(userId, mobile || "");
      w.depositBalance += Number(amount);
      w.updatedAt = Date.now();
      const txnId = `TXN_DEP_${Date.now()}_${userId}`;
      recordTxn({
        id: txnId, userId, type: "deposit", amount: Number(amount),
        status: "completed", description: `Deposit via ${method || "UPI"}`,
        createdAt: Date.now(), completedAt: Date.now(),
      });
      return NextResponse.json({ status: "success", message: "Deposit successful", txnId }, { status: 200 });
    }

    // ===== WITHDRAW =====
    if (action === "withdraw") {
      if (!amount || amount <= 0) {
        return NextResponse.json({ status: "fail", message: "Invalid amount" }, { status: 200 });
      }
      const w = wallets.get(userId);
      if (!w) {
        return NextResponse.json({ status: "fail", message: "Wallet not found" }, { status: 200 });
      }
      if (w.winningBalance < Number(amount)) {
        return NextResponse.json({ status: "fail", message: "Insufficient winning balance for withdrawal" }, { status: 200 });
      }
      w.winningBalance -= Number(amount);
      w.updatedAt = Date.now();
      const txnId = `TXN_WD_${Date.now()}_${userId}`;
      recordTxn({
        id: txnId, userId, type: "withdraw", amount: Number(amount),
        status: "pending", description: `Withdrawal to ${method || "bank"}`,
        createdAt: Date.now(),
      });
      return NextResponse.json({ status: "success", message: "Withdrawal requested", txnId }, { status: 200 });
    }

    // ===== CASHBACK (Task G3.10) =====
    if (action === "cashback") {
      const { matchId, teamCount } = body as { matchId?: string; teamCount?: number };
      if (!Number.isFinite(teamCount) || teamCount! <= 0) {
        return NextResponse.json({ status: "fail", message: "Invalid teamCount" }, { status: 200 });
      }
      const perTeam = 0.5;
      const dailyCap = 10;
      const todayKey = new Date().toISOString().slice(0, 10);
      const dailyTrackerId = `cashback_${userId}_${todayKey}`;
      const tracker = cashbackTrackers.get(dailyTrackerId);
      const alreadyCreditedToday = tracker?.amount || 0;
      const remaining = Math.max(0, dailyCap - alreadyCreditedToday);
      const requested = Number(teamCount) * perTeam;
      const cashbackAmount = Math.min(requested, remaining);
      if (cashbackAmount <= 0) {
        return NextResponse.json({
          status: "success",
          message: "Daily cashback cap reached",
          cashback: 0, capped: true,
        }, { status: 200 });
      }
      const w = getOrCreateWallet(userId, mobile || "");
      w.bonusBalance += cashbackAmount;
      w.updatedAt = Date.now();
      cashbackTrackers.set(dailyTrackerId, {
        userId, date: todayKey, amount: alreadyCreditedToday + cashbackAmount,
      });
      const txnId = `TXN_CB_${Date.now()}_${userId}`;
      recordTxn({
        id: txnId, userId, type: "cashback", amount: cashbackAmount,
        status: "completed",
        description: `Cashback for ${teamCount} team(s) generated${matchId ? ` (match ${matchId})` : ""}`,
        matchId: matchId || null,
        createdAt: Date.now(), completedAt: Date.now(),
      });
      return NextResponse.json({
        status: "success",
        message: `₹${cashbackAmount} cashback credited`,
        cashback: cashbackAmount, txnId,
      }, { status: 200 });
    }

    return NextResponse.json({ status: "fail", message: "Invalid action" }, { status: 200 });
  } catch (error) {
    console.error("[Wallet API] Error:", error);
    return NextResponse.json({ status: "fail", message: "Server error" }, { status: 500 });
  }
}
