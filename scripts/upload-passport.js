#!/usr/bin/env node
/**
 * Arc ID — Passport Upload Script
 * Uploads agent passport JSON to IPFS.
 *
 * Usage:
 *   node upload-passport.js --file ./my-passport.json
 *   node upload-passport.js --file ./my-passport.json --provider pinata
 *
 * Env vars (optional):
 *   PINATA_API_KEY + PINATA_SECRET_KEY  — Pinata credentials
 *   NFT_STORAGE_KEY                     — nft.storage API key
 *
 * If no credentials: computes CID locally and outputs the file for manual pinning.
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

// ── Args ───────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const fileFlag = args.indexOf("--file");
if (fileFlag === -1 || !args[fileFlag + 1]) {
  console.error("Usage: node upload-passport.js --file <path-to-passport.json>");
  process.exit(1);
}
const filePath = resolve(args[fileFlag + 1]);
const data = readFileSync(filePath, "utf8");
let passport;
try {
  passport = JSON.parse(data);
} catch {
  console.error("❌ Invalid JSON in passport file");
  process.exit(1);
}

console.log(`📄 Passport: ${passport.name ?? "unnamed"} v${passport.version ?? "?"}`);

// ── Try Pinata ─────────────────────────────────────────────────────────────────
if (process.env.PINATA_API_KEY && process.env.PINATA_SECRET_KEY) {
  console.log("📌 Uploading via Pinata...");
  try {
    const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "pinata_api_key": process.env.PINATA_API_KEY,
        "pinata_secret_api_key": process.env.PINATA_SECRET_KEY,
      },
      body: JSON.stringify({
        pinataContent: passport,
        pinataMetadata: { name: `${passport.name ?? "agent"}-passport.json` },
      }),
    });
    const json = await res.json();
    if (json.IpfsHash) {
      const cid = json.IpfsHash;
      console.log(`✅ Pinned! CID: ${cid}`);
      console.log(`🔗 Gateway: https://gateway.pinata.cloud/ipfs/${cid}`);
      writeResult(cid, `ipfs://${cid}`);
      process.exit(0);
    } else {
      console.warn("⚠️  Pinata error:", JSON.stringify(json));
    }
  } catch (err) {
    console.warn("⚠️  Pinata failed:", err.message);
  }
}

// ── Try nft.storage ────────────────────────────────────────────────────────────
if (process.env.NFT_STORAGE_KEY) {
  console.log("📌 Uploading via nft.storage...");
  try {
    const res = await fetch("https://api.nft.storage/upload", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.NFT_STORAGE_KEY}`,
        "Content-Type": "application/json",
      },
      body: data,
    });
    const json = await res.json();
    if (json.value?.cid) {
      const cid = json.value.cid;
      console.log(`✅ Pinned! CID: ${cid}`);
      console.log(`🔗 Gateway: https://ipfs.io/ipfs/${cid}`);
      writeResult(cid, `ipfs://${cid}`);
      process.exit(0);
    }
  } catch (err) {
    console.warn("⚠️  nft.storage failed:", err.message);
  }
}

// ── Fallback: compute CID locally ─────────────────────────────────────────────
console.log("ℹ️  No IPFS credentials found. Computing CID locally...");

const { default: Hash } = await import("ipfs-only-hash").catch(() => {
  console.error("❌ Run: npm install ipfs-only-hash");
  process.exit(1);
});

const cid = await Hash.of(Buffer.from(data));
const outFile = filePath.replace(/\.json$/, ".pinnable.json");
writeFileSync(outFile, data);

console.log(`\n📋 CID (computed): ${cid}`);
console.log(`   ipfs://${cid}`);
console.log(`\n📌 To pin manually:`);
console.log(`   1. Go to https://app.pinata.cloud → Upload → File`);
console.log(`      File: ${outFile}`);
console.log(`   2. Or: PINATA_API_KEY=xxx PINATA_SECRET_KEY=yyy node upload-passport.js --file ${filePath}`);
console.log(`   3. Or: NFT_STORAGE_KEY=xxx node upload-passport.js --file ${filePath}`);
console.log(`\n   After pinning, use: ipfs://${cid} as AGENT_URI in register.js`);

writeResult(cid, `ipfs://${cid}`, "local-only");

function writeResult(cid, uri, note) {
  const result = { cid, uri, note, timestamp: new Date().toISOString() };
  writeFileSync("./passport-upload-result.json", JSON.stringify(result, null, 2));
  console.log(`\n💾 Result saved: ./passport-upload-result.json`);
}
