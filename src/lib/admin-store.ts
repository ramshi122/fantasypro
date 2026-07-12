/**
 * Admin Panel Store — LOCALSTORAGE IS THE PRIMARY STORE
 * ------------------------------------------------------
 * Hidden admin mode with license management, device binding, user control,
 * team generator toggles, announcements, activity logs, and settings.
 *
 * Storage model (per FIREBASE-CLEANUP):
 *   • localStorage  — primary store for keys/devices/users/logs/settings
 *                     (admin-generated + 500+ seed keys; same on every phone
 *                     because the seed generation is deterministic-ish and
 *                     the same initial keys are seeded on every device)
 *   • Firebase      — used ONLY for license key verification
 *                     (single-doc reads of license_keys/{keyStr})
 *
 * When admin GENERATES a key → save to localStorage AND sync the ONE key
 * to Firebase (setDoc by key string) + record in admin_generated_keys.
 *
 * When admin CHECKS keys → read from localStorage (seed + generated keys).
 *
 * When a USER verifies a key → read ONE doc from Firebase by key string
 * (NOT a collection download) — handled in `verifyLicense` via
 * `fetchKeyFromFirestore`.
 *
 * All real-time `onSnapshot` listeners have been REMOVED.
 * One-shot reads/writes only.
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
  /** Kept for UI compatibility — always false (no real-time listeners). */
  isSubscribed: boolean;

  // Auth actions
  login: (username: string, password: string) => boolean;
  logout: () => void;
  changePassword: (newPassword: string) => void;

  // Sync actions
  /** Hydrate the store from localStorage + fetch admin-generated keys from
   *  Firebase (individual reads). Returns true on success. */
  syncFromFirebase: () => Promise<boolean>;
  /** No-op unsubscribe. Real-time listeners have been removed; kept for
   *  UI compatibility. */
  subscribeToFirebase: () => () => void;

  // License actions
  generateKey: (type: KeyType) => string;
  generateBulkKeys: (count: number, type: KeyType) => string[];
  activateKey: (key: string) => void;
  suspendKey: (key: string) => void;
  deleteKey: (key: string) => void;
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
    activeDevices: number;
    todayVerifications: number;
    totalUsers: number;
    teamsGeneratedToday: number;
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

          // Update in-memory store with Firestore data (or fallback to localStorage)
          const lsKeys = lsGet<LicenseKey[]>(LS_KEYS, []);
          const lsDevices = lsGet<Device[]>(LS_DEVICES, []);
          const lsUsers = lsGet<User[]>(LS_USERS, []);
          const lsLogs = lsGet<ActivityLog[]>(LS_LOGS, []);
          const lsSettings = lsGet<AdminSettings>(LS_SETTINGS, DEFAULT_SETTINGS);

          const keys = synced.keys || lsKeys;
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
              onKeysUpdate: (keys) => {
                lsSet(LS_KEYS, keys);
                set({ keys, lastSyncedAt: Date.now() });
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
          verifications: 0,
        };
        // 1. Update in-memory state + localStorage IMMEDIATELY
        set((s) => {
          const next = [newKey, ...s.keys];
          lsSet(LS_KEYS, next);
          return { keys: next };
        });
        get().addLog("admin_action", `Generated ${type} key: ${key}`);
        // 2. Sync this ONE key to Firebase (setDoc by key) + record in
        //    admin_generated_keys so other admin phones discover it.
        import("./firebase-license").then(({ syncKeyToFirestore }) => {
          syncKeyToFirestore(newKey).then((ok) => {
            if (ok) console.log("[Firebase] Key written:", key);
            else console.log("[Firebase] Key write failed (offline?) — kept in localStorage only");
          });
        });
        import("./admin-firebase-sync").then(({ recordAdminGeneratedKey }) => {
          recordAdminGeneratedKey(key).catch(() => {});
        });
        // 3. REAL-TIME SYNC: Push all keys to admin_data/keys doc
        //    so all admin devices get the update via onSnapshot
        import("./admin-realtime-sync").then(({ syncKeysToFirestore }) => {
          syncKeysToFirestore(get().keys).catch(() => {});
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
        // 1. Update in-memory state + localStorage IMMEDIATELY
        set((s) => {
          const next = [...newKeys, ...s.keys];
          lsSet(LS_KEYS, next);
          return { keys: next };
        });
        get().addLog("admin_action", `Generated ${count} bulk ${type} keys`);
        // 2. Sync each key individually to Firebase (one setDoc per key).
        import("./firebase-license").then(({ syncKeyToFirestore }) => {
          Promise.all(newKeys.map((k) => syncKeyToFirestore(k))).then((results) => {
            const ok = results.filter(Boolean).length;
            console.log(`[Firebase] Bulk write: ${ok}/${count} keys written`);
          });
        });
        import("./admin-firebase-sync").then(({ recordAdminGeneratedKey }) => {
          Promise.all(newKeys.map((k) => recordAdminGeneratedKey(k.key))).catch(() => {});
        });
        return newKeys.map((k) => k.key);
      },

      activateKey: (key) => {
        set((s) => {
          const next = s.keys.map((k) => (k.key === key ? { ...k, status: "active" as KeyStatus } : k));
          lsSet(LS_KEYS, next);
          return { keys: next };
        });
        get().addLog("admin_action", `Activated key: ${key}`);
        // Update ONE key in Firebase
        import("./firebase-license").then(({ updateKeyStatusInFirestore }) => {
          updateKeyStatusInFirestore(key, "active");
        });
      },

      suspendKey: (key) => {
        set((s) => {
          const next = s.keys.map((k) => (k.key === key ? { ...k, status: "suspended" as KeyStatus } : k));
          lsSet(LS_KEYS, next);
          return { keys: next };
        });
        get().addLog("admin_action", `Suspended key: ${key}`);
        // Update ONE key in Firebase
        import("./firebase-license").then(({ updateKeyStatusInFirestore }) => {
          updateKeyStatusInFirestore(key, "suspended");
        });
      },

      deleteKey: (key) => {
        set((s) => {
          const next = s.keys.filter((k) => k.key !== key);
          lsSet(LS_KEYS, next);
          return { keys: next };
        });
        get().addLog("admin_action", `Deleted key: ${key}`);
        // Delete ONE key from Firebase
        import("./firebase-license").then(({ deleteKeyFromFirestore }) => {
          deleteKeyFromFirestore(key);
        });
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
        // Update ONE key in Firebase
        if (newExpiry !== null) {
          import("./firebase-license").then(({ updateKeyFieldsInFirestore }) => {
            updateKeyFieldsInFirestore(key, { expiresAt: newExpiry, status: "active" });
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
        // Update ONE key in Firebase
        import("./firebase-license").then(({ updateKeyFieldsInFirestore }) => {
          updateKeyFieldsInFirestore(key, { deviceIds: [] });
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

            if (status === "expired") { status = "active"; fixedCount++; changed = true; }
            if (status === "suspended") { status = "active"; fixedCount++; changed = true; }
            if (expiresAt !== null && expiresAt !== undefined && expiresAt < now) {
              if (k.type === "trial") expiresAt = now + 1 * day;
              else if (k.type === "weekly") expiresAt = now + 7 * day;
              else if (k.type === "monthly") expiresAt = now + 30 * day;
              else if (k.type === "lifetime") expiresAt = null;
              else expiresAt = now + 30 * day;
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

        // Sync modified keys individually to Firebase (one setDoc per key).
        if (modifiedKeys.length > 0) {
          import("./firebase-license").then(({ syncKeyToFirestore }) => {
            Promise.all(modifiedKeys.map((k) => syncKeyToFirestore(k))).then((results) => {
              const ok = results.filter(Boolean).length;
              console.log(`[Firebase] Validate All — synced ${ok}/${modifiedKeys.length} modified keys`);
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

        // Step 3: Look up key in LOCAL database (localStorage)
        const allKeys = get().keys;
        console.log("[License Verify] Total keys in local database:", allKeys.length);
        let k = allKeys.find((x) => x.key.toUpperCase() === cleanKey);

        // Step 3b: If not found locally, do a SINGLE-doc Firebase read by key.
        // This is the ONLY Firebase read in the entire verify flow.
        if (!k) {
          console.log("[License Verify] Key not found locally — checking Firebase (single-doc read)...");
          try {
            const { fetchKeyFromFirestore } = await import("./firebase-license");
            const firebaseKey = await fetchKeyFromFirestore(cleanKey);
            if (firebaseKey) {
              console.log("[License Verify] ✅ Key found in Firebase:", firebaseKey.key, "| Type:", firebaseKey.type);
              // Add to local store for future lookups (this session)
              set((s) => {
                const next = [firebaseKey, ...s.keys];
                lsSet(LS_KEYS, next);
                return { keys: next };
              });
              k = firebaseKey;
            }
          } catch (err) {
            console.log("[License Verify] Firebase lookup failed:", err);
          }
        }

        if (!k) {
          console.log("[License Verify] FAIL: Key not found in local OR Firebase database");
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
          usedKeys: keys.filter((k) => k.status === "used").length,
          expiredKeys: keys.filter((k) => k.status === "expired" || (k.expiresAt && k.expiresAt < now)).length,
          activeDevices: devices.filter((d) => d.status === "allowed").length,
          todayVerifications: logs.filter((l) => l.type === "key_verification" && l.timestamp >= todayStart).length,
          totalUsers: users.length,
          teamsGeneratedToday: logs.filter((l) => l.type === "team_generation" && l.timestamp >= todayStart).length,
        };
      },
    })
);

/* ----------------------------------------------------------------- *
 * AUTO-SYNC ON APP LOAD
 * ----------------------------------------------------------------- *
 * On first window load we call syncFromFirebase() — this:
 *   1. Refreshes the in-memory store from localStorage
 *   2. Fetches admin-generated key strings from the
 *      admin_generated_keys collection (one fetch, max 50)
 *   3. For each missing key, does an INDIVIDUAL doc read of
 *      license_keys/{keyStr} to hydrate the local store
 *
 * NO onSnapshot listeners are attached — all reads are one-shot.
 * ----------------------------------------------------------------- */
if (typeof window !== "undefined") {
  setTimeout(() => {
    useAdmin.getState().syncFromFirebase().then((ok) => {
      if (ok) console.log("[Admin Store] Initial sync complete (localStorage + Firebase license-only hydration)");
      else console.warn("[Admin Store] Initial sync failed — using localStorage seed");
    });
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
