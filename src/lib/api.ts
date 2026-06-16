import { encrypt, decrypt } from "./crypto";

/**
 * FantasyPro API client
 * Backend: https://tgsoftware-api.online
 *
 * Response format (all endpoints):
 *   { "status": "success" | "fail", "data": "<encrypted>" | ["<encrypted>", ...], ... }
 *
 * The `data` field is either:
 *   - an AES-encrypted string (decrypt to get the actual object), or
 *   - an array of AES-encrypted strings (decrypt each to get one object).
 *
 * Auth endpoints receive the token INSIDE the encrypted payload (NO Bearer prefix).
 */

export const API_BASE = "https://tgsoftware-api.online";

export type Sport = "cricket" | "football" | "basketball" | "kabaddi";

export interface MatchPlayer {
  pid?: number | string;
  name?: string;
  shortName?: string;
  team?: string;
  role?: string;
  sel?: number | string;
  points?: number | string;
  isC?: boolean;
  isVC?: boolean;
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
  team1?: MatchTeam | string;
  team2?: MatchTeam | string;
  team1Short?: string;
  team2Short?: string;
  team1Logo?: string;
  team2Logo?: string;
  startTime?: string | number;
  endTime?: string | number;
  status?: string;
  format?: string;
  venue?: string;
  type?: string;
  sport?: Sport;
  isSaved?: boolean;
  dream11Url?: string;
  my11circleUrl?: string;
  [k: string]: unknown;
}

export interface TeamRow {
  _id?: string;
  teamId?: string;
  teamNo?: number;
  players?: MatchPlayer[];
  captain?: number | string;
  viceCaptain?: number | string;
  c?: number | string;
  vc?: number | string;
  team?: string;
  type?: string;
  [k: string]: unknown;
}

export interface AuthVerifyResponse {
  status?: string;
  validToken?: boolean;
  isValid?: boolean;
  valid?: boolean;
  success?: boolean;
  message?: string;
  token?: string;
  userId?: string;
  email?: string;
  name?: string;
  mobile?: string;
  expiresAt?: string | number;
  plan?: string;
  data?: string | null;
  [k: string]: unknown;
}

export interface PromotionItem {
  _id?: string;
  title?: string;
  image?: string;
  url?: string;
  link?: string;
  description?: string;
  type?: string;
  [k: string]: unknown;
}

/* ---------- Internal helpers ---------- */

interface ApiResponse {
  status?: string;
  success?: boolean;
  validToken?: boolean;
  message?: string;
  data?: unknown;
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

  // Try to parse the body even on error responses — the backend returns
  // structured JSON for failures (e.g. 404 with {"status":"fail",...}).
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
    // For 4xx errors, return the parsed body (if any) so callers can branch on
    // `status`. For 5xx, throw to signal a real server problem.
    if (res.status >= 400 && res.status < 500 && body) {
      return body;
    }
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  return body ?? ({} as ApiResponse);
}

/**
 * Unpack the `data` field of an API response.
 * - If `data` is a string: treat it as an AES-encrypted JSON payload, decrypt → object.
 * - If `data` is an array: each item may be encrypted; decrypt each → array.
 * - Otherwise: return as-is.
 */
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
  return data as T;
}

/**
 * Build an encrypted POST body in the format the backend expects:
 *   { "payload": "<AES-encrypted JSON string>" }
 * If a token is supplied, it is placed INSIDE the encrypted payload (no Bearer header).
 */
function buildEncryptedBody(payload: Record<string, unknown>, token?: string | null) {
  const body: Record<string, unknown> = { ...payload };
  if (token) body.token = token;
  return JSON.stringify({ payload: encrypt(body) });
}

/* ---------- Match endpoints ---------- */

/**
 * Normalize the raw match object from the backend into the shape our UI expects.
 * The backend uses snake_case fields like `left_team_name`, `match_time`, `series_name`.
 * Our UI uses camelCase like `team1`, `startTime`, `series`.
 */
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

/* ---------- Auth ---------- */

export async function verifyAuth(token: string): Promise<AuthVerifyResponse> {
  const resp = await rawFetch<ApiResponse>(`/api/fantasy/auth/verify`, {
    method: "POST",
    body: buildEncryptedBody({ token }, token),
  });
  // The backend returns {status:"success", validToken:true, data:"<encrypted user>"} on success
  // and {status:"fail", validToken:false, message:"Invalid Login Token"} on failure.
  const user = unpackData<AuthVerifyResponse | null>(resp);
  return {
    ...resp,
    ...(user && typeof user === "object" ? user : {}),
    isValid: resp.status === "success" && resp.validToken !== false,
    valid: resp.status === "success" && resp.validToken !== false,
  } as AuthVerifyResponse;
}

/* ---------- Teams (per match) ---------- */

/**
 * LocalStorage-backed team store. Used as a fallback when the backend
 * rejects team operations (e.g. with a guest/invalid token). This lets the
 * user fully test the transfer flow in offline/guest mode — add teams,
 * edit them, delete them, transfer them — all persisted in the browser.
 */
const LOCAL_TEAMS_KEY = "fantasypro-local-teams";

function readLocalTeams(): Record<string, TeamRow[]> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(LOCAL_TEAMS_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeLocalTeams(data: Record<string, TeamRow[]>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_TEAMS_KEY, JSON.stringify(data));
}

function localId(): string {
  return "local_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export async function listTeams(
  token: string,
  matchId: string | number
): Promise<TeamRow[]> {
  const resp = await rawFetch<ApiResponse>(`/api/fantasy/list-of-teams`, {
    method: "POST",
    body: buildEncryptedBody({ matchId }, token),
  });
  if (resp.status === "success") {
    const data = unpackData<TeamRow[] | TeamRow>(resp);
    if (Array.isArray(data)) return data;
    if (data) return [data];
  }
  // Fallback to local storage (guest/offline mode)
  const local = readLocalTeams();
  return local[String(matchId)] || [];
}

export type TeamMutationType =
  | "add"
  | "edit"
  | "delete"
  | "save"
  | "transfer";

export async function addTeam(
  token: string,
  payload: { matchId: string | number; team: Partial<TeamRow>; type?: TeamMutationType }
): Promise<TeamRow | { success: boolean; offline: boolean }> {
  const resp = await rawFetch<ApiResponse>(`/api/fantasy/add-team`, {
    method: "POST",
    body: buildEncryptedBody(
      { matchId: payload.matchId, team: payload.team, type: payload.type ?? "add" },
      token
    ),
  });
  if (resp.status === "success") {
    const data = unpackData<TeamRow | null>(resp);
    return data ?? { success: true, offline: false };
  }
  // Backend rejected (e.g. guest token) — persist to localStorage so the
  // user can still see / edit / transfer the team in this browser.
  const local = readLocalTeams();
  const key = String(payload.matchId);
  const list = local[key] || [];
  const newTeam: TeamRow = {
    _id: localId(),
    teamId: localId(),
    teamNo: list.length + 1,
    players: payload.team.players || [],
    captain: payload.team.captain,
    viceCaptain: payload.team.viceCaptain,
    c: payload.team.captain,
    vc: payload.team.viceCaptain,
    team: payload.team.team,
    type: "add",
  };
  list.push(newTeam);
  local[key] = list;
  writeLocalTeams(local);
  return { success: true, offline: true, ...newTeam } as TeamRow & { offline: true };
}

export async function editTeam(
  token: string,
  payload: {
    matchId: string | number;
    teamId: string;
    team: Partial<TeamRow>;
    type?: TeamMutationType;
  }
): Promise<TeamRow | { success: boolean; offline: boolean }> {
  const resp = await rawFetch<ApiResponse>(`/api/fantasy/edit-team`, {
    method: "POST",
    body: buildEncryptedBody(
      {
        matchId: payload.matchId,
        teamId: payload.teamId,
        team: payload.team,
        type: payload.type ?? "edit",
      },
      token
    ),
  });
  if (resp.status === "success") {
    const data = unpackData<TeamRow | null>(resp);
    return data ?? { success: true, offline: false };
  }
  // Backend rejected — apply mutation to localStorage instead.
  const local = readLocalTeams();
  const key = String(payload.matchId);
  const list = local[key] || [];
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
  // Renumber
  list.forEach((t, i) => (t.teamNo = i + 1));
  local[key] = list;
  writeLocalTeams(local);
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

/* ---------- Promotions ---------- */

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

/* ---------- Expert teams ---------- */

export async function getExpertTeams(
  matchId?: string | number
): Promise<TeamRow[]> {
  const resp = await rawFetch<ApiResponse>(`/api/expert/teamlist`, {
    method: "POST",
    body: buildEncryptedBody(matchId ? { matchId } : {}),
  });
  if (resp.status && resp.status !== "success") return [];
  const data = unpackData<TeamRow[] | TeamRow>(resp);
  if (Array.isArray(data)) return data;
  if (data) return [data];
  return [];
}

/* ---------- Prime teams ---------- */

export async function getPrimeTeams(): Promise<TeamRow[]> {
  const resp = await rawFetch<ApiResponse>(`/api/primeteam/teamlist`, { method: "GET" });
  if (resp.status && resp.status !== "success") return [];
  const data = unpackData<TeamRow[] | TeamRow>(resp);
  if (Array.isArray(data)) return data;
  if (data) return [data];
  return [];
}
