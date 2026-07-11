/**
 * Admin 2FA — TOTP (Time-based One-Time Password)
 * ================================================
 * Generates a TOTP secret compatible with Google Authenticator.
 * Uses a manual implementation of RFC 6238 TOTP (no external deps).
 *
 * Functions:
 *   - generate2FASecret() — create new secret for admin
 *   - verify2FA(token) — verify 6-digit code
 *   - is2FAEnabled() — check if 2FA is configured
 *   - getQRCodeURL(secret, label) — otpauth:// URL for QR scanning
 */

const STORAGE_KEY = "apna-cricket-admin-2fa";

export interface TwoFactorConfig {
  secret: string;
  enabled: boolean;
  createdAt: number;
  backupCodes: string[];
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

/**
 * Generate a base32-encoded random secret (20 bytes = 160 bits).
 */
export function generate2FASecret(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let secret = "";
  // Use crypto if available
  if (typeof globalThis !== "undefined" && globalThis.crypto?.getRandomValues) {
    const bytes = new Uint8Array(20);
    globalThis.crypto.getRandomValues(bytes);
    for (let i = 0; i < bytes.length; i++) {
      secret += chars[bytes[i] % chars.length];
    }
  } else {
    // Fallback
    for (let i = 0; i < 32; i++) {
      secret += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  return secret;
}

/**
 * Get the otpauth:// URL for QR code scanning.
 */
export function getQRCodeURL(secret: string, label: string = "ApnaCricket:Admin"): string {
  const issuer = "ApnaCricket";
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Decode a base32 string to bytes.
 */
function base32Decode(secret: string): Uint8Array {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = secret.replace(/=+$/, "").toUpperCase();
  let bits = "";
  for (const c of clean) {
    const idx = chars.indexOf(c);
    if (idx < 0) continue;
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return new Uint8Array(bytes);
}

/**
 * Generate a TOTP code for the given timestamp.
 */
export function generateTOTP(secret: string, timestamp: number = Date.now()): string {
  const period = 30;
  const counter = Math.floor(timestamp / 1000 / period);
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  // Set high 32 bits (counter is 64-bit; we only use low 32 here)
  view.setUint32(0, Math.floor(counter / 0x100000000));
  view.setUint32(4, counter >>> 0);

  // HMAC-SHA1 — use Web Crypto API
  // We need synchronous behavior for verify, so implement SHA1 manually.
  const key = base32Decode(secret);
  const msg = new Uint8Array(buf);
  const hash = hmacSha1(key, msg);

  // Dynamic truncation
  const offset = hash[hash.length - 1] & 0xf;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);
  const otp = binary % 1000000;
  return otp.toString().padStart(6, "0");
}

/**
 * HMAC-SHA1 implementation (synchronous, no external deps).
 */
function hmacSha1(key: Uint8Array, message: Uint8Array): Uint8Array {
  const blockSize = 64;
  let k = key;
  if (k.length > blockSize) {
    k = sha1(k);
  }
  if (k.length < blockSize) {
    const padded = new Uint8Array(blockSize);
    padded.set(k);
    k = padded;
  }
  const oKeyPad = new Uint8Array(blockSize);
  const iKeyPad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    oKeyPad[i] = k[i] ^ 0x5c;
    iKeyPad[i] = k[i] ^ 0x36;
  }
  const inner = new Uint8Array(iKeyPad.length + message.length);
  inner.set(iKeyPad);
  inner.set(message, iKeyPad.length);
  const innerHash = sha1(inner);
  const outer = new Uint8Array(oKeyPad.length + innerHash.length);
  outer.set(oKeyPad);
  outer.set(innerHash, oKeyPad.length);
  return sha1(outer);
}

/**
 * SHA-1 implementation (synchronous).
 */
function sha1(data: Uint8Array): Uint8Array {
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  const ml = data.length;
  const bitLen = ml * 8;
  // Padding: append 0x80, then zeros, then 64-bit length
  const withOne = ml + 1;
  const totalLen = withOne + ((56 - (withOne % 64)) % 64) + 8;
  const padded = new Uint8Array(totalLen);
  padded.set(data);
  padded[ml] = 0x80;
  // Length in bits (big-endian, 64-bit)
  const high = Math.floor(bitLen / 0x100000000);
  const low = bitLen >>> 0;
  const dv = new DataView(padded.buffer);
  dv.setUint32(totalLen - 8, high);
  dv.setUint32(totalLen - 4, low);

  for (let chunk = 0; chunk < totalLen; chunk += 64) {
    const w = new Uint32Array(80);
    for (let i = 0; i < 16; i++) {
      w[i] = dv.getUint32(chunk + i * 4);
    }
    for (let i = 16; i < 80; i++) {
      const t = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = ((t << 1) | (t >>> 31)) >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      let f: number, k: number;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = ((b << 30) | (b >>> 2)) >>> 0; b = a; a = temp;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const out = new Uint8Array(20);
  const odv = new DataView(out.buffer);
  odv.setUint32(0, h0);
  odv.setUint32(4, h1);
  odv.setUint32(8, h2);
  odv.setUint32(12, h3);
  odv.setUint32(16, h4);
  return out;
}

/**
 * Save the 2FA configuration locally.
 */
export function save2FAConfig(config: TwoFactorConfig): void {
  if (!isBrowser()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

/**
 * Get the 2FA configuration.
 */
export function get2FAConfig(): TwoFactorConfig | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Check if 2FA is enabled (locally).
 */
export function is2FAEnabled(): boolean {
  const config = get2FAConfig();
  return !!config && config.enabled;
}

/**
 * Verify a 6-digit TOTP token against the stored secret.
 * Allows a ±1 time step window (30s skew tolerance).
 */
export function verify2FA(token: string): boolean {
  const config = get2FAConfig();
  if (!config || !config.secret) return false;
  return verify2FASecret(token, config.secret);
}

/**
 * Verify a token against a specific secret (for setup confirmation).
 */
export function verify2FASecret(token: string, secret: string): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  const now = Date.now();
  // Check current, previous, and next 30s windows
  for (const offset of [-30000, 0, 30000]) {
    const code = generateTOTP(secret, now + offset);
    if (code === token) return true;
  }
  // Also check backup codes
  const config = get2FAConfig();
  if (config?.backupCodes?.includes(token)) {
    // Remove used backup code
    config.backupCodes = config.backupCodes.filter((c) => c !== token);
    save2FAConfig(config);
    return true;
  }
  return false;
}

/**
 * Generate 10 one-time backup codes.
 */
export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    const n = Math.floor(Math.random() * 1000000).toString().padStart(6, "0");
    codes.push(n);
  }
  return codes;
}

/**
 * Disable 2FA.
 */
export function disable2FA(): void {
  if (!isBrowser()) return;
  localStorage.removeItem(STORAGE_KEY);
}
