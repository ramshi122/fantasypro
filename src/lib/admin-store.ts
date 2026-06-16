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
  const seedKeys: LicenseKey[] = [
    { key: "CRICB-DEMO-TEST-KEY1", type: "monthly", status: "active", createdAt: now - 5 * day, expiresAt: now + 25 * day, deviceIds: ["dev_001"], userName: "Demo User 1", lastVerified: now - 3600000, verifications: 12 },
    { key: "CRICB-DEMO-TEST-KEY2", type: "weekly", status: "used", createdAt: now - 10 * day, expiresAt: now - 3 * day, deviceIds: ["dev_002"], userName: "Demo User 2", lastVerified: now - 2 * day, verifications: 5 },
    { key: "CRICB-DEMO-TEST-KEY3", type: "lifetime", status: "active", createdAt: now - 30 * day, expiresAt: null, deviceIds: ["dev_003"], userName: "Premium User", lastVerified: now - 7200000, verifications: 45 },
    { key: "CRICB-DEMO-TEST-KEY4", type: "trial", status: "expired", createdAt: now - 8 * day, expiresAt: now - 7 * day, deviceIds: [], verifications: 1 },
    { key: "CRICB-DEMO-TEST-KEY5", type: "monthly", status: "suspended", createdAt: now - 15 * day, expiresAt: now + 15 * day, deviceIds: ["dev_004"], userName: "Suspended User", verifications: 3 },
  ];

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
        const k = get().keys.find((x) => x.key === key);
        if (!k) return { valid: false, message: "Invalid license key" };
        if (k.status === "suspended") return { valid: false, message: "License suspended" };
        if (k.status === "expired" || (k.expiresAt && k.expiresAt < Date.now())) {
          return { valid: false, message: "License expired" };
        }
        // Allow binding up to 2 devices. If already bound to 2+ and this device isn't one of them, reject.
        if (k.deviceIds.length >= 2 && !k.deviceIds.includes(deviceId)) {
          return { valid: false, message: "Device limit reached (max 2). Contact admin to reset." };
        }
        // Bind device if not already
        if (!k.deviceIds.includes(deviceId)) {
          set((s) => ({
            keys: s.keys.map((x) =>
              x.key === key ? { ...x, deviceIds: [...x.deviceIds, deviceId], lastVerified: Date.now(), verifications: x.verifications + 1, status: "used" } : x
            ),
          }));
        } else {
          set((s) => ({
            keys: s.keys.map((x) =>
              x.key === key ? { ...x, lastVerified: Date.now(), verifications: x.verifications + 1 } : x
            ),
          }));
        }
        get().addLog("key_verification", `Key ${key} verified on ${deviceId}`);
        return { valid: true, message: "License verified" };
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
      version: 2, // bump to force password update from admin123 → 8950888988
      merge: (persisted, current) => {
        const p = persisted as Partial<AdminState> | undefined;
        // Always use the latest default password from current settings
        return {
          ...current,
          ...p,
          settings: {
            ...current.settings,
            ...(p?.settings || {}),
            adminPassword: current.settings.adminPassword, // always use latest default
          },
        };
      },
    }
  )
);

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
