/**
 * Push Notifications — LOCAL ONLY (per FIREBASE-CLEANUP)
 * =======================================================
 * Requests notification permission on app load.
 * Stores subscriptions in localStorage (NOT Firebase).
 *
 * Falls back to local browser Notification API (no FCM).
 */

import { getDeviceId } from "./admin-store";

export interface PushSubscription {
  userId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: number;
  userAgent?: string;
}

const LS_KEY = "apna-cricket-push-sub";

/**
 * Request notification permission. Returns granted/denied/default.
 */
export async function requestPushPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  try {
    if (Notification.permission === "default") {
      return await Notification.requestPermission();
    }
    return Notification.permission;
  } catch {
    return "denied";
  }
}

/**
 * Subscribe to push notifications.
 * Uses the Push API (browser native) if available.
 * Stores subscription in localStorage only (no Firebase sync).
 */
export async function subscribeToPush(userId?: string): Promise<PushSubscription | null> {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    await requestPushPermission();
    return null;
  }

  try {
    const perm = await requestPushPermission();
    if (perm !== "granted") return null;

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const vapid = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
      try {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid),
        });
      } catch {
        return null;
      }
    }

    const subInfo: PushSubscription = {
      userId: userId || getDeviceId(),
      endpoint: sub.endpoint,
      keys: {
        p256dh: arrayBufferToBase64(sub.getKey("p256dh")),
        auth: arrayBufferToBase64(sub.getKey("auth")),
      },
      createdAt: Date.now(),
      userAgent: navigator.userAgent,
    };

    // Persist locally only (no Firebase)
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(subInfo));
    } catch {
      /* ignore */
    }

    return subInfo;
  } catch (err) {
    console.error("[Push] subscribe failed:", err);
    return null;
  }
}

/**
 * Send a push notification to a specific user.
 * Falls back to local Notification API (no FCM).
 */
export async function sendPushToUser(
  _userId: string,
  message: { title: string; body: string }
): Promise<{ success: boolean; message: string }> {
  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
    try {
      new Notification(message.title, { body: message.body, icon: "/logo.png" });
      return { success: true, message: "Local notification sent" };
    } catch (err: any) {
      return { success: false, message: err?.message || "Local notification failed" };
    }
  }
  return { success: false, message: "Notifications not granted on this device" };
}

/**
 * Unsubscribe from push notifications.
 */
export async function unsubscribeFromPush(_userId?: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const reg = await navigator.serviceWorker?.ready;
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
    if (typeof window !== "undefined") localStorage.removeItem(LS_KEY);
    return true;
  } catch {
    return false;
  }
}

/* ---------- helpers ---------- */

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    output[i] = rawData.charCodeAt(i);
  }
  return output;
}

function arrayBufferToBase64(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str);
}
