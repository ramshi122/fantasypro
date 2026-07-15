import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import type { KeyType } from "@/lib/admin-store";

/**
 * UNIFIED WRITE HELPER — updates a single key's fields in admin_data/keys array.
 * Reads the current array, merges fields into the matching key, writes back.
 * This is the ONLY way to update a key in Firestore from the API route.
 */
async function updateKeyInAdminData(keyStr: string, fields: Record<string, any>): Promise<void> {
  if (!db) return;
  const cleanKey = keyStr.toUpperCase();
  try {
    const docRef = doc(db, "admin_data", "keys");
    const snap = await getDoc(docRef);
    if (!snap.exists()) return;
    const data = snap.data() as Record<string, any>;
    const arr = Array.isArray(data.keys) ? data.keys : [];
    let found = false;
    const nextArr = arr.map((k: any) => {
      if (String(k?.key || "").toUpperCase() === cleanKey) {
        found = true;
        return { ...k, ...fields };
      }
      return k;
    });
    if (!found) return;
    await setDoc(docRef, {
      keys: nextArr,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("[License Verify] updateKeyInAdminData error:", err);
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
    const body = await request.json();
    const { licenseKey, deviceId, feature, action } = body;

    if (!licenseKey || !deviceId) {
      return NextResponse.json(
        { valid: false, message: "License key and device ID required", code: "MISSING_PARAMS" },
        { status: 403 }
      );
    }

    // ===== Step 1: Fetch license from Firestore (UNIFIED: admin_data/keys) =====
    let license: LicenseRecord | null = null;

    if (db) {
      try {
        // Read from admin_data/keys document (single source of truth).
        // Scan the keys[] array for the matching key.
        const cleanKey = licenseKey.toUpperCase();
        const docSnap = await getDoc(doc(db, "admin_data", "keys"));
        if (docSnap.exists()) {
          const data = docSnap.data() as Record<string, any>;
          const arr = Array.isArray(data.keys) ? data.keys : [];
          const match = arr.find((k: any) => String(k?.key || "").toUpperCase() === cleanKey);
          if (match) {
            license = {
              key: match.key || cleanKey,
              type: match.type as KeyType,
              status: match.status,
              expiresAt: match.expiresAt,
              deviceIds: match.deviceIds || [],
              transferCount: match.transferCount || 0,
              transferCountDate: match.transferCountDate,
              teamGenCount: match.teamGenCount || 0,
              createdAt: match.createdAt,
            };
          }
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
      // Auto-expire in Firestore (UNIFIED: admin_data/keys)
      await updateKeyInAdminData(license.key, {
        status: "expired",
        expiredAt: Date.now(),
      });
      return NextResponse.json(
        { valid: false, message: "License expired", code: "LICENSE_EXPIRED" },
        { status: 403 }
      );
    }

    // ===== Step 5: Check device binding (1 key = 1 device) =====
    if (license.deviceIds.length >= 1 && !license.deviceIds.includes(deviceId)) {
      return NextResponse.json(
        { valid: false, message: "Key already bound to another device", code: "DEVICE_MISMATCH" },
        { status: 403 }
      );
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
      await updateKeyInAdminData(license.key, {
        transferCount: newCount,
        transferCountDate: today,
        lastTransferAt: Date.now(),
      });
      license.transferCount = newCount;
    }

    if (action === "increment_team_gen") {
      const newCount = (license.teamGenCount || 0) + 1;
      await updateKeyInAdminData(license.key, {
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
