/**
 * Per-Account Session Cache
 * ==========================
 *
 * Per user spec: "Keep separate token, JWT, cookies, userId and cache for each
 * linked account. Refresh expired tokens automatically and fetch real Dream11
 * data for the selected account before enabling Join Contest or Transfer."
 *
 * This module provides a per-account IN-MEMORY cache so that:
 *   1. Switching the active account doesn't leak data from another account.
 *   2. Repeated API calls (My Teams, Joined Contests, Contest List) within
 *      a short window don't all hit the backend — they use the cache.
 *   3. Token refresh writes back to the SPECIFIC account that needed refresh,
 *      not the default account (which was the bug before).
 *
 * Cache key shape:
 *   `${accountId}::${scope}::${matchId}`
 *
 *   - accountId: from multi-accounts FantasyAccount.id (unique per account)
 *   - scope:     "my-teams" | "joined-contests" | "contest-list" | "verify"
 *   - matchId:   the fantasy match ID (or "*" if not match-scoped)
 *
 * Cache entry:
 *   { value: T, expiresAt: number, promise: Promise<T> | null }
 *
 * The `promise` field lets concurrent callers await the same in-flight fetch
 * (deduplication) so we don't fire 3 simultaneous calls to the backend for
 * the same thing.
 */

export type CacheScope =
  | "my-teams"
  | "joined-contests"
  | "contest-list"
  | "verify"
  | "free-contests";

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  /** If a fetch is in-flight, this is its promise. Other callers await it. */
  promise: Promise<T> | null;
  /** When this entry was populated (for debugging). */
  fetchedAt: number;
}

// Default TTLs per scope (ms). Tuned to be short enough to reflect user
// actions on the platform (creating teams, joining contests) but long enough
// to dedupe rapid back-to-back calls.
const DEFAULT_TTL_MS: Record<CacheScope, number> = {
  "my-teams": 15_000,         // 15s — My Teams list changes when user creates a team
  "joined-contests": 30_000,  // 30s — Joined contests change less often
  "contest-list": 60_000,     // 60s — Contest list is mostly static per match
  "verify": 60_000,           // 60s — Token verify status doesn't change every second
  "free-contests": 30_000,    // 30s — Free contest list
};

// In-memory cache. Module-level — survives across components but NOT across
// full page reloads (which is what we want; reload = fresh state).
const cache = new Map<string, CacheEntry<unknown>>();

/**
 * Build a cache key for the given account + scope + matchId.
 * The key includes the accountId so Account #1's cache NEVER collides with
 * Account #2's cache — even if they're for the same match.
 */
export function buildCacheKey(
  accountId: string,
  scope: CacheScope,
  matchId: string | number | null | undefined
): string {
  const m = matchId != null ? String(matchId) : "*";
  return `${accountId}::${scope}::${m}`;
}

/**
 * Read a cache entry. Returns undefined if not present OR expired.
 */
export function readCache<T>(
  accountId: string,
  scope: CacheScope,
  matchId: string | number | null | undefined
): T | undefined {
  const key = buildCacheKey(accountId, scope, matchId);
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

/**
 * Read the in-flight promise for a cache entry (if a fetch is currently running).
 * Lets concurrent callers await the same fetch instead of firing a duplicate.
 */
export function readInFlightPromise<T>(
  accountId: string,
  scope: CacheScope,
  matchId: string | number | null | undefined
): Promise<T> | null {
  const key = buildCacheKey(accountId, scope, matchId);
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  return entry.promise as Promise<T> | null;
}

/**
 * Write a value to the cache with the default TTL for this scope
 * (or a custom TTL if provided).
 */
export function writeCache<T>(
  accountId: string,
  scope: CacheScope,
  matchId: string | number | null | undefined,
  value: T,
  ttlMs?: number
): void {
  const key = buildCacheKey(accountId, scope, matchId);
  const ttl = ttlMs ?? DEFAULT_TTL_MS[scope];
  const entry: CacheEntry<T> = {
    value,
    expiresAt: Date.now() + ttl,
    promise: null,
    fetchedAt: Date.now(),
  };
  cache.set(key, entry as unknown as CacheEntry<unknown>);
}

/**
 * Mark a cache entry as having an in-flight fetch. Other callers can await
 * the same promise.
 */
export function setInFlightPromise<T>(
  accountId: string,
  scope: CacheScope,
  matchId: string | number | null | undefined,
  promise: Promise<T>
): void {
  const key = buildCacheKey(accountId, scope, matchId);
  const existing = cache.get(key) as CacheEntry<T> | undefined;
  if (existing) {
    existing.promise = promise;
  } else {
    // Create a placeholder entry — value will be filled in when promise resolves
    const entry: CacheEntry<T> = {
      value: undefined as unknown as T,
      expiresAt: Date.now() + DEFAULT_TTL_MS[scope],
      promise,
      fetchedAt: Date.now(),
    };
    cache.set(key, entry as unknown as CacheEntry<unknown>);
  }
}

/**
 * Clear the in-flight promise (called after the fetch completes).
 */
export function clearInFlightPromise(
  accountId: string,
  scope: CacheScope,
  matchId: string | number | null | undefined
): void {
  const key = buildCacheKey(accountId, scope, matchId);
  const entry = cache.get(key);
  if (entry) {
    entry.promise = null;
  }
}

/**
 * Invalidate cache for a specific account + scope + matchId.
 * Use this after a transfer/join operation to force a fresh fetch next time.
 */
export function invalidateCache(
  accountId: string,
  scope?: CacheScope,
  matchId?: string | number | null
): void {
  const prefix = scope
    ? matchId != null
      ? `${accountId}::${scope}::${String(matchId)}`
      : `${accountId}::${scope}::`
    : `${accountId}::`;

  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

/**
 * Invalidate ALL cache entries for a specific account.
 * Use this when the user switches the active account or when an account's
 * token is refreshed.
 */
export function invalidateAccountCache(accountId: string): void {
  const prefix = `${accountId}::`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

/**
 * Invalidate cache for ALL accounts (e.g. on logout).
 */
export function clearAllCache(): void {
  cache.clear();
}

/**
 * High-level helper: get-or-fetch with deduplication.
 *
 * - If cache has a fresh value → return it.
 * - If a fetch is in-flight → await the same promise.
 * - Otherwise → call `fetcher`, store the promise for dedup, store the result
 *   in cache, return it.
 *
 * On fetcher rejection: cache is NOT populated, in-flight promise is cleared,
 * and the error propagates to all awaiting callers.
 */
export async function getOrFetch<T>(
  accountId: string,
  scope: CacheScope,
  matchId: string | number | null | undefined,
  fetcher: () => Promise<T>,
  ttlMs?: number
): Promise<T> {
  // 1. Cache hit?
  const cached = readCache<T>(accountId, scope, matchId);
  if (cached !== undefined) return cached;

  // 2. In-flight?
  const inflight = readInFlightPromise<T>(accountId, scope, matchId);
  if (inflight) {
    return inflight;
  }

  // 3. Fire a fresh fetch
  const promise = fetcher();
  setInFlightPromise(accountId, scope, matchId, promise);

  try {
    const value = await promise;
    writeCache(accountId, scope, matchId, value, ttlMs);
    return value;
  } finally {
    clearInFlightPromise(accountId, scope, matchId);
  }
}

// ============================================================
// ACTIVE-ACCOUNT TRACKER
// ============================================================
//
// Per user spec: "When Account #2 is selected, every API must use Account #2's
// authentication token and user ID only. Do not reuse Account #1 token or
// cached data."
//
// We track the "active account" per platform so that legacy code which doesn't
// explicitly take an accountId can still resolve the right account. Newer code
// should pass accountId explicitly.

const activeAccountByApp = new Map<string, string>();

/**
 * Set the active account for a given platform. Call this whenever the user
 * picks an account in the UI (checkbox, radio, dropdown).
 */
export function setActiveAccount(app: string, accountId: string): void {
  activeAccountByApp.set(app, accountId);
  // Don't invalidate cache here — the cache is keyed by accountId, so
  // switching active account naturally switches cache lookups.
  console.log(`[account-session] Active account for ${app} → ${accountId}`);
}

/**
 * Get the active account ID for a platform (if any has been explicitly set).
 */
export function getActiveAccountId(app: string): string | null {
  return activeAccountByApp.get(app) || null;
}

/**
 * Clear the active account tracking for a platform (e.g. on logout).
 */
export function clearActiveAccount(app: string): void {
  activeAccountByApp.delete(app);
}
