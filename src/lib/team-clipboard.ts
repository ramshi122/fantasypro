/**
 * Bulk Team Copy-Paste System
 * ============================
 *
 * Allows users to copy all generated teams to clipboard and paste them
 * into another match or share with friends.
 *
 * Format: JSON array of TeamRow objects, prefixed with "APNA_CRICKET_TEAMS:"
 * for identification.
 *
 * Use cases:
 *   1. Copy teams from Match A → Paste into Match B
 *   2. Share teams with friend (paste into chat, they import)
 *   3. Backup teams before bulk delete
 *   4. Transfer teams between devices
 */

import type { TeamRow } from "./api";

const COPY_PREFIX = "APNA_CRICKET_TEAMS:";
const LOCAL_CLIPBOARD_KEY = "apna-cricket-clipboard-teams";

export interface CopyResult {
  success: boolean;
  count: number;
  message: string;
}

export interface PasteResult {
  success: boolean;
  teams: TeamRow[];
  count: number;
  message: string;
  errors: string[];
}

/**
 * Copy all teams to clipboard (and localStorage as backup).
 */
export async function copyTeamsToClipboard(teams: TeamRow[]): Promise<CopyResult> {
  if (!teams || teams.length === 0) {
    return { success: false, count: 0, message: "No teams to copy" };
  }

  try {
    // Serialize teams with only essential fields (strip _id, teamId which are match-specific)
    const serialized = teams.map((t, i) => ({
      teamNo: i + 1,
      players: (t.players || []).map(p => ({
        pid: p.pid || p.player_fixed_id || p.pl_id || "",
        name: p.name || "",
        shortName: p.shortName || "",
        team: p.team_name || p.team || "",
        role: p.role || "",
        credits: Number(p.credits || 0),
        selected_by: Number(p.selected_by || p.sel || 0),
        playing: p.playing ?? 1,
      })),
      captain: t.captain || t.c,
      viceCaptain: t.viceCaptain || t.vicecaptain || t.vc,
    }));

    const payload = COPY_PREFIX + JSON.stringify(serialized);

    // Try clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(payload);
    } else {
      // Fallback: use textarea + execCommand
      const textarea = document.createElement("textarea");
      textarea.value = payload;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    // Also save to localStorage as backup
    localStorage.setItem(LOCAL_CLIPBOARD_KEY, payload);

    return {
      success: true,
      count: teams.length,
      message: `✅ ${teams.length} teams copied to clipboard`,
    };
  } catch (err) {
    console.error("[clipboard] Copy failed:", err);
    return {
      success: false,
      count: 0,
      message: `Copy failed: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
}

/**
 * Parse teams from clipboard text.
 * Returns parsed teams or error list.
 */
export function parseTeamsFromText(text: string): PasteResult {
  if (!text || typeof text !== "string") {
    return {
      success: false,
      teams: [],
      count: 0,
      message: "No text to parse",
      errors: ["Empty clipboard"],
    };
  }

  const errors: string[] = [];
  let payload = text.trim();

  // Strip prefix if present
  if (payload.startsWith(COPY_PREFIX)) {
    payload = payload.slice(COPY_PREFIX.length);
  }

  // Try to parse as JSON
  let parsed: any[];
  try {
    parsed = JSON.parse(payload);
  } catch (err) {
    return {
      success: false,
      teams: [],
      count: 0,
      message: "Invalid team data — not JSON",
      errors: [`JSON parse error: ${err instanceof Error ? err.message : "unknown"}`],
    };
  }

  if (!Array.isArray(parsed)) {
    return {
      success: false,
      teams: [],
      count: 0,
      message: "Invalid team data — expected array",
      errors: ["Expected array of teams"],
    };
  }

  // Validate and convert each team
  const teams: TeamRow[] = [];
  parsed.forEach((raw, idx) => {
    const teamNum = idx + 1;
    if (!raw || typeof raw !== "object") {
      errors.push(`Team #${teamNum}: not an object`);
      return;
    }
    if (!Array.isArray(raw.players) || raw.players.length !== 11) {
      errors.push(`Team #${teamNum}: expected 11 players, got ${Array.isArray(raw.players) ? raw.players.length : "none"}`);
      return;
    }

    const players = raw.players.map((p: any, pi: number) => ({
      pid: String(p.pid || p.player_fixed_id || p.pl_id || `p${pi}`),
      player_fixed_id: p.pid || p.player_fixed_id || p.pl_id,
      pl_id: p.pl_id || p.pid,
      name: String(p.name || "Unknown"),
      shortName: String(p.shortName || (p.name || "").slice(0, 4).toUpperCase()),
      team: String(p.team || ""),
      team_name: String(p.team || p.team_name || ""),
      role: p.role || "",
      role_num: typeof p.role === "number" ? p.role : 0,
      player_type: p.player_type || "",
      credits: Number(p.credits || 8),
      selected_by: Number(p.selected_by || 0),
      sel: Number(p.selected_by || 0),
      image: p.image || "",
      playing: p.playing ?? 1,
    }));

    const captain = String(raw.captain || raw.c || "");
    const viceCaptain = String(raw.viceCaptain || raw.vicecaptain || raw.vc || "");

    if (!captain) {
      errors.push(`Team #${teamNum}: missing captain`);
    }
    if (!viceCaptain) {
      errors.push(`Team #${teamNum}: missing vice-captain`);
    }

    teams.push({
      _id: `pasted_${Date.now()}_${idx}`,
      teamId: `pasted_${idx + 1}`,
      teamNo: teamNum,
      team_number: teamNum,
      players,
      captain,
      viceCaptain,
      vicecaptain: viceCaptain,
      c: captain,
      vc: viceCaptain,
      type: "pasted",
    });
  });

  if (teams.length === 0) {
    return {
      success: false,
      teams: [],
      count: 0,
      message: `No valid teams found (${errors.length} errors)`,
      errors,
    };
  }

  return {
    success: true,
    teams,
    count: teams.length,
    message: `✅ Parsed ${teams.length} teams${errors.length > 0 ? ` (${errors.length} warnings)` : ""}`,
    errors,
  };
}

/**
 * Paste teams from clipboard.
 * Reads from clipboard, parses, and returns teams.
 */
export async function pasteTeamsFromClipboard(): Promise<PasteResult> {
  try {
    let text = "";

    // Try clipboard API first
    if (navigator.clipboard && navigator.clipboard.readText) {
      text = await navigator.clipboard.readText();
    }

    // If clipboard empty or API unavailable, try localStorage backup
    if (!text) {
      text = localStorage.getItem(LOCAL_CLIPBOARD_KEY) || "";
    }

    if (!text) {
      return {
        success: false,
        teams: [],
        count: 0,
        message: "Clipboard is empty",
        errors: ["No teams in clipboard"],
      };
    }

    return parseTeamsFromText(text);
  } catch (err) {
    console.error("[clipboard] Paste failed:", err);
    return {
      success: false,
      teams: [],
      count: 0,
      message: `Paste failed: ${err instanceof Error ? err.message : "unknown error"}`,
      errors: [String(err)],
    };
  }
}

/**
 * Check if clipboard has teams (without parsing).
 */
export function hasTeamsInClipboard(): boolean {
  if (typeof window === "undefined") return false;
  const backup = localStorage.getItem(LOCAL_CLIPBOARD_KEY);
  return !!backup && backup.startsWith(COPY_PREFIX);
}

/**
 * Clear the clipboard backup.
 */
export function clearClipboardBackup(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LOCAL_CLIPBOARD_KEY);
}
