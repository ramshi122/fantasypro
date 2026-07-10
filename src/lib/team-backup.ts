/**
 * Team Backup / Restore
 * =====================
 * Export saved teams (per match or all) as a downloadable JSON file, and
 * import teams from a previously-exported JSON file back into the local
 * team store.
 *
 * This is ADDITIVE — it does NOT modify the existing local-team store or any
 * transfer logic. It only reads from / writes to the existing
 * "apna-cricket-local-teams" localStorage key used by api.ts.
 *
 * Public API:
 *   - exportTeams(matchId?): TeamBackup
 *   - exportTeamsAsString(matchId?): string
 *   - downloadTeamsBackup(matchId?, filename?): void
 *   - importTeams(json: string | TeamBackup, matchId?): ImportResult
 *   - importTeamsFromFile(file: File, matchId?): Promise<ImportResult>
 *
 * Backup file schema (TeamBackup):
 *   {
 *     version: 1,
 *     app: "apna-cricket",
 *     exportedAt: 1234567890,
 *     matchId?: "123",
 *     teams: { "matchId1": [TeamRow, ...], "matchId2": [...] }
 *   }
 */

import type { TeamRow } from "./api";

const LOCAL_TEAMS_KEY = "apna-cricket-local-teams";

export interface TeamBackup {
  version: 1;
  app: "apna-cricket";
  exportedAt: number;
  matchId?: string;
  teams: Record<string, TeamRow[]>;
}

export interface ImportResult {
  ok: boolean;
  message: string;
  importedMatches: number;
  importedTeams: number;
  skippedInvalid: number;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function readLocalTeams(): Record<string, TeamRow[]> {
  if (!isBrowser()) return {};
  try {
    return JSON.parse(localStorage.getItem(LOCAL_TEAMS_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeLocalTeams(data: Record<string, TeamRow[]>): void {
  if (!isBrowser()) return;
  localStorage.setItem(LOCAL_TEAMS_KEY, JSON.stringify(data));
}

/**
 * Build a backup object from the local team store.
 *
 * If matchId is provided, only that match's teams are included.
 * If matchId is omitted, ALL matches' teams are included.
 */
export function exportTeams(matchId?: string): TeamBackup {
  const all = readLocalTeams();
  const teams: Record<string, TeamRow[]> = matchId
    ? all[matchId]
      ? { [matchId]: all[matchId] }
      : {}
    : all;

  return {
    version: 1,
    app: "apna-cricket",
    exportedAt: Date.now(),
    matchId,
    teams,
  };
}

/**
 * Serialize a backup as a pretty-printed JSON string.
 */
export function exportTeamsAsString(matchId?: string): string {
  return JSON.stringify(exportTeams(matchId), null, 2);
}

/**
 * Trigger a browser download of the backup JSON file.
 */
export function downloadTeamsBackup(matchId?: string, filename?: string): void {
  if (!isBrowser()) return;
  const backup = exportTeams(matchId);
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const stamp = new Date(backup.exportedAt).toISOString().slice(0, 10);
  const suffix = matchId ? `-${matchId}` : "-all";
  a.download = filename || `apna-cricket-teams${suffix}-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Import teams from a JSON string or backup object.
 *
 * - Validates the backup shape (must have `version`, `app`, `teams`).
 * - Merges into the existing local team store (does NOT overwrite other
 *   matches — only the matches present in the backup file are affected).
 * - If matchId is provided, ALL imported teams are tagged with that matchId
 *   (useful for restoring an "all matches" backup into a single match).
 *
 * Returns an ImportResult with counts.
 */
export function importTeams(input: string | TeamBackup, matchId?: string): ImportResult {
  let backup: TeamBackup;
  if (typeof input === "string") {
    try {
      backup = JSON.parse(input);
    } catch (err: any) {
      return {
        ok: false,
        message: `Invalid JSON: ${err?.message || err}`,
        importedMatches: 0,
        importedTeams: 0,
        skippedInvalid: 0,
      };
    }
  } else {
    backup = input;
  }

  // Validate
  if (!backup || backup.app !== "apna-cricket" || typeof backup.teams !== "object" || !backup.teams) {
    return {
      ok: false,
      message: "Invalid backup file: missing 'app' or 'teams' field",
      importedMatches: 0,
      importedTeams: 0,
      skippedInvalid: 1,
    };
  }

  const all = readLocalTeams();
  let importedMatches = 0;
  let importedTeams = 0;
  let skippedInvalid = 0;

  for (const [mid, teams] of Object.entries(backup.teams)) {
    const targetMatchId = matchId || mid;
    if (!Array.isArray(teams)) {
      skippedInvalid += 1;
      continue;
    }
    const validTeams: TeamRow[] = teams.filter(
      (t) => t && typeof t === "object" && Array.isArray((t as TeamRow).players)
    ) as TeamRow[];
    if (validTeams.length === 0) {
      skippedInvalid += 1;
      continue;
    }

    // Merge: existing teams + imported teams (imported appended to the end)
    const existing = all[targetMatchId] || [];
    all[targetMatchId] = [...existing, ...validTeams];
    importedMatches += 1;
    importedTeams += validTeams.length;
  }

  writeLocalTeams(all);

  return {
    ok: true,
    message: `Imported ${importedTeams} team(s) across ${importedMatches} match(es)`,
    importedMatches,
    importedTeams,
    skippedInvalid,
  };
}

/**
 * Import teams from a File object (e.g. from <input type="file">).
 */
export function importTeamsFromFile(file: File, matchId?: string): Promise<ImportResult> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      resolve(importTeams(text, matchId));
    };
    reader.onerror = () => {
      resolve({
        ok: false,
        message: "Failed to read file",
        importedMatches: 0,
        importedTeams: 0,
        skippedInvalid: 0,
      });
    };
    reader.readAsText(file);
  });
}

/**
 * Get a quick stats summary of what's in the local team store.
 */
export function getLocalTeamsStats(): {
  totalMatches: number;
  totalTeams: number;
  perMatch: Array<{ matchId: string; count: number }>;
} {
  const all = readLocalTeams();
  const perMatch = Object.entries(all)
    .map(([matchId, teams]) => ({ matchId, count: teams.length }))
    .sort((a, b) => b.count - a.count);
  const totalTeams = perMatch.reduce((acc, m) => acc + m.count, 0);
  return {
    totalMatches: perMatch.length,
    totalTeams,
    perMatch,
  };
}

/**
 * Wipe all local teams (used by a "Reset" button — destructive).
 */
export function clearAllLocalTeams(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(LOCAL_TEAMS_KEY);
}
