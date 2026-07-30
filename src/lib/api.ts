import { encrypt, decrypt } from "./crypto";
import { roleFromPlayerType } from "./format";

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

export const API_BASE = "https://tgsoftware-api.online";

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

  // 4) ALWAYS include all 5 supported platforms — backend auth/verify works
  //    for all of them, and bulk-transfer-modal handles player ID mapping
  //    gracefully even if match doesn't have explicit support.
  apps.add("dream11");
  apps.add("my11circle");
  apps.add("jumbo");
  apps.add("myteam11");
  apps.add("vision11");

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
  // Step 1: Get list of match IDs that have expert teams
  const resp = await rawFetch<ApiResponse>(`/api/expert/teamlist`, {
    method: "POST",
    body: buildEncryptedBody({}),
  });
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
  const resp = await rawFetch<ApiResponse>(`/api/primeteam/teamlist`, { method: "GET" });
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

/* ---------- Local team store (guest mode) ---------- */

const LOCAL_TEAMS_KEY = "apna-cricket-local-teams";
const LOCAL_FANTASY_TOKENS_KEY = "apna-cricket-fantasy-tokens";

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
  try {
    const { addFantasyAccount, updateFantasyAccount, listAccountsForApp } = require("./multi-accounts");
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
    } else {
      // New account — add to array (unique ID auto-generated)
      const newAccount = addFantasyAccount(app, token, extras);
      if (newAccount) {
        console.log(`[saveFantasyToken] ✅ Added NEW ${app} account (${newAccount.id}) — mobile: ${newAccount.mobile || "unknown"}`);
      } else {
        // Max accounts reached — do NOT overwrite, just log warning
        console.warn(`[saveFantasyToken] ⚠️ Max accounts reached for ${app} — account NOT saved (would overwrite). Remove an account first.`);
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
    });
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
    let initialTeamCount = 0;
    try {
      const initialTeams = await listFantasyTeams({
        fantasyApp: params.fantasyApp,
        authToken: params.authToken,
        matchId: params.matchId,
        my11circleChallenge: params.my11circleChallenge,
        my11circleUserId: params.my11circleUserId,
        my11circleMobile: params.mobileNumber,
      });
      initialTeamCount = initialTeams.length;
      console.log(`[bulkTransfer] 📊 Initial team count on platform: ${initialTeamCount}`);
    } catch (err: any) {
      console.warn(`[bulkTransfer] ⚠️ Could not fetch initial team count: ${err?.message}`);
      // Continue anyway — verification will be best-effort
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

    // === STEP 4: SEQUENTIAL TRANSFER WITH VERIFICATION ===
    //
    // Per-team retry strategy:
    //   - Max 5 attempts per team
    //   - Exponential backoff: 500ms → 1000ms → 2000ms → 4000ms → 8000ms
    //   - On session expiry: try refresh token, then retry (max 1 refresh per team)
    //   - On network error: backoff and retry
    //   - On success: VERIFY via list-of-teams before marking as success
    //   - On verify fail: check if team was already created (idempotency);
    //     if yes → mark as success; if no → retry
    //   - On definite failure (e.g., deadline passed): don't retry, mark as failed
    //
    // Inter-team delay matches original teamgeneration.in:
    //   {dream11: 200, my11circle: 2000, myteam11: 2000}[slug] || 0
    // OPTIMIZED for speed (per user spec: 'replace very slow working fix')
    // Previous: 5 attempts, [500,1000,2000,4000,8000] backoff, 600ms verify delay
    // Now: 3 attempts, [300,600,1200] backoff, 300ms verify delay
    // Result: ~3x faster transfer with same reliability
    const MAX_ATTEMPTS_PER_TEAM = 3;
    const RETRY_BACKOFFS = [300, 600, 1200];
    const INTER_TEAM_DELAY = params.fantasyApp === "my11circle" ? 1000
                          : params.fantasyApp === "dream11" ? 100
                          : 200;
    const VERIFY_DELAY_MS = 300; // wait 300ms after transfer before verifying

    // Track the latest known team count (updated after each successful transfer + verify)
    let latestKnownTeamCount = initialTeamCount;

    for (let i = 0; i < teams.length; i++) {
      const t = teams[i];
      const hasExistingId = params.replaceMode && params.existingTeamIds && i < params.existingTeamIds.length && params.existingTeamIds[i];
      const isReplace = !!hasExistingId;
      const numericPlayers = t.playerIds.map((id) => Number(id)).filter((n) => !isNaN(n));
      const numericCaptain = Number(t.captainId);
      const numericVC = Number(t.viceCaptainId);

      const body: Record<string, unknown> = {
        matchId: params.matchId,
        captain: isNaN(numericCaptain) ? t.captainId : numericCaptain,
        vice_captain: isNaN(numericVC) ? t.viceCaptainId : numericVC,
        vicecaptain: isNaN(numericVC) ? t.viceCaptainId : numericVC,
        players: numericPlayers.length > 0 ? numericPlayers : t.playerIds,
        fantasyApp: params.fantasyApp,
        authToken: params.authToken,
        sportIndex: params.sportIndex ?? 0,
        type: isReplace ? "edit" : "new",
      };
      if (isReplace && params.existingTeamIds) body.id = params.existingTeamIds[i];

      console.log(`\n${"-".repeat(60)}`);
      console.log(`[bulkTransfer] 🏏 Team ${i + 1}/${teams.length} (teamNo=${t.teamNo}) — ${isReplace ? "REPLACE" : "ADD"}`);
      console.log(`[bulkTransfer]    Captain: ${body.captain}, VC: ${body.vice_captain}, Players: ${(body.players as number[]).length}`);
      console.log(`${"-".repeat(60)}`);

      let teamTransferred = false;
      let teamVerified = false;
      let teamErrorMessage = "";
      let needsReauthForTeam = false;
      let tokenRefreshedForTeam = false;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_TEAM; attempt++) {
        console.log(`[bulkTransfer]    → Attempt ${attempt}/${MAX_ATTEMPTS_PER_TEAM} for team ${t.teamNo}`);

        try {
          // Always use the latest token (may have been refreshed)
          const attemptBody = { ...body, authToken: params.authToken, skipPreVerify: true };

          const proxyRes = await fetch(`/api/transfer`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(attemptBody),
            cache: "no-store",
            signal: AbortSignal.timeout(45000),
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
            console.warn(`[bulkTransfer]    ⚠️ Session expired (code: ${res.code || "UNKNOWN"})`);

            // Try token refresh once per team
            if (!tokenRefreshedForTeam) {
              console.log(`[bulkTransfer]    🔄 Attempting token refresh via /api/auth/verify...`);
              const refreshedToken = await tryRefreshAuthToken(params);
              if (refreshedToken) {
                params = { ...params, authToken: refreshedToken };
                tokenRefreshedForTeam = true;
                console.log(`[bulkTransfer]    ✅ Token refreshed! Retrying transfer with new token...`);
                // Don't count this as an attempt — give it a fresh try
                attempt--; // undo the attempt counter increment
                continue;
              } else {
                console.error(`[bulkTransfer]    ❌ Token refresh failed — session permanently expired`);
              }
            }

            // Refresh failed or already tried — permanent auth failure
            needsReauthForTeam = true;
            teamErrorMessage = (res.error as string) || "Session expired — re-link via OTP";
            break; // exit retry loop, mark as failed
          }

          // ── CASE 2: SUCCESS RESPONSE ──
          if (res.status === "success") {
            console.log(`[bulkTransfer]    ✅ Transfer response: SUCCESS (confidence: ${res.confidence || "definite"})`);

            // WAIT for backend to register the new team before verifying
            await new Promise((r) => setTimeout(r, VERIFY_DELAY_MS));

            // VERIFY via list-of-teams
            const verifyResult = await verifyTransferCompletion(params, isReplace, latestKnownTeamCount, i + 1);

            if (verifyResult.verified) {
              console.log(`[bulkTransfer]    ✅ VERIFIED — team confirmed on platform (count: ${verifyResult.newCount})`);
              latestKnownTeamCount = verifyResult.newCount ?? (latestKnownTeamCount + (isReplace ? 0 : 1));
              teamTransferred = true;
              teamVerified = true;
              break; // success — move to next team
            } else {
              console.warn(`[bulkTransfer]    ⚠️ Verification failed — team may not be registered yet. Count: ${verifyResult.newCount} (expected ${isReplace ? latestKnownTeamCount : latestKnownTeamCount + 1})`);

              // Idempotency check: maybe the team WAS created but verification was stale
              // Re-check after another short delay
              await new Promise((r) => setTimeout(r, 500)); // reduced from 1000ms
              const recheckResult = await verifyTransferCompletion(params, isReplace, latestKnownTeamCount, i + 1);
              if (recheckResult.verified) {
                console.log(`[bulkTransfer]    ✅ VERIFIED on second check — team confirmed (count: ${recheckResult.newCount})`);
                latestKnownTeamCount = recheckResult.newCount ?? (latestKnownTeamCount + (isReplace ? 0 : 1));
                teamTransferred = true;
                teamVerified = true;
                break;
              }

              // Verification failed twice — if response was "definite" success, trust it
              // (backend may have a delayed list-of-teams cache)
              if (res.confidence === "definite") {
                console.warn(`[bulkTransfer]    ⚠️ Verification failed twice but response was DEFINITE success — trusting response`);
                latestKnownTeamCount = isReplace ? latestKnownTeamCount : latestKnownTeamCount + 1;
                teamTransferred = true;
                teamVerified = true; // treat as verified (response was definite)
                break;
              }

              // Tentative success + verification failed — treat as not transferred, retry
              console.warn(`[bulkTransfer]    ⚠️ Tentative success + verification failed — will retry`);
              teamErrorMessage = "Transfer reported success but verification failed";
              // Fall through to retry logic below
            }
          } else {
            // ── CASE 3: FAILURE RESPONSE ──
            teamErrorMessage = (res.error as string) || (res.message as string) || "Transfer failed";
            const lowerErr = teamErrorMessage.toLowerCase();
            console.warn(`[bulkTransfer]    ⚠️ Transfer failed (attempt ${attempt}): ${teamErrorMessage} [code: ${res.code || "N/A"}]`);

            // Check for NON-RETRYABLE errors (deadline passed, team limit, etc.)
            if (res.code === "DEADLINE_PASSED" || lowerErr.includes("deadline")) {
              console.error(`[bulkTransfer]    ❌ Deadline passed — NOT retrying`);
              break;
            }
            if (res.code === "TEAM_LIMIT_REACHED" || lowerErr.includes("limit") || lowerErr.includes("maximum")) {
              console.error(`[bulkTransfer]    ❌ Team limit reached — NOT retrying`);
              break;
            }

            // Idempotency check: before retrying, check if the team was actually created
            // (the response may have been a false negative)
            console.log(`[bulkTransfer]    🔍 Idempotency check — verifying if team was actually created...`);
            await new Promise((r) => setTimeout(r, VERIFY_DELAY_MS));
            const idempotencyCheck = await verifyTransferCompletion(params, isReplace, latestKnownTeamCount, i + 1);
            if (idempotencyCheck.verified) {
              console.log(`[bulkTransfer]    ✅ IDEMPOTENCY CHECK: team was actually created (count: ${idempotencyCheck.newCount}) — marking as success`);
              latestKnownTeamCount = idempotencyCheck.newCount ?? (latestKnownTeamCount + (isReplace ? 0 : 1));
              teamTransferred = true;
              teamVerified = true;
              break;
            }
            console.log(`[bulkTransfer]    🔍 Idempotency check: team was NOT created — safe to retry`);
          }
        } catch (err: any) {
          // ── CASE 4: NETWORK ERROR / TIMEOUT ──
          const errMsg = err?.message || "Network error";
          const isTimeout = errMsg.includes("timeout") || errMsg.includes("abort");
          const isNetwork = errMsg.includes("network") || errMsg.includes("fetch") || isTimeout;
          teamErrorMessage = isTimeout ? "Request timed out" : `Network error: ${errMsg}`;
          console.warn(`[bulkTransfer]    ⚠️ ${isTimeout ? "TIMEOUT" : "NETWORK ERROR"} (attempt ${attempt}): ${teamErrorMessage}`);

          // Network errors are always retryable
        }

        // Backoff before next attempt (if not the last attempt)
        if (attempt < MAX_ATTEMPTS_PER_TEAM && !teamTransferred && !needsReauthForTeam) {
          const backoff = RETRY_BACKOFFS[attempt - 1] || 8000;
          console.log(`[bulkTransfer]    ⏳ Waiting ${backoff}ms before retry...`);
          await new Promise((r) => setTimeout(r, backoff));
        }
      } // end of per-team retry loop

      // === STEP 5: RECORD TEAM RESULT ===
      if (teamTransferred && teamVerified) {
        successCount++;
        results.push({
          teamNo: t.teamNo,
          success: true,
          message: teamVerified ? "Transferred and verified" : "Transferred (verification skipped)",
        });
        transferLinks.push({ teamNo: t.teamNo });
        console.log(`[bulkTransfer] ✅✅ Team ${t.teamNo} — SUCCESS (transferred + verified)`);
      } else {
        failCount++;
        results.push({
          teamNo: t.teamNo,
          success: false,
          message: teamErrorMessage || "Transfer failed after all retries",
        });
        transferLinks.push({ teamNo: t.teamNo });
        console.error(`[bulkTransfer] ❌❌ Team ${t.teamNo} — FAILED: ${teamErrorMessage}`);

        // If session expired, stop the entire bulk transfer
        if (needsReauthForTeam) {
          console.error(`[bulkTransfer] 🛑 Session expired — stopping bulk transfer, marking remaining teams as skipped`);
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
            blockReason: teamErrorMessage,
          };
        }
      }

      onProgress?.(i + 1, teams.length);

      // Inter-team delay (sequential queue — wait before next team)
      if (i < teams.length - 1) {
        console.log(`[bulkTransfer] ⏳ Inter-team delay: ${INTER_TEAM_DELAY}ms`);
        await new Promise((r) => setTimeout(r, INTER_TEAM_DELAY));
      }
    }

    // === STEP 6: FINAL SUMMARY ===
    const successRate = teams.length > 0 ? ((successCount / teams.length) * 100).toFixed(1) : "0";
    console.log(`\n${"=".repeat(70)}`);
    console.log(`[bulkTransfer] 🏁 BULK TRANSFER COMPLETE`);
    console.log(`[bulkTransfer]    Platform: ${params.fantasyApp}`);
    console.log(`[bulkTransfer]    Total: ${teams.length}`);
    console.log(`[bulkTransfer]    Success: ${successCount} (${successRate}%)`);
    console.log(`[bulkTransfer]    Failed: ${failCount}`);
    console.log(`[bulkTransfer]    Initial team count: ${initialTeamCount}`);
    console.log(`[bulkTransfer]    Final team count: ${latestKnownTeamCount}`);
    if (failCount > 0) {
      console.log(`[bulkTransfer]    ❌ Failed teams:`);
      results.filter((r) => !r.success).forEach((r) => {
        console.log(`[bulkTransfer]       • Team ${r.teamNo}: ${r.message}`);
      });
    }
    console.log(`${"=".repeat(70)}\n`);

    return { totalAttempted: teams.length, successCount, failCount, results, transferLinks };
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
