/**
 * Fantasy Contest System — Types & Firestore Schema
 * ================================================
 * Collections:
 *   - contests: { id, name, type, entryFee, prizePool, slots, joined, status, ... }
 *   - contest_participants: { contestId, userId, teamId, rank, points, ... }
 *   - wallets: { userId, balance, bonusBalance, winningBalance }
 *   - transactions: { userId, type, amount, status, ... }
 */

import type { KeyType } from "./admin-store";

// ===== Contest Types =====
export type ContestType = "mega" | "h2h" | "small" | "private";
export type ContestStatus = "upcoming" | "live" | "completed" | "cancelled";
export type PrizePoolType = "dynamic" | "guaranteed";

export interface Contest {
  id: string;
  name: string;
  type: ContestType;
  matchId: string;
  matchTitle: string;
  entryFee: number;
  prizePool: number;
  prizePoolType: PrizePoolType;
  maxSlots: number;
  joinedCount: number;
  status: ContestStatus;
  firstPrize: number;
  winnerCount: number;
  createdAt: number;
  startsAt: number | null;
  completedAt: number | null;
  createdBy: string; // admin ID
  prizeDistribution?: PrizeTier[];
}

export interface PrizeTier {
  rank: number;       // start rank
  rankEnd: number;    // end rank (for ranges)
  prize: number;
  percentage?: number; // for dynamic pools
}

export interface ContestParticipant {
  contestId: string;
  userId: string;
  userMobile: string;
  userName: string;
  teamId: string;
  teamPlayers: string[];
  captain: string;
  viceCaptain: string;
  rank: number;
  points: number;
  joinedAt: number;
  prizeWon?: number;
}

export interface Wallet {
  userId: string;
  mobile: string;
  depositBalance: number;
  bonusBalance: number;
  winningBalance: number;
  totalBalance: number; // computed
  createdAt: number;
  updatedAt: number;
}

export type TransactionType = "deposit" | "withdraw" | "contest_join" | "contest_win" | "refund" | "bonus";
export type TransactionStatus = "pending" | "completed" | "failed";

export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  status: TransactionStatus;
  description: string;
  contestId?: string;
  createdAt: number;
  completedAt?: number;
}

// ===== Fantasy Scoring =====
export interface PlayerScore {
  playerId: string;
  playerName: string;
  points: number;
  runs?: number;
  wickets?: number;
  catches?: number;
  boundaries?: number;
  sixes?: number;
  duck?: boolean;
}

export interface TeamScore {
  contestId: string;
  userId: string;
  teamId: string;
  totalPoints: number;
  captainMultiplier: number;
  viceCaptainMultiplier: number;
  playerScores: PlayerScore[];
  rank: number;
  updatedAt: number;
}

// ===== Scoring Rules =====
export const SCORING_RULES = {
  // Batting
  run: 1,
  boundary: 1,
  six: 2,
  halfCentury: 8,
  century: 16,
  duck: -2,
  strikeRateBonus: { threshold: 120, bonus: 4, minBalls: 10 },
  // Bowling
  wicket: 25,
  lbwBowled: 8, // bonus for LBW/Bowled
  maidenOver: 12,
  threeWickets: 4,
  fourWickets: 8,
  fiveWickets: 16,
  economyBonus: { threshold: 5, bonus: 4, minOvers: 2 },
  // Fielding
  catch: 8,
  stumping: 12,
  runOut: 6,
  // Multipliers
  captainMultiplier: 2,
  viceCaptainMultiplier: 1.5,
};

// ===== Helper Functions =====
export function calculateTeamScore(
  playerScores: PlayerScore[],
  captainId: string,
  viceCaptainId: string
): { totalPoints: number; captainMultiplier: number; viceCaptainMultiplier: number } {
  let total = 0;
  for (const ps of playerScores) {
    let points = ps.points;
    if (ps.playerId === captainId) {
      points *= SCORING_RULES.captainMultiplier;
    } else if (ps.playerId === viceCaptainId) {
      points *= SCORING_RULES.viceCaptainMultiplier;
    }
    total += points;
  }
  return {
    totalPoints: Math.round(total * 100) / 100,
    captainMultiplier: SCORING_RULES.captainMultiplier,
    viceCaptainMultiplier: SCORING_RULES.viceCaptainMultiplier,
  };
}

export function calculatePrize(rank: number, contest: Contest): number {
  if (!contest.prizeDistribution || contest.prizeDistribution.length === 0) {
    // Default: top 50% split
    if (rank === 1) return Math.round(contest.prizePool * 0.3);
    if (rank === 2) return Math.round(contest.prizePool * 0.2);
    if (rank === 3) return Math.round(contest.prizePool * 0.1);
    if (rank <= 10) return Math.round(contest.prizePool * 0.04);
    if (rank <= Math.floor(contest.maxSlots * 0.5)) return Math.round(contest.prizePool * 0.01);
    return 0;
  }
  for (const tier of contest.prizeDistribution) {
    if (rank >= tier.rank && rank <= tier.rankEnd) {
      if (tier.percentage) {
        return Math.round(contest.prizePool * (tier.percentage / 100));
      }
      return tier.prize;
    }
  }
  return 0;
}

export function getContestStatus(contest: Contest): ContestStatus {
  const now = Date.now();
  if (contest.status === "cancelled" || contest.status === "completed") return contest.status;
  if (contest.startsAt && contest.startsAt < now) return "live";
  if (contest.joinedCount >= contest.maxSlots) return "live"; // full = starts
  return "upcoming";
}

export function getRemainingSlots(contest: Contest): number {
  return Math.max(0, contest.maxSlots - contest.joinedCount);
}

export function getWinningZone(contest: Contest): number {
  if (!contest.prizeDistribution) return Math.floor(contest.maxSlots * 0.5);
  const lastWinningRank = contest.prizeDistribution[contest.prizeDistribution.length - 1]?.rankEnd || 0;
  return lastWinningRank;
}
