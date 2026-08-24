/**
 * Admin Panel Store — FIRESTORE SYNC (license_keys/{keyStr} per-doc)
 * -------------------------------------------------------------------
 * Hidden admin mode with license management, device binding, user control,
 * team generator toggles, announcements, activity logs, and settings.
 *
 * Storage model (matches user's ACTUAL Firestore rules):
 *   • Firestore license_keys/{keyStr} — ONE DOCUMENT PER KEY
 *     Each key is its own document (atomic writes, no race conditions).
 *     All admin clients (Web, Old APK, New APK) + User APK + API routes
 *     read and write to this SAME collection.
 *   • localStorage — read cache (offline fallback) + UI state
 *
 * Real-time sync:
 *   • onSnapshot listener on the license_keys COLLECTION
 *   • Any admin change → Firestore → ALL other admin panels update INSTANTLY
 *   • Auto-reconnect on network loss (initNetworkReconnectListener)
 *
 * CRUD operations:
 *   • generateKey/suspendKey/activateKey/deleteKey/extendExpiry/resetDevice
 *     ALL write to license_keys/{keyStr} via firebase-license.ts
 *   • After every write, onSnapshot fires → all admin panels get the update
 *
 * User verification:
 *   • verifyLicense() checks Firestore FIRST (source of truth), then local cache
 *   • API routes /api/license/verify + api-license-guard.ts → read license_keys/{keyStr}
 *
 * 1 KEY = 1 DEVICE policy enforced in code (deviceIds[] array, max 1 device).
 */

import { create } from "zustand";

/* ---------- Types ---------- */

// License key tiers:
//   trial       — 1 day free (Trial)
//   match_basic — 1 match active (single match access)
//   match_full  — 24 hour active (full access for 24h)
//   weekly      — 7 days (legacy)
//   monthly     — 30 days (Pro — ₹299)
//   elite       — 90 days (Elite — ₹999)
//   lifetime    — forever (full access)
export type KeyType = "trial" | "match_basic" | "match_full" | "weekly" | "monthly" | "half_yearly" | "elite" | "lifetime";
export type KeyStatus = "active" | "used" | "expired" | "suspended";

export interface LicenseKey {
  key: string;
  type: KeyType;
  status: KeyStatus;
  createdAt: number;
  expiresAt: number | null; // null = lifetime
  deviceIds: string[];
  /** Maximum devices allowed for this key. Default: 1. Trial keys: 50. */
  maxDevices?: number;
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

  // Sync metadata
  isSyncing: boolean;
  lastSyncedAt: number | null;
  /** True when onSnapshot real-time listeners are active. */
  isSubscribed: boolean;

  // Auth actions
  login: (username: string, password: string) => boolean;
  logout: () => void;
  changePassword: (newPassword: string) => void;

  // Sync actions
  /** Fetch ALL admin data from Firestore license_keys/{keyStr} (per-doc).
   *  Updates in-memory store + localStorage cache. Returns true on success. */
  syncFromFirebase: () => Promise<boolean>;
  /** Attach onSnapshot listener to license_keys collection.
   *  Any key change from ANY admin device instantly updates this device.
   *  Returns unsubscribe function. */
  subscribeToFirebase: () => () => void;

  // License actions
  generateKey: (type: KeyType) => string;
  generateKeyAsync: (type: KeyType) => Promise<{ key: string; firestoreOk: boolean; error?: string }>;
  generateBulkKeys: (count: number, type: KeyType) => string[];
  generateBulkKeysAsync: (count: number, type: KeyType) => Promise<{ keys: string[]; firestoreOk: boolean; error?: string }>;
  activateKey: (key: string) => void;
  suspendKey: (key: string) => void;
  deleteKey: (key: string) => void;
  deleteKeyFromFirestoreAsync: (key: string) => Promise<boolean>;
  extendExpiry: (key: string, days: number) => void;
  resetDevice: (key: string) => void;
  verifyLicense: (key: string, deviceId: string) => Promise<{ valid: boolean; message: string; keyType?: KeyType; expiresAt?: number | null }>;
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
    suspendedKeys: number;
    bannedDevices: number;
    activeDevices: number;
    todayVerifications: number;
    totalUsers: number;
    bannedUsers: number;
    teamsGeneratedToday: number;
    revenueToday: number;
  };
}

/* ---------- Helpers ---------- */

const LICENSE_PREFIX_DEFAULT = "CRICB";

// localStorage keys (admin data persistence)
const LS_KEYS = "apna-cricket-admin-keys";
const LS_DEVICES = "apna-cricket-admin-devices";
const LS_USERS = "apna-cricket-admin-users";
const LS_LOGS = "apna-cricket-admin-logs";
const LS_SETTINGS = "apna-cricket-admin-settings";
const LS_ANNOUNCEMENTS = "apna-cricket-admin-announcements";

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

/**
 * Get expiry timestamp for a key type.
 *
 * Uses server time if available (from localStorage cache set by
 * admin-realtime-sync onSnapshot listener), otherwise falls back
 * to device time.
 *
 * This ensures keys generated on different devices have consistent
 * expiry times (within 30 seconds of each other).
 */
export function getExpiryForType(type: KeyType): number | null {
  // Try to use cached server time
  let now = Date.now();
  if (typeof window !== "undefined") {
    try {
      const lsTime = localStorage.getItem("apna-server-time");
      const lsFetched = localStorage.getItem("apna-server-time-fetched");
      if (lsTime && lsFetched) {
        const serverTime = Number(lsTime);
        const fetchedAt = Number(lsFetched);
        // If cached within last 60 seconds, use server time + elapsed
        if (Date.now() - fetchedAt < 60_000) {
          now = serverTime + (Date.now() - fetchedAt);
        }
      }
    } catch {
      // ignore
    }
  }

  const day = 86400000;
  const hour = 3600000;
  switch (type) {
    case "trial": return now + 1 * day;          // 1 day free
    case "match_basic": return now + 6 * hour;   // 1 match = 6 hours
    case "match_full": return now + 1 * day;     // 24 hour active
    case "weekly": return now + 7 * day;         // 7 days
    case "monthly": return now + 30 * day;       // 30 days (Pro ₹299)
    case "half_yearly": return now + 180 * day;  // 180 days (Semi-Annual ₹499)
    case "elite": return now + 90 * day;         // 90 days (Elite ₹999)
    case "lifetime": return null;                // forever
  }
}

/**
 * Get the maximum number of devices allowed for a key type.
 * Per user spec: "free 1 day only 50 device 1 key only"
 *   - Trial keys: 50 devices
 *   - All paid keys: 1 device (default — single-user purchase)
 *
 * This is the DEFAULT when generating a key. Admin can override per-key
 * by setting maxDevices explicitly on the LicenseKey object.
 */
export function getMaxDevicesForType(type: KeyType): number {
  switch (type) {
    case "trial": return 50;       // Free 1-day trial: 50 devices per key
    case "match_basic": return 1; // Paid: 1 device
    case "match_full": return 1;
    case "weekly": return 1;
    case "monthly": return 1;
    case "half_yearly": return 1;
    case "elite": return 3;        // Elite: 3 devices (premium tier)
    case "lifetime": return 3;
    default: return 1;
  }
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/* ---------- localStorage helpers ---------- */

function lsGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function lsSet<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota errors */
  }
}

/* ---------- Store ---------- */

const DEFAULT_SETTINGS: AdminSettings = {
  adminPassword: "", // SECURITY FIX: No longer stored client-side — verified via /api/admin/login
  apiUrl: "https://possible11.com",
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

  // SECURITY FIX: NO demo keys in client bundle!
  // All license keys must come from Firebase (license_keys collection) or
  // be issued by admin after payment verification.
  // Previously had CRICB-ELITE-DEMO-KEY1 + 500 generated keys = instant free Elite.
  const seedKeys: LicenseKey[] = [];

  // SECURITY FIX: NO seeded demo devices/users
  const seedDevices: Device[] = [];

  const seedUsers: User[] = [];

  const seedLogs: ActivityLog[] = [];

  return { keys: seedKeys, devices: seedDevices, users: seedUsers, logs: seedLogs };
}

/**
 * Bootstrap initial state from localStorage. If localStorage is empty for
 * a given collection (first run on this device), seed it with the initial
 * demo data so that EVERY phone sees the same set of seed keys + devices +
 * users + logs.
 */
function bootstrapInitialState() {
  const initial = getInitialData();

  const persistedKeys = lsGet<LicenseKey[] | null>(LS_KEYS, null);
  const keys = persistedKeys && persistedKeys.length > 0 ? persistedKeys : initial.keys;
  if (!persistedKeys || persistedKeys.length === 0) lsSet(LS_KEYS, keys);

  const persistedDevices = lsGet<Device[] | null>(LS_DEVICES, null);
  const devices = persistedDevices && persistedDevices.length > 0 ? persistedDevices : initial.devices;
  if (!persistedDevices || persistedDevices.length === 0) lsSet(LS_DEVICES, devices);

  const persistedUsers = lsGet<User[] | null>(LS_USERS, null);
  const users = persistedUsers && persistedUsers.length > 0 ? persistedUsers : initial.users;
  if (!persistedUsers || persistedUsers.length === 0) lsSet(LS_USERS, users);

  const persistedLogs = lsGet<ActivityLog[] | null>(LS_LOGS, null);
  const logs = persistedLogs && persistedLogs.length > 0 ? persistedLogs : initial.logs;
  if (!persistedLogs || persistedLogs.length === 0) lsSet(LS_LOGS, logs);

  const persistedSettings = lsGet<AdminSettings | null>(LS_SETTINGS, null);
  const settings = persistedSettings ?? DEFAULT_SETTINGS;
  if (!persistedSettings) lsSet(LS_SETTINGS, settings);

  const announcements = lsGet<Announcement[]>(LS_ANNOUNCEMENTS, []);

  return { keys, devices, users, logs, settings, announcements };
}

const bootstrapped = bootstrapInitialState();

export const useAdmin = create<AdminState>()((set, get) => ({
      isAdminAuthenticated: false,
      adminUsername: null,
      keys: bootstrapped.keys,
      devices: bootstrapped.devices,
      users: bootstrapped.users,
      logs: bootstrapped.logs,
      announcements: bootstrapped.announcements,
      settings: bootstrapped.settings,

      isSyncing: false,
      lastSyncedAt: null,
      isSubscribed: false,

      login: async (_username, password) => {
        // SECURITY FIX: Server-side password verification
        // Password is NO LONGER checked client-side (was hardcoded in bundle).
        try {
          const res = await fetch("/api/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ password }),
          });
          const data = await res.json();
          if (data.success && data.token) {
            // Store token in sessionStorage (not localStorage) — clears on tab close
            if (typeof window !== "undefined") {
              sessionStorage.setItem("apna-admin-session", data.token);
            }
            set({ isAdminAuthenticated: true, adminUsername: "admin" });
            get().addLog("admin_action", "Admin logged in (server-verified)");
            return true;
          }
          get().addLog("login_attempt", "Failed admin login attempt");
          return false;
        } catch (err) {
          console.error("[AdminLogin] Error:", err);
          get().addLog("login_attempt", "Admin login network error");
          return false;
        }
      },

      logout: () => {
        set({ isAdminAuthenticated: false, adminUsername: null });
      },

      changePassword: (newPassword) => {
        set((s) => {
          const next = { ...s.settings, adminPassword: newPassword };
          lsSet(LS_SETTINGS, next);
          return { settings: next };
        });
        get().addLog("admin_action", "Admin password changed");
      },

      /* -------------------------------------------------------------- *
       * SYNC ACTIONS — localStorage primary, Firebase license-only
       * -------------------------------------------------------------- */

      syncFromFirebase: async () => {
        set({ isSyncing: true });
        try {
          // REAL-TIME SYNC: Fetch ALL admin data from Firestore (source of truth)
          const { fullSyncFromFirestore } = await import("./admin-realtime-sync");
          const synced = await fullSyncFromFirestore();

          // MERGE keys: Firestore keys (source of truth) + local-only keys
          // (keys generated in the last few seconds that haven't synced to
          // Firestore yet). This prevents the 10-second polling interval
          // from clobbering newly generated keys.
          const lsKeys = lsGet<LicenseKey[]>(LS_KEYS, []);
          const lsDevices = lsGet<Device[]>(LS_DEVICES, []);
          const lsUsers = lsGet<User[]>(LS_USERS, []);
          const lsLogs = lsGet<ActivityLog[]>(LS_LOGS, []);
          const lsSettings = lsGet<AdminSettings>(LS_SETTINGS, DEFAULT_SETTINGS);

          let keys: LicenseKey[];
          if (synced.keys && synced.keys.length > 0) {
            // Merge: Firestore keys first, then local-only keys
            const firestoreKeySet = new Set(
              synced.keys.map((k: LicenseKey) => k.key.toUpperCase())
            );
            const localOnlyKeys = lsKeys.filter(
              (k) => !firestoreKeySet.has(k.key.toUpperCase())
            );
            keys = [...synced.keys, ...localOnlyKeys];
            console.log("[Admin Sync] Keys merged: " + synced.keys.length + " from Firestore + " + localOnlyKeys.length + " local-only = " + keys.length + " total");
          } else {
            keys = lsKeys;
          }

          const devices = synced.devices || lsDevices;
          const users = synced.users || lsUsers;
          const logs = synced.logs || lsLogs;
          const settings = synced.settings || lsSettings;

          // Cache to localStorage (for offline fallback)
          lsSet(LS_KEYS, keys);
          lsSet(LS_DEVICES, devices);
          lsSet(LS_USERS, users);
          lsSet(LS_LOGS, logs);
          lsSet(LS_SETTINGS, settings);

          set({
            keys,
            devices,
            users,
            logs,
            settings,
            isSyncing: false,
            lastSyncedAt: Date.now(),
          });

          console.log("[Admin Sync] ✅ Full sync complete:", {
            keys: keys.length, devices: devices.length, users: users.length,
          });
          return true;
        } catch (err) {
          console.error("[Admin Sync] syncFromFirebase failed:", err);
          set({ isSyncing: false });
          return false;
        }
      },

      subscribeToFirebase: () => {
        // REAL-TIME SYNC: onSnapshot listeners for ALL admin data
        // When Admin A changes data → Firestore updates → Admin B/C/D
        // receive update INSTANTLY (no refresh needed)
        let unsub: (() => void) | null = null;

        (async () => {
          try {
            const { subscribeToAdminData, initNetworkReconnectListener } = await import("./admin-realtime-sync");

            // Init network reconnect handler
            initNetworkReconnectListener();

            unsub = subscribeToAdminData({
              onKeysUpdate: (firestoreKeys) => {
                // MERGE Firestore keys with local keys — don't replace.
                // This prevents the onSnapshot listener from clobbering
                // locally-generated keys that haven't synced to Firestore yet.
                //
                // Strategy:
                //   1. Start with firestoreKeys (source of truth for status/expiry/deviceIds)
                //   2. Add any LOCAL keys that are NOT in firestoreKeys
                //      (these are keys generated in the last few seconds that
                //       haven't finished syncing to Firestore yet)
                //   3. Deduplicate by key string (uppercase)
                set((s) => {
                  const localKeys = s.keys;
                  const firestoreKeySet = new Set(
                    firestoreKeys.map((k: LicenseKey) => k.key.toUpperCase())
                  );
                  // Local-only keys = keys in local store but NOT in Firestore snapshot
                  const localOnlyKeys = localKeys.filter(
                    (k) => !firestoreKeySet.has(k.key.toUpperCase())
                  );
                  // Merge: Firestore keys first (source of truth), then local-only keys
                  const merged = [...firestoreKeys, ...localOnlyKeys];
                  lsSet(LS_KEYS, merged);
                  console.log("[Admin Sync] 📡 Keys merged: " + firestoreKeys.length + " from Firestore + " + localOnlyKeys.length + " local-only = " + merged.length + " total");
                  return { keys: merged, lastSyncedAt: Date.now() };
                });
              },
              onDevicesUpdate: (devices) => {
                lsSet(LS_DEVICES, devices);
                set({ devices });
              },
              onUsersUpdate: (users) => {
                lsSet(LS_USERS, users);
                set({ users });
              },
              onLogsUpdate: (logs) => {
                lsSet(LS_LOGS, logs);
                set({ logs });
              },
              onSettingsUpdate: (settings) => {
                lsSet(LS_SETTINGS, settings);
                set({ settings });
              },
              onAnnouncementsUpdate: (announcements) => {
                set({ announcements });
              },
              onServerTimeUpdate: (serverTime) => {
                // Store server time for expiry calculations
                if (typeof window !== "undefined") {
                  localStorage.setItem("apna-server-time", String(serverTime));
                  localStorage.setItem("apna-server-time-fetched", String(Date.now()));
                }
              },
              onError: (err) => {
                console.error("[Admin Sync] Real-time listener error:", err);
              },
            });

            set({ isSubscribed: true });
            console.log("[Admin Sync] ✅ Real-time listeners active");
          } catch (err) {
            console.error("[Admin Sync] Failed to subscribe:", err);
          }
        })();

        return () => {
          if (unsub) {
            try { unsub(); } catch { /* ignore */ }
          }
          set({ isSubscribed: false });
        };
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
          maxDevices: getMaxDevicesForType(type), // 50 for trial, 1 for paid, 3 for elite
          verifications: 0,
        };
        // 1. Update in-memory state + localStorage IMMEDIATELY
        set((s) => {
          const next = [newKey, ...s.keys];
          lsSet(LS_KEYS, next);
          return { keys: next };
        });
        get().addLog("admin_action", `Generated ${type} key: ${key}`);
        // 2. UNIFIED SYNC: Write to license_keys/{keyStr} (single source of truth).
        //    This triggers onSnapshot on ALL other admin panels instantly.
        import("./firebase-license").then(({ syncKeyToFirestore }) => {
          syncKeyToFirestore(newKey).then((ok) => {
            if (ok) console.log("[Unified Sync] ✅ Key written to license_keys/" + key);
            else console.error("[Unified Sync] ❌ Key write FAILED:", key);
          });
        });
        return key;
      },

      generateKeyAsync: async (type) => {
        const prefix = get().settings.licensePrefix;
        const key = generateLicenseKey(prefix);
        const newKey: LicenseKey = {
          key,
          type,
          status: "active",
          createdAt: Date.now(),
          expiresAt: getExpiryForType(type),
          deviceIds: [],
          maxDevices: getMaxDevicesForType(type), // 50 for trial, 1 for paid, 3 for elite
          verifications: 0,
        };
        // 1. Update in-memory state + localStorage IMMEDIATELY
        set((s) => {
          const next = [newKey, ...s.keys];
          lsSet(LS_KEYS, next);
          return { keys: next };
        });
        get().addLog("admin_action", `Generated ${type} key: ${key}`);
        // 2. AWAIT Firestore write — don't return until we know if it succeeded.
        try {
          const { syncKeyToFirestore } = await import("./firebase-license");
          const firestoreOk = await syncKeyToFirestore(newKey);
          if (firestoreOk) {
            console.log("[Unified Sync] ✅ Key saved to Firestore:", key);
          } else {
            console.error("[Unified Sync] ❌ Key FAILED to save to Firestore:", key);
          }
          return { key, firestoreOk, error: firestoreOk ? undefined : "Firestore write failed — check console" };
        } catch (err: any) {
          console.error("[Unified Sync] ❌ Key save exception:", err);
          return { key, firestoreOk: false, error: err?.message || "Unknown error" };
        }
      },

      generateBulkKeys: (count, type) => {
        const prefix = get().settings.licensePrefix;
        const newKeys: LicenseKey[] = [];
        const maxDev = getMaxDevicesForType(type);
        for (let i = 0; i < count; i++) {
          const key = generateLicenseKey(prefix);
          newKeys.push({
            key,
            type,
            status: "active",
            createdAt: Date.now(),
            expiresAt: getExpiryForType(type),
            deviceIds: [],
            maxDevices: maxDev,
            verifications: 0,
          });
        }
        // 1. Update in-memory state + localStorage IMMEDIATELY
        set((s) => {
          const next = [...newKeys, ...s.keys];
          lsSet(LS_KEYS, next);
          return { keys: next };
        });
        get().addLog("admin_action", `Generated ${count} bulk ${type} keys`);
        // 2. UNIFIED SYNC: Write ALL keys to license_keys/{keyStr} (per-doc, parallel).
        //    Each write triggers onSnapshot on all other admin panels.
        import("./firebase-license").then(({ syncAllKeysToFirestore }) => {
          syncAllKeysToFirestore(get().keys).then((ok) => {
            if (ok) console.log("[Unified Sync] ✅ Bulk write: " + count + " keys to license_keys/");
            else console.error("[Unified Sync] ❌ Bulk write FAILED");
          });
        });
        return newKeys.map((k) => k.key);
      },

      generateBulkKeysAsync: async (count, type) => {
        const prefix = get().settings.licensePrefix;
        const newKeys: LicenseKey[] = [];
        const maxDev = getMaxDevicesForType(type);
        for (let i = 0; i < count; i++) {
          const key = generateLicenseKey(prefix);
          newKeys.push({
            key,
            type,
            status: "active",
            createdAt: Date.now(),
            expiresAt: getExpiryForType(type),
            deviceIds: [],
            maxDevices: maxDev,
            verifications: 0,
          });
        }
        // 1. Update in-memory state + localStorage IMMEDIATELY
        set((s) => {
          const next = [...newKeys, ...s.keys];
          lsSet(LS_KEYS, next);
          return { keys: next };
        });
        get().addLog("admin_action", `Generated ${count} bulk ${type} keys`);
        // 2. AWAIT Firestore write for ALL keys
        try {
          const { syncAllKeysToFirestore } = await import("./firebase-license");
          const firestoreOk = await syncAllKeysToFirestore(newKeys);
          if (firestoreOk) {
            console.log("[Unified Sync] ✅ Bulk save: " + count + " keys to Firestore");
          } else {
            console.error("[Unified Sync] ❌ Bulk save FAILED");
          }
          return { keys: newKeys.map((k) => k.key), firestoreOk, error: firestoreOk ? undefined : "Some keys failed to save — check console" };
        } catch (err: any) {
          console.error("[Unified Sync] ❌ Bulk save exception:", err);
          return { keys: newKeys.map((k) => k.key), firestoreOk: false, error: err?.message || "Unknown error" };
        }
      },

      activateKey: (key) => {
        set((s) => {
          const next = s.keys.map((k) => (k.key === key ? { ...k, status: "active" as KeyStatus } : k));
          lsSet(LS_KEYS, next);
          return { keys: next };
        });
        get().addLog("admin_action", `Activated key: ${key}`);
        // UNIFIED SYNC: update this key in license_keys/{keyStr}
        import("./firebase-license").then(({ updateKeyStatusInFirestore }) => {
          updateKeyStatusInFirestore(key, "active").then((ok) => {
            if (ok) console.log("[Unified Sync] ✅ Activated key:", key);
            else console.error("[Unified Sync] ❌ Activate FAILED:", key);
          });
        });
      },

      suspendKey: (key) => {
        set((s) => {
          const next = s.keys.map((k) => (k.key === key ? { ...k, status: "suspended" as KeyStatus } : k));
          lsSet(LS_KEYS, next);
          return { keys: next };
        });
        get().addLog("admin_action", `Suspended key: ${key}`);
        // UNIFIED SYNC: update this key in license_keys/{keyStr}
        import("./firebase-license").then(({ updateKeyStatusInFirestore }) => {
          updateKeyStatusInFirestore(key, "suspended").then((ok) => {
            if (ok) console.log("[Unified Sync] ✅ Suspended key:", key);
            else console.error("[Unified Sync] ❌ Suspend FAILED:", key);
          });
        });
      },

      deleteKey: (key) => {
        set((s) => {
          const next = s.keys.filter((k) => k.key !== key);
          lsSet(LS_KEYS, next);
          return { keys: next };
        });
        get().addLog("admin_action", `Deleted key: ${key}`);
        // UNIFIED SYNC: delete this key from license_keys/{keyStr}
        import("./firebase-license").then(({ deleteKeyFromFirestore }) => {
          deleteKeyFromFirestore(key).then((ok) => {
            if (ok) console.log("[Unified Sync] ✅ Deleted key:", key);
            else console.error("[Unified Sync] ❌ Delete FAILED:", key);
          });
        });
      },

      deleteKeyFromFirestoreAsync: async (key) => {
        // 1. Remove from local store + localStorage
        set((s) => {
          const next = s.keys.filter((k) => k.key !== key);
          lsSet(LS_KEYS, next);
          return { keys: next };
        });
        // 2. AWAIT Firestore delete
        try {
          const { deleteKeyFromFirestore } = await import("./firebase-license");
          const ok = await deleteKeyFromFirestore(key);
          if (ok) {
            console.log("[Unified Sync] ✅ Deleted key from Firestore:", key);
            get().addLog("admin_action", `Deleted key: ${key}`);
          } else {
            console.error("[Unified Sync] ❌ Delete FAILED from Firestore:", key);
          }
          return ok;
        } catch (err: any) {
          console.error("[Unified Sync] ❌ Delete exception:", err);
          return false;
        }
      },

      extendExpiry: (key, days) => {
        let newExpiry: number | null = null;
        set((s) => {
          const next = s.keys.map((k) => {
            if (k.key !== key) return k;
            const base = k.expiresAt || Date.now();
            newExpiry = base + days * 86400000;
            return { ...k, expiresAt: newExpiry, status: "active" as KeyStatus };
          });
          lsSet(LS_KEYS, next);
          return { keys: next };
        });
        get().addLog("admin_action", `Extended ${key} by ${days} days`);
        // UNIFIED SYNC: update this key's fields in license_keys/{keyStr}
        if (newExpiry !== null) {
          import("./firebase-license").then(({ updateKeyFieldsInFirestore }) => {
            updateKeyFieldsInFirestore(key, { expiresAt: newExpiry, status: "active" }).then((ok) => {
              if (ok) console.log("[Unified Sync] ✅ Extended key:", key, "by", days, "days");
              else console.error("[Unified Sync] ❌ Extend FAILED:", key);
            });
          });
        }
      },

      resetDevice: (key) => {
        set((s) => {
          const next = s.keys.map((k) => (k.key === key ? { ...k, deviceIds: [] } : k));
          lsSet(LS_KEYS, next);
          return { keys: next };
        });
        get().addLog("admin_action", `Reset device binding for key: ${key}`);
        // UNIFIED SYNC: update this key in license_keys/{keyStr}
        import("./firebase-license").then(({ updateKeyFieldsInFirestore }) => {
          updateKeyFieldsInFirestore(key, { deviceIds: [] }).then((ok) => {
            if (ok) console.log("[Unified Sync] ✅ Reset device for key:", key);
            else console.error("[Unified Sync] ❌ Reset device FAILED:", key);
          });
        });
      },

      validateAllKeys: () => {
        const now = Date.now();
        const day = 86400000;
        let fixedCount = 0;
        const modifiedKeys: LicenseKey[] = [];

        set((s) => {
          const next = s.keys.map((k) => {
            let status: KeyStatus = k.status;
            let expiresAt: number | null = k.expiresAt;
            let changed = false;

            // CRITICAL FIX: Per user spec "key are timely not expiring"
            // Do NOT auto-re-activate EXPIRED TRIAL keys. Trial keys expire
            // after 1 day and should STAY expired. Only re-activate if admin
            // explicitly extends expiry via the Extend button.
            //
            // Previous code auto-extended expired trial keys (now + 1 day) which
            // meant trial keys NEVER actually expired — they kept getting re-activated.
            //
            // Now: Only fix keys where expiresAt is missing (compute from type),
            // but do NOT re-activate expired/suspended status.
            if (status === "expired") {
              // Don't re-activate expired keys — leave them expired
              // (admin can manually extend via the Extend button if needed)
            }
            if (status === "suspended") {
              // Don't re-activate suspended keys — admin suspended them intentionally
            }
            // Fix missing expiresAt (compute from type + createdAt)
            if (expiresAt === null && k.type !== "lifetime") {
              const createdAt = k.createdAt || now;
              if (k.type === "trial") expiresAt = createdAt + 1 * day;
              else if (k.type === "weekly") expiresAt = createdAt + 7 * day;
              else if (k.type === "monthly") expiresAt = createdAt + 30 * day;
              else expiresAt = createdAt + 30 * day;
              fixedCount++;
              changed = true;
            }
            // If expiresAt is in the past, mark as expired (don't extend)
            if (expiresAt !== null && expiresAt !== undefined && expiresAt < now && status !== "expired") {
              status = "expired";
              fixedCount++;
              changed = true;
            }

            const updated = { ...k, status, expiresAt };
            if (changed) modifiedKeys.push(updated);
            return updated;
          });
          lsSet(LS_KEYS, next);
          return { keys: next };
        });

        // UNIFIED SYNC: Write ALL modified keys to license_keys/{keyStr} (per-doc).
        if (modifiedKeys.length > 0) {
          import("./firebase-license").then(({ syncAllKeysToFirestore }) => {
            syncAllKeysToFirestore(get().keys).then((ok) => {
              if (ok) console.log("[Unified Sync] ✅ Validate All — synced " + modifiedKeys.length + " modified keys");
              else console.error("[Unified Sync] ❌ Validate All sync FAILED");
            });
          });
        }

        get().addLog("admin_action", `Validated all keys — ${fixedCount} keys fixed`);
        return fixedCount;
      },

      verifyLicense: async (key, deviceId) => {
        // Step 0: Check lockout (LOCAL ONLY — no Firebase restore)
        const { checkLockout, recordFailedAttempt, clearLockout, getRemainingAttempts } = await import("./lockout");
        const lockStatus = checkLockout();
        if (lockStatus.locked) {
          console.log("[License Verify] FAIL: Device is locked. Remaining:", lockStatus.remainingFormatted);
          return {
            valid: false,
            message: `🔒 Too many wrong attempts. App is locked for ${lockStatus.remainingFormatted}. Try again later.`,
            locked: true,
            remainingMs: lockStatus.remainingMs,
          } as any;
        }

        // Step 1: Clean the key
        const cleanKey = key.trim().toUpperCase();
        console.log("[License Verify] Entered key:", cleanKey);
        console.log("[License Verify] Device ID:", deviceId);
        console.log("[License Verify] Remaining attempts:", getRemainingAttempts());

        // Step 2: Validate format (CRICB-XXXX-XXXX-XXXX)
        const keyPattern = /^[A-Z]+-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
        if (!keyPattern.test(cleanKey)) {
          console.log("[License Verify] FAIL: Invalid format. Expected PREFIX-XXXX-XXXX-XXXX");
          const state = recordFailedAttempt(cleanKey);
          const remaining = getRemainingAttempts();
          if (state.lockedUntil) {
            return {
              valid: false,
              message: `🔒 5 wrong attempts reached. App locked for 1 hour. Try after 60 minutes.`,
              locked: true,
            } as any;
          }
          return { valid: false, message: `Invalid key format. ${remaining} attempt(s) remaining before 1-hour lock.` };
        }

        // Step 3: Look up key in FIRESTORE FIRST (source of truth).
        // Local cache is stale — admin may have suspended/activated the key
        // from another device. Always check Firestore for the latest status.
        let k: LicenseKey | undefined;
        console.log("[License Verify] Checking Firestore FIRST (source of truth)...");
        try {
          const { fetchKeyFromFirestore } = await import("./firebase-license");
          const firebaseKey = await fetchKeyFromFirestore(cleanKey);
          if (firebaseKey) {
            console.log("[License Verify] ✅ Key found in Firestore:", firebaseKey.key, "| Type:", firebaseKey.type, "| Status:", firebaseKey.status);
            // Update local store with fresh data from Firestore
            set((s) => {
              const next = [firebaseKey, ...s.keys.filter((x) => x.key.toUpperCase() !== cleanKey)];
              lsSet(LS_KEYS, next);
              return { keys: next };
            });
            k = firebaseKey;
          }
        } catch (err) {
          console.log("[License Verify] Firestore lookup failed (network?), falling back to local cache:", err);
        }

        // Step 3b: Fallback to LOCAL cache if Firestore unavailable (offline)
        if (!k) {
          const allKeys = get().keys;
          console.log("[License Verify] Fallback — checking local cache. Total keys:", allKeys.length);
          k = allKeys.find((x) => x.key.toUpperCase() === cleanKey);
        }

        if (!k) {
          console.log("[License Verify] FAIL: Key not found in Firestore OR local cache");
          const failState = recordFailedAttempt(cleanKey);
          const remaining = getRemainingAttempts();
          if (failState.lockedUntil) {
            return { valid: false, message: "🔒 5 wrong attempts reached. App locked for 1 hour.", locked: true } as any;
          }
          return { valid: false, message: `Key not found. ${remaining} attempt(s) remaining before 1-hour lock.` };
        }

        console.log("[License Verify] Key found:", k.key, "| Status:", k.status, "| Type:", k.type);

        // Step 4: Check status — "used" is still VALID (just has device bound)
        if (k.status === "suspended") {
          console.log("[License Verify] FAIL: Key is suspended");
          const failState = recordFailedAttempt(cleanKey);
          const remaining = getRemainingAttempts();
          if (failState.lockedUntil) {
            return { valid: false, message: "🔒 5 wrong attempts reached. App locked for 1 hour.", locked: true } as any;
          }
          return { valid: false, message: `Key suspended. ${remaining} attempt(s) remaining.` };
        }

        if (k.status === "expired") {
          console.log("[License Verify] FAIL: Key status is expired");
          const failState = recordFailedAttempt(cleanKey);
          const remaining = getRemainingAttempts();
          if (failState.lockedUntil) {
            return { valid: false, message: "🔒 5 wrong attempts reached. App locked for 1 hour.", locked: true } as any;
          }
          return { valid: false, message: `Key expired. ${remaining} attempt(s) remaining.` };
        }

        // Step 5: Check expiry date
        if (k.expiresAt && k.expiresAt < Date.now()) {
          const expiredDate = new Date(k.expiresAt).toLocaleDateString();
          console.log("[License Verify] FAIL: Key expired on", expiredDate);
          const failState = recordFailedAttempt(cleanKey);
          const remaining = getRemainingAttempts();
          if (failState.lockedUntil) {
            return { valid: false, message: "🔒 5 wrong attempts reached. App locked for 1 hour.", locked: true } as any;
          }
          return { valid: false, message: `Key expired on ${expiredDate}. ${remaining} attempt(s) remaining.` };
        }

        console.log("[License Verify] Expiry check passed. ExpiresAt:", k.expiresAt ? new Date(k.expiresAt).toLocaleDateString() : "Lifetime");

        // Step 6: Device binding — STRICT 1 KEY = 1 DEVICE
        if (k.deviceIds.length >= 1 && !k.deviceIds.includes(deviceId)) {
          console.log("[License Verify] FAIL: Key already bound to another device.");
          return {
            valid: false,
            message: "This key is already activated on another device. Each key can only be used on 1 device. Contact admin to reset."
          };
        }

        console.log("[License Verify] Device check passed. Bound devices:", k.deviceIds.length);

        // Step 7: All checks passed — bind device, update status
        let verifiedKey: LicenseKey | null = null;
        if (!k.deviceIds.includes(deviceId)) {
          set((s) => {
            const next = s.keys.map((x) => {
              if (x.key !== k!.key) return x;
              verifiedKey = {
                ...x,
                deviceIds: [...x.deviceIds, deviceId],
                lastVerified: Date.now(),
                verifications: x.verifications + 1,
                status: "used" as KeyStatus,
              };
              return verifiedKey;
            });
            lsSet(LS_KEYS, next);
            return { keys: next };
          });
        } else {
          set((s) => {
            const next = s.keys.map((x) => {
              if (x.key !== k!.key) return x;
              verifiedKey = {
                ...x,
                lastVerified: Date.now(),
                verifications: x.verifications + 1,
              };
              return verifiedKey;
            });
            lsSet(LS_KEYS, next);
            return { keys: next };
          });
        }

        // Sync verification back to Firebase (ONE doc, one-shot).
        if (verifiedKey) {
          import("./firebase-license").then(({ updateKeyFieldsInFirestore }) => {
            updateKeyFieldsInFirestore(verifiedKey!.key, {
              deviceIds: verifiedKey!.deviceIds,
              lastVerified: verifiedKey!.lastVerified,
              verifications: verifiedKey!.verifications,
              status: verifiedKey!.status,
            });
          });
        }

        get().addLog("key_verification", `Key ${cleanKey} verified on ${deviceId} | Type: ${k.type} | Status: ${k.status}`);
        console.log("[License Verify] ✅ SUCCESS: License verified, type:", k.type);
        clearLockout();
        return { valid: true, message: "✅ License Key Verified Successfully", keyType: k.type, expiresAt: k.expiresAt ?? null };
      },

      unbindDevice: (deviceId) => {
        set((s) => {
          const next = {
            devices: s.devices.filter((d) => d.deviceId !== deviceId),
            keys: s.keys.map((k) =>
              k.deviceIds.includes(deviceId)
                ? { ...k, deviceIds: k.deviceIds.filter((id) => id !== deviceId) }
                : k
            ),
          };
          lsSet(LS_DEVICES, next.devices);
          lsSet(LS_KEYS, next.keys);
          return next;
        });
        get().addLog("admin_action", `Unbound device: ${deviceId}`);
      },

      forceLogout: (deviceId) => {
        set((s) => {
          const next = s.devices.map((d) =>
            d.deviceId === deviceId ? { ...d, lastLogin: 0 } : d
          );
          lsSet(LS_DEVICES, next);
          return { devices: next };
        });
        get().addLog("admin_action", `Force logout: ${deviceId}`);
      },

      banDevice: (deviceId) => {
        set((s) => {
          const next = s.devices.map((d) =>
            d.deviceId === deviceId ? { ...d, status: "banned" as const } : d
          );
          lsSet(LS_DEVICES, next);
          return { devices: next };
        });
        get().addLog("admin_action", `Banned device: ${deviceId}`);
      },

      allowDevice: (deviceId) => {
        set((s) => {
          const next = s.devices.map((d) =>
            d.deviceId === deviceId ? { ...d, status: "allowed" as const } : d
          );
          lsSet(LS_DEVICES, next);
          return { devices: next };
        });
        get().addLog("admin_action", `Allowed device: ${deviceId}`);
      },

      banUser: (id) => {
        set((s) => {
          const next = s.users.map((u) => (u.id === id ? { ...u, banned: true } : u));
          lsSet(LS_USERS, next);
          return { users: next };
        });
        get().addLog("admin_action", `Banned user: ${id}`);
      },

      unbanUser: (id) => {
        set((s) => {
          const next = s.users.map((u) => (u.id === id ? { ...u, banned: false } : u));
          lsSet(LS_USERS, next);
          return { users: next };
        });
        get().addLog("admin_action", `Unbanned user: ${id}`);
      },

      deleteUser: (id) => {
        set((s) => {
          const next = s.users.filter((u) => u.id !== id);
          lsSet(LS_USERS, next);
          return { users: next };
        });
        get().addLog("admin_action", `Deleted user: ${id}`);
      },

      resetUserLicense: (id) => {
        set((s) => {
          const next = s.users.map((u) => (u.id === id ? { ...u, license: undefined } : u));
          lsSet(LS_USERS, next);
          return { users: next };
        });
        get().addLog("admin_action", `Reset license for user: ${id}`);
      },

      updateSettings: (partial) => {
        set((s) => {
          const next = { ...s.settings, ...partial };
          lsSet(LS_SETTINGS, next);
          return { settings: next };
        });
        get().addLog("admin_action", "Settings updated");
        // REAL-TIME SYNC: Push settings to Firestore
        import("./admin-realtime-sync").then(({ syncSettingsToFirestore }) => {
          syncSettingsToFirestore(get().settings).catch(() => {});
        });
      },

      toggleFeature: (feature) => {
        set((s) => {
          const next = {
            ...s.settings,
            teamGenerator: {
              ...s.settings.teamGenerator,
              [feature]: !s.settings.teamGenerator[feature],
            },
          };
          lsSet(LS_SETTINGS, next);
          return { settings: next };
        });
        get().addLog("admin_action", `Toggled feature: ${feature}`);
        // REAL-TIME SYNC: Push settings to Firestore
        import("./admin-realtime-sync").then(({ syncSettingsToFirestore }) => {
          syncSettingsToFirestore(get().settings).catch(() => {});
        });
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
        set((s) => {
          const next = [ann, ...s.announcements];
          lsSet(LS_ANNOUNCEMENTS, next);
          return { announcements: next };
        });
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
        set((s) => {
          const next = [log, ...s.logs].slice(0, 500);
          lsSet(LS_LOGS, next);
          return { logs: next };
        });
        // REAL-TIME SYNC: Push logs to Firestore
        import("./admin-realtime-sync").then(({ syncLogsToFirestore }) => {
          syncLogsToFirestore(get().logs).catch(() => {});
        });
      },

      clearLogs: () => {
        set({ logs: [] });
        lsSet(LS_LOGS, []);
      },

      getStats: () => {
        const { keys, devices, users, logs } = get();
        const now = Date.now();
        const todayStart = new Date().setHours(0, 0, 0, 0);
        return {
          totalKeys: keys.length,
          activeKeys: keys.filter((k) => k.status === "active" && (!k.expiresAt || k.expiresAt > now)).length,
          usedKeys: keys.filter((k) => k.status === "used" && (!k.expiresAt || k.expiresAt > now)).length,
          expiredKeys: keys.filter((k) => k.status === "expired" || (k.expiresAt && k.expiresAt < now && k.status !== "suspended")).length,
          suspendedKeys: keys.filter((k) => k.status === "suspended").length,
          bannedDevices: devices.filter((d) => d.status === "banned").length,
          activeDevices: devices.filter((d) => d.status === "allowed").length,
          todayVerifications: logs.filter((l) => l.type === "key_verification" && l.timestamp >= todayStart).length,
          totalUsers: users.length,
          bannedUsers: users.filter((u) => u.banned).length,
          teamsGeneratedToday: logs.filter((l) => l.type === "team_generation" && l.timestamp >= todayStart).length,
          revenueToday: logs.filter((l) => l.type === "payment" && l.timestamp >= todayStart).length,
        };
      },
    })
);

/* ----------------------------------------------------------------- *
 * AUTO-SYNC ON APP LOAD — UNIFIED REAL-TIME SYNC
 * ----------------------------------------------------------------- *
 * On first window load:
 *   1. syncFromFirebase() — fetches ALL admin data from admin_data/*
 *      (single source of truth). Updates in-memory store + localStorage.
 *   2. subscribeToFirebase() — attaches onSnapshot listeners to
 *      admin_data/{keys,devices,users,logs,settings,announcements}.
 *      Any change from ANY admin device instantly updates this device.
 *   3. initNetworkReconnectListener() — auto re-syncs when network
 *      reconnects after being offline.
 *
 * This ensures Admin Web, Old Admin APK, and New Admin APK all show
 * EXACTLY the same data in real-time. No stale cache, no duplicates.
 * ----------------------------------------------------------------- */
if (typeof window !== "undefined") {
  setTimeout(() => {
    useAdmin.getState().syncFromFirebase().then((ok) => {
      if (ok) console.log("[Admin Store] ✅ Initial sync complete (license_keys/ collection)");
      else console.warn("[Admin Store] Initial sync failed — using localStorage cache");
    });
    // Attach real-time listener on license_keys collection (instant sync across all admin panels)
    useAdmin.getState().subscribeToFirebase();
    console.log("[Admin Store] ✅ Real-time listener attached (license_keys collection)");
  }, 100);
}

/* ---------- License Lock (client-side) ---------- */

const LICENSE_STORAGE_KEY = "apna-cricket-license";

export interface LicenseState {
  verified: boolean;
  key: string | null;
  deviceId: string;
  keyType?: KeyType | null;
  expiresAt?: number | null;
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
  if (typeof window === "undefined") return { verified: false, key: null, deviceId: "server", keyType: null, expiresAt: null };
  try {
    const data = JSON.parse(localStorage.getItem(LICENSE_STORAGE_KEY) || "{}");
    return {
      verified: !!data.verified,
      key: data.key || null,
      deviceId: getDeviceId(),
      keyType: data.keyType || null,
      expiresAt: data.expiresAt ?? null,
    };
  } catch {
    return { verified: false, key: null, deviceId: getDeviceId(), keyType: null, expiresAt: null };
  }
}

export function setLicenseVerified(key: string, keyType?: KeyType | null, expiresAt?: number | null) {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    LICENSE_STORAGE_KEY,
    JSON.stringify({
      verified: true,
      key,
      deviceId: getDeviceId(),
      keyType: keyType || null,
      expiresAt: expiresAt ?? null,
    })
  );
}

export function clearLicense() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LICENSE_STORAGE_KEY);
}
