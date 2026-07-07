/**
 * Firebase Configuration
 * ======================
 * Project: revofixer-81a1c
 * Used for: License key storage (Firestore), Analytics
 *
 * Firestore collection: `license_keys`
 * Document ID: license key string (e.g. "CRICB-ABCD-EFGH-IJKL")
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

// Initialize Firebase (singleton — only once)
let app: FirebaseApp;
let db: Firestore;

if (typeof window !== "undefined") {
  // Client-side initialization
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }
  db = getFirestore(app);
  console.log("[Firebase] Initialized — project: revofixer-81a1c");
}

// Analytics — only load on client side (lazy import to avoid SSR issues)
let analyticsInstance: any = null;
if (typeof window !== "undefined") {
  import("firebase/analytics")
    .then(({ getAnalytics }) => {
      try {
        analyticsInstance = getAnalytics(app);
        console.log("[Firebase] Analytics initialized");
      } catch (err) {
        console.log("[Firebase] Analytics skipped:", err);
      }
    })
    .catch((err) => {
      console.log("[Firebase] Analytics not available:", err);
    });
}

export { app, db, analyticsInstance };
export default app;
