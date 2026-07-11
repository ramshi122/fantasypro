/**
 * Cricbuzz Squad Scraper API
 * ============================
 * Scrapes playing XI / squad for a match from Cricbuzz.
 *
 * GET /api/cricbuzz-squad?id=12345&slug=ind-vs-aus-1st-odi-2026
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" },
    signal: AbortSignal.timeout(15000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Upstream ${res.status}`);
  return await res.text();
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/<!--.*?-->/g, " ").replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
}

function inferRole(roleStr: string): "WK" | "BAT" | "AR" | "BOWL" | "UNK" {
  const r = roleStr.toLowerCase();
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
  const restStart = parts.findIndex((p, i) =>
    i > vsIdx + 1 && /^(\d+(st|nd|rd|th)|match|test|odi|t20i?|final|semi|qualifier|eliminator|only|warm)$/i.test(p));
  const t2End = restStart > 0 ? restStart : vsIdx + 2;
  return { t1: parts.slice(0, vsIdx).join(" ").toUpperCase(), t2: parts.slice(vsIdx + 1, t2End).join(" ").toUpperCase() };
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
  const starts = Array.from(section.matchAll(/<div\s+class="w-1\/2"[^>]*>/g));
  if (starts.length < 2 || starts[0].index == null || starts[1].index == null) return null;
  return [section.slice(starts[0].index, starts[1].index), section.slice(starts[1].index)];
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
    const name = spans.find((s) => !/^\([A-Z]+\)$/i.test(s) && /[a-z]/i.test(s) && s.length < 60) ?? titleName ?? titleCaseSlug(slug);
    const role = inner.match(/text-cbTxtSec[^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? inner.match(/\((WK)\)/i)?.[1] ?? "";
    const roleClean = stripTags(role);
    const captain = /\(c\)/i.test(stripTags(inner));
    const wicketKeeper = /\(wk\)/i.test(stripTags(inner)) || /keeper|wk/i.test(roleClean);
    out.push({
      id, name: stripTags(name), team, role: roleClean, roleShort: inferRole(roleClean),
      playingStatus: status, isConfirmedLineup: status === "XI" || status === "PROBABLE_XI",
      source: status === "XI" ? "Cricbuzz Playing XI" : status === "PROBABLE_XI" ? "Cricbuzz Probable XI" : "Cricbuzz Squad",
      captain, wicketKeeper,
    });
  }
  return out;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const slug = searchParams.get("slug");
    if (!id || !slug) {
      return NextResponse.json({ status: "fail", error: "id and slug required" });
    }

    const url = `https://www.cricbuzz.com/cricket-match-squads/${id}/${slug}`;
    const html = await fetchHtml(url);
    const { t1, t2 } = parseTeamsFromSlug(slug);

    // Try Playing XI first
    const xiSection = findSection(html, "playing XI", ["bench", "squad", "support staff"]);
    const xiCols = splitTeamColumns(xiSection);
    const xiPlayers = xiCols
      ? [...parsePlayersFromCards(xiCols[0], t1, "XI"), ...parsePlayersFromCards(xiCols[1], t2, "XI")]
      : [];

    if (xiPlayers.length >= 11) {
      const seen = new Map<string, any>();
      for (const p of xiPlayers) if (!seen.has(p.id)) seen.set(p.id, p);
      return NextResponse.json({ status: "success", players: Array.from(seen.values()), teams: { t1, t2 } });
    }

    // Fallback to Squad
    const squadSection = findSection(html, "squad", ["bench", "support staff", "venue guide"]);
    const squadCols = splitTeamColumns(squadSection);
    const probablePlayers = squadCols
      ? [...parsePlayersFromCards(squadCols[0], t1, "PROBABLE_XI").slice(0, 11),
         ...parsePlayersFromCards(squadCols[1], t2, "PROBABLE_XI").slice(0, 11)]
      : [];

    if (probablePlayers.length >= 22) {
      const seen = new Map<string, any>();
      for (const p of probablePlayers) if (!seen.has(p.id)) seen.set(p.id, p);
      return NextResponse.json({ status: "success", players: Array.from(seen.values()), teams: { t1, t2 } });
    }

    return NextResponse.json({
      status: "fail",
      players: [],
      teams: { t1, t2 },
      error: "No verified lineup found on Cricbuzz. Player pool hidden to avoid wrong data.",
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
