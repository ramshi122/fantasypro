/**
 * Fetch Web API — Server-side HTML scraper
 * ==========================================
 * Ported from titan-ally-engine's fetchWeb server function.
 * Fetches URLs server-side and returns cleaned text + parsed Cricbuzz matches.
 */

import { NextResponse } from "next/server";
import { verifyLicenseFromRequest, licenseErrorResponse } from "@/lib/api-license-guard";

export const runtime = "nodejs";
export const maxDuration = 30;

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36";

interface ScrapedMatch {
  id: string;
  name: string;
  series: string;
  status: string;
  score?: string;
  venue?: string;
  time?: string;
  url?: string;
  isLive?: boolean;
}

function htmlToText(html: string, maxLen = 18000): string {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  s = s.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  if (s.length > maxLen) s = s.slice(0, maxLen) + "\n…[truncated]";
  return s;
}

function decodeHtml(s: string): string {
  return s.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/\s+/g, " ").trim();
}

function titleCaseSlug(slug: string): string {
  return slug.replace(/^[a-z0-9]+-vs-[a-z0-9]+-/i, "")
    .replace(/^\d+(st|nd|rd|th)-match-/i, "")
    .replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

function seriesFromHref(href: string): string {
  const slug = href.split("/").filter(Boolean).pop() || "";
  const year = slug.match(/20\d{2}/)?.[0];
  if (/\bipl\b|indian-premier-league/i.test(slug)) return `IPL${year ? ` ${year}` : ""}`;
  return titleCaseSlug(slug) || "Cricket Match";
}

function cleanCricbuzzTitle(title: string): string {
  return title.replace(/\s+Live\s+Cricket\s+Score\b/gi, "")
    .replace(/\s+Full\s+Scorecard\b/gi, "")
    .replace(/\s+Commentary\b/gi, "").replace(/\s+/g, " ").trim();
}

function parseCricbuzzMatches(html: string): ScrapedMatch[] {
  const seen = new Map<string, ScrapedMatch>();
  const anchorRe = /<a\b(?=[^>]*href="([^"]*\/live-cricket-scores\/[^"]+)")(?=[^>]*title="([^"]+)")[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRe.exec(html))) {
    const href = decodeHtml(match[1]).startsWith("http") ? decodeHtml(match[1]) : `https://www.cricbuzz.com${decodeHtml(match[1])}`;
    const title = cleanCricbuzzTitle(decodeHtml(match[2]));
    if (!/\s+vs\s+/i.test(title)) continue;
    const parts = title.match(/^(.+?\s+vs\s+.+?)(?:,\s*([^-]+?))?\s*(?:-\s*(.*))?$/i);
    if (!parts) continue;
    const teams = parts[1].trim();
    const matchNo = (parts[2] || "").trim();
    const rawStatus = (parts[3] || "Preview").trim();
    if (/\b(won|complete|abandoned|no result|drawn)\b/i.test(rawStatus)) continue;
    const name = matchNo ? `${teams}, ${matchNo}` : teams;
    const isLive = !/\b(preview|upcoming)\b/i.test(rawStatus);
    const status = isLive ? rawStatus || "LIVE" : "UPCOMING";
    const key = href.match(/live-cricket-scores\/(\d+)/)?.[1] || name.toLowerCase();
    const candidate: ScrapedMatch = {
      id: href.match(/live-cricket-scores\/(\d+)/)?.[1] || key,
      name, series: seriesFromHref(href), status,
      score: isLive ? rawStatus : undefined, url: href, isLive,
    };
    const existing = seen.get(key);
    if (!existing || candidate.name.length > existing.name.length || (candidate.isLive && !existing.isLive)) {
      seen.set(key, { ...existing, ...candidate });
    }
  }
  return Array.from(seen.values()).sort((a, b) => {
    const ai = /\bipl\b/i.test(`${a.series} ${a.url}`) ? 1 : 0;
    const bi = /\bipl\b/i.test(`${b.series} ${b.url}`) ? 1 : 0;
    return bi - ai || Number(b.isLive) - Number(a.isLive) || a.name.localeCompare(b.name);
  });
}

export async function POST(request: Request) {
  try {
    // LICENSE CHECK — verify subscription before processing
    const licenseCheck = await verifyLicenseFromRequest(request);
    if (!licenseCheck.valid) {
      return licenseErrorResponse(licenseCheck);
    }
    const body = await request.json();
    const { urls, maxCharsPerPage } = body;
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ ok: false, error: "urls array required" });
    }
    console.log("[FetchWeb] Fetching", urls.length, "URLs:", urls);
    const max = maxCharsPerPage ?? 18000;
    const headers = {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    };
    const out: any[] = [];
    await Promise.all(urls.map(async (url: string) => {
      // 3 retries per URL with exponential backoff (1s, 2s, 4s)
      // 30s timeout per attempt (was 12s — too short for slow sites)
      const MAX_ATTEMPTS = 3;
      let lastErr = "";
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 30000);
          const res = await fetch(url, { headers, signal: ctrl.signal });
          clearTimeout(timer);
          const txt = await res.text();
          const ct = res.headers.get("content-type") || "";
          const deterministicMatches = /cricbuzz\.com/i.test(url) ? parseCricbuzzMatches(txt) : [];
          const cleaned = ct.includes("application/json") ? txt.slice(0, max) : htmlToText(txt, max);
          console.log(`[FetchWeb] ✅ [attempt ${attempt}] ${url} → ${res.status} · ${cleaned.length} chars · ${deterministicMatches.length} matches`);
          out.push({ url, ok: res.ok, status: res.status, text: cleaned, matches: deterministicMatches });
          break; // success, exit retry loop
        } catch (e: any) {
          lastErr = e?.message || "fetch failed";
          console.error(`[FetchWeb] ❌ [attempt ${attempt}/${MAX_ATTEMPTS}] ${url}: ${lastErr}`);
          if (attempt < MAX_ATTEMPTS) {
            const backoff = 1000 * Math.pow(2, attempt - 1);
            await new Promise(r => setTimeout(r, backoff));
          } else {
            out.push({ url, ok: false, status: 0, error: lastErr });
          }
        }
      }
    }));
    console.log("[FetchWeb] Done,", out.length, "pages fetched");
    return NextResponse.json({ ok: true, pages: out });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Server error" });
  }
}
