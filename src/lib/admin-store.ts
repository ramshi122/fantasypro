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

export type KeyType = "trial" | "weekly" | "monthly" | "lifetime";
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
  verifyLicense: (key: string, deviceId: string) => { valid: boolean; message: string };

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

function getExpiryForType(type: KeyType): number | null {
  const now = Date.now();
  const day = 86400000;
  switch (type) {
    case "trial": return now + 1 * day;
    case "weekly": return now + 7 * day;
    case "monthly": return now + 30 * day;
    case "lifetime": return null;
  }
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/* ---------- Store ---------- */

const DEFAULT_SETTINGS: AdminSettings = {
  adminPassword: "8950888988",
  apiUrl: "https://tgsoftware-api.online",
  firebaseConfig: "",
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

  // 5 demo keys for testing different states
  seedKeys.push(
    { key: "CRICB-DEMO-TEST-KEY1", type: "monthly", status: "active", createdAt: now - 5 * day, expiresAt: now + 25 * day, deviceIds: ["dev_001"], userName: "Demo User 1", lastVerified: now - 3600000, verifications: 12 },
    { key: "CRICB-DEMO-TEST-KEY2", type: "weekly", status: "used", createdAt: now - 10 * day, expiresAt: now - 3 * day, deviceIds: ["dev_002"], userName: "Demo User 2", lastVerified: now - 2 * day, verifications: 5 },
    { key: "CRICB-DEMO-TEST-KEY3", type: "lifetime", status: "active", createdAt: now - 30 * day, expiresAt: null, deviceIds: ["dev_003"], userName: "Premium User", lastVerified: now - 7200000, verifications: 45 },
    { key: "CRICB-DEMO-TEST-KEY4", type: "trial", status: "expired", createdAt: now - 8 * day, expiresAt: now - 7 * day, deviceIds: [], verifications: 1 },
    { key: "CRICB-DEMO-TEST-KEY5", type: "monthly", status: "suspended", createdAt: now - 15 * day, expiresAt: now + 15 * day, deviceIds: ["dev_004"], userName: "Suspended User", verifications: 3 },
  );

  // Generate 500 ready-to-use keys (mix of types)
  const types: KeyType[] = ["trial", "weekly", "monthly", "monthly", "monthly", "lifetime"];
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
    { deviceId: "dev_004", userName: "Suspended User", licenseKey: "CRICB-DEMO-TEST-KEY5", lastLogin: now - 5 * day, status: "banned" },
  ];

  const seedUsers: User[] = [
    { id: "u1", name: "Demo User 1", device: "dev_001", license: "CRICB-DEMO-TEST-KEY1", lastActive: now - 3600000, banned: false },
    { id: "u2", name: "Demo User 2", device: "dev_002", license: "CRICB-DEMO-TEST-KEY2", lastActive: now - 2 * day, banned: false },
    { id: "u3", name: "Premium User", device: "dev_003", license: "CRICB-DEMO-TEST-KEY3", lastActive: now - 7200000, banned: false },
    { id: "u4", name: "Suspended User", device: "dev_004", license: "CRICB-DEMO-TEST-KEY5", lastActive: now - 5 * day, banned: true },
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

      verifyLicense: (key, deviceId) => {
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

        // Step 3: Look up key in database
        const allKeys = get().keys;
        console.log("[License Verify] Total keys in database:", allKeys.length);
        const k = allKeys.find((x) => x.key.toUpperCase() === cleanKey);

        if (!k) {
          console.log("[License Verify] FAIL: Key not found in database");
          console.log("[License Verify] Available keys:", allKeys.map(x => x.key).slice(0, 10).join(", "), "...");
          return { valid: false, message: "Key not found — this key does not exist in the database" };
        }

        console.log("[License Verify] Key found:", k.key, "| Status:", k.status, "| Type:", k.type);

        // Step 4: Check status
        if (k.status === "suspended") {
          console.log("[License Verify] FAIL: Key is suspended");
          return { valid: false, message: "Key suspended — contact admin to reactivate" };
        }

        if (k.status === "expired") {
          console.log("[License Verify] FAIL: Key status is expired");
          return { valid: false, message: "Key expired — status marked as expired" };
        }

        // Step 5: Check expiry date
        if (k.expiresAt && k.expiresAt < Date.now()) {
          const expiredDate = new Date(k.expiresAt).toLocaleDateString();
          console.log("[License Verify] FAIL: Key expired on", expiredDate);
          return { valid: false, message: `Key expired on ${expiredDate} — generate a new key` };
        }

        console.log("[License Verify] Expiry check passed. ExpiresAt:", k.expiresAt ? new Date(k.expiresAt).toLocaleDateString() : "Lifetime");

        // Step 6: Check device binding (max 2 devices per key)
        if (k.deviceIds.length >= 2 && !k.deviceIds.includes(deviceId)) {
          console.log("[License Verify] FAIL: Device limit reached. Bound devices:", k.deviceIds.length);
          return { valid: false, message: `Device limit reached (max 2). Bound: ${k.deviceIds.length}. Contact admin to reset.` };
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
        console.log("[License Verify] ✅ SUCCESS: License verified");
        return { valid: true, message: "✅ License Key Verified Successfully" };
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
      name: "fantasypro-admin",
      storage: createJSONStorage(() => localStorage),
      version: 6,
      // Migrate persisted state from any older version to current shape.
      // CRITICAL: always preserve persisted keys (never wipe them — the user requires
      // the 500+ ready-to-use keys to survive every reload and every version bump).
      migrate: (persisted, _fromVersion) => {
        const p = (persisted as Partial<AdminState> | undefined) || {};
        return {
          ...p,
          // Ensure settings has the full shape (in case new fields were added)
          settings: {
            ...DEFAULT_SETTINGS,
            ...(p.settings || {}),
            // Always keep the latest admin password from defaults unless admin changed it
            adminPassword: p.settings?.adminPassword || DEFAULT_SETTINGS.adminPassword,
          },
          // Preserve arrays; if missing, fall back to empty (merge will re-seed if empty)
          keys: Array.isArray(p.keys) ? p.keys : [],
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
// Also: ensure we ALWAYS have 500+ keys. If the persisted state has fewer than 500
// (e.g. from an older version that only seeded 5 demo keys), top it up with fresh
// active keys. This satisfies the user's requirement: "Dashboard should automatically
// contain 500+ ready-to-use keys. No auto remove."
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
      const types: KeyType[] = ["trial", "weekly", "monthly", "monthly", "monthly", "lifetime"];
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
      // 500+ keys already present — just touch state to force persist save
      useAdmin.setState({ ...state });
      console.log("[Admin Store] Keys present (", currentKeys.length, ") — no re-seed needed");
    }
  }, 100);
}

/* ---------- License Lock (client-side) ---------- */

const LICENSE_STORAGE_KEY = "fantasypro-license";

export interface LicenseState {
  verified: boolean;
  key: string | null;
  deviceId: string;
}

export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem("fantasypro-device-id");
  if (!id) {
    id = "dev_" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    localStorage.setItem("fantasypro-device-id", id);
  }
  return id;
}

export function getLicenseState(): LicenseState {
  if (typeof window === "undefined") return { verified: false, key: null, deviceId: "server" };
  try {
    const data = JSON.parse(localStorage.getItem(LICENSE_STORAGE_KEY) || "{}");
    return {
      verified: !!data.verified,
      key: data.key || null,
      deviceId: getDeviceId(),
    };
  } catch {
    return { verified: false, key: null, deviceId: getDeviceId() };
  }
}

export function setLicenseVerified(key: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    LICENSE_STORAGE_KEY,
    JSON.stringify({
      verified: true,
      key,
      deviceId: getDeviceId(),
    })
  );
}

export function clearLicense() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LICENSE_STORAGE_KEY);
}
