/**
 * Firebase Configuration (LICENSE-ONLY)
 * =====================================
 * Project: revofixer-81a1c
 *
 * ⚠️ Firebase is used ONLY for license key storage (`license_keys` collection).
 *   No other collections (users, analytics, payments, broadcasts, lockouts,
 *   anti-cheat, predictions, leaderboard, wallet, contests, scheduler, etc.)
 *   are read from or written to.
 *
 * Single instance — initialized at import time, shared across all callers
 * (both client and server / API routes). No real-time listeners are used
 * anywhere in the app.
 */

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDbaFKRqrD976syNij_fSSuIBSPRtR9vbo",
  authDomain: "revofixer-81a1c.firebaseapp.com",
  projectId: "revofixer-81a1c",
  storageBucket: "revofixer-81a1c.firebasestorage.app",
  messagingSenderId: "1049094387124",
  appId: "1:1049094387124:web:864be9cd7ed7c2455caee1",
  measurementId: "G-HYF2T2VQ8K",
};

// Single shared instance — initialize once.
let app: FirebaseApp;
let db: Firestore;

try {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }
  db = getFirestore(app);
  // eslint-disable-next-line no-console
  console.log("[Firebase] Initialized — license-only mode — project: revofixer-81a1c");
} catch (err) {
  // eslint-disable-next-line no-console
  console.error("[Firebase] Init failed:", err);
  // Fallback empty objects so callers can guard with `if (!db)` without crashing.
  app = {} as FirebaseApp;
  db = {} as Firestore;
}

// NOTE: No Analytics initialization — we do not use Firebase Analytics.
// All client-side analytics are handled via the in-app api-logger.

export { app, db };
export default app;
