/**
 * Admin Panel Store — FIREBASE IS THE SINGLE SOURCE OF TRUTH
 * ---------------------------------------------------------
 * Hidden admin mode with license management, device binding, user control,
 * team generator toggles, announcements, activity logs, and settings.
 *
 * ⚠️ NO localStorage is used for admin data (keys, devices, users, logs,
 *    settings). All admin data lives in Firebase Firestore and is synced
 *    in real-time via onSnapshot listeners across ALL devices/APKs.
 *
 * The local Zustand store acts as an in-memory cache populated from Firebase.
 * If Firebase is temporarily unavailable, the in-memory state still works so
 * the admin panel remains usable (offline-tolerant).
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

  // Firebase sync metadata
  /** True while a sync is in flight (drives spinner / disabled buttons). */
  isSyncing: boolean;
  /** Timestamp of the last successful sync from Firebase. */
  lastSyncedAt: number | null;
  /** True when real-time onSnapshot listeners have been attached. */
  isSubscribed: boolean;

  // Auth actions
  login: (username: string, password: string) => boolean;
  logout: () => void;
  changePassword: (newPassword: string) => void;

  // Firebase sync actions
  /** Fetch ALL data (keys/devices/users/logs/settings) from Firebase and
   *  replace the in-memory state. Returns true on success. */
  syncFromFirebase: () => Promise<boolean>;
  /** Set up real-time onSnapshot listeners for keys/users/settings.
   *  Idempotent — safe to call multiple times. */
  subscribeToFirebase: () => () => void;

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

export const useAdmin = create<AdminState>()((set, get) => ({
      isAdminAuthenticated: false,
      adminUsername: null,
      keys: initial.keys,
      devices: initial.devices,
      users: initial.users,
      logs: initial.logs,
      announcements: [],
      settings: DEFAULT_SETTINGS,

      // Firebase sync metadata
      isSyncing: false,
      lastSyncedAt: null,
      isSubscribed: false,

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
        // Persist updated settings to Firebase (admin_config/settings)
        import("./admin-firebase-sync").then(({ writeSettingsToFirebase }) => {
          writeSettingsToFirebase({ ...get().settings, adminPassword: newPassword });
        });
        get().addLog("admin_action", "Admin password changed");
      },

      /* -------------------------------------------------------------- *
       * FIREBASE SYNC ACTIONS
       * -------------------------------------------------------------- */

      syncFromFirebase: async () => {
        set({ isSyncing: true });
        try {
          const {
            fetchAllKeysFromFirebase,
            fetchAllDevicesFromFirebase,
            fetchAllUsersFromFirebase,
            fetchLogsFromFirebase,
            fetchSettingsFromFirebase,
            bulkWriteKeysToFirebase,
            writeSettingsToFirebase,
          } = await import("./admin-firebase-sync");

          // Fetch everything in parallel for speed
          const [fbKeys, fbDevices, fbUsers, fbLogs, fbSettings] = await Promise.all([
            fetchAllKeysFromFirebase(),
            fetchAllDevicesFromFirebase(),
            fetchAllUsersFromFirebase(),
            fetchLogsFromFirebase(),
            fetchSettingsFromFirebase(),
          ]);

          // If Firebase has NO keys at all → seed the 500+ initial keys UP
          // to Firebase so that future admin opens on any device see them.
          if (fbKeys.length === 0) {
            console.log("[Admin Sync] Firebase empty — seeding initial", initial.keys.length, "keys UP to Firebase");
            // Seed in the background; do not block the UI.
            bulkWriteKeysToFirebase(initial.keys).then((res) => {
              console.log(`[Admin Sync] Seeded ${res.synced}/${initial.keys.length} keys to Firebase`);
            });
            // Also seed the initial settings doc if missing
            if (!fbSettings) {
              writeSettingsToFirebase(DEFAULT_SETTINGS).then(() => {
                console.log("[Admin Sync] Seeded default settings to Firebase");
              });
            }
            // Keep the in-memory seed keys (they're already there from initial state)
            set({
              keys: initial.keys,
              devices: initial.devices,
              users: initial.users,
              logs: initial.logs,
              settings: fbSettings || DEFAULT_SETTINGS,
              isSyncing: false,
              lastSyncedAt: Date.now(),
            });
            return true;
          }

          // Firebase has keys — use them as the source of truth.
          // Merge in any local-only seed keys (CRICB-DEMO-TEST-KEY1..5 etc.)
          // that don't yet exist in Firebase so the demo keys remain usable.
          const fbKeySet = new Set(fbKeys.map((k) => k.key));
          const localOnlySeedKeys = initial.keys.filter((k) => !fbKeySet.has(k.key));
          if (localOnlySeedKeys.length > 0) {
            console.log("[Admin Sync] Pushing", localOnlySeedKeys.length, "local seed keys UP to Firebase");
            bulkWriteKeysToFirebase(localOnlySeedKeys).then(() => {
              console.log("[Admin Sync] Seed keys pushed to Firebase");
            });
          }

          set({
            keys: [...fbKeys, ...localOnlySeedKeys],
            devices: fbDevices.length > 0 ? fbDevices : initial.devices,
            users: fbUsers.length > 0 ? fbUsers : initial.users,
            logs: fbLogs.length > 0 ? fbLogs : initial.logs,
            settings: fbSettings || DEFAULT_SETTINGS,
            isSyncing: false,
            lastSyncedAt: Date.now(),
          });
          console.log(
            `[Admin Sync] Synced from Firebase — ${fbKeys.length} keys, ${fbDevices.length} devices, ${fbUsers.length} users, ${fbLogs.length} logs`
          );
          return true;
        } catch (err) {
          console.error("[Admin Sync] syncFromFirebase failed:", err);
          set({ isSyncing: false });
          return false;
        }
      },

      subscribeToFirebase: () => {
        if (get().isSubscribed) {
          console.log("[Admin Sync] Already subscribed — skipping duplicate listener setup");
          return () => {};
        }
        set({ isSubscribed: true });

        let unsubKeys: (() => void) | null = null;
        let unsubUsers: (() => void) | null = null;
        let unsubSettings: (() => void) | null = null;

        import("./admin-firebase-sync").then(
          ({ subscribeToKeys, subscribeToUsers, subscribeToSettings }) => {
            // Real-time keys listener — fires immediately with current state
            // AND on every change across all devices.
            unsubKeys = subscribeToKeys((fbKeys) => {
              if (fbKeys.length === 0) return; // ignore empty snapshots (init flicker)
              set({ keys: fbKeys, lastSyncedAt: Date.now() });
            });
            unsubUsers = subscribeToUsers((fbUsers) => {
              set({ users: fbUsers });
            });
            unsubSettings = subscribeToSettings((fbSettings) => {
              set({ settings: fbSettings });
            });
            console.log("[Admin Sync] Real-time listeners attached (keys, users, settings)");
          }
        );

        // Return unsubscribe function
        return () => {
          if (unsubKeys) unsubKeys();
          if (unsubUsers) unsubUsers();
          if (unsubSettings) unsubSettings();
          set({ isSubscribed: false });
          console.log("[Admin Sync] Real-time listeners detached");
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
        // 1. Update in-memory state IMMEDIATELY (optimistic)
        set((s) => ({ keys: [newKey, ...s.keys] }));
        get().addLog("admin_action", `Generated ${type} key: ${key}`);
        // 2. Write to Firebase IMMEDIATELY (source of truth)
        import("./admin-firebase-sync").then(({ writeKeyToFirebase }) => {
          writeKeyToFirebase(newKey).then((ok) => {
            if (ok) console.log("[Firebase] Key written:", key);
            else console.log("[Firebase] Key write failed (offline?) — kept in memory only");
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
        // 1. Update in-memory state IMMEDIATELY (optimistic)
        set((s) => ({ keys: [...newKeys, ...s.keys] }));
        get().addLog("admin_action", `Generated ${count} bulk ${type} keys`);
        // 2. Write to Firebase IMMEDIATELY (source of truth)
        import("./admin-firebase-sync").then(({ bulkWriteKeysToFirebase }) => {
          bulkWriteKeysToFirebase(newKeys).then((res) => {
            console.log(`[Firebase] Bulk write: ${res.synced}/${count} written, ${res.failed} failed`);
          });
        });
        return newKeys.map((k) => k.key);
      },

      activateKey: (key) => {
        set((s) => ({
          keys: s.keys.map((k) => (k.key === key ? { ...k, status: "active" } : k)),
        }));
        get().addLog("admin_action", `Activated key: ${key}`);
        // Write to Firebase IMMEDIATELY
        import("./admin-firebase-sync").then(({ updateKeyInFirebase }) => {
          updateKeyInFirebase(key, { status: "active" });
        });
      },

      suspendKey: (key) => {
        set((s) => ({
          keys: s.keys.map((k) => (k.key === key ? { ...k, status: "suspended" } : k)),
        }));
        get().addLog("admin_action", `Suspended key: ${key}`);
        // Write to Firebase IMMEDIATELY
        import("./admin-firebase-sync").then(({ updateKeyInFirebase }) => {
          updateKeyInFirebase(key, { status: "suspended" });
        });
      },

      deleteKey: (key) => {
        set((s) => ({ keys: s.keys.filter((k) => k.key !== key) }));
        get().addLog("admin_action", `Deleted key: ${key}`);
        // Delete from Firebase IMMEDIATELY
        import("./admin-firebase-sync").then(({ deleteKeyFromFirebase }) => {
          deleteKeyFromFirebase(key);
        });
      },

      extendExpiry: (key, days) => {
        let newExpiry: number | null = null;
        set((s) => ({
          keys: s.keys.map((k) => {
            if (k.key !== key) return k;
            const base = k.expiresAt || Date.now();
            newExpiry = base + days * 86400000;
            return { ...k, expiresAt: newExpiry, status: "active" };
          }),
        }));
        get().addLog("admin_action", `Extended ${key} by ${days} days`);
        // Write to Firebase IMMEDIATELY
        if (newExpiry !== null) {
          import("./admin-firebase-sync").then(({ updateKeyInFirebase }) => {
            updateKeyInFirebase(key, { expiresAt: newExpiry, status: "active" });
          });
        }
      },

      resetDevice: (key) => {
        set((s) => ({
          keys: s.keys.map((k) => (k.key === key ? { ...k, deviceIds: [] } : k)),
        }));
        get().addLog("admin_action", `Reset device binding for key: ${key}`);
        // Write to Firebase IMMEDIATELY
        import("./admin-firebase-sync").then(({ updateKeyInFirebase }) => {
          updateKeyInFirebase(key, { deviceIds: [] });
        });
      },

      validateAllKeys: () => {
        const now = Date.now();
        const day = 86400000;
        let fixedCount = 0;
        const modifiedKeys: LicenseKey[] = [];

        set((s) => ({
          keys: s.keys.map((k) => {
            // Use a widened type so TS doesn't narrow prematurely
            let status: KeyStatus = k.status;
            let expiresAt: number | null = k.expiresAt;
            let changed = false;

            // Re-activate expired keys
            if (status === "expired") {
              status = "active";
              fixedCount++;
              changed = true;
            }
            // Re-activate suspended keys (admin's "Validate All" = force re-activate)
            if (status === "suspended") {
              status = "active";
              fixedCount++;
              changed = true;
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
              changed = true;
            }

            const updated = { ...k, status, expiresAt };
            if (changed) modifiedKeys.push(updated);
            return updated;
          }),
        }));

        // Sync ALL modified keys back to Firebase (so all admin panels see the fix).
        // Use bulk write to avoid rate limit; process in chunks of 50.
        if (modifiedKeys.length > 0) {
          import("./admin-firebase-sync").then(({ bulkWriteKeysToFirebase }) => {
            bulkWriteKeysToFirebase(modifiedKeys).then((res) => {
              console.log(`[Firebase] Validate All — synced ${res.synced}/${modifiedKeys.length} modified keys`);
            });
          });
        }

        get().addLog("admin_action", `Validated all keys — ${fixedCount} keys fixed`);
        return fixedCount;
      },

      verifyLicense: async (key, deviceId) => {
        // Step 0: Check lockout — if device is locked, reject immediately
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

        // Step 1: Clean the key — trim spaces, convert to uppercase
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
          const failState = recordFailedAttempt(cleanKey);
          const remaining = getRemainingAttempts();
          if (failState.lockedUntil) {
            return { valid: false, message: "🔒 5 wrong attempts reached. App locked for 1 hour.", locked: true } as any;
          }
          return { valid: false, message: `Key not found. ${remaining} attempt(s) remaining before 1-hour lock.` };
        }

        console.log("[License Verify] Key found:", k.key, "| Status:", k.status, "| Type:", k.type);

        // Step 4: Check status
        // Note: "used" status means the key has been activated before but is STILL VALID
        // (it just has at least one device bound). Only "suspended" and "expired" block verification.
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

        // status === "active" OR status === "used" → continue verification

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
        let verifiedKey: LicenseKey | null = null;
        if (!k.deviceIds.includes(deviceId)) {
          set((s) => ({
            keys: s.keys.map((x) => {
              if (x.key !== k.key) return x;
              verifiedKey = {
                ...x,
                deviceIds: [...x.deviceIds, deviceId],
                lastVerified: Date.now(),
                verifications: x.verifications + 1,
                status: "used" as KeyStatus,
              };
              return verifiedKey;
            }),
          }));
          console.log("[License Verify] Device bound successfully. New device count:", k.deviceIds.length + 1);
        } else {
          set((s) => ({
            keys: s.keys.map((x) => {
              if (x.key !== k.key) return x;
              verifiedKey = {
                ...x,
                lastVerified: Date.now(),
                verifications: x.verifications + 1,
              };
              return verifiedKey;
            }),
          }));
          console.log("[License Verify] Device already bound. Verification count:", k.verifications + 1);
        }

        // Sync verification back to Firebase so all admin panels stay in sync.
        if (verifiedKey) {
          import("./admin-firebase-sync").then(({ updateKeyInFirebase }) => {
            updateKeyInFirebase(verifiedKey!.key, {
              deviceIds: verifiedKey!.deviceIds,
              lastVerified: verifiedKey!.lastVerified,
              verifications: verifiedKey!.verifications,
              status: verifiedKey!.status,
            });
          });
        }

        get().addLog("key_verification", `Key ${cleanKey} verified on ${deviceId} | Type: ${k.type} | Status: ${k.status}`);
        console.log("[License Verify] ✅ SUCCESS: License verified, type:", k.type);
        // Clear lockout on successful verification
        clearLockout();
        return { valid: true, message: "✅ License Key Verified Successfully", keyType: k.type };
      },

      unbindDevice: (deviceId) => {
        const affectedKeys: string[] = [];
        set((s) => ({
          devices: s.devices.filter((d) => d.deviceId !== deviceId),
          keys: s.keys.map((k) => {
            if (k.deviceIds.includes(deviceId)) {
              affectedKeys.push(k.key);
              return { ...k, deviceIds: k.deviceIds.filter((id) => id !== deviceId) };
            }
            return k;
          }),
        }));
        get().addLog("admin_action", `Unbound device: ${deviceId}`);
        // Sync affected keys + delete device doc to Firebase
        import("./admin-firebase-sync").then(({ updateKeyInFirebase }) => {
          for (const keyStr of affectedKeys) {
            updateKeyInFirebase(keyStr, { deviceIds: get().keys.find((k) => k.key === keyStr)?.deviceIds || [] });
          }
        });
      },

      forceLogout: (deviceId) => {
        set((s) => ({
          devices: s.devices.map((d) =>
            d.deviceId === deviceId ? { ...d, lastLogin: 0 } : d
          ),
        }));
        get().addLog("admin_action", `Force logout: ${deviceId}`);
        // Sync device to Firebase
        const device = get().devices.find((d) => d.deviceId === deviceId);
        if (device) {
          import("./admin-firebase-sync").then(({ writeDeviceToFirebase }) => {
            writeDeviceToFirebase(device);
          });
        }
      },

      banDevice: (deviceId) => {
        set((s) => ({
          devices: s.devices.map((d) =>
            d.deviceId === deviceId ? { ...d, status: "banned" } : d
          ),
        }));
        get().addLog("admin_action", `Banned device: ${deviceId}`);
        // Sync to Firebase
        const device = get().devices.find((d) => d.deviceId === deviceId);
        if (device) {
          import("./admin-firebase-sync").then(({ writeDeviceToFirebase }) => {
            writeDeviceToFirebase(device);
          });
        }
      },

      allowDevice: (deviceId) => {
        set((s) => ({
          devices: s.devices.map((d) =>
            d.deviceId === deviceId ? { ...d, status: "allowed" } : d
          ),
        }));
        get().addLog("admin_action", `Allowed device: ${deviceId}`);
        // Sync to Firebase
        const device = get().devices.find((d) => d.deviceId === deviceId);
        if (device) {
          import("./admin-firebase-sync").then(({ writeDeviceToFirebase }) => {
            writeDeviceToFirebase(device);
          });
        }
      },

      banUser: (id) => {
        set((s) => ({
          users: s.users.map((u) => (u.id === id ? { ...u, banned: true } : u)),
        }));
        get().addLog("admin_action", `Banned user: ${id}`);
        // Sync to Firebase
        const user = get().users.find((u) => u.id === id);
        if (user) {
          import("./admin-firebase-sync").then(({ writeUserToFirebase }) => {
            writeUserToFirebase(user);
          });
        }
      },

      unbanUser: (id) => {
        set((s) => ({
          users: s.users.map((u) => (u.id === id ? { ...u, banned: false } : u)),
        }));
        get().addLog("admin_action", `Unbanned user: ${id}`);
        // Sync to Firebase
        const user = get().users.find((u) => u.id === id);
        if (user) {
          import("./admin-firebase-sync").then(({ writeUserToFirebase }) => {
            writeUserToFirebase(user);
          });
        }
      },

      deleteUser: (id) => {
        set((s) => ({ users: s.users.filter((u) => u.id !== id) }));
        get().addLog("admin_action", `Deleted user: ${id}`);
        // Delete from Firebase
        import("./firebase").then(({ db }) => {
          if (!db) return;
          import("firebase/firestore").then(({ doc, deleteDoc }) => {
            deleteDoc(doc(db as any, "users", id)).catch((err: unknown) =>
              console.error("[Firebase] deleteUser failed:", err)
            );
          });
        });
      },

      resetUserLicense: (id) => {
        set((s) => ({
          users: s.users.map((u) => (u.id === id ? { ...u, license: undefined } : u)),
        }));
        get().addLog("admin_action", `Reset license for user: ${id}`);
        // Sync to Firebase
        const user = get().users.find((u) => u.id === id);
        if (user) {
          import("./admin-firebase-sync").then(({ writeUserToFirebase }) => {
            writeUserToFirebase(user);
          });
        }
      },

      updateSettings: (partial) => {
        set((s) => ({ settings: { ...s.settings, ...partial } }));
        get().addLog("admin_action", "Settings updated");
        // Persist to Firebase (admin_config/settings doc)
        import("./admin-firebase-sync").then(({ writeSettingsToFirebase }) => {
          writeSettingsToFirebase(get().settings);
        });
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
        // Persist updated settings to Firebase
        import("./admin-firebase-sync").then(({ writeSettingsToFirebase }) => {
          writeSettingsToFirebase(get().settings);
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
        // Write log to Firebase (admin_logs collection) — only for admin actions
        // and key verifications (skip noise like every team_generation).
        if (type === "admin_action" || type === "key_verification" || type === "error") {
          import("./admin-firebase-sync").then(({ writeLogToFirebase }) => {
            writeLogToFirebase(log);
          });
        }
      },

      clearLogs: () => {
        set({ logs: [] });
        // Note: We do NOT delete admin_logs collection from Firebase — logs are
        // append-only audit history. Clearing locally just hides them from view.
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
 * Firebase is the SINGLE SOURCE OF TRUTH. On first window load:
 *   1. syncFromFirebase()  — fetch all keys/devices/users/logs/settings
 *                            from Firestore and populate the in-memory
 *                            store. If Firebase is empty, seed the
 *                            500+ initial keys UP to Firebase.
 *   2. subscribeToFirebase() — attach real-time onSnapshot listeners so
 *                            that any change made on ANY admin device
 *                            immediately propagates here.
 *
 * NO localStorage is used for admin data. The in-memory store acts as a
 * short-lived cache populated from Firebase. The user-facing license
 * state (LICENSE_STORAGE_KEY) is NOT admin data and stays in localStorage.
 * ----------------------------------------------------------------- */
if (typeof window !== "undefined") {
  // Run on the next tick so the store is fully initialized first.
  setTimeout(() => {
    // 1. One-shot sync — populate from Firebase
    useAdmin.getState().syncFromFirebase().then((ok) => {
      if (ok) {
        console.log("[Admin Store] Initial sync from Firebase complete");
      } else {
        console.warn("[Admin Store] Initial sync from Firebase failed — using in-memory seed");
      }
    });

    // 2. Real-time listeners — keep in-memory state in sync with Firebase
    useAdmin.getState().subscribeToFirebase();
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
