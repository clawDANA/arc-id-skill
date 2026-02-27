# Arc ID Contracts — Reference

## Network

| Field    | Value                                  |
|----------|----------------------------------------|
| Network  | Arc Testnet                            |
| Chain ID | 5042002                                |
| RPC      | https://rpc.testnet.arc.network        |
| Explorer | https://testnet.arcscan.app            |
| Faucet   | https://faucet.testnet.arc.network     |

## Deployed Addresses

| Contract              | Address                                      |
|-----------------------|----------------------------------------------|
| ArcIdentityRegistry   | `0x56c905c60c5ec61C103C99459290AdBf73976d12` |
| ArcReputationRegistry | `0xB9fe6bDE6cDa48FDD8C93222B4b5072260bd3c8f` |
| ArcNameService        | `0x94D8722663e5d35c9846e551a91Cd8e7a225637B` |
| ArcIDGuardian         | `0xf249DE8ac7c86A5044EC4B23daCC89a2e4e6a79d` |

**Default deployer:** `0xd4930b7eCc599f72fE876ab3895BccC833EB0a75`

## ArcIdentityRegistry ABI (essential methods)

```json
[
  "function register(string calldata agentURI) external returns (uint256 tokenId)",
  "function submitApplication(address deployerAddr, string calldata agentURI) external",
  "function approveApplication(address agentAddr) external",
  "function setAgentURI(string calldata newURI) external",
  "function requestEndorsement(uint256 agentId, address endorserAddr) external",
  "function endorse(uint256 agentId) external",
  "function getAgentByAddress(address agentAddr) external view returns (uint256 tokenId, string memory agentURI, uint8 status, address creator)",
  "function getAgentById(uint256 tokenId) external view returns (address agentAddr, string memory agentURI, uint8 status, address creator)",
  "function isRegistered(address agentAddr) external view returns (bool)",
  "function hasApplication(address agentAddr) external view returns (bool)",
  "event AgentRegistered(uint256 indexed tokenId, address indexed agentAddr, address indexed creator, string agentURI)",
  "event ApplicationSubmitted(address indexed agentAddr, address indexed deployerAddr, string agentURI)",
  "event EndorsementRequested(uint256 indexed agentId, address indexed agentAddr, address indexed endorserAddr)",
  "event AgentEndorsed(uint256 indexed agentId, address indexed endorserAddr)",
  "event AgentSuspended(uint256 indexed agentId, address indexed suspendedBy, string reason)"
]
```

## Agent Status Codes

| Code | Label                 | Meaning                              |
|------|-----------------------|--------------------------------------|
| 0    | AUTONOMOUS            | Self-registered, no creator          |
| 1    | ENDORSEMENT_REQUESTED | Waiting for endorser to confirm      |
| 2    | ENDORSED              | Endorsed by a deployer/endorser      |
| 3    | SUSPENDED             | Suspended by guardian or endorser    |
