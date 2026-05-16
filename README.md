# Spike

Quantum-safe, quantum-enhanced autonomous DeFi AI agent on [0G Network](https://0g.ai).

Spike combines post-quantum cryptography (PQC), scipy-powered portfolio optimization, and 0G's decentralized storage + compute layers to deploy self-rebalancing on-chain agents whose configurations are Kyber-encrypted, Dilithium-signed, and stored on 0G Storage — never held in plaintext.

---
https://github.com/user-attachments/assets/723ca769-c076-4df2-8431-79eb431f1248

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│  apps/web  (Next.js 15)                                                  │
│  Landing → Connect Wallet → PQC Keygen → Skill → Configure → Deploy → Dashboard │
└─────────────────────────┬────────────────────────────────────────────────┘
                          │ REST (localhost:3001)
┌─────────────────────────▼────────────────────────────────────────────────┐
│  packages/agent  (Express :3001)                                         │
│  Decision loop: prices → QPU weights → drift check → Dilithium3 sign    │
│  Logs every action to 0G Storage; recordAction hook for on-chain scoring │
└──────┬──────────────────────────────────────┬────────────────────────────┘
       │ HTTP (localhost:8000)                 │ SDK
┌──────▼──────┐                    ┌──────────▼──────────────┐
│  services/  │                    │  packages/0g-client      │
│  quantum    │                    │  0G Storage upload/KV    │
│  (FastAPI)  │                    │  0G Compute broker       │
│  FastAPI    │                    │  QPU result cache (6hr)  │
│  SLSQP      │                    └──────────┬───────────────┘
└─────────────┘                               │
                           ┌──────────────────▼──────────────────┐
                           │  0G Chain (EVM, chainId 16602)       │
                           │  PQCKeyRegistry                      │
                           │  TeeAttestationVerifier              │
                           │  SkillRegistry                       │
                           │  AgentNFT (INFT / ERC-721)           │
                           │  AgentRegistry (+ PerformanceScorer) │
                           └─────────────────────────────────────┘
```

### Packages

| Path | Description |
|------|-------------|
| `packages/contracts` | Hardhat — 5 Solidity contracts on 0G Chain |
| `packages/pqc` | `@noble/post-quantum` — ML-DSA-65 (Dilithium3) signing, ML-KEM-1024 (Kyber) encryption |
| `packages/0g-client` | 0G Storage SDK + 0G Compute broker, shared TypeScript types |
| `packages/agent` | DeFi agent decision loop + Express REST API |
| `packages/skills` | On-chain skill definitions (lp-provider, dca-strategy, lending-borrowing, sim-trade) |
| `services/quantum` | FastAPI — scipy/SLSQP portfolio optimizer, Monte Carlo VaR/CVaR risk sim, rebalancer |
| `apps/web` | Next.js 15 App Router frontend |

---

## Key Design Decisions

### Post-Quantum Cryptography
- **ML-DSA-65 (Dilithium3)** (NIST FIPS 204) signs every agent action before it is written on-chain
- **ML-KEM-1024 (Kyber-1024)** (NIST FIPS 203) + AES-256-GCM encrypts agent configs before upload to 0G Storage
- Both algorithms run via `@noble/post-quantum` in the browser — private keys never leave the client in plaintext
- Key fingerprints are registered on `PQCKeyRegistry.sol`; the agent checks registration before executing any trade

### On-Chain Skill Registry
- `SkillRegistry` stores four DeFi skills on-chain: LP Provider, DCA Strategy, Lending/Borrowing, Simulated Trade
- Users select a skill during the configure wizard; the `skillKey` (keccak256 of skill ID) is passed to `deployAgent`
- `AgentRegistry` enforces that the skill is active in `SkillRegistry` at deploy time

### Agent NFT (INFT)
- Every deployed agent mints an ERC-721 `AgentNFT` that stores the agent's Dilithium fingerprint and skill key
- `tokenURI` returns live performance metadata: total actions, success rate, PnL bps, sourced from `AgentRegistry`
- PQC-gated transfers: the receiving wallet must have a registered PQC key

### Portfolio Optimization
- `services/quantum` runs **FastAPI + scipy** locally — no external service required
- Portfolio weights use classical Markowitz (SLSQP) with an efficient frontier calculation
- VaR-95 / CVaR-99 are estimated via Monte Carlo simulation (log-normal, 100k samples)
- Rebalance trades are selected by a greedy cost-minimizing algorithm
- Optimization results are cached in **0G Storage KV for 6 hours**, keyed by portfolio hash — the agent skips re-running if drift is below `driftThreshold`

### 0G Network Integration
- **0G Storage** (`@0gfoundation/0g-storage-ts-sdk`): stores Kyber-encrypted agent configs and appends immutable audit logs
- **0G Compute** (`@0glabs/0g-serving-broker`): runs `inferMarketRegime` to classify the current market as bull / bear / sideways / volatile (requires `ZG_INFERENCE_PROVIDER`)
- **0G Chain** (EVM, chainId 16602 testnet): five smart contracts govern key registration, attestation, skill catalog, agent NFTs, and lifecycle

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| Node.js | 18 |
| pnpm | 9 |
| Python | 3.11+ |
| Docker | 24 (optional, for quantum service container) |

---

## Setup

### 1. Clone and install

```bash
git clone <repo-url> spike
cd spike
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in the required values:

| Variable | Where to get it |
|----------|----------------|
| `DEPLOYER_PRIVATE_KEY` | Your 0G Chain wallet private key |
| `NEXT_PUBLIC_WC_PROJECT_ID` | [WalletConnect Cloud](https://cloud.walletconnect.com) → create a project |
| `ZG_INFERENCE_PROVIDER` | 0G Compute inference provider address (optional — market regime feature) |
| `ZG_MLDSA_VERIFY_PROVIDER` | 0G Compute TeeML provider address (optional — TEE attestation feature) |

The 0G Network RPC, indexer, and KV URLs are pre-filled for testnet and can be left as-is.

### 3. Compile and deploy contracts

```bash
pnpm contracts:compile
pnpm contracts:deploy:testnet
```

The deploy script saves `packages/contracts/deployments.json` and registers the four default skills in `SkillRegistry`. Copy **all five** addresses into `.env`:

```
NEXT_PUBLIC_PQC_KEY_REGISTRY=0x...
NEXT_PUBLIC_TEE_VERIFIER=0x...
NEXT_PUBLIC_SKILL_REGISTRY=0x...
NEXT_PUBLIC_AGENT_NFT=0x...
NEXT_PUBLIC_AGENT_REGISTRY=0x...
```

> If deploying to Netlify, update all five addresses in `netlify.toml` under `[build.environment]` as well.

### 4. Start each service

The project has three services that must each run in their own terminal.

---

#### Terminal 1 — Portfolio optimizer (`http://localhost:8000`)

```bash
cd services/quantum

# First time only: create venv and install deps
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Start (subsequent runs)
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

Expected output:
```
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

Verify it's up:
```bash
curl http://localhost:8000/health
# {"status":"ok","backend":"scipy_slsqp","type":"classical"}
```

---

#### Terminal 2 — Agent API (`http://localhost:3001`)

```bash
# From the repo root
pnpm --filter @spike/agent dev
```

Expected output:
```
@spike/agent:dev: Agent API listening on :3001
```

The agent server manages per-agent decision loops. It polls CoinGecko prices, runs SLSQP optimization via the quantum service, checks drift, and queues `pendingActions` for the frontend to submit on-chain.

---

#### Terminal 3 — Next.js frontend (`http://localhost:3000`)

```bash
# From the repo root
pnpm --filter @spike/web dev
```

Expected output:
```
@spike/web:dev: ▲ Next.js 15.x
@spike/web:dev: - Local: http://localhost:3000
```

---

#### All services at once (Turborepo)

If you prefer a single terminal:

```bash
pnpm dev
```

This runs all three in parallel. Logs from all services are interleaved and prefixed with the package name.

> **Note:** The quantum service (`services/quantum`) is a Python project outside Turborepo's graph. Make sure its venv is activated and `uvicorn` is running before `pnpm dev`, or start it manually in a separate terminal.

---

## Frontend Screens

| Screen | Route | Description |
|--------|-------|-------------|
| 01 Landing | `/` | Hero, protocol stats, feature overview |
| 02 Connect Wallet | `/app` | MetaMask / WalletConnect / Coinbase modal |
| 03 PQC Keygen | `/app/setup` | Generates ML-DSA-65 + ML-KEM-1024 keypairs in-browser, registers on-chain |
| 04 Configure Wizard | `/app/configure` | **Step 0:** Skill selection from on-chain `SkillRegistry`; then Risk profile, assets, APY/drawdown targets |
| 05 Review & Deploy | `/app/review` | Strategy summary (includes selected skill), PQC registration, `deployAgent` → mints AgentNFT |
| 06 Dashboard | `/app/dashboard` | Live allocation chart, Sharpe 30d, VaR/CVaR, Agent NFT card (fingerprint, skill, performance score), audit log |

---

## API Reference

### Quantum Service (`http://localhost:8000`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Returns `{ status, backend, type }` |
| GET | `/supported-backends` | Lists available optimizer backends |
| POST | `/optimize` | Portfolio optimization — returns weights, Sharpe, efficient frontier |
| POST | `/risk` | Risk simulation — returns VaR-95, CVaR-99, stress PnL scenarios |
| POST | `/rebalance` | Rebalance optimizer — returns ranked trade candidates |

### Agent API (`http://localhost:3001`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health |
| POST | `/api/agent/register` | Register and start an agent with a given config |
| GET | `/api/agent/status/:agentId` | Current agent state |
| POST | `/api/agent/pause/:agentId` | Pause agent execution |
| POST | `/api/agent/resume/:agentId` | Resume agent execution |

---

## Smart Contracts

### Deployed — 0G Testnet (Chain ID 16602)

> Deployed 2026-05-13. If you redeploy, update all addresses in `.env` and `netlify.toml`.

| Contract | Address |
|----------|---------|
| `PQCKeyRegistry` | `0xa7e58D52e99AB7bC2F3B98475AF2BF8a8B3F97b2` |
| `TeeAttestationVerifier` | `0x1922B98277A5eC6201B935386229367Dc4bF16b6` |
| `SkillRegistry` | `0x659f6969c383bFD0890830c4BF475B602524Eb3C` |
| `AgentNFT` | `0xB21F191F63Bdde9342D7aa33d4F3115c0B7Af6bD` |
| `AgentRegistry` | `0xb9fA9A2582B00C62E8A43E689Ccd560Ed1161CAD` |

### Contract Summaries

**`PQCKeyRegistry`** — stores ML-DSA-65 and ML-KEM-1024 public key fingerprints per wallet.
```
register(dilithiumFp, kyberFp, storageRoot)
rotate(dilithiumFp, kyberFp, storageRoot)
revoke()
getKeys(address) → (dilithiumFp, kyberFp, storageRoot, timestamp)
isRegistered(address) → bool
```

**`TeeAttestationVerifier`** — stores Intel TDX TEE attestation proofs. `AgentRegistry` calls `isVerified` before allowing `deployAgent`. An off-chain attestor must call `registerVerification` with the user's signature fingerprints before the user can deploy.
```
registerVerification(pubkeyFp, configRoot, actionSigFp)
isVerified(pubkeyFp, configRoot, actionSigFp) → bool
```

**`SkillRegistry`** — on-chain catalog of approved DeFi skills (Ownable).
```
getAllSkills() → Skill[]
getSkill(skillKey) → Skill
isActive(skillKey) → bool
skillCount() → uint256
```

**`AgentNFT`** — ERC-721 with PQC-gated transfers and live `tokenURI` sourcing performance data from `AgentRegistry`.
```
getAgentMeta(tokenId) → (owner, dilithiumFp, skillKey, mintedAt)
ownerOf(tokenId) → address
tokenURI(tokenId) → string  // live JSON with performance data
```

**`AgentRegistry`** — agent lifecycle, performance scoring, wires all four contracts.
```
deployAgent(configRoot, actionSigFingerprint, attestationId, skillKey) → agentId
pauseAgent(agentId)
resumeAgent(agentId)
withdrawAgent(agentId)
updateConfig(agentId, newConfigRoot, dilithiumSig)
recordAction(agentId, actionHash, txHash)
getOwnerAgents(owner) → agentId[]
getPerformanceScore(agentId) → (totalActions, successRate, pnlBps)
```

---

## Testing

```bash
# All packages
pnpm test

# Contracts only
pnpm contracts:compile && pnpm --filter @spike/contracts test

# Quantum service only
cd services/quantum
source .venv/bin/activate
pytest
```

---

## Monorepo Build Order

Turborepo enforces this dependency chain:

```
contracts → pqc → 0g-client → agent → web
```

Running `pnpm build` resolves this automatically.

---

## Network Configuration

| Network | Chain ID | RPC |
|---------|----------|-----|
| 0G Testnet | `16602` | `https://evmrpc-testnet.0g.ai` |
| 0G Mainnet | `16661` | `https://evmrpc.0g.ai` |

Switch between networks via `NEXT_PUBLIC_ZG_NETWORK=testnet|mainnet` in `.env`.

---

## Known Limitations

- **Quantum and agent services are localhost-only.** `NEXT_PUBLIC_QUANTUM_URL` and `NEXT_PUBLIC_AGENT_URL` default to `localhost`. For a deployed frontend, host these services and update both env vars and the quantum service CORS origins.
- **TeeAttestationVerifier requires an off-chain attestor.** Before a user can call `deployAgent`, an attestor wallet must call `TeeAttestationVerifier.registerVerification` with the user's PQC fingerprint and config root. Without this, `deployAgent` reverts with `SignatureNotVerified`. A relayer service for this is not yet implemented.
- **Decision loop is not auto-scheduled.** The agent's decision loop logic (`runDecisionCycle`) is implemented but not triggered automatically — the agent server has no internal ticker. It must be invoked externally or wired to a scheduler.
- **`recordAction` on-chain is not wired in the agent server.** The callback hook exists in the decision loop but has no concrete implementation in the server, so on-chain performance scoring requires the frontend wallet to call `recordAction` directly.
- **0G Compute features require provider addresses.** `inferMarketRegime` (market regime classification) and TeeML signature verification require `ZG_INFERENCE_PROVIDER` and `ZG_MLDSA_VERIFY_PROVIDER` to be set; both are empty by default and the features are skipped.

---

## Project Structure

```
spike/
├── apps/
│   └── web/                    # Next.js 15 frontend
├── packages/
│   ├── contracts/              # Solidity 0.8.24 + Hardhat
│   ├── pqc/                    # ML-DSA-65 + ML-KEM-1024 (@noble/post-quantum)
│   ├── 0g-client/              # 0G Storage / KV / Compute client
│   ├── agent/                  # Decision loop + REST API
│   └── skills/                 # Skill markdown definitions
├── services/
│   └── quantum/                # FastAPI + scipy SLSQP
├── .env.example
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, wagmi v2, viem, Tailwind CSS, Recharts, Framer Motion, Radix UI |
| Agent | TypeScript, Express, Zod |
| Optimizer | Python 3.11+, FastAPI, numpy, scipy (SLSQP, Monte Carlo) |
| Cryptography | `@noble/post-quantum` (ML-DSA-65, ML-KEM-1024), AES-256-GCM |
| Blockchain | Solidity 0.8.24, Hardhat, ethers v6, ERC-721 |
| 0G SDK | `@0gfoundation/0g-storage-ts-sdk` v1.2.6, `@0glabs/0g-serving-broker` v0.7.4 |
| Tooling | pnpm workspaces, Turborepo, Docker |
