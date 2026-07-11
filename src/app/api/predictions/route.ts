import { NextResponse } from "next/server";
import {
  getPrediction,
  createPrediction,
  listPredictions,
  checkPredictionAccess,
  type MatchPrediction,
} from "@/lib/premium-predictions";
import { getLicenseState } from "@/lib/admin-store";

/**
 * Predictions API
 * GET  /api/predictions                  → list all (admin)
 * GET  /api/predictions?matchId=X        → fetch one (requires elite/lifetime)
 * POST /api/predictions                  → create/update {matchId, ...data}
 */

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const matchId = url.searchParams.get("matchId");

    if (matchId) {
      // Access control — must have elite/lifetime plan
      const license = getLicenseState();
      const access = checkPredictionAccess(license.keyType);
      if (!access.allowed) {
        return NextResponse.json({
          status: "fail",
          message: access.message,
          upgradeRequired: true,
        }, { status: 200 });
      }
      const prediction = await getPrediction(matchId);
      if (!prediction) {
        return NextResponse.json({
          status: "fail",
          message: "No prediction available for this match",
        }, { status: 200 });
      }
      return NextResponse.json({ status: "success", prediction }, { status: 200 });
    }

    const predictions = await listPredictions(20);
    return NextResponse.json({ status: "success", predictions }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ status: "fail", message: err?.message || "Server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<MatchPrediction> & { matchId: string };
    if (!body.matchId) {
      return NextResponse.json({ status: "fail", message: "matchId required" }, { status: 200 });
    }
    const { matchId, ...rest } = body;
    const prediction = await createPrediction(matchId, rest as Omit<MatchPrediction, "matchId" | "createdAt">);
    if (!prediction) {
      return NextResponse.json({ status: "fail", message: "Failed to create prediction" }, { status: 200 });
    }
    return NextResponse.json({ status: "success", prediction }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ status: "fail", message: err?.message || "Server error" }, { status: 500 });
  }
}
