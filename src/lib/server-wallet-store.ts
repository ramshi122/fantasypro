/**
 * Server-side in-memory wallet store (per FIREBASE-CLEANUP)
 * ==========================================================
 * Shared between /api/wallet and /api/wallet/transactions routes.
 *
 * Per-instance — cleared on cold start. Each client also mirrors its own
 * wallet in localStorage.
 */

export interface Wallet {
  userId: string;
  mobile: string;
  depositBalance: number;
  bonusBalance: number;
  winningBalance: number;
  createdAt: number;
  updatedAt: number;
}

export interface Txn {
  id: string;
  userId: string;
  type: "deposit" | "withdraw" | "cashback" | "contest_join" | "contest_win";
  amount: number;
  status: "pending" | "completed";
  description: string;
  contestId?: string | null;
  matchId?: string | null;
  createdAt: number;
  completedAt?: number;
}

export const wallets = new Map<string, Wallet>();
export const transactions: Txn[] = [];

export function getOrCreateWallet(userId: string, mobile: string = ""): Wallet {
  let w = wallets.get(userId);
  if (!w) {
    w = {
      userId,
      mobile,
      depositBalance: 0,
      bonusBalance: 0,
      winningBalance: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    wallets.set(userId, w);
  }
  return w;
}

export function recordTxn(txn: Txn): void {
  transactions.unshift(txn);
  if (transactions.length > 500) transactions.length = 500;
}
