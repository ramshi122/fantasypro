import { NextResponse } from "next/server";
import { useAdmin } from "@/lib/admin-store";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";

/**
 * Backup/Restore API
 * GET  /api/backup              → export all data as JSON
 * POST /api/backup?action=import   → restore from JSON {data}
 *
 * Export includes:
 *   - All license keys (from local admin store)
 *   - All devices
 *   - All users
 *   - All settings
 *   - Firebase collections: license_keys, users, wallets, transactions
 */

export async function GET() {
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
      // Recent logs (last 200)
      logs: adminState.logs.slice(-200),
    };

    // Pull Firebase collections (best effort)
    const firebaseData: Record<string, unknown[]> = {};
    if (db) {
      const collectionsToExport = ["license_keys", "users", "wallets", "transactions", "broadcasts", "coupons", "predictions"];
      for (const cName of collectionsToExport) {
        try {
          const snap = await getDocs(collection(db, cName));
          const docs: unknown[] = [];
          snap.forEach((d) => docs.push({ _id: d.id, ...d.data() }));
          firebaseData[cName] = docs;
        } catch (err) {
          console.log(`[Backup] export ${cName} failed:`, err);
          firebaseData[cName] = [];
        }
      }
    }
    exportData.firebase = firebaseData;

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
  try {
    const body = await request.json();
    const { action, data } = body as { action: "import"; data: Record<string, unknown> };

    if (action !== "import" || !data) {
      return NextResponse.json({ status: "fail", message: "action=import + data required" }, { status: 200 });
    }

    const adminState = useAdmin.getState();
    const result = { keys: 0, devices: 0, users: 0, settings: false, firebase: 0 };

    // Restore local store
    if (Array.isArray(data.keys)) {
      // Merge: add only keys that don't already exist
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

    // Restore Firebase collections (best effort)
    if (db && data.firebase && typeof data.firebase === "object") {
      for (const [cName, docs] of Object.entries(data.firebase as Record<string, unknown[]>)) {
        if (!Array.isArray(docs)) continue;
        for (const d of docs) {
          const { _id, ...rest } = d as any;
          if (!_id) continue;
          try {
            await setDoc(doc(db, cName, String(_id)), {
              ...rest,
              importedAt: serverTimestamp(),
            }, { merge: true });
            result.firebase++;
          } catch (err) {
            console.log(`[Backup] import ${cName}/${_id} failed:`, err);
          }
        }
      }
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
