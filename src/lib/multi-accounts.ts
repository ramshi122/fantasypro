/**
 * Multi-Account Fantasy Platform Support
 * ======================================
 *
 * Per user spec: "Dream11 3 / My11Circle 2"
 * Account limits per platform (max accounts user can link):
 *   - Dream11: 3 accounts
 *   - My11Circle: 2 accounts
 *   - Jumbo: 5 accounts
 *   - MyTeam11: 5 accounts
 *   - Vision11: 5 accounts
 *
 * Storage format (backward-compatible with old single-account format):
 *   {
 *     "dream11": [
 *       { id, label, token, mobile, ..., isDefault: true },
 *       { id, label, token, mobile, ..., isDefault: false },
 *       ...up to MAX accounts
 *     ],
 *     "my11circle": [ ... ]
 *   }
 *
 * Old format migration:
 *   - String token → converted to single-account array
 *   - Object with `token` field → converted to single-account array
 */

import type { FantasyApp } from "./api";

export const MAX_ACCOUNTS_PER_APP = 5;

/**
 * Per-platform account limits (per user spec: Dream11 3, My11Circle 2).
 * Used by addFantasyAccount() and canAddAccountForApp() to enforce limits.
 */
export const ACCOUNT_LIMITS: Record<FantasyApp, number> = {
  dream11: 3,      // Max 3 Dream11 accounts per user
  my11circle: 2,    // Max 2 My11Circle accounts per user
  jumbo: 5,
  myteam11: 5,
  vision11: 5,
};

/** Get the account limit for a specific platform. */
export function getAccountLimit(app: FantasyApp): number {
  return ACCOUNT_LIMITS[app] ?? 5;
}

/**
 * Account status — per user spec:
 *   "Show account status (Active, Expired, Logged Out, Invalid)"
 *
 * - active: token is valid and verified
 * - expired: token expired (backend rejected during verify)
 * - logged_out: user manually logged out (token cleared)
 * - invalid: token is malformed or account deleted from backend
 */
export type AccountStatus = "active" | "expired" | "logged_out" | "invalid";

export interface FantasyAccount {
  /** Unique ID: `${app}_${timestamp}_${random}` — used to reference this account */
  id: string;
  app: FantasyApp;
  /** User-friendly label, e.g. "Dream11 #1", "My11Circle #2" */
  label: string;
  token: string;
  mobile?: string | null;
  /** Backend user ID for this platform account */
  userId?: string | null;
  /** My11Circle-specific auth fields (sent to /api/fantasy/auth/verify) */
  my11circleChallenge?: string | null;
  my11circleUserId?: string | null;
  /** Refresh token (if backend supports it) */
  refreshToken?: string | null;
  /** Cookies/session data (if backend uses cookie-based auth) */
  cookies?: string | null;
  /** Dream11 only: max teams per match based on subscription tier */
  maxAllowedTeam?: number | null;
  /** Dream11 only: subscription tier label */
  subscriptionTier?: string | null;
  /** Timestamp when account was linked (login time) */
  linkedAt: number;
  /** Timestamp when token was last refreshed */
  lastRefreshed: number;
  /** Timestamp when this account was last used for transfer/join */
  lastUsed?: number;
  /** Account status — tracked per user spec */
  status: AccountStatus;
  /** Whether this is the default account for this platform */
  isDefault: boolean;
}

const LOCAL_FANTASY_ACCOUNTS_KEY = "apna-cricket-fantasy-accounts";
const OLD_LOCAL_FANTASY_TOKENS_KEY = "apna-cricket-fantasy-tokens";

/** Read all accounts (per app) from localStorage */
function readAllAccounts(): Record<string, FantasyAccount[]> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LOCAL_FANTASY_ACCOUNTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Validate structure
      if (parsed && typeof parsed === "object") {
        const result: Record<string, FantasyAccount[]> = {};
        for (const [app, accounts] of Object.entries(parsed)) {
          if (Array.isArray(accounts)) {
            result[app] = accounts as FantasyAccount[];
          }
        }
        return result;
      }
    }
    // Migrate from old format
    return migrateFromOldFormat();
  } catch {
    return {};
  }
}

/** Write all accounts to localStorage */
function writeAllAccounts(data: Record<string, FantasyAccount[]>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_FANTASY_ACCOUNTS_KEY, JSON.stringify(data));
}

/** Migrate from old single-account format to new multi-account format */
function migrateFromOldFormat(): Record<string, FantasyAccount[]> {
  if (typeof window === "undefined") return {};
  try {
    const oldRaw = localStorage.getItem(OLD_LOCAL_FANTASY_TOKENS_KEY);
    if (!oldRaw) return {};
    const old = JSON.parse(oldRaw);
    if (!old || typeof old !== "object") return {};

    const result: Record<string, FantasyAccount[]> = {};
    for (const [app, entry] of Object.entries(old)) {
      if (typeof entry === "string") {
        // Old string format: { "dream11": "token123" }
        result[app] = [{
          id: `${app}_migrated_1`,
          app: app as FantasyApp,
          label: getDefaultLabel(app as FantasyApp, 1),
          token: entry,
          mobile: null,
          my11circleChallenge: null,
          my11circleUserId: null,
          maxAllowedTeam: null,
          subscriptionTier: null,
          linkedAt: Date.now(),
          lastRefreshed: Date.now(),
          isDefault: true,
        }];
      } else if (entry && typeof entry === "object" && "token" in entry) {
        // Old object format: { "dream11": { token, mobile, ... } }
        const e = entry as any;
        result[app] = [{
          id: `${app}_migrated_1`,
          app: app as FantasyApp,
          label: getDefaultLabel(app as FantasyApp, 1),
          token: e.token,
          mobile: e.mobile || null,
          my11circleChallenge: e.my11circleChallenge || null,
          my11circleUserId: e.my11circleUserId || null,
          maxAllowedTeam: e.maxAllowedTeam ?? null,
          subscriptionTier: e.subscriptionTier || null,
          linkedAt: e.linkedAt || Date.now(),
          lastRefreshed: Date.now(),
          isDefault: true,
        }];
      }
    }
    // Save migrated data
    if (Object.keys(result).length > 0) {
      writeAllAccounts(result);
      console.log("[multi-accounts] Migrated old single-account format to multi-account");
    }
    return result;
  } catch {
    return {};
  }
}

/** Get default label for an account number on a platform */
export function getDefaultLabel(app: FantasyApp, accountNum: number): string {
  const appName = app === "dream11" ? "Dream11" :
                  app === "my11circle" ? "My11Circle" :
                  app === "jumbo" ? "Jumbo" :
                  app === "myteam11" ? "MyTeam11" :
                  app === "vision11" ? "Vision11" : app;
  return `${appName} #${accountNum}`;
}

/** Generate a unique account ID */
function generateAccountId(app: FantasyApp): string {
  return `${app}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Add a new fantasy account for a platform.
 * Returns the new account, or null if max accounts reached.
 */
export function addFantasyAccount(
  app: FantasyApp,
  token: string,
  extras?: {
    mobile?: string;
    userId?: string;
    my11circleChallenge?: string;
    my11circleUserId?: string;
    refreshToken?: string;
    cookies?: string;
    maxAllowedTeam?: number | null;
    subscriptionTier?: string | null;
    label?: string;
  }
): FantasyAccount | null {
  if (typeof window === "undefined") return null;
  const all = readAllAccounts();
  const accounts = all[app] || [];

  if (accounts.length >= getAccountLimit(app)) {
    console.warn(`[multi-accounts] Max ${getAccountLimit(app)} accounts reached for ${app}`);
    return null;
  }

  const accountNum = accounts.length + 1;
  const newAccount: FantasyAccount = {
    id: generateAccountId(app),
    app,
    label: extras?.label || getDefaultLabel(app, accountNum),
    token,
    mobile: extras?.mobile || null,
    userId: extras?.userId || null,
    my11circleChallenge: extras?.my11circleChallenge || null,
    my11circleUserId: extras?.my11circleUserId || null,
    refreshToken: extras?.refreshToken || null,
    cookies: extras?.cookies || null,
    maxAllowedTeam: extras?.maxAllowedTeam ?? null,
    subscriptionTier: extras?.subscriptionTier || null,
    linkedAt: Date.now(),
    lastRefreshed: Date.now(),
    lastUsed: undefined,
    status: "active", // new accounts start as active
    isDefault: accounts.length === 0, // first account becomes default
  };

  all[app] = [...accounts, newAccount];
  writeAllAccounts(all);
  console.log(`[multi-accounts] Added ${app} account #${accountNum} (${newAccount.id}) — mobile: ${newAccount.mobile || "unknown"}`);
  return newAccount;
}

/**
 * Update an existing fantasy account (e.g. refresh token).
 */
export function updateFantasyAccount(id: string, updates: Partial<FantasyAccount>): boolean {
  if (typeof window === "undefined") return false;
  const all = readAllAccounts();
  for (const [app, accounts] of Object.entries(all)) {
    const idx = accounts.findIndex(a => a.id === id);
    if (idx >= 0) {
      all[app][idx] = {
        ...accounts[idx],
        ...updates,
        lastRefreshed: Date.now(),
      };
      writeAllAccounts(all);
      return true;
    }
  }
  return false;
}

/**
 * Remove a specific fantasy account by ID.
 * If the default account is removed, the first remaining account becomes default.
 */
export function removeFantasyAccount(id: string): boolean {
  if (typeof window === "undefined") return false;
  const all = readAllAccounts();
  for (const [app, accounts] of Object.entries(all)) {
    const idx = accounts.findIndex(a => a.id === id);
    if (idx >= 0) {
      const wasDefault = accounts[idx].isDefault;
      all[app].splice(idx, 1);
      // If removed account was default, make first remaining account default
      if (wasDefault && all[app].length > 0) {
        all[app][0].isDefault = true;
      }
      writeAllAccounts(all);
      console.log(`[multi-accounts] Removed account ${id}`);
      return true;
    }
  }
  return false;
}

/** Get a specific account by ID */
export function getFantasyAccount(id: string): FantasyAccount | null {
  if (typeof window === "undefined") return null;
  const all = readAllAccounts();
  for (const accounts of Object.values(all)) {
    const account = accounts.find(a => a.id === id);
    if (account) return account;
  }
  return null;
}

/** List all accounts for a specific platform */
export function listAccountsForApp(app: FantasyApp): FantasyAccount[] {
  if (typeof window === "undefined") return [];
  const all = readAllAccounts();
  return all[app] || [];
}

/** List ALL accounts across all platforms */
export function listAllFantasyAccounts(): FantasyAccount[] {
  if (typeof window === "undefined") return [];
  const all = readAllAccounts();
  const result: FantasyAccount[] = [];
  for (const accounts of Object.values(all)) {
    result.push(...accounts);
  }
  return result;
}

/** Get the default account for a platform */
export function getDefaultAccount(app: FantasyApp): FantasyAccount | null {
  if (typeof window === "undefined") return null;
  const all = readAllAccounts();
  const accounts = all[app] || [];
  if (accounts.length === 0) return null;
  return accounts.find(a => a.isDefault) || accounts[0];
}

/** Set a specific account as the default for its platform */
export function setDefaultAccount(id: string): boolean {
  if (typeof window === "undefined") return false;
  const all = readAllAccounts();
  for (const [app, accounts] of Object.entries(all)) {
    const account = accounts.find(a => a.id === id);
    if (account) {
      all[app] = accounts.map(a => ({ ...a, isDefault: a.id === id }));
      writeAllAccounts(all);
      console.log(`[multi-accounts] Set ${id} as default for ${app}`);
      return true;
    }
  }
  return false;
}

/** Get the default account's token (backward compat) */
export function getDefaultToken(app: FantasyApp): string | null {
  const account = getDefaultAccount(app);
  return account?.token || null;
}

/** Count accounts for a platform */
export function countAccountsForApp(app: FantasyApp): number {
  return listAccountsForApp(app).length;
}

/** Check if user can add more accounts for a platform (per-platform limit) */
export function canAddMoreAccounts(app: FantasyApp): boolean {
  return countAccountsForApp(app) < getAccountLimit(app);
}

/**
 * Bulk transfer: get all accounts for a platform that have valid tokens.
 * Used when transferring teams to multiple accounts simultaneously.
 */
export function getActiveAccountsForApp(app: FantasyApp): FantasyAccount[] {
  return listAccountsForApp(app).filter(a => a.token && a.token.length > 0);
}

/** Refresh token for an account (updates lastRefreshed timestamp) */
export function refreshAccountToken(id: string, newToken: string): boolean {
  return updateFantasyAccount(id, { token: newToken, lastRefreshed: Date.now() });
}

/** Export accounts (without tokens) for backup */
export function exportAccounts(): Array<Omit<FantasyAccount, "token">> {
  return listAllFantasyAccounts().map(({ token, ...rest }) => rest);
}

// ============================================================
// STATUS MANAGEMENT — per user spec:
//   "Show account status (Active, Expired, Logged Out, Invalid)"
//   "Automatic session recovery after app restart"
// ============================================================

/** Mark an account's status (active/expired/logged_out/invalid) */
export function setAccountStatus(id: string, status: AccountStatus): boolean {
  return updateFantasyAccount(id, { status, lastRefreshed: Date.now() });
}

/** Mark an account as expired (called when backend rejects token) */
export function markAccountExpired(id: string): boolean {
  return setAccountStatus(id, "expired");
}

/** Mark an account as logged out (called when user manually logs out) */
export function markAccountLoggedOut(id: string): boolean {
  return setAccountStatus(id, "logged_out");
}

/** Mark an account as active (called after successful verify) */
export function markAccountActive(id: string): boolean {
  return setAccountStatus(id, "active");
}

/** Mark an account as invalid (called when token is malformed) */
export function markAccountInvalid(id: string): boolean {
  return setAccountStatus(id, "invalid");
}

/** Update lastUsed timestamp (called when account is used for transfer/join) */
export function markAccountUsed(id: string): boolean {
  return updateFantasyAccount(id, { lastUsed: Date.now() });
}

/** Get account status with color/label for UI display */
export function getAccountStatusDisplay(status: AccountStatus): {
  label: string;
  color: string;
  emoji: string;
} {
  switch (status) {
    case "active": return { label: "Active", color: "text-emerald-600 dark:text-emerald-400", emoji: "🟢" };
    case "expired": return { label: "Expired", color: "text-amber-600 dark:text-amber-400", emoji: "🟡" };
    case "logged_out": return { label: "Logged Out", color: "text-slate-500 dark:text-slate-400", emoji: "⚪" };
    case "invalid": return { label: "Invalid", color: "text-red-600 dark:text-red-400", emoji: "🔴" };
    default: return { label: "Unknown", color: "text-slate-500", emoji: "❓" };
  }
}

/**
 * Remove a single account by ID (per user spec: "Allow Remove Account").
 * If removing the default account, the next account becomes default.
 */
export function removeFantasyAccountById(id: string): boolean {
  if (typeof window === "undefined") return false;
  const all = readAllAccounts();
  for (const [app, accounts] of Object.entries(all)) {
    const idx = accounts.findIndex(a => a.id === id);
    if (idx >= 0) {
      const wasDefault = accounts[idx].isDefault;
      const remaining = accounts.filter(a => a.id !== id);
      // If we removed the default, make the first remaining account default
      if (wasDefault && remaining.length > 0) {
        remaining[0] = { ...remaining[0], isDefault: true };
      }
      all[app] = remaining;
      writeAllAccounts(all);
      console.log(`[multi-accounts] Removed account ${id} from ${app}`);
      return true;
    }
  }
  return false;
}

/**
 * Re-login for one account only (per user spec: "Allow Re-login for one account only").
 * Clears the token + marks as logged_out, so user can re-link via OTP.
 * Does NOT affect other accounts.
 */
export function logoutSingleAccount(id: string): boolean {
  return updateFantasyAccount(id, {
    token: "",
    status: "logged_out",
    lastRefreshed: Date.now(),
  });
}

/**
 * Get accounts by IDs (for Select All / multi-select transfer).
 * Returns accounts in the order they were stored.
 */
export function getAccountsByIds(app: FantasyApp, ids: string[]): FantasyAccount[] {
  const accounts = listAccountsForApp(app);
  return accounts.filter(a => ids.includes(a.id));
}

/**
 * Get all active (non-expired, non-logged-out) accounts for a platform.
 * Per user spec: "Restore all accounts after refresh or app restart"
 */
export function getUsableAccountsForApp(app: FantasyApp): FantasyAccount[] {
  return listAccountsForApp(app).filter(a =>
    a.token && a.token.length > 0 && a.status !== "logged_out" && a.status !== "invalid"
  );
}

/**
 * Migrate old accounts (that don't have `status` field) to new format.
 * Called on app load to ensure all accounts have the status field.
 */
export function migrateAccountStatuses(): number {
  if (typeof window === "undefined") return 0;
  const all = readAllAccounts();
  let migrated = 0;
  for (const [app, accounts] of Object.entries(all)) {
    for (let i = 0; i < accounts.length; i++) {
      if (!accounts[i].status) {
        all[app][i].status = accounts[i].token ? "active" : "logged_out";
        if (!accounts[i].lastRefreshed) {
          all[app][i].lastRefreshed = accounts[i].linkedAt || Date.now();
        }
        migrated++;
      }
    }
  }
  if (migrated > 0) {
    writeAllAccounts(all);
    console.log(`[multi-accounts] Migrated ${migrated} accounts to new status format`);
  }
  return migrated;
}
