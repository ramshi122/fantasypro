/**
 * API Logger — Log all API calls for admin visibility
 * ===================================================
 * localStorage "apna-cricket-api-logs" (last 100 entries).
 * Use logAPICall() from any client-side fetch wrapper.
 */

export interface APILogEntry {
  id: string;
  timestamp: number;
  endpoint: string;
  method: string;
  params?: Record<string, unknown>;
  status: number | "error";
  durationMs?: number;
  error?: string;
}

const KEY = "apna-cricket-api-logs";
const MAX_ENTRIES = 100;

function isBrowser(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

/**
 * Log an API call.
 */
export function logAPICall(
  endpoint: string,
  params: Record<string, unknown> | undefined,
  status: number | "error",
  durationMs?: number,
  method: string = "GET",
  error?: string
): void {
  if (!isBrowser()) return;
  try {
    const logs = readLogs();
    logs.push({
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      endpoint,
      method,
      params,
      status,
      durationMs,
      error,
    });
    // Keep last MAX_ENTRIES
    if (logs.length > MAX_ENTRIES) {
      logs.splice(0, logs.length - MAX_ENTRIES);
    }
    localStorage.setItem(KEY, JSON.stringify(logs));
  } catch {
    /* ignore */
  }
}

/**
 * Read all stored API logs (newest first).
 */
export function readLogs(): APILogEntry[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * Get all stored API logs (newest first).
 */
export function getAPILogs(): APILogEntry[] {
  return readLogs().slice().reverse();
}

/**
 * Clear all logs.
 */
export function clearAPILogs(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(KEY);
}

/**
 * Wrap a fetch call with automatic logging.
 *
 * Usage:  const res = await loggedFetch("/api/payment", { method: "POST", body: ... });
 */
export async function loggedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const start = Date.now();
  const endpoint = typeof input === "string" ? input : (input as URL).toString();
  const method = init?.method || "GET";
  let params: Record<string, unknown> | undefined;
  try {
    if (init?.body && typeof init.body === "string") {
      params = JSON.parse(init.body);
    }
  } catch {
    /* ignore */
  }
  try {
    const res = await fetch(input, init);
    logAPICall(endpoint, params, res.status, Date.now() - start, method);
    return res;
  } catch (err: any) {
    logAPICall(endpoint, params, "error", Date.now() - start, method, err?.message);
    throw err;
  }
}

/**
 * Get summary stats for the admin Logs tab.
 */
export function getAPILogStats(): {
  total: number;
  errors: number;
  successRate: number;
  avgDurationMs: number;
  byEndpoint: Record<string, number>;
} {
  const logs = readLogs();
  const errors = logs.filter((l) => l.status === "error" || (typeof l.status === "number" && l.status >= 400)).length;
  const success = logs.length - errors;
  const durations = logs.map((l) => l.durationMs || 0).filter((d) => d > 0);
  const avgDurationMs = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const byEndpoint: Record<string, number> = {};
  for (const l of logs) {
    byEndpoint[l.endpoint] = (byEndpoint[l.endpoint] || 0) + 1;
  }
  return {
    total: logs.length,
    errors,
    successRate: logs.length ? (success / logs.length) * 100 : 100,
    avgDurationMs,
    byEndpoint,
  };
}
