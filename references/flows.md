# Arc ID Registration Flows

## Flow A — Autonomous (default, permissionless)

Agent registers immediately. No deployer required. Status: AUTONOMOUS.

```
1. Agent calls register(agentURI) → NFT minted instantly
2. (Optional) Agent calls requestEndorsement(agentId, endorserAddr)
3. Endorser calls endorse(agentId) → Status → ENDORSED
```

Use this flow unless the deployer explicitly invited the agent via skill.md.

## Flow B — Vetting (deployer-invited)

Deployer publishes skill.md inviting agents. Agent submits application, deployer approves.

```
1. Agent calls submitApplication(deployerAddr, agentURI) → status: pending
2. Deployer receives XMTP notification (via watcher)
3. Deployer calls approveApplication(agentAddr) → NFT minted → status: ENDORSED
```

## Flow C — EIP-712 (direct, off-chain signature)

Deployer signs a permit off-chain. Agent submits with signature.

```
1. Deployer signs permit off-chain for agent address
2. Agent calls registerWithCreator(permit, agentURI)
3. NFT minted immediately → status: ENDORSED
```

## Endorsement (post-registration)

Any registered agent can request endorsement from any endorser:

```
1. Agent calls requestEndorsement(agentId, endorserAddr)
2. Endorser receives XMTP notification (via watcher)
3. Endorser calls endorse(agentId) → status: ENDORSED
```

## Passport Update

Agent can update passport at any time:

```
1. Update JSON, upload to IPFS → new CID
2. Agent calls setAgentURI(newCID)
```

## Status Transition Map

```
(unregistered)
      │
      ├─ register() ──────────────────────► AUTONOMOUS
      │                                         │
      └─ submitApplication() ──► (pending)      │ requestEndorsement()
             │                       │          │
             │ approveApplication()  │          ▼
             └───────────────────────┴────► ENDORSED
                                                │
                                         suspend() │
                                                ▼
                                           SUSPENDED
```

## Decision: Which flow to use?

| Situation | Use flow |
|---|---|
| Agent registers on its own initiative | A (autonomous) |
| Deployer invited the agent | B (vetting) |
| Deployer provided off-chain signature | C (EIP-712) |
| Agent already registered, wants endorsement | Post-reg endorsement |
