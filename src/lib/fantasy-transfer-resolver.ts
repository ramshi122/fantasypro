/**
 * Fantasy Transfer Resolver (server-side only)
 * =============================================
 *
 * WHY THIS EXISTS (root cause of "transfer shows success but team is NOT created"):
 *
 * The tgsoftware-api.online backend (the original teamgeneration.in backend)
 * only accepts /api/fantasy/add-team payloads that use:
 *   1. the PLATFORM's own matchId     (Dream11/My11Circle numeric match id)
 *   2. the PLATFORM's own player IDs  (Dream11/My11Circle numeric player ids)
 *
 * Our app builds teams from possible11.com + Cricbuzz data, whose IDs live in a
 * completely different ID space. Sending Cricbuzz player IDs with a local
 * matchId makes the backend's bot fail with the generic
 *   {"status":"fail","message":"Something Went Wrong!"}
 * — no team is created.
 *
 * HOW THE ORIGINAL APP SOLVES THIS (verified from teamgeneration.in's own
 * minified bundle + the extracted APK bundle):
 *
 *   1. POST /api/automatic/fantasy-app/list  {fantasyApp, authToken}
 *      → uses the USER's linked session token to ask the platform itself for
 *        its upcoming matches → [{id, left_team_name, right_team_name, ...}]
 *   2. POST /api/automatic/fantasy-app/getplayerdata
 *        {fantasyApp, authToken, matchId: <platform match id>,
 *         leftTeamName?, rightTeamName?}
 *      → platform player list for that match:
 *        [{id, name, player_role, team_index, credits?...}]
 *   3. Players are mapped TG ↔ platform BY NAME:
 *        normalise(name) = lowercase + strip spaces/quotes/dashes
 *        (my11circle/jumbo variant keeps the original's "R Sharma" form)
 *   4. POST /api/fantasy/add-team {matchId: <platform id>, captain: <platform
 *        id>, vice_captain: <platform id>, players: [<platform ids>],
 *        fantasyApp, authToken, sportIndex, type}
 *
 * This resolver performs steps 1–3 server-side and caches the result per
 * (tgMatchId, fantasyApp) in SQLite so repeat transfers are instant.
 */

import { db } from "@/lib/db";
import crypto from "crypto-js";

const FANTASY_API_BASE = "https://tgsoftware-api.online";
const AES_KEY = "coder_bobby_believer01_tg_software";

/** Cache lifetime for a resolved mapping. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export interface PlatformPlayer {
  id: string;
  name: string;
  playerRole?: number;
  teamIndex?: number;
  credits?: number;
}

export interface ResolvedPlatformContext {
  platformMatchId: string;
  platformLeftName?: string;
  platformRightName?: string;
  platformPlayers: PlatformPlayer[];
  fromCache: boolean;
}

/* ------------------------------------------------------------------ */
/* Name normalisation — exact parity with the original app            */
/* ------------------------------------------------------------------ */

/** Original `J()` normaliser — EXACT parity: strip spaces/quotes/dashes, lowercase.
 *  (Verified in the original bundle: J=e=>(e=e.replaceAll(" ","")...)
 *   .replaceAll("'","").replaceAll('"',"").replaceAll("-","").toLowerCase()
 *  NOTE: the original does NOT strip dots — keep this byte-exact.) */
export function normaliseName(name: string): string {
  return String(name || "")
    .replaceAll(" ", "")
    .replaceAll("'", "")
    .replaceAll('"', "")
    .replaceAll("-", "")
    .toLowerCase();
}

/**
 * Original `ee()` transform for jumbo/my11circle names: the platform reports
 * "R G Sharma"-style short names. Transform "first word" into its initial,
 * e.g. "Rohit Sharma" → "R Sharma" (keep rest after first space/dash).
 */
function jumboStyleName(name: string): string {
  if (!name || typeof name !== "string") return "";
  const t = name.trim();
  const sep = t.search(/[\s-]/);
  if (sep === -1) return t.substring(0, 1);
  const first = t.charAt(0);
  const rest = t.substring(sep);
  return `${first}${rest}`;
}

/** All name variants a player can be matched by (original compares all of them). */
function nameVariants(name: string, isMy11CircleFamily: boolean): string[] {
  const out = new Set<string>();
  const base = String(name || "").trim();
  if (!base) return [];
  out.add(normaliseName(base));
  if (isMy11CircleFamily) {
    out.add(normaliseName(jumboStyleName(base)));
    // also handle already-initialised forms: "R G Sharma" → "RG Sharma"
    const parts = base.split(/[\s-]+/).filter(Boolean);
    if (parts.length >= 2) {
      const initials = parts.slice(0, -1).map((p) => p.charAt(0)).join("");
      out.add(normaliseName(`${initials} ${parts[parts.length - 1]}`));
      out.add(normaliseName(parts[parts.length - 1])); // surname only
    }
  } else {
    const parts = base.split(/[\s-]+/).filter(Boolean);
    if (parts.length >= 2) out.add(normaliseName(parts[parts.length - 1])); // surname
  }
  return [...out].filter(Boolean);
}

/* ------------------------------------------------------------------ */
/* Response envelope handling                                         */
/* ------------------------------------------------------------------ */

/** Some tgsoftware responses arrive AES-encrypted ("U2FsdGVk...").
 *  Handles: a single encrypted string, or an array of encrypted strings. */
function decryptIfEncrypted(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" && item.startsWith("U2FsdGVk") ? decryptIfEncrypted(item) : item));
  }
  if (typeof value !== "string") return value;
  if (!value.startsWith("U2FsdGVk")) return value;
  try {
    const dec = crypto.AES.decrypt(value, AES_KEY).toString(crypto.enc.Utf8);
    if (!dec) return value;
    try { return JSON.parse(dec); } catch { return dec; }
  } catch {
    return value;
  }
}

async function postJson(url: string, body: unknown, timeoutMs = 25000): Promise<{ httpStatus: number; data: Record<string, unknown> | null }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { parsed = null; }
    return { httpStatus: res.status, data: (decryptIfEncrypted(parsed) as Record<string, unknown>) ?? null };
  } catch {
    return { httpStatus: 0, data: null };
  }
}

/* ------------------------------------------------------------------ */
/* Platform match selection                                           */
/* ------------------------------------------------------------------ */

function slugish(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function teamNameScore(platformName: string, localName: string): number {
  const a = slugish(platformName);
  const b = slugish(localName);
  if (!a || !b) return 0;
  if (a === b) return 6;
  if (a.includes(b) || b.includes(a)) return 4;
  // partial: any 4+ char chunk overlap (handles "India" vs "Ind")
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  if (short.length >= 4 && long.includes(short)) return 3;
  return 0;
}

interface PlatformMatch {
  id: string | number;
  left_team_name?: string;
  right_team_name?: string;
  match_time?: string;
  date?: string;
  [k: string]: unknown;
}

/** Score a platform match against our local match metadata. */
function scoreMatch(
  m: PlatformMatch,
  local: { leftTeamName?: string; rightTeamName?: string; matchTime?: string }
): number {
  let score = 0;
  const pl = String(m.left_team_name || "");
  const pr = String(m.right_team_name || "");
  const ll = local.leftTeamName || "";
  const lr = local.rightTeamName || "";

  if (ll && lr) {
    // either orientation
    const direct = teamNameScore(pl, ll) + teamNameScore(pr, lr);
    const flipped = teamNameScore(pl, lr) + teamNameScore(pr, ll);
    score += Math.max(direct, flipped);
  } else if (ll || lr) {
    score += Math.max(teamNameScore(pl, ll || lr), teamNameScore(pr, ll || lr));
  }

  // Time proximity (±3 days)
  const pt = Date.parse(String(m.match_time || m.date || ""));
  const lt = local.matchTime ? Date.parse(local.matchTime) : NaN;
  if (!isNaN(pt) && !isNaN(lt)) {
    const diff = Math.abs(pt - lt);
    const day = 24 * 60 * 60 * 1000;
    if (diff <= 6 * 60 * 60 * 1000) score += 3;       // same window (6h)
    else if (diff <= 1 * day) score += 2;
    else if (diff <= 3 * day) score += 1;
    else return 0;                                      // too far apart — wrong match
  }
  return score;
}

/* ------------------------------------------------------------------ */
/* DB cache                                                           */
/* ------------------------------------------------------------------ */

async function readCache(tgMatchId: string, fantasyApp: string): Promise<ResolvedPlatformContext | null> {
  try {
    const row = await db.transferMatchMap.findUnique({
      where: { tgMatchId_fantasyApp: { tgMatchId, fantasyApp } },
    });
    if (!row) return null;
    if (Date.now() - new Date(row.resolvedAt).getTime() > CACHE_TTL_MS) return null;
    let players: PlatformPlayer[] = [];
    try { players = JSON.parse(row.platformPlayers); } catch { players = []; }
    if (!row.platformMatchId || players.length === 0) return null;
    return {
      platformMatchId: row.platformMatchId,
      platformLeftName: row.platformLeftName || undefined,
      platformRightName: row.platformRightName || undefined,
      platformPlayers: players,
      fromCache: true,
    };
  } catch {
    return null;
  }
}

async function writeCache(
  tgMatchId: string,
  fantasyApp: string,
  ctx: Omit<ResolvedPlatformContext, "fromCache">
): Promise<void> {
  try {
    await db.transferMatchMap.upsert({
      where: { tgMatchId_fantasyApp: { tgMatchId, fantasyApp } },
      create: {
        tgMatchId,
        fantasyApp,
        platformMatchId: ctx.platformMatchId,
        platformLeftName: ctx.platformLeftName ?? null,
        platformRightName: ctx.platformRightName ?? null,
        platformPlayers: JSON.stringify(ctx.platformPlayers),
        resolvedAt: new Date(),
      },
      update: {
        platformMatchId: ctx.platformMatchId,
        platformLeftName: ctx.platformLeftName ?? null,
        platformRightName: ctx.platformRightName ?? null,
        platformPlayers: JSON.stringify(ctx.platformPlayers),
        resolvedAt: new Date(),
      },
    });
  } catch (err) {
    console.warn("[TransferResolver] cache write failed (non-fatal):", err instanceof Error ? err.message : err);
  }
}

/* ------------------------------------------------------------------ */
/* Server-side automatic mapping registration (CRITICAL)              */
/* ------------------------------------------------------------------ */
/* The original app's AUTOMATIC transfer flow (verified in both its
 * minified bundles) works in two steps:
 *
 *   STEP 1 — POST /api/automatic/add_mapping  (NO auth required —
 *            verified live: accepts writes and returns
 *            {"status":"success","message":"Mapping created successfully!"})
 *            {
 *              tgMatchId:        <the APP's own match id>,
 *              fantasyAppMatchId:<the PLATFORM's match id>,
 *              fantasyAppName:   "dream11" | "my11circle" | ...,
 *              playerMapperData: [{tgMatchId: <app player id>,
 *                                  fantasyAppMatchId: <platform player id>}...]
 *            }
 *
 *   STEP 2 — POST /api/fantasy/add-team with the APP's own matchId +
 *            APP player ids. The backend looks the match up in its
 *            matches DB (for admin-managed matches) or the automatic
 *            mapping table (for automatic/mapped matches) and
 *            translates everything into platform id space itself.
 *
 * Our previous behaviour — sending the PLATFORM matchId directly to
 * add-team — matches NEITHER lookup source (tgsoftware's matches DB is
 * EMPTY, verified live: /api/fantasy/matches/cricket → []), which is why
 * every add-team call failed with the generic
 * {"status":"fail","message":"Something Went Wrong!"}.
 */

/** Mappings already registered during this server process (throttle). */
const mappingRegisteredInProcess = new Set<string>();

/**
 * THE ORIGINAL APP SENDS IDS AS RAW VALUES, EXACTLY AS THEY COME FROM THE
 * DATA — and in the TG backend's own DB every player id IS A STRING
 * (verified live: /api/fantasy/match/118696 → players have
 * player_fixed_id:"86424", pl_id:"86424", fantasy_id_list[{id:"86424"}]).
 * The original's add-team payload therefore carries STRING player ids and
 * its add_mapping rows carry the same raw values. Our previous code
 * coerced everything to NUMBERS — a strict-typed lookup on the backend
 * (string === number) never matches, which reproduces the generic
 * "Something Went Wrong!" rejection for every team.
 * → NEVER coerce ids here. Strings in, strings out (original parity).
 */
function toRawIdValue(v: string): string {
  return String(v ?? "").trim();
}

/**
 * Register (upsert) the TG↔platform mapping on the tgsoftware backend so
 * that /api/fantasy/add-team can resolve OUR matchId + player ids.
 * Idempotent; throttled per (app, match, platformMatch) for the process
 * lifetime. Never throws — returns false when registration failed.
 */
export async function registerAutomaticMapping(params: {
  fantasyApp: string;
  /** Our local (app) match id — the mapping table's tgMatchId key. */
  tgMatchId: string;
  /** The resolved platform match id. */
  platformMatchId: string;
  /** local player id → platform player id pairs (all 11 + captain/VC). */
  pairs: Array<{ localId: string; platformId: string }>;
}): Promise<boolean> {
  const { fantasyApp, tgMatchId, platformMatchId, pairs } = params;
  if (!fantasyApp || !tgMatchId || !platformMatchId) return false;
  const usable = (pairs || []).filter((p) => p.localId && p.platformId);
  if (usable.length === 0) return false;

  // Throttle key INCLUDES the mapped platform id values: the mapper
  // pre-flight may register getplayerdata ids while the transfer route
  // registers the authoritative TG-DB-row ids — those must NOT collide
  // (a same-shape key would silently skip the authoritative registration).
  const key = `${fantasyApp}:${tgMatchId}:${platformMatchId}:${usable.map((p) => p.platformId).join(",")}`;
  if (mappingRegisteredInProcess.has(key)) return true;

  const body = {
    tgMatchId: toRawIdValue(tgMatchId),
    fantasyAppMatchId: toRawIdValue(platformMatchId),
    fantasyAppName: fantasyApp,
    playerMapperData: usable.map((p) => ({
      tgMatchId: toRawIdValue(p.localId),
      fantasyAppMatchId: toRawIdValue(p.platformId),
    })),
  };

  const res = await postJson(`${FANTASY_API_BASE}/api/automatic/add_mapping`, body, 15000);
  const ok = res.httpStatus === 200 && !!res.data && res.data.status === "success";
  if (ok) {
    mappingRegisteredInProcess.add(key);
    console.log(`[TransferResolver] ✅ add_mapping registered: ${fantasyApp} match ${tgMatchId} → platform ${platformMatchId} (${usable.length} players)`);
  } else {
    console.warn(`[TransferResolver] add_mapping registration failed (non-fatal): http=${res.httpStatus} body=${JSON.stringify(res.data || {}).slice(0, 200)}`);
  }
  return ok;
}

/* ------------------------------------------------------------------ */
/* TG DB MATCH ROW — the authoritative platform player ids            */
/* ------------------------------------------------------------------ */
/* The original app builds its teams from ITS OWN match data endpoint:
 *     GET {backend}/api/fantasy/match/{matchId}
 *   → {status:"success", data:{...AES-encrypted fields...}}
 * Each player in left_team_players / right_team_players carries
 *   player_fixed_id, pl_id and fantasy_id_list: [{name: slug, id}]
 * — and the ORIGINAL transfer resolves every player's id through
 * fantasy_id_list[slug].id (verified in its bundle: the b() helper).
 * add-team validates the sent players against EXACTLY these ids.
 *
 * → After registering the match in the DB (add-match), we fetch this row
 * and map our players onto ITS ids. That makes our add-team payload
 * byte-equivalent to what the original app would send for the same match.
 */
export async function fetchTgMatchPlayers(
  platformMatchId: string,
  fantasyApp: string,
  timeoutMs = 15000
): Promise<PlatformPlayer[]> {
  try {
    const res = await fetch(`${FANTASY_API_BASE}/api/fantasy/match/${encodeURIComponent(platformMatchId)}`, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(text); } catch { parsed = null; }
    if (res.status !== 200 || !parsed || typeof parsed !== "object") return [];
    const env = parsed as Record<string, unknown>;
    if (env.status !== "success" || !env.data || typeof env.data !== "object") return [];

    const raw = env.data as Record<string, unknown>;
    const dec = decryptIfEncrypted(raw) as Record<string, unknown>;
    const left = Array.isArray(dec.left_team_players) ? (dec.left_team_players as Array<Record<string, unknown>>) : [];
    const right = Array.isArray(dec.right_team_players) ? (dec.right_team_players as Array<Record<string, unknown>>) : [];

    const out: PlatformPlayer[] = [];
    for (const p of [...left, ...right]) {
      // fantasy_id_list[slug].id — the ORIGINAL's own resolution order
      let id = "";
      if (Array.isArray(p.fantasy_id_list)) {
        for (const f of p.fantasy_id_list as Array<Record<string, unknown>>) {
          if (String(f?.name ?? "") === fantasyApp && f?.id != null) { id = String(f.id); break; }
        }
      }
      if (!id && p.pl_id != null) id = String(p.pl_id);
      if (!id && p.player_fixed_id != null) id = String(p.player_fixed_id);
      const name = String(p.name ?? "").trim();
      if (!id || !name) continue;
      out.push({
        id,
        name,
        playerRole: typeof p.role === "number" ? p.role : typeof p.player_role === "number" ? p.player_role : undefined,
        teamIndex: typeof p.team_index === "number" ? p.team_index : undefined,
        credits: typeof p.credits === "number" ? p.credits : undefined,
      });
    }
    return out;
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Main resolver                                                      */
/* ------------------------------------------------------------------ */

export interface ResolveInput {
  fantasyApp: string;
  authToken: string;
  /** Our local match id (possible11 / Cricbuzz space). */
  matchId: string;
  leftTeamName?: string;
  rightTeamName?: string;
  matchTime?: string;
  /** vision11 only */
  userId?: string;
  /** Skip the DB cache and resolve fresh. */
  forceRefresh?: boolean;
}

/**
 * Resolve the platform matchId + platform players for a local match.
 * Returns null when the platform context cannot be established
 * (bad token / platform unreachable / no matching match found).
 */
export async function resolvePlatformContext(input: ResolveInput): Promise<ResolvedPlatformContext | null> {
  const { fantasyApp, authToken, matchId } = input;

  if (!authToken || !matchId || !fantasyApp) return null;

  // 0) DB cache
  if (!input.forceRefresh) {
    const cached = await readCache(matchId, fantasyApp);
    if (cached) {
      console.log(`[TransferResolver] ✅ cache hit: match ${matchId} → platform ${cached.platformMatchId} (${fantasyApp}, ${cached.platformPlayers.length} players)`);
      return cached;
    }
  }

  // 1) List the platform's matches using the user's own session token
  const listBody: Record<string, unknown> = { fantasyApp, authToken };
  if (fantasyApp === "vision11" && input.userId) listBody.userId = input.userId;
  const listRes = await postJson(`${FANTASY_API_BASE}/api/automatic/fantasy-app/list`, listBody);
  // NOTE: original app only checks HTTP 200 (not the status field) for these
  // automatic endpoints — mirror that, but still reject explicit failures.
  if (listRes.httpStatus !== 200 || !listRes.data || listRes.data.status === "fail") {
    console.log(`[TransferResolver] fantasy-app/list failed: http=${listRes.httpStatus} body=${JSON.stringify(listRes.data || {}).slice(0, 200)}`);
    return null;
  }
  const rawMatches = listRes.data.data;
  const matches: PlatformMatch[] = Array.isArray(rawMatches)
    ? (decryptIfEncrypted(rawMatches) as PlatformMatch[])
    : [];
  if (!Array.isArray(matches) || matches.length === 0) {
    console.log("[TransferResolver] fantasy-app/list returned no matches");
    return null;
  }

  // 2) Pick the platform match that matches our teams (and time)
  const local = {
    leftTeamName: input.leftTeamName,
    rightTeamName: input.rightTeamName,
    matchTime: input.matchTime,
  };
  let best: PlatformMatch | null = null;
  let bestScore = 0;
  for (const m of matches) {
    const s = scoreMatch(m, local);
    if (s > bestScore) { bestScore = s; best = m; }
  }
  // If we have no team names to compare, only accept when exactly ONE match exists.
  if (!best && matches.length === 1 && (input.leftTeamName || input.rightTeamName)) best = matches[0];
  if (!best || bestScore === 0) {
    console.log(`[TransferResolver] no platform match matched local teams (score=${bestScore}, ${matches.length} candidates)`);
    return null;
  }
  const platformMatchId = String(best.id);
  console.log(`[TransferResolver] platform match: ${best.left_team_name} vs ${best.right_team_name} (id=${platformMatchId}, score=${bestScore})`);

  // 3) Fetch the platform's player list for that match
  const playerBody: Record<string, unknown> = { fantasyApp, authToken, matchId: platformMatchId };
  if (fantasyApp === "my11circle" || fantasyApp === "jumbo") {
    if (input.leftTeamName) playerBody.leftTeamName = input.leftTeamName;
    if (input.rightTeamName) playerBody.rightTeamName = input.rightTeamName;
  }
  if (fantasyApp === "vision11" && input.userId) playerBody.userId = input.userId;
  const pdRes = await postJson(`${FANTASY_API_BASE}/api/automatic/fantasy-app/getplayerdata`, playerBody);
  if (pdRes.httpStatus !== 200 || !pdRes.data || pdRes.data.status === "fail") {
    console.log(`[TransferResolver] getplayerdata failed: http=${pdRes.httpStatus} body=${JSON.stringify(pdRes.data || {}).slice(0, 200)}`);
    return null;
  }
  const rawPlayers = pdRes.data.data;
  const playersRaw: Array<Record<string, unknown>> = Array.isArray(rawPlayers)
    ? (decryptIfEncrypted(rawPlayers) as Array<Record<string, unknown>>)
    : [];
  if (!Array.isArray(playersRaw) || playersRaw.length === 0) {
    console.log("[TransferResolver] getplayerdata returned no players");
    return null;
  }

  const platformPlayers: PlatformPlayer[] = playersRaw
    .map((p) => ({
      id: String(p.id ?? p.player_id ?? p.pid ?? ""),
      name: String(p.name ?? p.player_name ?? ""),
      playerRole: typeof p.player_role === "number" ? p.player_role : undefined,
      teamIndex: typeof p.team_index === "number" ? p.team_index : undefined,
      credits: typeof p.credits === "number" ? p.credits : undefined,
    }))
    .filter((p) => p.id && p.name);

  if (platformPlayers.length === 0) {
    console.log("[TransferResolver] platform players empty after normalisation");
    return null;
  }

  const ctx: Omit<ResolvedPlatformContext, "fromCache"> = {
    platformMatchId,
    platformLeftName: best.left_team_name ? String(best.left_team_name) : undefined,
    platformRightName: best.right_team_name ? String(best.right_team_name) : undefined,
    platformPlayers,
  };
  await writeCache(matchId, fantasyApp, ctx);
  console.log(`[TransferResolver] ✅ resolved + cached: ${platformPlayers.length} platform players`);
  return { ...ctx, fromCache: false };
}

/* ------------------------------------------------------------------ */
/* Player mapping (name → platform id)                                */
/* ------------------------------------------------------------------ */

export interface LocalPlayerRef {
  localId: string;
  name: string;
  teamIndex?: number;
}

export interface PlayerMapResult {
  /** localId → platform id */
  idMap: Record<string, string>;
  /** platform id → platform player (for role/name checks) */
  byPlatformId: Record<string, PlatformPlayer>;
  unmapped: LocalPlayerRef[];
}

/**
 * Map local players onto platform players by name (original algorithm:
 * exact normalised realName first, then variants — each platform player
 * is used at most once).
 */
export function mapPlayersToPlatform(
  localPlayers: LocalPlayerRef[],
  platformPlayers: PlatformPlayer[],
  fantasyApp: string
): PlayerMapResult {
  const isMy11 = fantasyApp === "my11circle" || fantasyApp === "jumbo";

  // Pre-compute platform name variants → candidate indices
  const platformVariants = platformPlayers.map((p) => ({
    player: p,
    variants: new Set(nameVariants(p.name, isMy11)),
  }));

  const idMap: Record<string, string> = {};
  const byPlatformId: Record<string, PlatformPlayer> = {};
  const used = new Set<number>();
  const unmapped: LocalPlayerRef[] = [];

  const tryMatch = (local: LocalPlayerRef, variantIdx: number): boolean => {
    const variants = nameVariants(local.name, isMy11);
    const want = variants[variantIdx];
    if (!want) return false;
    for (let i = 0; i < platformVariants.length; i++) {
      if (used.has(i)) continue;
      const pv = platformVariants[i];
      if (pv.variants.has(want)) {
        // sanity: if both sides know team_index, they should agree
        if (
          typeof local.teamIndex === "number" &&
          typeof pv.player.teamIndex === "number" &&
          local.teamIndex !== pv.player.teamIndex
        ) continue;
        idMap[local.localId] = pv.player.id;
        byPlatformId[pv.player.id] = pv.player;
        used.add(i);
        return true;
      }
    }
    return false;
  };

  // Pass 1: full normalised name
  for (const lp of localPlayers) if (!tryMatch(lp, 0)) unmapped.push(lp);
  // Pass 2: secondary variants (initials / surname)
  if (unmapped.length > 0) {
    for (const lp of [...unmapped]) {
      for (let v = 1; v < 4; v++) {
        if (tryMatch(lp, v)) {
          const idx = unmapped.indexOf(lp);
          if (idx !== -1) unmapped.splice(idx, 1);
          break;
        }
      }
    }
  }

  return { idMap, byPlatformId, unmapped };
}
