/**
 * Cricbuzz Live Score Scraper API
 * =================================
 * Scrapes live score for a match from Cricbuzz.
 *
 * GET /api/cricbuzz-score?id=12345&slug=ind-vs-aus-1st-odi-2026
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
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const slug = searchParams.get("slug");
    if (!id || !slug) {
      return NextResponse.json({ status: "fail", error: "id and slug required" });
    }

    const url = `https://www.cricbuzz.com/live-cricket-scores/${id}/${slug}`;
    const html = await fetchHtml(url);

    const ogMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
    const ogText = ogMatch ? ogMatch[1] : "";

    const statusMatch = html.match(
      /class="(?:cb-text-(?:live|complete|preview|inprogress|stumps|lunch|tea|rain|delay|innings-break|toss))[^"]*"[^>]*>([\s\S]*?)</i,
    );
    const status = stripTags(statusMatch?.[1] || ogText || "Unknown");

    let state: "UPCOMING" | "LIVE" | "COMPLETE" | "UNKNOWN" = "UNKNOWN";
    if (/live|inprogress|innings break|toss/i.test(status)) state = "LIVE";
    else if (/won|complete|result/i.test(status)) state = "COMPLETE";
    else if (/preview|starts|scheduled/i.test(status)) state = "UPCOMING";

    const scoreMatches = Array.from(html.matchAll(/class="cb-font-20[^"]*"[^>]*>([\s\S]*?)</g));
    const scores = scoreMatches.map((m) => stripTags(m[1])).filter(Boolean).slice(0, 2);

    const venueMatch = html.match(/<span[^>]*class="text-cbTxtSec[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
    const venue = venueMatch ? stripTags(venueMatch[1]) : undefined;

    const tossMatch = html.match(/Toss:\s*([^<]+)/i);
    const toss = tossMatch ? stripTags(tossMatch[1]) : undefined;

    return NextResponse.json({
      status: "success",
      score: {
        status, state,
        scoreT1: scores[0],
        scoreT2: scores[1],
        venue,
        toss,
        updatedAt: Date.now(),
      },
    });
  } catch (error) {
    console.error("[CricbuzzScore] Error:", error);
    return NextResponse.json({
      status: "fail",
      score: null,
      error: error instanceof Error ? error.message : "Failed to load score",
    });
  }
}
