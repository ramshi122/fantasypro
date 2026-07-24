import { NextResponse } from "next/server";

const BACKEND_URL = "https://tgsoftware-api.online";

/**
 * Multi-Account Contest Join API
 * ====================================
 *
 * Per user spec: "1 time all account transfer and join contest all account
 * different team dream11 3 / my11 2"
 *
 * Joins a contest with MULTIPLE accounts simultaneously:
 *   - Dream11: up to 3 accounts
 *   - My11Circle: up to 2 accounts
 *   - Each account gets DIFFERENT teams (no overlap between accounts)
 *
 * POST /api/contest/join-all
 * Body: {
 *   fantasyApp: "dream11" | "my11circle",
 *   accounts: [{ authToken, mobile?, my11circleChallenge?, my11circleUserId? }],
 *   matchId: string,
 *   contestId: string,
 *   teamIds: number[],  // ALL available team IDs (will be split across accounts)
 *   teamsPerAccount?: number  // optional: if not set, splits evenly
 * }
 *
 * Returns per-account results:
 *   {
 *     status: "success" | "partial" | "fail",
 *     summary: { successCount, failedCount, accountsProcessed },
 *     accountResults: [{ accountIndex, mobile, successCount, failedCount, joinResults }]
 *   }
 *
 * Subscription gating: This is a Pro/Elite-only feature.
 * The frontend checks license tier before calling this endpoint.
 */

const JOIN_BATCH_SIZE = 20;
const INTER_BATCH_DELAY_MS = 800;
const INTER_ACCOUNT_DELAY_MS = 1500; // delay between accounts to avoid rate-limit

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface AccountInfo {
  authToken: string;
  mobile?: string;
  my11circleChallenge?: string;
  my11circleUserId?: string;
}

interface PerTeamResult {
  teamId: number;
  success: boolean;
  error?: string;
  message?: string;
}

interface AccountResult {
  accountIndex: number;
  mobile: string;
  successCount: number;
  failedCount: number;
  joinResults: PerTeamResult[];
  error?: string;
}

/** Split team IDs across N accounts so each gets different teams. */
function splitTeamsAcrossAccounts(teamIds: number[], numAccounts: number): number[][] {
  if (numAccounts <= 0) return [];
  if (numAccounts === 1) return [teamIds];

  const result: number[][] = Array.from({ length: numAccounts }, () => []);
  // Round-robin distribution: account 0 gets team[0], account 1 gets team[1], etc.
  for (let i = 0; i < teamIds.length; i++) {
    result[i % numAccounts].push(teamIds[i]);
  }
  return result;
}

async function callBackendJoin(params: {
  endpoint: string;
  authToken: string;
  matchId: string;
  contestId: string;
  batchTeamIds: number[];
  userToken?: string;
}): Promise<{ httpStatus: number; data: any; raw: string }> {
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
    let data: any = null;
    try { data = JSON.parse(text); } catch { /* non-JSON */ }
    return { httpStatus: res.status, data, raw: text };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return { httpStatus: 0, data: null, raw: msg };
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { fantasyApp, accounts, matchId, contestId, teamIds } = body;

    // Validate inputs
    if (!fantasyApp || !matchId || !contestId) {
      return NextResponse.json({
        status: "fail",
        message: "fantasyApp, matchId, and contestId are required",
        summary: { successCount: 0, failedCount: 0, accountsProcessed: 0 },
        accountResults: [],
      }, { status: 200 });
    }

    if (!Array.isArray(accounts) || accounts.length === 0) {
      return NextResponse.json({
        status: "fail",
        message: "accounts array is required (at least 1 account)",
        summary: { successCount: 0, failedCount: 0, accountsProcessed: 0 },
        accountResults: [],
      }, { status: 200 });
    }

    // Enforce account limits per platform
    // Per user spec: "dream11 3 / my11 2"
    const ACCOUNT_LIMITS: Record<string, number> = {
      dream11: 3,
      my11circle: 2,
    };
    const maxAccounts = ACCOUNT_LIMITS[fantasyApp] || 5;
    if (accounts.length > maxAccounts) {
      return NextResponse.json({
        status: "fail",
        message: `Too many accounts. ${fantasyApp} allows max ${maxAccounts} accounts (got ${accounts.length}).`,
        summary: { successCount: 0, failedCount: 0, accountsProcessed: 0 },
        accountResults: [],
      }, { status: 200 });
    }

    // Normalize team IDs
    const allTeamIds: number[] = Array.isArray(teamIds)
      ? teamIds
          .map((id: any) => (typeof id === "number" ? id : parseInt(String(id), 10)))
          .filter((n: number) => !isNaN(n))
      : [];

    if (allTeamIds.length === 0) {
      return NextResponse.json({
        status: "fail",
        message: "No valid team IDs provided",
        summary: { successCount: 0, failedCount: 0, accountsProcessed: 0 },
        accountResults: [],
      }, { status: 200 });
    }

    const endpoint =
      fantasyApp === "dream11"
        ? `${BACKEND_URL}/api/dream11/contest/join-contest`
        : `${BACKEND_URL}/api/my11circle/contest/join-contest`;

    // Split teams across accounts (each account gets DIFFERENT teams)
    const teamsPerAccount = splitTeamsAcrossAccounts(allTeamIds, accounts.length);

    console.log(
      `[Contest][JoinAll] ${fantasyApp} matchId=${matchId} contestId=${contestId} ` +
      `accounts=${accounts.length} totalTeams=${allTeamIds.length} ` +
      `teamsPerAccount=[${teamsPerAccount.map(t => t.length).join(",")}]`
    );

    const userToken = request.headers.get("authorization")?.replace("Bearer ", "");

    // Process each account SEQUENTIALLY (not parallel — avoids rate-limit)
    const accountResults: AccountResult[] = [];
    let totalSuccess = 0;
    let totalFailed = 0;

    for (let a = 0; a < accounts.length; a++) {
      const account: AccountInfo = accounts[a];
      const accountTeams = teamsPerAccount[a] || [];

      if (accountTeams.length === 0) {
        accountResults.push({
          accountIndex: a,
          mobile: account.mobile || `Account ${a + 1}`,
          successCount: 0,
          failedCount: 0,
          joinResults: [],
          error: "No teams assigned to this account",
        });
        continue;
      }

      console.log(
        `[Contest][JoinAll] Account ${a + 1}/${accounts.length} ` +
        `(${account.mobile || "unknown"}) — joining ${accountTeams.length} teams`
      );

      // Split this account's teams into batches of JOIN_BATCH_SIZE
      const batches: number[][] = [];
      for (let i = 0; i < accountTeams.length; i += JOIN_BATCH_SIZE) {
        batches.push(accountTeams.slice(i, i + JOIN_BATCH_SIZE));
      }

      const accountJoinResults: PerTeamResult[] = [];
      let accountSuccess = 0;
      let accountFailed = 0;
      let accountError: string | undefined;

      for (let b = 0; b < batches.length; b++) {
        const batch = batches[b];
        const batchNum = b + 1;

        const { httpStatus, data } = await callBackendJoin({
          endpoint,
          authToken: account.authToken,
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
          for (const tid of batch) {
            accountJoinResults.push({ teamId: tid, success: false, error: "Session expired" });
            accountFailed++;
          }
          accountError = `Session expired for ${account.mobile || `Account ${a + 1}`}`;
          break; // stop processing further batches for this account
        }

        // Extract per-team results
        const batchResults: PerTeamResult[] = Array.isArray(data?.joinResults)
          ? data.joinResults.map((r: any) => ({
              teamId: Number(r.teamId ?? r.team_id ?? 0),
              success: Boolean(r.success),
              error: r.error ? String(r.error) : undefined,
              message: r.message ? String(r.message) : undefined,
            }))
          : [];

        if (batchResults.length === 0) {
          const batchSuccess = data?.status === "success" || (httpStatus >= 200 && httpStatus < 300);
          const batchSuccessCount = data?.summary?.successCount ?? (batchSuccess ? batch.length : 0);
          for (let i = 0; i < batch.length; i++) {
            accountJoinResults.push({
              teamId: batch[i],
              success: i < batchSuccessCount,
              error: i < batchSuccessCount ? undefined : "Join failed",
            });
          }
          accountSuccess += batchSuccessCount;
          accountFailed += batch.length - batchSuccessCount;
        } else {
          for (const r of batchResults) {
            accountJoinResults.push(r);
            if (r.success) accountSuccess++;
            else accountFailed++;
          }
        }

        if (b < batches.length - 1) {
          await sleep(INTER_BATCH_DELAY_MS);
        }
      }

      totalSuccess += accountSuccess;
      totalFailed += accountFailed;

      // Determine per-account status (per user spec)
      // "Display per-account status: Joined Successfully, Already Joined, Contest Full,
      //  Insufficient Balance, Login Expired, Network Error"
      let accountStatus: string;
      if (accountError?.includes("Session expired")) {
        accountStatus = "login_expired";
      } else if (accountError?.includes("Network") || accountError?.includes("timeout")) {
        accountStatus = "network_error";
      } else if (accountSuccess > 0 && accountFailed === 0) {
        accountStatus = "joined_successfully";
      } else if (accountSuccess > 0 && accountFailed > 0) {
        accountStatus = "partial_success";
      } else if (accountFailed > 0) {
        // Check error messages for specific backend responses
        const errorMessages = accountJoinResults.map(r => r.error || "").join(" ").toLowerCase();
        if (errorMessages.includes("already joined") || errorMessages.includes("already_joined")) {
          accountStatus = "already_joined";
        } else if (errorMessages.includes("contest full") || errorMessages.includes("contest_full")) {
          accountStatus = "contest_full";
        } else if (errorMessages.includes("insufficient") || errorMessages.includes("balance")) {
          accountStatus = "insufficient_balance";
        } else {
          accountStatus = "failed";
        }
      } else {
        accountStatus = "no_teams";
      }

      accountResults.push({
        accountIndex: a,
        mobile: account.mobile || `Account ${a + 1}`,
        accountId: (account as any).accountId || `acct_${a + 1}`,
        successCount: accountSuccess,
        failedCount: accountFailed,
        joinResults: accountJoinResults,
        error: accountError,
        accountStatus, // per-account status code
      });

      console.log(
        `[Contest][JoinAll] Account ${a + 1} done — ` +
        `status=${accountStatus} success=${accountSuccess} failed=${accountFailed}` +
        (accountError ? ` error=${accountError}` : "")
      );

      // Delay between accounts (avoid rate-limit)
      if (a < accounts.length - 1) {
        await sleep(INTER_ACCOUNT_DELAY_MS);
      }
    }

    const finalStatus =
      totalFailed === 0 ? "success" :
      totalSuccess === 0 ? "fail" :
      "partial";

    const finalMessage = `Joined ${totalSuccess}/${allTeamIds.length} teams ` +
      `across ${accounts.length} account(s)` +
      (totalFailed > 0 ? ` — ${totalFailed} failed` : "");

    console.log(
      `[Contest][JoinAll] FINAL — status=${finalStatus} ` +
      `success=${totalSuccess} failed=${totalFailed} ` +
      `accounts=${accounts.length} total=${allTeamIds.length}`
    );

    return NextResponse.json({
      status: finalStatus,
      message: finalMessage,
      contestId,
      summary: {
        successCount: totalSuccess,
        failedCount: totalFailed,
        totalCount: allTeamIds.length,
        accountsProcessed: accounts.length,
        teamsPerAccount: teamsPerAccount.map(t => t.length),
      },
      accountResults,
    }, { status: 200 });
  } catch (error) {
    console.error("[Contest][JoinAll] Route error:", error);
    return NextResponse.json({
      status: "fail",
      message: "Server error",
      summary: { successCount: 0, failedCount: 0, accountsProcessed: 0 },
      accountResults: [],
    }, { status: 200 });
  }
}
