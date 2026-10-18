import { NextResponse } from "next/server";
import CryptoJS from "crypto-js";
import {
  resolvePlatformContext,
  mapPlayersToPlatform,
  normaliseName,
  type LocalPlayerRef,
} from "@/lib/fantasy-transfer-resolver";
import { buildMatchDetail } from "@/lib/match-data-server";

const BACKEND_URL = "https://tgsoftware-api.online"; // FIX: fantasy endpoints (OTP/auth/transfer/contest) live here — possible11.com 404s them all
const AES_KEY = "coder_bobby_believer01_tg_software";

function decryptAES(encrypted: string): string {
  try {
    return CryptoJS.AES.decrypt(encrypted, AES_KEY).toString(CryptoJS.enc.Utf8);
  } catch {
    return "";
  }
}

/**
 * Strictly check if an error message indicates a CONFIRMED token expiry.
 */
function isConfirmedTokenExpiry(errorMsg: string, data: Record<string, unknown>): boolean {
  const lowerMsg = errorMsg.toLowerCase().trim();

  const confirmedTokenErrors = [
    "invalid token",
    "token expired",
    "token is expired",
    "access token expired",
    "jwt expired",
    "jwt malformed",
    "invalid jwt",
    "authentication failed",
    "auth token invalid",
    "login required",
    "user not authenticated",
    "not authenticated",
    "session expired",
    "account locked",
    "expired token",
    "invalid or expired",
    "proxy returned 400",  // This means the actual platform API returned 400 = token expired
    "proxy returned 401",  // 401 from platform = token expired
    "proxy returned 403",  // 403 from platform = forbidden/expired
  ];

  for (const confirmed of confirmedTokenErrors) {
    if (lowerMsg.includes(confirmed)) return true;
  }

  if (data.validToken === false && data.status === "fail") return true;

  return false;
}

/**
 * Determine if the response data indicates a REAL, successful transfer.
 *
 * PROPER FIX (user report: "transfer showing team transferred — really team
 * not transferred"):
 *
 * The OLD version treated `HTTP 201 + {status:"fail","Something Went Wrong!"}`
 * as "TENTATIVE SUCCESS". That heuristic was written for the old
 * possible11.com proxy bug (where the proxy returned its own error AFTER the
 * platform had already created the team).
 *
 * We now talk to the REAL backend (tgsoftware-api.online — the ORIGINAL APK
 * backend). Live-verified: it returns EXACTLY that envelope when a transfer
 * FAILS (e.g. invalid token):
 *   POST /api/fantasy/add-team (bad token)
 *     → HTTP 201 + {"status":"fail","message":"Something Went Wrong!"}
 *     → NO team created on the platform.
 * So on this backend a generic "fail" is a REAL failure, and treating it as
 * success is what produced the false "Team transferred!" message.
 *
 * The original APK's own contract (its minified bundle) is:
 *   "success" !== response.data?.status  → count as FAILURE
 * So the ONLY accepted success signal here is data.status === "success".
 */
function isTransferSuccess(httpStatus: number, data: Record<string, unknown>): {
  success: boolean;
  confidence: 'definite' | 'tentative';
} {
  if (data.status === "success") {
    return { success: true, confidence: 'definite' };
  }
  // Everything else — including HTTP 201/2xx with status:"fail" — is a FAILURE.
  // Never guess. The client now surfaces honest errors instead of fake success.
  return { success: false, confidence: 'definite' };
}

/**
 * Validate all required transfer parameters before sending request.
 */
function validateTransferParams(params: {
  authToken?: string;
  matchId?: string | number;
  captain?: number | string;
  vice_captain?: number | string;
  players?: number[] | unknown;
  fantasyApp?: string;
  sportIndex?: number;
  type?: string;
  id?: string;
}): { valid: boolean; error?: string; code?: string } {
  if (!params.authToken) {
    return { valid: false, error: `Account not linked. Please link your ${params.fantasyApp || "fantasy"} account first via OTP verification.`, code: "NO_AUTH_TOKEN" };
  }
  if (!params.matchId) {
    return { valid: false, error: "Match ID is required for transfer", code: "MISSING_MATCH_ID" };
  }
  if (!params.captain || params.captain === 0) {
    return { valid: false, error: "Captain ID is required (fantasy player ID)", code: "MISSING_CAPTAIN" };
  }
  if (!params.vice_captain || params.vice_captain === 0) {
    return { valid: false, error: "Vice-Captain ID is required (fantasy player ID)", code: "MISSING_VICE_CAPTAIN" };
  }
  if (!params.players || !Array.isArray(params.players) || params.players.length === 0) {
    return { valid: false, error: "Team players are required (array of fantasy IDs)", code: "MISSING_PLAYERS" };
  }
  if (params.players.length < 11) {
    return { valid: false, error: `Team must have at least 11 players, got ${params.players.length}. Missing fantasy IDs for this platform.`, code: "INSUFFICIENT_PLAYERS" };
  }
  if (!params.fantasyApp) {
    return { valid: false, error: "Fantasy platform is required", code: "MISSING_FANTASY_APP" };
  }
  // FIX: If type is "edit" but no team ID, auto-convert to "new" (add) instead of failing.
  // This happens when list-of-teams returned empty (no existing teams on platform).
  if (params.type === "edit" && !params.id) {
    console.log("[Transfer][VALIDATE] Edit requested but no team ID — converting to add (new)");
    params.type = "new";
  }
  return { valid: true };
}

/**
 * Platform-specific endpoint configurations.
 */
interface EndpointConfig {
  addEndpoints: string[];
  editEndpoints: string[];
  delayBetweenRetries: number;
}

const PLATFORM_ENDPOINTS: Record<string, EndpointConfig> = {
  // Dream11 bulk-transfer endpoint chain — MUST match original teamgeneration.in
  // (Ze/nt functions in their JS bundle).
  //
  // Original uses ONLY:
  //   /api/fantasy/add-team  (for type="new")
  //   /api/fantasy/edit-team (for type="edit")
  //
  // The /api/classic/dream11/addteam endpoint is NOT a bulk-transfer endpoint —
  // it is the single-team "Generate Link" feature. It expects a totally different
  // payload ({tgMatchId, playerData, captainData, vicecaptainData, generateLinkFlag})
  // and returns an AES-encrypted share LINK, not a transfer result.
  //
  // Calling /api/classic/dream11/addteam with a bulk-transfer payload returns
  // HTTP 404 + {"status":"fail","message":"Error while transfering the team!"}
  // — confirmed by live smoke test against https://possible11.com.
  // It was previously in this chain as a "fallback" — that was a bug:
  //   - 100% guaranteed failure when called (wrong payload shape)
  //   - Caused "404 transfer errors" reported by users
  //   - Could cause duplicate-transfer risk if user retried after the 404
  // Removed from this chain. The link-generator endpoint is still available via
  // the separate /api/classic-addteam route (used by apna-transfer-modal's
  // handleLinkTransfer for the "Generate Link" button — correct usage).
  dream11: {
    addEndpoints: [
      `${BACKEND_URL}/api/fantasy/add-team`,
    ],
    editEndpoints: [
      `${BACKEND_URL}/api/fantasy/edit-team`,
    ],
    delayBetweenRetries: 200,
  },
  my11circle: {
    addEndpoints: [
      `${BACKEND_URL}/api/fantasy/add-team`,
    ],
    editEndpoints: [
      `${BACKEND_URL}/api/fantasy/edit-team`,
    ],
    delayBetweenRetries: 2000,
  },
  jumbo: {
    addEndpoints: [
      `${BACKEND_URL}/api/fantasy/add-team`,
    ],
    editEndpoints: [
      `${BACKEND_URL}/api/fantasy/edit-team`,
    ],
    delayBetweenRetries: 2000,
  },
  vision11: {
    addEndpoints: [
      `${BACKEND_URL}/api/fantasy/add-team`,
    ],
    editEndpoints: [
      `${BACKEND_URL}/api/fantasy/edit-team`,
    ],
    delayBetweenRetries: 2000,
  },
  myteam11: {
    addEndpoints: [
      `${BACKEND_URL}/api/fantasy/add-team`,
    ],
    editEndpoints: [
      `${BACKEND_URL}/api/fantasy/edit-team`,
    ],
    delayBetweenRetries: 2000,
  },
};

const DEFAULT_CONFIG: EndpointConfig = {
  addEndpoints: [
    `${BACKEND_URL}/api/fantasy/add-team`,
  ],
  editEndpoints: [
    `${BACKEND_URL}/api/fantasy/edit-team`,
  ],
  delayBetweenRetries: 2000,
};

function toNumber(val: unknown): number | null {
  if (typeof val === "number" && !isNaN(val)) return val;
  if (typeof val === "string") {
    const n = parseInt(val, 10);
    return isNaN(n) ? null : n;
  }
  return null;
}

/**
 * Pre-verify auth token before transfer to avoid wasting time on expired tokens.
 * Returns true if token appears valid, false if confirmed expired, null if can't verify.
 */
async function preVerifyToken(authToken: string, fantasyApp: string, matchId?: string): Promise<boolean | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/api/fantasy/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fantasyApp, authToken, matchId: matchId || "" }),
      signal: AbortSignal.timeout(8000),
    });

    const responseText = await res.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(responseText);
    } catch {
      // Can't parse - can't verify, don't block
      return null;
    }

    // If backend confirms token is invalid
    if (data.validToken === false) return false;
    if (res.status === 401 || res.status === 403) return false;

    // If backend confirms token is valid
    if (data.validToken === true) return true;

    // Update token if backend provides a new one
    if (data.updateUiToken && data.authToken) {
      // Return the updated token info - caller can use this
      return true;
    }

    // Can't determine - don't block
    return null;
  } catch {
    // Network error - don't block
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      authToken,
      matchId,
      captain,
      vice_captain,
      // Also accept camelCase variants (from BulkTransferItem)
      captainId,
      viceCaptainId,
      // Also accept "vicecaptain" (original APK format, no underscore)
      vicecaptain,
      players,
      fantasyApp,
      sportIndex,
      type,
      id,
      mobileNumber,
      userId,
      my11circleChallenge,
      my11circleUserId,
      my11circleMobile,
      skipPreVerify,  // Allow skipping pre-verification for speed
      // NEW — platform-context resolution inputs:
      playerNames,     // array of player names, parallel to `players`
      playerTeamIndex, // optional parallel array of team indexes (0/1)
      captainName,     // captain display name (name-based mapping fallback)
      viceCaptainName, // vice-captain display name (name-based mapping fallback)
      leftTeamName,    // local match left team name
      rightTeamName,   // local match right team name
      matchTime,       // local match start time (ISO / ms / string)
      forceRefresh,    // re-resolve platform mapping even if cached
    } = body;

    // Normalize captain/vice_captain — accept all field name variants
    const captainVal = captain ?? captainId;
    const viceCaptainVal = vice_captain ?? viceCaptainId ?? vicecaptain;

    const app = fantasyApp || "dream11";
    // sportIndex = SPORT INDEX (0=Cricket, 1=Football, 2=Basketball, 3=Kabaddi)
    // NOT a platform index. Original teamgeneration.in uses t.sportIndex (global sport selector).
    // Default to 0 (Cricket) when not explicitly provided by caller.
    const sport = typeof sportIndex === "number" ? sportIndex : 0;
    const operation: "add" | "edit" = type === "edit" ? "edit" : "add";

    // Parse player IDs - preserve types
    let playerIds: (number | string)[];
    if (typeof players === "string") {
      playerIds = players.split(",").map((s: string) => {
        const trimmed = s.trim();
        const num = parseInt(trimmed);
        return isNaN(num) ? trimmed : num;
      });
    } else if (Array.isArray(players)) {
      playerIds = players.map((p: number | string) => {
        if (typeof p === "number") return p;
        const num = parseInt(String(p));
        return isNaN(num) ? p : num;
      });
    } else {
      playerIds = [];
    }

    // Ensure captain/vice_captain are NUMBERS
    // FIX: Handle empty string, undefined, "0", "undefined" gracefully
    // Accept both snake_case (captain/vice_captain) and camelCase (captainId/viceCaptainId)
    const captainRaw = captainVal === undefined || captainVal === null || captainVal === "" || captainVal === "undefined" ? undefined : captainVal;
    const viceCaptainRaw = viceCaptainVal === undefined || viceCaptainVal === null || viceCaptainVal === "" || viceCaptainVal === "undefined" ? undefined : viceCaptainVal;

    const captainNum = captainRaw !== undefined ? toNumber(captainRaw) : null;
    const viceCaptainNum = viceCaptainRaw !== undefined ? toNumber(viceCaptainRaw) : null;

    // If captain is missing/invalid, try to extract from players[0] as fallback
    let finalCaptain = captainNum;
    let finalViceCaptain = viceCaptainNum;

    if (finalCaptain === null && playerIds.length > 0) {
      // Use first player as captain fallback
      finalCaptain = toNumber(playerIds[0]) ?? null;
      console.log(`[Transfer] Captain missing — using first player ${playerIds[0]} as captain`);
    }
    if (finalViceCaptain === null && playerIds.length > 1) {
      // Use second player as VC fallback
      finalViceCaptain = toNumber(playerIds[1]) ?? null;
      console.log(`[Transfer] VC missing — using second player ${playerIds[1]} as VC`);
    }

    if (finalCaptain === null) {
      return NextResponse.json({
        status: "fail",
        error: `Captain ID required. Got: captain=${JSON.stringify(captainVal)}, vice_captain=${JSON.stringify(viceCaptainVal)}, players count=${playerIds.length}`,
        code: "INVALID_CAPTAIN_ID",
        hint: "Make sure team has captain and vice-captain set. Accepted fields: captain/vice_captain OR captainId/viceCaptainId.",
      }, { status: 200 });
    }
    if (finalViceCaptain === null) {
      // Use 2nd player as VC if available
      if (playerIds.length > 1) {
        finalViceCaptain = toNumber(playerIds[1]) ?? finalCaptain;
      } else {
        finalViceCaptain = finalCaptain;
      }
    }

    const numericPlayerIds: number[] = playerIds.map(p => {
      const n = toNumber(p);
      return n !== null ? n : 0;
    }).filter(n => n !== 0);

    // Pre-transfer validation
    const validation = validateTransferParams({
      authToken, matchId, captain: finalCaptain, vice_captain: finalViceCaptain,
      players: numericPlayerIds, fantasyApp: app, sportIndex: sport,
      type: operation, id,
    });

    if (!validation.valid) {
      console.error(`[Transfer][VALIDATION] FAILED: ${validation.error} (code: ${validation.code})`);
      return NextResponse.json({
        status: "fail",
        error: validation.error,
        code: validation.code,
        needsAuth: validation.code === "NO_AUTH_TOKEN",
      }, { status: 200 });
    }

    // Build the payload
    const preparedToken = String(authToken);

    // ============================================================
    // PROPER TRANSFER FIX (reference: teamgeneration.in)
    // ============================================================
    // The tgsoftware backend's /api/fantasy/add-team ONLY accepts the
    // PLATFORM's own matchId + PLATFORM player IDs. Our players come from
    // possible11/Cricbuzz (different ID space) — sending them verbatim is
    // exactly why teams were never actually created ("Something Went
    // Wrong!" → no team on the platform).
    //
    // The original app resolves the platform context via
    //   /api/automatic/fantasy-app/list      (platform matches, user token)
    //   /api/automatic/fantasy-app/getplayerdata (platform player IDs)
    // and maps players BY NAME. We do the same here, server-side, cached.
    // ============================================================
    let platformMatchId: string | null = null;
    let platformPlayersPayload: number[] | null = null;
    let platformCaptain: number | null = null;
    let platformViceCaptain: number | null = null;
    const nameList: string[] = Array.isArray(playerNames) ? playerNames.map((n: unknown) => String(n ?? "")) : [];

    // ---------------------------------------------------------------
    // SELF-SERVICE MATCH META — if the caller didn't send player names
    // or team names, fetch them from our own match-detail builder
    // (possible11 + Cricbuzz). Without names the platform player mapping
    // cannot work, so this is essential for scheduler/legacy callers.
    // ---------------------------------------------------------------
    let resolvedLeft = typeof leftTeamName === "string" ? leftTeamName : "";
    let resolvedRight = typeof rightTeamName === "string" ? rightTeamName : "";
    let resolvedMatchTime = typeof matchTime === "string" || typeof matchTime === "number" ? String(matchTime) : "";
    if (numericPlayerIds.length > 0 && (nameList.length !== numericPlayerIds.length || !resolvedLeft || !resolvedRight)) {
      try {
        const detail = await buildMatchDetail(String(matchId), "cricket");
        if (detail) {
          const allPlayers = [...(detail.left_team_players || []), ...(detail.right_team_players || [])] as Array<Record<string, unknown>>;
          const nameById = new Map<string, string>();
          for (const p of allPlayers) {
            const id = String(p.player_fixed_id ?? p.pl_id ?? p.pid ?? p.id ?? "");
            const nm = String(p.name ?? "").trim();
            if (id && nm) nameById.set(id, nm);
          }
          if (nameList.length !== numericPlayerIds.length) {
            // Build names from match detail by matching the sent local IDs
            for (let i = 0; i < numericPlayerIds.length; i++) {
              const nm = nameById.get(String(numericPlayerIds[i]));
              nameList[i] = nm || nameList[i] || "";
            }
          }
          if (!resolvedLeft && detail.left_team_name) resolvedLeft = String(detail.left_team_name);
          if (!resolvedRight && detail.right_team_name) resolvedRight = String(detail.right_team_name);
          if (!resolvedMatchTime && (detail as Record<string, unknown>).match_time) {
            resolvedMatchTime = String((detail as Record<string, unknown>).match_time);
          }
          console.log(`[Transfer][RESOLVE] Self-served match meta: names=${nameList.filter(Boolean).length}/${numericPlayerIds.length}, teams="${resolvedLeft}" vs "${resolvedRight}"`);
        }
      } catch (metaErr) {
        console.warn(`[Transfer][RESOLVE] match-detail self-service failed (non-fatal):`, metaErr instanceof Error ? metaErr.message : metaErr);
      }
    }

    if (nameList.length === numericPlayerIds.length && numericPlayerIds.length > 0) {
      try {
        const ctx = await resolvePlatformContext({
          fantasyApp: app,
          authToken: preparedToken,
          matchId: String(matchId),
          leftTeamName: resolvedLeft || undefined,
          rightTeamName: resolvedRight || undefined,
          matchTime: resolvedMatchTime || undefined,
          userId: typeof userId === "string" || typeof userId === "number" ? String(userId) : undefined,
          forceRefresh: forceRefresh === true,
        });

        if (ctx) {
          const localRefs: LocalPlayerRef[] = numericPlayerIds.map((pid, i) => ({
            localId: String(pid),
            name: nameList[i],
            teamIndex: Array.isArray(playerTeamIndex) && typeof playerTeamIndex[i] === "number" ? playerTeamIndex[i] : undefined,
          }));

          const { idMap, unmapped } = mapPlayersToPlatform(localRefs, ctx.platformPlayers, app);

          if (unmapped.length > 0) {
            // NEVER send unmapped players to the platform — that produced
            // silent garbage teams / generic failures. Fail honestly.
            const names = unmapped.map((u) => u.name).join(", ");
            console.error(`[Transfer][RESOLVE] ${unmapped.length}/${localRefs.length} players could not be matched to ${app} players: ${names}`);
            return NextResponse.json({
              status: "fail",
              error: `Could not match ${unmapped.length} player(s) to the ${app} squad: ${names}. The platform squad may have changed — please refresh the match and try again.`,
              code: "PLAYER_MAPPING_FAILED",
              platformMatchId: ctx.platformMatchId,
              unmapped: unmapped.map((u) => u.name),
            }, { status: 200 });
          }

          // Rewrite payload into PLATFORM id space (original add-team contract)
          const platformIds = numericPlayerIds.map((pid) => Number(idMap[String(pid)]));

          // Captain/VC: map through the id map; if the local id is missing from
          // the map (id space mismatch), fall back to NAME-based resolution.
          const nameToPlatformId = new Map<string, string>();
          for (const [localId, platId] of Object.entries(idMap)) {
            const idx = numericPlayerIds.findIndex((p) => String(p) === String(localId));
            if (idx !== -1 && nameList[idx]) nameToPlatformId.set(normaliseName(nameList[idx]), String(platId));
          }
          const capIdStr = idMap[String(finalCaptain)] || (captainName ? nameToPlatformId.get(normaliseName(String(captainName))) : undefined);
          const vcIdStr = idMap[String(finalViceCaptain)] || (viceCaptainName ? nameToPlatformId.get(normaliseName(String(viceCaptainName))) : undefined);
          if (!capIdStr || !vcIdStr) {
            console.error(`[Transfer][RESOLVE] Captain/VC missing from platform mapping (cap=${!!capIdStr}, vc=${!!vcIdStr})`);
            return NextResponse.json({
              status: "fail",
              error: `Could not match the captain / vice-captain to the ${app} squad. Please refresh and try again.`,
              code: "PLAYER_MAPPING_FAILED",
              platformMatchId: ctx.platformMatchId,
            }, { status: 200 });
          }

          platformMatchId = ctx.platformMatchId;
          platformPlayersPayload = platformIds;
          platformCaptain = Number(capIdStr);
          platformViceCaptain = Number(vcIdStr);
          console.log(`[Transfer][RESOLVE] ✅ payload rewritten to platform space: matchId ${matchId} → ${ctx.platformMatchId}, ${platformIds.length} platform players`);
        } else {
          console.warn(`[Transfer][RESOLVE] Could not resolve platform context for match ${matchId} (${app}) — falling back to legacy payload (likely to fail honestly)`);
        }
      } catch (resolveErr) {
        console.error(`[Transfer][RESOLVE] Resolver error (non-fatal, continuing legacy):`, resolveErr instanceof Error ? resolveErr.message : resolveErr);
      }
    } else if (numericPlayerIds.length > 0) {
      console.warn(`[Transfer][RESOLVE] playerNames missing or length mismatch (${nameList.length} names vs ${numericPlayerIds.length} ids) — cannot resolve platform players by name`);
    }

    // Pre-verify token - ONLY if explicitly requested (skipPreVerify defaults to true for speed)
    // We handle token expiry reactively during transfer, detecting "Proxy returned 400" etc.
    // Pre-verification adds latency and may give false negatives (server says expired but token works)
    if (skipPreVerify !== true && !skipPreVerify) {
      console.log(`[Transfer][PRE_VERIFY] Checking ${app} token validity...`);
      const tokenValid = await preVerifyToken(preparedToken, app, String(matchId));

      if (tokenValid === false) {
        console.error(`[Transfer][PRE_VERIFY] Token is EXPIRED for ${app}. Aborting transfer.`);
        return NextResponse.json({
          status: "fail",
          error: `Your ${app} session has expired. Please re-link your account via OTP verification before transferring teams.`,
          code: "TOKEN_EXPIRED",
          needsReauth: true,
        }, { status: 200 });
      }

      console.log(`[Transfer][PRE_VERIFY] Token check result: ${tokenValid === true ? "VALID" : "UNKNOWN (proceeding)"}`);
    }

    const payload: Record<string, unknown> = {
      // PROPER FIX: use the PLATFORM's matchId + player IDs when the resolver
      // mapped them (the backend only understands platform id space).
      matchId: platformMatchId ?? matchId,
      captain: platformCaptain ?? finalCaptain,
      vice_captain: platformViceCaptain ?? finalViceCaptain,
      vicecaptain: platformViceCaptain ?? finalViceCaptain, // Original APK format (no underscore)
      players: platformPlayersPayload ?? numericPlayerIds,
      fantasyApp: app,
      authToken: preparedToken,
      sportIndex: sport,
      // IMPORTANT: The original APK ALWAYS includes `type` in the payload
      // (either "new" for add or "edit" for replace). The backend uses this
      // field to route to the correct operation. Without it, edit-team calls
      // were being treated as add-team calls → "team not replacing" bug.
      type: operation === "edit" ? "edit" : "new",
    };

    // For edit/replace operations, include the team ID to replace.
    // The original APK uses field name `id` with the team_id value from list-of-teams.
    // Try to coerce to number if possible (backend may expect numeric ID),
    // but fall back to string if it's not a pure number.
    if (operation === "edit" && id !== undefined && id !== null && id !== "") {
      const idNum = typeof id === "string" ? parseInt(id, 10) : id;
      payload.id = (typeof idNum === "number" && !isNaN(idNum)) ? idNum : id;
      console.log(`[Transfer][EDIT] Replacing team ID: ${payload.id} (original: ${JSON.stringify(id)})`);
    }

    // IMPORTANT: Per original teamgeneration.in bulk-transfer flow, the transfer payload
    // for /api/fantasy/add-team and /api/fantasy/edit-team is GENERIC across all platforms.
    // My11Circle-specific fields (my11circleChallenge, my11circleUserId, my11circleMobile)
    // are ONLY sent to /api/fantasy/auth/verify and /api/fantasy/list-of-teams — NOT to
    // the transfer endpoint. Sending them here caused the backend to misroute My11Circle
    // transfers (root cause of "team not getting created on My11Circle" bug).

    if (app === "vision11" && userId) {
      payload.userId = userId;
    }

    // Get platform-specific endpoint config
    const config = PLATFORM_ENDPOINTS[app] || DEFAULT_CONFIG;
    const endpointChain = operation === "edit" ? config.editEndpoints : config.addEndpoints;

    // Detailed request logging
    console.log(`\n${"=".repeat(60)}`);
    console.log(`[Transfer][REQUEST] ${app} ${operation.toUpperCase()}`);
    console.log(`[Transfer][REQUEST] Endpoint chain: ${endpointChain.join(" → ")}`);
    console.log(`[Transfer][REQUEST] matchId=${matchId}, sportIndex=${sport}`);
    console.log(`[Transfer][REQUEST] captain=${finalCaptain}, vice_captain=${finalViceCaptain}`);
    console.log(`[Transfer][REQUEST] players=${numericPlayerIds.length}, operation=${operation}, id=${id || "N/A"}`);
    console.log(`[Transfer][REQUEST] authToken: len=${preparedToken.length}, isJWT=${preparedToken.startsWith("eyJ")}, isJSON=${preparedToken.startsWith("{")}`);
    console.log(`${"=".repeat(60)}\n`);

    // Execute with multi-endpoint fallback
    let lastError = "";
    let lastData: Record<string, unknown> | null = null;
    let lastHttpStatus = 0;

    for (const endpointUrl of endpointChain) {
      console.log(`[Transfer][ENDPOINT] Trying: ${endpointUrl}`);

      try {
        const requestStart = Date.now();
        const res = await fetch(endpointUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(30000),
        });
        const requestDuration = Date.now() - requestStart;
        lastHttpStatus = res.status;

        const responseText = await res.text();

        // Detailed response logging
        console.log(`\n${"-".repeat(60)}`);
        console.log(`[Transfer][RESPONSE] Endpoint: ${endpointUrl}`);
        console.log(`[Transfer][RESPONSE] HTTP Status: ${res.status} ${res.statusText}`);
        console.log(`[Transfer][RESPONSE] Duration: ${requestDuration}ms`);
        console.log(`[Transfer][RESPONSE] Raw body: ${responseText.substring(0, 1000)}`);
        console.log(`${"-".repeat(60)}\n`);

        let data: Record<string, unknown>;
        try {
          data = JSON.parse(responseText);
        } catch {
          // HTML 404 or other non-JSON response — skip this endpoint
          if (res.status === 404 || responseText.includes("<!DOCTYPE") || responseText.includes("<html")) {
            console.log(`[Transfer][SKIP] Endpoint returned non-JSON/404. Trying next...`);
          } else {
            console.error(`[Transfer][ERROR] Non-JSON response: HTTP ${res.status}`);
          }
          lastError = `Server returned non-JSON response (HTTP ${res.status})`;
          continue;
        }

        console.log(`[Transfer][RESPONSE] Parsed: status=${data.status}, message=${data.message || "N/A"}, httpStatus=${res.status}`);

        // ============================================
        // Check for success with confidence level
        // ============================================
        const transferResult = isTransferSuccess(res.status, data);
        if (transferResult.success) {
          let responseData = data.data;
          if (typeof data.data === "string" && data.data) {
            const decrypted = decryptAES(data.data);
            if (decrypted) {
              try { responseData = JSON.parse(decrypted); } catch { responseData = { rawDecrypted: decrypted }; }
            }
          }

          console.log(`[Transfer][SUCCESS] Team transferred to ${app} (${operation}) - HTTP ${res.status} (confidence: ${transferResult.confidence})`);

          return NextResponse.json({
            status: "success",
            method: endpointUrl.includes("classic") ? "classic" : "fantasy",
            endpoint: endpointUrl,
            platform: app,
            operation: operation,
            data: responseData || null,
            httpStatus: res.status,
            confidence: 'definite',
            platformMatchId: platformMatchId || String(matchId),
            message: `Team ${operation === "edit" ? "replaced" : "added"} on ${app} successfully`,
          }, { status: 200 });
        }

        // Handle failure
        lastError = (data.message as string) || (data.error as string) || `HTTP ${res.status}`;
        lastData = data;

        console.error(`[Transfer][FAILED] ${lastError} (HTTP ${res.status})`);

        // If it's a confirmed token expiry, stop immediately
        if (isConfirmedTokenExpiry(lastError, data)) {
          console.error(`[Transfer][AUTH] Token expired confirmed. Stopping.`);
          return NextResponse.json({
            status: "fail",
            error: `Session expired on ${app}. Please re-link your account via OTP verification.`,
            code: "TOKEN_EXPIRED",
            needsReauth: true,
            backendError: lastError,
          }, { status: 200 });
        }

        // Check for deadline passed
        const lowerMsg = lastError.toLowerCase();
        if (lowerMsg.includes("deadline") || lowerMsg.includes("match expired") || lowerMsg.includes("match started")) {
          return NextResponse.json({
            status: "fail",
            error: "Match deadline has passed. You can no longer create or edit teams for this match.",
            code: "DEADLINE_PASSED",
            backendError: lastError,
          }, { status: 200 });
        }

        // Check for team limit reached
        if (lowerMsg.includes("limit") || lowerMsg.includes("maximum") || lowerMsg.includes("already")) {
          return NextResponse.json({
            status: "fail",
            error: `Team limit reached on ${app}. You already have the maximum number of teams for this match.`,
            code: "TEAM_LIMIT_REACHED",
            backendError: lastError,
          }, { status: 200 });
        }

        // For 404, skip to next endpoint
        if (res.status === 404) {
          console.log(`[Transfer][SKIP] Endpoint returned 404. Trying next...`);
          continue;
        }

        // For other errors, try next endpoint
        continue;

      } catch (fetchErr) {
        const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
        console.error(`[Transfer][NETWORK] Fetch error: ${errMsg}`);
        lastError = errMsg.includes("timeout") ? "Transfer request timed out (30s)" :
                    errMsg.includes("abort") ? "Request was aborted" :
                    `Network error: ${errMsg}`;
        lastHttpStatus = 0;
        continue;
      }
    }

    // If edit failed, try add as fallback
    if (operation === "edit" && lastError && !isConfirmedTokenExpiry(lastError, lastData || {})) {
      console.log(`[Transfer][FALLBACK] Edit failed on all endpoints. Trying add as fallback...`);

      const fallbackPayload = { ...payload };
      delete fallbackPayload.id;
      fallbackPayload.type = "new";

      const addEndpoints = config.addEndpoints;

      for (const fallbackUrl of addEndpoints) {
        console.log(`[Transfer][FALLBACK] Trying add endpoint: ${fallbackUrl}`);

        try {
          const fallbackStart = Date.now();
          const fallbackRes = await fetch(fallbackUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fallbackPayload),
            signal: AbortSignal.timeout(30000),
          });
          const fallbackDuration = Date.now() - fallbackStart;

          const fallbackText = await fallbackRes.text();

          console.log(`[Transfer][FALLBACK] HTTP ${fallbackRes.status}, duration: ${fallbackDuration}ms`);
          console.log(`[Transfer][FALLBACK] Response: ${fallbackText.substring(0, 500)}`);

          let fallbackData: Record<string, unknown>;
          try {
            fallbackData = JSON.parse(fallbackText);
          } catch {
            console.error(`[Transfer][FALLBACK] Non-JSON response`);
            fallbackData = {};
          }

          // Use improved success check
          const fallbackCheck = isTransferSuccess(fallbackRes.status, fallbackData);
          if (fallbackCheck.success) {
            let responseData = fallbackData.data;
            if (typeof fallbackData.data === "string" && fallbackData.data) {
              const decrypted = decryptAES(fallbackData.data);
              if (decrypted) {
                try { responseData = JSON.parse(decrypted); } catch { responseData = { rawDecrypted: decrypted }; }
              }
            }

            console.log(`[Transfer][FALLBACK][SUCCESS] Team added via fallback (confidence: ${fallbackCheck.confidence})`);

            return NextResponse.json({
              status: "success",
              method: "fallback_add",
              endpoint: fallbackUrl,
              platform: app,
              operation: "add",
              data: responseData || null,
              httpStatus: fallbackRes.status,
              confidence: 'definite',
              message: `Team added to ${app} successfully (fallback from edit)`,
            }, { status: 200 });
          }

          const fallbackError = (fallbackData?.message as string) || (fallbackData?.error as string) || "Unknown fallback error";
          console.error(`[Transfer][FALLBACK][FAILED] ${fallbackError}`);

          // Check for token expiry in fallback too
          if (isConfirmedTokenExpiry(fallbackError, fallbackData)) {
            return NextResponse.json({
              status: "fail",
              error: `Session expired on ${app}. Please re-link your account via OTP verification.`,
              code: "TOKEN_EXPIRED",
              needsReauth: true,
              backendError: fallbackError,
            }, { status: 200 });
          }

          if (fallbackError && fallbackError !== "Something Went Wrong!") {
            lastError = fallbackError;
          }
          lastHttpStatus = fallbackRes.status;
        } catch (fallbackErr) {
          console.error(`[Transfer][FALLBACK][ERROR] ${fallbackErr instanceof Error ? fallbackErr.message : "unknown"}`);
        }
      }
    }

    // Return detailed error
    console.error(`\n${"!".repeat(60)}`);
    console.error(`[Transfer][FINAL] ALL ENDPOINTS FAILED for ${app} ${operation}`);
    console.error(`[Transfer][FINAL] Backend error: ${lastError}`);
    console.error(`[Transfer][FINAL] HTTP status: ${lastHttpStatus}`);
    console.error(`[Transfer][FINAL] Endpoints tried: ${endpointChain.join(", ")}`);
    console.error(`[Transfer][FINAL] Token: len=${preparedToken.length}, isJWT=${preparedToken.startsWith("eyJ")}, isJSON=${preparedToken.startsWith("{")}`);
    console.error(`${"!".repeat(60)}\n`);

    let displayError = lastError || "Unknown transfer error";

    // ============================================================
    // PROPER FIX — classify generic failures instead of guessing.
    // The real backend returns the generic "Something Went Wrong!"
    // for MANY different root causes (expired token, match not in
    // DB, deadline passed, invalid players...). We can't tell from
    // the message alone, so ask /api/fantasy/auth/verify (which
    // DOES return real token validity) to classify:
    //   - token expired → needsReauth + "re-link via OTP" message
    //   - token OK      → honest "platform rejected" message
    // This replaced the old behaviour of ALWAYS claiming the session
    // expired (or worse, previously: claiming success!)
    // ============================================================
    let finalNeedsReauth = false;

    if (lastError === "Something Went Wrong!" || lastError === "Error while transfering the team!" || !lastError) {
      console.log(`[Transfer][CLASSIFY] Generic backend error — checking token validity to give an honest error...`);
      const tokenState = await preVerifyToken(preparedToken, app, String(matchId));
      if (tokenState === false) {
        finalNeedsReauth = true;
        displayError = `Your ${app} session has expired. Please re-link your account via OTP verification, then transfer again.`;
        console.log(`[Transfer][CLASSIFY] Token is EXPIRED → needsReauth`);
      } else {
        displayError = `The ${app} server rejected this transfer. Your account is linked, but the platform refused the request — this usually means the match deadline has passed, the playing lineup is not announced yet, or the match is not transferable right now. Please try again closer to the deadline or re-link your account.`;
        console.log(`[Transfer][CLASSIFY] Token is ${tokenState === true ? "VALID" : "UNKNOWN"} → honest rejection message`);
      }
    } else if (displayError === "All proxy attempts failed" || displayError.includes("proxy attempts failed")) {
      displayError = `The ${app} server rejected the transfer. Your session may have expired. Please re-link your account via OTP verification and try again.`;
    } else if (displayError === "Proxy returned 400") {
      displayError = `Your ${app} session has expired (the platform rejected the request). Please re-link your account via OTP verification.`;
    } else if (displayError === "Error while transfering the team!") {
      displayError = `Failed to transfer team on ${app}. Your auth session has likely expired. Try re-linking your ${app} account via OTP verification.`;
    } else if (displayError.includes("non-JSON response") && lastHttpStatus === 0) {
      displayError = `Could not reach the ${app} transfer server. Please check your internet connection and try again.`;
    }

    return NextResponse.json({
      status: "fail",
      error: displayError,
      code: "TRANSFER_ERROR",
      needsReauth: finalNeedsReauth,
      backendError: lastError,
      httpStatus: lastHttpStatus,
      platform: app,
      operation: operation,
      platformMatchId: platformMatchId || null,
      endpointsTried: endpointChain,
      details: {
        matchId: String(matchId),
        captain: finalCaptain,
        vice_captain: finalViceCaptain,
        playerCount: numericPlayerIds.length,
        teamId: id || null,
        tokenLength: preparedToken.length,
        tokenIsJWT: preparedToken.startsWith("eyJ"),
        tokenIsJSON: preparedToken.startsWith("{"),
      },
    }, { status: 200 });

  } catch (error) {
    console.error("[Transfer][ROUTE_ERROR]", error);
    return NextResponse.json({
      status: "fail",
      error: `Server error: ${error instanceof Error ? error.message : "Unknown error"}`,
      code: "SERVER_ERROR",
      needsReauth: false,
    }, { status: 200 });
  }
}
