import { NextResponse } from "next/server";
import { useAdmin } from "@/lib/admin-store";
import { verifySessionToken } from "@/app/api/admin/login/route";

/**
 * Backup/Restore API — ADMIN ONLY (security fix)
 * SECURITY: All actions require valid admin session token.
 * GET  /api/backup              → export all local admin data as JSON
 * POST /api/backup?action=import   → restore from JSON {data}
 */

function checkAdminAuth(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  const adminToken = authHeader?.replace("Bearer ", "") ||
    new URL(request.url).searchParams.get("adminToken");
  if (!adminToken) return false;
  return verifySessionToken(adminToken);
}

export async function GET(request: Request) {
  // SECURITY: Require admin auth
  if (!checkAdminAuth(request)) {
    return NextResponse.json({ status: "fail", message: "Unauthorized" }, { status: 401 });
  }
  try {
    const adminState = useAdmin.getState();
    const exportData: Record<string, unknown> = {
      _meta: {
        app: "Apna Cricket",
        version: "1.0",
        exportedAt: Date.now(),
        exportedAtISO: new Date().toISOString(),
      },
      keys: adminState.keys,
      devices: adminState.devices,
      users: adminState.users,
      announcements: adminState.announcements,
      settings: adminState.settings,
      logs: adminState.logs.slice(-200),
    };

    return NextResponse.json({
      status: "success",
      exportedAt: Date.now(),
      data: exportData,
    }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ status: "fail", message: err?.message || "Server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  // SECURITY: Require admin auth
  if (!checkAdminAuth(request)) {
    return NextResponse.json({ status: "fail", message: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const { action, data } = body as { action: "import"; data: Record<string, unknown> };

    if (action !== "import" || !data) {
      return NextResponse.json({ status: "fail", message: "action=import + data required" }, { status: 200 });
    }

    const adminState = useAdmin.getState();
    const result = { keys: 0, devices: 0, users: 0, settings: false };

    // Restore local store — merge new entries (do not duplicate)
    if (Array.isArray(data.keys)) {
      const existingKeySet = new Set(adminState.keys.map((k) => k.key));
      const newKeys = (data.keys as any[]).filter((k) => k && k.key && !existingKeySet.has(k.key));
      if (newKeys.length > 0) {
        useAdmin.setState({ keys: [...adminState.keys, ...newKeys] });
        result.keys = newKeys.length;
      }
    }
    if (Array.isArray(data.devices)) {
      const existingDeviceSet = new Set(adminState.devices.map((d) => d.deviceId));
      const newDevices = (data.devices as any[]).filter((d) => d && d.deviceId && !existingDeviceSet.has(d.deviceId));
      if (newDevices.length > 0) {
        useAdmin.setState({ devices: [...adminState.devices, ...newDevices] });
        result.devices = newDevices.length;
      }
    }
    if (Array.isArray(data.users)) {
      const existingUserSet = new Set(adminState.users.map((u) => u.id));
      const newUsers = (data.users as any[]).filter((u) => u && u.id && !existingUserSet.has(u.id));
      if (newUsers.length > 0) {
        useAdmin.setState({ users: [...adminState.users, ...newUsers] });
        result.users = newUsers.length;
      }
    }
    if (data.settings && typeof data.settings === "object") {
      adminState.updateSettings(data.settings as any);
      result.settings = true;
    }

    return NextResponse.json({
      status: "success",
      message: "Import completed",
      result,
    }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ status: "fail", message: err?.message || "Server error" }, { status: 500 });
  }
}
