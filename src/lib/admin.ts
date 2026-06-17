/**
 * CRICB License + Admin State Management
 * --------------------------------------
 * - License verification (CRICB-XXXX-XXXX-XXXX format)
 * - Device binding
 * - Admin authentication
 * - Feature flags (master switches)
 * - License key management (localStorage-backed)
 */

const LICENSE_KEY = "cricb-license";
const DEVICE_KEY = "cricb-device-id";
const ADMIN_KEY = "cricb-admin-session";
const KEYS_STORE = "cricb-keys-store";
const USERS_STORE = "cricb-users-store";
const LOGS_STORE = "cricb-activity-logs";
const DEVICES_STORE = "cricb-devices-store";
const SETTINGS_KEY = "cricb-admin-settings";
const FEATURES_KEY = "cricb-feature-flags";

/* ---------- Types ---------- */

export type LicenseType = "trial" | "weekly" | "monthly" | "lifetime";
export type LicenseStatus = "active" | "used" | "expired" | "suspended" | "deleted";

export interface LicenseKey {
  key: string; // CRICB-XXXX-XXXX-XXXX
  type: LicenseType;
  status: LicenseStatus;
  createdAt: number;
  expiresAt: number | null; // null = lifetime
  usedBy?: string; // device ID
  usedAt?: number;
  deviceName?: string;
}

export interface DeviceBinding {
  deviceId: string;
  userName?: string;
  licenseKey?: string;
  lastLogin: number;
  status: "active" | "banned" | "force-logout";
}

export interface UserRecord {
  id: string;
  name: string;
  device: string;
  license: string;
  lastActive: number;
  banned: boolean;
}

export interface ActivityLog {
  id: string;
  timestamp: number;
  type: "key_verification" | "login_attempt" | "team_generation" | "device_binding" | "admin_action" | "error";
  message: string;
  deviceId?: string;
}

export interface FeatureFlags {
  teamGenerator: boolean;
  autoTeamGenerator: boolean;
  glGenerator: boolean;
  groupCombination: boolean;
  cheatSheet: boolean;
  dtAnalysis: boolean;
  transferTeam: boolean;
  autoPick: boolean;
  entireDisabled: boolean; // emergency kill switch
}

export interface AdminSettings {
  username: string;
  password: string;
  apiUrl: string;
  firebaseConfig: string;
  licensePrefix: string;
}

/* ---------- Default feature flags (all enabled) ---------- */

export const DEFAULT_FEATURES: FeatureFlags = {
  teamGenerator: true,
  autoTeamGenerator: true,
  glGenerator: true,
  groupCombination: true,
  cheatSheet: true,
  dtAnalysis: true,
  transferTeam: true,
  autoPick: true,
  entireDisabled: false,
};

export const DEFAULT_ADMIN_SETTINGS: AdminSettings = {
  username: "admin",
  password: "cricb2026",
  apiUrl: "https://tgsoftware-api.online",
  firebaseConfig: "",
  licensePrefix: "CRICB",
};

/* ---------- License Verification ---------- */

export function getDeviceId(): string {
  if (typeof window === "undefined") return "ssr";
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = "dev_" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

export function getLicense(): { verified: boolean; key: string | null } {
  if (typeof window === "undefined") return { verified: false, key: null };
  try {
    const data = JSON.parse(localStorage.getItem(LICENSE_KEY) || "{}");
    return {
      verified: !!data.verified,
      key: data.key || null,
    };
  } catch {
    return { verified: false, key: null };
  }
}

export function setLicenseVerified(key: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    LICENSE_KEY,
    JSON.stringify({
      verified: true,
      key,
      deviceId: getDeviceId(),
      verifiedAt: Date.now(),
    })
  );
}

export function clearLicense() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LICENSE_KEY);
}

/**
 * Verify a CRICB license key against the local key store.
 * Returns { success, message }.
 */
export function verifyLicenseKey(key: string): { success: boolean; message: string; type?: LicenseType } {
  const trimmed = key.trim().toUpperCase();
  // Validate format CRICB-XXXX-XXXX-XXXX
  if (!/^CRICB-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(trimmed)) {
    return { success: false, message: "Invalid key format. Expected CRICB-XXXX-XXXX-XXXX" };
  }

  const store = getAllKeys();
  const found = store.find((k) => k.key === trimmed);

  if (!found) {
    return { success: false, message: "License key not found" };
  }
  if (found.status === "deleted") {
    return { success: false, message: "This key has been deleted" };
  }
  if (found.status === "suspended") {
    return { success: false, message: "This key has been suspended. Contact admin." };
  }
  if (found.status === "expired" || (found.expiresAt && found.expiresAt < Date.now())) {
    return { success: false, message: "This key has expired" };
  }
  if (found.status === "used" && found.usedBy && found.usedBy !== getDeviceId()) {
    return { success: false, message: "This key is bound to another device" };
  }

  // Success — bind to this device
  found.status = "used";
  found.usedBy = getDeviceId();
  found.usedAt = Date.now();
  found.deviceName = navigator?.userAgent?.substring(0, 50) || "Unknown";
  saveKeysStore(store);

  setLicenseVerified(trimmed);
  addLog("key_verification", `Key ${trimmed} verified and bound to device`, getDeviceId());

  return { success: true, message: "License verified successfully", type: found.type };
}

/* ---------- License Key Management ---------- */

function generateKey(prefix: string): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const part = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `${prefix}-${part()}-${part()}-${part()}`;
}

function getAllKeys(): LicenseKey[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEYS_STORE) || "[]");
  } catch {
    return [];
  }
}

function saveKeysStore(keys: LicenseKey[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEYS_STORE, JSON.stringify(keys));
}

export function createKeys(count: number, type: LicenseType, prefix = "CRICB"): LicenseKey[] {
  const store = getAllKeys();
  const newKeys: LicenseKey[] = [];
  const now = Date.now();
  const dayMs = 86400000;

  for (let i = 0; i < count; i++) {
    let key: string;
    do {
      key = generateKey(prefix);
    } while (store.find((k) => k.key === key));

    const k: LicenseKey = {
      key,
      type,
      status: "active",
      createdAt: now,
      expiresAt:
        type === "trial" ? now + 1 * dayMs :
        type === "weekly" ? now + 7 * dayMs :
        type === "monthly" ? now + 30 * dayMs :
        null, // lifetime
    };
    store.push(k);
    newKeys.push(k);
  }
  saveKeysStore(store);
  addLog("admin_action", `Generated ${count} ${type} key(s)`, getDeviceId());
  return newKeys;
}

export function updateKeyStatus(keyStr: string, status: LicenseStatus) {
  const store = getAllKeys();
  const k = store.find((x) => x.key === keyStr);
  if (k) {
    k.status = status;
    saveKeysStore(store);
    addLog("admin_action", `Key ${keyStr} status → ${status}`, getDeviceId());
  }
}

export function extendKeyExpiry(keyStr: string, days: number) {
  const store = getAllKeys();
  const k = store.find((x) => x.key === keyStr);
  if (k) {
    const base = k.expiresAt || Date.now();
    k.expiresAt = base + days * 86400000;
    if (k.status === "expired") k.status = "active";
    saveKeysStore(store);
    addLog("admin_action", `Key ${keyStr} extended by ${days} days`, getDeviceId());
  }
}

export function resetKeyDevice(keyStr: string) {
  const store = getAllKeys();
  const k = store.find((x) => x.key === keyStr);
  if (k) {
    k.usedBy = undefined;
    k.usedAt = undefined;
    k.deviceName = undefined;
    k.status = "active";
    saveKeysStore(store);
    addLog("admin_action", `Device reset for key ${keyStr}`, getDeviceId());
  }
}

export function deleteKey(keyStr: string) {
  updateKeyStatus(keyStr, "deleted");
}

/* ---------- Dashboard Stats ---------- */

export function getDashboardStats() {
  const keys = getAllKeys();
  const devices = getAllDevices();
  const logs = getAllLogs();
  const users = getAllUsers();
  const now = Date.now();
  const todayStart = new Date().setHours(0, 0, 0, 0);

  return {
    totalKeys: keys.filter((k) => k.status !== "deleted").length,
    activeKeys: keys.filter((k) => k.status === "active").length,
    usedKeys: keys.filter((k) => k.status === "used").length,
    expiredKeys: keys.filter((k) => k.status === "expired" || (k.expiresAt && k.expiresAt < now)).length,
    activeDevices: devices.filter((d) => d.status === "active").length,
    todayVerifications: logs.filter((l) => l.type === "key_verification" && l.timestamp > todayStart).length,
    totalUsers: users.length,
    teamsGeneratedToday: logs.filter((l) => l.type === "team_generation" && l.timestamp > todayStart).length,
  };
}

/* ---------- Device Management ---------- */

function getAllDevices(): DeviceBinding[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(DEVICES_STORE) || "[]");
  } catch {
    return [];
  }
}

function saveDevicesStore(devices: DeviceBinding[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(DEVICES_STORE, JSON.stringify(devices));
}

export function updateDeviceStatus(deviceId: string, status: DeviceBinding["status"]) {
  const devices = getAllDevices();
  const d = devices.find((x) => x.deviceId === deviceId);
  if (d) {
    d.status = status;
    saveDevicesStore(devices);
    addLog("admin_action", `Device ${deviceId} → ${status}`, getDeviceId());
  }
}

export { getAllDevices as getAllDeviceBindings };

/* ---------- User Management ---------- */

function getAllUsers(): UserRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(USERS_STORE) || "[]");
  } catch {
    return [];
  }
}

export function getUsers(): UserRecord[] {
  return getAllUsers();
}

export function toggleUserBan(userId: string) {
  const users = getAllUsers();
  const u = users.find((x) => x.id === userId);
  if (u) {
    u.banned = !u.banned;
    localStorage.setItem(USERS_STORE, JSON.stringify(users));
    addLog("admin_action", `User ${userId} ${u.banned ? "banned" : "unbanned"}`, getDeviceId());
  }
}

export function deleteUser(userId: string) {
  const users = getAllUsers().filter((u) => u.id !== userId);
  localStorage.setItem(USERS_STORE, JSON.stringify(users));
  addLog("admin_action", `User ${userId} deleted`, getDeviceId());
}

/* ---------- Activity Logs ---------- */

function getAllLogs(): ActivityLog[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(LOGS_STORE) || "[]");
  } catch {
    return [];
  }
}

export function getLogs(filter?: "today" | "7days" | "30days"): ActivityLog[] {
  const logs = getAllLogs();
  if (!filter) return logs;
  const now = Date.now();
  const cutoff = filter === "today" ? new Date().setHours(0, 0, 0, 0) :
    filter === "7days" ? now - 7 * 86400000 :
    now - 30 * 86400000;
  return logs.filter((l) => l.timestamp > cutoff);
}

export function addLog(type: ActivityLog["type"], message: string, deviceId?: string) {
  if (typeof window === "undefined") return;
  const logs = getAllLogs();
  logs.unshift({
    id: "log_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    timestamp: Date.now(),
    type,
    message,
    deviceId,
  });
  // Keep only last 500 logs
  if (logs.length > 500) logs.length = 500;
  localStorage.setItem(LOGS_STORE, JSON.stringify(logs));
}

/* ---------- Feature Flags ---------- */

export function getFeatureFlags(): FeatureFlags {
  if (typeof window === "undefined") return DEFAULT_FEATURES;
  try {
    const stored = localStorage.getItem(FEATURES_KEY);
    if (!stored) return DEFAULT_FEATURES;
    return { ...DEFAULT_FEATURES, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_FEATURES;
  }
}

export function setFeatureFlag(flag: keyof FeatureFlags, value: boolean) {
  const flags = getFeatureFlags();
  flags[flag] = value;
  localStorage.setItem(FEATURES_KEY, JSON.stringify(flags));
  addLog("admin_action", `Feature ${flag} → ${value ? "ON" : "OFF"}`, getDeviceId());
}

export function isFeatureEnabled(flag: keyof FeatureFlags): boolean {
  const flags = getFeatureFlags();
  if (flags.entireDisabled) return false;
  return flags[flag];
}

/* ---------- Admin Settings ---------- */

export function getAdminSettings(): AdminSettings {
  if (typeof window === "undefined") return DEFAULT_ADMIN_SETTINGS;
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (!stored) return DEFAULT_ADMIN_SETTINGS;
    return { ...DEFAULT_ADMIN_SETTINGS, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_ADMIN_SETTINGS;
  }
}

export function saveAdminSettings(settings: Partial<AdminSettings>) {
  const current = getAdminSettings();
  const updated = { ...current, ...settings };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  addLog("admin_action", "Admin settings updated", getDeviceId());
}

/* ---------- Admin Session ---------- */

export function isAdminLoggedIn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const session = JSON.parse(localStorage.getItem(ADMIN_KEY) || "{}");
    return session.loggedIn === true && session.expiresAt > Date.now();
  } catch {
    return false;
  }
}

export function adminLogin(username: string, password: string): boolean {
  const settings = getAdminSettings();
  if (username === settings.username && password === settings.password) {
    localStorage.setItem(
      ADMIN_KEY,
      JSON.stringify({
        loggedIn: true,
        expiresAt: Date.now() + 3600000, // 1 hour
      })
    );
    addLog("admin_action", "Admin logged in", getDeviceId());
    return true;
  }
  addLog("error", `Failed admin login attempt: ${username}`, getDeviceId());
  return false;
}

export function adminLogout() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ADMIN_KEY);
}
