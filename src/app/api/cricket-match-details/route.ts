/**
 * Cricket Match Details API — ported from ai-match-hub/src/lib/cricket.functions.ts
 * getMatchDetails server fn → Next.js POST endpoint
 *
 * Scrapes Cricbuzz squad + overview pages for a single match.
 * Extracts playing XI, bench, substitutes, and toss info.
 * NO AI calls — pure HTML/JSON scraping.
 *
 * POST body: { matchId: string }
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

export async function POST(request: Request) {
  try {
    // LICENSE CHECK — verify subscription before processing
    const licenseCheck = await verifyLicenseFromRequest(request);
    if (!licenseCheck.valid) {
      return licenseErrorResponse(licenseCheck);
    }
    const body = await request.json();
    const matchId: string = String(body?.matchId || "");
    if (!matchId) {
      return NextResponse.json({ ok: false, error: "matchId required", teams: [], toss: null, lineupAnnounced: false });
    }

    const url = `https://www.cricbuzz.com/cricket-match-squads/${matchId}/match`;
    const overviewUrl = `https://www.cricbuzz.com/live-cricket-scores/${matchId}`;
    const [squadHtml, ovHtml] = await Promise.all([fetchPage(url), fetchPage(overviewUrl)]);

    const teams: any[] = [];
    let toss: { winner: string; decision: string } | null = null;
    let lineupAnnounced = false;

    const parseSquads = (html: string) => {
      const text = decodeNextChunks(html);

      const readTeamBlock = (key: "team1" | "team2") => {
        const marker = `"${key}":{"team":`;
        const idx = text.indexOf(marker);
        if (idx < 0) return null;
        const objStart = idx + key.length + 3;
        const obj = extractJsonObject(text, objStart);
        if (!obj) return null;
        try {
          const parsed = JSON.parse(obj);
          const team = parsed.team ?? {};
          const playersGroup = parsed.players ?? {};
          // Priority order: confirmed XI first, then squad as fallback for pre-toss matches
          // FIX: Cricbuzz returns "Squad" (capital S) for pre-toss matches — was being missed!
          const announced = Array.isArray(playersGroup["playing XI"])
            ? playersGroup["playing XI"]
            : Array.isArray(playersGroup.playing11)
              ? playersGroup.playing11
              : Array.isArray(playersGroup.playingXI)
                ? playersGroup.playingXI
                : [];
          // For pre-toss: "Squad" key holds the predicted squad (no XI confirmed yet)
          const squadFallback = Array.isArray(playersGroup["Squad"]) ? playersGroup["Squad"] : [];
          const bench = Array.isArray(playersGroup.bench) ? playersGroup.bench : [];
          const subs = Array.isArray(playersGroup.substitute) ? playersGroup.substitute : [];
          // Use announced XI if present, otherwise fall back to Squad (pre-toss predicted)
          const all = announced.length > 0 ? [...announced, ...bench, ...subs] : [...squadFallback, ...bench, ...subs];
          const hasAnnouncedXI = announced.length > 0;
          const seen = new Set<string>();
          const players = all
            .filter((p: any) => {
              const id = String(p?.id ?? p?.fullName ?? "");
              if (!id || seen.has(id)) return false;
              seen.add(id);
              return true;
            })
            .map((p: any) => ({
              id: String(p.id ?? ""),
              name: p.fullName ?? p.name ?? "",
              role: p.role ?? p.playingRole ?? "Batter",
              isCaptain: !!p.captain,
              isWk: !!p.keeper,
              // If we have a confirmed XI, mark XI players as inXI=true and bench/squad as false
              // If we only have predicted Squad (no XI), mark all as null (unknown — predicted)
              inXI: hasAnnouncedXI
                ? announced.some((x: any) => x.id === p.id)
                : null,
              battingStyle: p.battingStyle ?? "",
              bowlingStyle: p.bowlingStyle ?? "",
            }));
          return {
            teamId: String(team.teamId ?? ""),
            teamName: team.teamName ?? "",
            teamShort: team.teamSName ?? "",
            players,
          };
        } catch {
          return null;
        }
      };

      const t1 = readTeamBlock("team1");
      const t2 = readTeamBlock("team2");
      if (t1) teams.push(t1);
      if (t2) teams.push(t2);
    };

    if (squadHtml) parseSquads(squadHtml);

    // Parse live score + status + current batting team from overview page
    let liveScore: string | undefined;
    let matchStatus: string | undefined;
    let shortStatus: string | undefined;
    let currBatTeamId: string | undefined;
    let matchDesc: string | undefined;

    if (ovHtml) {
      const text = decodeNextChunks(ovHtml);

      // Toss
      const tIdx = text.indexOf('"tossResults"');
      if (tIdx >= 0) {
        const b = text.indexOf("{", tIdx);
        const obj = b >= 0 ? extractJsonObject(text, b) : null;
        if (obj) {
          try {
            const t = JSON.parse(obj);
            if (t.tossWinnerName || t.decision)
              toss = { winner: t.tossWinnerName ?? "", decision: t.decision ?? "" };
          } catch {}
        }
      }

      // matchInfo — extract status, shortStatus, currBatTeamId, matchDesc
      const miIdx = text.indexOf('"matchInfo":');
      if (miIdx >= 0) {
        const miBrace = text.indexOf("{", miIdx);
        const miObj = miBrace >= 0 ? extractJsonObject(text, miBrace) : null;
        if (miObj) {
          try {
            const info = JSON.parse(miObj);
            matchStatus = info.status;
            shortStatus = info.shortStatus;
            currBatTeamId = String(info.currBatTeamId ?? "");
            matchDesc = info.matchDesc;
          } catch {}
        }
      }

      // matchScore — extract runs/wickets/overs for both teams
      const sIdx = text.indexOf('"matchScore":');
      if (sIdx >= 0) {
        const sBrace = text.indexOf("{", sIdx);
        const sObj = sBrace >= 0 ? extractJsonObject(text, sBrace) : null;
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
          } catch {}
        }
      }
    }

    lineupAnnounced = teams.some((t) => t.players.some((p: any) => p.inXI === true));

    if (!teams.length) {
      return NextResponse.json({
        ok: false,
        error: "Squad not available yet",
        teams: [],
        toss,
        lineupAnnounced: false,
        liveScore,
        matchStatus,
        shortStatus,
      });
    }

    return NextResponse.json({
      ok: true,
      teams,
      toss,
      lineupAnnounced,
      liveScore,
      matchStatus,
      shortStatus,
      currBatTeamId,
      matchDesc,
    });
  } catch (error) {
    console.error("[CricketMatchDetails] Error:", error);
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Server error",
      teams: [],
      toss: null,
      lineupAnnounced: false,
    });
  }
}
