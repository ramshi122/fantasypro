/**
 * Firebase Configuration
 * ======================
 * Project: revofixer-81a1c
 * Used for: License key storage (Firestore), Analytics, Payment orders
 *
 * IMPORTANT: Firebase must initialize on BOTH client AND server (API routes).
 * The `typeof window` check was preventing server-side initialization.
 */

import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import {
  getFirestore,
  type Firestore,
} from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDbaFKRqrD976syNij_fSSuIBSPRtR9vbo",
  authDomain: "revofixer-81a1c.firebaseapp.com",
  projectId: "revofixer-81a1c",
  storageBucket: "revofixer-81a1c.firebasestorage.app",
  messagingSenderId: "1049094387124",
  appId: "1:1049094387124:web:864be9cd7ed7c2455caee1",
  measurementId: "G-HYF2T2VQ8K",
};

// Initialize Firebase — works on BOTH client and server
let app: FirebaseApp;
let db: Firestore;

try {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }
  db = getFirestore(app);
  console.log("[Firebase] Initialized — project: revofixer-81a1c");
} catch (err) {
  console.error("[Firebase] Init failed:", err);
  // Create fallback to prevent crashes
  app = {} as FirebaseApp;
  db = {} as Firestore;
}

// Analytics — only on client side (lazy import)
if (typeof window !== "undefined") {
  import("firebase/analytics")
    .then(({ getAnalytics }) => {
      try {
        const analyticsInstance = getAnalytics(app);
        console.log("[Firebase] Analytics initialized");
      } catch (err) {
        console.log("[Firebase] Analytics skipped:", err);
      }
    })
    .catch((err) => {
      console.log("[Firebase] Analytics not available:", err);
    });
}

export { app, db };
export default app;
