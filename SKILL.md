---
name: arc-id
description: Manages Arc ID agent identity on Arc Testnet (chainId 5042002). Use when an agent needs to register on Arc ID, submit or approve a registration application, request or grant an endorsement, update an agent passport, or run the XMTP event watcher for registry notifications. Don't use for general Ethereum/EVM tasks, non-Arc-ID contracts, or Arc Network token/payment operations.
---

# Arc ID Skill

Arc ID is a Soulbound NFT identity registry for autonomous agents on Arc Testnet. Each registered agent holds a non-transferable NFT passport linked to their EOA address.

**Dependencies:** `npm install` inside `scripts/` before first run.
**Contracts + ABI:** See `references/contracts.md`.
**Registration flows:** See `references/flows.md`.

---

## 1. Check registration status

Before any action, verify if the agent is already registered:

```bash
AGENT_PRIVATE_KEY=0x... node scripts/register.js
# The script checks isRegistered() and hasApplication() before submitting.
```

If already registered, script exits with current token ID and status.

---

## 2. Create passport

1. Copy `assets/passport.template.json` → `my-passport.json`
2. Fill in: `name`, `description`, `capabilities`, `endpoint` (xmtp://0xAGENT_ADDRESS), `identity.address`, `identity.inboxId`
3. Upload to IPFS (priority: local node → Pinata → nft.storage → local CID):

```bash
node scripts/upload-passport.js --file ./my-passport.json
# Uses local IPFS node by default (http://127.0.0.1:5001)
# Override: IPFS_API_URL=http://host:5001 IPFS_GATEWAY_URL=http://host:8080
# Output: ipfs://Qm... → use as AGENT_URI
```

Public gateway: `http://57.131.42.146:8080/ipfs/<CID>`

---

## 3. Register

Choose flow based on context. Read `references/flows.md` to decide which flow applies.

**Autonomous (default):**
```bash
AGENT_PRIVATE_KEY=0x... \
AGENT_URI=ipfs://Qm... \
node scripts/register.js --autonomous
```

**Vetting (deployer invited):**
```bash
AGENT_PRIVATE_KEY=0x... \
DEPLOYER_ADDRESS=0xd4930b7eCc599f72fE876ab3895BccC833EB0a75 \
AGENT_URI=ipfs://Qm... \
node scripts/register.js
```

Output: `arc-id-result.json` with tx hash, block, status. Check status at `https://testnet.arcscan.app`.

**Prerequisite:** Agent wallet must have ETH on Arc Testnet. If balance is 0, script exits with faucet URL.

---

## 4. Request endorsement (post-registration)

After autonomous registration, request endorsement from deployer:

Call `ArcIdentityRegistry.requestEndorsement(agentId, deployerAddr)` via ethers.js using agent's wallet. See `references/contracts.md` for ABI.

---

## 5. Start event watcher

Watcher monitors registry events and sends XMTP DMs to relevant parties.

```bash
NOTIFIER_PRIVATE_KEY=0x... node scripts/watcher.js
# Options: XMTP_ENV=dev|production  POLL_INTERVAL_MS=30000
```

Handles: `EndorsementRequested` → notify endorser, `ApplicationSubmitted` → notify deployer, `AgentRegistered` → notify agent.

State persisted in `watcher-state.json`. Safe to restart.

---

## 6. Update passport

Upload new JSON → get new CID → call `setAgentURI(newCID)` via ethers.js using agent's wallet.
