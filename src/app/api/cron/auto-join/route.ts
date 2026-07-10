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
 * GET /api/cron/auto-join
 * Called by Vercel Cron every 5 minutes.
 *
 * Flow:
 * 1. Fetch all fantasy_tokens from Firebase (users' saved auth tokens)
 * 2. For each token, fetch free contests from backend
 * 3. For each new contest (not already joined), auto-join with available teams
 * 4. Log results to Firebase "auto_join_logs"
 *
 * Note: Firebase Admin SDK not available in this environment.
 * This route uses client-side Firebase SDK (limited but works).
 */
export async function GET(request: Request) {
  try {
    // Verify cron secret (prevent unauthorized access)
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET || "apna-cricket-cron-2026";
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ status: "fail", message: "Unauthorized" }, { status: 401 });
    }

    const { db } = await import("@/lib/firebase");
    if (!db) {
      return NextResponse.json({ status: "fail", message: "Firebase not initialized" }, { status: 200 });
    }

    const { collection, getDocs, addDoc, serverTimestamp } = await import("firebase/firestore");

    // 1. Fetch all saved fantasy tokens from Firebase
    const tokensSnapshot = await getDocs(collection(db, "fantasy_tokens"));
    const allTokens: Array<{
      deviceId: string;
      app: string;
      token: string;
      mobile?: string;
      my11circleChallenge?: string;
      my11circleUserId?: string;
    }> = [];

    tokensSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data.token && data.app) {
        allTokens.push({
          deviceId: data.deviceId || "",
          app: data.app,
          token: data.token,
          mobile: data.mobile || "",
          my11circleChallenge: data.my11circleChallenge || "",
          my11circleUserId: data.my11circleUserId || "",
        });
      }
    });

    console.log(`[AutoJoin] Found ${allTokens.length} fantasy tokens in Firebase`);

    if (allTokens.length === 0) {
      return NextResponse.json({
        status: "success",
        message: "No fantasy tokens found — users need to link accounts first",
        processed: 0,
      }, { status: 200 });
    }

    // 2. For each token, fetch free contests and auto-join
    let totalJoined = 0;
    let totalProcessed = 0;

    for (const tokenData of allTokens) {
      try {
        // Get match IDs from backend (current matches)
        const matchesRes = await fetch(`${BACKEND_URL}/api/fantasy/matches/cricket`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(10000),
          cache: "no-store",
        });
        const matchesData = await matchesRes.json();

        if (matchesData.status !== "success" || !matchesData.data) continue;

        const matches = matchesData.data;
        const fantasyList = matches.filter((m: any) =>
          (m.fantasy_list || []).includes(tokenData.app)
        );

        for (const match of fantasyList.slice(0, 3)) { // limit to 3 matches per token
          const matchId = String(match.id || match._id || "");

          // Fetch free contests for this match
          const endpoint = tokenData.app === "dream11"
            ? `${BACKEND_URL}/api/dream11/contest/all-free-status`
            : `${BACKEND_URL}/api/my11circle/contest/all-free-status`;

          const contestRes = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              authToken: tokenData.token,
              matchId,
              allTeamId: [],
            }),
            signal: AbortSignal.timeout(10000),
            cache: "no-store",
          });

          const contestText = await contestRes.text();
          let contestData: any;
          try {
            contestData = JSON.parse(contestText);
            // Decrypt if needed
            if (typeof contestData === "string" || (contestData.data && typeof contestData.data === "string")) {
              const dec = decryptAES(contestText);
              if (dec) contestData = JSON.parse(dec);
            }
          } catch {
            continue;
          }

          if (!contestData || contestData.status !== "success") continue;

          const contests = contestData.contests || contestData.data || [];
          if (!Array.isArray(contests) || contests.length === 0) continue;

          // Find contests with available slots (not yet joined)
          const joinable = contests.filter((c: any) =>
            c.is_active && !c.is_full &&
            (c.team_joined || 0) < (c.max_teams_allowed || 1)
          );

          if (joinable.length === 0) continue;

          // Fetch user's teams for this match
          const teamsRes = await fetch(`${BACKEND_URL}/api/fantasy/list-of-teams`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fantasyApp: tokenData.app,
              matchId,
              authToken: tokenData.token,
            }),
            signal: AbortSignal.timeout(10000),
            cache: "no-store",
          });

          const teamsData = await teamsRes.json();
          let teamIds: number[] = [];
          if (teamsData.data?.teams_list) {
            teamIds = teamsData.data.teams_list.map((t: any) => parseInt(t.team_id)).filter((n: number) => !isNaN(n));
          }

          if (teamIds.length === 0) continue;

          // Join each contest with available teams (shuffled)
          for (const contest of joinable.slice(0, 5)) { // max 5 contests per match
            const contestId = contest.contest_id || contest.id;
            const maxTeams = contest.max_teams_allowed || 1;
            const alreadyJoined = contest.team_joined || 0;
            const slots = Math.min(maxTeams - alreadyJoined, teamIds.length);

            if (slots <= 0) continue;

            // Shuffle teams for mixed join
            const shuffled = [...teamIds].sort(() => Math.random() - 0.5);
            const teamsToJoin = shuffled.slice(0, slots);

            // Join contest
            const joinEndpoint = tokenData.app === "dream11"
              ? `${BACKEND_URL}/api/dream11/contest/join-contest`
              : `${BACKEND_URL}/api/my11circle/contest/join-contest`;

            const joinRes = await fetch(joinEndpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                authToken: tokenData.token,
                matchId,
                contestId: String(contestId),
                teamIds: teamsToJoin,
                ...(tokenData.app === "my11circle" ? {
                  my11circleChallenge: tokenData.my11circleChallenge,
                  my11circleUserId: tokenData.my11circleUserId,
                } : {}),
              }),
              signal: AbortSignal.timeout(15000),
              cache: "no-store",
            });

            const joinResult = await joinRes.json();
            totalProcessed++;

            if (joinResult.status === "success" || joinResult.summary?.successCount > 0) {
              totalJoined++;
              console.log(`[AutoJoin] ✓ ${tokenData.app} match ${matchId} contest ${contestId} — joined ${teamsToJoin.length} teams`);

              // Log to Firebase
              await addDoc(collection(db, "auto_join_logs"), {
                deviceId: tokenData.deviceId,
                app: tokenData.app,
                matchId,
                contestId: String(contestId),
                teamsJoined: teamsToJoin.length,
                status: "success",
                timestamp: serverTimestamp(),
                timestampMs: Date.now(),
              });
            }
          }
        }
      } catch (err) {
        console.error(`[AutoJoin] Error for token ${tokenData.deviceId}_${tokenData.app}:`, err);
      }
    }

    return NextResponse.json({
      status: "success",
      message: `Auto-join processed ${totalProcessed} contests, joined ${totalJoined}`,
      processed: totalProcessed,
      joined: totalJoined,
      totalTokens: allTokens.length,
    }, { status: 200 });

  } catch (error) {
    console.error("[AutoJoin] Fatal error:", error);
    return NextResponse.json({
      status: "fail",
      message: error instanceof Error ? error.message : "Server error",
    }, { status: 200 });
  }
}
