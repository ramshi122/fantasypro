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

/* ------------------------------------------------------------------ */
/* possible11                                                          */
/* ------------------------------------------------------------------ */

export async function p11Post<T = unknown>(action: string, extra: Record<string, unknown> = {}): Promise<T | null> {
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
      return null;
    }
  } catch (err) {
    console.error(`[p11] ${action} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
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

/** Fallback: locate the Cricbuzz match id by team names in live/upcoming lists. */
export async function findCricbuzzId(names: string[]): Promise<string | null> {
  const needles = names.filter(Boolean).map(slugify).filter((n) => n.length >= 2);
  if (needles.length === 0) return null;
  const pages = [
    `${CB_BASE}/cricket-match/live-scores`,
    `${CB_BASE}/cricket-match/live-scores/upcoming-matches`,
  ];
  for (const url of pages) {
    try {
      const html = await fetchHtml(url);
      const re = /\/live-cricket-scores\/(\d+)\/([a-z0-9-]+)/g;
      let m: RegExpExecArray | null;
      let best: { id: string; score: number } | null = null;
      while ((m = re.exec(html))) {
        const slug = m[2];
        const score = needles.filter((n) => slug.includes(n)).length;
        if (score > 0 && (!best || score > best.score)) best = { id: m[1], score };
      }
      if (best && best.score >= Math.min(2, needles.length)) return best.id;
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
/* Match detail                                                        */
/* ------------------------------------------------------------------ */

export async function buildMatchDetail(matchId: string, sport = "cricket") {
  const [matches, detailsRaw] = await Promise.all([
    fetchP11Matches(sport),
    p11Post<any>("getMatchDetails", { mid: matchId }),
  ]);
  const base = matches.find((m) => String(m.id) === String(matchId));
  const details: Record<string, any> | null = Array.isArray(detailsRaw)
    ? detailsRaw[0] ?? null
    : detailsRaw && typeof detailsRaw === "object"
      ? detailsRaw
      : null;

  const team1Short = base?.team1Short || "T1";
  const team2Short = base?.team2Short || "T2";
  const team1Full = base?.team1?.name;
  const team2Full = base?.team2?.name;

  // Resolve the Cricbuzz id (possible11 provides it as `crickid`)
  let cricbuzzId: string | null = details?.crickid ? String(details.crickid) : null;
  if (!cricbuzzId || cricbuzzId === "0") {
    cricbuzzId = await findCricbuzzId([team1Full || "", team2Full || ""]);
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
    players_source: squads ? "cricbuzz" : "none",
    preview_html: details?.detail,
    fantasy_tips_html: details?.fantasy,
    pitch_report_html: details?.report,
    injury_html: details?.injured,
    preview_text: stripHtml(details?.latest),
    updated_text: details?.uptime,
  };
}
