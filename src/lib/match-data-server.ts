/**
 * Server-only match + player data layer.
 * =====================================
 *
 * WHY THIS EXISTS (player data "unavailable" fix):
 *
 *  1. possible11.com `getMatchDetails` returns a RAW ARRAY of HTML preview
 *     blocks (no `{status, data}` wrapper, no players). The old proxy checked
 *     `body.status === "success"` → always failed → "players unavailable".
 *  2. possible11.com `getPlayers` returns MASKED names ("/ / / / /") for
 *     anonymous clients — unusable for team generation.
 *  3. possible11.com's CORS preflight does not allow the `Content-Type`
 *     header, so the browser could not call it directly → matches failed to
 *     load in the browser.
 *
 * SOLUTION:
 *  - All possible11 calls happen server-side (no CORS).
 *  - `getMatchDetails` gives us `crickid` = the Cricbuzz match id.
 *  - Real squads (names, roles, WK/C flags, photos, playing XI / bench)
 *    are extracted from the structured JSON embedded in Cricbuzz's
 *    /cricket-match-squads/{id} page.
 *  - If `crickid` is missing, we search Cricbuzz's live/upcoming lists by
 *    team names.
 *  - Output is normalised to the MatchInfo / MatchPlayer shape used across
 *    the app (left_team_players / right_team_players, role 0-3, etc.).
 */

const P11_URL = "https://possible11.com/admin/api2.php";
const CB_BASE = "https://www.cricbuzz.com";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/* ================================================================== */
/* RESILIENCE LAYER (stale-while-revalidate memory cache)              */
/* ================================================================== */
/* Upstream sources are FLAKY (observed in production):                */
/*  - possible11 getMatches / getMatchDetails intermittently time out  */
/*    or return crickid=0 for a match that had a valid crickid a       */
/*    minute earlier                                                   */
/*  - Cricbuzz pages occasionally fail / serve different structures    */
/* Every upstream failure previously reached the user instantly →      */
/* "players and data unavailable" → broken generation → reported as    */
/* "APK crash". The cache keeps the LAST GOOD data and serves it when  */
/* upstream fails, so the app keeps working through upstream hiccups.  */

interface CacheEntry<T> { data: T; ts: number; }

const MATCHES_FRESH_MS = 60_000;         // 1 min — fresh window
const MATCHES_STALE_MS = 6 * 3600_000;   // up to 6 h old on upstream failure
const DETAIL_FRESH_MS = 3 * 60_000;      // 3 min — fresh window (squads change rarely)
const DETAIL_STALE_MS = 12 * 3600_000;   // up to 12 h old on upstream failure
const MAX_CACHE_ENTRIES = 300;

const matchesCache = new Map<string, CacheEntry<Awaited<ReturnType<typeof fetchP11Matches>>>>();
const matchDetailCache = new Map<string, CacheEntry<Awaited<ReturnType<typeof buildMatchDetail>>>>();
/** matchId → resolved Cricbuzz id. Once resolved, NEVER forgotten — possible11
 *  intermittently returns crickid=0 for matches it previously resolved. */
const crickidCache = new Map<string, string>();

function trimCache<T>(m: Map<string, CacheEntry<T>>) {
  if (m.size <= MAX_CACHE_ENTRIES) return;
  const entries = [...m.entries()].sort((a, b) => a[1].ts - b[1].ts);
  for (let i = 0; i < entries.length - MAX_CACHE_ENTRIES; i++) m.delete(entries[i][0]);
}

/**
 * Fetch matches with stale-while-revalidate: fresh → return; upstream fail →
 * return last-good copy if not too old.
 */
export async function getMatchesCached(sport = "cricket"): Promise<{ matches: Awaited<ReturnType<typeof fetchP11Matches>>; fromCache: boolean }> {
  const cached = matchesCache.get(sport);
  if (cached && Date.now() - cached.ts < MATCHES_FRESH_MS) {
    return { matches: cached.data, fromCache: true };
  }
  try {
    const matches = await fetchP11Matches(sport);
    if (matches.length > 0) {
      matchesCache.set(sport, { data: matches, ts: Date.now() });
      trimCache(matchesCache);
      return { matches, fromCache: false };
    }
    // Upstream returned EMPTY (common when it is having a bad moment).
    // Serve last-good data instead of wiping the home screen.
    if (cached && Date.now() - cached.ts < MATCHES_STALE_MS) {
      console.warn(`[cache] ${sport} matches upstream EMPTY — serving ${Math.round((Date.now() - cached.ts) / 60000)}min-old cached list`);
      return { matches: cached.data, fromCache: true };
    }
    return { matches, fromCache: false };
  } catch (err) {
    if (cached && Date.now() - cached.ts < MATCHES_STALE_MS) {
      console.warn(`[cache] ${sport} matches upstream FAILED — serving cached list:`, err instanceof Error ? err.message : err);
      return { matches: cached.data, fromCache: true };
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* possible11                                                          */
/* ------------------------------------------------------------------ */

export async function p11Post<T = unknown>(action: string, extra: Record<string, unknown> = {}): Promise<T | null> {
  // Upstream is flaky — retry once with a short backoff before giving up.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(P11_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/plain, */*" },
        body: JSON.stringify({
          action,
          uuid: "web-apna-cricket",
          device: "web",
          osVersion: "unknown",
          model: "browser",
          ...extra,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      const text = await res.text();
      try {
        return JSON.parse(text) as T;
      } catch {
        // Non-JSON response (upstream glitch / HTML error page) — retry once
        if (attempt < 2) { await new Promise((r) => setTimeout(r, 800)); continue; }
        return null;
      }
    } catch (err) {
      if (attempt < 2) { await new Promise((r) => setTimeout(r, 800)); continue; }
      console.error(`[p11] ${action} failed:`, err instanceof Error ? err.message : err);
      return null;
    }
  }
  return null;
}

export interface P11Match {
  id: string;
  date?: string;
  name?: string;
  tour?: string;
  type?: string;
  status?: string;
  status_msg?: string;
  active?: string;
  cod1?: string;
  cnm1?: string;
  fl1?: string;
  cod2?: string;
  cnm2?: string;
  fl2?: string;
  [k: string]: unknown;
}

/** possible11 dates are IST ("2026-10-18 19:00:00") → epoch ms */
export function p11DateToMs(date?: string): number | undefined {
  if (!date) return undefined;
  const iso = date.trim().replace(" ", "T") + "+05:30";
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : undefined;
}

/** Convert a possible11 match row into the app's MatchInfo shape. */
export function normalizeP11Match(raw: P11Match, sport = "cricket") {
  const t1 = raw.cod1 || raw.name?.split(" vs ")[0] || "T1";
  const t2 = raw.cod2 || raw.name?.split(" vs ")[1] || "T2";
  const startTime = p11DateToMs(raw.date);
  const now = Date.now();
  const status =
    String(raw.status) === "1" || (startTime && startTime <= now) ? "live" : "upcoming";
  return {
    ...raw,
    matchId: raw.id,
    id: raw.id,
    title: raw.name || `${t1} vs ${t2}`,
    series: raw.tour || raw.name,
    series_name: raw.tour,
    subTitle: raw.type ? String(raw.type).toUpperCase() : undefined,
    team1: { shortName: t1, name: raw.cnm1 || t1, logo: raw.fl1 },
    team2: { shortName: t2, name: raw.cnm2 || t2, logo: raw.fl2 },
    team1Short: t1,
    team2Short: t2,
    team1Logo: raw.fl1,
    team2Logo: raw.fl2,
    left_team_name: t1,
    right_team_name: t2,
    left_team_image: raw.fl1,
    right_team_image: raw.fl2,
    startTime,
    match_time: raw.date,
    format: raw.type,
    match_type: raw.type,
    type: raw.type,
    sport,
    status,
    // possible11 matches are Dream11-style fantasy fixtures. Without this the
    // home screen's shouldShowMatchCard() hid every match.
    fantasy_list: ["dream11", "my11circle"],
    lineup_status: 0,
    apiSource: "possible11",
  };
}

export type NormalizedMatch = ReturnType<typeof normalizeP11Match>;

export async function fetchP11Matches(sport = "cricket"): Promise<NormalizedMatch[]> {
  const states = ["upcoming", "live"];
  const seen = new Set<string>();
  const out: NormalizedMatch[] = [];
  const results = await Promise.all(
    states.map((matchState) => p11Post<P11Match[] | { data?: P11Match[] }>("getMatches", { sport, matchState }))
  );
  for (const r of results) {
    const rows: P11Match[] = Array.isArray(r) ? r : r && Array.isArray(r.data) ? r.data : [];
    for (const row of rows) {
      if (!row?.id || seen.has(String(row.id))) continue;
      seen.add(String(row.id));
      out.push(normalizeP11Match(row, sport));
    }
  }
  out.sort((a, b) => (Number(a.startTime) || 0) - (Number(b.startTime) || 0));
  return out;
}

/* ------------------------------------------------------------------ */
/* Cricbuzz squads                                                     */
/* ------------------------------------------------------------------ */

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Cricbuzz HTTP ${res.status}`);
  return res.text();
}

/** Concatenate the Next.js RSC flight payload chunks embedded in the page. */
function extractFlight(html: string): string {
  let flight = "";
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      flight += JSON.parse(m[1]) as string;
    } catch {
      /* ignore malformed chunk */
    }
  }
  return flight;
}

/** Find `marker` and return the balanced JSON object that starts at its first "{". */
function extractObject(s: string, marker: string): any | null {
  const i = s.indexOf(marker);
  if (i < 0) return null;
  const start = s.indexOf("{", i);
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = start; j < s.length; j++) {
    const c = s[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(s.slice(start, j + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

interface CbPlayer {
  id: number;
  name: string;
  fullName?: string;
  captain?: boolean;
  keeper?: boolean;
  role?: string;
  substitute?: boolean;
  teamName?: string;
  battingStyle?: string;
  bowlingStyle?: string;
  imageDetails?: { imageId?: number | string; alt?: string };
  isOverseas?: boolean;
}

interface CbTeam {
  team: { teamId: number; teamName: string; teamSName: string };
  players: Record<string, CbPlayer[]>;
}

type SquadPlayer = CbPlayer & { playing: number; group: string };

export interface CricbuzzSquads {
  cricbuzzId: string;
  lineupAnnounced: boolean;
  teams: Array<{ name: string; shortName: string; players: SquadPlayer[] }>;
}

export async function fetchCricbuzzSquads(cricbuzzId: string | number): Promise<CricbuzzSquads | null> {
  try {
    const html = await fetchHtml(`${CB_BASE}/cricket-match-squads/${cricbuzzId}/match`);
    const flight = extractFlight(html);
    const t1 = extractObject(flight, '"team1":{"team":') as CbTeam | null;
    const t2 = extractObject(flight, '"team2":{"team":') as CbTeam | null;
    if (!t1?.players || !t2?.players) return null;

    let lineupAnnounced = false;
    const teams = [t1, t2].map((t) => {
      const players: SquadPlayer[] = [];
      for (const [group, list] of Object.entries(t.players || {})) {
        const g = group.toLowerCase();
        if (g.includes("support") || !Array.isArray(list)) continue;
        const isXI = g.includes("playing");
        if (isXI) lineupAnnounced = true;
        for (const p of list) players.push({ ...p, group, playing: isXI ? 1 : 0 });
      }
      return { name: t.team?.teamName || "", shortName: t.team?.teamSName || "", players };
    });

    if (teams[0].players.length === 0 && teams[1].players.length === 0) return null;
    return { cricbuzzId: String(cricbuzzId), lineupAnnounced, teams };
  } catch (err) {
    console.error("[cricbuzz] squads failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Fallback: locate the Cricbuzz match id by team names + codes in live/upcoming lists.
 *
 * MERGED (both sessions): accepts BOTH full names AND short codes (cod1/cod2),
 * dash-stripped variants ("IN-W" → "inw") AND word-acronyms ("England Champions"
 * → "ec") so slugs like `zimw-vs-indw-2nd-t20i-...` and
 * `england-champions-vs-west-indies-champions-...` both resolve even when
 * possible11 returns crickid="0".
 */
export async function findCricbuzzId(
  names: string[],
  codes: string[] = []
): Promise<string | null> {
  // Build needle set: dash-stripped + original slug form, for both full names and codes.
  const needleSet = new Set<string>();
  for (const n of names.filter(Boolean)) {
    const slugged = slugify(n);
    if (slugged.length >= 2) {
      needleSet.add(slugged);
      const noDash = slugged.replace(/-/g, "");
      if (noDash.length >= 2) needleSet.add(noDash);
    }
  }
  for (const c of codes.filter(Boolean)) {
    const slugged = slugify(c);
    if (slugged.length >= 2) {
      needleSet.add(slugged);
      const noDash = slugged.replace(/-/g, "");
      if (noDash.length >= 2) needleSet.add(noDash);
    }
  }
  const needles = Array.from(needleSet);
  // Word-acronyms from multi-word full names ("England Champions" → "ec")
  const acronyms = new Set<string>();
  for (const n of names.filter(Boolean)) {
    const words = n.trim().split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      acronyms.add(words.map((w) => slugify(w)[0] || "").join(""));
    }
  }
  if (needles.length === 0) return null;

  // We require either:
  //   - 2+ needles matching (high confidence), OR
  //   - 1 needle matching if the needle is at least 4 chars (e.g. "indw", "zimw")
  //     — this catches the IN-W vs ZM-W case where the slug uses abbreviated codes.
  const minNeedleLenForSolo = 4;

  const pages = [
    `${CB_BASE}/cricket-match/live-scores`,
    `${CB_BASE}/cricket-match/live-scores/upcoming-matches`,
  ];
  for (const url of pages) {
    try {
      const html = await fetchHtml(url);
      const re = /\/live-cricket-scores\/(\d+)\/([a-z0-9-]+)/g;
      let m: RegExpExecArray | null;
      let best: { id: string; score: number; longestNeedle: number } | null = null;
      while ((m = re.exec(html))) {
        const slug = m[2];
        // Score = number of DISTINCT needles that match; acronym fallback for
        // multi-word names whose slug form is absent from the match slug.
        let matched = needles.filter((n) => slug.includes(n));
        if (matched.length === 0) {
          for (const a of acronyms) {
            if (a.length >= 2 && slug.replace(/-/g, "").startsWith(a)) {
              matched = [a];
              break;
            }
          }
        }
        if (matched.length === 0) continue;
        const score = matched.length;
        const longestNeedle = Math.max(...matched.map((n) => n.length));
        if (
          !best ||
          score > best.score ||
          (score === best.score && longestNeedle > best.longestNeedle)
        ) {
          best = { id: m[1], score, longestNeedle };
        }
      }
      if (!best) continue;
      // Acceptance: 2+ needles OR a single 4+ char needle (codes like "inw"/"zimw")
      if (best.score >= 2 || (best.score === 1 && best.longestNeedle >= minNeedleLenForSolo)) {
        return best.id;
      }
    } catch {
      /* try next page */
    }
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Player normalisation                                                */
/* ------------------------------------------------------------------ */

function roleInfo(p: CbPlayer): { role: number; player_type: string; role_text: string } {
  const r = (p.role || "").toLowerCase();
  if (p.keeper || r.includes("wk") || r.includes("keeper")) return { role: 0, player_type: "WK", role_text: "Wicket Keeper" };
  if (r.includes("allrounder") || r.includes("all-rounder") || r.includes("all rounder"))
    return { role: 2, player_type: "AR", role_text: "All Rounder" };
  if (r.includes("bowl")) return { role: 3, player_type: "BOWL", role_text: "Bowler" };
  return { role: 1, player_type: "BAT", role_text: "Batsman" };
}

function playerImage(p: CbPlayer): string | undefined {
  const id = p.imageDetails?.imageId;
  if (!id) return undefined;
  const alt = p.imageDetails?.alt || slugify(p.name || "player");
  return `https://static.cricbuzz.com/a/img/v1/i1/c${id}/${alt}.jpg?d=low&p=gthumb`;
}

/**
 * Build MatchPlayer objects. Cricbuzz has no fantasy credits / selection %,
 * so we derive stable, sensible values from squad order (Cricbuzz lists
 * established/top-order players first) and captain/keeper/XI status.
 */
function buildPlayers(list: SquadPlayer[], teamShort: string, teamIndex: number, lineupAnnounced: boolean) {
  return list.map((p, idx) => {
    const ri = roleInfo(p);
    let credits = idx < 4 ? 9.5 : idx < 8 ? 9 : idx < 11 ? 8.5 : idx < 15 ? 8 : 7.5;
    if (p.captain) credits = Math.min(10.5, credits + 1);
    const benched = lineupAnnounced && p.playing !== 1;
    if (benched) credits = Math.min(credits, 7.5);
    const baseSel = Math.max(2, Math.round(80 - idx * 5 + (p.captain ? 10 : 0) + (ri.role === 0 ? 5 : 0)));
    const sel = benched ? 1 : Math.min(95, baseSel);
    return {
      pid: p.id,
      id: p.id,
      player_fixed_id: String(p.id),
      pl_id: String(p.id),
      name: p.fullName || p.name,
      shortName: p.name,
      image: playerImage(p),
      team: teamShort,
      team_name: teamShort,
      team_short_name: teamShort,
      team_index: teamIndex,
      ...ri,
      credits,
      points: 0,
      selected_by: sel,
      sel,
      captain_percentage: Math.max(0, Math.round(sel / 6)),
      vice_captain_percentage: Math.max(0, Math.round(sel / 5)),
      playing: p.playing,
      is_playing: p.playing,
      lineup_group: p.group,
      is_captain: !!p.captain,
      batting_style: p.battingStyle,
      bowling_style: p.bowlingStyle,
      substitute: !!p.substitute,
      overseas: !!p.isOverseas,
      last_play: 0,
    };
  });
}

/** Score how well a Cricbuzz team name matches a possible11 team (code + full name). */
function nameScore(cbName: string, cbShort: string, code?: string, full?: string): number {
  const a = slugify(cbName);
  const as = slugify(cbShort).replace(/-/g, "");
  const c = slugify(code || "").replace(/-/g, "");
  const f = slugify(full || "");
  let s = 0;
  if (f && a === f) s += 5;
  else if (f && a && (a.includes(f) || f.includes(a))) s += 3;
  if (c && as === c) s += 3;
  else if (c && as && (as.startsWith(c) || c.startsWith(as))) s += 1;
  return s;
}

/* ------------------------------------------------------------------ */
/* Preview-article parser (PLAYER DATA FIX — 3rd fallback)             */
/* ------------------------------------------------------------------ */
/* When Cricbuzz has NOT published squads yet (match 1-3 days away),   */
/* the possible11 preview article (`detail` field of getMatchDetails)  */
/* still lists REAL player names grouped by role sections:             */
/*                                                                     */
/*   Afghanistan (AFG) Team Updates                                    */
/*   Opening Batters                                                   */
/*   Ibrahim Zadran and Rahmanullah Gurbaz will open the innings...    */
/*   Wicketkeeper                                                      */
/*   Rahmanullah Gurbaz will do the Wicket Keeping for Afghanistan.    */
/*                                                                     */
/* This parser extracts those REAL names + approximate roles so        */
/* pre-squad matches show usable player data instead of 0 players.     */

function stripHtmlToLines(html: unknown): string {
  if (typeof html !== "string") return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(h[1-6]|p|li|ul|ol|div|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
    .replace(/&#\d+;/g, " ")
    .replace(/[ \t]+/g, " ");
}

/** Map a role-section heading to the app role number (0=WK 1=BAT 2=AR 3=BOWL) */
function headingToRole(line: string): number | null {
  const l = line.toLowerCase();
  if (/wicket\s*keeper|\bwk\b|keeper\b/.test(l)) return 0;
  if (/all\s*-?\s*rounder/.test(l)) return 2;
  if (/batter|batsman|batting|open(er)?s?\b|one-down|middle-order|top-order/.test(l)) return 1;
  if (/bowler|bowling|spin\b|pace\b|fast\b|death\b/.test(l)) return 3;
  return null;
}

/** Words that appear capitalized in prose but are never player names */
const PREVIEW_NAME_STOPWORDS = new Set([
  "the", "both", "their", "his", "her", "he", "she", "they", "this", "that",
  "these", "those", "there", "according", "winning", "match", "cricket",
  "fantasy", "expert", "toss", "head", "live", "telecast", "team", "teams",
  "updates", "preview", "prediction", "predictions", "advice", "league",
  "leagues", "must", "picks", "risky", "top", "best", "good", "great",
  "decent", "highest", "recent", "opening", "middle", "death", "spin",
  "pace", "fast", "playing", "wicket", "keeping", "innings", "series",
  "grand", "small", "captain", "vice", "batters", "bowlers", "all",
  "played", "won", "tie", "games", "faced", "records", "born", "join",
  "telegram", "possible11", "app", "over", "overs", "powerplay", "daily",
]);

interface PreviewPlayer {
  name: string;
  role: number;
  isCaptain: boolean;
}

function parsePreviewSection(sectionText: string): PreviewPlayer[] {
  const players: PreviewPlayer[] = [];
  const seen = new Set<string>();
  const token = "[A-Z][A-Za-z'’\\-]+(?:\\s+[A-Z][A-Za-z'’\\-]+)*";

  let currentRole = 1; // BAT default
  let captainName: string | null = null;

  for (const rawLine of sectionText.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    // Heading line → switch role context
    const headingRole = headingToRole(line);
    if (headingRole !== null && line.length < 60 && !/\bwill\b/.test(line)) {
      currentRole = headingRole;
      continue;
    }

    // "X and Y will ..." pairs
    const pairRe = new RegExp(`(${token})\\s+and\\s+(${token})\\s+will`, "g");
    // "X will be|lead|do|take|open|strengthen ..." singles
    const soloRe = new RegExp(`(?:^|[.,;!?]\\s*)(${token})\\s+will\\s+(?:be|lead|do|take|open|strengthen|keep|bat|bowl|miss|replace)`, "g");

    const found: Array<{ name: string; isCap: boolean }> = [];
    let m: RegExpExecArray | null;
    while ((m = pairRe.exec(line)) !== null) {
      found.push({ name: m[1], isCap: false });
      found.push({ name: m[2], isCap: false });
    }
    while ((m = soloRe.exec(line)) !== null) {
      found.push({ name: m[1], isCap: /as a Captain|as the Captain|captain/i.test(line) });
    }

    for (const f of found) {
      const name = f.name.replace(/\s+/g, " ").trim();
      const parts = name.split(" ");
      if (parts.length < 2 || name.length < 5 || name.length > 34) continue;
      const lowerTokens = parts.map((p) => p.toLowerCase());
      if (lowerTokens.every((t) => PREVIEW_NAME_STOPWORDS.has(t))) continue;
      if (/^\d/.test(name)) continue;
      if (/batters?|bowlers?|wicketkeeper|all-?rounder|team updates/i.test(name) && parts.length <= 2) continue;

      const key = name.toLowerCase();
      const existing = players.find((p) => p.name.toLowerCase() === key);
      if (existing) {
        if (f.isCap) existing.isCaptain = true;
        // Re-mentioned under the Wicketkeeper section → upgrade BAT→WK
        if (currentRole === 0 && existing.role === 1) existing.role = 0;
        continue;
      }
      seen.add(key);
      if (f.isCap) captainName = name;
      players.push({ name, role: currentRole, isCaptain: f.isCap });
    }

    if (captainName) {
      const cap = players.find((p) => p.name === captainName);
      if (cap) cap.isCaptain = true;
    }
  }

  return players;
}

/**
 * Parse BOTH "(XXX) Team Updates" sections from the possible11 preview.
 * Returns null if the article doesn't contain usable team sections.
 */
function parsePlayersFromPreview(
  detailHtml: unknown,
  latestHtml: unknown
): Array<{ short: string; name: string; players: PreviewPlayer[] }> | null {
  const detail = typeof detailHtml === "string" ? detailHtml : "";
  const latest = typeof latestHtml === "string" ? latestHtml : "";
  const text = stripHtmlToLines(detail.length > 400 ? detail : `${detail}\n${latest}`);
  if (!text) return null;

  const markerRe = /([A-Za-z][A-Za-z .'&()-]{1,40}?)\s*\(([A-Z]{2,10})\)\s*Team\s*Updates/gi;
  const markers: Array<{ idx: number; end: number; name: string; short: string }> = [];
  let mm: RegExpExecArray | null;
  while ((mm = markerRe.exec(text)) !== null) {
    markers.push({
      idx: mm.index,
      end: mm.index + mm[0].length,
      name: mm[1].trim(),
      short: mm[2].trim().toUpperCase(),
    });
  }
  if (markers.length < 2) return null;

  // Cut each section at the prediction/tips boundary so cross-team names
  // ("Must Picks", expert advice) don't pollute team lists.
  const cutRe = /(Match\s+Prediction|Winning\s+Prediction|Expert\s+Advice|Head\s+to\s+Head|Fantasy\s+Tips|Dream\d*\s+Team|Live\s+Telecast)/i;

  const teams: Array<{ short: string; name: string; players: PreviewPlayer[] }> = [];
  for (let i = 0; i < markers.length && teams.length < 2; i++) {
    const sectionEnd = i + 1 < markers.length ? markers[i + 1].idx : text.length;
    const body = text.slice(markers[i].end, sectionEnd);
    const cut = body.search(cutRe);
    const scoped = cut >= 0 ? body.slice(0, cut) : body;
    const players = parsePreviewSection(scoped);
    if (players.length >= 6) {
      teams.push({ name: markers[i].name, short: markers[i].short, players });
    }
  }

  return teams.length === 2 ? teams : null;
}

/* ------------------------------------------------------------------ */
/* Match detail                                                        */
/* ------------------------------------------------------------------ */

export async function buildMatchDetail(matchId: string, sport = "cricket") {
  // === STALE-WHILE-REVALIDATE WRAPPER ===
  // Fresh (< 3 min) → return cache immediately. Otherwise try upstream;
  // if upstream fails or returns 0 players while we HAVE a good cached copy,
  // serve the cached copy (up to 12 h old) instead of breaking the UI.
  const cachedDetail = matchDetailCache.get(String(matchId));
  if (cachedDetail && Date.now() - cachedDetail.ts < DETAIL_FRESH_MS) {
    return cachedDetail.data;
  }

  try {
    const fresh = await buildMatchDetailUpstream(matchId, sport);
    const totalPlayers = fresh.left_team_players.length + fresh.right_team_players.length;
    if (totalPlayers > 0) {
      matchDetailCache.set(String(matchId), { data: fresh, ts: Date.now() });
      trimCache(matchDetailCache);
      return fresh;
    }
    // Upstream returned 0 players (squads genuinely not published OR upstream
    // glitch). If we have a cached copy with players — serve it.
    if (cachedDetail && cachedDetail.data.left_team_players.length + cachedDetail.data.right_team_players.length > 0) {
      console.warn(`[cache] match ${matchId} upstream 0 players — serving cached squads (${Math.round((Date.now() - cachedDetail.ts) / 60000)}min old)`);
      return cachedDetail.data;
    }
    return fresh;
  } catch (err) {
    if (cachedDetail) {
      console.warn(`[cache] match ${matchId} upstream FAILED — serving cached detail:`, err instanceof Error ? err.message : err);
      return cachedDetail.data;
    }
    throw err;
  }
}

async function buildMatchDetailUpstream(matchId: string, sport = "cricket") {
  const [matchesResult, detailsRaw] = await Promise.all([
    getMatchesCached(sport),
    p11Post<any>("getMatchDetails", { mid: matchId }),
  ]);
  const matches = matchesResult.matches;
  const base = matches.find((m) => String(m.id) === String(matchId));
  const details: Record<string, any> | null = Array.isArray(detailsRaw)
    ? detailsRaw[0] ?? null
    : detailsRaw && typeof detailsRaw === "object"
      ? detailsRaw
      : null;

  let team1Short = base?.team1Short || "T1";
  let team2Short = base?.team2Short || "T2";
  const team1Full = base?.team1?.name;
  const team2Full = base?.team2?.name;

  // Resolve the Cricbuzz id (possible11 provides it as `crickid`)
  // RESILIENCE (merged): possible11 intermittently returns crickid=0 for matches
  // it previously resolved fine. Once resolved, cache the id FOREVER so the
  // flaky crickid field can never wipe player data again. Also pass BOTH full
  // names AND short codes (cod1/cod2, e.g. "IN-W"/"ZM-W") so findCricbuzzId can
  // match slugs that use abbreviated codes.
  let cricbuzzId: string | null = details?.crickid && String(details.crickid) !== "0" ? String(details.crickid) : null;
  if (cricbuzzId) {
    crickidCache.set(String(matchId), cricbuzzId);
  } else {
    cricbuzzId = crickidCache.get(String(matchId)) || null;
    if (cricbuzzId) console.log(`[match-detail] ${matchId}: crickid missing/0 upstream — using cached Cricbuzz id ${cricbuzzId}`);
  }
  if (!cricbuzzId) {
    const teamCodes = [team1Short, team2Short].filter(Boolean) as string[];
    cricbuzzId = await findCricbuzzId(
      [team1Full || "", team2Full || ""],
      teamCodes
    );
    if (cricbuzzId) crickidCache.set(String(matchId), cricbuzzId);
  }

  const squads = cricbuzzId ? await fetchCricbuzzSquads(cricbuzzId) : null;

  let left: ReturnType<typeof buildPlayers> = [];
  let right: ReturnType<typeof buildPlayers> = [];
  let lineupAnnounced = false;

  if (squads) {
    lineupAnnounced = squads.lineupAnnounced;
    let [a, b] = squads.teams;
    // Align Cricbuzz team order with possible11 team1/team2
    const straight =
      nameScore(a.name, a.shortName, team1Short, team1Full) + nameScore(b.name, b.shortName, team2Short, team2Full);
    const swapped =
      nameScore(b.name, b.shortName, team1Short, team1Full) + nameScore(a.name, a.shortName, team2Short, team2Full);
    if (swapped > straight) [a, b] = [b, a];
    left = buildPlayers(a.players, team1Short, 0, lineupAnnounced);
    right = buildPlayers(b.players, team2Short, 1, lineupAnnounced);
  } else {
    // PLAYER DATA FIX — 3rd fallback: Cricbuzz squads not published yet.
    // The possible11 preview article still lists REAL player names — parse it
    // so matches 1-3 days away are usable instead of showing 0 players.
    const previewTeams = parsePlayersFromPreview(details?.detail, details?.latest);
    if (previewTeams) {
      const [pt1, pt2] = previewTeams;
      const toPreviewPlayer = (
        p: PreviewPlayer,
        teamIndex: number,
        teamShort: string
      ) => {
        const credits = p.isCaptain ? 9.5 : p.role === 0 ? 9 : 8.5;
        const sel = p.isCaptain ? 45 : 25;
        const ri =
          p.role === 0
            ? { role: 0, player_type: "WK", role_text: "Wicket Keeper" }
            : p.role === 2
              ? { role: 2, player_type: "AR", role_text: "All Rounder" }
              : p.role === 3
                ? { role: 3, player_type: "BOWL", role_text: "Bowler" }
                : { role: 1, player_type: "BAT", role_text: "Batsman" };
        return {
          pid: `pv_${teamIndex}_${p.name.toLowerCase().replace(/[^a-z]+/g, "_")}`,
          id: `pv_${teamIndex}_${p.name.toLowerCase().replace(/[^a-z]+/g, "_")}`,
          player_fixed_id: `pv_${teamIndex}_${p.name.toLowerCase().replace(/[^a-z]+/g, "_")}`,
          pl_id: `pv_${teamIndex}_${p.name.toLowerCase().replace(/[^a-z]+/g, "_")}`,
          name: p.name,
          shortName: p.name,
          image: undefined,
          team: teamShort,
          team_name: teamShort,
          team_short_name: teamShort,
          team_index: teamIndex,
          ...ri,
          credits,
          points: 0,
          selected_by: sel,
          sel,
          captain_percentage: p.isCaptain ? 30 : 0,
          vice_captain_percentage: 0,
          playing: 0, // probable — lineup not announced yet
          is_playing: 0,
          lineup_group: "Preview",
          is_captain: p.isCaptain,
          batting_style: undefined,
          bowling_style: undefined,
          substitute: false,
          overseas: false,
          last_play: 0,
        };
      };
      // Preview players share the MatchPlayer shape but are string-id based —
      // cast is safe: every consumer reads name/role/credits/playing fields.
      left = pt1.players.map((p) => toPreviewPlayer(p, 0, pt1.short || team1Short)) as unknown as ReturnType<typeof buildPlayers>;
      right = pt2.players.map((p) => toPreviewPlayer(p, 1, pt2.short || team2Short)) as unknown as ReturnType<typeof buildPlayers>;
      // Align team labels with what the preview article calls the teams
      team1Short = pt1.short || team1Short;
      team2Short = pt2.short || team2Short;
    }
  }

  const stripHtml = (h?: unknown) =>
    typeof h === "string" ? h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : undefined;
  const venueMatch =
    typeof details?.report === "string" ? /Venue<\/strong>\s*:\s*([^<]+)/i.exec(details.report) : null;

  const fallbackBase = {
    matchId,
    id: matchId,
    team1: { shortName: team1Short, name: team1Short },
    team2: { shortName: team2Short, name: team2Short },
    team1Short,
    team2Short,
    left_team_name: team1Short,
    right_team_name: team2Short,
    fantasy_list: ["dream11", "my11circle"],
  };

  return {
    ...(base || fallbackBase),
    matchId,
    id: matchId,
    series: base?.series || details?.tour,
    series_name: details?.tour || base?.series_name,
    venue: venueMatch ? venueMatch[1].trim() : undefined,
    left_team_players: left,
    right_team_players: right,
    lineup_status: lineupAnnounced ? 1 : 0,
    cricbuzzId,
    crickid: cricbuzzId,
    players_source: squads ? "cricbuzz" : left.length > 0 ? "preview" : "none",
    squad_status: left.length + right.length > 0 ? "available" : "not_announced",
    preview_html: details?.detail,
    fantasy_tips_html: details?.fantasy,
    pitch_report_html: details?.report,
    injury_html: details?.injured,
    preview_text: stripHtml(details?.latest),
    updated_text: details?.uptime,
  };
}
