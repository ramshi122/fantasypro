/**
 * Cricbuzz Matches Scraper API
 * =============================
 * Scrapes upcoming matches from Cricbuzz live-scores page.
 * Returns matches with id, slug, title, series, format.
 *
 * GET /api/cricbuzz-matches
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
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

function parseTeamsFromSlug(slug: string): { t1: string; t2: string; rest: string[] } {
  const parts = slug.split("-");
  const vsIdx = parts.indexOf("vs");
  if (vsIdx <= 0) return { t1: "T1", t2: "T2", rest: [] };
  const restStart = parts.findIndex((p, i) =>
    i > vsIdx + 1 && /^(\d+(st|nd|rd|th)|match|test|odi|t20i?|final|semi|qualifier|eliminator|only|warm)$/i.test(p));
  const t2End = restStart > 0 ? restStart : vsIdx + 2;
  return {
    t1: parts.slice(0, vsIdx).join(" ").toUpperCase(),
    t2: parts.slice(vsIdx + 1, t2End).join(" ").toUpperCase(),
    rest: parts.slice(t2End),
  };
}

export async function GET() {
  try {
    const html = await fetchHtml("https://www.cricbuzz.com/cricket-match/live-scores/upcoming-matches");
    const seen = new Set<string>();
    const matches: any[] = [];
    const re = /href="\/live-cricket-scores\/(\d+)\/([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const id = m[1];
      const slug = m[2];
      if (seen.has(id)) continue;
      if (!/-vs-/i.test(slug)) continue;
      // Show all matches (not just 2026 — for broader compatibility)
      seen.add(id);
      const parsedTeams = parseTeamsFromSlug(slug);
      let title = slug.replace(/-/g, " ");
      let series = "";
      let format = "";
      if (parsedTeams.t1 !== "T1") {
        title = `${parsedTeams.t1} vs ${parsedTeams.t2}`;
        const rest = parsedTeams.rest;
        const fmtIdx = rest.findIndex((p) => /^(test|t20i?|odi|match)$/i.test(p));
        if (fmtIdx >= 0) {
          format = rest.slice(0, fmtIdx + 1).join(" ");
          series = rest.slice(fmtIdx + 1).join(" ");
        } else {
          series = rest.join(" ");
        }
      }
      matches.push({ id, slug, title, series, format });
      if (matches.length >= 30) break;
    }
    return NextResponse.json({ status: "success", matches });
  } catch (error) {
    console.error("[CricbuzzMatches] Error:", error);
    return NextResponse.json({
      status: "fail",
      matches: [],
      error: error instanceof Error ? error.message : "Failed to load matches",
    });
  }
}
