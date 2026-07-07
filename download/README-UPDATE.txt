# FantasyPro Update Package — LATEST
# ====================================
# Files: 8 (4 new, 4 modified)
#
# CRASH FIX: Elite AI button was causing infinite re-render crash.
#             This fix MUST be pushed to GitHub for Vercel to deploy.
#
# HOW TO APPLY + PUSH TO GITHUB (so Vercel deploys):
#
# 1. Download: fantasypro-update.tar.gz
# 2. On your local machine, go to your fantasypro repo:
#      cd /path/to/fantasypro
# 3. Extract the tar.gz OVER your existing files:
#      tar xzf fantasypro-update.tar.gz
# 4. Commit + push:
#      git add -A
#      git commit -m "fix: Elite AI crash fix + Elite key tier + 0-40 teams + batch join"
#      git push origin main
# 5. Vercel will auto-deploy within 1-2 minutes.
#
# FILES IN THIS PACKAGE:
#   src/lib/use-license.ts                          (MODIFIED — crash fix, removed live lookup)
#   src/lib/admin-store.ts                          (MODIFIED — added 'elite' KeyType)
#   src/lib/elite-ai.ts                            (NEW — 25 AI checks + 0-40 ranked teams)
#   src/components/match/elite-ai-generator.tsx     (NEW — Elite AI UI with count selector)
#   src/components/match/transfer-flow.tsx          (MODIFIED — Elite AI button + transfer)
#   src/components/admin/admin-panel.tsx            (MODIFIED — Contests tab + elite key type)
#   src/app/api/contest/join/route.ts              (MODIFIED — batch+shuffle join)
#   src/app/api/contest/my-teams/route.ts          (NEW — fetch user's teams)
