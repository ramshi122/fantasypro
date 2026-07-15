/**
 * FAST CLEANUP — Delete old keys using writeBatch (much faster)
 * ============================================================
 * Uses Firestore writeBatch to delete 500 keys per batch (vs 20).
 * Keeps only keys from current month.
 */

const { initializeApp } = require("firebase/app");
const {
  getFirestore,
  collection,
  getDocs,
  deleteDoc,
  doc,
  writeBatch,
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
  console.log("📥 Fetching ALL keys...");
  const snap = await getDocs(collection(db, "license_keys"));
  console.log("📊 Total keys:", snap.size, "\n");

  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  const toDelete = [];
  let keepCount = 0;

  snap.forEach((d) => {
    const data = d.data();
    const createdAt = data.createdAt;
    if (typeof createdAt === "number") {
      const d2 = new Date(createdAt);
      if (d2.getMonth() === thisMonth && d2.getFullYear() === thisYear) {
        keepCount++;
      } else {
        toDelete.push(d.id);
      }
    } else {
      toDelete.push(d.id);
    }
  });

  console.log("📅 Keep (this month):", keepCount);
  console.log("🗑️  Delete (old):", toDelete.length, "\n");

  if (toDelete.length === 0) {
    console.log("✨ Nothing to delete.");
    process.exit(0);
  }

  console.log("🗑️  Deleting using writeBatch (500 per batch)...");
  let deleted = 0;
  const BATCH_SIZE = 450; // Firestore batch limit is 500

  for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
    const batchKeys = toDelete.slice(i, i + BATCH_SIZE);
    const batch = writeBatch(db);
    batchKeys.forEach((keyId) => {
      batch.delete(doc(db, "license_keys", keyId));
    });
    try {
      await batch.commit();
      deleted += batchKeys.length;
      console.log("   ✅ Batch committed: " + deleted + " / " + toDelete.length + " deleted");
    } catch (err) {
      console.error("   ❌ Batch failed:", err.message);
      // Try individual deletes for this batch
      for (const keyId of batchKeys) {
        try {
          await deleteDoc(doc(db, "license_keys", keyId));
          deleted++;
        } catch (e) {
          // skip
        }
      }
    }
  }

  console.log("\n========================================");
  console.log("✅ CLEANUP COMPLETE");
  console.log("========================================");
  console.log("Deleted:", deleted);
  console.log("Kept (this month):", keepCount);

  console.log("\n📥 Verifying...");
  const snap2 = await getDocs(collection(db, "license_keys"));
  console.log("✅ Total keys now:", snap2.size);
  process.exit(0);
}

cleanup().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
