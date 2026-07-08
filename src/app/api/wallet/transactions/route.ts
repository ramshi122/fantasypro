import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";

/**
 * Wallet Transactions API
 * GET /api/wallet/transactions?userId=XXX
 * Returns all transactions for a user
 */

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ status: "fail", transactions: [] }, { status: 200 });
    }

    if (!db) {
      return NextResponse.json({ status: "fail", transactions: [] }, { status: 200 });
    }

    const q = query(
      collection(db, "transactions"),
      where("userId", "==", userId),
      orderBy("createdAt", "desc")
    );

    const snap = await getDocs(q);
    const transactions: any[] = [];
    snap.forEach((doc) => {
      transactions.push(doc.data());
    });

    return NextResponse.json({ status: "success", transactions }, { status: 200 });
  } catch (error) {
    console.error("[Transactions API] Error:", error);
    return NextResponse.json({ status: "fail", transactions: [] }, { status: 200 });
  }
}
