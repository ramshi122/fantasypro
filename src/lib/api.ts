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
  playing?: number;
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
  validToken?: boolean;
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
 * Verify a Dream11/My11Circle auth token with the backend.
 * The backend proxies the call to the actual fantasy platform.
 *
 * In guest mode we mock this: any non-empty token is "valid".
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
  // Guest bypass: any non-empty token is considered valid.
  if (!params.authToken || params.authToken.startsWith("guest_")) {
    return {
      status: "success",
      validToken: true,
      updateUiToken: false,
      authToken: params.authToken,
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

  const resp = await rawFetch<ApiResponse>(`/api/fantasy/auth/verify`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return resp as AuthVerifyResponse;
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
  // Guest bypass: read from localStorage
  if (!params.authToken || params.authToken.startsWith("guest_")) {
    return readLocalTeams(String(params.matchId));
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
  return readLocalTeams(String(params.matchId));
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
 */
export function saveFantasyToken(app: FantasyApp, token: string) {
  if (typeof window === "undefined") return;
  const all = JSON.parse(localStorage.getItem(LOCAL_FANTASY_TOKENS_KEY) || "{}");
  all[app] = token;
  localStorage.setItem(LOCAL_FANTASY_TOKENS_KEY, JSON.stringify(all));
}

export function getFantasyToken(app: FantasyApp): string | null {
  if (typeof window === "undefined") return null;
  try {
    const all = JSON.parse(localStorage.getItem(LOCAL_FANTASY_TOKENS_KEY) || "{}");
    return all[app] || null;
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
  // Guest bypass: simulate success without hitting the backend.
  // The real backend requires BOTH:
  //   1. A FantasyPro JWT in the Authorization: Bearer header (user_token)
  //   2. A Dream11/My11Circle auth token in the body (authToken)
  // In guest mode we only have (2), so we mock the transfer locally.
  if (!params.authToken || params.authToken.startsWith("guest_") || params.authToken.startsWith("test_")) {
    // Mark teams as transferred in localStorage
    const all = readLocalTeams();
    const key = String(params.matchId);
    const list = all[key] || [];
    for (const t of list) {
      if (params.teamIds.includes(Number(t.teamNo))) {
        t.transferred = true;
        t.transferStatus = "transferred";
      }
    }
    all[key] = list;
    writeLocalTeams(all);
    // Simulate network latency
    await new Promise((r) => setTimeout(r, 500));
    return {
      contestId: params.contestId,
      success: true,
      teamIds: params.teamIds,
      message: "Team transferred (simulated — link a real FantasyPro account for live transfer)",
    };
  }

  // Real call — requires a FantasyPro JWT in Authorization header.
  // The user_token is stored in localStorage after a successful FantasyPro login.
  const userToken = typeof window !== "undefined" ? localStorage.getItem("user_token") : null;
  if (!userToken) {
    // No FantasyPro login — fall back to local simulation
    return joinContest({ ...params, authToken: "guest_" + params.authToken });
  }

  try {
    const resp = await rawFetch<ApiResponse>(`/api/dream11/contest/join-contest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({
        authToken: params.authToken,
        matchId: params.matchId,
        contestId: params.contestId,
        teamIds: params.teamIds,
      }),
    });
    const successCount = resp.summary?.successCount ?? 0;
    const failedCount = resp.summary?.failedCount ?? 0;
    return {
      contestId: params.contestId,
      success: resp.status === "success" && successCount > 0,
      teamIds: params.teamIds,
      message: successCount > 0
        ? `Joined contest — ${successCount} team(s) joined, ${failedCount} failed`
        : (resp.message || "Transfer failed"),
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

/* ---------- Mobile OTP Login (fantasy platform linking) ---------- */

export interface SendOtpResult {
  status: "success" | "fail";
  message?: string;
  state?: string; // dream11
  reasonCode?: number; // my11circle
  challenge?: string; // my11circle
  login_auth_token?: string; // myteam11
  userId?: string; // vision11
  retries_left?: number;
  resends_left?: number;
}

/**
 * Send OTP to a fantasy platform mobile number.
 * The backend proxies the OTP request to dream11/my11circle/myteam11/vision11.
 * NO FantasyPro JWT required — this is a public endpoint.
 */
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
      message: resp_message(res),
      state: d.state as string | undefined,
      reasonCode: d.reasonCode as number | undefined,
      challenge: d.challenge as string | undefined,
      login_auth_token: d.login_auth_token as string | undefined,
      userId: d.userId as string | undefined,
      retries_left: d.retries_left as number | undefined,
      resends_left: d.resends_left as number | undefined,
    };
  }
  return { status: "fail", message: resp_message(res) };
}

function resp_message(r: ApiResponse): string {
  return (r.message as string) || "";
}

export interface VerifyOtpResult {
  status: "success" | "fail";
  message?: string;
  token?: string; // the fantasy platform auth token (used for /api/fantasy/add-team)
  my11circleChallenge?: string;
  my11circleUserId?: string;
  mobileNumber?: string;
}

/**
 * Verify OTP and obtain the fantasy platform auth token.
 * Stores the token in localStorage so subsequent transfers work.
 */
export async function verifyFantasyOtp(params: {
  fantasyApp: FantasyApp;
  mobileNumber: string;
  verificationCode: string; // 6-digit OTP
  state?: string; // dream11
  reasonCode?: number; // my11circle
  challenge?: string; // my11circle
  login_auth_token?: string; // myteam11
  userId?: string; // vision11
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
      message: resp_message(res),
      token: d.token as string | undefined,
      my11circleChallenge: d.my11circleChallenge as string | undefined,
      my11circleUserId: d.my11circleUserId as string | undefined,
      mobileNumber: params.mobileNumber,
    };
  }
  return { status: "fail", message: resp_message(res) || "Invalid OTP" };
}

/* ---------- Direct Team Transfer (NO Dream11 token required) ---------- */

export interface DirectTransferResult {
  status: "success" | "fail";
  message?: string;
  link?: string; // the dream11 transfer URL the user opens manually
}

/**
 * Generate a direct Dream11 transfer link for a single team.
 *
 * Calls POST /api/classic/dream11/addteam with the team's player IDs and
 * captain/vice-captain. The backend returns a one-time dream11.com URL that,
 * when opened, pre-fills the team in Dream11 — NO Dream11 auth token needed.
 *
 * The match MUST have dream11 player IDs in its fantasy_id_list. If the match
 * only supports my11circle, the backend returns an error.
 */
export async function generateDirectTransferLink(params: {
  matchId: string; // MongoDB _id of the match
  playerIds: string[]; // dream11 player IDs (from fantasy_id_list where name="dream11")
  captainId: string;
  viceCaptainId: string;
}): Promise<DirectTransferResult> {
  try {
    const res = await rawFetch<ApiResponse>(`/api/classic/dream11/addteam`, {
      method: "POST",
      body: JSON.stringify({
        tgMatchId: params.matchId,
        playerData: params.playerIds,
        captainData: params.captainId,
        vicecaptainData: params.viceCaptainId,
        generateLinkFlag: "general",
      }),
    });
    if (res.status === "success" && res.data) {
      // data may be encrypted string or {link: "..."}
      let link: string | undefined;
      if (typeof res.data === "string") {
        const dec = decrypt<{ link?: string }>(res.data);
        link = dec?.link;
      } else if (typeof res.data === "object") {
        link = (res.data as { link?: string }).link;
      }
      if (link) {
        return { status: "success", link };
      }
    }
    return {
      status: "fail",
      message: resp_message(res) || "Transfer failed — match may not support Dream11 direct transfer",
    };
  } catch (err: any) {
    return {
      status: "fail",
      message: err?.message || "Network error during transfer",
    };
  }
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
  results: Array<{
    teamNo: number;
    success: boolean;
    message?: string;
  }>;
  transferLinks: Array<{ teamNo: number; link?: string }>; // for direct-link mode
}

/**
 * Bulk transfer teams to Dream11 via direct link generation.
 * For each team, generates a one-time Dream11 transfer URL (no auth required).
 * Returns all links so the user can open them one by one.
 *
 * Rate-limited to avoid backend throttling (200ms between requests).
 */
export async function bulkDirectTransfer(
  teams: BulkTransferItem[],
  matchId: string,
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
    // Rate limit: 200ms between requests (matches dream11 backend limit)
    if (i < teams.length - 1) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return {
    totalAttempted: teams.length,
    successCount,
    failCount,
    results,
    transferLinks,
  };
}

/**
 * Bulk transfer teams to a LINKED fantasy account via /api/fantasy/add-team.
 * Requires the user to have completed OTP login and have an authToken saved.
 *
 * Body format (per team):
 *   {matchId, captain, vice_captain, players, fantasyApp, authToken, sportIndex, type: "new"}
 */
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
  },
  onProgress?: (done: number, total: number) => void
): Promise<BulkTransferResult> {
  const results: BulkTransferResult["results"] = [];
  const transferLinks: BulkTransferResult["transferLinks"] = [];
  let successCount = 0;
  let failCount = 0;
  const delay = params.fantasyApp === "dream11" ? 200 : 2000;

  for (let i = 0; i < teams.length; i++) {
    const t = teams[i];
    const body: Record<string, unknown> = {
      matchId: params.matchId,
      captain: t.captainId,
      vice_captain: t.viceCaptainId,
      players: t.playerIds,
      fantasyApp: params.fantasyApp,
      authToken: params.authToken,
      sportIndex: params.sportIndex ?? 0,
      type: "new",
    };
    if (params.fantasyApp === "my11circle") {
      body.my11circleChallenge = params.my11circleChallenge || null;
      body.my11circleUserId = params.my11circleUserId || null;
      body.my11circleMobile = params.mobileNumber || null;
    }
    if (params.fantasyApp === "vision11" && params.mobileNumber) {
      body.userId = params.mobileNumber;
    }

    try {
      const res = await rawFetch<ApiResponse>(`/api/fantasy/add-team`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (res.status === "success") {
        successCount++;
        results.push({ teamNo: t.teamNo, success: true });
        transferLinks.push({ teamNo: t.teamNo });
      } else {
        failCount++;
        results.push({ teamNo: t.teamNo, success: false, message: resp_message(res) });
        transferLinks.push({ teamNo: t.teamNo });
      }
    } catch (err: any) {
      failCount++;
      results.push({ teamNo: t.teamNo, success: false, message: err?.message });
      transferLinks.push({ teamNo: t.teamNo });
    }
    onProgress?.(i + 1, teams.length);
    if (i < teams.length - 1) {
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  return {
    totalAttempted: teams.length,
    successCount,
    failCount,
    results,
    transferLinks,
  };
}
