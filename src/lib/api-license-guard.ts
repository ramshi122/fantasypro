/**
 * Server-side license guard for API routes.
 *
 * Usage at the top of any protected API route:
 *
 *   import { verifyLicenseFromRequest, licenseErrorResponse } from "@/lib/api-license-guard";
 *
 *   const licenseCheck = await verifyLicenseFromRequest(request);
 *   if (!licenseCheck.valid) {
 *     return licenseErrorResponse(licenseCheck);
 *   }
 *
 * The client must send these headers:
 *   x-license-key: <license key>
 *   x-device-id: <device id>
 *
 * This is a SERVER-SIDE check — it cannot be bypassed by client-side hacks.
 * It calls the same Firestore lookup as /api/license/verify.
 */

import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { NextResponse } from "next/server";

export type LicenseTier =
  | "trial" | "weekly" | "monthly" | "semi_annual" | "elite" | "lifetime"
  | "match_basic" | "match_full" | null;

export interface LicenseCheckResult {
  valid: boolean;
  code?: string;
  message?: string;
  tier?: LicenseTier;
  key?: string;
}

/**
 * Extract license key + device ID from request headers and verify against Firestore.
 * Returns { valid: true, tier, key } on success, or { valid: false, code, message } on failure.
 */
export async function verifyLicenseFromRequest(request: Request): Promise<LicenseCheckResult> {
  try {
    const licenseKey = request.headers.get("x-license-key") || "";
    const deviceId = request.headers.get("x-device-id") || "";

    if (!licenseKey || !deviceId) {
      return {
        valid: false,
        code: "MISSING_PARAMS",
        message: "License key and device ID required",
      };
    }

    if (!db) {
      // Firebase not configured — fail closed (no access without verification)
      return {
        valid: false,
        code: "FIREBASE_NOT_CONFIGURED",
        message: "License verification service unavailable",
      };
    }

    // Fetch license from Firestore (UNIFIED: admin_data/keys array)
    const cleanKey = licenseKey.toUpperCase();
    const docSnap = await getDoc(doc(db, "admin_data", "keys"));
    if (!docSnap.exists()) {
      return {
        valid: false,
        code: "KEY_NOT_FOUND",
        message: "License key not found",
      };
    }

    const docData = docSnap.data() as Record<string, any>;
    const arr = Array.isArray(docData.keys) ? docData.keys : [];
    const match = arr.find((k: any) => String(k?.key || "").toUpperCase() === cleanKey);
    if (!match) {
      return {
        valid: false,
        code: "KEY_NOT_FOUND",
        message: "License key not found",
      };
    }

    const license = {
      key: match.key || cleanKey,
      type: match.type as LicenseTier,
      status: (match.status || "active") as string,
      expiresAt: match.expiresAt as number | null,
      deviceIds: (match.deviceIds || []) as string[],
    };

    // Check status
    if (license.status !== "active" && license.status !== "used") {
      return {
        valid: false,
        code: "LICENSE_" + license.status.toUpperCase(),
        message: `License ${license.status}. Contact admin.`,
      };
    }

    // Check expiry
    if (license.expiresAt && Date.now() > license.expiresAt) {
      return {
        valid: false,
        code: "LICENSE_EXPIRED",
        message: "License expired",
      };
    }

    // Check device binding (1 key = 1 device)
    if (license.deviceIds.length > 0 && !license.deviceIds.includes(deviceId)) {
      return {
        valid: false,
        code: "DEVICE_MISMATCH",
        message: "Key already bound to another device",
      };
    }

    // All checks passed
    return {
      valid: true,
      tier: license.type,
      key: license.key,
    };
  } catch (error) {
    console.error("[LicenseGuard] Error:", error);
    return {
      valid: false,
      code: "VERIFY_ERROR",
      message: "License verification failed",
    };
  }
}

/**
 * Standard error response for failed license checks.
 */
export function licenseErrorResponse(result: LicenseCheckResult) {
  return NextResponse.json(
    {
      ok: false,
      error: result.message || "License verification failed",
      code: result.code || "VERIFY_FAILED",
      licenseRequired: true,
    },
    { status: 403 }
  );
}
