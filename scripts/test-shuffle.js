// Test: verify shuffle produces different results with different seeds
function memoizedShuffle(pool, seed) {
  const shuffled = [...pool];
  let s = ((seed % 2147483647) * 2654435761) % 2147483647;
  for (let j = shuffled.length - 1; j > 0; j--) {
    s = (s * 1103515245 + 12345) % 2147483647;
    const k = s % (j + 1);
    [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
  }
  return shuffled;
}

// Test with 3 different session seeds
const pool = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8", "P9", "P10", "P11"];

console.log("=== Testing shuffle with different seeds ===\n");

for (let run = 1; run <= 3; run++) {
  const sessionSeed = Math.floor(Math.random() * 99999) + 1;
  const rotationOffset = sessionSeed + 0 * 3 + 1; // i=0, tries=1
  const result = memoizedShuffle(pool, rotationOffset);
  console.log(`Run ${run} (seed=${sessionSeed}): ${result.slice(0, 5).join(", ")}...`);
}

// Also test: same seed should produce same result (deterministic)
console.log("\n=== Same seed = same result (deterministic) ===");
const r1 = memoizedShuffle(pool, 12345);
const r2 = memoizedShuffle(pool, 12345);
console.log("Seed 12345 (1st):", r1.slice(0, 5).join(", "));
console.log("Seed 12345 (2nd):", r2.slice(0, 5).join(", "));
console.log("Same?", JSON.stringify(r1) === JSON.stringify(r2));

// Different seeds = different results
console.log("\n=== Different seeds = different results ===");
const r3 = memoizedShuffle(pool, 12345);
const r4 = memoizedShuffle(pool, 12346);
console.log("Seed 12345:", r3.slice(0, 5).join(", "));
console.log("Seed 12346:", r4.slice(0, 5).join(", "));
console.log("Different?", JSON.stringify(r3) !== JSON.stringify(r4));
