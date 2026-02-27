#!/usr/bin/env node
/**
 * Arc ID — Agent Registration Skill
 * Submits an agent passport application to ArcIdentityRegistry
 *
 * Usage:
 *   AGENT_PRIVATE_KEY=0x... DEPLOYER_ADDRESS=0x... AGENT_URI=ipfs://... node register.js
 *
 * Or autonomous mode (no deployer):
 *   AGENT_PRIVATE_KEY=0x... AGENT_URI=ipfs://... node register.js --autonomous
 */

import { ethers } from "ethers";

// ── Config ────────────────────────────────────────────────────────────────────
const RPC_URL = "https://rpc.testnet.arc.network";
const CHAIN_ID = 5042002;

const IDENTITY_REGISTRY_ADDRESS = "0x56c905c60c5ec61C103C99459290AdBf73976d12";

const IDENTITY_REGISTRY_ABI = [
  // Registration
  "function register(string calldata agentURI) external returns (uint256 tokenId)",
  "function submitApplication(address deployerAddr, string calldata agentURI) external",
  "function approveApplication(address agentAddr) external",

  // Info
  "function getAgentByAddress(address agentAddr) external view returns (uint256 tokenId, string memory agentURI, uint8 status, address creator)",
  "function hasApplication(address agentAddr) external view returns (bool)",
  "function isRegistered(address agentAddr) external view returns (bool)",

  // Passport update
  "function setAgentURI(string calldata newURI) external",

  // Events
  "event ApplicationSubmitted(address indexed agentAddr, address indexed deployerAddr, string agentURI)",
  "event AgentRegistered(uint256 indexed tokenId, address indexed agentAddr, address indexed creator, string agentURI)",
];

// ── Parse args ─────────────────────────────────────────────────────────────────
const AGENT_PRIVATE_KEY  = process.env.AGENT_PRIVATE_KEY;
const DEPLOYER_ADDRESS   = process.env.DEPLOYER_ADDRESS;
const AGENT_URI          = process.env.AGENT_URI;
const AUTONOMOUS         = process.argv.includes("--autonomous");

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

function ok(msg) {
  console.log(`✅ ${msg}`);
}

// ── Validate inputs ────────────────────────────────────────────────────────────
if (!AGENT_PRIVATE_KEY) fail("AGENT_PRIVATE_KEY is required");
if (!AGENT_URI)         fail("AGENT_URI is required (e.g. ipfs://Qm...)");
if (!AUTONOMOUS && !DEPLOYER_ADDRESS) fail("DEPLOYER_ADDRESS is required (or use --autonomous flag)");

// ── Connect ────────────────────────────────────────────────────────────────────
console.log("\n🔌 Connecting to Arc Testnet...");
const provider = new ethers.JsonRpcProvider(RPC_URL, {
  chainId: CHAIN_ID,
  name: "arc-testnet",
});

const wallet   = new ethers.Wallet(AGENT_PRIVATE_KEY, provider);
const registry = new ethers.Contract(IDENTITY_REGISTRY_ADDRESS, IDENTITY_REGISTRY_ABI, wallet);

console.log(`🔑 Agent address: ${wallet.address}`);

// ── Check balance ─────────────────────────────────────────────────────────────
const balance = await provider.getBalance(wallet.address);
const balanceEth = ethers.formatEther(balance);
console.log(`💰 Balance: ${balanceEth} ETH`);

if (balance === 0n) {
  fail(
    `Agent has 0 ETH on Arc Testnet.\n` +
    `  Get testnet ETH: https://faucet.testnet.arc.network\n` +
    `  Agent address: ${wallet.address}`
  );
}

// ── Check if already registered ───────────────────────────────────────────────
try {
  const registered = await registry.isRegistered(wallet.address);
  if (registered) {
    const agent = await registry.getAgentByAddress(wallet.address);
    console.log("\n⚠️  Agent is already registered:");
    console.log(`   Token ID: ${agent.tokenId}`);
    console.log(`   Status:   ${["AUTONOMOUS","ENDORSEMENT_REQUESTED","ENDORSED"][agent.status] ?? agent.status}`);
    console.log(`   URI:      ${agent.agentURI}`);
    process.exit(0);
  }
} catch (_) { /* function might not exist on this ABI version */ }

// ── Check existing application ─────────────────────────────────────────────────
try {
  const hasApp = await registry.hasApplication(wallet.address);
  if (hasApp) {
    console.log("\n⚠️  Application already submitted. Waiting for deployer approval.");
    console.log(`   Deployer: ${DEPLOYER_ADDRESS}`);
    process.exit(0);
  }
} catch (_) {}

// ── Submit ─────────────────────────────────────────────────────────────────────
let tx, receipt;

if (AUTONOMOUS) {
  console.log("\n📋 Mode: AUTONOMOUS (no deployer)");
  console.log(`📄 Agent URI: ${AGENT_URI}`);
  console.log("\n⏳ Submitting registration...");

  tx = await registry.register(AGENT_URI);
} else {
  console.log("\n📋 Mode: DEPLOYER VETTING");
  console.log(`📄 Agent URI:      ${AGENT_URI}`);
  console.log(`👤 Deployer:       ${DEPLOYER_ADDRESS}`);
  console.log("\n⏳ Submitting application...");

  tx = await registry.submitApplication(DEPLOYER_ADDRESS, AGENT_URI);
}

console.log(`📨 TX hash: ${tx.hash}`);
console.log("⏳ Waiting for confirmation...");

receipt = await tx.wait();

// ── Save result ─────────────────────────────────────────────────────────────────
const result = {
  agentAddress: wallet.address,
  mode: AUTONOMOUS ? "autonomous" : "vetting",
  deployerAddress: AUTONOMOUS ? null : DEPLOYER_ADDRESS,
  agentURI: AGENT_URI,
  txHash: tx.hash,
  blockNumber: receipt.blockNumber,
  gasUsed: receipt.gasUsed.toString(),
  status: receipt.status === 1 ? "success" : "failed",
  timestamp: new Date().toISOString(),
};

import { writeFileSync } from "fs";
writeFileSync("./arc-id-result.json", JSON.stringify(result, null, 2));

// ── Done ─────────────────────────────────────────────────────────────────────
console.log(`\n✅ Done! Block: ${receipt.blockNumber} | Gas: ${receipt.gasUsed}`);
console.log(`🔍 Explorer: https://testnet.arcscan.app/tx/${tx.hash}`);
console.log(`💾 Result saved: ./arc-id-result.json`);

if (AUTONOMOUS) {
  console.log("\n📌 Next steps:");
  console.log("  - Your NFT is minted! You are now a registered AUTONOMOUS agent.");
  console.log("  - Update your passport anytime: setAgentURI(newCID)");
  console.log("  - Request endorsement from a deployer: requestEndorsement(agentId, deployerAddr)");
} else {
  console.log("\n📌 Next steps:");
  console.log(`  1. Notify deployer (${DEPLOYER_ADDRESS}) to run approveApplication(${wallet.address})`);
  console.log("  2. Once approved, your Soulbound NFT will be minted.");
  console.log("  3. Check status: https://testnet.arcscan.app/address/" + wallet.address);
}
