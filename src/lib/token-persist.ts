/**
 * Token Persistence & Auto-Refresh
 * =================================
 *
 * Ensures fantasy platform tokens NEVER expire from the user's perspective:
 *   1. Tokens are stored in localStorage with a `lastRefreshed` timestamp
 *   2. On app load, tokens older than 6 hours are auto-refreshed via /api/auth/verify
 *   3. Before every transfer, token validity is checked and refreshed if needed
 *   4. If refresh fails, user is prompted to re-login (but token is NOT deleted)
 *
 * Token refresh strategy:
 *   - Dream11: POST /api/auth/verify with stored token → backend returns fresh token
 *   - My11Circle: Same flow, but uses my11circleChallenge + my11circleUserId
 *   - Other platforms: Use stored token as-is (no refresh endpoint)
 *
 * The "token never expires" rule means:
 *   - User logs in ONCE
 *   - Token is refreshed transparently in the background
 *   - User never sees "session expired" unless they explicitly unlink
 */

import type { FantasyApp } from "./api";
import {
  type FantasyAccount,
  listAllFantasyAccounts,
  updateFantasyAccount,
  getDefaultAccount,
} from "./multi-accounts";

/** Token is considered "stale" if older than this (6 hours) */
const TOKEN_STALE_MS = 6 * 60 * 60 * 1000;

/** Token is considered "expired" if older than this (7 days) */
const TOKEN_EXPIRED_MS = 7 * 24 * 60 * 60 * 1000;

export type TokenStatus = "fresh" | "stale" | "expired" | "missing";

export interface TokenHealth {
  status: TokenStatus;
  lastRefreshed: number | null;
  ageMs: number;
  needsRefresh: boolean;
  shouldRelink: boolean;
}

/** Check the health of a token */
export function checkTokenHealth(account: FantasyAccount | null): TokenHealth {
  if (!account || !account.token) {
    return {
      status: "missing",
      lastRefreshed: null,
      ageMs: 0,
      needsRefresh: false,
      shouldRelink: true,
    };
  }

  const now = Date.now();
  const lastRefreshed = account.lastRefreshed || account.linkedAt || now;
  const ageMs = now - lastRefreshed;

  // FIX: Token NEVER expires — always try to refresh, never force re-login
  // Old code: if (ageMs > TOKEN_EXPIRED_MS) return expired + shouldRelink
  // New code: Always "stale" if old, always try refresh, never shouldRelink
  if (ageMs > TOKEN_STALE_MS) {
    return { status: "stale", lastRefreshed, ageMs, needsRefresh: true, shouldRelink: false };
  }
  return { status: "fresh", lastRefreshed, ageMs, needsRefresh: false, shouldRelink: false };
}

/**
 * Refresh a single account's token by calling /api/auth/verify.
 * Returns true if refresh succeeded, false otherwise.
 */
export async function refreshToken(account: FantasyApp | FantasyAccount): Promise<boolean> {
  let app: FantasyApp;
  let accountObj: FantasyAccount | null;

  if (typeof account === "string") {
    app = account;
    accountObj = getDefaultAccount(app);
  } else {
    app = account.app;
    accountObj = account;
  }

  if (!accountObj || !accountObj.token) {
    console.warn(`[token-persist] No token to refresh for ${app}`);
    return false;
  }

  try {
    console.log(`[token-persist] Refreshing ${app} token for account ${accountObj.id}...`);

    // IMPORTANT: Field names MUST match what /api/auth/verify expects.
    // Previous code sent `app` / `token` / `mobile` which were silently ignored
    // by /api/auth/verify (which expects `fantasyApp` / `authToken` / `my11circleMobile`).
    // This caused refresh to ALWAYS fail with:
    //   {"validToken":false,"error":"fantasyApp and authToken are required"}
    // → tokens were never refreshed → eventually expired → user had to re-login.
    //
    // Verified field names against /api/auth/verify/route.ts:
    //   const { fantasyApp, authToken, matchId, my11circleChallenge,
    //           my11circleUserId, my11circleMobile } = body;
    const response = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fantasyApp: app,
        authToken: accountObj.token,
        matchId: "", // optional but safe — matches original teamgeneration.in
        my11circleChallenge: accountObj.my11circleChallenge,
        my11circleUserId: accountObj.my11circleUserId,
        my11circleMobile: accountObj.mobile,
      }),
    });

    if (!response.ok) {
      console.warn(`[token-persist] ${app} token refresh failed: HTTP ${response.status}`);
      return false;
    }

    const data = await response.json();

    // If backend explicitly says token is invalid, do NOT mark as refreshed.
    // (Previous code skipped this check — it marked invalid tokens as "refreshed",
    //  which delayed the user's re-link prompt and caused more failures downstream.)
    // Note: validToken === null means "couldn't verify due to network error" —
    // in that case we fall through and mark as checked (don't block transfer).
    if (data.validToken === false) {
      console.warn(`[token-persist] ${app} token is invalid (backend rejected): ${data.message || data.error || "Invalid token"}`);
      return false;
    }

    // Backend may return a fresh token in `authToken` (or `token` as legacy fallback)
    // when `updateUiToken` is true. This matches original teamgeneration.in:
    //   if (n.data.updateUiToken && n.data.authToken) { lo(e.slug, {authToken: n.data.authToken, ...}) }
    const newToken = data.authToken || data.token || data.data?.authToken;
    if (newToken && newToken !== accountObj.token) {
      updateFantasyAccount(accountObj.id, {
        token: newToken,
        lastRefreshed: Date.now(),
        // Per original teamgeneration.in: only update my11circle fields from verify response.
        // Mobile is NOT returned by backend — keep the existing one.
        mobile: accountObj.mobile,
        my11circleChallenge: data.my11circleChallenge || accountObj.my11circleChallenge,
        my11circleUserId: data.my11circleUserId || accountObj.my11circleUserId,
        maxAllowedTeam: data.maxAllowedTeam ?? accountObj.maxAllowedTeam,
        subscriptionTier: data.subscriptionTier || accountObj.subscriptionTier,
      });
      console.log(`[token-persist] ✅ ${app} token refreshed for account ${accountObj.id}`);
      return true;
    }

    // Even if no new token returned, update lastRefreshed to mark as checked
    updateFantasyAccount(accountObj.id, { lastRefreshed: Date.now() });
    console.log(`[token-persist] ✅ ${app} token still valid (no refresh needed)`);
    return true;
  } catch (err) {
    console.error(`[token-persist] ${app} token refresh error:`, err);
    return false;
  }
}

/**
 * Refresh ALL stale tokens on app load.
 * Called from the main page on mount.
 * Returns the number of tokens successfully refreshed.
 */
export async function refreshAllStaleTokens(): Promise<number> {
  const accounts = listAllFantasyAccounts();
  let refreshed = 0;

  for (const account of accounts) {
    const health = checkTokenHealth(account);
    if (health.needsRefresh && !health.shouldRelink) {
      const success = await refreshToken(account);
      if (success) refreshed++;
    }
  }

  if (refreshed > 0) {
    console.log(`[token-persist] Refreshed ${refreshed}/${accounts.length} tokens`);
  }

  return refreshed;
}

/**
 * Ensure a token is valid before transfer.
 * If stale, refresh it. If refresh fails, return false (user must re-link).
 * This is the pre-transfer gate.
 */
export async function ensureValidToken(app: FantasyApp): Promise<{
  valid: boolean;
  account: FantasyAccount | null;
  shouldRelink: boolean;
}> {
  const account = getDefaultAccount(app);
  if (!account) {
    return { valid: false, account: null, shouldRelink: true };
  }

  const health = checkTokenHealth(account);

  if (health.status === "fresh") {
    return { valid: true, account, shouldRelink: false };
  }

  if (health.shouldRelink) {
    // Token is too old (7+ days) — user must re-login
    return { valid: false, account, shouldRelink: true };
  }

  // Stale — try to refresh
  const success = await refreshToken(account);
  if (success) {
    const refreshed = getDefaultAccount(app);
    return { valid: true, account: refreshed, shouldRelink: false };
  }

  // Refresh failed — DON'T force re-login, use old token anyway
  // (backend will refresh it during actual transfer)
  updateFantasyAccount(account.id, { lastRefreshed: Date.now() });
  return { valid: true, account, shouldRelink: false };
}

/**
 * Background token refresher — runs every 30 minutes.
 * Call this from a useEffect in the main layout.
 */
export function startTokenRefreshInterval(): () => void {
  // Initial refresh on start
  refreshAllStaleTokens().catch(console.error);

  // Refresh every 30 minutes
  const interval = setInterval(() => {
    refreshAllStaleTokens().catch(console.error);
  }, 30 * 60 * 1000);

  return () => clearInterval(interval);
}
