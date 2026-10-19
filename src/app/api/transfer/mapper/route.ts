import { NextResponse } from "next/server";
import {
  resolvePlatformContext,
  mapPlayersToPlatform,
  registerAutomaticMapping,
  type LocalPlayerRef,
} from "@/lib/fantasy-transfer-resolver";

/**
 * Transfer Mapper — the original app's "Automatic Mapper" as an explicit,
 * visible, staged API.
 * ============================================================================
 *
 * WHY THIS EXISTS
 *
 * The original teamgeneration.in / Possible11 app transfers teams in TWO steps
 * (verified from its own minified bundles — both the live site and the
 * extracted APK):
 *
 *   STEP 1 — AUTOMATIC MAPPER (this endpoint, same-to-same):
 *      a. POST {tg}/api/automatic/fantasy-app/list
 *           {fantasyApp, authToken}
 *         → the user's UPCOMING matches as the PLATFORM sees them
 *      b. pick the platform match that corresponds to our match
 *         (team names + start time, exactly like the original's mapper UI)
 *      c. POST {tg}/api/automatic/fantasy-app/getplayerdata
 *           {fantasyApp, authToken, matchId, leftTeamName?, rightTeamName?}
 *         → the platform's player list for that match
 *      d. map OUR players onto PLATFORM players BY NAME
 *         (original algorithm: normalised name + my11circle initial variants)
 *      e. POST {tg}/api/automatic/add_mapping
 *           {tgMatchId, fantasyAppMatchId, fantasyAppName, playerMapperData}
 *         → registers the TG↔platform translation on the backend
 *
 *   STEP 2 — /api/fantasy/add-team with OUR matchId + OUR player ids
 *      (the backend translates them via the mapping registered in step 1e)
 *
 * Every previous "transfer failed" report was undiagnosable because all stages
 * ran invisibly inside /api/transfer. This endpoint runs the mapper as its own
 * stage and reports EXACTLY which step broke, so a failure can be attributed
 * to: the user's session, the TG backend's platform bridge, team-name
 * mismatch, or player mapping.
 *
 * The transfer route still self-serves the mapping (cached) — this endpoint
 * exists for pre-flight checks and for surfacing mapper state to the user.
 */

interface MapperRequestBody {
  fantasyApp?: string;
  authToken?: string;
  matchId?: string | number;
  leftTeamName?: string;
  rightTeamName?: string;
  matchTime?: string;
  userId?: string;
  /** player refs for name-mapping (id + name + teamIndex) */
  players?: Array<{ id: string | number; name: string; teamIndex?: number }>;
  captainId?: string | number;
  viceCaptainId?: string | number;
  forceRefresh?: boolean;
}

export async function POST(request: Request) {
  const stages: Array<{ stage: string; status: "ok" | "fail" | "skipped"; detail: string; at: number }> = [];
  const mark = (stage: string, status: "ok" | "fail" | "skipped", detail: string) => {
    stages.push({ stage, status, detail, at: Date.now() });
    console.log(`[Mapper][${status.toUpperCase()}] ${stage}: ${detail}`);
  };

  try {
    const body = (await request.json()) as MapperRequestBody;
    const fantasyApp = String(body.fantasyApp || "").trim();
    const authToken = String(body.authToken || "").trim();
    const matchId = body.matchId != null ? String(body.matchId).trim() : "";

    if (!fantasyApp || !authToken || !matchId) {
      return NextResponse.json({
        status: "fail",
        error: "fantasyApp, authToken and matchId are required",
        code: "VALIDATION",
        stages,
      }, { status: 200 });
    }

    mark("INPUT", "ok", `${fantasyApp} match=${matchId} players=${Array.isArray(body.players) ? body.players.length : 0}`);

    // ---------------------------------------------------------------
    // STAGE 1+2+3 — resolve platform match + players (cached in SQLite)
    // ---------------------------------------------------------------
    const ctx = await resolvePlatformContext({
      fantasyApp,
      authToken,
      matchId,
      leftTeamName: body.leftTeamName,
      rightTeamName: body.rightTeamName,
      matchTime: body.matchTime,
      userId: body.userId,
      forceRefresh: body.forceRefresh === true,
    });

    if (!ctx) {
      mark("RESOLVE_PLATFORM_CONTEXT", "fail",
        "Could not resolve the platform match. Either the session token was rejected by the platform, or the TG backend's automatic bridge could not list the platform matches right now.");
      return NextResponse.json({
        status: "fail",
        error:
          `Could not match this fixture on ${fantasyApp} using your linked session. ` +
          `Re-link the account (OTP) and make sure the match is still upcoming on ${fantasyApp}. ` +
          `If re-linking doesn't help, the transfer bridge on the fantasy backend is likely down — try again later.`,
        code: "PLATFORM_CONTEXT_FAILED",
        needsReauth: true,
        stages,
      }, { status: 200 });
    }
    mark("RESOLVE_PLATFORM_CONTEXT", "ok",
      `platform match ${ctx.platformMatchId} (${ctx.platformLeftName || "?"} vs ${ctx.platformRightName || "?"}), ${ctx.platformPlayers.length} players${ctx.fromCache ? " [cached]" : ""}`);

    // ---------------------------------------------------------------
    // STAGE 4 — map players by name (when player refs were provided)
    // ---------------------------------------------------------------
    let idMap: Record<string, string> = {};
    let unmapped: LocalPlayerRef[] = [];
    const players = Array.isArray(body.players) ? body.players : [];
    if (players.length > 0) {
      const localRefs: LocalPlayerRef[] = players
        .filter((p) => p && p.name)
        .map((p) => ({
          localId: String(p.id ?? ""),
          name: String(p.name).trim(),
          teamIndex: typeof p.teamIndex === "number" ? p.teamIndex : undefined,
        }));
      const result = mapPlayersToPlatform(localRefs, ctx.platformPlayers, fantasyApp);
      idMap = result.idMap;
      unmapped = result.unmapped;
      if (unmapped.length > 0) {
        mark("MAP_PLAYERS", "fail",
          `${unmapped.length}/${localRefs.length} players could not be matched by name: ${unmapped.map((u) => u.name).join(", ")}`);
      } else {
        mark("MAP_PLAYERS", "ok", `${Object.keys(idMap).length} players mapped by name`);
      }
    } else {
      mark("MAP_PLAYERS", "skipped", "no player refs supplied (mapping happens during transfer)");
    }

    // ---------------------------------------------------------------
    // STAGE 5 — register the platform match in the backend's MAIN DB
    // (the original's "Add to DB" button — my11circle / jumbo only)
    // ---------------------------------------------------------------
    let matchAddedToDb = false;
    if (fantasyApp === "my11circle" || fantasyApp === "jumbo") {
      try {
        const addMatchBody: Record<string, unknown> =
          fantasyApp === "my11circle"
            ? { my11circleMatchId: ctx.platformMatchId, sport: "cricket", authToken }
            : { jumboMatchId: ctx.platformMatchId, sport: "cricket" };
        const amRes = await fetch(`https://tgsoftware-api.online/api/${fantasyApp}/add-match`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(addMatchBody),
          signal: AbortSignal.timeout(30000),
        });
        const amText = await amRes.text();
        let amData: Record<string, unknown> = {};
        try { amData = JSON.parse(amText); } catch { /* non-JSON */ }
        const already = amRes.status === 409 || String(amData.message || "").includes("already exist");
        matchAddedToDb = amRes.status === 200 || already;
        mark("ADD_MATCH_TO_DB", matchAddedToDb ? "ok" : "fail",
          `HTTP ${amRes.status} ${JSON.stringify(amData).slice(0, 140)}${already ? " (already in DB)" : ""}`);
      } catch (amErr) {
        mark("ADD_MATCH_TO_DB", "fail", amErr instanceof Error ? amErr.message : String(amErr));
      }
    } else {
      mark("ADD_MATCH_TO_DB", "skipped", `${fantasyApp} has no add-match endpoint (admin-managed)`);
    }

    // ---------------------------------------------------------------
    // STAGE 6 — register the automatic mapping on the backend
    // ---------------------------------------------------------------
    let mappingRegistered = false;
    if (Object.keys(idMap).length > 0) {
      const pairs = Object.entries(idMap).map(([localId, platformId]) => ({ localId, platformId }));
      mappingRegistered = await registerAutomaticMapping({
        fantasyApp,
        tgMatchId: matchId,
        platformMatchId: ctx.platformMatchId,
        pairs,
      });
      mark("REGISTER_MAPPING", mappingRegistered ? "ok" : "fail",
        mappingRegistered
          ? `add_mapping registered: match ${matchId} → platform ${ctx.platformMatchId} (${pairs.length} players)`
          : "add_mapping call failed — the backend may still resolve it from a previous registration (idempotent upsert)");
    } else {
      mark("REGISTER_MAPPING", "skipped", "no player map — transfer route will register it");
    }

    return NextResponse.json({
      status: "success",
      platformMatchId: ctx.platformMatchId,
      platformLeftName: ctx.platformLeftName || null,
      platformRightName: ctx.platformRightName || null,
      platformPlayerCount: ctx.platformPlayers.length,
      mappedCount: Object.keys(idMap).length,
      unmappedPlayers: unmapped.map((u) => ({ id: u.localId, name: u.name })),
      mappingRegistered,
      matchAddedToDb,
      fromCache: ctx.fromCache,
      stages,
    }, { status: 200 });
  } catch (err) {
    console.error("[Mapper] unexpected error:", err);
    mark("UNEXPECTED", "fail", err instanceof Error ? err.message : String(err));
    return NextResponse.json({
      status: "fail",
      error: `Mapper error: ${err instanceof Error ? err.message : "unknown"}`,
      code: "MAPPER_ERROR",
      stages,
    }, { status: 200 });
  }
}
