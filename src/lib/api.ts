import { encrypt, decrypt } from "./crypto";

/**
 * FantasyPro API client — patched to match the actual FantasyPro backend.
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
 * 3. FantasyPro user auth (Bearer JWT in header — obtained via Google OAuth):
 *    Used only for admin / premium features. We BYPASS this in guest mode.
 *
 * 4. Local fallback (guest mode):
 *    When the user is browsing as guest (no real Dream11/My11Circle token),
 *    we persist their teams to localStorage so the full add/edit/delete/transfer
 *    flow works end-to-end without any external tokens.
 */

export const API_BASE = "https://tgsoftware-api.online";

export type Sport = "cricket" | "football" | "basketball" | "kabaddi";
export type FantasyApp = "dream11" | "my11circle" | "myteam11" | "vision11";

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

async function rawFetch(path: string, init?: RequestInit): Promise<ApiResponse> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*",
      ...(init?.headers || {}),
    },
    cache: "no-store",
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
  return {
    ...raw,
    matchId: raw.matchId ?? raw.id ?? raw._id,
    series: raw.series ?? raw.series_name ?? raw.title,
    title: raw.title ?? raw.series_name,
    subTitle: raw.subTitle ?? raw.sub_title,
    team1: raw.team1 ?? (raw.left_team_name ? { shortName: raw.left_team_name, name: raw.left_team_name, logo: raw.left_team_image } : undefined),
    team2: raw.team2 ?? (raw.right_team_name ? { shortName: raw.right_team_name, name: raw.right_team_name, logo: raw.right_team_image } : undefined),
    team1Short: raw.team1Short ?? raw.left_team_name,
    team2Short: raw.team2Short ?? raw.right_team_name,
    team1Logo: raw.team1Logo ?? raw.left_team_image,
    team2Logo: raw.team2Logo ?? raw.right_team_image,
    startTime: raw.startTime ?? raw.match_time ?? raw.start_time,
    venue: raw.venue ?? raw.venue_name,
    format: raw.format ?? raw.match_type,
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
 */
export function shouldShowMatchCard(match: MatchInfo | any): boolean {
  const apps = getSupportedFantasyApps(match);
  return apps.includes("dream11") || apps.includes("my11circle");
}

export async function getMatches(sport: Sport): Promise<MatchInfo[]> {
  const resp = await rawFetch(`/api/fantasy/matches/${sport}`, { method: "GET" });
  if (resp.status && resp.status !== "success") return [];
  const data = unpackData<MatchInfo[] | MatchInfo>(resp);
  if (Array.isArray(data)) return data.map(normalizeMatch);
  if (data) return [normalizeMatch(data)];
  return [];
}

export async function getMatchDetail(matchId: string | number): Promise<MatchInfo | null> {
  const resp = await rawFetch(`/api/fantasy/match/${matchId}`, { method: "GET" });
  if (resp.status && resp.status !== "success") return null;
  const data = unpackData<MatchInfo>(resp);
  return data ? normalizeMatch(data) : null;
}

export async function getPromotions(): Promise<PromotionItem[]> {
  const resp = await rawFetch<ApiResponse>(`/api/promotion/getlist`, { method: "GET" });
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
  // The expert/teamlist endpoint returns match IDs, not teams themselves.
  // We treat each match ID as a "team row" placeholder; the UI can fetch
  // real teams per-match via getMatchDetail + listTeams.
  const resp = await rawFetch<ApiResponse>(`/api/expert/teamlist`, {
    method: "POST",
    body: buildEncryptedBody({}),
  });
  if (resp.status !== "success") return [];
  const matchIds = resp.expertTeamData || [];
  return matchIds.map((id, i) => ({
    teamId: id,
    teamNo: i + 1,
    type: "expert",
  } as TeamRow));
}

export async function getPrimeTeams(): Promise<TeamRow[]> {
  const resp = await rawFetch<ApiResponse>(`/api/primeteam/teamlist`, { method: "GET" });
  if (resp.status !== "success") return [];
  const matchIds = (Array.isArray(resp.data) ? resp.data : []) as string[];
  return matchIds.map((id, i) => ({
    teamId: id,
    teamNo: i + 1,
    type: "prime",
  } as TeamRow));
}

/* ---------- Fantasy platform endpoints (plain JSON, no AES) ---------- */

/**
 * Verify a Dream11/My11Circle auth token BEFORE transfer.
 *
 * Uses the server-side proxy at /api/auth/verify (mirrors the original
 * teamgeneration.in APK flow). The proxy:
 *   - Calls https://tgsoftware-api.online/api/fantasy/auth/verify
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
 * Falls back to localStorage when no real fantasy token is available.
 */
export async function listFantasyTeams(params: {
  fantasyApp: FantasyApp;
  authToken: string;
  matchId: string | number;
}): Promise<TeamRow[]> {
  // Only skip the API call for empty tokens — always try the real API
  if (!params.authToken) {
    return [];
  }

  const resp = await rawFetch<ApiResponse>(`/api/fantasy/list-of-teams`, {
    method: "POST",
    body: JSON.stringify({
      fantasyApp: params.fantasyApp,
      matchId: params.matchId,
      authToken: params.authToken,
    }),
  });
  if (resp.status === "success" && Array.isArray(resp.teams_list)) {
    return resp.teams_list.map((t) => ({
      teamId: String(t.team_id),
      teamNo: t.team_number,
      team_id: t.team_id,
      team_number: t.team_number,
      fantasyApp: params.fantasyApp,
    } as TeamRow));
  }
  // Backend failed — return empty (don't mix with localStorage)
  return [];
}

/* ---------- Local team store (guest mode) ---------- */

const LOCAL_TEAMS_KEY = "fantasypro-local-teams";
const LOCAL_FANTASY_TOKENS_KEY = "fantasypro-fantasy-tokens";

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
    my11circleChallenge?: string;
    my11circleUserId?: string;
    maxAllowedTeam?: number | null;
    subscriptionTier?: string | null;
  }
) {
  if (typeof window === "undefined") return;
  const all = JSON.parse(localStorage.getItem(LOCAL_FANTASY_TOKENS_KEY) || "{}");
  // Preserve existing fields (e.g. maxAllowedTeam) if not provided in this call
  const existing = all[app] && typeof all[app] === "object" ? all[app] : {};
  all[app] = {
    ...existing,
    token,
    mobile: extras?.mobile || existing.mobile || null,
    my11circleChallenge: extras?.my11circleChallenge || existing.my11circleChallenge || null,
    my11circleUserId: extras?.my11circleUserId || existing.my11circleUserId || null,
    maxAllowedTeam: extras?.maxAllowedTeam ?? existing.maxAllowedTeam ?? null,
    subscriptionTier: extras?.subscriptionTier || existing.subscriptionTier || null,
    linkedAt: Date.now(),
  };
  localStorage.setItem(LOCAL_FANTASY_TOKENS_KEY, JSON.stringify(all));
}

export function getFantasyToken(app: FantasyApp): string | null {
  if (typeof window === "undefined") return null;
  try {
    const all = JSON.parse(localStorage.getItem(LOCAL_FANTASY_TOKENS_KEY) || "{}");
    const entry = all[app];
    if (!entry) return null;
    // Backward compat: entry may be a plain string from older versions
    return typeof entry === "string" ? entry : entry.token;
  } catch {
    return null;
  }
}

export interface LinkedFantasyAccount {
  app: FantasyApp;
  token: string;
  mobile?: string | null;
  my11circleChallenge?: string | null;
  my11circleUserId?: string | null;
  /** Dream11 only: max teams per match based on subscription tier (null = use default 40) */
  maxAllowedTeam?: number | null;
  /** Dream11 only: subscription tier label (e.g. "Pro", "Max") */
  subscriptionTier?: string | null;
  linkedAt?: number;
}

export function getLinkedAccount(app: FantasyApp): LinkedFantasyAccount | null {
  if (typeof window === "undefined") return null;
  try {
    const all = JSON.parse(localStorage.getItem(LOCAL_FANTASY_TOKENS_KEY) || "{}");
    const entry = all[app];
    if (!entry) return null;
    if (typeof entry === "string") {
      return { app, token: entry };
    }
    return {
      app,
      token: entry.token,
      mobile: entry.mobile,
      my11circleChallenge: entry.my11circleChallenge,
      my11circleUserId: entry.my11circleUserId,
      maxAllowedTeam: entry.maxAllowedTeam ?? null,
      subscriptionTier: entry.subscriptionTier ?? null,
      linkedAt: entry.linkedAt,
    };
  } catch {
    return null;
  }
}

export function listFantasyApps(): FantasyApp[] {
  if (typeof window === "undefined") return [];
  try {
    const all = JSON.parse(localStorage.getItem(LOCAL_FANTASY_TOKENS_KEY) || "{}");
    return Object.keys(all) as FantasyApp[];
  } catch {
    return [];
  }
}

export function listLinkedAccounts(): LinkedFantasyAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const all = JSON.parse(localStorage.getItem(LOCAL_FANTASY_TOKENS_KEY) || "{}");
    return Object.keys(all).map((app) => {
      const entry = all[app];
      if (typeof entry === "string") {
        return { app: app as FantasyApp, token: entry };
      }
      return {
        app: app as FantasyApp,
        token: entry.token,
        mobile: entry.mobile,
        my11circleChallenge: entry.my11circleChallenge,
        my11circleUserId: entry.my11circleUserId,
        linkedAt: entry.linkedAt,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Unlink a fantasy account — removes the token + extras from localStorage.
 * After this, the user will be asked to login again on next transfer.
 */
export function unlinkFantasyApp(app: FantasyApp) {
  if (typeof window === "undefined") return;
  try {
    const all = JSON.parse(localStorage.getItem(LOCAL_FANTASY_TOKENS_KEY) || "{}");
    delete all[app];
    localStorage.setItem(LOCAL_FANTASY_TOKENS_KEY, JSON.stringify(all));
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
  // but the actual FantasyPro backend uses /api/dream11/teams/{matchId} for
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

    const endpoint =
      params.authToken && params.fantasyApp === "dream11"
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
    });
    return {
      contestId: params.contestId,
      success: resp.status === "success",
      teamIds: params.teamIds,
      message: resp.message || (resp.status === "success" ? "Joined" : "Failed"),
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
    const endpoint =
      params.fantasyApp === "dream11"
        ? `/api/dream11/contest/all-free-status`
        : `/api/my11circle/contest/all-free-status`;
    const res = await rawFetch<ApiResponse>(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        authToken: params.authToken,
        matchId: params.matchId,
        allTeamIds: params.allTeamIds,
      }),
    });
    if (res.status === "success") {
      return { status: "success", contests: (res.contests || []) as FreeContest[] };
    }
    return {
      status: "fail",
      message: resp_message(res) || "Failed to fetch free contests",
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
    const endpoint =
      params.fantasyApp === "dream11"
        ? `/api/dream11/contest/join-contest`
        : `/api/my11circle/contest/join-contest`;
    const res = await rawFetch<ApiResponse>(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        authToken: params.authToken,
        matchId: params.matchId,
        contestId: params.contestId,
        teamIds: params.teamIds,
      }),
    });
    return {
      status: res.status === "success" ? "success" : "fail",
      message: resp_message(res),
      contestId: params.contestId,
      joinResults: (res.joinResults || []) as Array<{ teamId: number; success: boolean }>,
      summary: (res.summary as { successCount: number; failedCount: number }) || {
        successCount: 0,
        failedCount: params.teamIds.length,
      },
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

export async function sendFantasyOtp(params: {
  fantasyApp: FantasyApp;
  mobileNumber: string;
}): Promise<SendOtpResult> {
  const res = await rawFetch<ApiResponse>(`/api/fantasy/send-otp`, {
    method: "POST",
    body: JSON.stringify({
      fantasyApp: params.fantasyApp,
      mobileNumber: params.mobileNumber,
    }),
  });
  if (res.status === "success" && res.data && typeof res.data === "object") {
    const d = res.data as Record<string, unknown>;
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

  const res = await rawFetch<ApiResponse>(`/api/fantasy/verify-otp`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (res.status === "success" && res.data && typeof res.data === "object") {
    const d = res.data as Record<string, unknown>;
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
    });
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
    if (i < teams.length - 1) await new Promise((r) => setTimeout(r, 200));
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
  // Per-team delay between transfers — keeps us under the platform's rate limit
  // without making a 40-team bulk transfer take 80+ seconds.
  //   - Dream11: 200ms (very lenient rate limit, can handle rapid requests)
  //   - My11Circle: 500ms (slightly stricter rate limit, but still tolerates fast bulk)
  //   - Default: 500ms
  // Total time for 40 teams: ~8-20 seconds + per-team transfer time.
  const delay = params.fantasyApp === "dream11" ? 200 : 500;

  // ─── PRE-TRANSFER AUTH VERIFY ──────────────────────────────────────────
  //
  // IMPORTANT: We SKIP pre-verification by default — this matches the original
  // teamgeneration.in APK behavior. The original route.ts source explicitly says:
  //
  //   "Pre-verification adds latency and may give false negatives
  //    (server says expired but token works)"
  //
  // The /api/transfer proxy already handles token expiry REACTIVELY during the
  // actual transfer:
  //   - Detects "Proxy returned 400/401/403" from the platform → returns needsReauth
  //   - Detects "token expired" / "jwt expired" / "invalid token" → returns needsReauth
  //   - Stops the bulk transfer immediately when the first team fails with auth error
  //
  // Calling /api/fantasy/auth/verify before transfer was causing FALSE "session
  // expired" warnings for Dream11 users with valid tokens. So we only pre-verify
  // if the caller explicitly sets skipVerify=false.
  //
  // Default: SKIP pre-verify (matches original APK).
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
      // Token definitively expired — block transfer, signal re-auth required
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

    // If the backend refreshed the token, use the new one for transfers
    if (verifyResult.refreshed) {
      const freshToken = getFantasyToken(params.fantasyApp);
      if (freshToken) {
        params = { ...params, authToken: freshToken };
        console.log("[bulkTransfer] Using refreshed token from updateUiToken");
      }
    }
  } else {
    console.log("[bulkTransfer] Skipping pre-verify (default) — reactive auth detection in /api/transfer");
  }

  for (let i = 0; i < teams.length; i++) {
    const t = teams[i];
    const isReplace = params.replaceMode && params.existingTeamIds && i < params.existingTeamIds.length;
    const numericPlayers = t.playerIds.map((id) => Number(id)).filter((n) => !isNaN(n));
    const numericCaptain = Number(t.captainId);
    const numericVC = Number(t.viceCaptainId);

    const body: Record<string, unknown> = {
      matchId: params.matchId,
      captain: isNaN(numericCaptain) ? t.captainId : numericCaptain,
      vice_captain: isNaN(numericVC) ? t.viceCaptainId : numericVC,
      players: numericPlayers.length > 0 ? numericPlayers : t.playerIds,
      fantasyApp: params.fantasyApp,
      authToken: params.authToken,
      sportIndex: params.sportIndex ?? 0,
      type: isReplace ? "edit" : "new",
    };
    if (isReplace && params.existingTeamIds) body.id = params.existingTeamIds[i];
    if (params.fantasyApp === "my11circle") {
      body.my11circleChallenge = params.my11circleChallenge || null;
      body.my11circleUserId = params.my11circleUserId || null;
      body.my11circleMobile = params.mobileNumber || null;
    }

    try {
      // Call our server-side /api/transfer proxy instead of hitting the backend directly.
      // The proxy handles:
      //   - Multi-endpoint fallback (dream11: /api/fantasy/add-team → /api/classic/dream11/addteam)
      //   - Bug-aware success detection (HTTP 201 + "Something Went Wrong!" = tentative success)
      //   - Token expiry detection (returns needsReauth: true)
      //   - Edit → Add fallback if edit fails on all endpoints
      //   - AES decryption of response data
      const proxyBody = {
        ...body,
        skipPreVerify: true, // we already did pre-verify above; skip to avoid double call
      };
      const proxyRes = await fetch(`/api/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(proxyBody),
        cache: "no-store",
        signal: AbortSignal.timeout(45000), // 45s — server proxy has its own 30s timeout per endpoint
      });
      const res = await proxyRes.json() as ApiResponse & {
        needsReauth?: boolean;
        confidence?: "definite" | "tentative";
        code?: string;
        backendError?: string;
      };

      if (res.status === "success") {
        successCount++;
        const confidence = res.confidence === "tentative" ? " (tentative)" : "";
        results.push({ teamNo: t.teamNo, success: true, message: res.message || `Transferred${confidence}` });
        transferLinks.push({ teamNo: t.teamNo });
      } else if (res.needsReauth) {
        // Token expired — record the failure with the re-auth signal
        failCount++;
        const msg = (res.error as string) || (res.message as string) || "Token expired — re-link via OTP";
        results.push({ teamNo: t.teamNo, success: false, message: msg });
        transferLinks.push({ teamNo: t.teamNo });
        // Bail out early on confirmed token expiry — no point trying remaining teams
        // (they'll all fail with the same expired token)
        for (let j = i + 1; j < teams.length; j++) {
          failCount++;
          results.push({ teamNo: teams[j].teamNo, success: false, message: "Skipped — token expired" });
          transferLinks.push({ teamNo: teams[j].teamNo });
          onProgress?.(j + 1, teams.length);
        }
        return {
          totalAttempted: teams.length,
          successCount,
          failCount,
          results,
          transferLinks,
          needsReauth: true,
          blockReason: msg,
        };
      } else {
        failCount++;
        results.push({ teamNo: t.teamNo, success: false, message: (res.error as string) || (res.message as string) || "Failed" });
        transferLinks.push({ teamNo: t.teamNo });
      }
    } catch (err: any) {
      failCount++;
      results.push({ teamNo: t.teamNo, success: false, message: err?.message || "Network error" });
      transferLinks.push({ teamNo: t.teamNo });
    }
    onProgress?.(i + 1, teams.length);
    if (i < teams.length - 1) await new Promise((r) => setTimeout(r, delay));
  }

  return { totalAttempted: teams.length, successCount, failCount, results, transferLinks };
}
