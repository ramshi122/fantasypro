/**
 * FIREBASE DIRECT TEST
 * ===================
 * Connects directly to user's Firebase project (revofixer-81a1c)
 * Tests write/read/delete on license_keys collection.
 *
 * Run: node scripts/test-firebase-direct.js
 */

const { initializeApp } = require("firebase/app");
const {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  collection,
  getDocs,
} = require("firebase/firestore");

const firebaseConfig = {
  apiKey: "AIzaSyDbaFKRqrD976syNij_fSSuIBSPRtR9vbo",
  authDomain: "revofixer-81a1c.firebaseapp.com",
  projectId: "revofixer-81a1c",
  storageBucket: "revofixer-81a1c.firebasestorage.app",
  messagingSenderId: "1049094387124",
  appId: "1:1049094387124:web:864be9cd7ed7c2455caee1",
  measurementId: "G-HYF2T2VQ8K",
};

console.log("🔥 Initializing Firebase (project: revofixer-81a1c)...");
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
console.log("✅ Firebase initialized\n");

const TEST_KEY = "TEST-DIRECT-" + Date.now().toString(36).toUpperCase();

async function runTest() {
  console.log("========================================");
  console.log("TEST 1: WRITE to license_keys/" + TEST_KEY);
  console.log("========================================");
  try {
    const payload = {
      key: TEST_KEY,
      type: "trial",
      status: "active",
      createdAt: Date.now(),
      expiresAt: null,
      deviceIds: [],
      verifications: 0,
    };
    await setDoc(doc(db, "license_keys", TEST_KEY), payload);
    console.log("✅ WRITE SUCCESS\n");
  } catch (err) {
    console.error("❌ WRITE FAILED:", err.code || err.message);
    if (err.code === "permission-denied") {
      console.error("   → PERMISSION DENIED. Your Firestore rules do NOT allow");
      console.error("     writes to license_keys/{keyId}. Check Firebase console:");
      console.error("     https://console.firebase.google.com/project/revofixer-81a1c/firestore/rules");
      console.error("   → Required rules:");
      console.error("     match /license_keys/{keyId} {");
      console.error("       allow read, create, update, delete: if true;");
      console.error("     }");
    }
    process.exit(1);
  }

  console.log("========================================");
  console.log("TEST 2: READ license_keys/" + TEST_KEY);
  console.log("========================================");
  try {
    const snap = await getDoc(doc(db, "license_keys", TEST_KEY));
    if (snap.exists()) {
      const data = snap.data();
      console.log("✅ READ SUCCESS");
      console.log("   key:", data.key);
      console.log("   type:", data.type);
      console.log("   status:", data.status, "\n");
    } else {
      console.error("❌ READ FAILED — document does not exist after write!\n");
      process.exit(1);
    }
  } catch (err) {
    console.error("❌ READ FAILED:", err.code || err.message, "\n");
    process.exit(1);
  }

  console.log("========================================");
  console.log("TEST 3: DELETE license_keys/" + TEST_KEY);
  console.log("========================================");
  try {
    await deleteDoc(doc(db, "license_keys", TEST_KEY));
    console.log("✅ DELETE SUCCESS\n");
  } catch (err) {
    console.error("❌ DELETE FAILED:", err.code || err.message, "\n");
    process.exit(1);
  }

  console.log("========================================");
  console.log("TEST 4: LIST ALL keys in license_keys/");
  console.log("========================================");
  try {
    const snap = await getDocs(collection(db, "license_keys"));
    console.log("✅ LIST SUCCESS — " + snap.size + " keys in Firestore:");
    let count = 0;
    snap.forEach((d) => {
      count++;
      if (count <= 5) {
        const data = d.data();
        console.log("   " + count + ". " + d.id + " | type: " + data.type + " | status: " + data.status);
      }
    });
    if (snap.size > 5) {
      console.log("   ... and " + (snap.size - 5) + " more");
    }
    console.log("");
  } catch (err) {
    console.error("❌ LIST FAILED:", err.code || err.message, "\n");
  }

  console.log("========================================");
  console.log("SUMMARY");
  console.log("========================================");
  console.log("✅ Write: OK");
  console.log("✅ Read: OK");
  console.log("✅ Delete: OK");
  console.log("\n🎉 Firebase license_keys/ collection is WORKING.");
  console.log("   If keys are not saving from admin panel, the issue is in the");
  console.log("   admin code (browser console), not Firebase rules.");
}

runTest().catch((err) => {
  console.error("FATAL ERROR:", err);
  process.exit(1);
});
