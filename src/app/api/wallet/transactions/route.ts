import { NextResponse } from "next/server";
import { transactions } from "@/lib/server-wallet-store";

/**
 * Wallet Transactions API — LOCAL ONLY (per FIREBASE-CLEANUP)
 * =============================================================
 * Returns transactions from the in-memory server-side store
 * (per-instance, cleared on cold start).
 *
 * GET /api/wallet/transactions?userId=XXX
 */

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ status: "fail", transactions: [] }, { status: 200 });
    }

    const userTxns = transactions.filter((t) => t.userId === userId);
    return NextResponse.json({ status: "success", transactions: userTxns }, { status: 200 });
  } catch (error) {
    console.error("[Transactions API] Error:", error);
    return NextResponse.json({ status: "fail", transactions: [] }, { status: 200 });
  }
}
