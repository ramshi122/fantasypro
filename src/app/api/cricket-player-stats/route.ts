/**
 * Cricket Player Career Stats API — ported from ai-match-hub/src/lib/cricket.functions.ts
 * getPlayerCareerStats server fn → Next.js POST endpoint
 *
 * Scrapes Cricbuzz profile pages for REAL career stats.
 * NO AI calls — pure HTML/JSON scraping.
 *
 * POST body: { playerIds: string[], format: string }
 */

import { NextResponse } from "next/server";
import { verifyLicenseFromRequest, licenseErrorResponse } from "@/lib/api-license-guard";

export const runtime = "nodejs";
export const maxDuration = 60;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
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
    } catch {}
  }
  return out;
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

function parseStatsTable(values: any[], formats: string[], colIdx: number) {
  const out: Record<string, string> = {};
  if (!Array.isArray(values)) return out;
  for (const row of values) {
    const r = row?.values;
    if (!Array.isArray(r) || r.length < 2) continue;
    out[String(r[0])] = String(r[colIdx] ?? "");
  }
  return out;
}

function pickFormatColumn(headers: string[], desired: string): number {
  const want = desired.toLowerCase();
  for (let i = 1; i < headers.length; i++) {
    if (String(headers[i]).toLowerCase() === want) return i;
  }
  const prefer = ["IPL", "T20", "ODI", "Test"];
  for (const p of prefer) {
    for (let i = 1; i < headers.length; i++) {
      if (String(headers[i]).toLowerCase() === p.toLowerCase()) return i;
    }
  }
  return 1;
}

async function fetchPlayerStats(playerId: string, format: string) {
  if (!playerId) return null;
  const url = `https://www.cricbuzz.com/profiles/${playerId}/x`;
  const html = await fetchPage(url);
  if (!html) return null;
  const text = decodeNextChunks(html);

  const readBlock = (key: string) => {
    const marker = `"${key}":{`;
    const idx = text.indexOf(marker);
    if (idx < 0) return null;
    const objStart = idx + key.length + 3;
    const obj = extractJsonObject(text, objStart);
    if (!obj) return null;
    try { return JSON.parse(obj); } catch { return null; }
  };

  const batBlock = readBlock("playerBattingStats");
  const bowlBlock = readBlock("playerBowlingStats");
  if (!batBlock && !bowlBlock) return null;

  const headers: string[] = batBlock?.headers ?? bowlBlock?.headers ?? [];
  const col = pickFormatColumn(headers, format);
  const fmtLabel = String(headers[col] ?? format);

  const batRows = parseStatsTable(batBlock?.values ?? [], headers, col);
  const bowlRows = parseStatsTable(bowlBlock?.values ?? [], headers, col);

  const num = (v: string | undefined) => {
    if (!v || v === "-" || v === "-/-") return 0;
    const n = parseFloat(String(v).replace(/,/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  return {
    id: playerId,
    format: fmtLabel,
    bat: {
      matches: num(batRows["Matches"]),
      runs: num(batRows["Runs"]),
      avg: num(batRows["Average"]),
      sr: num(batRows["SR"]),
      hs: num(batRows["Highest"]),
      fifties: num(batRows["50s"]),
      hundreds: num(batRows["100s"]),
    },
    bowl: {
      matches: num(bowlRows["Matches"]),
      wickets: num(bowlRows["Wickets"]),
      avg: num(bowlRows["Avg"]),
      eco: num(bowlRows["Eco"]),
      sr: num(bowlRows["SR"]),
      bbi: bowlRows["BBI"] ?? "-",
    },
  };
}

export async function POST(request: Request) {
  try {
    // LICENSE CHECK — verify subscription before processing
    const licenseCheck = await verifyLicenseFromRequest(request);
    if (!licenseCheck.valid) {
      return licenseErrorResponse(licenseCheck);
    }
    const body = await request.json();
    const playerIds: string[] = Array.isArray(body?.playerIds) ? body.playerIds : [];
    const format: string = String(body?.format || "T20");
    if (playerIds.length === 0) {
      return NextResponse.json({ ok: false, error: "playerIds array required", stats: {} });
    }

    const out: Record<string, any> = {};
    const CONCURRENCY = 6;
    let cursor = 0;
    async function worker() {
      while (cursor < playerIds.length) {
        const i = cursor++;
        const id = playerIds[i];
        try {
          const s = await fetchPlayerStats(id, format);
          if (s) out[id] = s;
        } catch {}
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, playerIds.length) }, worker));

    return NextResponse.json({ ok: true, stats: out });
  } catch (error) {
    console.error("[CricketPlayerStats] Error:", error);
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Server error",
      stats: {},
    });
  }
}
