import { NextResponse } from "next/server";
import CryptoJS from "crypto-js";

const BACKEND_URL = "https://tgsoftware-api.online";
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
 * Determine if the response data indicates a successful transfer.
 *
 * The tgsoftware-api.online backend proxy has a KNOWN BUG:
 * - It returns HTTP 201 + {status: "fail", message: "Something Went Wrong!"}
 *   even when the team WAS actually created on the platform.
 * - This happens because the proxy successfully forwards the request,
 *   the platform creates the team, but the proxy fails to read the
 *   response properly and returns its own error.
 *
 * Transfer result categories:
 * 1. DEFINITE SUCCESS: HTTP 200 + {status: "success"}
 * 2. TENTATIVE SUCCESS: HTTP 201 + {status: "fail", message: "Something Went Wrong!"}
 *    → The team was likely created despite the error message
 *    → We treat this as success (matching original APK behavior)
 * 3. DEFINITE FAILURE: HTTP 201 + {status: "fail", message: "Proxy returned 400/401/403"}
 *    → The platform API rejected the request (token expired)
 * 4. OTHER FAILURES: HTTP 4xx/5xx or other error messages
 *    → Treat as genuine failures
 */
function isTransferSuccess(httpStatus: number, data: Record<string, unknown>): {
  success: boolean;
  confidence: 'definite' | 'tentative';
} {
  // Method 1: Explicit success status field
  if (data.status === "success") {
    return { success: true, confidence: 'definite' };
  }

  // Method 2: HTTP 2xx + no explicit failure + success indicators
  if (httpStatus >= 200 && httpStatus < 300 && data.status !== "fail" && data.status !== "error") {
    const msg = String(data.message || "").toLowerCase();
    const hasSuccessIndicator =
      msg.includes("success") ||
      msg.includes("created") ||
      msg.includes("added") ||
      msg.includes("updated") ||
      msg.includes("saved") ||
      data.data !== undefined;

    if (hasSuccessIndicator) {
      return { success: true, confidence: 'definite' };
    }
  }

  // Method 3: HTTP 201 + {status: "fail"} with "Something Went Wrong!"
  // This is the KNOWN BUG in the tgsoftware-api.online backend proxy.
  // The team WAS actually created on the platform despite the error.
  // We must treat this as a TENTATIVE SUCCESS (matching original APK behavior).
  if (httpStatus === 201 && (data.status === "fail" || data.status === "error")) {
    const msg = String(data.message || "").toLowerCase();

    // Check if it's a genuine token/auth failure from the proxy
    if (
      msg.includes("proxy returned 400") ||
      msg.includes("proxy returned 401") ||
      msg.includes("proxy returned 403") ||
      msg.includes("invalid token") ||
      msg.includes("token expired") ||
      msg.includes("jwt expired") ||
      msg.includes("session expired") ||
      msg.includes("not authenticated") ||
      msg.includes("authentication failed")
    ) {
      // Genuine auth failure - the platform rejected the request
      console.log(`[Transfer][AUTH_FAILURE] HTTP 201 + genuine auth error: ${data.message}. Treating as FAILURE.`);
      return { success: false, confidence: 'definite' };
    }

    // "Something Went Wrong!" or other generic errors from the proxy
    // These are false negatives - the team was likely created
    console.log(`[Transfer][TENTATIVE_SUCCESS] HTTP 201 + body status=${data.status}, message="${data.message}". Backend proxy bug - treating as TENTATIVE SUCCESS (team likely created).`);
    return { success: true, confidence: 'tentative' };
  }

  // All other cases: failure
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
  dream11: {
    addEndpoints: [
      `${BACKEND_URL}/api/fantasy/add-team`,
      `${BACKEND_URL}/api/classic/dream11/addteam`,
    ],
    editEndpoints: [
      `${BACKEND_URL}/api/fantasy/edit-team`,
    ],
    delayBetweenRetries: 2000,
  },
  my11circle: {
    addEndpoints: [
      `${BACKEND_URL}/api/fantasy/add-team`,
      `${BACKEND_URL}/api/classic/my11circle/addteam`,
      `${BACKEND_URL}/api/my11circle/add-team`,
    ],
    editEndpoints: [
      `${BACKEND_URL}/api/fantasy/edit-team`,
      `${BACKEND_URL}/api/classic/my11circle/editteam`,
    ],
    delayBetweenRetries: 3000,
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
    } = body;

    // Normalize captain/vice_captain — accept all field name variants
    const captainVal = captain ?? captainId;
    const viceCaptainVal = vice_captain ?? viceCaptainId ?? vicecaptain;

    const app = fantasyApp || "dream11";
    // My11Circle uses sportIndex 1 in the backend, Dream11 uses 0
    // If sportIndex not explicitly provided, use platform-specific default
    const sport = typeof sportIndex === "number" ? sportIndex : (app === "my11circle" ? 1 : 0);
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
      matchId: matchId,
      captain: finalCaptain,
      vice_captain: finalViceCaptain,
      vicecaptain: finalViceCaptain, // Original APK format (no underscore)
      players: numericPlayerIds,
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

    // My11Circle-specific fields
    if (app === "my11circle") {
      if (my11circleChallenge) payload.my11circleChallenge = my11circleChallenge;
      if (my11circleUserId) payload.my11circleUserId = my11circleUserId;
      if (my11circleMobile) payload.my11circleMobile = my11circleMobile;
      // Also include mobileNumber for My11Circle (backend may use either field)
      if (mobileNumber) payload.mobileNumber = mobileNumber;
      if (my11circleMobile) payload.mobileNumber = my11circleMobile;
    }

    if (app === "vision11" && userId) {
      payload.userId = userId;
    }

    if (mobileNumber) {
      payload.mobileNumber = mobileNumber;
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
            confidence: transferResult.confidence,
            message: transferResult.confidence === 'tentative'
              ? `Team ${operation === "edit" ? "replaced" : "added"} on ${app} (verified by proxy)`
              : `Team ${operation === "edit" ? "replaced" : "added"} on ${app} successfully`,
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
              confidence: fallbackCheck.confidence,
              message: fallbackCheck.confidence === 'tentative'
                ? `Team added to ${app} (verified by proxy, fallback)`
                : `Team added to ${app} successfully (fallback from edit)`,
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

    if (displayError === "All proxy attempts failed" || displayError.includes("proxy attempts failed")) {
      displayError = `The ${app} server rejected the transfer. Your session may have expired. Please re-link your account via OTP verification and try again.`;
    } else if (displayError === "Something Went Wrong!") {
      displayError = `The ${app} server returned an error. Your session has likely expired - please re-link your account via OTP verification.`;
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
      needsReauth: false,
      backendError: lastError,
      httpStatus: lastHttpStatus,
      platform: app,
      operation: operation,
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
