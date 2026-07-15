/**
 * FIREBASE CLEANUP — Delete old keys directly from Firebase
 * ========================================================
 * Keeps only keys from current month. Deletes all others.
 *
 * Run: node scripts/cleanup-firebase-keys.js
 *
 * WARNING: This permanently deletes keys from Firestore. Cannot be undone.
 */

const { initializeApp } = require("firebase/app");
const {
  getFirestore,
  collection,
  getDocs,
  deleteDoc,
  doc,
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

console.log("🔥 Initializing Firebase...");
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function cleanup() {
  console.log("📥 Fetching ALL keys from license_keys/ collection...");
  const snap = await getDocs(collection(db, "license_keys"));
  console.log("📊 Total keys in Firestore:", snap.size, "\n");

  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  let keepCount = 0;
  let deleteCount = 0;
  const toDelete = [];

  snap.forEach((d) => {
    const data = d.data();
    const createdAt = data.createdAt;
    if (typeof createdAt === "number") {
      const d2 = new Date(createdAt);
      if (d2.getMonth() === thisMonth && d2.getFullYear() === thisYear) {
        keepCount++;
      } else {
        deleteCount++;
        toDelete.push(d.id);
      }
    } else {
      // No createdAt or invalid — delete it
      deleteCount++;
      toDelete.push(d.id);
    }
  });

  console.log("📅 Current month:", now.toLocaleString("default", { month: "long" }), thisYear);
  console.log("✅ Keys to KEEP (this month):", keepCount);
  console.log("🗑️  Keys to DELETE (old):", deleteCount, "\n");

  if (deleteCount === 0) {
    console.log("✨ Nothing to delete — all keys are from this month.");
    process.exit(0);
  }

  console.log("⚠️  This will permanently DELETE " + deleteCount + " keys from Firestore.");
  console.log("   Proceeding in 3 seconds... (Ctrl+C to cancel)\n");
  await new Promise((r) => setTimeout(r, 3000));

  console.log("🗑️  Deleting in batches of 20...");
  let deleted = 0;
  let failed = 0;
  const BATCH = 20;

  for (let i = 0; i < toDelete.length; i += BATCH) {
    const batch = toDelete.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map((keyId) => deleteDoc(doc(db, "license_keys", keyId)))
    );
    results.forEach((r) => {
      if (r.status === "fulfilled") deleted++;
      else failed++;
    });
    process.stdout.write("\r   Deleted: " + deleted + " / " + deleteCount + " (failed: " + failed + ")");
    // Small delay between batches
    if (i + BATCH < toDelete.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  console.log("\n\n========================================");
  console.log("✅ CLEANUP COMPLETE");
  console.log("========================================");
  console.log("Deleted:", deleted);
  console.log("Failed:", failed);
  console.log("Kept (this month):", keepCount);

  // Verify
  console.log("\n📥 Verifying — re-fetching keys...");
  const snap2 = await getDocs(collection(db, "license_keys"));
  console.log("✅ Total keys now:", snap2.size);

  process.exit(0);
}

cleanup().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
