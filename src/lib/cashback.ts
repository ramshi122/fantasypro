/**
 * Wallet Cashback Helper (client side)
 * Calls /api/wallet?action=cashback to credit 2% cashback (₹0.50/team, max ₹10/day).
 */

export interface CashbackResult {
  success: boolean;
  cashback: number;
  message: string;
  txnId?: string;
  capped?: boolean;
}

export async function processCashback(
  userId: string,
  matchId: string | undefined,
  teamCount: number
): Promise<CashbackResult> {
  if (!userId || teamCount <= 0) {
    return { success: false, cashback: 0, message: "Invalid input" };
  }
  try {
    const res = await fetch("/api/wallet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "cashback",
        userId,
        matchId,
        teamCount,
      }),
    });
    const data = await res.json();
    return {
      success: data.status === "success",
      cashback: Number(data.cashback || 0),
      message: data.message || "Cashback processed",
      txnId: data.txnId,
      capped: data.capped,
    };
  } catch (err: any) {
    console.error("[Cashback] failed:", err);
    return { success: false, cashback: 0, message: err?.message || "Network error" };
  }
}
