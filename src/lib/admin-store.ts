/**
 * Admin Panel Store
 * -----------------
 * Hidden admin mode with license management, device binding, user control,
 * team generator toggles, announcements, activity logs, and settings.
 *
 * All data is stored in localStorage for the demo. In production, these would
 * be backend JWT-protected API calls.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/* ---------- Types ---------- */

// License key tiers:
//   trial       — 1 day free (Trial)
//   match_basic — 1 match active (single match access)
//   match_full  — 24 hour active (full access for 24h)
//   weekly      — 7 days (legacy)
//   monthly     — 30 days (Pro — ₹299)
//   elite       — 90 days (Elite — ₹999)
//   lifetime    — forever (full access)
export type KeyType = "trial" | "match_basic" | "match_full" | "weekly" | "monthly" | "elite" | "lifetime";
export type KeyStatus = "active" | "used" | "expired" | "suspended";

export interface LicenseKey {
  key: string;
  type: KeyType;
  status: KeyStatus;
  createdAt: number;
  expiresAt: number | null; // null = lifetime
  deviceIds: string[];
  userName?: string;
  lastVerified?: number;
  verifications: number;
}

export interface Device {
  deviceId: string;
  userName?: string;
  licenseKey?: string;
  lastLogin: number;
  status: "allowed" | "banned";
}

export interface User {
  id: string;
  name: string;
  device?: string;
  license?: string;
  lastActive: number;
  banned: boolean;
}

export interface ActivityLog {
  id: string;
  timestamp: number;
  type:
    | "key_verification"
    | "login_attempt"
    | "team_generation"
    | "device_binding"
    | "admin_action"
    | "error";
  message: string;
  details?: Record<string, unknown>;
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  target: "all" | "premium" | "selected";
  createdAt: number;
  sent: boolean;
}

export interface AdminSettings {
  adminPassword: string;
  apiUrl: string;
  firebaseConfig: string;
  licensePrefix: string;
  teamGenerator: {
    enabled: boolean;
    autoTeamGenerator: boolean;
    glGenerator: boolean;
    groupCombination: boolean;
    cheatSheet: boolean;
    dtAnalysis: boolean;
    transferTeam: boolean;
    autoPick: boolean;
  };
}

interface AdminState {
  // Auth
  isAdminAuthenticated: boolean;
  adminUsername: string | null;

  // Data
  keys: LicenseKey[];
  devices: Device[];
  users: User[];
  logs: ActivityLog[];
  announcements: Announcement[];
  settings: AdminSettings;

  // Auth actions
  login: (username: string, password: string) => boolean;
  logout: () => void;
  changePassword: (newPassword: string) => void;

  // License actions
  generateKey: (type: KeyType) => string;
  generateBulkKeys: (count: number, type: KeyType) => string[];
  activateKey: (key: string) => void;
  suspendKey: (key: string) => void;
  deleteKey: (key: string) => void;
  extendExpiry: (key: string, days: number) => void;
  resetDevice: (key: string) => void;
  verifyLicense: (key: string, deviceId: string) => Promise<{ valid: boolean; message: string; keyType?: KeyType }>;
  /** Re-activate ALL keys — fixes any expired/suspended key by extending expiry
   *  and setting status to "active". Returns count of fixed keys. */
  validateAllKeys: () => number;

  // Device actions
  unbindDevice: (deviceId: string) => void;
  forceLogout: (deviceId: string) => void;
  banDevice: (deviceId: string) => void;
  allowDevice: (deviceId: string) => void;

  // User actions
  banUser: (id: string) => void;
  unbanUser: (id: string) => void;
  deleteUser: (id: string) => void;
  resetUserLicense: (id: string) => void;

  // Settings
  updateSettings: (partial: Partial<AdminSettings>) => void;
  toggleFeature: (feature: keyof AdminSettings["teamGenerator"]) => void;

  // Announcements
  sendAnnouncement: (title: string, message: string, target: "all" | "premium" | "selected") => void;

  // Logs
  addLog: (type: ActivityLog["type"], message: string, details?: Record<string, unknown>) => void;
  clearLogs: () => void;

  // Stats
  getStats: () => {
    totalKeys: number;
    activeKeys: number;
    usedKeys: number;
    expiredKeys: number;
    activeDevices: number;
    todayVerifications: number;
    totalUsers: number;
    teamsGeneratedToday: number;
  };
}

/* ---------- Helpers ---------- */

const LICENSE_PREFIX_DEFAULT = "CRICB";

function randomKeySegment(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function generateLicenseKey(prefix: string = LICENSE_PREFIX_DEFAULT): string {
  return `${prefix}-${randomKeySegment()}-${randomKeySegment()}-${randomKeySegment()}`;
}

export function getExpiryForType(type: KeyType): number | null {
  const now = Date.now();
  const day = 86400000;
  const hour = 3600000;
  switch (type) {
    case "trial": return now + 1 * day;        // 1 day free
    case "match_basic": return now + 6 * hour; // 1 match = 6 hours
    case "match_full": return now + 1 * day;   // 24 hour active
    case "weekly": return now + 7 * day;       // 7 days
    case "monthly": return now + 30 * day;     // 30 days (Pro ₹299)
    case "elite": return now + 90 * day;       // 90 days (Elite ₹999)
    case "lifetime": return null;              // forever
  }
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/* ---------- Store ---------- */

const DEFAULT_SETTINGS: AdminSettings = {
  adminPassword: "8950888988",
  apiUrl: "https://tgsoftware-api.online",
  firebaseConfig: JSON.stringify({
    apiKey: "AIzaSyDbaFKRqrD976syNij_fSSuIBSPRtR9vbo",
    authDomain: "revofixer-81a1c.firebaseapp.com",
    projectId: "revofixer-81a1c",
    storageBucket: "revofixer-81a1c.firebasestorage.app",
    messagingSenderId: "1049094387124",
    appId: "1:1049094387124:web:864be9cd7ed7c2455caee1",
    measurementId: "G-HYF2T2VQ8K",
  }),
  licensePrefix: LICENSE_PREFIX_DEFAULT,
  teamGenerator: {
    enabled: true,
    autoTeamGenerator: true,
    glGenerator: true,
    groupCombination: true,
    cheatSheet: true,
    dtAnalysis: true,
    transferTeam: true,
    autoPick: true,
  },
};

// Seed with some demo data on first load
function getInitialData() {
  const now = Date.now();
  const day = 86400000;

  // Generate 500+ ready-to-use license keys at startup
  const seedKeys: LicenseKey[] = [];

  // 5 demo keys — ALL VALID (so user can test with any of them)
  seedKeys.push(
    { key: "CRICB-DEMO-TEST-KEY1", type: "monthly", status: "active", createdAt: now - 5 * day, expiresAt: now + 25 * day, deviceIds: ["dev_001"], userName: "Demo User 1", lastVerified: now - 3600000, verifications: 12 },
    { key: "CRICB-DEMO-TEST-KEY2", type: "weekly", status: "active", createdAt: now - 10 * day, expiresAt: now + 7 * day, deviceIds: ["dev_002"], userName: "Demo User 2", lastVerified: now - 2 * day, verifications: 5 },
    { key: "CRICB-DEMO-TEST-KEY3", type: "lifetime", status: "active", createdAt: now - 30 * day, expiresAt: null, deviceIds: ["dev_003"], userName: "Premium User", lastVerified: now - 7200000, verifications: 45 },
    { key: "CRICB-DEMO-TEST-KEY4", type: "trial", status: "active", createdAt: now - 8 * day, expiresAt: now + 1 * day, deviceIds: [], verifications: 0 },
    { key: "CRICB-DEMO-TEST-KEY5", type: "monthly", status: "active", createdAt: now - 15 * day, expiresAt: now + 15 * day, deviceIds: ["dev_004"], userName: "Demo User 5", verifications: 3 },
    { key: "CRICB-ELITE-DEMO-KEY1", type: "elite", status: "active", createdAt: now - 5 * day, expiresAt: now + 85 * day, deviceIds: [], userName: "Elite Demo User", verifications: 0 },
  );

  // Generate 500 ready-to-use keys (mix of types)
  const types: KeyType[] = ["trial", "weekly", "monthly", "monthly", "monthly", "elite", "lifetime"];
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let i = 0; i < 500; i++) {
    let seg1 = "", seg2 = "", seg3 = "";
    for (let j = 0; j < 4; j++) {
      seg1 += chars[Math.floor(Math.random() * chars.length)];
      seg2 += chars[Math.floor(Math.random() * chars.length)];
      seg3 += chars[Math.floor(Math.random() * chars.length)];
    }
    const type = types[i % types.length];
    seedKeys.push({
      key: `CRICB-${seg1}-${seg2}-${seg3}`,
      type,
      status: "active",
      createdAt: now - Math.floor(Math.random() * 30) * day,
      expiresAt: getExpiryForType(type),
      deviceIds: [],
      verifications: 0,
    });
  }

  const seedDevices: Device[] = [
    { deviceId: "dev_001", userName: "Demo User 1", licenseKey: "CRICB-DEMO-TEST-KEY1", lastLogin: now - 3600000, status: "allowed" },
    { deviceId: "dev_002", userName: "Demo User 2", licenseKey: "CRICB-DEMO-TEST-KEY2", lastLogin: now - 2 * day, status: "allowed" },
    { deviceId: "dev_003", userName: "Premium User", licenseKey: "CRICB-DEMO-TEST-KEY3", lastLogin: now - 7200000, status: "allowed" },
    { deviceId: "dev_004", userName: "Demo User 5", licenseKey: "CRICB-DEMO-TEST-KEY5", lastLogin: now - 5 * day, status: "allowed" },
  ];

  const seedUsers: User[] = [
    { id: "u1", name: "Demo User 1", device: "dev_001", license: "CRICB-DEMO-TEST-KEY1", lastActive: now - 3600000, banned: false },
    { id: "u2", name: "Demo User 2", device: "dev_002", license: "CRICB-DEMO-TEST-KEY2", lastActive: now - 2 * day, banned: false },
    { id: "u3", name: "Premium User", device: "dev_003", license: "CRICB-DEMO-TEST-KEY3", lastActive: now - 7200000, banned: false },
    { id: "u4", name: "Demo User 5", device: "dev_004", license: "CRICB-DEMO-TEST-KEY5", lastActive: now - 5 * day, banned: false },
  ];

  const seedLogs: ActivityLog[] = [
    { id: uid(), timestamp: now - 3600000, type: "key_verification", message: "Key CRICB-DEMO-TEST-KEY1 verified on dev_001" },
    { id: uid(), timestamp: now - 7200000, type: "login_attempt", message: "Successful login from dev_003" },
    { id: uid(), timestamp: now - 10800000, type: "team_generation", message: "10 teams generated for match 118078" },
    { id: uid(), timestamp: now - 86400000, type: "admin_action", message: "Admin suspended key CRICB-DEMO-TEST-KEY5" },
    { id: uid(), timestamp: now - 172800000, type: "error", message: "Failed transfer: invalid auth token" },
  ];

  return { keys: seedKeys, devices: seedDevices, users: seedUsers, logs: seedLogs };
}

const initial = getInitialData();

export const useAdmin = create<AdminState>()(
  persist(
    (set, get) => ({
      isAdminAuthenticated: false,
      adminUsername: null,
      keys: initial.keys,
      devices: initial.devices,
      users: initial.users,
      logs: initial.logs,
      announcements: [],
      settings: DEFAULT_SETTINGS,

      login: (_username, password) => {
        // Password-only auth — no username required
        if (password === get().settings.adminPassword) {
          set({ isAdminAuthenticated: true, adminUsername: "admin" });
          get().addLog("admin_action", "Admin logged in");
          return true;
        }
        get().addLog("login_attempt", "Failed admin login attempt");
        return false;
      },

      logout: () => {
        set({ isAdminAuthenticated: false, adminUsername: null });
      },

      changePassword: (newPassword) => {
        set((s) => ({ settings: { ...s.settings, adminPassword: newPassword } }));
        get().addLog("admin_action", "Admin password changed");
      },

      generateKey: (type) => {
        const prefix = get().settings.licensePrefix;
        const key = generateLicenseKey(prefix);
        const newKey: LicenseKey = {
          key,
          type,
          status: "active",
          createdAt: Date.now(),
          expiresAt: getExpiryForType(type),
          deviceIds: [],
          verifications: 0,
        };
        set((s) => ({ keys: [newKey, ...s.keys] }));
        get().addLog("admin_action", `Generated ${type} key: ${key}`);
        // Sync to Firebase (async, non-blocking)
        import("./firebase-license").then(({ syncKeyToFirestore, initFirebase }) => {
          initFirebase(get().settings.firebaseConfig);
          syncKeyToFirestore(newKey).then((ok) => {
            if (ok) console.log("[Firebase] Key synced:", key);
            else console.log("[Firebase] Key sync failed (offline?) — saved locally only");
          });
        });
        return key;
      },

      generateBulkKeys: (count, type) => {
        const prefix = get().settings.licensePrefix;
        const newKeys: LicenseKey[] = [];
        for (let i = 0; i < count; i++) {
          const key = generateLicenseKey(prefix);
          newKeys.push({
            key,
            type,
            status: "active",
            createdAt: Date.now(),
            expiresAt: getExpiryForType(type),
            deviceIds: [],
            verifications: 0,
          });
        }
        set((s) => ({ keys: [...newKeys, ...s.keys] }));
        get().addLog("admin_action", `Generated ${count} bulk ${type} keys`);
        // Bulk sync to Firebase (async, non-blocking)
        import("./firebase-license").then(({ bulkSyncKeysToFirestore, initFirebase }) => {
          initFirebase(get().settings.firebaseConfig);
          bulkSyncKeysToFirestore(newKeys).then((res) => {
            console.log(`[Firebase] Bulk sync: ${res.synced}/${count} synced, ${res.failed} failed`);
          });
        });
        return newKeys.map((k) => k.key);
      },

      activateKey: (key) => {
        set((s) => ({
          keys: s.keys.map((k) => (k.key === key ? { ...k, status: "active" } : k)),
        }));
        get().addLog("admin_action", `Activated key: ${key}`);
      },

      suspendKey: (key) => {
        set((s) => ({
          keys: s.keys.map((k) => (k.key === key ? { ...k, status: "suspended" } : k)),
        }));
        get().addLog("admin_action", `Suspended key: ${key}`);
      },

      deleteKey: (key) => {
        set((s) => ({ keys: s.keys.filter((k) => k.key !== key) }));
        get().addLog("admin_action", `Deleted key: ${key}`);
      },

      extendExpiry: (key, days) => {
        set((s) => ({
          keys: s.keys.map((k) => {
            if (k.key !== key) return k;
            const base = k.expiresAt || Date.now();
            return { ...k, expiresAt: base + days * 86400000, status: "active" };
          }),
        }));
        get().addLog("admin_action", `Extended ${key} by ${days} days`);
      },

      resetDevice: (key) => {
        set((s) => ({
          keys: s.keys.map((k) => (k.key === key ? { ...k, deviceIds: [] } : k)),
        }));
        get().addLog("admin_action", `Reset device binding for key: ${key}`);
      },

      validateAllKeys: () => {
        const now = Date.now();
        const day = 86400000;
        let fixedCount = 0;

        set((s) => ({
          keys: s.keys.map((k) => {
            // Use a widened type so TS doesn't narrow prematurely
            let status: KeyStatus = k.status;
            let expiresAt: number | null = k.expiresAt;

            // Re-activate expired keys
            if (status === "expired") {
              status = "active";
              fixedCount++;
            }
            // Re-activate suspended keys (admin's "Validate All" = force re-activate)
            if (status === "suspended") {
              status = "active";
              fixedCount++;
            }
            // Extend past expiry dates
            if (expiresAt !== null && expiresAt !== undefined && expiresAt < now) {
              if (k.type === "trial") expiresAt = now + 1 * day;
              else if (k.type === "weekly") expiresAt = now + 7 * day;
              else if (k.type === "monthly") expiresAt = now + 30 * day;
              else if (k.type === "lifetime") expiresAt = null;
              else expiresAt = now + 30 * day;
              // status was already re-activated above if it was "expired"
              fixedCount++;
            }

            return { ...k, status, expiresAt };
          }),
        }));

        get().addLog("admin_action", `Validated all keys — ${fixedCount} keys fixed`);
        return fixedCount;
      },

      verifyLicense: async (key, deviceId) => {
        // Step 1: Clean the key — trim spaces, convert to uppercase
        const cleanKey = key.trim().toUpperCase();
        console.log("[License Verify] Entered key:", cleanKey);
        console.log("[License Verify] Device ID:", deviceId);

        // Step 2: Validate format (CRICB-XXXX-XXXX-XXXX)
        const keyPattern = /^[A-Z]+-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
        if (!keyPattern.test(cleanKey)) {
          console.log("[License Verify] FAIL: Invalid format. Expected PREFIX-XXXX-XXXX-XXXX");
          return { valid: false, message: "Invalid key format. Expected format: CRICB-XXXX-XXXX-XXXX" };
        }

        // Step 3: Look up key in LOCAL database
        const allKeys = get().keys;
        console.log("[License Verify] Total keys in local database:", allKeys.length);
        let k = allKeys.find((x) => x.key.toUpperCase() === cleanKey);

        // Step 3b: If not found locally, check FIREBASE (key may have been generated on another device)
        if (!k) {
          console.log("[License Verify] Key not found locally — checking Firebase...");
          try {
            // Dynamic import to avoid circular dependency
            const { fetchKeyFromFirestore } = await import("./firebase-license");
            const firebaseKey = await fetchKeyFromFirestore(cleanKey);
            if (firebaseKey) {
              console.log("[License Verify] ✅ Key found in Firebase:", firebaseKey.key, "| Type:", firebaseKey.type);
              // Add to local store for future lookups
              set((s) => ({ keys: [firebaseKey, ...s.keys] }));
              k = firebaseKey;
            }
          } catch (err) {
            console.log("[License Verify] Firebase lookup failed:", err);
          }
        }

        if (!k) {
          console.log("[License Verify] FAIL: Key not found in local OR Firebase database");
          return { valid: false, message: "Key not found — this key does not exist in the database. Make sure admin generated this key." };
        }

        console.log("[License Verify] Key found:", k.key, "| Status:", k.status, "| Type:", k.type);

        // Step 4: Check status
        // Note: "used" status means the key has been activated before but is STILL VALID
        // (it just has at least one device bound). Only "suspended" and "expired" block verification.
        if (k.status === "suspended") {
          console.log("[License Verify] FAIL: Key is suspended");
          return { valid: false, message: "Key suspended — contact admin to reactivate" };
        }

        if (k.status === "expired") {
          console.log("[License Verify] FAIL: Key status is expired");
          return { valid: false, message: "Key expired — status marked as expired" };
        }

        // status === "active" OR status === "used" → continue verification

        // Step 5: Check expiry date
        if (k.expiresAt && k.expiresAt < Date.now()) {
          const expiredDate = new Date(k.expiresAt).toLocaleDateString();
          console.log("[License Verify] FAIL: Key expired on", expiredDate);
          return { valid: false, message: `Key expired on ${expiredDate} — generate a new key` };
        }

        console.log("[License Verify] Expiry check passed. ExpiresAt:", k.expiresAt ? new Date(k.expiresAt).toLocaleDateString() : "Lifetime");

        // Step 6: Check device binding — STRICT 1 KEY = 1 DEVICE
        // If key already has 1 device bound and this is a DIFFERENT device → BLOCK
        if (k.deviceIds.length >= 1 && !k.deviceIds.includes(deviceId)) {
          console.log("[License Verify] FAIL: Key already bound to another device. Bound:", k.deviceIds.length, "Device:", deviceId);
          return {
            valid: false,
            message: "This key is already activated on another device. Each key can only be used on 1 device. Contact admin to reset."
          };
        }

        console.log("[License Verify] Device check passed. Bound devices:", k.deviceIds.length, "| This device already bound:", k.deviceIds.includes(deviceId));

        // Step 7: All checks passed — bind device and update status
        if (!k.deviceIds.includes(deviceId)) {
          set((s) => ({
            keys: s.keys.map((x) =>
              x.key === k.key ? { ...x, deviceIds: [...x.deviceIds, deviceId], lastVerified: Date.now(), verifications: x.verifications + 1, status: "used" as KeyStatus } : x
            ),
          }));
          console.log("[License Verify] Device bound successfully. New device count:", k.deviceIds.length + 1);
        } else {
          set((s) => ({
            keys: s.keys.map((x) =>
              x.key === k.key ? { ...x, lastVerified: Date.now(), verifications: x.verifications + 1 } : x
            ),
          }));
          console.log("[License Verify] Device already bound. Verification count:", k.verifications + 1);
        }

        get().addLog("key_verification", `Key ${cleanKey} verified on ${deviceId} | Type: ${k.type} | Status: ${k.status}`);
        console.log("[License Verify] ✅ SUCCESS: License verified, type:", k.type);
        return { valid: true, message: "✅ License Key Verified Successfully", keyType: k.type };
      },

      unbindDevice: (deviceId) => {
        set((s) => ({
          devices: s.devices.filter((d) => d.deviceId !== deviceId),
          keys: s.keys.map((k) => ({
            ...k,
            deviceIds: k.deviceIds.filter((id) => id !== deviceId),
          })),
        }));
        get().addLog("admin_action", `Unbound device: ${deviceId}`);
      },

      forceLogout: (deviceId) => {
        set((s) => ({
          devices: s.devices.map((d) =>
            d.deviceId === deviceId ? { ...d, lastLogin: 0 } : d
          ),
        }));
        get().addLog("admin_action", `Force logout: ${deviceId}`);
      },

      banDevice: (deviceId) => {
        set((s) => ({
          devices: s.devices.map((d) =>
            d.deviceId === deviceId ? { ...d, status: "banned" } : d
          ),
        }));
        get().addLog("admin_action", `Banned device: ${deviceId}`);
      },

      allowDevice: (deviceId) => {
        set((s) => ({
          devices: s.devices.map((d) =>
            d.deviceId === deviceId ? { ...d, status: "allowed" } : d
          ),
        }));
        get().addLog("admin_action", `Allowed device: ${deviceId}`);
      },

      banUser: (id) => {
        set((s) => ({
          users: s.users.map((u) => (u.id === id ? { ...u, banned: true } : u)),
        }));
        get().addLog("admin_action", `Banned user: ${id}`);
      },

      unbanUser: (id) => {
        set((s) => ({
          users: s.users.map((u) => (u.id === id ? { ...u, banned: false } : u)),
        }));
        get().addLog("admin_action", `Unbanned user: ${id}`);
      },

      deleteUser: (id) => {
        set((s) => ({ users: s.users.filter((u) => u.id !== id) }));
        get().addLog("admin_action", `Deleted user: ${id}`);
      },

      resetUserLicense: (id) => {
        set((s) => ({
          users: s.users.map((u) => (u.id === id ? { ...u, license: undefined } : u)),
        }));
        get().addLog("admin_action", `Reset license for user: ${id}`);
      },

      updateSettings: (partial) => {
        set((s) => ({ settings: { ...s.settings, ...partial } }));
        get().addLog("admin_action", "Settings updated");
      },

      toggleFeature: (feature) => {
        set((s) => ({
          settings: {
            ...s.settings,
            teamGenerator: {
              ...s.settings.teamGenerator,
              [feature]: !s.settings.teamGenerator[feature],
            },
          },
        }));
        get().addLog("admin_action", `Toggled feature: ${feature}`);
      },

      sendAnnouncement: (title, message, target) => {
        const ann: Announcement = {
          id: uid(),
          title,
          message,
          target,
          createdAt: Date.now(),
          sent: true,
        };
        set((s) => ({ announcements: [ann, ...s.announcements] }));
        get().addLog("admin_action", `Announcement sent: ${title} → ${target}`);
      },

      addLog: (type, message, details) => {
        const log: ActivityLog = {
          id: uid(),
          timestamp: Date.now(),
          type,
          message,
          details,
        };
        set((s) => ({ logs: [log, ...s.logs].slice(0, 500) }));
      },

      clearLogs: () => {
        set({ logs: [] });
      },

      getStats: () => {
        const { keys, devices, users, logs } = get();
        const now = Date.now();
        const todayStart = new Date().setHours(0, 0, 0, 0);
        return {
          totalKeys: keys.length,
          activeKeys: keys.filter((k) => k.status === "active" && (!k.expiresAt || k.expiresAt > now)).length,
          usedKeys: keys.filter((k) => k.status === "used").length,
          expiredKeys: keys.filter((k) => k.status === "expired" || (k.expiresAt && k.expiresAt < now)).length,
          activeDevices: devices.filter((d) => d.status === "allowed").length,
          todayVerifications: logs.filter((l) => l.type === "key_verification" && l.timestamp >= todayStart).length,
          totalUsers: users.length,
          teamsGeneratedToday: logs.filter((l) => l.type === "team_generation" && l.timestamp >= todayStart).length,
        };
      },
    }),
    {
      name: "apna-cricket-admin",
      storage: createJSONStorage(() => localStorage),
      version: 7,
      // Migrate persisted state from any older version to current shape.
      // CRITICAL: always preserve persisted keys (never wipe them — the user requires
      // the 500+ ready-to-use keys to survive every reload and every version bump).
      migrate: (persisted, _fromVersion) => {
        const p = (persisted as Partial<AdminState> | undefined) || {};

        // SANITIZE all persisted keys — make sure every key is VALID:
        //   - status "expired" → "active" (re-activate, since we don't want auto-expiry to block)
        //   - status "suspended" → keep as-is (admin must explicitly re-activate)
        //   - expiresAt in the past → extend to future based on type
        //   - status "used" → keep "used" (still valid)
        const now = Date.now();
        const day = 86400000;
        const sanitizedKeys: LicenseKey[] = Array.isArray(p.keys)
          ? p.keys.map((k) => {
              if (!k) return k;
              // Use widened types so TS doesn't narrow prematurely
              let status: KeyStatus = k.status;
              let expiresAt: number | null = k.expiresAt;
              // Re-activate expired keys (auto-expiry is annoying — admin should control this)
              if (status === "expired") status = "active";
              if (expiresAt !== null && expiresAt !== undefined && expiresAt < now) {
                // Extend based on type
                if (k.type === "trial") expiresAt = now + 1 * day;
                else if (k.type === "weekly") expiresAt = now + 7 * day;
                else if (k.type === "monthly") expiresAt = now + 30 * day;
                else if (k.type === "lifetime") expiresAt = null;
                else expiresAt = now + 30 * day;
                // status was already re-activated above if it was "expired"
              }
              return { ...k, status, expiresAt };
            })
          : [];

        return {
          ...p,
          // Ensure settings has the full shape (in case new fields were added)
          settings: {
            ...DEFAULT_SETTINGS,
            ...(p.settings || {}),
            // Always keep the latest admin password from defaults unless admin changed it
            adminPassword: p.settings?.adminPassword || DEFAULT_SETTINGS.adminPassword,
          },
          // Sanitized keys (all valid)
          keys: sanitizedKeys,
          devices: Array.isArray(p.devices) ? p.devices : [],
          users: Array.isArray(p.users) ? p.users : [],
          logs: Array.isArray(p.logs) ? p.logs : [],
          announcements: Array.isArray(p.announcements) ? p.announcements : [],
          // Reset auth on every version bump — admin must re-login
          isAdminAuthenticated: false,
          adminUsername: null,
        };
      },
      merge: (persisted, current) => {
        const p = persisted as Partial<AdminState> | undefined;
        // If no persisted data OR keys array is empty/missing → use fresh seed (500+ keys)
        if (!p || !Array.isArray(p.keys) || p.keys.length === 0) {
          return {
            ...current,
            settings: { ...current.settings, adminPassword: current.settings.adminPassword },
          };
        }
        // Persisted keys exist — KEEP THEM ALL (no auto-remove).
        // Merge top-level persisted fields, but always preserve the full keys array.
        return {
          ...current,
          ...p,
          keys: p.keys, // ⚠️ Never wipe — preserve all 500+ keys
          settings: {
            ...current.settings,
            ...(p.settings || {}),
            adminPassword: current.settings.adminPassword,
          },
        };
      },
      partialize: (s) => ({
        keys: s.keys,
        devices: s.devices,
        users: s.users,
        logs: s.logs,
        announcements: s.announcements,
        settings: s.settings,
        isAdminAuthenticated: s.isAdminAuthenticated,
        adminUsername: s.adminUsername,
      }),
    }
  )
);

// Force-save the initial seed data to localStorage on first load.
// Zustand persist doesn't save until a state mutation happens, so we
// trigger a no-op mutation to force the initial state (with seed keys) to persist.
//
// Also: ensure we ALWAYS have 500+ VALID keys.
//  - If 0 keys: re-seed ALL initial data (500+ keys + demo data)
//  - If < 500 keys: top up with fresh active keys
//  - If 500+ keys: validate them all (fix any expired/suspended keys)
//
// This satisfies the user's requirement:
//   "Dashboard should automatically contain 500+ ready-to-use keys. No auto remove."
//   "You added 500 licence key invalid make the all key valid"
if (typeof window !== "undefined") {
  setTimeout(() => {
    const state = useAdmin.getState();
    const currentKeys = state.keys || [];

    if (currentKeys.length === 0) {
      // Keys were wiped — re-seed ALL initial data (500+ keys + demo data)
      useAdmin.setState({
        keys: initial.keys,
        devices: initial.devices,
        users: initial.users,
        logs: initial.logs,
      });
      console.log("[Admin Store] Re-seeded full initial data (keys:", initial.keys.length, ")");
    } else if (currentKeys.length < 500) {
      // Top up to 500+ keys (preserve existing keys, append fresh ones)
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const types: KeyType[] = ["trial", "weekly", "monthly", "monthly", "monthly", "elite", "lifetime"];
      const now = Date.now();
      const day = 86400000;
      const needed = 500 - currentKeys.length;
      const existingKeySet = new Set(currentKeys.map((k) => k.key));
      const newKeys: LicenseKey[] = [];

      for (let i = 0; i < needed; i++) {
        let seg1 = "", seg2 = "", seg3 = "";
        for (let j = 0; j < 4; j++) {
          seg1 += chars[Math.floor(Math.random() * chars.length)];
          seg2 += chars[Math.floor(Math.random() * chars.length)];
          seg3 += chars[Math.floor(Math.random() * chars.length)];
        }
        const newKey = `CRICB-${seg1}-${seg2}-${seg3}`;
        if (existingKeySet.has(newKey)) { i--; continue; } // dedupe
        const type = types[i % types.length];
        newKeys.push({
          key: newKey,
          type,
          status: "active",
          createdAt: now - Math.floor(Math.random() * 30) * day,
          expiresAt: getExpiryForType(type),
          deviceIds: [],
          verifications: 0,
        });
      }
      useAdmin.setState({ keys: [...newKeys, ...currentKeys] });
      console.log("[Admin Store] Topped up keys by", newKeys.length, "→ total now:", currentKeys.length + newKeys.length);
    } else {
      // 500+ keys already present — validate them all to fix any expired/suspended keys
      const fixedCount = useAdmin.getState().validateAllKeys();
      if (fixedCount > 0) {
        console.log("[Admin Store] Validated", currentKeys.length, "keys — fixed", fixedCount, "invalid key(s)");
      } else {
        // No fixes needed — just touch state to force persist save
        useAdmin.setState({ ...useAdmin.getState() });
        console.log("[Admin Store] All", currentKeys.length, "keys already valid — no fixes needed");
      }
    }

    // === FIREBASE SYNC — CRITICAL for multi-device consistency ===
    // Fetch all keys from Firebase and merge with local keys.
    // This ensures all admin panels (different browsers/APKs) show the SAME keys.
    // Local-only keys (generated offline) are synced UP to Firebase.
    // Firebase-only keys (generated on other devices) are synced DOWN to local.
    import("./firebase-license").then(async ({ fetchAllKeysFromFirestore, syncKeyToFirestore, initFirebase, bulkSyncKeysToFirestore }) => {
      try {
        initFirebase();
        const firebaseKeys = await fetchAllKeysFromFirestore();
        if (firebaseKeys.length === 0) {
          console.log("[Admin Store][Firebase Sync] No keys in Firebase — syncing local keys UP");
          const localKeys = useAdmin.getState().keys;
          await bulkSyncKeysToFirestore(localKeys);
          console.log("[Admin Store][Firebase Sync] Synced", localKeys.length, "local keys to Firebase");
          return;
        }

        // Merge: Firebase keys + local-only keys (not in Firebase)
        const localKeys = useAdmin.getState().keys;
        const firebaseKeySet = new Set(firebaseKeys.map((k) => k.key));
        const localOnlyKeys = localKeys.filter((k) => !firebaseKeySet.has(k.key));

        // Sync local-only keys UP to Firebase
        if (localOnlyKeys.length > 0) {
          console.log("[Admin Store][Firebase Sync] Syncing", localOnlyKeys.length, "local-only keys UP to Firebase");
          for (const k of localOnlyKeys.slice(0, 50)) { // limit to 50 to avoid rate limit
            await syncKeyToFirestore(k);
          }
        }

        // Merge Firebase keys DOWN to local (preserve local if conflicts — local is newer)
        const localKeyMap = new Map(localKeys.map((k) => [k.key, k]));
        const mergedKeys = [
          ...localKeys, // local keys first (preserve order)
          ...firebaseKeys.filter((fk) => !localKeyMap.has(fk.key)), // add Firebase-only keys
        ];

        useAdmin.setState({ keys: mergedKeys });
        console.log(
          "[Admin Store][Firebase Sync] Merged:",
          localKeys.length, "local +",
          firebaseKeys.filter((fk) => !localKeyMap.has(fk.key)).length, "from Firebase =",
          mergedKeys.length, "total"
        );
      } catch (err) {
        console.warn("[Admin Store][Firebase Sync] Failed (offline?):", err);
      }
    });
  }, 100);
}

/* ---------- License Lock (client-side) ---------- */

const LICENSE_STORAGE_KEY = "apna-cricket-license";

export interface LicenseState {
  verified: boolean;
  key: string | null;
  deviceId: string;
  keyType?: KeyType | null; // "trial" | "weekly" | "monthly" | "elite" | "lifetime"
}

export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem("apna-cricket-device-id");
  if (!id) {
    id = "dev_" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    localStorage.setItem("apna-cricket-device-id", id);
  }
  return id;
}

export function getLicenseState(): LicenseState {
  if (typeof window === "undefined") return { verified: false, key: null, deviceId: "server", keyType: null };
  try {
    const data = JSON.parse(localStorage.getItem(LICENSE_STORAGE_KEY) || "{}");
    return {
      verified: !!data.verified,
      key: data.key || null,
      deviceId: getDeviceId(),
      keyType: data.keyType || null,
    };
  } catch {
    return { verified: false, key: null, deviceId: getDeviceId(), keyType: null };
  }
}

export function setLicenseVerified(key: string, keyType?: KeyType | null) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    LICENSE_STORAGE_KEY,
    JSON.stringify({
      verified: true,
      key,
      deviceId: getDeviceId(),
      keyType: keyType || null,
    })
  );
}

export function clearLicense() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LICENSE_STORAGE_KEY);
}
