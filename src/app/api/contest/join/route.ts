import { NextResponse } from "next/server";

const BACKEND_URL = "https://tgsoftware-api.online";

/**
 * Join a contest with the given team IDs.
 *
 * Routes to the correct platform endpoint (matching original APK):
 *   dream11    → /api/dream11/contest/join-contest
 *   my11circle → /api/my11circle/contest/join-contest
 *
 * The original APK payload:
 *   { authToken, matchId, contestId, teamIds: [parseInt(team_id), ...] }
 *
 * ⚠️ CRITICAL FIX — Backend silently drops teams after #20 in a single
 * join request. So if you send 40 team IDs at once, only the first 20 get
 * joined. To fix this:
 *
 *   1. We SHUFFLE the team IDs randomly (so it's not always teams 1-20
 *      that get joined first — every join is a fresh random order).
 *   2. We split into BATCHES of 20 and send multiple sequential requests.
 *   3. We AGGREGATE per-team results across all batches and return a
 *      single combined response.
 *
 * This way, all 40 My11Circle teams get joined, in random order, every time.
 */

const JOIN_BATCH_SIZE = 20;
const INTER_BATCH_DELAY_MS = 800; // small delay between batches to avoid rate-limit

/** Fisher-Yates shuffle (returns a new array, doesn't mutate input). */
function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Sleep helper. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface PerTeamResult {
  teamId: number;
  success: boolean;
  error?: string;
  message?: string;
}

interface BatchResponse {
  status: string;
  message?: string;
  joinResults?: PerTeamResult[];
  summary?: { successCount: number; failedCount: number };
  needsReauth?: boolean;
}

async function callBackendJoin(params: {
  endpoint: string;
  authToken: string;
  matchId: string;
  contestId: string;
  batchTeamIds: number[];
  userToken?: string;
}): Promise<{ httpStatus: number; data: BatchResponse | null; raw: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (params.userToken) headers.Authorization = `Bearer ${params.userToken}`;

  const payload = {
    authToken: params.authToken,
    matchId: String(params.matchId),
    contestId: String(params.contestId),
    teamIds: params.batchTeamIds,
  };

  try {
    const res = await fetch(params.endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30000),
    });
    const text = await res.text();
    let data: BatchResponse | null = null;
    try { data = JSON.parse(text) as BatchResponse; } catch { /* non-JSON */ }
    return { httpStatus: res.status, data, raw: text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return {
      httpStatus: 0,
      data: null,
      raw: msg,
    };
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fantasyApp, authToken, matchId, contestId, teamIds } = body;

    if (!fantasyApp || !authToken || !matchId || !contestId) {
      return NextResponse.json({
        status: "fail",
        message: "fantasyApp, authToken, matchId, and contestId are required",
        contestId: contestId || "",
        joinResults: [],
        summary: { successCount: 0, failedCount: Array.isArray(teamIds) ? teamIds.length : 0 },
      }, { status: 200 });
    }

    const endpoint =
      fantasyApp === "dream11"
        ? `${BACKEND_URL}/api/dream11/contest/join-contest`
        : `${BACKEND_URL}/api/my11circle/contest/join-contest`;

    // Normalize team IDs to integers
    const allTeamIds: number[] = Array.isArray(teamIds)
      ? teamIds
          .map((id: any) => (typeof id === "number" ? id : parseInt(String(id), 10)))
          .filter((n: number) => !isNaN(n))
      : [];

    if (allTeamIds.length === 0) {
      return NextResponse.json({
        status: "fail",
        message: "No valid team IDs provided",
        contestId,
        joinResults: [],
        summary: { successCount: 0, failedCount: 0 },
      }, { status: 200 });
    }

    // ✅ SHUFFLE — random order so it's not always 1-20 first
    const shuffled = shuffle(allTeamIds);

    // ✅ BATCH — split into chunks of JOIN_BATCH_SIZE
    const batches: number[][] = [];
    for (let i = 0; i < shuffled.length; i += JOIN_BATCH_SIZE) {
      batches.push(shuffled.slice(i, i + JOIN_BATCH_SIZE));
    }

    console.log(
      `[Contest][Join] ${fantasyApp} matchId=${matchId} contestId=${contestId} ` +
      `totalTeams=${allTeamIds.length} batches=${batches.length} ` +
      `batchSize=${JOIN_BATCH_SIZE} shuffled=true`
    );

    const userToken = request.headers.get("authorization")?.replace("Bearer ", "");

    // Process batches sequentially
    const allJoinResults: PerTeamResult[] = [];
    let totalSuccess = 0;
    let totalFailed = 0;
    let firstErrorMessage = "";
    let needsReauth = false;

    for (let b = 0; b < batches.length; b++) {
      const batch = batches[b];
      const batchNum = b + 1;
      console.log(
        `[Contest][Join] Batch ${batchNum}/${batches.length} — ` +
        `teams=${batch.length} ids=${batch.slice(0, 5).join(",")}${batch.length > 5 ? "..." : ""}`
      );

      const { httpStatus, data, raw } = await callBackendJoin({
        endpoint,
        authToken,
        matchId: String(matchId),
        contestId: String(contestId),
        batchTeamIds: batch,
        userToken,
      });

      // Token-expiry detection
      const msg = String(data?.message || "").toLowerCase();
      const isTokenExpired =
        msg.includes("token expired") ||
        msg.includes("invalid token") ||
        msg.includes("jwt expired") ||
        msg.includes("session expired") ||
        msg.includes("not authenticated") ||
        msg.includes("authentication failed") ||
        msg.includes("proxy returned 400") ||
        msg.includes("proxy returned 401") ||
        msg.includes("proxy returned 403") ||
        httpStatus === 401 || httpStatus === 403;

      if (isTokenExpired) {
        // Mark all remaining teams (this batch + future batches) as failed
        for (const tid of batch) {
          allJoinResults.push({ teamId: tid, success: false, error: "Session expired" });
          totalFailed++;
        }
        needsReauth = true;
        if (!firstErrorMessage) {
          firstErrorMessage = `Session expired on ${fantasyApp}. Please re-link your account via OTP verification.`;
        }
        break; // stop processing further batches
      }

      // Extract per-team results
      const batchResults: PerTeamResult[] = Array.isArray(data?.joinResults)
        ? data!.joinResults!.map((r: any) => ({
            teamId: Number(r.teamId ?? r.team_id ?? 0),
            success: Boolean(r.success),
            error: r.error ? String(r.error) : undefined,
            message: r.message ? String(r.message) : undefined,
          }))
        : [];

      // If backend didn't return per-team results, derive them from summary
      if (batchResults.length === 0) {
        const batchSuccess = data?.status === "success" || (httpStatus >= 200 && httpStatus < 300);
        const batchSuccessCount = data?.summary?.successCount ?? (batchSuccess ? batch.length : 0);
        const batchFailedCount = data?.summary?.failedCount ?? (batchSuccess ? 0 : batch.length);

        for (let i = 0; i < batch.length; i++) {
          allJoinResults.push({
            teamId: batch[i],
            success: i < batchSuccessCount,
            error: i < batchSuccessCount ? undefined : "Join failed",
          });
        }
        totalSuccess += batchSuccessCount;
        totalFailed += batchFailedCount;
      } else {
        for (const r of batchResults) {
          allJoinResults.push(r);
          if (r.success) totalSuccess++;
          else totalFailed++;
        }
      }

      if (!firstErrorMessage && data?.message && data.status !== "success") {
        firstErrorMessage = data.message;
      }

      console.log(
        `[Contest][Join] Batch ${batchNum} done — ` +
        `success=${data?.summary?.successCount ?? "?"} failed=${data?.summary?.failedCount ?? "?"} ` +
        `http=${httpStatus} status=${data?.status}`
      );

      // Delay before next batch (avoid rate-limit)
      if (b < batches.length - 1) {
        await sleep(INTER_BATCH_DELAY_MS);
      }
    }

    // Final aggregated response
    const finalStatus =
      needsReauth ? "fail" :
      totalFailed === 0 ? "success" :
      totalSuccess === 0 ? "fail" :
      "partial";

    const finalMessage = needsReauth
      ? firstErrorMessage
      : `Joined ${totalSuccess}/${allTeamIds.length} teams ` +
        (batches.length > 1 ? `across ${batches.length} batches (shuffled)` : "") +
        (totalFailed > 0 ? ` — ${totalFailed} failed` : "");

    console.log(
      `[Contest][Join] FINAL — status=${finalStatus} success=${totalSuccess} ` +
      `failed=${totalFailed} total=${allTeamIds.length} batches=${batches.length}`
    );

    return NextResponse.json({
      status: finalStatus,
      message: finalMessage,
      contestId,
      joinResults: allJoinResults,
      summary: {
        successCount: totalSuccess,
        failedCount: totalFailed,
        totalCount: allTeamIds.length,
        batches: batches.length,
        batchSize: JOIN_BATCH_SIZE,
        shuffled: true,
      },
      ...(needsReauth ? { code: "TOKEN_EXPIRED", needsReauth: true } : {}),
    }, { status: 200 });
  } catch (error) {
    console.error("[Contest][Join] Route error:", error);
    return NextResponse.json({
      status: "fail",
      message: "Server error",
      contestId: "",
      joinResults: [],
      summary: { successCount: 0, failedCount: 0 },
    }, { status: 200 });
  }
}
