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

    return NextResponse.json({ status: "fail", message: "Invalid action" }, { status: 200 });
  } catch (error) {
    console.error("[Wallet API] Error:", error);
    return NextResponse.json({ status: "fail", message: "Server error" }, { status: 500 });
  }
}
