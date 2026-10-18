---
Task ID: 3
Agent: Z.ai Code (main)
Task: "Not fixed transfer issu chek propper chek and fix reference https://teamgeneration.in/" — transfer showed success but team was never actually created on Dream11/My11Circle.

Work Log:
- Re-cloned/located repo at /home/z/fantasypro (workspace reset mid-session); previous OTP fix (cc15811) and honest-failure transfer fix (96dec6c) confirmed on origin/main.
- Downloaded the LIVE teamgeneration.in production bundle (static/js/main.278ef53f.js) and diffed its transfer flow against the extracted APK bundle (scripts/apk-extract/web/main.js).
- CONFIRMED original add-team contract from both bundles:
    POST /api/fantasy/add-team (or /edit-team) with
    {matchId: PLATFORM match id, captain: PLATFORM player id, vice_captain: PLATFORM player id,
     players: [PLATFORM player ids], fantasyApp, authToken, sportIndex, type:"new"|"edit"}
    → success ONLY when response.data.status === "success".
- ROOT CAUSES identified for "team not really transferred":
    1. WRONG ID SPACE: our players come from possible11/Cricbuzz (player_fixed_id = Cricbuzz id).
       The tgsoftware backend only understands PLATFORM player ids; Cricbuzz ids produce the
       generic {"status":"fail","message":"Something Went Wrong!"} — no team created.
    2. WRONG matchId SPACE: tgsoftware's fantasy matches DB is EMPTY (verified live:
       /api/fantasy/matches/cricket → []). Our possible11 match ids are unknown to it.
    3. teamgeneration.in has moved everything to a NEW V2 backend (v2.tgsoftware-api.online)
       with Google-login auth — not usable by our white-label app; the V1 automatic-mapper
       endpoints ARE usable with the user's own linked session token.
- Found the original's own solution (verified in its minified mapper UI):
    POST /api/automatic/fantasy-app/list       {fantasyApp, authToken}  → platform matches [{id, left_team_name, right_team_name}]
    POST /api/automatic/fantasy-app/getplayerdata {fantasyApp, authToken, matchId, leftTeamName?, rightTeamName?}
        → platform players [{id, name, player_role, team_index}]
    players are mapped TG↔platform BY NAME: J(name)=lowercase+strip spaces/quotes/dashes,
    plus jumbo/my11circle "R Sharma" initial-form variant; each platform player used once.
    Both endpoints verified LIVE on tgsoftware-api.online (fail with dummy token as expected;
    add_mapping endpoint even accepts writes without auth).
- IMPLEMENTED (server):
    * src/lib/fantasy-transfer-resolver.ts (NEW): resolves platform matchId + platform players
      using the user's own authToken, maps players by name (exact original algorithm incl. AES
      response envelope handling), caches result in SQLite (6h TTL).
    * prisma/schema.prisma: TransferMatchMap model (unique [tgMatchId, fantasyApp]); db:push done.
    * src/app/api/transfer/route.ts: accepts playerNames/playerTeamIndex/captainName/
      viceCaptainName/leftTeamName/rightTeamName/matchTime/forceRefresh; SELF-SERVES missing
      names + team names from our own buildMatchDetail (scheduler/legacy callers get the fix
      for free); rewrites payload into PLATFORM id space before add-team/edit-team; fails
      HONESTLY with PLAYER_MAPPING_FAILED when players can't be matched (never sends garbage
      ids); returns platformMatchId in success/failure responses.
- IMPLEMENTED (client):
    * BulkTransferItem += playerNames/playerTeamIndex/captainName/viceCaptainName.
    * bulk-transfer-modal.tsx + apna-transfer-modal.tsx build ALIGNED (id,name,teamIndex)
      triples and pass match team names + time to bulkTransferToAccount.
    * bulkTransferToAccount/bulkTransferToLinkedAccount forward everything; platformMatchId
      from server used ONLY for list-of-teams verification (local matchId stays the resolver
      cache key for transfers).
    * auto-transfer-scheduler.ts now sends proper per-team payloads (players+captain+vc+names)
      instead of the previously-broken {teams:[...]} blob.
- Verified: name-mapping unit smoke test (dream11 + my11circle variants, unmapped reporting);
  tsc error count unchanged (84 pre-existing, 0 new); eslint 0 errors on changed files;
  live runtime test of /api/transfer with dummy token → correct honest needsReauth failure;
  resolver gracefully falls back when platform context can't be established.

Stage Summary:
- Transfer now resolves the PLATFORM's own matchId + player IDs exactly like teamgeneration.in's
  automatic mapper, then calls the ORIGINAL /api/fantasy/add-team contract. Success requires
  backend data.status === "success" (no fake success paths).
- Mapping cached per (match, platform) in SQLite → repeat transfers are fast.
- REQUIRES: owner redeploy + APK rebuild. Users must have linked accounts (OTP) — the platform
  context is resolved WITH the user's own session token.
- NOTE: teamgeneration.in's newest flow uses v2.tgsoftware-api.online behind Google login;
  not integrable for this white-label — V1 automatic-mapper endpoints are the supported path.
