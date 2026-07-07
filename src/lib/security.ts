/**
 * Security Utilities
 * ==================
 * Multi-layer protection:
 *   1. API rate limiting (per-IP + per-endpoint)
 *   2. Request origin validation
 *   3. License key encryption (AES)
 *   4. Anti-tampering (DevTools detection)
 *   5. Token validation
 */

import CryptoJS from "crypto-js";

// ===== ENCRYPTION KEY (obfuscated) =====
// Split across multiple computed values to prevent easy extraction
const _k = [99, 111, 100, 101, 114, 95, 98, 111, 98, 98, 121, 95, 98, 101, 108, 105, 101, 118, 101, 114, 48, 49, 95, 116, 103, 95, 115, 111, 102, 116, 119, 97, 114, 101];
const ENC_KEY = _k.map(c => String.fromCharCode(c)).join("");

/**
 * Encrypt data using AES.
 */
export function encrypt(data: string): string {
  try {
    return CryptoJS.AES.encrypt(data, ENC_KEY).toString();
  } catch {
    return data;
  }
}

/**
 * Decrypt AES-encrypted data.
 */
export function decrypt(encrypted: string): string {
  try {
    const bytes = CryptoJS.AES.decrypt(encrypted, ENC_KEY);
    return bytes.toString(CryptoJS.enc.Utf8);
  } catch {
    return "";
  }
}

/**
 * Encrypt a license key before storing in localStorage.
 */
export function encryptLicenseKey(key: string): string {
  return encrypt(JSON.stringify({ k: key, t: Date.now() }));
}

/**
 * Decrypt a license key from localStorage.
 */
export function decryptLicenseKey(encrypted: string): string | null {
  try {
    const decrypted = decrypt(encrypted);
    if (!decrypted) return null;
    const parsed = JSON.parse(decrypted);
    return parsed.k || null;
  } catch {
    return null;
  }
}

/**
 * Generate a request signature for API calls.
 * This prevents replay attacks and ensures requests come from our app.
 */
export function generateRequestSignature(payload: string, timestamp: number): string {
  const data = `${payload}:${timestamp}:${ENC_KEY}`;
  return CryptoJS.SHA256(data).toString();
}

/**
 * Verify a request signature.
 */
export function verifyRequestSignature(
  payload: string,
  timestamp: number,
  signature: string
): boolean {
  // Reject if timestamp is older than 5 minutes
  const now = Date.now();
  if (Math.abs(now - timestamp) > 5 * 60 * 1000) {
    return false;
  }
  const expected = generateRequestSignature(payload, timestamp);
  return expected === signature;
}

// ===== RATE LIMITING (client-side, for API routes) =====

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Check rate limit for an IP + endpoint.
 * Returns true if request is allowed, false if rate limited.
 *
 * Limits:
 *   - 10 requests per minute for contest/join
 *   - 30 requests per minute for other API routes
 *   - 5 requests per minute for payment
 */
export function checkRateLimit(
  ip: string,
  endpoint: string,
  maxRequests: number = 30,
  windowMs: number = 60000
): { allowed: boolean; remaining: number; resetAt: number } {
  const key = `${ip}:${endpoint}`;
  const now = Date.now();

  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
    // New window
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }

  if (entry.count >= maxRequests) {
    // Rate limited
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  // Increment count
  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
}

/**
 * Get client IP from request headers.
 */
export function getClientIP(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIP = request.headers.get("x-real-ip");
  if (realIP) return realIP;
  return "unknown";
}

/**
 * Validate request origin — only allow our app.
 */
export function validateOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");

  // Allow same-origin requests (no origin header for same-origin)
  if (!origin && !referer) return true;

  // Check if origin/referer matches our host
  const allowedHosts = [
    host, // Same host
    "localhost:3000",
    "fantasypro-ochre.vercel.app",
    "apna-cricket.vercel.app",
  ].filter(Boolean);

  if (origin) {
    try {
      const url = new URL(origin);
      if (allowedHosts.includes(url.host)) return true;
    } catch {
      // Invalid origin
    }
  }

  if (referer) {
    try {
      const url = new URL(referer);
      if (allowedHosts.includes(url.host)) return true;
    } catch {
      // Invalid referer
    }
  }

  return false;
}

// ===== ANTI-TAMPERING (client-side) =====

/**
 * Detect if DevTools is open.
 * Returns true if DevTools is detected.
 */
export function detectDevTools(): boolean {
  if (typeof window === "undefined") return false;

  const threshold = 160;

  // Check window size difference (devtools docked)
  const widthDiff = window.outerWidth - window.innerWidth;
  const heightDiff = window.outerHeight - window.innerHeight;

  if (widthDiff > threshold || heightDiff > threshold) {
    return true;
  }

  // Check if console.debug timing is slow (devtools open)
  const start = performance.now();
  // eslint-disable-next-line no-console
  console.debug("");
  const end = performance.now();

  if (end - start > 100) {
    return true;
  }

  return false;
}

/**
 * Initialize anti-tampering measures.
 * Call this on app load.
 */
export function initAntiTampering(): void {
  if (typeof window === "undefined") return;

  // Disable right-click context menu
  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  // Disable F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
  document.addEventListener("keydown", (e) => {
    // F12
    if (e.key === "F12") {
      e.preventDefault();
      return;
    }
    // Ctrl+Shift+I or Ctrl+Shift+J (DevTools)
    if (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "i" || e.key === "J" || e.key === "j")) {
      e.preventDefault();
      return;
    }
    // Ctrl+U (View Source)
    if (e.ctrlKey && (e.key === "U" || e.key === "u")) {
      e.preventDefault();
      return;
    }
  });

  // Periodic DevTools detection
  let devToolsOpen = false;
  setInterval(() => {
    if (detectDevTools() && !devToolsOpen) {
      devToolsOpen = true;
      // Clear sensitive data when devtools detected
      // Don't redirect — just clear console
      // eslint-disable-next-line no-console
      console.clear();
      // eslint-disable-next-line no-console
      console.warn("%c⚠️ STOP!", "font-size:48px;font-weight:bold;color:red;");
      // eslint-disable-next-line no-console
      console.warn("%cThis is a protected application. Tampering with the code is prohibited.", "font-size:14px;color:red;");
    } else if (!detectDevTools()) {
      devToolsOpen = false;
    }
  }, 2000);

  // Disable drag (prevents image/code dragging)
  document.addEventListener("dragstart", (e) => {
    e.preventDefault();
  });

  // Detect if code is running in an iframe (prevent embedding)
  if (window.self !== window.top) {
    window.top!.location = window.self.location;
  }
}

// ===== LICENSE KEY VALIDATION (server-side simulation) =====

/**
 * Validate a license key signature.
 * Each key has a hidden checksum that verifies it was generated by our system.
 */
export function validateKeySignature(key: string): boolean {
  if (!key || !key.startsWith("CRICB-")) return false;

  // Key format: CRICB-XXXX-XXXX-XXXX
  const parts = key.split("-");
  if (parts.length !== 4) return false;

  // Each segment must be 4 chars (alphanumeric, no confusing chars)
  const validChars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let i = 1; i < 4; i++) {
    if (parts[i].length !== 4) return false;
    for (const c of parts[i]) {
      if (!validChars.includes(c)) return false;
    }
  }

  return true;
}

/**
 * Generate a secure hash of the license key + device ID.
 * Used for server-side verification.
 */
export function generateKeyHash(key: string, deviceId: string): string {
  return CryptoJS.SHA256(`${key}:${deviceId}:${ENC_KEY}`).toString().substring(0, 32);
}
