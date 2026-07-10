/**
 * Multi-Account Fantasy Platform Support
 * ======================================
 *
 * Supports up to 5 accounts per fantasy platform:
 *   - Dream11: 5 accounts
 *   - My11Circle: 5 accounts
 *   - Jumbo: 5 accounts
 *   - MyTeam11: 5 accounts
 *   - Vision11: 5 accounts
 *
 * Storage format (backward-compatible with old single-account format):
 *   {
 *     "dream11": [
 *       { id, label, token, mobile, ..., isDefault: true },
 *       { id, label, token, mobile, ..., isDefault: false },
 *       ...up to 5 accounts
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

export interface FantasyAccount {
  /** Unique ID: `${app}_${timestamp}_${random}` — used to reference this account */
  id: string;
  app: FantasyApp;
  /** User-friendly label, e.g. "Dream11 #1", "My11Circle #2" */
  label: string;
  token: string;
  mobile?: string | null;
  my11circleChallenge?: string | null;
  my11circleUserId?: string | null;
  /** Dream11 only: max teams per match based on subscription tier */
  maxAllowedTeam?: number | null;
  /** Dream11 only: subscription tier label */
  subscriptionTier?: string | null;
  /** Timestamp when account was linked */
  linkedAt: number;
  /** Timestamp when token was last refreshed */
  lastRefreshed: number;
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
    my11circleChallenge?: string;
    my11circleUserId?: string;
    maxAllowedTeam?: number | null;
    subscriptionTier?: string | null;
    label?: string;
  }
): FantasyAccount | null {
  if (typeof window === "undefined") return null;
  const all = readAllAccounts();
  const accounts = all[app] || [];

  if (accounts.length >= MAX_ACCOUNTS_PER_APP) {
    console.warn(`[multi-accounts] Max ${MAX_ACCOUNTS_PER_APP} accounts reached for ${app}`);
    return null;
  }

  const accountNum = accounts.length + 1;
  const newAccount: FantasyAccount = {
    id: generateAccountId(app),
    app,
    label: extras?.label || getDefaultLabel(app, accountNum),
    token,
    mobile: extras?.mobile || null,
    my11circleChallenge: extras?.my11circleChallenge || null,
    my11circleUserId: extras?.my11circleUserId || null,
    maxAllowedTeam: extras?.maxAllowedTeam ?? null,
    subscriptionTier: extras?.subscriptionTier || null,
    linkedAt: Date.now(),
    lastRefreshed: Date.now(),
    isDefault: accounts.length === 0, // first account becomes default
  };

  all[app] = [...accounts, newAccount];
  writeAllAccounts(all);
  console.log(`[multi-accounts] Added ${app} account #${accountNum} (${newAccount.id})`);
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

/** Check if user can add more accounts for a platform */
export function canAddMoreAccounts(app: FantasyApp): boolean {
  return countAccountsForApp(app) < MAX_ACCOUNTS_PER_APP;
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
