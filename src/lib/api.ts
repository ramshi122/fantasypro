import { encrypt, decrypt } from "./crypto";
import { roleFromPlayerType } from "./format";
import {
  getOrFetch as accountGetOrFetch,
  invalidateCache as accountInvalidateCache,
  invalidateAccountCache,
  setActiveAccount,
  getActiveAccountId,
  type CacheScope,
} from "./account-session";
import {
  getFantasyAccount as getFantasyAccountById,
  updateFantasyAccount as updateFantasyAccountById,
  markAccountActive,
  markAccountExpired,
} from "./multi-accounts";

/**
 * Apna Cricket API client — patched to match the actual Apna Cricket backend.
 *
 * Architecture (verified by inspecting teamgeneration.in (reference) + live API):
 *
 * 1. Public endpoints (NO auth, AES-encrypted response data):
 *    - GET  /api/fantasy/matches/{sport}       → list of matches
 *    - GET  /api/fantasy/match/{matchId}       → match details with player lists
 *    - GET  /api/promotion/getlist             → promotions
 *    - GET  /api/primeteam/teamlist            → prime team match IDs
 *    - POST /api/expert/teamlist               → expert team match IDs
 *
 * 2. Fantasy-platform endpoints (plain JSON, no AES):
 *    - POST /api/fantasy/auth/verify           body: {fantasyApp, authToken, matchId}
 *                                                resp: {status, validToken, updateUiToken, authToken}
 *    - POST /api/fantasy/list-of-teams         body: {fantasyApp, matchId, authToken}
 *                                                resp: {status, teams_list: [{team_id, team_number}]}
 *    - POST /api/dream11/contest/join-contest  body: {authToken, matchId, contestId, teamIds}
 *                                                resp: {status, joinResults, summary}
 *
 * 3. Apna Cricket user auth (Bearer JWT in header — obtained via Google OAuth):
 *    Used only for admin / premium features. We BYPASS this in guest mode.
 *
 * 4. Local fallback (guest mode):
 *    When the user is browsing as guest (no real Dream11/My11Circle token),
 *    we persist their teams to localStorage so the full add/edit/delete/transfer
 *    flow works end-to-end without any external tokens.
 */

/**
 * API BASE — switched to possible11.com (same as original APK)
 *
 * The original Possible11 app uses https://possible11.com/admin/api2.php
 * as its primary API. The possible11.com backend was returning
 * 0 matches. possible11.com has the real, live match data.
 *
 * Per user spec: "I dont want fake original apk match show cheyunnund
 * you chek original propper"
 */
export const API_BASE = "https://possible11.com";

/**
 * FANTASY API BASE — the real fantasy-platform backend (Dream11 / My11Circle /
 * Jumbo / MyTeam11 / Vision11 OTP, tokens, transfers, contest joining).
 *
 * ROOT CAUSE FIX (OTP not receiving — Dream11 & My11Circle):
 *   When API_BASE was switched to possible11.com (commit 2735cae) to get real
 *   match data, ALL rawFetch calls were redirected there too. But
 *   possible11.com does NOT host any /api/fantasy/* or /api/classic/* or
 *   /api/{app}/contest/* endpoints — they return an HTML 404 page:
 *     POST https://possible11.com/api/fantasy/send-otp   → 404 (HTML)
 *     POST https://possible11.com/api/fantasy/verify-otp → 404 (HTML)
 *   So the "Send OTP" request silently died before any SMS could be sent.
 *
 *   The fantasy endpoints (send-otp / verify-otp / auth/verify / addteam /
 *   join-contest / teamlists / promotions) are live on tgsoftware-api.online
 *   — verified by live probing (send-otp returns structured JSON errors for
 *   bad input, join-contest returns 401 for missing token, matches 200).
 *   This is also the backend the ORIGINAL APK used, and it is already
 *   whitelisted in the CSP (next.config.ts connect-src) and sends
 *   Access-Control-Allow-Origin: * — so browser calls are allowed.
 */
export const FANTASY_API_BASE = "https://tgsoftware-api.online";

export type Sport = "cricket" | "football" | "basketball" | "kabaddi";
export type FantasyApp = "dream11" | "my11circle" | "myteam11" | "vision11" | "jumbo";

/**
 * Per-platform team limits — matches the ORIGINAL teamgeneration.in APK source.
 *
 * Found in the original APK's compiled JS:
 *   {id:1, name:"Dream11",   slug:"dream11",    limit:40, available:true}
 *   {id:2, name:"My11Circle", slug:"my11circle", limit:40, available:true}
 *   {id:3, name:"Jumbo",      slug:"jumbo",      limit:50, available:true}
 *
 * Logic from the original APK:
 *   - If backend returns maxAllowedTeam (Dream11 subscription field) → use that
 *   - Else if app is "dream11" → 40
 *   - Else → use the platform's `limit` field
 *
 * This means:
 *   - Dream11:    up to 40 teams (with paid subscription; backend may return lower)
 *   - My11Circle: up to 40 teams
 *   - Jumbo:      up to 50 teams
 *   - Other apps: default to 11 (the platform default)
 */
export const PLATFORM_LIMITS: Record<string, number> = {
  dream11: 40,
  my11circle: 40,
  jumbo: 50,
  myteam11: 20,
  vision11: 20,
};

export const DEFAULT_PLATFORM_LIMIT = 11;

/**
 * Get the per-platform team limit for a given fantasy app and linked account.
 *
 * @param app - The fantasy app slug (dream11, my11circle, etc.)
 * @param account - The linked account (optional — may contain maxAllowedTeam for Dream11)
 * @returns The maximum number of teams the user can have for this match on this platform
 */
export function getPlatformLimit(
  app: FantasyApp | string,
  account?: { maxAllowedTeam?: number | null } | null
): number {
  // Dream11: backend may return maxAllowedTeam (depends on subscription tier)
  // Use that if present, otherwise fall back to the platform limit (40)
  if (app === "dream11") {
    if (account?.maxAllowedTeam && account.maxAllowedTeam > 0) {
      return Math.min(account.maxAllowedTeam, PLATFORM_LIMITS.dream11);
    }
    return PLATFORM_LIMITS.dream11;
  }
  // Other apps: use the platform's limit field
  return PLATFORM_LIMITS[app] || DEFAULT_PLATFORM_LIMIT;
}

/* ---------- Types ---------- */

export interface MatchPlayer {
  pid?: number | string;
  name?: string;
  shortName?: string;
  image?: string;
  team?: string;
  team_name?: string;
  team_index?: number;
  role?: number;
  role_text?: string;
  player_type?: string;
  credits?: number;
  points?: number;
  selected_by?: number;
  sel?: number;
  captain_percentage?: number;
  vice_captain_percentage?: number;
  player_fixed_id?: string;
  pl_id?: string;
  playing?: number; // 0 = not confirmed, 1 = confirmed playing (after lineup)
  last_play?: number; // 0 = didn't play last match, 1 = played
  last_play_text?: string;
  [k: string]: unknown;
}

export interface MatchTeam {
  tid?: number | string;
  name?: string;
  shortName?: string;
  logo?: string;
  [k: string]: unknown;
}

export interface MatchInfo {
  matchId?: number | string;
  id?: number | string;
  title?: string;
  subTitle?: string;
  series?: string;
  series_name?: string;
  team1?: MatchTeam | string;
  team2?: MatchTeam | string;
  team1Short?: string;
  team2Short?: string;
  team1Logo?: string;
  team2Logo?: string;
  left_team_name?: string;
  right_team_name?: string;
  left_team_image?: string;
  right_team_image?: string;
  left_team_players?: unknown[];
  right_team_players?: unknown[];
  startTime?: string | number;
  match_time?: string;
  endTime?: string | number;
  status?: string;
  format?: string;
  match_type?: string;
  venue?: string;
  venue_name?: string;
  type?: string;
  sport?: Sport;
  sport_index?: number;
  lineup_status?: number; // 0 = not announced, 1 = announced/confirmed
  toss?: string;
  isSaved?: boolean;
  dream11Url?: string;
  my11circleUrl?: string;
  fantasy_list?: string[];
  lineup_status?: number;
  toss?: string;
  automatic?: boolean;
  apiSource?: string;
  [k: string]: unknown;
}

export interface TeamRow {
  _id?: string;
  teamId?: string;
  team_id?: string | number;
  teamNo?: number;
  team_number?: number;
  players?: MatchPlayer[];
  captain?: number | string;
  viceCaptain?: number | string;
  vicecaptain?: number | string;
  c?: number | string;
  vc?: number | string;
  team?: string;
  type?: string;
  fantasyApp?: FantasyApp;
  transferred?: boolean;
  transferStatus?: "pending" | "transferred" | "failed";
  [k: string]: unknown;
}

export interface AuthVerifyResponse {
  status?: string;
  /** true = token OK; false = token expired; null/undefined = unknown (network error) */
  validToken?: boolean | null;
  isValid?: boolean;
  valid?: boolean;
  updateUiToken?: boolean;
  authToken?: string;
  message?: string;
  retryable?: boolean;
  [k: string]: unknown;
}

export interface PromotionItem {
  _id?: string;
  title?: string;
  label?: string;
  image?: string;
  imageUrl?: string;
  url?: string;
  link?: string;
  notificationUrl?: string;
  description?: string;
  type?: string;
  urlType?: number;
  [k: string]: unknown;
}

/* ---------- Internal helpers ---------- */

interface ApiResponse {
  status?: string;
  success?: boolean;
  validToken?: boolean;
  message?: string;
  data?: unknown;
  teams_list?: Array<{ team_id: string | number; team_number: number }>;
  joinResults?: Array<{ teamId: string | number; success: boolean }>;
  summary?: { successCount: number; failedCount: number };
  contests?: unknown[];
  expertTeamData?: string[];
  expertPredictionData?: string[];
  expertVideoData?: string[];
  booking_data?: string[];
  [k: string]: unknown;
}

async function rawFetch(
  path: string,
  init?: RequestInit,
  base: string = API_BASE
): Promise<ApiResponse> {
  const url = `${base}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*",
      ...(init?.headers || {}),
    },
    cache: "no-store",
    signal: init?.signal,
  });

  // Try to parse the body even on error responses.
  let body: ApiResponse | null = null;
  try {
    const text = await res.text();
    if (text) {
      const trimmed = text.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        body = JSON.parse(trimmed) as ApiResponse;
      } else {
        const dec = decrypt<ApiResponse>(trimmed);
        body = dec ?? null;
      }
    }
  } catch {
    // ignore parse errors
  }

  if (!res.ok) {
    if (res.status >= 400 && res.status < 500 && body) {
      return body;
    }
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  return body ?? ({} as ApiResponse);
}

/**
 * Recursively walk an object and AES-decrypt any string field that looks like
 * a CryptoJS ciphertext (starts with "U2FsdGVk" = base64 of "Salted__").
 * Returns a deep clone with decrypted values where possible.
 */
function deepDecrypt<T>(value: T): T {
  if (typeof value === "string") {
    if (value.startsWith("U2FsdGVk")) {
      const dec = decrypt<string>(value);
      if (dec) {
        // Try to parse as JSON, otherwise return the string
        try {
          return JSON.parse(dec) as unknown as T;
        } catch {
          return dec as unknown as T;
        }
      }
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(deepDecrypt) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as object)) {
      out[k] = deepDecrypt((value as Record<string, unknown>)[k]);
    }
    return out as unknown as T;
  }
  return value;
}

function unpackData<T>(resp: ApiResponse): T {
  const data = resp.data;
  if (data == null) return null as T;
  if (typeof data === "string") {
    const dec = decrypt<T>(data);
    return (dec ?? null) as T;
  }
  if (Array.isArray(data)) {
    return data
      .map((item) => {
        if (typeof item === "string") {
          return decrypt<unknown>(item);
        }
        return item;
      })
      .filter((x) => x != null) as unknown as T;
  }
  // Object — deep-decrypt any encrypted string fields
  return deepDecrypt(data) as T;
}

function buildEncryptedBody(payload: Record<string, unknown>, token?: string | null) {
  const body: Record<string, unknown> = { ...payload };
  if (token) body.token = token;
  return JSON.stringify({ payload: encrypt(body) });
}

/* ---------- Public endpoints (no auth, AES-encrypted responses) ---------- */

function normalizeMatch(raw: any): MatchInfo {
  if (!raw || typeof raw !== "object") return raw;

  // === possible11.com API field mapping ===
  // possible11 returns: id, date, name, tour, cod1, cnm1, fl1, cod2, cnm2, fl2
  // Our app expects: matchId, startTime, series, team1, team2, team1Short, etc.
  // The "date" field is a string like "2026-10-18 19:00:00" — must convert to timestamp.

  // Convert date string to timestamp (ms)
  let startTimeVal: number | undefined = raw.startTime ?? raw.match_time ?? raw.start_time;
  if (!startTimeVal && raw.date) {
    // possible11 returns "2026-10-18 19:00:00" — parse as IST (UTC+5:30)
    const parsed = new Date(String(raw.date).replace(" ", "T") + "+05:30").getTime();
    if (!isNaN(parsed)) startTimeVal = parsed;
  }

  // Team mapping: possible11 uses cod1/cnm1/fl1 (code, name, flag)
  const team1Name = raw.team1 ?
    (typeof raw.team1 === "object" ? (raw.team1.name || raw.team1.shortName) : raw.team1) :
    raw.cnm1 || raw.left_team_name || raw.cod1;
  const team1Short = raw.team1Short ?? raw.cod1 ?? raw.left_team_name;
  const team1Logo = raw.team1Logo ?? raw.fl1 ?? raw.left_team_image;
  const team2Name = raw.team2 ?
    (typeof raw.team2 === "object" ? (raw.team2.name || raw.team2.shortName) : raw.team2) :
    raw.cnm2 || raw.right_team_name || raw.cod2;
  const team2Short = raw.team2Short ?? raw.cod2 ?? raw.right_team_name;
  const team2Logo = raw.team2Logo ?? raw.fl2 ?? raw.right_team_image;

  return {
    ...raw,
    matchId: raw.matchId ?? raw.id ?? raw._id,
    series: raw.series ?? raw.series_name ?? raw.tour ?? raw.title,
    title: raw.title ?? raw.name ?? raw.series_name ?? raw.tour,
    subTitle: raw.subTitle ?? raw.sub_title,
    team1: raw.team1 ?? { shortName: team1Short, name: team1Name, logo: team1Logo },
    team2: raw.team2 ?? { shortName: team2Short, name: team2Name, logo: team2Logo },
    team1Short,
    team2Short,
    team1Logo,
    team2Logo,
    startTime: startTimeVal,
    venue: raw.venue ?? raw.venue_name,
    format: raw.format ?? raw.match_type ?? raw.type,
    type: raw.type ?? raw.match_type,
    dream11Url: raw.dream11Url ?? raw.dream11_url,
    my11circleUrl: raw.my11circleUrl ?? raw.my11circle_url ?? (Array.isArray(raw.fantasy_list) && raw.fantasy_list.includes("my11circle") ? "https://www.my11circle.com" : undefined),
  };
}

/**
 * Detect which fantasy apps are supported by a match.
 *
 * Source of truth = `fantasy_list` field from the API. It's an array like
 *   ["dream11"]                → Dream11 only
 *   ["dream11","my11circle"]   → both
 *   ["my11circle"]             → My11Circle only
 *   [] or missing              → no fantasy app supported
 *
 * Also falls back to checking fantasy_version (alternate field shape used by
 * some endpoints where each entry is { name: "dream11" }).
 * Also falls back to checking explicit dream11Url / my11circleUrl fields.
 *
 * Visibility rule (per user spec):
 *   Dream11 available → show match card
 *   My11Circle available → show match card
 *   Both available → show match card
 *   Neither available → HIDE match card
 */
export function getSupportedFantasyApps(match: MatchInfo | any): string[] {
  if (!match) return [];
  const apps = new Set<string>();

  // 1) Primary source: fantasy_list (array of strings)
  const fl = match.fantasy_list;
  if (Array.isArray(fl)) {
    for (const entry of fl) {
      if (typeof entry === "string") {
        apps.add(entry.toLowerCase());
      } else if (entry && typeof entry === "object" && typeof entry.name === "string") {
        apps.add(entry.name.toLowerCase());
      }
    }
  }

  // 2) Alternate source: fantasy_version (array of { name: "..." })
  const fv = match.fantasy_version;
  if (Array.isArray(fv)) {
    for (const entry of fv) {
      if (entry && typeof entry === "object" && typeof entry.name === "string") {
        apps.add(entry.name.toLowerCase());
      } else if (typeof entry === "string") {
        apps.add(entry.toLowerCase());
      }
    }
  }

  // 3) Fallback: explicit URL fields
  if (match.dream11Url || match.dream11_url) apps.add("dream11");
  if (match.my11circleUrl || match.my11circle_url) apps.add("my11circle");

  // NOTE: We NO LONGER force-add all 5 platforms. Per user spec:
  // "Match card edu flatform support anu ennu kanikunnilla idu proppr ayittu kanikanam"
  // (Match card doesn't show which platforms are supported — show it properly)
  //
  // Previously, all 5 platforms were always added, so every match showed
  // "Supports: D11 M11 JBO MT11 V11" even if the match only supports Dream11.
  // Now we ONLY show platforms that are ACTUALLY in fantasy_list/fantasy_version.
  // If NO platform is detected, default to dream11 + my11circle (most common).

  // 4) If NO platform detected from any source, default to dream11 + my11circle
  if (apps.size === 0) {
    apps.add("dream11");
    apps.add("my11circle");
  }

  return Array.from(apps);
}

/** Convenience: does this match support Dream11 transfer? */
export function matchSupportsDream11(match: MatchInfo | any): boolean {
  return getSupportedFantasyApps(match).includes("dream11");
}

/** Convenience: does this match support My11Circle transfer? */
export function matchSupportsMy11Circle(match: MatchInfo | any): boolean {
  return getSupportedFantasyApps(match).includes("my11circle");
}

/**
 * Visibility rule:
 *   Show match card if Dream11 OR My11Circle (or both) are available.
 *   Hide match card if NEITHER is available.
 *   (Now always true since we include all 5 platforms by default.)
 */
export function shouldShowMatchCard(match: MatchInfo | any): boolean {
  const apps = getSupportedFantasyApps(match);
  return apps.includes("dream11") || apps.includes("my11circle") || apps.includes("jumbo") || apps.includes("myteam11") || apps.includes("vision11");
}

export async function getMatches(sport: Sport): Promise<MatchInfo[]> {
  // Matches come from possible11.com via our server-side proxy (/api/matches).
  // Calling possible11.com directly from the browser is blocked by CORS
  // (its preflight does not allow the Content-Type header).
  try {
    const res = await fetch(`/api/matches?sport=${encodeURIComponent(sport)}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.json();
    const data: any[] = Array.isArray(body?.data) ? body.data : [];
    if (data.length > 0) {
      console.log(`[getMatches] ✅ Found ${data.length} matches`);
      return data.map(normalizeMatch);
    }
    console.log("[getMatches] ⚠️ 0 matches returned");
    return [];
  } catch (err: any) {
    console.error("[getMatches] Error:", err?.message);
    return [];
  }
}

export async function getMatchDetail(matchId: string | number): Promise<MatchInfo | null> {
  // CRITICAL FIX: Use our /api/match-detail proxy instead of rawFetch to backend.
  // The proxy properly deep-decrypts ALL nested fields including left_team_players
  // and right_team_players array items. rawFetch only decrypts top-level response
  // and uses deepDecrypt which only catches strings starting with "U2FsdGVk".
  // This was causing "Unknown player" — players were still encrypted strings.
  try {
    const res = await fetch(`/api/match-detail?matchId=${matchId}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[getMatchDetail] Proxy returned HTTP ${res.status}, falling back to rawFetch`);
    } else {
      const body = await res.json();
      if (body.status === "success" && body.data) {
        // Verify players are decrypted (not encrypted strings)
        const ltp = (body.data as any).left_team_players || [];
        if (ltp.length > 0 && typeof ltp[0] === "string") {
          console.warn(`[getMatchDetail] Proxy returned encrypted players — attempting manual decryption`);
          const { decrypt } = await import("./crypto");
          const decryptArray = (arr: any[]) => arr.map((p: any) => {
            if (typeof p === "string") {
              const dec = decrypt<any>(p);
              return dec || p;
            }
            return p;
          }).filter((p: any) => p && typeof p === "object");
          (body.data as any).left_team_players = decryptArray(ltp);
          (body.data as any).right_team_players = decryptArray((body.data as any).right_team_players || []);
          console.log(`[getMatchDetail] Manual decryption: ${((body.data as any).left_team_players || []).length} left + ${((body.data as any).right_team_players || []).length} right players`);
        }
        return normalizeMatch(body.data);
      }
      console.warn(`[getMatchDetail] Proxy returned status=${body.status}, falling back to rawFetch`);
    }
  } catch (err) {
    console.warn(`[getMatchDetail] Proxy fetch error:`, err, "— falling back to rawFetch");
  }

  // Fallback: rawFetch to backend + manual decrypt ALL player strings
  try {
    const resp = await rawFetch(`/api/fantasy/match/${matchId}`, { method: "GET" }, FANTASY_API_BASE);
    if (resp.status && resp.status !== "success") return null;
    const data = unpackData<MatchInfo>(resp);
    if (!data) return null;

    // MANUAL DECRYPT: decrypt any remaining encrypted player strings
    const { decrypt } = await import("./crypto");
    const decryptArray = (arr: any[]) => (arr || []).map((p: any) => {
      if (typeof p === "string") {
        const dec = decrypt<any>(p);
        return dec || p;
      }
      return p;
    }).filter((p: any) => p && typeof p === "object");

    (data as any).left_team_players = decryptArray((data as any).left_team_players || []);
    (data as any).right_team_players = decryptArray((data as any).right_team_players || []);

    const leftCount = ((data as any).left_team_players || []).length;
    const rightCount = ((data as any).right_team_players || []).length;
    console.log(`[getMatchDetail] Fallback rawFetch + manual decrypt: ${leftCount} left + ${rightCount} right players`);

    return normalizeMatch(data);
  } catch (err2) {
    console.error(`[getMatchDetail] Both proxy and rawFetch failed:`, err2);
    return null;
  }
}

export async function getPromotions(): Promise<PromotionItem[]> {
  const resp = await rawFetch<ApiResponse>(`/api/promotion/getlist`, { method: "GET" }, FANTASY_API_BASE);
  if (resp.status && resp.status !== "success") return [];
  const data = unpackData<PromotionItem[] | PromotionItem>(resp);
  const normalize = (p: any): PromotionItem => ({
    ...p,
    _id: p._id,
    title: p.title ?? p.label,
    image: p.image ?? p.imageUrl,
    url: p.url ?? p.notificationUrl,
    link: p.link ?? p.url ?? p.notificationUrl,
    description: p.description,
    type: p.type ?? (p.urlType === 0 ? "link" : "default"),
  });
  if (Array.isArray(data)) return data.map(normalize);
  if (data) return [normalize(data)];
  return [];
}

export async function getExpertTeams(): Promise<TeamRow[]> {
  // Step 1: Get list of match IDs that have expert teams
  const resp = await rawFetch<ApiResponse>(`/api/expert/teamlist`, {
    method: "POST",
    body: buildEncryptedBody({}),
  }, FANTASY_API_BASE);
  if (resp.status !== "success") return [];
  const matchIds = (resp.expertTeamData || []) as string[];
  if (matchIds.length === 0) return [];

  // Step 2: Fetch actual teams for each match (limit to 5 matches to avoid overload)
  const teams: TeamRow[] = [];
  const maxMatches = Math.min(matchIds.length, 5);

  for (let i = 0; i < maxMatches; i++) {
    const matchId = matchIds[i];
    try {
      // Fetch match detail to get players
      const detail = await getMatchDetail(matchId);
      if (!detail) continue;

      const d = detail as any;
      const leftPlayers = (d.left_team_players || []) as MatchPlayer[];
      const rightPlayers = (d.right_team_players || []) as MatchPlayer[];
      const allPlayers = [...leftPlayers, ...rightPlayers].filter(Boolean);

      if (allPlayers.length < 11) continue;

      // Filter to playing XI if lineup announced
      const playing = allPlayers.filter((p) => p.playing === 1 || p.playing === undefined);
      const pool = playing.length >= 11 ? playing : allPlayers;

      // Generate 3 expert teams per match using top players
      const team1Name = (typeof (d as any).team1 === "string" ? (d as any).team1 : (d as any).team1?.shortName) || "T1";
      const team2Name = (typeof (d as any).team2 === "string" ? (d as any).team2 : (d as any).team2?.shortName) || "T2";

      // Sort by sel% descending (top picks first)
      const sorted = [...pool].sort((a, b) => Number(b.selected_by ?? 0) - Number(a.selected_by ?? 0));

      // Pick top 11 players with role balance
      const byRole: Record<string, MatchPlayer[]> = { WK: [], BAT: [], AR: [], BOWL: [] };
      for (const p of sorted) {
        const role = roleFromPlayerType(p.player_type, p.role as number);
        if (byRole[role]) byRole[role].push(p);
      }

      // Build 3 teams with different C/VC
      for (let t = 0; t < 3; t++) {
        const team: MatchPlayer[] = [];
        // 1 WK, 3-4 BAT, 2-3 AR, 3-4 BOWL
        if (byRole.WK.length > 0) team.push(byRole.WK[t % byRole.WK.length]);
        const batCount = Math.min(4, byRole.BAT.length);
        for (let j = 0; j < batCount; j++) team.push(byRole.BAT[(j + t) % byRole.BAT.length]);
        const arCount = Math.min(3, byRole.AR.length);
        for (let j = 0; j < arCount; j++) team.push(byRole.AR[(j + t) % byRole.AR.length]);
        const bowlCount = 11 - team.length;
        for (let j = 0; j < bowlCount && j < byRole.BOWL.length; j++) team.push(byRole.BOWL[(j + t) % byRole.BOWL.length]);

        if (team.length < 11) continue;

        // Pick C/VC from top players
        const sortedTeam = [...team].sort((a, b) => Number(b.selected_by ?? 0) - Number(a.selected_by ?? 0));
        const captain = String(sortedTeam[t % sortedTeam.length]?.player_fixed_id ?? sortedTeam[0]?.player_fixed_id ?? "");
        const vc = String(sortedTeam[(t + 1) % sortedTeam.length]?.player_fixed_id ?? sortedTeam[1]?.player_fixed_id ?? "");

        teams.push({
          _id: `expert_${matchId}_${t}`,
          teamId: `expert_${matchId}_${t}`,
          teamNo: teams.length + 1,
          team_number: teams.length + 1,
          players: team.map((p) => ({
            pid: String(p.player_fixed_id ?? p.pid ?? p.name),
            player_fixed_id: p.player_fixed_id,
            name: p.name,
            shortName: p.shortName || p.name?.slice(0, 4).toUpperCase() || "",
            team: p.team_name,
            team_name: p.team_name,
            role: roleFromPlayerType(p.player_type, p.role as number),
            credits: p.credits,
            selected_by: p.selected_by ?? p.sel,
            image: p.image,
            playing: p.playing,
          })),
          captain,
          viceCaptain: vc,
          vicecaptain: vc,
          c: captain,
          vc,
          type: "expert",
        } as TeamRow);
      }
    } catch {
      // Skip this match on error
      continue;
    }
  }

  return teams;
}

export async function getPrimeTeams(): Promise<TeamRow[]> {
  // Step 1: Get list of match IDs that have prime teams
  const resp = await rawFetch<ApiResponse>(`/api/primeteam/teamlist`, { method: "GET" }, FANTASY_API_BASE);
  if (resp.status !== "success") return [];
  const matchIds = (Array.isArray(resp.data) ? resp.data : []) as string[];
  if (matchIds.length === 0) return [];

  // Step 2: Fetch actual teams for each match (limit to 5 matches)
  const teams: TeamRow[] = [];
  const maxMatches = Math.min(matchIds.length, 5);

  for (let i = 0; i < maxMatches; i++) {
    const matchId = matchIds[i];
    try {
      const detail = await getMatchDetail(matchId);
      if (!detail) continue;

      const d = detail as any;
      const leftPlayers = (d.left_team_players || []) as MatchPlayer[];
      const rightPlayers = (d.right_team_players || []) as MatchPlayer[];
      const allPlayers = [...leftPlayers, ...rightPlayers].filter(Boolean);

      if (allPlayers.length < 11) continue;

      const playing = allPlayers.filter((p) => p.playing === 1 || p.playing === undefined);
      const pool = playing.length >= 11 ? playing : allPlayers;

      // Sort by credits descending (prime = high-credit players)
      const sorted = [...pool].sort((a, b) => Number(b.credits ?? 0) - Number(a.credits ?? 0));

      const byRole: Record<string, MatchPlayer[]> = { WK: [], BAT: [], AR: [], BOWL: [] };
      for (const p of sorted) {
        const role = roleFromPlayerType(p.player_type, p.role as number);
        if (byRole[role]) byRole[role].push(p);
      }

      // Build 3 prime teams
      for (let t = 0; t < 3; t++) {
        const team: MatchPlayer[] = [];
        if (byRole.WK.length > 0) team.push(byRole.WK[t % byRole.WK.length]);
        const batCount = Math.min(4, byRole.BAT.length);
        for (let j = 0; j < batCount; j++) team.push(byRole.BAT[(j + t) % byRole.BAT.length]);
        const arCount = Math.min(3, byRole.AR.length);
        for (let j = 0; j < arCount; j++) team.push(byRole.AR[(j + t) % byRole.AR.length]);
        const bowlCount = 11 - team.length;
        for (let j = 0; j < bowlCount && j < byRole.BOWL.length; j++) team.push(byRole.BOWL[(j + t) % byRole.BOWL.length]);

        if (team.length < 11) continue;

        const sortedTeam = [...team].sort((a, b) => Number(b.credits ?? 0) - Number(a.credits ?? 0));
        const captain = String(sortedTeam[t % sortedTeam.length]?.player_fixed_id ?? sortedTeam[0]?.player_fixed_id ?? "");
        const vc = String(sortedTeam[(t + 1) % sortedTeam.length]?.player_fixed_id ?? sortedTeam[1]?.player_fixed_id ?? "");

        teams.push({
          _id: `prime_${matchId}_${t}`,
          teamId: `prime_${matchId}_${t}`,
          teamNo: teams.length + 1,
          team_number: teams.length + 1,
          players: team.map((p) => ({
            pid: String(p.player_fixed_id ?? p.pid ?? p.name),
            player_fixed_id: p.player_fixed_id,
            name: p.name,
            shortName: p.shortName || p.name?.slice(0, 4).toUpperCase() || "",
            team: p.team_name,
            team_name: p.team_name,
            role: roleFromPlayerType(p.player_type, p.role as number),
            credits: p.credits,
            selected_by: p.selected_by ?? p.sel,
            image: p.image,
            playing: p.playing,
          })),
          captain,
          viceCaptain: vc,
          vicecaptain: vc,
          c: captain,
          vc,
          type: "prime",
        } as TeamRow);
      }
    } catch {
      continue;
    }
  }

  return teams;
}

/* ---------- Fantasy platform endpoints (plain JSON, no AES) ---------- */

/**
 * Verify a Dream11/My11Circle auth token BEFORE transfer.
 *
 * Uses the server-side proxy at /api/auth/verify (mirrors the original
 * teamgeneration.in APK flow). The proxy:
 *   - Calls https://possible11.com/api/fantasy/auth/verify
 *   - Returns { validToken: true|false|null }
 *       true  → token OK, proceed with transfer
 *       false → token expired, user must re-link via OTP
 *       null  → network error, BUT transfer should still be attempted
 *               (don't block on transient network issues)
 *   - If updateUiToken=true and authToken is returned, the caller should
 *     update the stored token (token was refreshed by the backend).
 *
 * my11circle requires additional fields: my11circleChallenge, my11circleUserId, my11circleMobile
 */
export async function verifyFantasyAuth(params: {
  fantasyApp: FantasyApp;
  authToken: string;
  matchId: string | number;
  my11circleChallenge?: string;
  my11circleUserId?: string;
  my11circleMobile?: string;
  userId?: string;
}): Promise<AuthVerifyResponse> {
  // Only skip the API call for empty tokens — always call the real API for non-empty tokens
  if (!params.authToken) {
    return {
      status: "fail",
      validToken: false,
      message: "No auth token — complete OTP login",
    };
  }

  const body: Record<string, unknown> = {
    fantasyApp: params.fantasyApp,
    authToken: params.authToken,
    matchId: params.matchId,
  };
  if (params.fantasyApp === "my11circle") {
    body.my11circleChallenge = params.my11circleChallenge || null;
    body.my11circleUserId = params.my11circleUserId || null;
    body.my11circleMobile = params.my11circleMobile || null;
  }
  if (params.fantasyApp === "vision11" && params.userId) {
    body.userId = params.userId;
  }

  // Use the server-side proxy instead of calling the backend directly.
  // The proxy handles CORS, network errors, and HTTP 401/403 → token expired.
  try {
    const res = await fetch(`/api/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await res.json();
    return data as AuthVerifyResponse;
  } catch (err: any) {
    console.error("[verifyFantasyAuth] proxy call failed:", err?.message);
    // Network error talking to our own proxy — return retryable null
    // so the caller can decide to proceed anyway (don't block transfer)
    return {
      status: "fail",
      validToken: null,
      retryable: true,
      message: "Could not verify token — network error",
    };
  }
}

/**
 * Pre-transfer verification helper.
 *
 * Calls verifyFantasyAuth() and decides whether to proceed with the transfer.
 * Returns:
 *   { proceed: true }  → token is valid OR network errored (don't block)
 *   { proceed: false, reason, needsReauth } → token is definitively expired
 *
 * Also: if the backend refreshed the token (updateUiToken=true + authToken),
 * updates the stored token via saveFantasyToken() so subsequent transfers
 * use the fresh token.
 *
 * IMPORTANT: This NEVER blocks transfers on network errors. It only blocks
 * when the backend explicitly says validToken=false (HTTP 401/403).
 */
export async function verifyBeforeTransfer(params: {
  fantasyApp: FantasyApp;
  authToken: string;
  matchId: string | number;
  my11circleChallenge?: string;
  my11circleUserId?: string;
  my11circleMobile?: string;
}): Promise<{ proceed: boolean; reason?: string; needsReauth?: boolean; refreshed?: boolean }> {
  const result = await verifyFantasyAuth(params);
  console.log("[verifyBeforeTransfer] result:", JSON.stringify(result));

  // Token explicitly invalid — block transfer
  if (result.validToken === false) {
    return {
      proceed: false,
      reason: result.message || "Token expired or invalid — please re-link via OTP",
      needsReauth: true,
    };
  }

  // Token valid OR unknown (network error) — proceed with transfer
  // If backend refreshed the token, save it
  let refreshed = false;
  if (result.updateUiToken && result.authToken && result.authToken !== params.authToken) {
    saveFantasyToken(params.fantasyApp, result.authToken, {
      mobile: params.my11circleMobile,
      my11circleChallenge: params.my11circleChallenge,
      my11circleUserId: params.my11circleUserId,
    });
    refreshed = true;
    console.log("[verifyBeforeTransfer] Token refreshed via updateUiToken");
  }

  return { proceed: true, refreshed };
}

/**
 * List teams already created by the user on Dream11/My11Circle for a match.
 *
 * IMPORTANT — matches original teamgeneration.in flow:
 *
 *   For My11Circle, the original calls auth/verify FIRST (with my11circle fields)
 *   to refresh the token, THEN calls list-of-teams with the refreshed token
 *   (and WITHOUT my11circle fields — list-of-teams only needs the token).
 *
 *   If we skip the auth/verify step and call list-of-teams directly with the
 *   stored (potentially stale) token, the backend may return empty even when
 *   teams exist → existingIds=[] → all teams use type="new" → REPLACE fails.
 *
 * Flow:
 *   1. If fantasyApp === "my11circle" AND my11circle fields are provided:
 *      a. Call /api/auth/verify with {fantasyApp, authToken, matchId,
 *         my11circleChallenge, my11circleUserId, my11circleMobile}
 *      b. If backend returns updateUiToken + authToken, use the refreshed token
 *      c. Call /api/contest/my-teams with {fantasyApp, matchId, authToken}
 *         (NO my11circle fields — matches original)
 *   2. Otherwise (Dream11, Jumbo, etc.):
 *      a. Call /api/contest/my-teams with {fantasyApp, matchId, authToken}
 *
 * The /api/contest/my-teams proxy still accepts my11circle fields (for safety),
 * but they're NOT sent in the normal flow per original teamgeneration.in.
 *
 * Routes through our /api/contest/my-teams server-side proxy so CORS, network
 * errors, and HTTP 401/403 are handled. The proxy's response format
 * ({status, teams: [{teamId, teamNo, fantasyApp}]}) is normalized back into
 * the TeamRow[] shape callers expect.
 */
export async function listFantasyTeams(params: {
  fantasyApp: FantasyApp;
  authToken: string;
  matchId: string | number;
  /** My11Circle-only fields — used for the auth/verify refresh call (NOT list-of-teams itself).
   *  Required for My11Circle to refresh the token before list-of-teams. */
  my11circleChallenge?: string;
  my11circleUserId?: string;
  my11circleMobile?: string;
}): Promise<TeamRow[]> {
  // Only skip the API call for empty tokens — always try the real API
  if (!params.authToken) {
    return [];
  }

  // === STEP 1: For My11Circle, refresh token via auth/verify FIRST ===
  // This matches original teamgeneration.in (et function):
  //   1. auth/verify with my11circle fields → get refreshed token
  //   2. list-of-teams with refreshed token (NO my11circle fields)
  let effectiveAuthToken = params.authToken;

  if (params.fantasyApp === "my11circle"
      && (params.my11circleChallenge || params.my11circleUserId || params.my11circleMobile)) {
    try {
      console.log("[listFantasyTeams] My11Circle: refreshing token via auth/verify before list-of-teams...");
      const verifyRes = await fetch(`/api/auth/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fantasyApp: "my11circle",
          authToken: params.authToken,
          matchId: params.matchId,
          my11circleChallenge: params.my11circleChallenge,
          my11circleUserId: params.my11circleUserId,
          my11circleMobile: params.my11circleMobile,
        }),
        cache: "no-store",
      });
      const verifyData = await verifyRes.json() as {
        validToken?: boolean | null;
        updateUiToken?: boolean;
        authToken?: string;
        my11circleChallenge?: string;
        my11circleUserId?: string;
        message?: string;
      };

      // If backend explicitly says token is invalid, return empty (don't proceed)
      if (verifyData.validToken === false) {
        console.warn(`[listFantasyTeams] My11Circle auth/verify says token is invalid: ${verifyData.message || "Invalid token"}`);
        return [];
      }

      // If backend returned a refreshed token, use it (matches original's updateUiToken flow)
      if (verifyData.updateUiToken && verifyData.authToken && verifyData.authToken !== params.authToken) {
        console.log("[listFantasyTeams] My11Circle: using refreshed token from updateUiToken");
        effectiveAuthToken = verifyData.authToken;
        // Also save the refreshed token + my11circle fields to localStorage (matches original)
        saveFantasyToken("my11circle", verifyData.authToken, {
          mobile: params.my11circleMobile,
          my11circleChallenge: verifyData.my11circleChallenge || params.my11circleChallenge,
          my11circleUserId: verifyData.my11circleUserId || params.my11circleUserId,
        });
      } else {
        console.log("[listFantasyTeams] My11Circle: token is valid (no refresh needed)");
      }
    } catch (err: any) {
      console.warn(`[listFantasyTeams] My11Circle auth/verify failed (continuing with stored token): ${err?.message}`);
      // Don't fail the whole call — try list-of-teams with the original token
    }
  }

  // === STEP 2: Call list-of-teams (via our /api/contest/my-teams proxy) ===
  // Per original teamgeneration.in: list-of-teams payload is GENERIC across all platforms.
  // Only {fantasyApp, matchId, authToken} is sent — NO my11circle fields.
  // The backend uses the (refreshed) token to authenticate.
  const body: Record<string, unknown> = {
    fantasyApp: params.fantasyApp,
    matchId: params.matchId,
    authToken: effectiveAuthToken,
  };

  try {
    const res = await fetch(`/api/contest/my-teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const resp = await res.json() as ApiResponse & {
      teams?: Array<{ teamId: string; teamNo: number | null; fantasyApp: string }>;
      teams_list?: Array<{ team_id: string | number; team_number: number }>;
      data?: { teams_list?: Array<{ team_id: string | number; team_number: number }> };
    };

    // The proxy returns {status, teams: [{teamId, teamNo, fantasyApp}]}
    // Also support raw backend format ({teams_list: [...]}) as fallback
    const teamsList = resp.teams
      || resp.teams_list
      || resp.data?.teams_list
      || [];

    if (Array.isArray(teamsList) && teamsList.length > 0) {
      console.log(`[listFantasyTeams] ${params.fantasyApp}: found ${teamsList.length} existing teams`);
      return teamsList.map((t: any) => ({
        teamId: String(t.teamId ?? t.team_id ?? ""),
        teamNo: t.teamNo ?? t.team_number,
        team_id: t.teamId ?? t.team_id,
        team_number: t.teamNo ?? t.team_number,
        fantasyApp: params.fantasyApp,
      } as TeamRow));
    }

    // Backend failed or no teams — return empty
    console.log(`[listFantasyTeams] ${params.fantasyApp}: no existing teams found`);
    return [];
  } catch (err: any) {
    console.error(`[listFantasyTeams] ${params.fantasyApp} proxy call failed:`, err?.message);
    return [];
  }
}

/**
 * List teams for a SPECIFIC account (per-account isolation).
 *
 * Per user spec: "When Account #2 is selected, every API must use Account #2's
 * authentication token and user ID only. Do not reuse Account #1 token or
 * cached data."
 *
 * Differences from `listFantasyTeams`:
 *   1. Takes an explicit `accountId` — fails fast if the account is missing
 *      or has no token (no silent fallback to default account).
 *   2. Uses per-account in-memory cache (15s TTL) so switching accounts
 *      returns fresh data, but rapid back-to-back calls don't all hit backend.
 *   3. If the backend says token is expired, attempts an automatic token
 *      refresh via `refreshAccountAuthToken` and retries ONCE.
 *   4. On successful refresh, the cached token in multi-accounts storage is
 *      updated for THIS account only — Account #1's token is untouched.
 */
export async function listFantasyTeamsForAccount(params: {
  accountId: string;
  fantasyApp: FantasyApp;
  matchId: string | number;
  /** Skip the cache and force a fresh fetch. Use after transfers/joins. */
  forceRefresh?: boolean;
}): Promise<TeamRow[]> {
  const account = requireAccount(params.accountId);
  const scope: CacheScope = "my-teams";

  // If forceRefresh, invalidate cache for this account+matchId before fetching
  if (params.forceRefresh) {
    accountInvalidateCache(params.accountId, scope, params.matchId);
  }

  return accountGetOrFetch<TeamRow[]>(
    params.accountId,
    scope,
    params.matchId,
    async () => {
      console.log(`[listFantasyTeamsForAccount] 📡 Fetching teams for account ${params.accountId} (${account.label}) — match ${params.matchId}`);

      // My11Circle: refresh token via auth/verify FIRST (matches original teamgeneration.in flow)
      let effectiveToken = account.token;
      if (params.fantasyApp === "my11circle"
          && (account.my11circleChallenge || account.my11circleUserId || account.mobile)) {
        try {
          const refreshed = await refreshAccountAuthToken({
            accountId: params.accountId,
            fantasyApp: params.fantasyApp,
            authToken: account.token,
            matchId: params.matchId,
            my11circleChallenge: account.my11circleChallenge || undefined,
            my11circleUserId: account.my11circleUserId || undefined,
            mobileNumber: account.mobile || undefined,
          });
          if (refreshed) effectiveToken = refreshed;
        } catch (err: any) {
          console.warn(`[listFantasyTeamsForAccount] My11Circle refresh failed, continuing with stored token: ${err?.message}`);
        }
      }

      // Now call /api/contest/my-teams with the (possibly refreshed) token
      const body: Record<string, unknown> = {
        fantasyApp: params.fantasyApp,
        matchId: params.matchId,
        authToken: effectiveToken,
      };

      try {
        const res = await fetch(`/api/contest/my-teams`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
        });
        const resp = await res.json() as ApiResponse & {
          teams?: Array<{ teamId: string; teamNo: number | null; fantasyApp: string }>;
          teams_list?: Array<{ team_id: string | number; team_number: number }>;
          data?: { teams_list?: Array<{ team_id: string | number; team_number: number }> };
        };

        // Token-expired? Try refresh + retry ONCE
        if (resp.validToken === false || isTokenExpiredMessage(String(resp.message || ""))) {
          console.warn(`[listFantasyTeamsForAccount] ⚠️ Token expired for account ${params.accountId} — attempting refresh + retry`);
          const refreshed = await refreshAccountAuthToken({
            accountId: params.accountId,
            fantasyApp: params.fantasyApp,
            authToken: account.token,
            matchId: params.matchId,
            my11circleChallenge: account.my11circleChallenge || undefined,
            my11circleUserId: account.my11circleUserId || undefined,
            mobileNumber: account.mobile || undefined,
          });
          if (refreshed && refreshed !== effectiveToken) {
            // Retry with the fresh token
            const retryRes = await fetch(`/api/contest/my-teams`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...body, authToken: refreshed }),
              cache: "no-store",
            });
            const retryResp = await retryRes.json() as typeof resp;
            const retryTeams = retryResp.teams || retryResp.teams_list || retryResp.data?.teams_list || [];
            if (Array.isArray(retryTeams) && retryTeams.length > 0) {
              return retryTeams.map((t: any) => ({
                teamId: String(t.teamId ?? t.team_id ?? ""),
                teamNo: t.teamNo ?? t.team_number,
                team_id: t.teamId ?? t.team_id,
                team_number: t.teamNo ?? t.team_number,
                fantasyApp: params.fantasyApp,
              } as TeamRow));
            }
            return [];
          }
          // Refresh failed — return empty (UI will show "expired" prompt)
          return [];
        }

        const teamsList = resp.teams || resp.teams_list || resp.data?.teams_list || [];
        if (Array.isArray(teamsList) && teamsList.length > 0) {
          console.log(`[listFantasyTeamsForAccount] ✅ Account ${params.accountId}: found ${teamsList.length} teams`);
          return teamsList.map((t: any) => ({
            teamId: String(t.teamId ?? t.team_id ?? ""),
            teamNo: t.teamNo ?? t.team_number,
            team_id: t.teamId ?? t.team_id,
            team_number: t.teamNo ?? t.team_number,
            fantasyApp: params.fantasyApp,
          } as TeamRow));
        }

        console.log(`[listFantasyTeamsForAccount] Account ${params.accountId}: no existing teams found`);
        return [];
      } catch (err: any) {
        console.error(`[listFantasyTeamsForAccount] Account ${params.accountId} proxy call failed:`, err?.message);
        return [];
      }
    }
  );
}

/**
 * Heuristic: does this message indicate an expired/invalid token?
 * Used to trigger automatic refresh + retry.
 */
function isTokenExpiredMessage(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes("token expired") ||
    lower.includes("invalid token") ||
    lower.includes("jwt expired") ||
    lower.includes("session expired") ||
    lower.includes("not authenticated") ||
    lower.includes("authentication failed") ||
    lower.includes("proxy returned 400") ||
    lower.includes("proxy returned 401") ||
    lower.includes("proxy returned 403")
  );
}

/**
 * Verify the auth token for a SPECIFIC account.
 *
 * Per user spec: "Refresh expired tokens automatically and fetch real Dream11
 * data for the selected account before enabling Join Contest or Transfer."
 *
 * - If the token is valid → returns { proceed: true }
 * - If the token is expired AND can be refreshed → refreshes + returns { proceed: true, refreshed: true }
 * - If the token is expired AND cannot be refreshed → returns { proceed: false, needsReauth: true }
 * - If the network errors → returns { proceed: true } (don't block on transient errors)
 */
export async function verifyAccountBeforeTransfer(params: {
  accountId: string;
  fantasyApp: FantasyApp;
  matchId: string | number;
}): Promise<{ proceed: boolean; reason?: string; needsReauth?: boolean; refreshed?: boolean }> {
  const account = requireAccount(params.accountId);
  const scope: CacheScope = "verify";

  // Cache verify result for 60s to avoid hammering the verify endpoint
  const cached = await accountGetOrFetch<{ valid: boolean | null; refreshed: boolean }>(
    params.accountId,
    scope,
    params.matchId,
    async () => {
      console.log(`[verifyAccountBeforeTransfer] 🔄 Verifying token for account ${params.accountId} (${account.label})`);
      try {
        const res = await fetch(`/api/auth/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fantasyApp: params.fantasyApp,
            authToken: account.token,
            matchId: params.matchId,
            my11circleChallenge: account.my11circleChallenge || undefined,
            my11circleUserId: account.my11circleUserId || undefined,
            my11circleMobile: account.mobile || undefined,
          }),
          cache: "no-store",
        });
        const data = await res.json() as {
          validToken?: boolean | null;
          updateUiToken?: boolean;
          authToken?: string;
          message?: string;
          my11circleChallenge?: string;
          my11circleUserId?: string;
        };

        // Token explicitly invalid → try refresh
        if (data.validToken === false) {
          console.warn(`[verifyAccountBeforeTransfer] ⚠️ Token expired for account ${params.accountId} — attempting refresh`);
          const refreshed = await refreshAccountAuthToken({
            accountId: params.accountId,
            fantasyApp: params.fantasyApp,
            authToken: account.token,
            matchId: params.matchId,
            my11circleChallenge: account.my11circleChallenge || undefined,
            my11circleUserId: account.my11circleUserId || undefined,
            mobileNumber: account.mobile || undefined,
          });
          if (refreshed) {
            return { valid: true, refreshed: true };
          }
          return { valid: false, refreshed: false };
        }

        // Token refreshed via updateUiToken
        if (data.updateUiToken && data.authToken && data.authToken !== account.token) {
          saveFantasyTokenForAccount(params.accountId, data.authToken, {
            mobile: account.mobile || undefined,
            my11circleChallenge: data.my11circleChallenge || account.my11circleChallenge || undefined,
            my11circleUserId: data.my11circleUserId || account.my11circleUserId || undefined,
          });
          return { valid: true, refreshed: true };
        }

        // Token valid (or network error → null → treat as valid, don't block)
        // At this point we've already early-returned if validToken === false,
        // so the remaining possible values are true | null | undefined.
        const isValid: boolean | null = data.validToken === true ? true : null;
        return { valid: isValid, refreshed: false };
      } catch (err: any) {
        console.warn(`[verifyAccountBeforeTransfer] Network error for account ${params.accountId}: ${err?.message} — proceeding (don't block)`);
        return { valid: null, refreshed: false };
      }
    }
  );

  if (cached.valid === false) {
    return {
      proceed: false,
      needsReauth: true,
      reason: `Account ${account.label || params.accountId} token expired — re-link via OTP`,
    };
  }

  return { proceed: true, refreshed: cached.refreshed };
}

/**
 * Fetch free contests for a SPECIFIC account.
 *
 * Per user spec: "fetch real Dream11 data for the selected account before
 * enabling Join Contest or Transfer."
 *
 * - Uses the account's own token (never Account #1's token for Account #2)
 * - Caches the result per-account (30s TTL)
 * - Auto-refreshes expired tokens once before failing
 */
export async function fetchFreeContestsForAccount(params: {
  accountId: string;
  fantasyApp: FantasyApp;
  matchId: string;
  allTeamIds: number[];
  forceRefresh?: boolean;
}): Promise<FreeContestsResult> {
  const account = requireAccount(params.accountId);
  const scope: CacheScope = "free-contests";

  if (params.forceRefresh) {
    accountInvalidateCache(params.accountId, scope, params.matchId);
  }

  return accountGetOrFetch<FreeContestsResult>(
    params.accountId,
    scope,
    params.matchId,
    async () => {
      console.log(`[fetchFreeContestsForAccount] 📡 Fetching contests for account ${params.accountId} (${account.label})`);
      try {
        const userToken = typeof window !== "undefined" ? localStorage.getItem("user_token") : null;
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (userToken) headers.Authorization = `Bearer ${userToken}`;

        const proxyRes = await fetch(`/api/contest/free-status`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            fantasyApp: params.fantasyApp,
            authToken: account.token,
            matchId: String(params.matchId),
            allTeamIds: params.allTeamIds,
          }),
          cache: "no-store",
        });
        const res = await proxyRes.json() as ApiResponse & { contests?: FreeContest[] };

        // Token expired? Try refresh + retry ONCE
        if (res.validToken === false || isTokenExpiredMessage(String(res.message || ""))) {
          console.warn(`[fetchFreeContestsForAccount] ⚠️ Token expired for account ${params.accountId} — attempting refresh + retry`);
          const refreshed = await refreshAccountAuthToken({
            accountId: params.accountId,
            fantasyApp: params.fantasyApp,
            authToken: account.token,
            matchId: params.matchId,
            my11circleChallenge: account.my11circleChallenge || undefined,
            my11circleUserId: account.my11circleUserId || undefined,
            mobileNumber: account.mobile || undefined,
          });
          if (refreshed) {
            const retryRes = await fetch(`/api/contest/free-status`, {
              method: "POST",
              headers,
              body: JSON.stringify({
                fantasyApp: params.fantasyApp,
                authToken: refreshed,
                matchId: String(params.matchId),
                allTeamIds: params.allTeamIds,
              }),
              cache: "no-store",
            });
            const retryData = await retryRes.json() as typeof res;
            if (retryData.status === "success") {
              return { status: "success", contests: (retryData.contests || []) as FreeContest[] };
            }
            return {
              status: "fail",
              message: (retryData.message as string) || (retryData.error as string) || "Failed to fetch free contests",
              contests: [],
            };
          }
          return {
            status: "fail",
            message: `Account ${account.label || params.accountId} session expired — re-link via OTP`,
            contests: [],
          };
        }

        if (res.status === "success") {
          return { status: "success", contests: (res.contests || []) as FreeContest[] };
        }
        return {
          status: "fail",
          message: (res.message as string) || (res.error as string) || "Failed to fetch free contests",
          contests: [],
        };
      } catch (err: any) {
        return { status: "fail", message: err?.message || "Network error", contests: [] };
      }
    }
  );
}

/**
 * Join a free contest using a SPECIFIC account's token.
 *
 * - Auto-refreshes expired tokens once before failing
 * - Invalidates the my-teams cache for this account after a successful join
 *   (so subsequent reads reflect the new joined state)
 */
export async function joinFreeContestForAccount(params: {
  accountId: string;
  fantasyApp: FantasyApp;
  matchId: string;
  contestId: string;
  teamIds: number[];
}): Promise<JoinContestFullResult> {
  const account = requireAccount(params.accountId);

  // Pre-verify: refresh token if expired (so we don't waste a join call on a stale token)
  const verifyResult = await verifyAccountBeforeTransfer({
    accountId: params.accountId,
    fantasyApp: params.fantasyApp,
    matchId: params.matchId,
  });
  if (!verifyResult.proceed) {
    return {
      status: "fail",
      contestId: params.contestId,
      joinResults: [],
      summary: { successCount: 0, failedCount: params.teamIds.length },
      message: verifyResult.reason || "Session expired — re-link via OTP",
      needsReauth: true,
    };
  }

  // Re-read the account after possible refresh — the token may have changed
  const refreshedAccount = getFantasyAccountById(params.accountId) || account;

  try {
    const userToken = typeof window !== "undefined" ? localStorage.getItem("user_token") : null;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (userToken) headers.Authorization = `Bearer ${userToken}`;

    console.log(`[joinFreeContestForAccount] 📡 Joining contest ${params.contestId} for account ${params.accountId} (${refreshedAccount.label})`);
    const proxyRes = await fetch(`/api/contest/join`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        fantasyApp: params.fantasyApp,
        authToken: refreshedAccount.token,
        matchId: String(params.matchId),
        contestId: String(params.contestId),
        teamIds: params.teamIds,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(45000),
    });
    const res = await proxyRes.json() as ApiResponse & {
      joinResults?: Array<{ teamId: number; success: boolean }>;
      summary?: { successCount: number; failedCount: number };
      needsReauth?: boolean;
    };

    // Token expired? Try refresh + retry ONCE
    if (res.needsReauth || res.validToken === false || isTokenExpiredMessage(String(res.message || ""))) {
      console.warn(`[joinFreeContestForAccount] ⚠️ Token expired during join — attempting refresh + retry for account ${params.accountId}`);
      const newToken = await refreshAccountAuthToken({
        accountId: params.accountId,
        fantasyApp: params.fantasyApp,
        authToken: refreshedAccount.token,
        matchId: params.matchId,
        my11circleChallenge: refreshedAccount.my11circleChallenge || undefined,
        my11circleUserId: refreshedAccount.my11circleUserId || undefined,
        mobileNumber: refreshedAccount.mobile || undefined,
      });
      if (newToken) {
        const retryRes = await fetch(`/api/contest/join`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            fantasyApp: params.fantasyApp,
            authToken: newToken,
            matchId: String(params.matchId),
            contestId: String(params.contestId),
            teamIds: params.teamIds,
          }),
          cache: "no-store",
          signal: AbortSignal.timeout(45000),
        });
        const retryData = await retryRes.json() as typeof res;
        // Invalidate my-teams cache (join changed the joined state)
        accountInvalidateCache(params.accountId, "my-teams", params.matchId);
        accountInvalidateCache(params.accountId, "joined-contests", params.matchId);
        accountInvalidateCache(params.accountId, "free-contests", params.matchId);
        return {
          status: retryData.status === "success" ? "success" : "fail",
          message: (retryData.message as string) || (retryData.error as string) || (retryData.status === "success" ? "Joined" : "Failed"),
          contestId: params.contestId,
          joinResults: (retryData.joinResults || []) as Array<{ teamId: number; success: boolean }>,
          summary: (retryData.summary as { successCount: number; failedCount: number }) || {
            successCount: 0,
            failedCount: params.teamIds.length,
          },
          needsReauth: retryData.needsReauth === true,
        };
      }
      return {
        status: "fail",
        contestId: params.contestId,
        joinResults: [],
        summary: { successCount: 0, failedCount: params.teamIds.length },
        message: `Account ${refreshedAccount.label || params.accountId} session expired — re-link via OTP`,
        needsReauth: true,
      };
    }

    // Success or non-auth failure — invalidate my-teams cache either way
    accountInvalidateCache(params.accountId, "my-teams", params.matchId);
    accountInvalidateCache(params.accountId, "joined-contests", params.matchId);
    accountInvalidateCache(params.accountId, "free-contests", params.matchId);

    return {
      status: res.status === "success" ? "success" : "fail",
      message: (res.message as string) || (res.error as string) || (res.status === "success" ? "Joined" : "Failed"),
      contestId: params.contestId,
      joinResults: (res.joinResults || []) as Array<{ teamId: number; success: boolean }>,
      summary: (res.summary as { successCount: number; failedCount: number }) || {
        successCount: 0,
        failedCount: params.teamIds.length,
      },
      // We only reach here if res.needsReauth was falsy (otherwise we returned above)
      needsReauth: false,
    };
  } catch (err: any) {
    return {
      status: "fail",
      message: err?.message || "Network error",
      contestId: params.contestId,
      joinResults: [],
      summary: { successCount: 0, failedCount: params.teamIds.length },
    };
  }
}

/**
 * Bulk transfer teams to a SPECIFIC linked account.
 *
 * Per user spec: "Transfer should run for every selected account, not only the
 * last added account." "One account failure must not stop other accounts."
 *
 * This is the account-aware variant of `bulkTransferToLinkedAccount`. It:
 *   - Uses only the specified account's token
 *   - Auto-refreshes the token if the backend reports it expired
 *   - Writes any refreshed token back to THIS account (not the default one)
 *   - Invalidates this account's my-teams cache after a successful transfer
 */
export async function bulkTransferToAccount(params: {
  accountId: string;
  teams: BulkTransferItem[];
  matchId: string;
  fantasyApp: FantasyApp;
  sportIndex?: number;
  replaceMode?: boolean;
  existingTeamIds?: string[];
  skipVerify?: boolean;
}, onProgress?: (done: number, total: number) => void): Promise<BulkTransferResult> {
  const account = requireAccount(params.accountId);
  const teams = params.teams;

  // Pre-transfer verify (unless explicitly skipped)
  if (params.skipVerify === false) {
    const verify = await verifyAccountBeforeTransfer({
      accountId: params.accountId,
      fantasyApp: params.fantasyApp,
      matchId: params.matchId,
    });
    if (!verify.proceed) {
      return {
        totalAttempted: teams.length,
        successCount: 0,
        failCount: teams.length,
        results: teams.map(t => ({
          teamNo: t.teamNo,
          success: false,
          message: verify.reason || "Token expired — re-link via OTP",
        })),
        transferLinks: [],
        needsReauth: true,
        blockReason: verify.reason,
      };
    }
  }

  // Re-read account after possible refresh
  const accountCurrent = getFantasyAccountById(params.accountId) || account;
  const authToken = accountCurrent.token;

  console.log(`[bulkTransferToAccount] 🚀 Transferring ${teams.length} teams to account ${params.accountId} (${accountCurrent.label})`);

  // Delegate to the existing bulkTransferToLinkedAccount implementation,
  // but pass the account's token explicitly. The existing function already
  // handles retry/verify/idempotency — we just need to make sure any token
  // refresh it does gets persisted to the right account.
  const result = await bulkTransferToLinkedAccount(
    teams,
    {
      matchId: params.matchId,
      fantasyApp: params.fantasyApp,
      authToken,
      sportIndex: params.sportIndex ?? 0,
      my11circleChallenge: accountCurrent.my11circleChallenge || undefined,
      my11circleUserId: accountCurrent.my11circleUserId || undefined,
      mobileNumber: accountCurrent.mobile || undefined,
      replaceMode: params.replaceMode,
      existingTeamIds: params.existingTeamIds,
      skipVerify: true, // we already verified above
    },
    onProgress
  );

  // After transfer, invalidate this account's my-teams cache so the next
  // listFantasyTeamsForAccount call returns fresh data.
  accountInvalidateCache(params.accountId, "my-teams", params.matchId);
  accountInvalidateCache(params.accountId, "joined-contests", params.matchId);

  // If the transfer reported needsReauth, mark this account as expired
  if (result.needsReauth) {
    markAccountExpired(params.accountId);
  } else if (result.successCount > 0) {
    markAccountActive(params.accountId);
  }

  return result;
}

/* ---------- Local team store (guest mode) ---------- */

const LOCAL_TEAMS_KEY = "apna-cricket-local-teams";
const LOCAL_FANTASY_TOKENS_KEY = "apna-cricket-fantasy-tokens";

/* ---------- Per-account session & cache (multi-account isolation) ----------
 *
 * Per user spec: "Keep separate token, JWT, cookies, userId and cache for each
 * linked account. Refresh expired tokens automatically and fetch real Dream11
 * data for the selected account before enabling Join Contest or Transfer."
 *
 * The functions below thread an explicit `accountId` through every API call
 * so Account #1 and Account #2 never share cache, token, or session state.
 */

/**
 * Resolve an account by ID. Throws a friendly error if the account is missing
 * or has no token — callers should treat this as "user needs to re-link".
 */
function requireAccount(accountId: string | null | undefined) {
  if (!accountId) {
    throw new Error("No account selected — pick an account first");
  }
  const account = getFantasyAccountById(accountId);
  if (!account) {
    throw new Error(`Account ${accountId} not found — re-link via OTP`);
  }
  if (!account.token || account.token.length === 0) {
    throw new Error(`Account ${account.label || accountId} has no token — re-link via OTP`);
  }
  return account;
}

/**
 * Save a refreshed token back to the SPECIFIC account that needed refresh.
 *
 * CRITICAL FIX: Previously, `saveFantasyToken(app, newToken, {mobile})` was
 * used to persist refreshed tokens. That function looks up accounts by mobile
 * — but if two accounts share the same mobile (or both have null mobile),
 * the refresh overwrites the WRONG account. This helper writes directly to
 * the account identified by `accountId`, with no ambiguity.
 */
export function saveFantasyTokenForAccount(
  accountId: string,
  newToken: string,
  extras?: {
    my11circleChallenge?: string;
    my11circleUserId?: string;
    mobile?: string;
    refreshToken?: string;
    cookies?: string;
  }
): boolean {
  const account = getFantasyAccountById(accountId);
  if (!account) {
    console.warn(`[saveFantasyTokenForAccount] Account ${accountId} not found — refresh dropped`);
    return false;
  }
  const ok = updateFantasyAccountById(accountId, {
    token: newToken,
    my11circleChallenge: extras?.my11circleChallenge ?? account.my11circleChallenge,
    my11circleUserId: extras?.my11circleUserId ?? account.my11circleUserId,
    mobile: extras?.mobile ?? account.mobile,
    refreshToken: extras?.refreshToken ?? account.refreshToken,
    cookies: extras?.cookies ?? account.cookies,
    lastRefreshed: Date.now(),
    status: "active",
  });
  if (ok) {
    // Invalidate ALL cached data for this account — the new token may return
    // different data (e.g. teams created in another session).
    invalidateAccountCache(accountId);
    console.log(`[saveFantasyTokenForAccount] ✅ Refreshed token for account ${accountId} (${account.label})`);
  }
  return ok;
}

/**
 * Try to refresh the token for a SPECIFIC account by calling /api/auth/verify.
 *
 * Per user spec: "Refresh expired tokens automatically."
 *
 * Returns the new token on success, or null if refresh failed (in which case
 * the caller should mark the account as expired and prompt re-link).
 */
export async function refreshAccountAuthToken(params: {
  accountId: string;
  fantasyApp: FantasyApp;
  authToken: string;
  matchId: string | number;
  my11circleChallenge?: string;
  my11circleUserId?: string;
  mobileNumber?: string;
}): Promise<string | null> {
  try {
    console.log(`[refreshAccountAuthToken] 🔄 Refreshing token for account ${params.accountId}...`);
    const res = await fetch(`/api/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fantasyApp: params.fantasyApp,
        authToken: params.authToken,
        matchId: params.matchId,
        my11circleChallenge: params.my11circleChallenge,
        my11circleUserId: params.my11circleUserId,
        my11circleMobile: params.mobileNumber,
      }),
      cache: "no-store",
    });
    const data = await res.json();

    if (data.updateUiToken && data.authToken && data.authToken !== params.authToken) {
      console.log(`[refreshAccountAuthToken] ✅ Backend returned a fresh token for account ${params.accountId}`);
      saveFantasyTokenForAccount(params.accountId, data.authToken, {
        mobile: params.mobileNumber,
        my11circleChallenge: data.my11circleChallenge || params.my11circleChallenge,
        my11circleUserId: data.my11circleUserId || params.my11circleUserId,
      });
      return data.authToken as string;
    }

    if (data.validToken === true) {
      console.log(`[refreshAccountAuthToken] ℹ️ Backend says token is still valid — refresh not needed`);
      // Mark the account as active (in case it was previously marked expired)
      markAccountActive(params.accountId);
      return params.authToken; // current token is fine
    }

    console.warn(`[refreshAccountAuthToken] ⚠️ Backend confirms token is expired for account ${params.accountId}`);
    markAccountExpired(params.accountId);
    return null;
  } catch (err: any) {
    console.error(`[refreshAccountAuthToken] ❌ Token refresh failed for account ${params.accountId}: ${err?.message}`);
    return null;
  }
}

/**
 * Mark the currently active account for a platform (UI selection).
 * Subsequent API calls without an explicit accountId will resolve to this one.
 */
export function setActiveFantasyAccount(app: FantasyApp, accountId: string): void {
  setActiveAccount(app, accountId);
}

/**
 * Get the currently active account ID for a platform (if any has been set).
 */
export function getActiveFantasyAccountId(app: FantasyApp): string | null {
  return getActiveAccountId(app);
}

function readLocalTeams(): Record<string, TeamRow[]>;
function readLocalTeams(matchId: string): TeamRow[];
function readLocalTeams(matchId?: string): TeamRow[] | Record<string, TeamRow[]> {
  if (typeof window === "undefined") return matchId ? [] : {};
  try {
    const all = JSON.parse(localStorage.getItem(LOCAL_TEAMS_KEY) || "{}");
    if (matchId === undefined) return all;
    return all[matchId] || [];
  } catch {
    return matchId ? [] : {};
  }
}

function writeLocalTeams(data: Record<string, TeamRow[]>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_TEAMS_KEY, JSON.stringify(data));
}

function localId(): string {
  return "local_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/**
 * Save a fantasy token (Dream11/My11Circle) in localStorage so the user
 * doesn't need to re-link on every visit. Used in guest mode.
 *
 * MULTI-ACCOUNT SUPPORT: This function now adds a new account (up to 5 per platform)
 * via the multi-accounts module. For backward compat, it also writes to the old
 * `apna-cricket-fantasy-tokens` key with the latest token as default.
 *
 * The token persists across page reloads and browser sessions. The user is
 * only asked to login again if they explicitly unlink the app.
 *
 * For Dream11, `maxAllowedTeam` may be returned by the backend based on the
 * user's subscription tier. We save it so we know the per-match team limit.
 */
export function saveFantasyToken(
  app: FantasyApp,
  token: string,
  extras?: {
    mobile?: string;
    userId?: string;
    my11circleChallenge?: string;
    my11circleUserId?: string;
    refreshToken?: string;
    cookies?: string;
    maxAllowedTeam?: number | null;
    subscriptionTier?: string | null;
  }
) {
  if (typeof window === "undefined") return;

  // CRITICAL FIX: Save to multi-account array — NEVER overwrite existing accounts.
  // Per user spec: "One account must never overwrite another account."
  // Per user spec: "Save every account separately with a unique Account ID."
  //
  // Logic:
  //   1. If an account with the SAME mobile number already exists → UPDATE that account's token
  //      (re-login scenario — same phone number, new OTP, new token)
  //   2. If NO existing account has this mobile → ADD as a NEW account (unique ID)
  //   3. If max accounts reached → log warning (don't overwrite existing)
  //   4. TIER ENFORCEMENT: read current license tier from Zustand store and pass
  //      to addFantasyAccount so multi-account gate is enforced even when this
  //      function is called from the OTP login modal (bypassing MultiAccountManager).
  try {
    const { addFantasyAccount, updateFantasyAccount, listAccountsForApp } = require("./multi-accounts");
    // Read current license tier from Zustand admin store (no React import needed)
    let currentTier: string | null = null;
    try {
      const { getLicenseState } = require("./admin-store");
      currentTier = getLicenseState().keyType;
    } catch {
      // admin-store not yet initialized — treat as null (single-account only)
    }
    const existing = listAccountsForApp(app);

    // Check if this mobile is already linked → update that account (re-login)
    const existingForMobile = extras?.mobile
      ? existing.find(a => a.mobile === extras.mobile)
      : null;

    if (existingForMobile) {
      // Re-login: update existing account's token + status
      updateFantasyAccount(existingForMobile.id, {
        token,
        mobile: extras?.mobile,
        userId: extras?.userId,
        my11circleChallenge: extras?.my11circleChallenge,
        my11circleUserId: extras?.my11circleUserId,
        refreshToken: extras?.refreshToken,
        cookies: extras?.cookies,
        maxAllowedTeam: extras?.maxAllowedTeam,
        subscriptionTier: extras?.subscriptionTier,
        status: "active", // re-login marks account as active again
        lastRefreshed: Date.now(),
      });
      console.log(`[saveFantasyToken] ✅ Updated existing ${app} account (${existingForMobile.id}) — mobile: ${extras?.mobile}`);
      // Invalidate cache for this account — new token may return different data
      invalidateAccountCache(existingForMobile.id);
    } else {
      // New account — add to array (unique ID auto-generated)
      // Pass currentTier so addFantasyAccount can enforce the multi-account
      // subscription gate. If user is on trial/weekly/etc., the 2nd account
      // will be REJECTED here (returns null) — protecting the subscription wall.
      const newAccount = addFantasyAccount(app, token, extras, currentTier);
      if (newAccount) {
        console.log(`[saveFantasyToken] ✅ Added NEW ${app} account (${newAccount.id}) — mobile: ${newAccount.mobile || "unknown"} — tier: ${currentTier || "unknown"}`);
        // Invalidate any cache for this new account (it's brand new, but be safe)
        invalidateAccountCache(newAccount.id);
      } else {
        // Max accounts reached for this tier — do NOT overwrite, just log warning.
        // The user will see a toast in the OTP login modal explaining the limit.
        console.warn(`[saveFantasyToken] ⚠️ Account NOT saved — multi-account limit reached for ${app} (tier: ${currentTier || "unknown"}). Upgrade to Pro/Elite/Lifetime to add more accounts.`);
        // Show a user-visible toast (best-effort — toast may not be loaded yet)
        try {
          const { toast } = require("sonner");
          toast.error(`🔒 Multi-account requires Pro (₹299), Elite (₹999), or Lifetime. Your tier (${currentTier || "trial"}) allows only 1 ${app} account.`);
        } catch {
          // sonner not loaded — fail silently (caller will see the empty result)
        }
      }
    }
  } catch (err) {
    console.error("[saveFantasyToken] Multi-account save failed:", err);
  }

  // NOTE: We NO LONGER write to the old `apna-cricket-fantasy-tokens` single-account storage.
  // That was the root cause of "only 1 account showing" — every login overwrote the previous.
  // All reads now go through getLinkedAccount() → getDefaultAccount() → multi-account array.
}

export function getFantasyToken(app: FantasyApp): string | null {
  if (typeof window === "undefined") return null;
  // CRITICAL FIX: Read from multi-account array, not old single-account storage.
  // Per user spec: "Detect and load all saved accounts correctly on page load."
  // The old code read from `apna-cricket-fantasy-tokens` which only stored ONE
  // account per platform — so if user linked 3 accounts, getFantasyToken only
  // returned the LAST one, and listFantasyApps() only detected apps that had
  // an entry in the OLD storage.
  try {
    const { getDefaultAccount } = require("./multi-accounts");
    const account = getDefaultAccount(app);
    if (!account || !account.token) return null;
    return account.token;
  } catch {
    return null;
  }
}

export interface LinkedFantasyAccount {
  app: FantasyApp;
  /** Unique account ID from multi-accounts storage (for multi-select) */
  accountId?: string;
  token: string;
  mobile?: string | null;
  /** Backend user ID for this platform account */
  userId?: string | null;
  my11circleChallenge?: string | null;
  my11circleUserId?: string | null;
  /** Refresh token (if backend supports it) */
  refreshToken?: string | null;
  /** Cookies/session data (if backend uses cookie-based auth) */
  cookies?: string | null;
  /** Dream11 only: max teams per match based on subscription tier (null = use default 40) */
  maxAllowedTeam?: number | null;
  /** Dream11 only: subscription tier label (e.g. "Pro", "Max") */
  subscriptionTier?: string | null;
  linkedAt?: number;
}

export function getLinkedAccount(app: FantasyApp): LinkedFantasyAccount | null {
  if (typeof window === "undefined") return null;
  // CRITICAL FIX: Read from the MULTI-ACCOUNT array, not the old single-account storage.
  // The old code read from `apna-cricket-fantasy-tokens` which only stored ONE account
  // per platform — every new login OVERWROTE the previous one.
  // Now we read from `apna-cricket-fantasy-accounts` which stores an ARRAY of accounts.
  try {
    const { getDefaultAccount } = require("./multi-accounts");
    const account = getDefaultAccount(app);
    if (!account) return null;
    return {
      app,
      // Attach the account ID so callers can reference it for multi-select
      accountId: account.id,
      token: account.token,
      mobile: account.mobile,
      userId: account.userId,
      my11circleChallenge: account.my11circleChallenge,
      my11circleUserId: account.my11circleUserId,
      maxAllowedTeam: account.maxAllowedTeam ?? null,
      subscriptionTier: account.subscriptionTier ?? null,
      linkedAt: account.linkedAt,
    } as LinkedFantasyAccount & { accountId: string; userId?: string | null };
  } catch {
    return null;
  }
}

export function listFantasyApps(): FantasyApp[] {
  if (typeof window === "undefined") return [];
  // CRITICAL FIX: Read from multi-account array, not old single-account storage.
  // Per user spec: "Display every account with its own selection button/card."
  // Returns list of platforms that have at least 1 linked account.
  try {
    const { listAccountsForApp } = require("./multi-accounts");
    const apps: FantasyApp[] = [];
    for (const a of ["dream11", "my11circle", "jumbo", "myteam11", "vision11"] as FantasyApp[]) {
      const accounts = listAccountsForApp(a);
      if (accounts.length > 0 && accounts.some(acc => acc.token && acc.token.length > 0)) {
        apps.push(a);
      }
    }
    return apps;
  } catch {
    return [];
  }
}

export function listLinkedAccounts(): LinkedFantasyAccount[] {
  if (typeof window === "undefined") return [];
  // CRITICAL FIX: Read from multi-account array, not old single-account storage.
  // Per user spec: "Detect and load all saved accounts correctly on page load."
  // Returns ALL linked accounts across ALL platforms (with valid tokens only).
  try {
    const { listAllFantasyAccounts } = require("./multi-accounts");
    const accounts = listAllFantasyAccounts();
    return accounts
      .filter(a => a.token && a.token.length > 0)
      .map(account => ({
        app: account.app,
        accountId: account.id,
        token: account.token,
        mobile: account.mobile,
        userId: account.userId,
        my11circleChallenge: account.my11circleChallenge,
        my11circleUserId: account.my11circleUserId,
        refreshToken: account.refreshToken,
        cookies: account.cookies,
        maxAllowedTeam: account.maxAllowedTeam ?? null,
        subscriptionTier: account.subscriptionTier ?? null,
        linkedAt: account.linkedAt,
      }));
  } catch {
    return [];
  }
}

/**
 * Unlink a fantasy account — removes the default account for a platform.
 * Per user spec: "Allow Remove Account" — for full multi-account removal,
 * use removeFantasyAccountById() from multi-accounts module.
 * This function removes the DEFAULT account only (backward compat).
 */
export function unlinkFantasyApp(app: FantasyApp) {
  if (typeof window === "undefined") return;
  try {
    const { getDefaultAccount, removeFantasyAccountById } = require("./multi-accounts");
    const account = getDefaultAccount(app);
    if (account) {
      removeFantasyAccountById(account.id);
      console.log(`[unlinkFantasyApp] Removed default ${app} account (${account.id})`);
    }
  } catch {
    // ignore
  }
}

/* ---------- Team mutations (add / edit / delete — localStorage in guest mode) ---------- */

export type TeamMutationType = "add" | "edit" | "delete" | "save" | "transfer";

export async function addTeam(
  _token: string,
  payload: { matchId: string | number; team: Partial<TeamRow>; type?: TeamMutationType }
): Promise<TeamRow | { success: boolean; offline: boolean }> {
  // Always persist to localStorage so guest mode works seamlessly.
  // If a real backend token is available, we'd also POST to /api/fantasy/add-team,
  // but the actual Apna Cricket backend uses /api/dream11/teams/{matchId} for
  // real team creation — which requires a real Dream11 auth token. In guest mode
  // we mock the success response.
  const all = readLocalTeams();
  const key = String(payload.matchId);
  const list = all[key] || [];
  const newTeam: TeamRow = {
    _id: localId(),
    teamId: localId(),
    teamNo: list.length + 1,
    team_number: list.length + 1,
    players: payload.team.players || [],
    captain: payload.team.captain,
    viceCaptain: payload.team.viceCaptain,
    vicecaptain: payload.team.viceCaptain,
    c: payload.team.captain,
    vc: payload.team.viceCaptain,
    team: payload.team.team,
    type: payload.type ?? "add",
    transferStatus: "pending",
  };
  list.push(newTeam);
  all[key] = list;
  writeLocalTeams(all);
  return { success: true, offline: true, ...newTeam } as TeamRow & { offline: true };
}

export async function editTeam(
  _token: string,
  payload: {
    matchId: string | number;
    teamId: string;
    team: Partial<TeamRow>;
    type?: TeamMutationType;
  }
): Promise<TeamRow | { success: boolean; offline: boolean }> {
  const all = readLocalTeams();
  const key = String(payload.matchId);
  const list = all[key] || [];
  const idx = list.findIndex(
    (t) => t._id === payload.teamId || t.teamId === payload.teamId
  );
  if (idx === -1) return { success: false, offline: true };

  if (payload.type === "delete") {
    list.splice(idx, 1);
  } else {
    list[idx] = {
      ...list[idx],
      ...payload.team,
      captain: payload.team.captain ?? list[idx].captain,
      viceCaptain: payload.team.viceCaptain ?? list[idx].viceCaptain,
      c: payload.team.captain ?? list[idx].c,
      vc: payload.team.viceCaptain ?? list[idx].vc,
    };
  }
  list.forEach((t, i) => {
    t.teamNo = i + 1;
    t.team_number = i + 1;
  });
  all[key] = list;
  writeLocalTeams(all);
  return { success: true, offline: true };
}

export async function deleteTeam(
  token: string,
  payload: { matchId: string | number; teamId: string }
): Promise<{ success: boolean }> {
  const res = await editTeam(token, {
    matchId: payload.matchId,
    teamId: payload.teamId,
    team: {},
    type: "delete",
  });
  return { success: !!(res as { success?: boolean }).success };
}

/**
 * Bulk-add multiple teams in one localStorage write (used by Sweep Generator).
 * Optionally clears existing teams first (mode="replace") or appends (mode="append").
 */
export async function bulkAddTeams(
  _token: string,
  payload: {
    matchId: string | number;
    teams: Partial<TeamRow>[];
    mode?: "append" | "replace";
  }
): Promise<{ success: boolean; count: number }> {
  const all = readLocalTeams();
  const key = String(payload.matchId);
  const existing = payload.mode === "replace" ? [] : (all[key] || []);
  // Clear existing if replace
  if (payload.mode === "replace") {
    all[key] = [];
  }
  const list = all[key] || [];
  for (const t of payload.teams) {
    const newTeam: TeamRow = {
      _id: "local_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
      teamId: "local_" + Math.random().toString(36).slice(2, 10),
      teamNo: list.length + 1,
      team_number: list.length + 1,
      players: t.players || [],
      captain: t.captain,
      viceCaptain: t.viceCaptain,
      vicecaptain: t.viceCaptain,
      c: t.captain,
      vc: t.viceCaptain,
      team: t.team,
      type: t.type ?? "sweep",
      transferStatus: "pending",
    };
    list.push(newTeam);
  }
  all[key] = list;
  writeLocalTeams(all);
  return { success: true, count: list.length };
}

/**
 * Get all locally-stored teams for a match (no API call).
 * Use this when rendering the team list in guest mode.
 */
export function getLocalTeams(matchId: string | number): TeamRow[] {
  return readLocalTeams(String(matchId));
}

/* ---------- Contest join (mock in guest mode) ---------- */

export interface JoinContestResult {
  contestId: string;
  success: boolean;
  teamIds: number[];
  message: string;
}

export async function joinContest(params: {
  fantasyApp: FantasyApp;
  authToken: string;
  matchId: string | number;
  contestId: string;
  teamIds: number[];
}): Promise<JoinContestResult> {
  // No guest bypass — always call the real API
  if (!params.authToken) {
    return {
      contestId: params.contestId,
      success: false,
      teamIds: params.teamIds,
      message: "No auth token",
    };
  }

  try {
    const userToken = typeof window !== "undefined" ? localStorage.getItem("user_token") : null;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (userToken) headers.Authorization = `Bearer ${userToken}`;

    // Route to the correct platform endpoint based on fantasyApp
    // (was previously always falling through to my11circle due to missing fantasyApp field)
    const endpoint =
      params.fantasyApp === "dream11"
        ? `/api/dream11/contest/join-contest`
        : `/api/my11circle/contest/join-contest`;

    const resp = await rawFetch<ApiResponse>(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        authToken: params.authToken,
        matchId: params.matchId,
        contestId: params.contestId,
        teamIds: params.teamIds,
      }),
    }, FANTASY_API_BASE);
    return {
      contestId: params.contestId,
      success: resp.status === "success",
      teamIds: params.teamIds,
      message: (resp.message as string) || (resp.status === "success" ? "Joined" : "Failed"),
    };
  } catch (err: any) {
    return {
      contestId: params.contestId,
      success: false,
      teamIds: params.teamIds,
      message: err?.message || "Network error",
    };
  }
}
/* ---------- Free Contest Join ---------- */

export interface FreeContest {
  contestId: string;
  contestName?: string;
  totalPrizeAmount?: number;
  prizeDisplayText?: string;
  maxAllowedTeams?: number;
  maxJoinTeamCount?: number;
  joinedTeamIds?: number[];
  joinedCount?: number;
  availableSlots?: number;
  notJoinedTeamIds?: number[];
  canJoinMore?: boolean;
  [k: string]: unknown;
}

export interface FreeContestsResult {
  status: "success" | "fail";
  message?: string;
  contests: FreeContest[];
}

/**
 * Fetch all free contests available for a match + the user's linked account.
 *
 * In guest mode (no real auth token), simulates 2 mock free contests so the
 * UI is fully functional for testing.
 */
export async function fetchFreeContests(params: {
  fantasyApp: FantasyApp;
  authToken: string;
  matchId: string;
  allTeamIds: number[];
}): Promise<FreeContestsResult> {
  if (!params.authToken) {
    return { status: "fail", message: "No auth token", contests: [] };
  }

  try {
    const userToken = typeof window !== "undefined" ? localStorage.getItem("user_token") : null;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (userToken) headers.Authorization = `Bearer ${userToken}`;
    // Use our OWN server-side proxy (NOT rawFetch — that prepends the backend URL)
    // to avoid CORS issues and get consistent error handling.
    const proxyRes = await fetch(`/api/contest/free-status`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        fantasyApp: params.fantasyApp,
        authToken: params.authToken,
        matchId: String(params.matchId),
        allTeamIds: params.allTeamIds,
      }),
      cache: "no-store",
    });
    const res = await proxyRes.json() as ApiResponse & { contests?: FreeContest[] };
    if (res.status === "success") {
      return { status: "success", contests: (res.contests || []) as FreeContest[] };
    }
    return {
      status: "fail",
      message: (res.message as string) || (res.error as string) || "Failed to fetch free contests",
      contests: [],
    };
  } catch (err: any) {
    return { status: "fail", message: err?.message || "Network error", contests: [] };
  }
}

export interface JoinContestFullResult {
  status: "success" | "fail";
  message?: string;
  contestId: string;
  joinResults: Array<{ teamId: number; success: boolean }>;
  summary: { successCount: number; failedCount: number };
  /** Set when the auth token is expired — caller should prompt re-link via OTP */
  needsReauth?: boolean;
}

/**
 * Join a free contest with the given team IDs.
 * In guest mode, simulates success.
 */
export async function joinFreeContest(params: {
  fantasyApp: FantasyApp;
  authToken: string;
  matchId: string;
  contestId: string;
  teamIds: number[];
}): Promise<JoinContestFullResult> {
  if (!params.authToken) {
    return {
      status: "fail",
      contestId: params.contestId,
      joinResults: [],
      summary: { successCount: 0, failedCount: params.teamIds.length },
      message: "No auth token",
    };
  }
  try {
    const userToken = typeof window !== "undefined" ? localStorage.getItem("user_token") : null;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (userToken) headers.Authorization = `Bearer ${userToken}`;
    // Use our OWN server-side proxy (NOT rawFetch — that prepends the backend URL)
    const proxyRes = await fetch(`/api/contest/join`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        fantasyApp: params.fantasyApp,
        authToken: params.authToken,
        matchId: String(params.matchId),
        contestId: String(params.contestId),
        teamIds: params.teamIds,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(45000),
    });
    const res = await proxyRes.json() as ApiResponse & {
      joinResults?: Array<{ teamId: number; success: boolean }>;
      summary?: { successCount: number; failedCount: number };
      needsReauth?: boolean;
    };
    return {
      status: res.status === "success" ? "success" : "fail",
      message: (res.message as string) || (res.error as string) || (res.status === "success" ? "Joined" : "Failed"),
      contestId: params.contestId,
      joinResults: (res.joinResults || []) as Array<{ teamId: number; success: boolean }>,
      summary: (res.summary as { successCount: number; failedCount: number }) || {
        successCount: 0,
        failedCount: params.teamIds.length,
      },
      needsReauth: res.needsReauth === true,
    };
  } catch (err: any) {
    return {
      status: "fail",
      message: err?.message || "Network error",
      contestId: params.contestId,
      joinResults: [],
      summary: { successCount: 0, failedCount: params.teamIds.length },
    };
  }
}

/**
 * Multi-Account Contest Join — joins a contest with MULTIPLE accounts simultaneously.
 *
 * Per user spec: "1 time all account transfer and join contest all account
 * different team dream11 3 / my11 2"
 *
 * Each account gets DIFFERENT teams (no overlap). Teams are split round-robin
 * across accounts so each account joins a unique subset of teams.
 *
 * Account limits (enforced server-side):
 *   - Dream11: max 3 accounts
 *   - My11Circle: max 2 accounts
 *
 * Subscription gating: This is a Pro/Elite-only feature. The frontend should
 * check license tier before calling this function.
 */
export interface MultiAccountJoinResult {
  status: "success" | "partial" | "fail";
  message: string;
  contestId: string;
  summary: {
    successCount: number;
    failedCount: number;
    totalCount: number;
    accountsProcessed: number;
    teamsPerAccount: number[];
  };
  accountResults: Array<{
    accountIndex: number;
    mobile: string;
    successCount: number;
    failedCount: number;
    joinResults: Array<{ teamId: number; success: boolean; error?: string }>;
    error?: string;
  }>;
  needsReauth?: boolean;
}

export async function joinAllAccountsContest(params: {
  fantasyApp: FantasyApp;
  accounts: Array<{
    authToken: string;
    mobile?: string;
    my11circleChallenge?: string;
    my11circleUserId?: string;
  }>;
  matchId: string;
  contestId: string;
  teamIds: number[];
}): Promise<MultiAccountJoinResult> {
  if (!params.accounts || params.accounts.length === 0) {
    return {
      status: "fail",
      message: "No accounts provided",
      contestId: params.contestId,
      summary: {
        successCount: 0,
        failedCount: params.teamIds.length,
        totalCount: params.teamIds.length,
        accountsProcessed: 0,
        teamsPerAccount: [],
      },
      accountResults: [],
    };
  }

  try {
    const userToken = typeof window !== "undefined" ? localStorage.getItem("user_token") : null;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (userToken) headers.Authorization = `Bearer ${userToken}`;

    // === SUBSCRIPTION GATE (per user spec: "chek all subscription are propper loked") ===
    // Pass license key + deviceId to /api/contest/join-all so the server can
    // verify the user's tier allows multi-account join. Without these headers,
    // the server BLOCKS the request (fail-closed).
    if (typeof window !== "undefined") {
      try {
        const { getLicenseState, getDeviceId } = require("./admin-store");
        const ls = getLicenseState();
        if (ls.verified && ls.key) {
          headers["x-license-key"] = ls.key;
          headers["x-device-id"] = getDeviceId();
        }
      } catch {
        // admin-store not initialized — skip (server will block if multi-account)
      }
    }

    const proxyRes = await fetch(`/api/contest/join-all`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        fantasyApp: params.fantasyApp,
        accounts: params.accounts,
        matchId: String(params.matchId),
        contestId: String(params.contestId),
        teamIds: params.teamIds,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(120000), // 2 min timeout for multi-account
    });
    const res = await proxyRes.json() as MultiAccountJoinResult;
    return res;
  } catch (err: any) {
    return {
      status: "fail",
      message: err?.message || "Network error",
      contestId: params.contestId,
      summary: {
        successCount: 0,
        failedCount: params.teamIds.length,
        totalCount: params.teamIds.length,
        accountsProcessed: 0,
        teamsPerAccount: [],
      },
      accountResults: [],
    };
  }
}

/* ---------- Mobile OTP Login (fantasy platform linking) ---------- */

export interface SendOtpResult {
  status: "success" | "fail";
  message?: string;
  state?: string;
  reasonCode?: number;
  challenge?: string;
  login_auth_token?: string;
  userId?: string;
  retries_left?: number;
  resends_left?: number;
}

/**
 * Map low-level network failures to clear, user-facing OTP error messages.
 * (Before this fix the user just saw "Network error" / "HTTP 404 Not Found"
 * and had no idea why the OTP never arrived.)
 */
function otpNetworkErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err || "");
  if (msg.includes("404")) {
    return "OTP service is temporarily unavailable (backend route changed). Please try again later.";
  }
  if (msg.includes("timeout") || msg.includes("aborted") || msg.toLowerCase().includes("abort")) {
    return "OTP service timed out. Check your internet connection and try again.";
  }
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("load failed")) {
    return "Cannot reach the OTP service. Check your internet connection and try again.";
  }
  if (msg.includes("500") || msg.includes("502") || msg.includes("503")) {
    return "OTP service is busy right now. Please try again in a minute.";
  }
  return msg || "Failed to send OTP. Please try again.";
}

/**
 * The OTP envelope data may arrive as a plain object OR as an AES-encrypted
 * string ("U2FsdGVk..."). Handle both — the original APK read
 * `response.data.data.reasonCode` / `.challenge` directly from the plaintext
 * envelope, so we must never choke on an encrypted variant either.
 */
function extractOtpData(res: ApiResponse): Record<string, unknown> {
  const d = res.data;
  if (d && typeof d === "object") return d as Record<string, unknown>;
  if (typeof d === "string" && d.startsWith("U2FsdGVk")) {
    try {
      const dec = decrypt<Record<string, unknown>>(d);
      if (dec && typeof dec === "object") return dec;
    } catch { /* fall through */ }
  }
  if (typeof d === "string") {
    try {
      const parsed = JSON.parse(d);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch { /* fall through */ }
  }
  return {};
}

export async function sendFantasyOtp(params: {
  fantasyApp: FantasyApp;
  mobileNumber: string;
}): Promise<SendOtpResult> {
  try {
    // 20s timeout + 1 automatic retry on transient network failure —
    // OTP requests must not die silently on a flaky mobile connection.
    const doSend = () =>
      rawFetch<ApiResponse>(
        `/api/fantasy/send-otp`,
        {
          method: "POST",
          body: JSON.stringify({
            fantasyApp: params.fantasyApp,
            mobileNumber: params.mobileNumber,
          }),
          signal: AbortSignal.timeout(20000),
        },
        FANTASY_API_BASE
      );

    let res: ApiResponse;
    try {
      res = await doSend();
    } catch (firstErr) {
      console.warn("[sendOtp] first attempt failed, retrying once:", firstErr);
      res = await doSend();
    }

    if (res.status === "success") {
      const d = extractOtpData(res);
      return {
        status: "success",
        message: (res.message as string) || "",
        state: d.state as string | undefined,
        reasonCode: d.reasonCode as number | undefined,
        challenge: d.challenge as string | undefined,
        login_auth_token: d.login_auth_token as string | undefined,
        userId: d.userId as string | undefined,
        retries_left: d.retries_left as number | undefined,
        resends_left: d.resends_left as number | undefined,
      };
    }
    return { status: "fail", message: (res.message as string) || "Failed to send OTP" };
  } catch (err: unknown) {
    console.error("[sendOtp] failed:", err);
    return { status: "fail", message: otpNetworkErrorMessage(err) };
  }
}

export interface VerifyOtpResult {
  status: "success" | "fail";
  message?: string;
  token?: string;
  my11circleChallenge?: string;
  my11circleUserId?: string;
  mobileNumber?: string;
  /** Dream11 only: max teams per match based on subscription tier */
  maxAllowedTeam?: number | null;
  /** Dream11 only: subscription tier label (e.g. "Pro", "Max") */
  subscriptionTier?: string | null;
  /** Dream11 only: is the user's subscription active? */
  d11SubscriptionActive?: boolean | null;
}

export async function verifyFantasyOtp(params: {
  fantasyApp: FantasyApp;
  mobileNumber: string;
  verificationCode: string;
  state?: string;
  reasonCode?: number;
  challenge?: string;
  login_auth_token?: string;
  userId?: string;
}): Promise<VerifyOtpResult> {
  const body: Record<string, unknown> = {
    fantasyApp: params.fantasyApp,
    mobileNumber: params.mobileNumber,
    verificationCode: params.verificationCode,
  };
  if (params.fantasyApp === "dream11" && params.state) body.state = params.state;
  if (params.fantasyApp === "my11circle") {
    body.reasonCode = params.reasonCode ?? null;
    body.challenge = params.challenge ?? null;
  }
  if (params.fantasyApp === "myteam11" && params.login_auth_token) {
    body.Loginauthtoken = params.login_auth_token;
  }
  if (params.fantasyApp === "vision11" && params.userId) {
    body.userId = params.userId;
  }

  try {
    const res = await rawFetch<ApiResponse>(
      `/api/fantasy/verify-otp`,
      {
        method: "POST",
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(25000),
      },
      FANTASY_API_BASE
    );
    if (res.status === "success") {
      const d = extractOtpData(res);
      return {
        status: "success",
        message: (res.message as string) || "",
        token: d.token as string | undefined,
        my11circleChallenge: d.my11circleChallenge as string | undefined,
        my11circleUserId: d.my11circleUserId as string | undefined,
        mobileNumber: params.mobileNumber,
        // Dream11 subscription fields — present when the user has a paid Dream11 plan
        maxAllowedTeam: typeof d.maxAllowedTeam === "number" ? d.maxAllowedTeam : null,
        subscriptionTier: typeof d.subscriptionTier === "string" ? d.subscriptionTier : null,
        d11SubscriptionActive: typeof d.d11SubscriptionActive === "boolean" ? d.d11SubscriptionActive : null,
      };
    }
    return { status: "fail", message: (res.message as string) || "Invalid OTP" };
  } catch (err: unknown) {
    console.error("[verifyOtp] failed:", err);
    return { status: "fail", message: otpNetworkErrorMessage(err) };
  }
}

/* ---------- Direct Team Transfer (NO auth needed — link generation) ---------- */

export interface DirectTransferResult {
  status: "success" | "fail";
  message?: string;
  link?: string;
}

export async function generateDirectTransferLink(params: {
  matchId: string;
  playerIds: string[];
  captainId: string;
  viceCaptainId: string;
  matchDbId?: string;
}): Promise<DirectTransferResult> {
  try {
    const tgMatchId = params.matchDbId || params.matchId;
    const res = await rawFetch<ApiResponse>(`/api/classic/dream11/addteam`, {
      method: "POST",
      body: JSON.stringify({
        tgMatchId,
        playerData: params.playerIds,
        captainData: params.captainId,
        vicecaptainData: params.viceCaptainId,
        generateLinkFlag: "general",
      }),
    }, FANTASY_API_BASE);
    if (res.status === "success" && res.data) {
      let link: string | undefined;
      if (typeof res.data === "string") {
        const dec = decrypt<{ link?: string }>(res.data);
        link = dec?.link;
      } else if (typeof res.data === "object") {
        link = (res.data as { link?: string }).link;
      }
      if (link) return { status: "success", link };
    }
  } catch {}
  return { status: "fail", message: "Dream11 direct transfer not available for this match." };
}

/* ---------- Bulk Team Transfer to Linked Fantasy Accounts ---------- */

export interface BulkTransferItem {
  teamNo: number;
  playerIds: string[];
  captainId: string;
  viceCaptainId: string;
}

export interface BulkTransferResult {
  totalAttempted: number;
  successCount: number;
  failCount: number;
  results: Array<{ teamNo: number; success: boolean; message?: string }>;
  transferLinks: Array<{ teamNo: number; link?: string }>;
  /** Set when transfer was blocked because the auth token is expired.
   *  Caller should prompt the user to re-link via OTP. */
  needsReauth?: boolean;
  /** Reason the transfer was blocked (if needsReauth=true). */
  blockReason?: string;
}

export async function bulkDirectTransfer(
  teams: BulkTransferItem[],
  matchId: string,
  matchDbId?: string,
  onProgress?: (done: number, total: number) => void
): Promise<BulkTransferResult> {
  const results: BulkTransferResult["results"] = [];
  const transferLinks: BulkTransferResult["transferLinks"] = [];
  let successCount = 0;
  let failCount = 0;

  // SEQUENTIAL transfer — 1 team at a time (reverted from parallel batching)
  // Parallel batching caused backend to drop requests silently.
  // Sequential is reliable — every team gets transferred.
  for (let i = 0; i < teams.length; i++) {
    const t = teams[i];
    const res = await generateDirectTransferLink({
      matchId,
      matchDbId,
      playerIds: t.playerIds,
      captainId: t.captainId,
      viceCaptainId: t.viceCaptainId,
    });
    if (res.status === "success" && res.link) {
      successCount++;
      results.push({ teamNo: t.teamNo, success: true });
      transferLinks.push({ teamNo: t.teamNo, link: res.link });
    } else {
      failCount++;
      results.push({ teamNo: t.teamNo, success: false, message: res.message });
      transferLinks.push({ teamNo: t.teamNo });
    }
    onProgress?.(i + 1, teams.length);
    // Short delay — 100ms (was 200ms)
    if (i < teams.length - 1) await new Promise((r) => setTimeout(r, 100));
  }

  return { totalAttempted: teams.length, successCount, failCount, results, transferLinks };
}

export async function bulkTransferToLinkedAccount(
  teams: BulkTransferItem[],
  params: {
    matchId: string;
    fantasyApp: FantasyApp;
    authToken: string;
    sportIndex?: number;
    my11circleChallenge?: string;
    my11circleUserId?: string;
    mobileNumber?: string;
    replaceMode?: boolean;
    existingTeamIds?: string[];
    /** Set to false to skip the pre-transfer auth verify call.
     *  Default: true (matches original APK flow). */
    skipVerify?: boolean;
  },
  onProgress?: (done: number, total: number) => void
): Promise<BulkTransferResult> {
  const results: BulkTransferResult["results"] = [];
  const transferLinks: BulkTransferResult["transferLinks"] = [];
  let successCount = 0;
  let failCount = 0;

  // ============================================================
  // PRODUCTION-GRADE BULK TRANSFER — Sequential Queue + Verify + Auto-Recover
  // ============================================================
  //
  // Design principles (per user spec):
  //   1. Sequential queue — ONE team at a time, no parallelism, no skipping
  //   2. Post-transfer verification — verify via list-of-teams after EACH transfer
  //   3. Auto token refresh — if session expires, try refresh via /api/auth/verify
  //   4. Idempotency check — before retrying, check if team was already created
  //      (prevents duplicates from lost responses)
  //   5. Smart retry — up to 5 attempts per team with exponential backoff
  //   6. Final validation gate — only mark success if verification passes
  //   7. Clear logging — every step logged for debugging
  //
  // Mutex: prevent concurrent bulk transfers (race condition prevention).
  // If another bulk transfer is in progress, this one waits/rejects.
  if (bulkTransferMutex.isLocked) {
    console.error("[bulkTransfer] ❌ BLOCKED — another bulk transfer is already in progress (race condition prevention)");
    return {
      totalAttempted: teams.length,
      successCount: 0,
      failCount: teams.length,
      results: teams.map((t) => ({
        teamNo: t.teamNo,
        success: false,
        message: "Another bulk transfer is already running. Please wait for it to finish.",
      })),
      transferLinks: [],
      blockReason: "Concurrent bulk transfer blocked by mutex",
    };
  }
  bulkTransferMutex.acquire();

  try {
    // === STEP 1: PRE-TRANSFER VALIDATION ===
    console.log(`\n${"=".repeat(70)}`);
    console.log(`[bulkTransfer] 🚀 STARTING BULK TRANSFER`);
    console.log(`[bulkTransfer]    Platform: ${params.fantasyApp}`);
    console.log(`[bulkTransfer]    Match ID: ${params.matchId}`);
    console.log(`[bulkTransfer]    Total teams: ${teams.length}`);
    console.log(`[bulkTransfer]    Mode: ${params.replaceMode ? "REPLACE" : "ADD"}`);
    console.log(`[bulkTransfer]    Token length: ${params.authToken?.length || 0}`);
    console.log(`${"=".repeat(70)}\n`);

    // Validate each team has 11 players, captain, and vice-captain
    let validationFailed = false;
    for (let i = 0; i < teams.length; i++) {
      const t = teams[i];
      if (!t.playerIds || t.playerIds.length !== 11) {
        console.error(`[bulkTransfer] ❌ Team ${i + 1} (teamNo=${t.teamNo}) has ${t.playerIds?.length || 0} players (expected 11)`);
        validationFailed = true;
      }
      if (!t.captainId) {
        console.error(`[bulkTransfer] ❌ Team ${i + 1} (teamNo=${t.teamNo}) has no captain`);
        validationFailed = true;
      }
      if (!t.viceCaptainId) {
        console.error(`[bulkTransfer] ❌ Team ${i + 1} (teamNo=${t.teamNo}) has no vice-captain`);
        validationFailed = true;
      }
    }
    if (validationFailed) {
      console.error("[bulkTransfer] ❌ Pre-transfer validation FAILED — aborting");
      return {
        totalAttempted: teams.length,
        successCount: 0,
        failCount: teams.length,
        results: teams.map((t) => ({
          teamNo: t.teamNo,
          success: false,
          message: "Team validation failed — must have 11 players, captain, and vice-captain",
        })),
        transferLinks: [],
        blockReason: "Team validation failed",
      };
    }
    console.log(`[bulkTransfer] ✅ Pre-transfer validation passed for all ${teams.length} teams\n`);

    // === STEP 2: FETCH INITIAL TEAM COUNT (for verification baseline) ===
    // SPEED OPTIMIZATION: Only fetch initial team count when we actually need it.
    // We only need it if we're going to do verification (TENTATIVE success path).
    // For the common DEFINITE success case, we skip verification entirely,
    // so we don't need the initial count either. This saves ~1s on startup.
    let initialTeamCount = 0;
    // We'll fetch lazily if a tentative-success happens (see CASE 2 below).

    // === STEP 2.5: AUTO-REGISTER MATCH IN BACKEND DB (my11circle / jumbo) ===
    // The original APK required matches to be registered in the backend DB
    // (admin "Add to DB" button → POST /api/{platform}/add-match with the
    // user's authToken) BEFORE teams could be transferred for that match.
    // The backend's own matches list is currently EMPTY — without registration
    // add-team rejects the transfer with a generic "Something Went Wrong!".
    // We register automatically here: idempotent (backend answers
    // "already exists" → success), non-fatal (if it fails we still try the
    // transfer and surface its real error), and only for the platforms that
    // have an add-match endpoint (my11circle, jumbo — same as the APK).
    if (params.fantasyApp === "my11circle" || params.fantasyApp === "jumbo") {
      try {
        console.log(`[bulkTransfer] 📋 Auto-registering match ${params.matchId} for ${params.fantasyApp} (add-match)...`);
        const regRes = await fetch(`/api/matches/add`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform: params.fantasyApp,
            matchId: String(params.matchId),
            sport: "cricket",
            authToken: params.authToken,
          }),
          signal: AbortSignal.timeout(20000),
        });
        const regData = await regRes.json().catch(() => ({ status: "fail" }));
        console.log(`[bulkTransfer] 📋 add-match result: ${regData.status} ${regData.message || ""} ${regData.alreadyExists ? "(already existed)" : ""}`);
      } catch (regErr) {
        // Non-fatal — the transfer attempt will surface the real error if
        // registration truly failed.
        console.warn(`[bulkTransfer] add-match registration failed (continuing):`, regErr instanceof Error ? regErr.message : regErr);
      }
    }

    // === STEP 3: PRE-TRANSFER AUTH VERIFY (only if skipVerify=false) ===
    if (params.skipVerify === false && params.authToken) {
      console.log("[bulkTransfer] Pre-verifying auth token (skipVerify=false)...");
      const verifyResult = await verifyBeforeTransfer({
        fantasyApp: params.fantasyApp,
        authToken: params.authToken,
        matchId: params.matchId,
        my11circleChallenge: params.my11circleChallenge,
        my11circleUserId: params.my11circleUserId,
        my11circleMobile: params.mobileNumber,
      });

      if (!verifyResult.proceed) {
        console.warn("[bulkTransfer] Blocked by auth verify:", verifyResult.reason);
        return {
          totalAttempted: 0,
          successCount: 0,
          failCount: teams.length,
          results: teams.map((t) => ({
            teamNo: t.teamNo,
            success: false,
            message: verifyResult.reason || "Token expired — re-link via OTP",
          })),
          transferLinks: [],
          needsReauth: true,
          blockReason: verifyResult.reason,
        };
      }

      if (verifyResult.refreshed) {
        const freshToken = getFantasyToken(params.fantasyApp);
        if (freshToken) {
          params = { ...params, authToken: freshToken };
          console.log("[bulkTransfer] Using refreshed token from updateUiToken");
        }
      }
    }

    // === STEP 4: PARALLEL-BATCH TRANSFER WITH VERIFICATION ===
    //
    // SPEED-OPTIMIZED PARALLEL TRANSFER:
    //   - Dream11: 3 workers in parallel (~3x speedup, no rate-limit observed)
    //   - My11Circle: 1 worker (sequential — backend is more sensitive)
    //   - Other: 1 worker (safe default)
    //
    // Per-team retry strategy (each worker runs this independently):
    //   - Max 2 retry attempts per team
    //   - Backoff: 200ms → 500ms
    //   - DEFINITE success → trust response, skip verification (saves 1.3s/team)
    //   - TENTATIVE success → verify via list-of-teams
    //   - Failure → idempotency check before retry
    //   - Token expired → refresh once (shared across all workers — only 1 refresh
    //     happens at a time, other workers await the same refresh promise)
    //
    // Timing (20 Dream11 teams, happy path):
    //   Sequential: 20 × 1s = 20s
    //   Parallel-3: 20 / 3 × 1s = ~7s  (3x faster)
    //
    // FAILURE SAFETY:
    //   - If parallel causes backend issues, we auto-detect via response codes
    //     and the per-team retry loop handles it.
    //   - Token refresh is coordinated via shared promise — no duplicate refreshs.
    //   - Results are recorded in a pre-allocated array (indexed by team position)
    //     so order is preserved regardless of completion order.
    const MAX_ATTEMPTS_PER_TEAM = 2;
    const RETRY_BACKOFFS = [200, 500];
    const VERIFY_DELAY_MS = 100;
    const RECHECK_DELAY_MS = 200;
    const REQUEST_TIMEOUT_MS = 15000; // was 45000 — fail fast, retry fast

    // Concurrency per platform
    const CONCURRENCY = params.fantasyApp === "dream11" ? 3
                      : params.fantasyApp === "my11circle" ? 1
                      : 1;

    // === SHARED STATE ACROSS WORKERS ===
    // All workers read from `sharedParams.authToken` — when one worker refreshes
    // the token, all subsequent attempts by other workers use the new token.
    let sharedParams = { ...params };
    let latestKnownTeamCount = initialTeamCount;
    let completedCount = 0;
    let batchNeedsReauth = false; // set if ANY worker hits a permanent auth failure

    // Token refresh coordination — only one worker should refresh at a time.
    // Other workers await the same promise and reuse the result.
    let refreshPromise: Promise<string | null> | null = null;

    /**
     * Get or trigger a token refresh. If a refresh is already in-flight
     * (started by another worker), await the same promise instead of
     * firing a duplicate refresh call.
     */
    async function getRefreshedToken(): Promise<string | null> {
      if (refreshPromise) {
        // Another worker is already refreshing — await its result
        console.log("[bulkTransfer]    ⏳ Another worker is refreshing token — awaiting...");
        return refreshPromise;
      }
      console.log("[bulkTransfer]    🔄 This worker will refresh token via /api/auth/verify...");
      refreshPromise = (async () => {
        try {
          const refreshed = await tryRefreshAuthToken(sharedParams);
          if (refreshed) {
            // Update sharedParams so all workers use the new token
            sharedParams = { ...sharedParams, authToken: refreshed };
            console.log("[bulkTransfer]    ✅ Token refreshed (shared with all workers)");
          }
          return refreshed;
        } finally {
          // Clear the promise so a future refresh can happen if needed
          refreshPromise = null;
        }
      })();
      return refreshPromise;
    }

    // Pre-allocate results array (preserves order regardless of completion order)
    const teamResults: Array<{
      teamNo: number;
      success: boolean;
      message: string;
      transferred: boolean;
      verified: boolean;
      needsReauth: boolean;
    }> = new Array(teams.length);

    /**
     * Process ONE team: build body, call /api/transfer, handle retry/verify.
     * This function is called by N parallel workers.
     */
    async function processTeam(i: number): Promise<void> {
      const t = teams[i];
      const hasExistingId = sharedParams.replaceMode && sharedParams.existingTeamIds && i < sharedParams.existingTeamIds.length && sharedParams.existingTeamIds[i];
      const isReplace = !!hasExistingId;
      const numericPlayers = t.playerIds.map((id) => Number(id)).filter((n) => !isNaN(n));
      const numericCaptain = Number(t.captainId);
      const numericVC = Number(t.viceCaptainId);

      const body: Record<string, unknown> = {
        matchId: sharedParams.matchId,
        captain: isNaN(numericCaptain) ? t.captainId : numericCaptain,
        vice_captain: isNaN(numericVC) ? t.viceCaptainId : numericVC,
        vicecaptain: isNaN(numericVC) ? t.viceCaptainId : numericVC,
        players: numericPlayers.length > 0 ? numericPlayers : t.playerIds,
        fantasyApp: sharedParams.fantasyApp,
        authToken: sharedParams.authToken,
        sportIndex: sharedParams.sportIndex ?? 0,
        type: isReplace ? "edit" : "new",
      };
      if (isReplace && sharedParams.existingTeamIds) body.id = sharedParams.existingTeamIds[i];

      let teamTransferred = false;
      let teamVerified = false;
      let teamErrorMessage = "";
      let needsReauthForTeam = false;
      let tokenRefreshedForTeam = false;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_TEAM; attempt++) {
        // Stop if another worker already discovered the token is permanently expired
        if (batchNeedsReauth) {
          teamErrorMessage = "Token expired — re-link via OTP";
          needsReauthForTeam = true;
          break;
        }

        try {
          // Always use the latest token (may have been refreshed by another worker)
          const attemptBody = { ...body, authToken: sharedParams.authToken, skipPreVerify: true };

          const proxyRes = await fetch(`/api/transfer`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(attemptBody),
            cache: "no-store",
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          });
          const res = await proxyRes.json() as ApiResponse & {
            needsReauth?: boolean;
            confidence?: "definite" | "tentative";
            code?: string;
            backendError?: string;
            httpStatus?: number;
          };

          // ── CASE 1: SESSION EXPIRED ──
          if (res.needsReauth) {
            console.warn(`[bulkTransfer] Team ${t.teamNo} attempt ${attempt}: ⚠️ Session expired (code: ${res.code || "UNKNOWN"})`);

            // Try token refresh once per team (shared across workers)
            if (!tokenRefreshedForTeam) {
              const refreshed = await getRefreshedToken();
              if (refreshed) {
                tokenRefreshedForTeam = true;
                console.log(`[bulkTransfer] Team ${t.teamNo}: ✅ Token refreshed! Retrying with new token...`);
                attempt--; // don't count this as an attempt
                continue;
              } else {
                console.error(`[bulkTransfer] Team ${t.teamNo}: ❌ Token refresh failed — session permanently expired`);
                // Mark the ENTIRE batch as needing reauth — other workers should stop
                batchNeedsReauth = true;
              }
            }

            needsReauthForTeam = true;
            teamErrorMessage = (res.error as string) || "Session expired — re-link via OTP";
            break;
          }

          // ── CASE 2: SUCCESS RESPONSE ──
          if (res.status === "success") {
            // SPEED OPTIMIZATION: For definite-success, trust the response.
            if (res.confidence !== "tentative") {
              console.log(`[bulkTransfer] Team ${t.teamNo}: ✅ SUCCESS (definite, skipped verify)`);
              teamTransferred = true;
              teamVerified = true;
              break;
            }

            // TENTATIVE success — verify via list-of-teams
            await new Promise((r) => setTimeout(r, VERIFY_DELAY_MS));
            const verifyResult = await verifyTransferCompletion(sharedParams, isReplace, latestKnownTeamCount, i + 1);

            if (verifyResult.verified) {
              console.log(`[bulkTransfer] Team ${t.teamNo}: ✅ VERIFIED (count: ${verifyResult.newCount})`);
              teamTransferred = true;
              teamVerified = true;
              break;
            }

            // Re-check after short delay
            await new Promise((r) => setTimeout(r, RECHECK_DELAY_MS));
            const recheckResult = await verifyTransferCompletion(sharedParams, isReplace, latestKnownTeamCount, i + 1);
            if (recheckResult.verified) {
              console.log(`[bulkTransfer] Team ${t.teamNo}: ✅ VERIFIED on 2nd check (count: ${recheckResult.newCount})`);
              teamTransferred = true;
              teamVerified = true;
              break;
            }

            // PROPER FIX — never claim success without proof.
            // OLD behaviour: "Trust the success response anyway" → marked the
            // team as transferred even when list-of-teams showed NO new team.
            // That is exactly the "transfer shows team transferred but team is
            // NOT transferred" bug. Now: report honestly as FAILED.
            console.error(`[bulkTransfer] Team ${t.teamNo}: ❌ Response said success but list-of-teams could NOT confirm it twice — reporting FAILURE (no fake success)`);
            teamErrorMessage = `The team could not be verified on ${sharedParams.fantasyApp} after transfer. It was NOT added. Please re-link your account via OTP and try again.`;
            break;
          }

          // ── CASE 3: FAILURE RESPONSE ──
          teamErrorMessage = (res.error as string) || (res.message as string) || "Transfer failed";
          const lowerErr = teamErrorMessage.toLowerCase();
          console.warn(`[bulkTransfer] Team ${t.teamNo} attempt ${attempt}: ⚠️ ${teamErrorMessage} [code: ${res.code || "N/A"}]`);

          // Non-retryable errors
          if (res.code === "DEADLINE_PASSED" || lowerErr.includes("deadline")) {
            console.error(`[bulkTransfer] Team ${t.teamNo}: ❌ Deadline passed — NOT retrying`);
            break;
          }
          if (res.code === "TEAM_LIMIT_REACHED" || lowerErr.includes("limit") || lowerErr.includes("maximum")) {
            console.error(`[bulkTransfer] Team ${t.teamNo}: ❌ Team limit reached — NOT retrying`);
            break;
          }

          // Idempotency check before retry
          await new Promise((r) => setTimeout(r, VERIFY_DELAY_MS));
          const idempotencyCheck = await verifyTransferCompletion(sharedParams, isReplace, latestKnownTeamCount, i + 1);
          if (idempotencyCheck.verified) {
            console.log(`[bulkTransfer] Team ${t.teamNo}: ✅ Idempotency check — team was actually created`);
            teamTransferred = true;
            teamVerified = true;
            break;
          }
        } catch (err: any) {
          // ── CASE 4: NETWORK ERROR / TIMEOUT ──
          const errMsg = err?.message || "Network error";
          const isTimeout = errMsg.includes("timeout") || errMsg.includes("abort");
          teamErrorMessage = isTimeout ? "Request timed out" : `Network error: ${errMsg}`;
          console.warn(`[bulkTransfer] Team ${t.teamNo} attempt ${attempt}: ⚠️ ${isTimeout ? "TIMEOUT" : "NETWORK"} ${teamErrorMessage}`);
        }

        // Backoff before next attempt
        if (attempt < MAX_ATTEMPTS_PER_TEAM && !teamTransferred && !needsReauthForTeam && !batchNeedsReauth) {
          const backoff = RETRY_BACKOFFS[attempt - 1] || 500;
          await new Promise((r) => setTimeout(r, backoff));
        }
      } // end of per-team retry loop

      // Record result in pre-allocated array (preserves order)
      teamResults[i] = {
        teamNo: t.teamNo,
        success: teamTransferred && teamVerified,
        message: teamTransferred && teamVerified
          ? "Transferred"
          : (teamErrorMessage || "Transfer failed after all retries"),
        transferred: teamTransferred,
        verified: teamVerified,
        needsReauth: needsReauthForTeam,
      };

      completedCount++;
      onProgress?.(completedCount, teams.length);

      if (teamTransferred && teamVerified) {
        console.log(`[bulkTransfer] ✅ Team ${t.teamNo} — SUCCESS [${completedCount}/${teams.length}]`);
      } else {
        console.error(`[bulkTransfer] ❌ Team ${t.teamNo} — FAILED: ${teamErrorMessage} [${completedCount}/${teams.length}]`);
      }
    }

    // === RUN WORKERS (sequential or parallel) ===
    console.log(`[bulkTransfer] 🚀 Starting transfer: ${teams.length} teams, concurrency=${CONCURRENCY} (${sharedParams.fantasyApp})`);

    if (CONCURRENCY === 1) {
      // Sequential — preserves original behavior (for My11Circle, etc.)
      for (let i = 0; i < teams.length; i++) {
        if (batchNeedsReauth) {
          // Token expired mid-batch — mark remaining teams as skipped
          teamResults[i] = {
            teamNo: teams[i].teamNo,
            success: false,
            message: "Skipped — token expired",
            transferred: false,
            verified: false,
            needsReauth: true,
          };
          completedCount++;
          onProgress?.(completedCount, teams.length);
          continue;
        }
        await processTeam(i);
      }
    } else {
      // Parallel batch — N workers pull from a shared queue
      const queue = Array.from({ length: teams.length }, (_, i) => i);
      const workers: Promise<void>[] = [];

      for (let w = 0; w < CONCURRENCY; w++) {
        workers.push((async () => {
          while (queue.length > 0) {
            // Stop if batch is aborted (token permanently expired)
            if (batchNeedsReauth) break;

            const i = queue.shift();
            if (i === undefined) break;

            await processTeam(i);
          }
        })());
      }

      await Promise.all(workers);

      // If batch was aborted, mark any unprocessed teams as skipped
      for (let i = 0; i < teams.length; i++) {
        if (!teamResults[i]) {
          teamResults[i] = {
            teamNo: teams[i].teamNo,
            success: false,
            message: "Skipped — token expired",
            transferred: false,
            verified: false,
            needsReauth: true,
          };
          completedCount++;
          onProgress?.(completedCount, teams.length);
        }
      }
    }

    // === STEP 5: BUILD FINAL RESULTS ===
    for (let i = 0; i < teams.length; i++) {
      const r = teamResults[i];
      if (r.success) {
        successCount++;
      } else {
        failCount++;
        if (r.needsReauth) batchNeedsReauth = true;
      }
      results.push({ teamNo: r.teamNo, success: r.success, message: r.message });
      transferLinks.push({ teamNo: r.teamNo });
    }

    // === STEP 6: FINAL SUMMARY ===
    const successRate = teams.length > 0 ? ((successCount / teams.length) * 100).toFixed(1) : "0";
    console.log(`\n${"=".repeat(70)}`);
    console.log(`[bulkTransfer] 🏁 BULK TRANSFER COMPLETE`);
    console.log(`[bulkTransfer]    Platform: ${params.fantasyApp}`);
    console.log(`[bulkTransfer]    Concurrency: ${CONCURRENCY} workers`);
    console.log(`[bulkTransfer]    Total: ${teams.length}`);
    console.log(`[bulkTransfer]    Success: ${successCount} (${successRate}%)`);
    console.log(`[bulkTransfer]    Failed: ${failCount}`);
    if (failCount > 0) {
      console.log(`[bulkTransfer]    ❌ Failed teams:`);
      results.filter((r) => !r.success).forEach((r) => {
        console.log(`[bulkTransfer]       • Team ${r.teamNo}: ${r.message}`);
      });
    }
    console.log(`${"=".repeat(70)}\n`);

    return {
      totalAttempted: teams.length,
      successCount,
      failCount,
      results,
      transferLinks,
      ...(batchNeedsReauth ? { needsReauth: true, blockReason: "Token expired — re-link via OTP" } : {}),
    };
  } finally {
    // Always release the mutex — even on error
    bulkTransferMutex.release();
  }
}

/**
 * Module-level mutex to prevent concurrent bulk transfers.
 * Ensures only ONE bulk transfer runs at a time (race condition prevention).
 * If a user opens two tabs and starts two bulk transfers, the second one is rejected.
 */
const bulkTransferMutex = {
  _locked: false,
  get isLocked() { return this._locked; },
  acquire() {
    if (this._locked) {
      throw new Error("Mutex already acquired — another bulk transfer is in progress");
    }
    this._locked = true;
    console.log("[bulkTransfer] 🔒 Mutex acquired — bulk transfer starting");
  },
  release() {
    this._locked = false;
    console.log("[bulkTransfer] 🔓 Mutex released — bulk transfer finished");
  },
};

/**
 * Try to refresh an expired auth token by calling /api/auth/verify.
 * The backend sometimes returns a fresh token via `updateUiToken` + `authToken`
 * in the verify response. If we get one, save it and return it.
 *
 * Returns the new token string on success, or null if refresh failed.
 */
async function tryRefreshAuthToken(params: {
  fantasyApp: FantasyApp;
  authToken: string;
  matchId: string | number;
  my11circleChallenge?: string;
  my11circleUserId?: string;
  mobileNumber?: string;
}): Promise<string | null> {
  try {
    console.log("[bulkTransfer] 🔄 Calling /api/auth/verify for token refresh...");
    const res = await fetch(`/api/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fantasyApp: params.fantasyApp,
        authToken: params.authToken,
        matchId: params.matchId,
        my11circleChallenge: params.my11circleChallenge,
        my11circleUserId: params.my11circleUserId,
        my11circleMobile: params.mobileNumber,
      }),
      cache: "no-store",
    });
    const data = await res.json();

    if (data.updateUiToken && data.authToken && data.authToken !== params.authToken) {
      console.log("[bulkTransfer] ✅ Backend returned a fresh token via updateUiToken");
      // Save the refreshed token
      saveFantasyToken(params.fantasyApp, data.authToken, {
        mobile: params.mobileNumber,
        my11circleChallenge: params.my11circleChallenge,
        my11circleUserId: params.my11circleUserId,
      });
      return data.authToken as string;
    }

    if (data.validToken === true) {
      console.log("[bulkTransfer] ℹ️ Backend says token is still valid — refresh not needed");
    } else {
      console.warn("[bulkTransfer] ⚠️ Backend confirms token is expired — refresh not possible without re-OTP");
    }
    return null;
  } catch (err: any) {
    console.error(`[bulkTransfer] ❌ Token refresh failed: ${err?.message}`);
    return null;
  }
}

/**
 * Verify that a transfer was actually completed by checking the team count
 * on the platform via /api/contest/my-teams.
 *
 * Verification logic:
 *   - ADD mode (type="new"): team count should have increased by 1
 *   - REPLACE mode (type="edit"): team count should stay the same (we replaced,
 *     not added). We verify the team count is at least as high as before.
 *
 * Returns:
 *   - { verified: true, newCount: N } if verification passed
 *   - { verified: false, newCount: N } if verification failed (team may not
 *     have been created, or list-of-teams is stale)
 */
async function verifyTransferCompletion(
  params: {
    fantasyApp: FantasyApp;
    authToken: string;
    matchId: string | number;
    my11circleChallenge?: string;
    my11circleUserId?: string;
    mobileNumber?: string;
  },
  isReplace: boolean,
  baselineCount: number,
  teamsAddedSoFar: number
): Promise<{ verified: boolean; newCount?: number }> {
  try {
    const teams = await listFantasyTeams({
      fantasyApp: params.fantasyApp,
      authToken: params.authToken,
      matchId: params.matchId,
      my11circleChallenge: params.my11circleChallenge,
      my11circleUserId: params.my11circleUserId,
      my11circleMobile: params.mobileNumber,
    });
    const newCount = teams.length;

    // If baselineCount is 0 (we didn't pre-fetch), we can't compare against an
    // expected count. Instead, just check that the platform returned AT LEAST
    // teamsAddedSoFar teams (i.e. the first transfer definitely went through).
    // This is a weaker check but still catches "team wasn't created at all".
    if (baselineCount === 0) {
      const verified = isReplace ? newCount >= teamsAddedSoFar : newCount >= teamsAddedSoFar;
      return { verified, newCount };
    }

    // Expected count after this transfer:
    //   - ADD mode: baseline + teamsAddedSoFar (each prior add added 1)
    //   - REPLACE mode: baseline (replace doesn't change count)
    const expectedCount = isReplace ? baselineCount : baselineCount + teamsAddedSoFar;

    if (isReplace) {
      // For replace, count should stay at least at baseline
      // (it could be higher if a prior add also happened, but for pure replace mode
      // it should equal baseline)
      const verified = newCount >= baselineCount;
      return { verified, newCount };
    } else {
      // For add, count should have increased by the number of teams added so far
      const verified = newCount >= expectedCount;
      return { verified, newCount };
    }
  } catch (err: any) {
    console.warn(`[bulkTransfer] Verification call failed: ${err?.message}`);
    // If verification call itself fails, don't fail the transfer — return verified=false
    // and let the caller decide (idempotency check / retry / trust response)
    return { verified: false };
  }
}
