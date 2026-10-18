/**
 * Auto-Transfer Scheduler
 * ========================
 * Watches a match's lineup_status and, when the official lineup is announced,
 * automatically:
 *   1. Replaces every non-playing player in every saved team using the existing
 *      `autoReplaceNonPlaying()` algorithm.
 *   2. Triggers a transfer of those updated teams to the target fantasy
 *      platform (Dream11 / My11Circle / etc.) via the existing /api/transfer
 *      endpoint.
 *
 * Polling:
 *   - lineup_status is checked every 2 minutes (default; configurable).
 *   - Once the lineup is announced (lineup_status === 1), the scheduler fires
 *     once, runs the replacement + transfer, then stops itself.
 *
 * This is an ADDITIVE module — it does NOT modify the existing
 * `autoReplaceNonPlaying()` or transfer flow. It only calls them.
 *
 * Public API:
 *   - scheduleAutoTransfer(opts): ScheduleResult
 *   - cancelAutoTransfer(matchId): boolean
 *   - isAutoTransferScheduled(matchId): boolean
 *   - listScheduledAutoTransfers(): ScheduledMatch[]
 *
 * localStorage key: "apna-cricket-auto-transfer-schedules"
 */

import type { TeamRow, MatchPlayer, FantasyApp } from "./api";
import { autoReplaceNonPlaying } from "./lineup";

/* ---------- Types ---------- */

export interface ScheduleOptions {
  matchId: string;
  teams: TeamRow[];
  allPlayers: MatchPlayer[];
  platform: FantasyApp | string;
  authToken: string;
  /** Polling interval in ms (default 120_000 = 2 min). */
  pollIntervalMs?: number;
  /** Optional callback for progress / status updates. */
  onProgress?: (event: SchedulerEvent) => void;
  /** Optional fetcher override (for tests). Defaults to /api/matches. */
  fetchMatchStatus?: (matchId: string) => Promise<{ lineup_status: number; status?: string }>;
}

export interface ScheduledMatch {
  matchId: string;
  platform: FantasyApp | string;
  teamCount: number;
  createdAt: number;
  status: "scheduled" | "lineup_announced" | "replaced" | "transferring" | "transferred" | "failed";
  lastChecked?: number;
  lastError?: string;
  pollIntervalMs: number;
}

export type SchedulerEvent =
  | { type: "scheduled"; matchId: string }
  | { type: "polling"; matchId: string; lineupStatus: number }
  | { type: "lineup_announced"; matchId: string }
  | { type: "replaced"; matchId: string; replacedCount: number }
  | { type: "transferring"; matchId: string; teamCount: number }
  | { type: "transferred"; matchId: string; successCount: number; failedCount: number }
  | { type: "failed"; matchId: string; error: string }
  | { type: "cancelled"; matchId: string };

export interface ScheduleResult {
  ok: boolean;
  message: string;
  matchId: string;
}

/* ---------- Persistence (in-memory + localStorage) ---------- */

const STORAGE_KEY = "apna-cricket-auto-transfer-schedules";

/** In-memory registry of active polling timers (so we can cancel). */
const activeTimers = new Map<string, ReturnType<typeof setInterval>>();

function isBrowser(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function readSchedules(): Record<string, ScheduledMatch> {
  if (!isBrowser()) return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeSchedules(schedules: Record<string, ScheduledMatch>): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(schedules));
  } catch {
    /* ignore quota errors */
  }
}

function updateSchedule(matchId: string, patch: Partial<ScheduledMatch>): ScheduledMatch | null {
  const all = readSchedules();
  const cur = all[matchId];
  if (!cur) return null;
  const updated: ScheduledMatch = { ...cur, ...patch };
  all[matchId] = updated;
  writeSchedules(all);
  return updated;
}

/* ---------- Default lineup fetcher ---------- */

async function defaultFetchMatchStatus(
  matchId: string
): Promise<{ lineup_status: number; status?: string }> {
  try {
    const res = await fetch(`/api/matches?id=${encodeURIComponent(matchId)}`);
    if (!res.ok) return { lineup_status: 0 };
    const data = await res.json();
    const m = data?.match || data?.data || data;
    return {
      lineup_status: Number(m?.lineup_status ?? 0),
      status: String(m?.status ?? ""),
    };
  } catch {
    return { lineup_status: 0 };
  }
}

/* ---------- Core: replace + transfer ---------- */

async function runReplaceAndTransfer(
  opts: ScheduleOptions,
  schedule: ScheduledMatch
): Promise<void> {
  const { matchId, teams, allPlayers, platform, authToken, onProgress } = opts;

  // 1) Replace non-playing players in each team
  let totalReplaced = 0;
  const updatedTeams: TeamRow[] = teams.map((team) => {
    const { updatedTeam, replaced } = autoReplaceNonPlaying(team, allPlayers, true);
    totalReplaced += replaced.length;
    return updatedTeam;
  });

  onProgress?.({ type: "replaced", matchId, replacedCount: totalReplaced });
  updateSchedule(matchId, { status: "replaced" });

  // 2) Trigger transfer via existing /api/transfer endpoint
  onProgress?.({ type: "transferring", matchId, teamCount: updatedTeams.length });
  updateSchedule(matchId, { status: "transferring" });

  let successCount = 0;
  let failedCount = 0;
  let lastError = "";

  try {
    // PROPER TRANSFER FIX — /api/transfer handles ONE team per call
    // (players + captain + vice_captain). Send each team sequentially with
    // full player data (names included so the server can map onto the
    // fantasy platform's own player IDs — required for a real transfer).
    // NOTE: always send OUR local matchId — the server resolves + caches the
    // PLATFORM matchId keyed by it (repeat calls hit the DB cache).
    for (const team of updatedTeams) {
      const players = (team.players || [])
        .map((p) => {
          const id = p.player_fixed_id ?? p.pl_id ?? p.pid ?? p.id;
          return id === undefined || id === null ? "" : String(id);
        })
        .filter(Boolean);
      const playerNames = (team.players || [])
        .map((p) => String(p.name ?? "").trim());
      const captain = String(team.captain ?? team.c ?? players[0] ?? "");
      const viceCaptain = String(team.viceCaptain ?? team.vc ?? team.vicecaptain ?? players[1] ?? players[0] ?? "");

      const res = await fetch("/api/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId,
          captain,
          vice_captain: viceCaptain,
          vicecaptain: viceCaptain,
          players,
          playerNames,
          fantasyApp: platform,
          authToken,
          sportIndex: 0,
          type: "new",
        }),
      });
      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if (res.ok && (data?.status === "success" || data?.status === "ok")) {
        successCount++;
      } else {
        failedCount++;
        lastError = String(data?.error || data?.message || `HTTP ${res.status}`);
      }
    }
  } catch (err: any) {
    lastError = String(err?.message || err || "Network error during transfer");
    failedCount = updatedTeams.length;
  }

  if (failedCount > 0 && successCount === 0) {
    onProgress?.({ type: "failed", matchId, error: lastError });
    updateSchedule(matchId, { status: "failed", lastError });
  } else {
    onProgress?.({ type: "transferred", matchId, successCount, failedCount });
    updateSchedule(matchId, { status: "transferred" });
  }

  // Stop polling after firing once
  cancelAutoTransfer(matchId, /* silent */ true);
}

/* ---------- Public API ---------- */

/**
 * Schedule an auto-transfer for a match.
 *
 * Polls lineup_status every `pollIntervalMs` (default 2 min).
 * When lineup_status === 1 (announced), runs autoReplaceNonPlaying + transfer.
 */
export function scheduleAutoTransfer(opts: ScheduleOptions): ScheduleResult {
  const {
    matchId,
    teams,
    platform,
    authToken,
    pollIntervalMs = 120_000, // 2 minutes
    onProgress,
    fetchMatchStatus = defaultFetchMatchStatus,
  } = opts;

  if (!matchId) {
    return { ok: false, message: "matchId is required", matchId };
  }
  if (!teams || teams.length === 0) {
    return { ok: false, message: "No teams to schedule", matchId };
  }
  if (!authToken) {
    return { ok: false, message: "authToken is required", matchId };
  }
  if (!isBrowser()) {
    return { ok: false, message: "Scheduler requires a browser environment", matchId };
  }

  // Cancel any existing schedule for this match (idempotent)
  cancelAutoTransfer(matchId, true);

  const schedule: ScheduledMatch = {
    matchId,
    platform,
    teamCount: teams.length,
    createdAt: Date.now(),
    status: "scheduled",
    pollIntervalMs,
  };

  const all = readSchedules();
  all[matchId] = schedule;
  writeSchedules(all);

  onProgress?.({ type: "scheduled", matchId });

  const check = async () => {
    try {
      const status = await fetchMatchStatus(matchId);
      updateSchedule(matchId, { lastChecked: Date.now() });

      onProgress?.({ type: "polling", matchId, lineupStatus: status.lineup_status });

      if (status.lineup_status === 1) {
        onProgress?.({ type: "lineup_announced", matchId });
        updateSchedule(matchId, { status: "lineup_announced" });

        // Fire replacement + transfer (async — don't block the interval)
        runReplaceAndTransfer(opts, schedule).catch((err) => {
          updateSchedule(matchId, {
            status: "failed",
            lastError: String(err?.message || err),
          });
          onProgress?.({
            type: "failed",
            matchId,
            error: String(err?.message || err),
          });
          cancelAutoTransfer(matchId, true);
        });
      }
    } catch (err: any) {
      // Don't cancel on a single polling failure — keep trying
      updateSchedule(matchId, { lastError: String(err?.message || err) });
    }
  };

  // Initial check after 2 seconds, then every pollIntervalMs
  const initialTimer = setTimeout(check, 2000);
  const intervalTimer = setInterval(check, pollIntervalMs);

  // Store both so we can cancel cleanly
  activeTimers.set(matchId, intervalTimer as unknown as ReturnType<typeof setInterval>);
  // The initial timeout just falls through after firing; nothing to clear there
  // but we keep a reference so cancelAutoTransfer can be sure.
  void initialTimer;

  return { ok: true, message: "Auto-transfer scheduled", matchId };
}

/**
 * Cancel a scheduled auto-transfer.
 */
export function cancelAutoTransfer(matchId: string, silent = false): boolean {
  const timer = activeTimers.get(matchId);
  if (timer) {
    clearInterval(timer);
    activeTimers.delete(matchId);
  }
  const all = readSchedules();
  if (all[matchId]) {
    delete all[matchId];
    writeSchedules(all);
    if (!silent && typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("auto-transfer-cancelled", { detail: { matchId } })
      );
    }
    return true;
  }
  return false;
}

/**
 * Is there an active schedule for this match?
 */
export function isAutoTransferScheduled(matchId: string): boolean {
  return !!readSchedules()[matchId];
}

/**
 * List all scheduled auto-transfers.
 */
export function listScheduledAutoTransfers(): ScheduledMatch[] {
  return Object.values(readSchedules()).sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Get a single schedule by matchId.
 */
export function getScheduledAutoTransfer(matchId: string): ScheduledMatch | null {
  return readSchedules()[matchId] || null;
}

/**
 * Cancel ALL scheduled auto-transfers (e.g. on app logout).
 */
export function cancelAllAutoTransfers(): number {
  const all = readSchedules();
  const count = Object.keys(all).length;
  for (const matchId of Object.keys(all)) {
    cancelAutoTransfer(matchId, true);
  }
  return count;
}
