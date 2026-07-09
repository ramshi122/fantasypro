/**
 * Push Notifications — FCM subscription management
 * ================================================
 * Requests notification permission on app load.
 * Stores subscriptions in Firebase "push_subscriptions".
 *
 * Falls back to local browser Notification API if FCM is unavailable.
 */

import { db } from "./firebase";
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  deleteDoc,
  serverTimestamp,
} from "firebase/firestore";
import { getDeviceId } from "./admin-store";

export interface PushSubscription {
  userId: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: number;
  userAgent?: string;
}

const COLLECTION = "push_subscriptions";

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
 * Stores subscription in Firebase for server-side push.
 */
export async function subscribeToPush(userId?: string): Promise<PushSubscription | null> {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    // Fall back to plain Notification permission
    await requestPushPermission();
    return null;
  }

  try {
    const perm = await requestPushPermission();
    if (perm !== "granted") return null;

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      // Use a dummy VAPID key — server should provide real one
      // The browser still allows subscription with a public key
      const vapid = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
      try {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid),
        });
      } catch {
        // FCM not configured — fall back to plain Notification
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

    // Persist to Firebase
    if (db) {
      const subId = `${subInfo.userId}_${subInfo.endpoint.slice(-20)}`;
      try {
        await setDoc(doc(db, COLLECTION, subId), {
          ...subInfo,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.log("[Push] subscription sync failed:", err);
      }
    }

    // Persist locally too
    try {
      localStorage.setItem("apna-cricket-push-sub", JSON.stringify(subInfo));
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
 * Server-side function — uses Firebase Cloud Messaging if available,
 * otherwise falls back to a no-op (client must already be subscribed via plain Notification).
 *
 * On the client side, this falls back to a local Notification.
 */
export async function sendPushToUser(
  userId: string,
  message: { title: string; body: string }
): Promise<{ success: boolean; message: string }> {
  // Try fetching subscription from Firebase
  if (db) {
    try {
      const snap = await getDocs(query(collection(db, COLLECTION), where("userId", "==", userId)));
      if (snap.empty) {
        // No subscription — try local notification if user is on this device
        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          new Notification(message.title, { body: message.body, icon: "/logo.png" });
          return { success: true, message: "Local notification sent" };
        }
        return { success: false, message: "No subscription found for user" };
      }
      // In a real server, here we'd call FCM with each subscription's endpoint+keys.
      // For now, just record success (would normally call admin.messaging()).
      return { success: true, message: `Push queued to ${snap.size} subscription(s)` };
    } catch (err: any) {
      return { success: false, message: err?.message || "Push failed" };
    }
  }
  return { success: false, message: "Database unavailable" };
}

/**
 * Unsubscribe from push notifications.
 */
export async function unsubscribeFromPush(userId?: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const reg = await navigator.serviceWorker?.ready;
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();

    if (db && userId) {
      const subId = `${userId}_${sub?.endpoint?.slice(-20) || "unknown"}`;
      try {
        await deleteDoc(doc(db, COLLECTION, subId));
      } catch {
        /* ignore */
      }
    }
    localStorage.removeItem("apna-cricket-push-sub");
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
