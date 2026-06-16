// Test script to verify AES decryption works with real API data
import CryptoJS from "crypto-js";

const KEY = "coder_bobby_believer01_tg_software";

async function test() {
  console.log("=== Testing FantasyPro API decryption ===\n");
  
  // 1. Fetch matches
  const res = await fetch("https://tgsoftware-api.online/api/fantasy/matches/cricket");
  const json = await res.json();
  console.log("Status:", json.status);
  console.log("Data type:", Array.isArray(json.data) ? "array" : typeof json.data);
  console.log("Data length:", Array.isArray(json.data) ? json.data.length : "n/a");
  
  if (Array.isArray(json.data) && json.data.length > 0) {
    const first = json.data[0];
    console.log("\nFirst item type:", typeof first);
    console.log("First item (truncated):", String(first).substring(0, 100));
    
    // Try to decrypt
    try {
      const bytes = CryptoJS.AES.decrypt(first, KEY);
      const text = bytes.toString(CryptoJS.enc.Utf8);
      console.log("\nDecrypted text length:", text.length);
      if (text) {
        try {
          const obj = JSON.parse(text);
          console.log("Decrypted object keys:", Object.keys(obj));
          console.log("Sample decrypted object:", JSON.stringify(obj, null, 2).substring(0, 1500));
        } catch (e) {
          console.log("Not JSON, raw text:", text.substring(0, 500));
        }
      } else {
        console.log("Decryption returned empty text");
      }
    } catch (e) {
      console.log("Decryption error:", e.message);
    }
  }
  
  // 2. Test promotions
  console.log("\n\n=== Testing promotions ===");
  const promoRes = await fetch("https://tgsoftware-api.online/api/promotion/getlist");
  const promoJson = await promoRes.json();
  console.log("Status:", promoJson.status);
  console.log("Data type:", Array.isArray(promoJson.data) ? "array" : typeof promoJson.data);
  if (Array.isArray(promoJson.data) && promoJson.data.length > 0) {
    console.log("First promotion item:", JSON.stringify(promoJson.data[0]).substring(0, 300));
  }
  
  // 3. Test expert teams
  console.log("\n\n=== Testing expert teams ===");
  const exRes = await fetch("https://tgsoftware-api.online/api/expert/teamlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload: CryptoJS.AES.encrypt(JSON.stringify({}), KEY).toString() }),
  });
  const exJson = await exRes.json();
  console.log("Status:", exJson.status);
  console.log("Data type:", Array.isArray(exJson.data) ? "array" : typeof exJson.data);
  if (Array.isArray(exJson.data) && exJson.data.length > 0) {
    const first = exJson.data[0];
    console.log("First expert team item type:", typeof first);
    if (typeof first === "string") {
      try {
        const bytes = CryptoJS.AES.decrypt(first, KEY);
        const text = bytes.toString(CryptoJS.enc.Utf8);
        if (text) {
          console.log("Decrypted:", text.substring(0, 800));
        }
      } catch (e) {
        console.log("Decrypt error:", e.message);
      }
    } else {
      console.log("Direct value:", JSON.stringify(first).substring(0, 500));
    }
  }
}

test().catch(e => console.error(e));
