/**
 * APNA CRICKET — Standalone Research API Service
 * ================================================
 *
 * Completely independent module. Does NOT use, modify, or connect to any
 * existing data, state, API calls, database, cache, or hooks.
 *
 * Uses its own API integration with a separate backend.
 * All state, services, types, and error handling are self-contained.
 *
 * Per user spec: "This page must NOT use, modify, or connect to any existing
 * data, state, API calls, database collections, caches, stores, contexts,
 * hooks, or business logic used anywhere else in the application."
 */

// ============================================================
// STANDALONE TYPES — completely separate from existing app types
// ============================================================

export interface ResearchMatch {
  // API actual field names (from possible11 API)
  id: string;
  date: string;
  name: string;
  tour: string;
  sid: string;
  tid: string;
  c1: string;
  c2: string;
  type: string;
  prize: string;
  status: string;
  status_msg: string;
  active: string;
  cod1: string;  // team1 short code
  cnm1: string;  // team1 full name
  fl1: string;   // team1 flag/logo
  cod2: string;  // team2 short code
  cnm2: string;  // team2 full name
  fl2: string;   // team2 flag/logo
  [k: string]: unknown;
}

export interface ResearchMatchDetails {
  // API actual field names (from possible11 API getMatchDetails response)
  tour?: string;
  sid?: string;
  tid?: string;
  latest?: string;      // HTML — match preview summary
  detail?: string;      // HTML — full match preview (team updates, probable XI, etc.)
  fantasy?: string;     // HTML — fantasy tips
  report?: string;      // HTML — pitch report + weather + venue
  squads?: string;      // HTML — playing XI / squads (null before lineup)
  injured?: string;     // HTML — injury updates
  dtime?: string;       // match datetime
  crickid?: string;     // cricket match ID
  mstatus?: string;     // match status (0 = upcoming)
  uptime?: string;      // last updated time
  points?: string;      // JSON string — team points table
  [k: string]: unknown;
}

export interface ResearchPlayer {
  pid: string;
  name: string;
  shortName: string;
  team: string;
  role: string;
  credits: number;
  selected_by: number;
  points: number;
  playing: number;
  image: string;
  [k: string]: unknown;
}

export interface ResearchBestPlayer {
  pid: string;
  name: string;
  reason: string;
  type: string; // captain, vc, etc.
  [k: string]: unknown;
}

export interface ResearchInfo {
  [k: string]: unknown;
}

export interface ResearchNote {
  id: string;
  title: string;
  content: string;
  type: string;
  [k: string]: unknown;
}

// ============================================================
// STANDALONE API CLIENT — completely separate service
// ============================================================

/**
 * API configuration — uses a server-side proxy to avoid CORS issues.
 * The proxy route at /api/research-proxy forwards requests to the
 * external API. This keeps the API URL server-side only.
 */
const PROXY_URL = "/api/research-proxy";

/**
 * Generate a pseudo device ID for the API.
 * The external API requires a uuid field — we generate a stable one
 * from localStorage (separate key from the main app's device ID).
 */
function getResearchDeviceId(): string {
  if (typeof window === "undefined") return "web-research-unknown";
  try {
    let id = localStorage.getItem("apna-research-device-id");
    if (!id) {
      id = "web-" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
      localStorage.setItem("apna-research-device-id", id);
    }
    return id;
  } catch {
    return "web-research-fallback";
  }
}

/**
 * Core API call function.
 * Sends a POST request to the proxy with the action + parameters.
 * The proxy forwards to the external API and returns the response.
 *
 * ERROR ISOLATION: All errors are caught here and returned as
 * { error: string }. They NEVER propagate to the main app.
 */
async function callApi(body: Record<string, unknown>): Promise<any> {
  try {
    const requestBody = {
      ...body,
      uuid: getResearchDeviceId(),
      device: "web",
      osVersion: "unknown",
      model: "browser",
    };

    const res = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.error(`[ResearchAPI] HTTP ${res.status} for action: ${body.action}`);
      return { error: `Server returned ${res.status}` };
    }

    const data = await res.json();
    return data;
  } catch (err: any) {
    console.error(`[ResearchAPI] Error for action ${body.action}:`, err?.message);
    return { error: err?.message || "Network error" };
  }
}

// ============================================================
// API ENDPOINTS — one function per action
// ============================================================

/**
 * Get list of upcoming matches.
 */
export async function getResearchMatches(
  sport: string = "cricket",
  matchState: string = "upcoming"
): Promise<{ matches: ResearchMatch[]; error?: string }> {
  const data = await callApi({ action: "getMatches", sport, matchState });
  if (data.error) return { matches: [], error: data.error };
  const matches = Array.isArray(data) ? data : (data.matches || data.data || []);
  return { matches };
}

/**
 * Get detailed match information (pitch, weather, venue, H2H, etc.)
 */
export async function getResearchMatchDetails(
  matchId: string
): Promise<{ details: ResearchMatchDetails | null; error?: string }> {
  const data = await callApi({ action: "getMatchDetails", mid: matchId });
  if (data.error) return { details: null, error: data.error };
  return { details: Array.isArray(data) ? data[0] : data };
}

/**
 * Get players for a match.
 */
export async function getResearchPlayers(
  matchId: string
): Promise<{ players: ResearchPlayer[]; error?: string }> {
  const data = await callApi({ action: "getBothPlayers", mid: matchId });
  if (data.error) return { players: [], error: data.error };
  const players = Array.isArray(data) ? data : (data.players || data.data || []);
  return { players };
}

/**
 * Get best players (Captain & Vice-Captain suggestions).
 */
export async function getResearchBestPlayers(
  matchId: string
): Promise<{ best: ResearchBestPlayer[]; error?: string }> {
  const data = await callApi({ action: "getBestPlayers", mid: matchId });
  if (data.error) return { best: [], error: data.error };
  const best = Array.isArray(data) ? data : (data.best || data.data || []);
  return { best };
}

/**
 * Get app info (announcements, etc.)
 */
export async function getResearchInfo(): Promise<{ info: ResearchInfo | null; error?: string }> {
  const data = await callApi({ action: "getInfo" });
  if (data.error) return { info: null, error: data.error };
  return { info: Array.isArray(data) ? data[0] : data };
}

/**
 * Get match notes/analysis.
 */
export async function getResearchNotes(
  matchId: string
): Promise<{ notes: ResearchNote[]; error?: string }> {
  const data = await callApi({
    action: "getNote",
    uid: getResearchDeviceId(),
    subject: "match",
    pid: matchId,
  });
  if (data.error) return { notes: [], error: data.error };
  const notes = Array.isArray(data) ? data : (data.notes || data.data || []);
  return { notes };
}

/**
 * Get live score for a match.
 */
export async function getResearchScore(
  matchId: string
): Promise<{ score: any; error?: string }> {
  const data = await callApi({ action: "getScore", mid: matchId });
  if (data.error) return { score: null, error: data.error };
  return { score: Array.isArray(data) ? data[0] : data };
}
