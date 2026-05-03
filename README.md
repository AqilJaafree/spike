# Spike

Quantum-safe, quantum-enhanced autonomous DeFi AI agent on [0G Network](https://0g.ai).

Spike combines post-quantum cryptography (PQC), Qiskit-powered portfolio optimization, and 0G's decentralized storage + compute layers to deploy self-rebalancing on-chain agents whose configurations are Kyber-encrypted, Dilithium-signed, and stored on 0G Storage — never held in plaintext.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  apps/web  (Next.js 15)                                         │
│  Landing → Connect Wallet → PQC Keygen → Configure → Deploy → Dashboard │
└────────────────────────┬────────────────────────────────────────┘
                         │ REST
┌────────────────────────▼────────────────────────────────────────┐
│  packages/agent  (Express)                                      │
│  Decision loop: prices → QPU weights → drift check → trade      │
│  Signs every action with Dilithium3, logs to 0G Storage         │
└──────┬─────────────────────────────────────┬────────────────────┘
       │ HTTP                                │ SDK
┌──────▼──────┐                   ┌──────────▼──────────┐
│  services/  │                   │  packages/0g-client  │
│  quantum    │                   │  0G Storage + Compute│
│  (FastAPI)  │                   │  QPU result cache    │
│  Qiskit Aer │                   └──────────┬───────────┘
│  portfolio  │                              │
│  risk / VaR │           ┌──────────────────▼─────────┐
└─────────────┘           │  0G Chain (EVM, id 16602)   │
                          │  PQCKeyRegistry              │
                          │  AgentRegistry               │
                          └────────────────────────────-─┘
```

### Packages

| Path | Description |
|------|-------------|
| `packages/contracts` | Hardhat — `PQCKeyRegistry` + `AgentRegistry` on 0G Chain |
| `packages/pqc` | liboqs-js WASM — Dilithium3 signing, Kyber-1024 + AES-256-GCM encryption |
| `packages/0g-client` | 0G Storage SDK + 0G Compute broker, shared TypeScript types |
| `packages/agent` | DeFi agent decision loop + Express REST API |
| `services/quantum` | FastAPI — Qiskit/Aer portfolio optimizer, VaR/CVaR risk sim, rebalancer |
| `apps/web` | Next.js 15 App Router frontend — 6 PRD screens |

---

## Key Design Decisions

### Post-Quantum Cryptography
- **Dilithium3** (NIST FIPS 204) signs every agent action before it is written on-chain
- **Kyber-1024** (NIST FIPS 203) + AES-256-GCM encrypts agent configs before upload to 0G Storage
- Both algorithms run as liboqs WASM in the browser — private keys never leave the client in plaintext
- Key fingerprints are registered on `PQCKeyRegistry.sol`; the agent checks registration before executing any trade

### Quantum-Enhanced Optimization
- `services/quantum` runs **Qiskit + Aer simulator** locally — no cloud account required
- Portfolio weights use classical scipy Markowitz (SLSQP) with an efficient frontier calculation
- VaR-95 / CVaR-99 are estimated via **Iterative Amplitude Estimation** (`StatevectorSampler`), falling back to Monte Carlo if the circuit fails
- Rebalance trades are selected by a greedy cost-minimizing algorithm
- Optimization results are cached in **0G Storage KV for 6 hours**, keyed by portfolio hash — the agent skips re-running if drift is below `driftThreshold`

### 0G Network Integration
- **0G Storage** (`@0gfoundation/0g-storage-ts-sdk`): stores Kyber-encrypted agent configs and appends immutable audit logs
- **0G Compute** (`@0glabs/0g-serving-broker`): runs `inferMarketRegime` to classify the current market as bull / bear / sideways / volatile
- **0G Chain** (EVM, chainId 16602 testnet / 16661 mainnet): `PQCKeyRegistry` and `AgentRegistry` smart contracts

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| Node.js | 18 |
| pnpm | 9 |
| Python | 3.11 |
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
| `ZG_INFERENCE_PROVIDER` | 0G Compute inference provider address (optional for local dev) |

The 0G Network RPC, indexer, and KV URLs are pre-filled for testnet and can be left as-is.

### 3. Compile and deploy contracts

```bash
pnpm contracts:compile
pnpm contracts:deploy:testnet
```

The deploy script saves `packages/contracts/deployments.json`. Copy the addresses into `.env`:

```
NEXT_PUBLIC_PQC_KEY_REGISTRY=0x...
NEXT_PUBLIC_AGENT_REGISTRY=0x...
```

### 4. Start the quantum service

**Option A — Python directly:**
```bash
cd services/quantum
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Option B — Docker:**
```bash
pnpm docker:quantum
docker run -p 8000:8000 spike-quantum
```

### 5. Start all services

```bash
pnpm dev
```

This starts (in parallel via Turborepo):
- Quantum service on `http://localhost:8000`
- Agent API on `http://localhost:3001`
- Next.js frontend on `http://localhost:3000`

---

## Frontend Screens

| Screen | Route | Description |
|--------|-------|-------------|
| 01 Landing | `/` | Hero, protocol stats, feature overview |
| 02 Connect Wallet | `/app` | MetaMask / WalletConnect / Coinbase modal |
| 03 PQC Keygen | `/app/setup` | Generates Dilithium3 + Kyber-1024 keypairs in-browser, registers on-chain |
| 04 Configure Wizard | `/app/configure` | Risk profile, asset selection, APY/drawdown targets, QRNG toggle |
| 05 Review & Deploy | `/app/review` | Strategy summary, security attestation, 5-step deploy animation |
| 06 Dashboard | `/app/dashboard` | Live allocation chart, Sharpe 30d, VaR/CVaR cards, audit log |

---

## API Reference

### Quantum Service (`http://localhost:8000`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Returns `{ status, backend, type }` |
| GET | `/supported-backends` | Lists available Aer backends |
| POST | `/optimize` | Portfolio optimization — returns weights, Sharpe, efficient frontier |
| POST | `/risk` | Risk simulation — returns VaR-95, CVaR-99, stress PnL scenarios |
| POST | `/rebalance` | Rebalance optimizer — returns ranked trade candidates |

### Agent API (`http://localhost:3001`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service health |
| POST | `/register` | Register and start an agent with a given config |
| GET | `/status/:agentId` | Current agent state |
| POST | `/pause/:agentId` | Pause agent execution |
| POST | `/resume/:agentId` | Resume agent execution |

---

## Smart Contracts

### Deployed & Verified — 0G Testnet (Chain ID 16602)

| Contract | Address | Explorer |
|----------|---------|---------|
| `PQCKeyRegistry` | [`0x300Fa0Af86201A410bEBD511Ca7FB81548a0f027`](https://explorer.0g.ai/testnet/blockchain/accounts/0x300fa0af86201a410bebd511ca7fb81548a0f027/transactions) | [View](https://explorer.0g.ai/testnet/blockchain/accounts/0x300fa0af86201a410bebd511ca7fb81548a0f027/transactions) |
| `AgentRegistry` | [`0x5bBE9D2735EEfDF453f71fe3f2bcD3E1cb8CB8B0`](https://explorer.0g.ai/testnet/blockchain/accounts/0x5bbe9d2735eefdF453f71fe3f2bcd3e1cb8cb8b0/transactions) | [View](https://explorer.0g.ai/testnet/blockchain/accounts/0x5bbe9d2735eefdF453f71fe3f2bcd3e1cb8cb8b0/transactions) |

`AgentRegistry` is deployed with `PQCKeyRegistry` as its constructor argument, enforcing that every agent owner must have on-chain PQC key registration.

---

### `PQCKeyRegistry`
Stores Dilithium3 and Kyber-1024 public key fingerprints per wallet address.

```
register(dilithiumFp, kyberFp, storageRoot)
rotate(dilithiumFp, kyberFp, storageRoot)
revoke()
getKeys(address) → (dilithiumFp, kyberFp, storageRoot, timestamp)
isRegistered(address) → bool
```

### `AgentRegistry`
Deploys and manages autonomous agents; requires PQC registration.

```
deployAgent(configRoot, dilithiumSig, attestationId) → agentId
pauseAgent(agentId)
resumeAgent(agentId)
withdrawAgent(agentId)
updateConfig(agentId, newConfigRoot, dilithiumSig)
recordAction(agentId, actionHash, txHash)
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

## Project Structure

```
spike/
├── apps/
│   └── web/                    # Next.js 15 frontend
├── packages/
│   ├── contracts/              # Solidity + Hardhat
│   ├── pqc/                    # Dilithium3 + Kyber WASM wrappers
│   ├── 0g-client/              # 0G Storage / Compute client
│   └── agent/                  # Decision loop + REST API
├── services/
│   └── quantum/                # FastAPI + Qiskit Aer
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
| Quantum | Python 3.11, FastAPI, Qiskit 2.2, Qiskit Aer, qiskit-finance, scipy |
| Cryptography | liboqs-js (Dilithium3, Kyber-1024), AES-256-GCM |
| Blockchain | Solidity 0.8, Hardhat, ethers v6, TypeChain |
| 0G SDK | @0gfoundation/0g-storage-ts-sdk v1.2.6, @0glabs/0g-serving-broker v0.7.4 |
| Tooling | pnpm workspaces, Turborepo, Docker |
