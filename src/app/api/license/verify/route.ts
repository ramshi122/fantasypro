import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, setDoc, serverTimestamp } from "firebase/firestore";
import type { KeyType } from "@/lib/admin-store";
import { checkRateLimit, rateLimitErrorResponse, logClientIP } from "@/lib/rate-limiter";

/**
 * UNIFIED WRITE HELPER — updates a single key's fields in license_keys/{keyStr}.
 * Uses updateDoc (atomic, no race conditions). Falls back to setDoc(merge)
 * if the document doesn't exist yet.
 */
async function updateKeyInFirestore(keyStr: string, fields: Record<string, any>): Promise<void> {
  if (!db) return;
  const cleanKey = keyStr.toUpperCase();
  try {
    await updateDoc(doc(db, "license_keys", cleanKey), {
      ...fields,
      updatedAt: serverTimestamp(),
    });
  } catch (err: any) {
    // updateDoc fails if doc doesn't exist — fall back to setDoc(merge)
    try {
      await setDoc(doc(db, "license_keys", cleanKey), {
        ...fields,
        key: cleanKey,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (err2) {
      console.error("[License Verify] updateKeyInFirestore error:", err2);
    }
  }
}

/**
 * Server-Side License Verification API
 * ====================================
 * Every protected API must call this to verify the license before executing.
 *
 * POST /api/license/verify
 * Body: {
 *   licenseKey: string,
 *   deviceId: string,
 *   feature: string  // "dream11_transfer" | "my11circle_transfer" | "contest_join" |
 *                    // "expert_teams" | "prime_teams" | "elite_ai" | "team_generation"
 *   action: string   // "check" | "increment_transfer" | "increment_team_gen"
 * }
 *
 * Returns:
 *   200 — { valid: true, tier, features, remaining }
 *   403 — { valid: false, message, code }
 *
 * Never trusts frontend. All checks done server-side.
 */

// Feature matrix — server-side source of truth
const TIER_FEATURES: Record<string, {
  teamGenLimit: number;
  dream11: "locked" | "3/day" | "unlimited";
  my11circle: "locked" | "enabled" | "unlimited";
  contestJoin: boolean;
  expertTeams: boolean;
  primeTeams: boolean;
  eliteAI: boolean;
  multiPlatform: boolean;
}> = {
  trial: {
    teamGenLimit: 10,
    dream11: "3/day",
    my11circle: "locked",
    contestJoin: false,
    expertTeams: false,
    primeTeams: false,
    eliteAI: false,
    multiPlatform: false,
  },
  match_basic: {
    teamGenLimit: 20,
    dream11: "unlimited",
    my11circle: "locked",
    contestJoin: true,
    expertTeams: false,
    primeTeams: false,
    eliteAI: false,
    multiPlatform: false,
  },
  match_full: {
    teamGenLimit: 40,
    dream11: "unlimited",
    my11circle: "enabled",
    contestJoin: true,
    expertTeams: false,
    primeTeams: false,
    eliteAI: false,
    multiPlatform: false,
  },
  weekly: {
    teamGenLimit: 40,
    dream11: "unlimited",
    my11circle: "enabled",
    contestJoin: true,
    expertTeams: false,
    primeTeams: false,
    eliteAI: false,
    multiPlatform: false,
  },
  monthly: {
    teamGenLimit: 40,
    dream11: "unlimited",
    my11circle: "enabled",
    contestJoin: true,
    expertTeams: true,
    primeTeams: false,
    eliteAI: false,
    multiPlatform: false,
  },
  half_yearly: {
    teamGenLimit: 100,
    dream11: "unlimited",
    my11circle: "unlimited",
    contestJoin: true,
    expertTeams: true,
    primeTeams: true,
    eliteAI: false,
    multiPlatform: true,
  },
  elite: {
    teamGenLimit: 500,
    dream11: "unlimited",
    my11circle: "unlimited",
    contestJoin: true,
    expertTeams: true,
    primeTeams: true,
    eliteAI: true,
    multiPlatform: true,
  },
  lifetime: {
    teamGenLimit: 500,
    dream11: "unlimited",
    my11circle: "unlimited",
    contestJoin: true,
    expertTeams: true,
    primeTeams: true,
    eliteAI: true,
    multiPlatform: true,
  },
};

interface LicenseRecord {
  key: string;
  type: KeyType;
  status: "active" | "used" | "expired" | "suspended";
  expiresAt: number | null;
  deviceIds: string[];
  transferCount?: number;        // daily transfer counter
  transferCountDate?: string;    // date of last transfer (for daily reset)
  teamGenCount?: number;         // total teams generated
  createdAt: number;
}

export async function POST(request: Request) {
  try {
    // RATE LIMIT: 10 license verify requests per 5 minutes per IP
    const rateCheck = checkRateLimit(request, "licenseVerify");
    if (!rateCheck.allowed) {
      return rateLimitErrorResponse(rateCheck.retryAfter || 60);
    }

    // Log client IP for security audit
    logClientIP(request, "license-verify");

    const body = await request.json();
    const { licenseKey, deviceId, feature, action } = body;

    if (!licenseKey || !deviceId) {
      return NextResponse.json(
        { valid: false, message: "License key and device ID required", code: "MISSING_PARAMS" },
        { status: 403 }
      );
    }

    // SECURITY: Validate key format (must match CRICB-XXXX-XXXX-XXXX pattern)
    const keyPattern = /^[A-Z]+-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    if (!keyPattern.test(String(licenseKey).toUpperCase())) {
      return NextResponse.json(
        { valid: false, message: "Invalid key format", code: "INVALID_FORMAT" },
        { status: 403 }
      );
    }

    // ===== Step 1: Fetch license from Firestore (license_keys/{keyStr} single-doc read) =====
    let license: LicenseRecord | null = null;

    if (db) {
      try {
        const cleanKey = licenseKey.toUpperCase();
        const docSnap = await getDoc(doc(db, "license_keys", cleanKey));
        if (docSnap.exists()) {
          const data = docSnap.data() as any;
          license = {
            key: data.key || cleanKey,
            type: data.type as KeyType,
            status: data.status,
            expiresAt: data.expiresAt,
            deviceIds: data.deviceIds || [],
            transferCount: data.transferCount || 0,
            transferCountDate: data.transferCountDate,
            teamGenCount: data.teamGenCount || 0,
            createdAt: data.createdAt,
          };
        }
      } catch (err) {
        console.error("[License Verify] Firestore error:", err);
      }
    }

    // ===== Step 2: Check license exists =====
    if (!license) {
      return NextResponse.json(
        { valid: false, message: "License key not found", code: "KEY_NOT_FOUND" },
        { status: 403 }
      );
    }

    // ===== Step 3: Check status =====
    if (license.status === "suspended" || license.status === "expired") {
      return NextResponse.json(
        { valid: false, message: `License ${license.status}. Contact admin.`, code: "LICENSE_" + license.status.toUpperCase() },
        { status: 403 }
      );
    }

    // ===== Step 4: Check expiry =====
    if (license.expiresAt && license.expiresAt < Date.now()) {
      // Auto-expire in Firestore (license_keys/{keyStr})
      await updateKeyInFirestore(license.key, {
        status: "expired",
        expiredAt: Date.now(),
      });
      return NextResponse.json(
        { valid: false, message: "License expired", code: "LICENSE_EXPIRED" },
        { status: 403 }
      );
    }

    // ===== Step 5: Check device binding (per-key maxDevices limit) =====
    // Per user spec: "free 1 day only 50 device 1 key only"
    //   - Trial keys: maxDevices = 50 (50 devices can share 1 trial key)
    //   - Paid keys: maxDevices = 1 (single-user purchase)
    //   - Elite/Lifetime: maxDevices = 3 (premium tier)
    // Keys generated BEFORE this update have no maxDevices field → default to 1 (backward compat)
    const maxDevices = license.maxDevices ?? 1;
    if (!license.deviceIds.includes(deviceId)) {
      if (license.deviceIds.length >= maxDevices) {
        return NextResponse.json(
          {
            valid: false,
            message: `Device limit reached (${license.deviceIds.length}/${maxDevices}). This key is bound to ${maxDevices} device${maxDevices > 1 ? "s" : ""}.`,
            code: "DEVICE_LIMIT_REACHED",
            maxDevices,
            boundDevices: license.deviceIds.length,
          },
          { status: 403 }
        );
      }
      // Bind this new device to the key
      license.deviceIds.push(deviceId);
      // Update Firestore with the new device list
      await updateKeyInFirestore(licenseKey.toUpperCase(), {
        deviceIds: license.deviceIds,
      });
      console.log(`[License Verify] Device ${deviceId} bound to key ${licenseKey} (${license.deviceIds.length}/${maxDevices})`);
    }

    // ===== Step 6: Get tier features =====
    const tier = license.type;
    const features = TIER_FEATURES[tier] || TIER_FEATURES.trial;

    // ===== Step 7: Check feature access =====
    if (feature) {
      const today = new Date().toDateString();

      // Reset daily transfer counter if new day
      if (license.transferCountDate !== today) {
        license.transferCount = 0;
        license.transferCountDate = today;
      }

      switch (feature) {
        case "dream11_transfer":
          if (features.dream11 === "locked") {
            return NextResponse.json(
              { valid: false, message: "Dream11 transfer locked for your plan", code: "FEATURE_LOCKED" },
              { status: 403 }
            );
          }
          if (features.dream11 === "3/day" && license.transferCount >= 3) {
            return NextResponse.json(
              { valid: false, message: "Daily transfer limit (3) reached. Upgrade for unlimited.", code: "LIMIT_REACHED" },
              { status: 403 }
            );
          }
          break;

        case "my11circle_transfer":
          if (features.my11circle === "locked") {
            return NextResponse.json(
              { valid: false, message: "My11Circle transfer requires 24 Hour pass (₹99) or higher", code: "FEATURE_LOCKED" },
              { status: 403 }
            );
          }
          break;

        case "contest_join":
          if (!features.contestJoin) {
            return NextResponse.json(
              { valid: false, message: "Contest join requires 1 Match pass (₹49) or higher", code: "FEATURE_LOCKED" },
              { status: 403 }
            );
          }
          break;

        case "expert_teams":
          if (!features.expertTeams) {
            return NextResponse.json(
              { valid: false, message: "Expert Teams requires Pro (₹299) or higher", code: "FEATURE_LOCKED" },
              { status: 403 }
            );
          }
          break;

        case "prime_teams":
          if (!features.primeTeams) {
            return NextResponse.json(
              { valid: false, message: "Prime Teams requires Elite (₹999) or higher", code: "FEATURE_LOCKED" },
              { status: 403 }
            );
          }
          break;

        case "elite_ai":
          if (!features.eliteAI) {
            return NextResponse.json(
              { valid: false, message: "Elite AI requires Elite (₹999) or higher", code: "FEATURE_LOCKED" },
              { status: 403 }
            );
          }
          break;

        case "team_generation":
          if ((license.teamGenCount || 0) >= features.teamGenLimit) {
            return NextResponse.json(
              { valid: false, message: `Team generation limit (${features.teamGenLimit}) reached. Upgrade for more.`, code: "LIMIT_REACHED" },
              { status: 403 }
            );
          }
          break;

        case "multi_platform":
          if (!features.multiPlatform) {
            return NextResponse.json(
              { valid: false, message: "Multi-platform transfer requires Elite (₹999) or higher", code: "FEATURE_LOCKED" },
              { status: 403 }
            );
          }
          break;
      }
    }

    // ===== Step 8: Increment counters if requested =====
    if (action === "increment_transfer") {
      const today = new Date().toDateString();
      const newCount = license.transferCountDate === today ? (license.transferCount || 0) + 1 : 1;
      await updateKeyInFirestore(license.key, {
        transferCount: newCount,
        transferCountDate: today,
        lastTransferAt: Date.now(),
      });
      license.transferCount = newCount;
    }

    if (action === "increment_team_gen") {
      const newCount = (license.teamGenCount || 0) + 1;
      await updateKeyInFirestore(license.key, {
        teamGenCount: newCount,
        lastTeamGenAt: Date.now(),
      });
      license.teamGenCount = newCount;
    }

    // ===== Step 9: Return success with feature info =====
    const remaining = {
      dream11Transfers: features.dream11 === "3/day"
        ? Math.max(0, 3 - (license.transferCount || 0))
        : features.dream11 === "unlimited" ? -1 : 0,
      teamGeneration: Math.max(0, features.teamGenLimit - (license.teamGenCount || 0)),
    };

    return NextResponse.json({
      valid: true,
      tier,
      features,
      remaining,
      license: {
        key: license.key,
        type: license.type,
        status: license.status,
        expiresAt: license.expiresAt,
        transferCount: license.transferCount || 0,
        teamGenCount: license.teamGenCount || 0,
      },
    }, { status: 200 });

  } catch (error) {
    console.error("[License Verify] Error:", error);
    return NextResponse.json(
      { valid: false, message: "Server error", code: "SERVER_ERROR" },
      { status: 500 }
    );
  }
}
