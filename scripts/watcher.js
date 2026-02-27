#!/usr/bin/env node
/**
 * Arc ID Watcher
 * Monitors ArcIdentityRegistry for on-chain events and sends XMTP notifications.
 *
 * Watched events:
 *   - EndorsementRequested → notify endorser via XMTP
 *   - ApplicationSubmitted → notify deployer via XMTP
 *   - AgentRegistered      → notify agent (if reachable) + deployer if creator
 *
 * State: last processed block saved to ./watcher-state.json
 *
 * Usage:
 *   NOTIFIER_PRIVATE_KEY=0x... node watcher.js
 *
 * Env vars:
 *   NOTIFIER_PRIVATE_KEY  — XMTP sender wallet (e.g. alephOne's key)
 *   POLL_INTERVAL_MS      — polling interval (default 30000)
 *   FROM_BLOCK            — start block (default: current - 1000)
 *   XMTP_ENV              — dev | production (default: dev)
 */

import { ethers } from "ethers";
import { Agent, createUser, createSigner } from "@xmtp/agent-sdk";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

// ── Config ─────────────────────────────────────────────────────────────────────
const RPC_URL       = "https://rpc.testnet.arc.network";
const CHAIN_ID      = 5042002;
const REGISTRY_ADDR = "0x56c905c60c5ec61C103C99459290AdBf73976d12";
const STATE_FILE    = resolve("./watcher-state.json");
const POLL_MS       = parseInt(process.env.POLL_INTERVAL_MS ?? "30000");
const XMTP_ENV      = process.env.XMTP_ENV ?? "dev";

const NOTIFIER_KEY  = process.env.NOTIFIER_PRIVATE_KEY;
if (!NOTIFIER_KEY) {
  console.error("❌ NOTIFIER_PRIVATE_KEY is required");
  process.exit(1);
}

// ── ABI ────────────────────────────────────────────────────────────────────────
const REGISTRY_ABI = [
  // Events
  "event AgentRegistered(uint256 indexed tokenId, address indexed agentAddr, address indexed creator, string agentURI)",
  "event ApplicationSubmitted(address indexed agentAddr, address indexed deployerAddr, string agentURI)",
  "event EndorsementRequested(uint256 indexed agentId, address indexed agentAddr, address indexed endorserAddr)",
  "event AgentEndorsed(uint256 indexed agentId, address indexed endorserAddr)",
  "event AgentSuspended(uint256 indexed agentId, address indexed suspendedBy, string reason)",

  // Views
  "function getAgentByAddress(address agentAddr) external view returns (uint256 tokenId, string memory agentURI, uint8 status, address creator)",
  "function getAgentById(uint256 tokenId) external view returns (address agentAddr, string memory agentURI, uint8 status, address creator)",
];

const STATUS_LABELS = ["AUTONOMOUS", "ENDORSEMENT_REQUESTED", "ENDORSED", "SUSPENDED"];

// ── State ──────────────────────────────────────────────────────────────────────
function loadState() {
  if (existsSync(STATE_FILE)) {
    try { return JSON.parse(readFileSync(STATE_FILE, "utf8")); } catch (_) {}
  }
  return { lastBlock: null };
}
function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ── XMTP ──────────────────────────────────────────────────────────────────────
let xmtpAgent = null;

async function initXmtp() {
  console.log(`🔌 Initializing XMTP (env=${XMTP_ENV})...`);
  const user   = createUser(NOTIFIER_KEY);
  const signer = createSigner(user);
  xmtpAgent = await Agent.create(signer, {
    env: XMTP_ENV,
    appVersion: "arc-id-watcher/1.0.0",
  });
  await xmtpAgent.start();
  console.log(`✅ XMTP ready | sender=${xmtpAgent.address}`);
}

async function sendXmtp(toAddress, message) {
  if (!xmtpAgent) return;
  try {
    const dm = await xmtpAgent.createDmWithAddress(toAddress);
    await dm.sendText(message);
    console.log(`📨 XMTP → ${toAddress}: ${message.slice(0, 60)}...`);
  } catch (err) {
    console.warn(`⚠️  XMTP send failed to ${toAddress}: ${err.message}`);
  }
}

// ── Notification templates ─────────────────────────────────────────────────────
function msgEndorsementRequested(agentAddr, agentId, endorserAddr, agentURI) {
  return [
    `🆔 Arc ID — Endorsement Request`,
    ``,
    `Agent ${agentAddr} (ID: #${agentId}) is requesting your endorsement.`,
    ``,
    `Passport: ${agentURI}`,
    ``,
    `To endorse, call:`,
    `  ArcIdentityRegistry.endorse(${agentId})`,
    `  Contract: 0x56c905c60c5ec61C103C99459290AdBf73976d12`,
    `  Explorer: https://testnet.arcscan.app/address/${REGISTRY_ADDR}`,
  ].join("\n");
}

function msgApplicationSubmitted(agentAddr, deployerAddr, agentURI) {
  return [
    `📋 Arc ID — Application Submitted`,
    ``,
    `Agent ${agentAddr} submitted a registration application to your deployer address.`,
    ``,
    `Passport: ${agentURI}`,
    ``,
    `To approve, call:`,
    `  ArcIdentityRegistry.approveApplication("${agentAddr}")`,
    `  Contract: 0x56c905c60c5ec61C103C99459290AdBf73976d12`,
    `  Explorer: https://testnet.arcscan.app/address/${REGISTRY_ADDR}`,
  ].join("\n");
}

function msgAgentRegistered(agentAddr, tokenId, agentURI) {
  return [
    `✅ Arc ID — Agent Registered`,
    ``,
    `Your agent has been registered on Arc Testnet.`,
    `Token ID: #${tokenId}`,
    `Address: ${agentAddr}`,
    `Passport: ${agentURI}`,
    ``,
    `View: https://testnet.arcscan.app/token/${REGISTRY_ADDR}/${tokenId}`,
  ].join("\n");
}

// ── Main poll loop ─────────────────────────────────────────────────────────────
async function poll(provider, registry, state) {
  const currentBlock = await provider.getBlockNumber();
  const fromBlock    = state.lastBlock != null ? state.lastBlock + 1 : Math.max(0, currentBlock - 1000);

  if (fromBlock > currentBlock) return; // Nothing new

  console.log(`🔍 Scanning blocks ${fromBlock} → ${currentBlock}...`);

  const filter = { fromBlock, toBlock: currentBlock };

  // ── EndorsementRequested ────────────────────────────────────────────────────
  try {
    const events = await registry.queryFilter(registry.filters.EndorsementRequested(), fromBlock, currentBlock);
    for (const ev of events) {
      const { agentId, agentAddr, endorserAddr } = ev.args;
      console.log(`🔔 EndorsementRequested: agent=${agentAddr} id=${agentId} → endorser=${endorserAddr}`);

      let agentURI = "unknown";
      try {
        const info = await registry.getAgentById(agentId);
        agentURI = info.agentURI;
      } catch (_) {}

      await sendXmtp(endorserAddr, msgEndorsementRequested(agentAddr, agentId, endorserAddr, agentURI));
    }
  } catch (err) {
    console.warn(`⚠️  EndorsementRequested query error: ${err.message}`);
  }

  // ── ApplicationSubmitted ────────────────────────────────────────────────────
  try {
    const events = await registry.queryFilter(registry.filters.ApplicationSubmitted(), fromBlock, currentBlock);
    for (const ev of events) {
      const { agentAddr, deployerAddr, agentURI } = ev.args;
      console.log(`🔔 ApplicationSubmitted: agent=${agentAddr} → deployer=${deployerAddr}`);
      await sendXmtp(deployerAddr, msgApplicationSubmitted(agentAddr, deployerAddr, agentURI));
    }
  } catch (err) {
    console.warn(`⚠️  ApplicationSubmitted query error: ${err.message}`);
  }

  // ── AgentRegistered ─────────────────────────────────────────────────────────
  try {
    const events = await registry.queryFilter(registry.filters.AgentRegistered(), fromBlock, currentBlock);
    for (const ev of events) {
      const { tokenId, agentAddr, creator, agentURI } = ev.args;
      console.log(`🔔 AgentRegistered: agent=${agentAddr} id=${tokenId} creator=${creator}`);
      // Notify the agent itself
      await sendXmtp(agentAddr, msgAgentRegistered(agentAddr, tokenId, agentURI));
    }
  } catch (err) {
    console.warn(`⚠️  AgentRegistered query error: ${err.message}`);
  }

  state.lastBlock = currentBlock;
  saveState(state);
}

// ── Entry point ────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🚀 Arc ID Watcher starting...`);
  console.log(`   Chain:    Arc Testnet (${CHAIN_ID})`);
  console.log(`   Registry: ${REGISTRY_ADDR}`);
  console.log(`   Poll:     every ${POLL_MS / 1000}s`);
  console.log(`   XMTP env: ${XMTP_ENV}\n`);

  const provider = new ethers.JsonRpcProvider(RPC_URL, { chainId: CHAIN_ID, name: "arc-testnet" });
  const registry = new ethers.Contract(REGISTRY_ADDR, REGISTRY_ABI, provider);

  await initXmtp();

  const state = loadState();
  console.log(`📂 State: lastBlock=${state.lastBlock ?? "fresh"}`);

  // First poll immediately
  await poll(provider, registry, state);

  // Then poll on interval
  setInterval(async () => {
    try {
      await poll(provider, registry, state);
    } catch (err) {
      console.error(`❌ Poll error: ${err.message}`);
    }
  }, POLL_MS);

  console.log(`\n👂 Watching for events... (Ctrl+C to stop)\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
