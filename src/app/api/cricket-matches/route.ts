/**
 * Cricket Matches API — ported from ai-match-hub/src/lib/cricket.functions.ts
 * getMatches server fn → Next.js GET endpoint
 *
 * Pure HTML scraping of Cricbuzz live-scores + upcoming-series pages.
 * Decodes Next.js streamed JSON chunks to extract matchInfo objects.
 * NO AI calls.
 */

import { NextResponse } from "next/server";
import { verifyLicenseFromRequest, licenseErrorResponse } from "@/lib/api-license-guard";

export const runtime = "nodejs";
export const maxDuration = 30;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

export type CricketMatch = {
  id: string;
  series: string;
  team1: string;
  team1Short: string;
  team2: string;
  team2Short: string;
  status: string;
  state: "live" | "upcoming" | "complete";
  venue: string;
  startTime: number;
  format: string;
  liveScore?: string;
};

function extractJsonObject(src: string, start: number): string | null {
  if (src[start] !== "{") return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else {
      if (ch === '"') inStr = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) return src.slice(start, i + 1);
      }
    }
  }
  return null;
}

function decodeNextChunks(html: string): string {
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let m: RegExpExecArray | null;
  let out = "";
  while ((m = re.exec(html)) !== null) {
    try {
      out += JSON.parse(`"${m[1]}"`);
    } catch {
      // skip
    }
  }
  return out;
}

function parseFromHtml(html: string): CricketMatch[] {
  const text = decodeNextChunks(html);
  const out = new Map<string, CricketMatch>();
  const re = /"matchInfo":/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const braceStart = text.indexOf("{", m.index + m[0].length);
    if (braceStart < 0) continue;
    const objStr = extractJsonObject(text, braceStart);
    if (!objStr) continue;
    let info: any;
    try {
      info = JSON.parse(objStr);
    } catch {
      continue;
    }
    if (!info.matchId || !info.team1 || !info.team2) continue;

    let liveScore: string | undefined;
    const after = text.slice(braceStart + objStr.length, braceStart + objStr.length + 4000);
    const scoreIdx = after.indexOf('"matchScore":');
    if (scoreIdx >= 0) {
      const sStart = after.indexOf("{", scoreIdx);
      if (sStart >= 0) {
        const sObj = extractJsonObject(after, sStart);
        if (sObj) {
          try {
            const score = JSON.parse(sObj);
            const fmt = (x: any) =>
              x ? `${x.runs ?? 0}/${x.wickets ?? 0} (${x.overs ?? 0})` : "";
            const t1 = score.team1Score?.inngs1 ?? score.team1Score?.inngs2;
            const t2 = score.team2Score?.inngs1 ?? score.team2Score?.inngs2;
            const a = fmt(t1);
            const b = fmt(t2);
            liveScore = [a, b].filter(Boolean).join("  vs  ");
          } catch {
            /* ignore */
          }
        }
      }
    }

    const stateLower = String(info.state ?? "").toLowerCase();
    const state: CricketMatch["state"] =
      stateLower.includes("complete") ||
      stateLower.includes("result") ||
      stateLower === "stumps"
        ? "complete"
        : stateLower === "preview" || stateLower === "upcoming" || stateLower === ""
          ? Number(info.startDate ?? 0) > Date.now() ? "upcoming" : "live"
          : "live";

    const id = String(info.matchId);
    if (out.has(id)) continue;
    out.set(id, {
      id,
      series: info.seriesName ?? "",
      team1: info.team1?.teamName ?? "",
      team1Short: info.team1?.teamSName ?? "",
      team2: info.team2?.teamName ?? "",
      team2Short: info.team2?.teamSName ?? "",
      status: info.status ?? info.state ?? "",
      state,
      venue: `${info.venueInfo?.ground ?? ""}${info.venueInfo?.city ? ", " + info.venueInfo.city : ""}`,
      startTime: Number(info.startDate ?? 0),
      format: info.matchFormat ?? "",
      liveScore,
    });
  }
  return Array.from(out.values());
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch(url, { headers: HEADERS, signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  try {
    // LICENSE CHECK — verify subscription before processing
    const licenseCheck = await verifyLicenseFromRequest(request);
    if (!licenseCheck.valid) {
      return licenseErrorResponse(licenseCheck);
    }
    const [liveHtml, upHtml] = await Promise.all([
      fetchPage("https://www.cricbuzz.com/cricket-match/live-scores"),
      fetchPage("https://www.cricbuzz.com/cricket-schedule/upcoming-series/all"),
    ]);

    if (!liveHtml && !upHtml) {
      return NextResponse.json({
        ok: false,
        error: "Unable to reach cricket data source",
        live: [],
        upcoming: [],
        fetchedAt: Date.now(),
      });
    }

    const all = new Map<string, CricketMatch>();
    if (liveHtml) for (const m of parseFromHtml(liveHtml)) all.set(m.id, m);
    if (upHtml) for (const m of parseFromHtml(upHtml)) if (!all.has(m.id)) all.set(m.id, m);

    const now = Date.now();
    const week = now + 8 * 24 * 60 * 60 * 1000;
    const list = Array.from(all.values());
    const live = list
      .filter((m) => m.state === "live")
      .sort((a, b) => a.startTime - b.startTime);
    const upcoming = list
      .filter((m) => m.state === "upcoming" && m.startTime >= now - 6 * 3600_000 && m.startTime <= week)
      .sort((a, b) => a.startTime - b.startTime);

    return NextResponse.json({ ok: true, live, upcoming, fetchedAt: now });
  } catch (error) {
    console.error("[CricketMatches] Error:", error);
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Server error",
      live: [],
      upcoming: [],
      fetchedAt: Date.now(),
    });
  }
}
