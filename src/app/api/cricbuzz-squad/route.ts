/**
 * Cricbuzz Squad Scraper API (NO AI — pure HTML parsing)
 * ========================================================
 * Scrapes playing XI / squad for a match from Cricbuzz using regex on RAW HTML.
 * This is the "proper bypass" — no AI calls, no empty-response failures.
 *
 * GET /api/cricbuzz-squad?id=12345&slug=ind-vs-aus-1st-odi-2026
 * GET /api/cricbuzz-squad?url=https://www.cricbuzz.com/live-cricket-scores/12345/...
 *
 * Strategy (in order):
 *   1. Try /cricket-match-squads/{id}/{slug} → look for "Playing XI" section
 *   2. Try /live-cricket-scores/{id}/{slug}  → look for "Playing XI" section
 *   3. Try /cricket-full-scorecard/{id}/{slug} → look for "Batting"/"Bowling" tables
 *   4. RAW FALLBACK: scan ALL /profiles/{id}/{slug} links anywhere in any page,
 *      dedupe by profile id, split first 11 → team1, next 11 → team2.
 *      This is bulletproof — even if Cricbuzz changes their layout, /profiles/
 *      links are stable identifiers for every player.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36";

async function fetchHtml(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: ctrl.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Upstream ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ")
    .replace(/<!--.*?-->/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/\s+/g, " ")
    .trim();
}

function inferRole(roleStr: string): "WK" | "BAT" | "AR" | "BOWL" | "UNK" {
  const r = (roleStr || "").toLowerCase();
  if (r.includes("keeper") || r.includes("wk")) return "WK";
  if (r.includes("allrounder") || r.includes("all-rounder") || r.includes("all rounder")) return "AR";
  if (r.includes("bowler") || r.includes("bowling")) return "BOWL";
  if (r.includes("batter") || r.includes("batsman") || r.includes("batting")) return "BAT";
  return "UNK";
}

function titleCaseSlug(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseTeamsFromSlug(slug: string): { t1: string; t2: string } {
  const parts = slug.split("-");
  const vsIdx = parts.indexOf("vs");
  if (vsIdx <= 0) return { t1: "T1", t2: "T2" };
  // Stop at any match-format/match-number keyword
  const stopRe = /^(\d+(st|nd|rd|th)|match|test|odi|t20i?|final|semi|qualifier|eliminator|only|warm|one|off|super|over)$/i;
  const restStart = parts.findIndex((p, i) => i > vsIdx + 1 && stopRe.test(p));
  const t2End = restStart > 0 ? restStart : vsIdx + 2;
  return {
    t1: parts.slice(0, vsIdx).join(" ").toUpperCase(),
    t2: parts.slice(vsIdx + 1, t2End).join(" ").toUpperCase(),
  };
}

function findSection(html: string, heading: string, endHeadings: string[]): string {
  const startRe = new RegExp(`<h[1-4][^>]*>\\s*${heading}\\s*</h[1-4]>`, "i");
  const start = startRe.exec(html);
  if (!start || typeof start.index !== "number") return "";
  const from = start.index + start[0].length;
  const ends = endHeadings.map((h) => {
    const m = new RegExp(`<h[1-4][^>]*>\\s*${h}\\s*</h[1-4]>`, "i").exec(html.slice(from));
    return m && typeof m.index === "number" ? from + m.index : -1;
  }).filter((n) => n > from);
  const to = ends.length ? Math.min(...ends) : html.length;
  return html.slice(from, to);
}

function splitTeamColumns(section: string): [string, string] | null {
  // Try multiple column-class patterns Cricbuzz uses
  const patterns = [
    /<div\s+class="w-1\/2"[^>]*>/g,
    /<div\s+class="[^"]*cb-col[^"]*cb-col-50[^"]*"[^>]*>/g,
    /<div\s+class="[^"]*col-50[^"]*"[^>]*>/g,
  ];
  for (const re of patterns) {
    const starts = Array.from(section.matchAll(re));
    if (starts.length >= 2 && starts[0].index != null && starts[1].index != null) {
      return [section.slice(starts[0].index, starts[1].index), section.slice(starts[1].index)];
    }
  }
  return null;
}

function parsePlayersFromCards(html: string, team: string, status: string) {
  const out: any[] = [];
  const re = /href="\/profiles\/(\d+)\/([a-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    const slug = m[2];
    const inner = m[3];
    const spans = Array.from(inner.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g))
      .map((s) => stripTags(s[1])).filter(Boolean);
    const titleName = inner.match(/title=["']View Profile Of ([^"']+)["']/i)?.[1];
    const name = spans.find((s) => !/^\([A-Z]+\)$/i.test(s) && /[a-z]/i.test(s) && s.length < 60)
      ?? titleName
      ?? titleCaseSlug(slug);
    const role = inner.match(/text-cbTxtSec[^>]*>([\s\S]*?)<\/div>/i)?.[1]
      ?? inner.match(/\((WK)\)/i)?.[1]
      ?? "";
    const roleClean = stripTags(role);
    const captain = /\(c\)/i.test(stripTags(inner));
    const wicketKeeper = /\(wk\)/i.test(stripTags(inner)) || /keeper|wk/i.test(roleClean);
    out.push({
      id, name: stripTags(name), team, role: roleClean,
      roleShort: inferRole(roleClean),
      playingStatus: status,
      isConfirmedLineup: status === "XI" || status === "PROBABLE_XI",
      source: status === "XI" ? "Cricbuzz Playing XI"
        : status === "PROBABLE_XI" ? "Cricbuzz Probable XI"
        : "Cricbuzz Squad",
      captain, wicketKeeper,
    });
  }
  return out;
}

/**
 * RAW FALLBACK — bulletproof player extractor.
 * Scans the entire HTML for ANY /profiles/{id}/{slug} links, dedupes by id,
 * and returns all of them. Used when the structured parser fails.
 * We can't know which team each player belongs to from a raw scan, so we split
 * the first half → team1, second half → team2.
 */
function rawProfileScan(html: string, t1: string, t2: string): any[] {
  const seen = new Map<string, any>();
  const re = /href="\/profiles\/(\d+)\/([a-z0-9-]+)"[^>]*?(?:title=["']View Profile Of ([^"']+)["'])?[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    const slug = m[2];
    const titleName = m[3];
    if (seen.has(id)) continue;
    const name = titleName ? stripTags(titleName) : titleCaseSlug(slug);
    // Skip if name looks like a team code or junk
    if (!name || name.length < 3 || /^[A-Z]+$/.test(name)) continue;
    seen.set(id, {
      id, name, team: "", role: "", roleShort: "UNK",
      playingStatus: "SQUAD",
      isConfirmedLineup: false,
      source: "Cricbuzz profiles (raw scan)",
      captain: false, wicketKeeper: false,
    });
  }
  const all = Array.from(seen.values());
  if (all.length === 0) return [];
  // Split: first half → team1, second half → team2 (rough heuristic)
  const half = Math.ceil(all.length / 2);
  return all.map((p, i) => ({ ...p, team: i < half ? t1 : t2 }));
}

/**
 * Scorecard fallback — for live/completed matches, parse batting tables.
 * Each team has a batting section with player names + roles.
 */
function parseScorecardPlayers(html: string, t1: string, t2: string): any[] {
  const out: any[] = [];
  // Find innings headers like "India 1st Innings"
  const inningsRe = /<h\d[^>]*>\s*([A-Z][A-Za-z\s]+?)\s+\d+(?:st|nd|rd|th)?\s+Innings\s*<\/h\d>/gi;
  const inningsMatches = Array.from(html.matchAll(inningsRe));
  if (inningsMatches.length === 0) return [];

  for (let i = 0; i < inningsMatches.length; i++) {
    const inn = inningsMatches[i];
    const teamName = inn[1].trim();
    const startIdx = inn.index! + inn[0].length;
    const endIdx = i + 1 < inningsMatches.length
      ? inningsMatches[i + 1].index!
      : html.length;
    const section = html.slice(startIdx, endIdx);

    // Find batsman rows
    const batRe = /href="\/profiles\/(\d+)\/([a-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    const seenInInns = new Set<string>();
    while ((m = batRe.exec(section)) !== null) {
      const id = m[1];
      const slug = m[2];
      if (seenInInns.has(id)) continue;
      seenInInns.add(id);
      const inner = m[3];
      const titleName = inner.match(/title=["']View Profile Of ([^"']+)["']/i)?.[1];
      const name = titleName ? stripTags(titleName) : titleCaseSlug(slug);
      if (!name || name.length < 3) continue;
      out.push({
        id, name, team: teamName.toUpperCase(),
        role: "", roleShort: "UNK",
        playingStatus: "XI",
        isConfirmedLineup: true,
        source: "Cricbuzz Scorecard",
        captain: false, wicketKeeper: false,
      });
    }
  }
  return out;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let id = searchParams.get("id");
    let slug = searchParams.get("slug");
    const urlParam = searchParams.get("url");

    // Allow caller to pass a full URL instead
    if (!id || !slug) {
      if (urlParam) {
        const m = urlParam.match(/cricbuzz\.com\/(?:live-cricket-scores|cricket-match-squads|cricket-full-scorecard)\/(\d+)\/([^/?#]+)/i);
        if (m) {
          id = m[1];
          slug = m[2];
        }
      }
    }

    if (!id || !slug) {
      return NextResponse.json({
        status: "fail",
        error: "id+slug or url required",
        players: [],
        teams: { t1: "T1", t2: "T2" },
      });
    }

    const { t1, t2 } = parseTeamsFromSlug(slug);

    // URL variants to try in order
    const urls = [
      `https://www.cricbuzz.com/cricket-match-squads/${id}/${slug}`,
      `https://www.cricbuzz.com/live-cricket-scores/${id}/${slug}`,
      `https://www.cricbuzz.com/cricket-full-scorecard/${id}/${slug}`,
    ];

    let lastHtml = "";
    let lastError = "";

    for (const url of urls) {
      let html: string;
      try {
        html = await fetchHtml(url);
        lastHtml = html;
      } catch (e: any) {
        lastError = e?.message || "fetch failed";
        continue;
      }

      // Strategy 1: Playing XI section
      const xiSection = findSection(html, "playing XI", ["bench", "squad", "support staff"]);
      if (xiSection) {
        const xiCols = splitTeamColumns(xiSection);
        const xiPlayers = xiCols
          ? [...parsePlayersFromCards(xiCols[0], t1, "XI"), ...parsePlayersFromCards(xiCols[1], t2, "XI")]
          : [];
        if (xiPlayers.length >= 11) {
          const seen = new Map<string, any>();
          for (const p of xiPlayers) if (!seen.has(p.id)) seen.set(p.id, p);
          return NextResponse.json({
            status: "success",
            players: Array.from(seen.values()),
            teams: { t1, t2 },
            source: "Playing XI section",
            url,
          });
        }
      }

      // Strategy 2: Squad section (probable XI)
      const squadSection = findSection(html, "squad", ["bench", "support staff", "venue guide"]);
      if (squadSection) {
        const squadCols = splitTeamColumns(squadSection);
        const probablePlayers = squadCols
          ? [
              ...parsePlayersFromCards(squadCols[0], t1, "PROBABLE_XI").slice(0, 15),
              ...parsePlayersFromCards(squadCols[1], t2, "PROBABLE_XI").slice(0, 15),
            ]
          : [];
        if (probablePlayers.length >= 11) {
          const seen = new Map<string, any>();
          for (const p of probablePlayers) if (!seen.has(p.id)) seen.set(p.id, p);
          return NextResponse.json({
            status: "success",
            players: Array.from(seen.values()),
            teams: { t1, t2 },
            source: "Squad section (probable XI)",
            url,
          });
        }
      }

      // Strategy 3: Scorecard (live/completed matches)
      const scorecardPlayers = parseScorecardPlayers(html, t1, t2);
      if (scorecardPlayers.length >= 11) {
        const seen = new Map<string, any>();
        for (const p of scorecardPlayers) if (!seen.has(p.id)) seen.set(p.id, p);
        return NextResponse.json({
          status: "success",
          players: Array.from(seen.values()),
          teams: { t1, t2 },
          source: "Scorecard (live/completed)",
          url,
        });
      }
    }

    // Strategy 4: RAW FALLBACK — scan ALL /profiles/ links in lastHtml
    if (lastHtml) {
      const rawPlayers = rawProfileScan(lastHtml, t1, t2);
      if (rawPlayers.length >= 11) {
        return NextResponse.json({
          status: "success",
          players: rawPlayers,
          teams: { t1, t2 },
          source: "Raw /profiles/ scan (fallback)",
          url: urls[urls.length - 1],
        });
      }
    }

    return NextResponse.json({
      status: "fail",
      players: [],
      teams: { t1, t2 },
      error: `No verified lineup found. Last error: ${lastError || "unknown"}`,
    });
  } catch (error) {
    console.error("[CricbuzzSquad] Error:", error);
    return NextResponse.json({
      status: "fail",
      players: [],
      teams: { t1: "T1", t2: "T2" },
      error: error instanceof Error ? error.message : "Failed to load squads",
    });
  }
}
