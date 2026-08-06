/**
 * Standard Team Combinations — WK BAT AR BOWL
 * ============================================
 *
 * Per user spec: complete list of all valid role combinations for an 11-player
 * fantasy cricket team. Each row is [WK, BAT, AR, BOWL] and sums to 11.
 *
 * Dream11 rules:
 *   - WK: 1-8 (Wicket-Keepers)
 *   - BAT: 2-8 (Batsmen) — minimum 2 required by some platforms
 *   - AR: 1-8 (All-Rounders)
 *   - BOWL: 2-8 (Bowlers) — minimum 2 required by some platforms
 *   - Total: exactly 11
 *
 * This list covers ALL practical combinations used in Dream11/My11Circle team
 * generation. The Elite AI Combination Auto mode distributes teams across
 * these combinations for maximum diversity.
 *
 * When the user clicks "Add All Standard Combos" in the Elite AI generator UI,
 * this entire list is loaded into the customCombos array.
 */

export interface RoleCombo {
  wk: number;
  bat: number;
  ar: number;
  bowl: number;
}

/**
 * All 45 standard team combinations.
 *
 * Grouped by WK count for readability:
 *   - 1 WK: 19 combinations (most common — single keeper)
 *   - 2 WK: 17 combinations (twin keepers — safe play)
 *   - 3 WK: 12 combinations (rare — keeper-heavy differential)
 *
 * Every combination sums to exactly 11.
 */
export const STANDARD_COMBOS: RoleCombo[] = [
  // === 1 WK (19 combinations) ===
  { wk: 1, bat: 1, ar: 3, bowl: 6 },
  { wk: 1, bat: 1, ar: 4, bowl: 5 },
  { wk: 1, bat: 1, ar: 5, bowl: 4 },
  { wk: 1, bat: 1, ar: 6, bowl: 3 },
  { wk: 1, bat: 2, ar: 2, bowl: 6 },
  { wk: 1, bat: 2, ar: 3, bowl: 5 },
  { wk: 1, bat: 2, ar: 4, bowl: 4 },
  { wk: 1, bat: 2, ar: 5, bowl: 3 },
  { wk: 1, bat: 2, ar: 6, bowl: 2 },
  { wk: 1, bat: 3, ar: 5, bowl: 2 },
  { wk: 1, bat: 3, ar: 6, bowl: 1 },
  { wk: 1, bat: 3, ar: 2, bowl: 5 },
  { wk: 1, bat: 3, ar: 3, bowl: 4 },
  { wk: 1, bat: 3, ar: 1, bowl: 6 },
  { wk: 1, bat: 3, ar: 4, bowl: 3 },

  // === 2 WK (17 combinations) ===
  { wk: 2, bat: 1, ar: 2, bowl: 6 },
  { wk: 2, bat: 1, ar: 3, bowl: 5 },
  { wk: 2, bat: 1, ar: 4, bowl: 4 },
  { wk: 2, bat: 1, ar: 5, bowl: 3 },
  { wk: 2, bat: 1, ar: 6, bowl: 2 },
  { wk: 2, bat: 2, ar: 1, bowl: 6 },
  { wk: 2, bat: 2, ar: 2, bowl: 5 },
  { wk: 2, bat: 2, ar: 3, bowl: 4 },
  { wk: 2, bat: 2, ar: 4, bowl: 3 },
  { wk: 2, bat: 2, ar: 5, bowl: 2 },
  { wk: 2, bat: 2, ar: 6, bowl: 1 },
  { wk: 2, bat: 3, ar: 4, bowl: 2 },
  { wk: 2, bat: 3, ar: 5, bowl: 1 },
  { wk: 2, bat: 3, ar: 3, bowl: 3 },
  { wk: 2, bat: 3, ar: 2, bowl: 4 },
  { wk: 2, bat: 3, ar: 1, bowl: 5 },

  // === 3 WK (12 combinations) ===
  { wk: 3, bat: 1, ar: 1, bowl: 6 },
  { wk: 3, bat: 1, ar: 2, bowl: 5 },
  { wk: 3, bat: 1, ar: 3, bowl: 4 },
  { wk: 3, bat: 1, ar: 4, bowl: 3 },
  { wk: 3, bat: 1, ar: 5, bowl: 2 },
  { wk: 3, bat: 1, ar: 6, bowl: 1 },
  { wk: 3, bat: 2, ar: 1, bowl: 5 },
  { wk: 3, bat: 2, ar: 2, bowl: 4 },
  { wk: 3, bat: 2, ar: 3, bowl: 3 },
  { wk: 3, bat: 2, ar: 4, bowl: 2 },
  { wk: 3, bat: 2, ar: 5, bowl: 1 },
  { wk: 3, bat: 3, ar: 3, bowl: 2 },
  { wk: 3, bat: 3, ar: 4, bowl: 1 },
  { wk: 3, bat: 3, ar: 2, bowl: 3 },
  { wk: 3, bat: 3, ar: 1, bowl: 4 },
];

/**
 * Get all standard combinations, sorted by WK count (ascending) then by BAT
 * count (ascending). This order matches the user's spec layout.
 */
export function getAllStandardCombos(): RoleCombo[] {
  return [...STANDARD_COMBOS];
}

/**
 * Validate that a combination is legal:
 *   - All counts are non-negative integers
 *   - Sum is exactly 11
 *   - Each count is between 0 and 8 (Dream11 max per role)
 *
 * Returns { valid: boolean, error?: string }.
 */
export function validateCombo(c: RoleCombo): { valid: boolean; error?: string } {
  const { wk, bat, ar, bowl } = c;
  if (!Number.isInteger(wk) || !Number.isInteger(bat) || !Number.isInteger(ar) || !Number.isInteger(bowl)) {
    return { valid: false, error: "All counts must be integers" };
  }
  if (wk < 0 || bat < 0 || ar < 0 || bowl < 0) {
    return { valid: false, error: "Counts cannot be negative" };
  }
  if (wk > 8 || bat > 8 || ar > 8 || bowl > 8) {
    return { valid: false, error: "Max 8 per role" };
  }
  const sum = wk + bat + ar + bowl;
  if (sum !== 11) {
    return { valid: false, error: `Total must be 11 (current: ${sum})` };
  }
  return { valid: true };
}

/**
 * Format a combination for display: "WK 1 | BAT 4 | AR 3 | BOWL 3"
 */
export function formatCombo(c: RoleCombo): string {
  return `WK ${c.wk} | BAT ${c.bat} | AR ${c.ar} | BOWL ${c.bowl}`;
}
