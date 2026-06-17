import CryptoJS from "crypto-js";

/**
 * AES encryption helper for FantasyPro API.
 * All payloads to / responses from the backend are AES-encrypted using a shared key.
 */
const SECRET_KEY = "coder_bobby_believer01_tg_software";

export function encrypt(data: unknown): string {
  try {
    const json = typeof data === "string" ? data : JSON.stringify(data);
    return CryptoJS.AES.encrypt(json, SECRET_KEY).toString();
  } catch (e) {
    console.error("[crypto] encrypt failed", e);
    return "";
  }
}

export function decrypt<T = unknown>(cipherText: string): T | null {
  if (!cipherText) return null;
  try {
    const bytes = CryptoJS.AES.decrypt(cipherText, SECRET_KEY);
    const text = bytes.toString(CryptoJS.enc.Utf8);
    if (!text) return null;
    try {
      return JSON.parse(text) as T;
    } catch {
      return text as unknown as T;
    }
  } catch (e) {
    console.error("[crypto] decrypt failed", e);
    return null;
  }
}

export function encryptBody(payload: Record<string, unknown>): string {
  return encrypt(payload);
}
