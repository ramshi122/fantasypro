/**
 * Smart Captain Rotation
 * ======================
 * Ensures different Captain / Vice-Captain assignments across a set of teams
 * to maximize coverage of high-value players in C/VC slots.
 *
 * Algorithm (max-coverage):
 *   1. Score every player for captaincy (using the existing
 *      `scorePlayerForCaptain()` from captain-recommender.ts).
 *   2. Sort players by captain score descending — call this the candidate list.
 *   3. Walk the candidate list, assigning the next-best C+VC pair to each team
 *      in turn, never reusing the same C twice until we've exhausted the list.
 *   4. Each team gets a unique (C, VC) pair where possible.
 *
 * Public API:
 *   - rotateCaptains(teams, players): TeamRow[]
 *   - getCaptainCoverage(teams): CaptainCoverage
 *
 * Additive — does NOT modify `captain-recommender.ts` or any existing team.
 */

import type { MatchPlayer, TeamRow } from "./api";
import { scorePlayerForCaptain } from "./captain-recommender";

export interface CaptainCoverage {
  uniqueCaptains: number;
  uniqueViceCaptains: number;
  uniquePairs: number;
  captainCounts: Record<string, number>;
  viceCaptainCounts: Record<string, number>;
  pairCounts: Record<string, number>;
  totalTeams: number;
  coveragePercent: number; // uniquePairs / totalTeams * 100
}

function playerId(p: MatchPlayer | any): string {
  return String(
    p?.player_fixed_id ?? p?.pl_id ?? p?.pid ?? p?.id ?? p?._id ?? p?.name ?? ""
  );
}

function playerName(p: MatchPlayer | any): string {
  return String(p?.name || p?.shortName || playerId(p) || "?");
}

/**
 * Ensure different C/VC across teams using a max-coverage rotation.
 *
 * - If a team's players don't include the chosen C/VC, falls back to that
 *   team's existing captain (preserving validity).
 * - Returns NEW team objects; the input teams are NOT mutated.
 */
export function rotateCaptains(teams: TeamRow[], players: MatchPlayer[]): TeamRow[] {
  if (!teams || teams.length === 0) return teams;
  if (!players || players.length === 0) return teams;

  // 1) Score + sort candidates
  const scored = players
    .map((p) => ({
      player: p,
      id: playerId(p),
      score: scorePlayerForCaptain(p).score,
    }))
    .filter((s) => !!s.id)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return teams;

  // 2) Build a per-team map of available player IDs (so we only assign
  //    captains who are actually IN each team)
  const teamPlayerIdSets = teams.map((t) => {
    const set = new Set<string>();
    for (const p of (t.players || []) as unknown as MatchPlayer[]) {
      const id = playerId(p);
      if (id) set.add(id);
    }
    return set;
  });

  // 3) Walk teams, assigning each a unique C + VC from the candidate list
  //    using round-robin on the sorted candidates.
  //
  //    We maintain a pointer `cIdx` for the captain slot and `vcIdx` for the
  //    vice-captain slot. For each team, we advance `cIdx` until we find a
  //    candidate that's in the team, then advance `vcIdx` until we find a
  //    different candidate that's also in the team.
  //
  //    If we wrap around (more teams than candidates), we accept reuse but
  //    still try to maximize uniqueness.
  let cIdx = 0;
  let vcIdx = 1 % scored.length;

  const result: TeamRow[] = teams.map((team, teamIdx) => {
    const teamIds = teamPlayerIdSets[teamIdx];
    if (teamIds.size === 0) return team;

    // Find next C in this team
    let attempts = 0;
    while (attempts < scored.length && !teamIds.has(scored[cIdx].id)) {
      cIdx = (cIdx + 1) % scored.length;
      attempts++;
    }
    const captain = scored[cIdx];

    // Find next VC in this team, different from C
    if (vcIdx === cIdx) vcIdx = (vcIdx + 1) % scored.length;
    attempts = 0;
    while (attempts < scored.length && (vcIdx === cIdx || !teamIds.has(scored[vcIdx].id))) {
      vcIdx = (vcIdx + 1) % scored.length;
      attempts++;
    }
    const viceCaptain = scored[vcIdx];

    // Advance pointers for the next team (so the next team gets a fresh pair)
    cIdx = (cIdx + 1) % scored.length;
    vcIdx = (vcIdx + 2) % scored.length;

    // Fallback: if neither candidate is in the team, keep the existing C/VC
    if (!captain || !viceCaptain || captain.id === viceCaptain.id) {
      return team;
    }

    return {
      ...team,
      captain: captain.id,
      c: captain.id,
      viceCaptain: viceCaptain.id,
      vc: viceCaptain.id,
      vicecaptain: viceCaptain.id,
    } as TeamRow;
  });

  return result;
}

/**
 * Compute C/VC coverage stats for a set of teams.
 *
 * High coverage = many unique pairs = good for GL/hedging.
 */
export function getCaptainCoverage(teams: TeamRow[]): CaptainCoverage {
  const captainCounts: Record<string, number> = {};
  const viceCaptainCounts: Record<string, number> = {};
  const pairCounts: Record<string, number> = {};

  for (const t of teams) {
    const cId = String(t.captain ?? t.c ?? "");
    const vcId = String(t.viceCaptain ?? t.vc ?? t.vicecaptain ?? "");
    if (cId) captainCounts[cId] = (captainCounts[cId] || 0) + 1;
    if (vcId) viceCaptainCounts[vcId] = (viceCaptainCounts[vcId] || 0) + 1;
    if (cId && vcId) {
      const pair = `${cId}|${vcId}`;
      pairCounts[pair] = (pairCounts[pair] || 0) + 1;
    }
  }

  const uniqueCaptains = Object.keys(captainCounts).length;
  const uniqueViceCaptains = Object.keys(viceCaptainCounts).length;
  const uniquePairs = Object.keys(pairCounts).length;
  const totalTeams = teams.length;
  const coveragePercent =
    totalTeams > 0 ? (uniquePairs / totalTeams) * 100 : 0;

  return {
    uniqueCaptains,
    uniqueViceCaptains,
    uniquePairs,
    captainCounts,
    viceCaptainCounts,
    pairCounts,
    totalTeams,
    coveragePercent,
  };
}

/**
 * Helper: format a coverage report as a human-readable string.
 */
export function formatCoverageReport(coverage: CaptainCoverage): string {
  return [
    `Teams: ${coverage.totalTeams}`,
    `Unique Captains: ${coverage.uniqueCaptains}`,
    `Unique Vice-Captains: ${coverage.uniqueViceCaptains}`,
    `Unique (C,VC) Pairs: ${coverage.uniquePairs}`,
    `Coverage: ${coverage.coveragePercent.toFixed(1)}%`,
  ].join(" · ");
}

/**
 * Helper: get the most-used captain (for de-duplication reporting).
 */
export function getTopCaptains(
  coverage: CaptainCoverage,
  limit = 5
): Array<{ captainId: string; count: number }> {
  return Object.entries(coverage.captainCounts)
    .map(([captainId, count]) => ({ captainId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
