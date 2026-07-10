/**
 * Player Form Calculator
 * ======================
 * Calculates a 0-100 "form score" for each player based on:
 *   - points         (recent fantasy points)
 *   - selected_by    (selection %)
 *   - captain_percentage (% of users picking as captain)
 *   - vice_captain_percentage
 *   - credits        (form proxy — 9.0+ = peak form)
 *   - last_play      (played last match = +bonus)
 *
 * Trend is computed by comparing form now vs. a stored previous form snapshot.
 *
 * Public API:
 *   - calculateForm(player): { score: number; reasons: string[] }
 *   - getFormTrend(player): "up" | "down" | "stable"
 *   - rankByForm(players): FormRanked[]
 *   - saveFormSnapshot(players): void   (persists current form to localStorage)
 *   - getPreviousForm(playerId): number | null
 *
 * localStorage key: "apna-cricket-player-form-snapshot"
 */

import type { MatchPlayer } from "./api";

export type FormTrend = "up" | "down" | "stable";

export interface FormScore {
  score: number; // 0-100
  reasons: string[];
}

export interface FormRanked {
  player: MatchPlayer;
  playerId: string;
  score: number;
  trend: FormTrend;
  reasons: string[];
}

const SNAPSHOT_KEY = "apna-cricket-player-form-snapshot";

function num(v: unknown, def = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function playerId(p: MatchPlayer): string {
  return String(
    p?.player_fixed_id ?? p?.pl_id ?? p?.pid ?? p?.id ?? p?.name ?? ""
  );
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function readSnapshot(): Record<string, number> {
  if (!isBrowser()) return {};
  try {
    return JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeSnapshot(snapshot: Record<string, number>): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    /* ignore */
  }
}

/**
 * Calculate a 0-100 form score for a player.
 *
 * Weighting:
 *   - points: 40% (recent fantasy output)
 *   - captain_percentage: 25% (crowd captainy wisdom)
 *   - selected_by: 15% (overall selection)
 *   - credits: 15% (form proxy)
 *   - last_play bonus: +5 if played last match
 */
export function calculateForm(p: MatchPlayer): FormScore {
  const points = num(p.points, 0);
  const captPct = num(p.captain_percentage, 0);
  const vcPct = num(p.vice_captain_percentage, 0);
  const selBy = num(p.selected_by ?? p.sel, 0);
  const credits = num(p.credits, 8);
  const lastPlay = num(p.last_play, 1);

  // Normalize each input to 0-100
  const pointsNorm = Math.min(100, points / 10); // 1000+ pts = max
  const captNorm = Math.min(100, captPct);
  const vcNorm = Math.min(100, vcPct);
  const selNorm = Math.min(100, selBy);
  const credNorm = Math.min(100, (credits / 10) * 100); // 10 credits = 100
  const lastPlayBonus = lastPlay === 1 ? 5 : 0;

  // Combined captain signal: weighted toward C, then VC
  const captainSignal = captNorm * 0.7 + vcNorm * 0.3;

  const rawScore =
    pointsNorm * 0.4 +
    captainSignal * 0.25 +
    selNorm * 0.15 +
    credNorm * 0.15 +
    lastPlayBonus;

  const score = Math.max(0, Math.min(100, Math.round(rawScore)));

  // Build human-readable reasons
  const reasons: string[] = [];
  if (points > 0) reasons.push(`${points} pts recent`);
  if (captPct > 0) reasons.push(`${captPct.toFixed(1)}% captain pick`);
  if (vcPct > 0) reasons.push(`${vcPct.toFixed(1)}% VC pick`);
  if (selBy >= 50) reasons.push(`High selection ${selBy.toFixed(0)}%`);
  else if (selBy >= 20) reasons.push(`Decent selection ${selBy.toFixed(0)}%`);
  if (credits >= 9) reasons.push(`Premium credits ${credits}`);
  if (lastPlay === 0) reasons.push("Didn't play last match");
  if (reasons.length === 0) reasons.push("Balanced profile");

  return { score, reasons };
}

/**
 * Get the trend of a player's form vs. the previous snapshot.
 * Threshold: ±5 points = stable, otherwise up/down.
 */
export function getFormTrend(p: MatchPlayer): FormTrend {
  const id = playerId(p);
  if (!id) return "stable";
  const snapshot = readSnapshot();
  const prev = snapshot[id];
  if (prev == null) return "stable";
  const cur = calculateForm(p).score;
  const delta = cur - prev;
  if (delta > 5) return "up";
  if (delta < -5) return "down";
  return "stable";
}

/**
 * Rank players by form score (descending).
 */
export function rankByForm(players: MatchPlayer[]): FormRanked[] {
  return players
    .map((p) => {
      const { score, reasons } = calculateForm(p);
      return {
        player: p,
        playerId: playerId(p),
        score,
        trend: getFormTrend(p),
        reasons,
      };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Save the current form snapshot (so trends can be computed next time).
 */
export function saveFormSnapshot(players: MatchPlayer[]): void {
  const snapshot: Record<string, number> = {};
  for (const p of players) {
    const id = playerId(p);
    if (id) snapshot[id] = calculateForm(p).score;
  }
  writeSnapshot(snapshot);
}

/**
 * Get a player's previous form score (from snapshot).
 */
export function getPreviousForm(p: MatchPlayer | string): number | null {
  const id = typeof p === "string" ? p : playerId(p);
  if (!id) return null;
  const snapshot = readSnapshot();
  return snapshot[id] ?? null;
}

/**
 * Get all stored form snapshots (for charts / history).
 */
export function getAllFormSnapshots(): Record<string, number> {
  return readSnapshot();
}

/**
 * Clear the form snapshot.
 */
export function clearFormSnapshot(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(SNAPSHOT_KEY);
}
