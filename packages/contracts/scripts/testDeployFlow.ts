/**
 * End-to-end test of the deployment flow against live 0G testnet.
 * Run: DEPLOYER_PRIVATE_KEY=<pk> pnpm redeploy:testnet --config hardhat.config.ts
 *  or: DEPLOYER_PRIVATE_KEY=<pk> npx hardhat run scripts/testDeployFlow.ts --network testnet
 */
import { ethers } from 'hardhat';

const CONTRACTS = {
  PQCKeyRegistry: '0xa7e58D52e99AB7bC2F3B98475AF2BF8a8B3F97b2',
  AgentNFT:       '0x523a0Abc03472D0fAdAF281e80536cF43638E66A',
  AgentRegistry:  '0x4d5E4Ec7401FAAA64BaE53b43F3F1332739962C0',
};

const PQC_ABI = [
  'function register(bytes32,bytes32,bytes32) external',
  'function isRegistered(address) external view returns (bool)',
];

const REGISTRY_ABI = [
  'function deployAgent(bytes32,bytes32,bytes32,bytes32) external returns (uint256)',
  'function getAgent(uint256) external view returns (tuple(address owner,bytes32 configRoot,bytes32 actionSigFingerprint,bytes32 attestationId,bytes32 skillKey,uint8 status,uint256 deployedAt,uint256 lastActionAt,uint256 rebalanceCount))',
  'function getOwnerAgents(address) external view returns (uint256[])',
  'event AgentDeployed(uint256 indexed agentId, address indexed owner, bytes32 configRoot, bytes32 attestationId, bytes32 skillKey)',
];

const NFT_ABI = [
  'function ownerOf(uint256) external view returns (address)',
  'function getAgentMeta(uint256) external view returns (tuple(bytes32 dilithiumFingerprint,bytes32 configRoot,bytes32 actionSigFingerprint,bytes32 skillKey,uint256 mintedAt))',
];

function pass(msg: string) { console.log(`  ✓ ${msg}`); }
function fail(msg: string): never { console.error(`  ✗ ${msg}`); process.exit(1); }

async function main() {
  const [signer] = await ethers.getSigners();
  console.log(`\nWallet:  ${signer.address}`);
  console.log(`Network: 0G Galileo testnet (chain 16602)\n`);

  const pqc      = await ethers.getContractAt(PQC_ABI, CONTRACTS.PQCKeyRegistry, signer);
  const registry = await ethers.getContractAt(REGISTRY_ABI, CONTRACTS.AgentRegistry, signer);
  const nft      = await ethers.getContractAt(NFT_ABI, CONTRACTS.AgentNFT, signer);

  // ── Step 1: PQC key registration ────────────────────────────────────────────
  console.log('Step 1 — PQC key registration');
  const isReg = await pqc.isRegistered(signer.address) as boolean;

  if (!isReg) {
    const dilFp       = ethers.hexlify(ethers.randomBytes(32));
    const kyberFp     = ethers.hexlify(ethers.randomBytes(32));
    const storageRoot = ethers.keccak256(ethers.toUtf8Bytes(dilFp + kyberFp));
    console.log('  Registering PQC keys on PQCKeyRegistry…');
    const tx = await pqc.register(dilFp, kyberFp, storageRoot);
    const receipt = await tx.wait();
    pass(`register() mined — block ${receipt.blockNumber}, gas ${receipt.gasUsed}`);
  } else {
    pass('already registered on-chain — skipping register()');
  }

  if (!await pqc.isRegistered(signer.address)) fail('isRegistered() still false after register()');
  pass('isRegistered() = true');

  // ── Step 2: deployAgent ─────────────────────────────────────────────────────
  console.log('\nStep 2 — deployAgent (verifier=address(0), no attestation required)');

  const configRoot  = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify({ riskLevel: 'balanced', assets: ['ETH','BTC'], targetApy: 12 })));
  const actionSigFp = ethers.keccak256(ethers.randomBytes(32));

  console.log(`  configRoot:  ${configRoot}`);

  const deployTx      = await registry.deployAgent(configRoot, actionSigFp, ethers.ZeroHash, ethers.ZeroHash);
  const deployReceipt = await deployTx.wait();
  pass(`deployAgent() mined — block ${deployReceipt.blockNumber}, gas ${deployReceipt.gasUsed}`);

  // Parse agentId from AgentDeployed event
  const iface = new ethers.Interface(REGISTRY_ABI);
  let agentId: bigint | null = null;
  for (const log of deployReceipt.logs) {
    try {
      const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed?.name === 'AgentDeployed') {
        agentId = parsed.args.agentId as bigint;
        pass(`AgentDeployed event — agentId = ${agentId}`);
      }
    } catch { /* not this log */ }
  }
  if (agentId === null) fail('AgentDeployed event not found in receipt');

  // ── Step 3: verify AgentRegistry state ──────────────────────────────────────
  console.log('\nStep 3 — verify AgentRegistry state');

  const agent = await registry.getAgent(agentId!) as { owner: string; configRoot: string; status: bigint };
  if (agent.owner.toLowerCase() !== signer.address.toLowerCase()) fail(`owner mismatch: ${agent.owner}`);
  pass(`agent.owner = ${agent.owner}`);
  if (agent.configRoot !== configRoot) fail('configRoot mismatch');
  pass('agent.configRoot matches');
  if (Number(agent.status) !== 0) fail(`expected Active(0), got ${agent.status}`);
  pass('agent.status = Active');

  const ownerAgents = await registry.getOwnerAgents(signer.address) as bigint[];
  if (!ownerAgents.map(String).includes(String(agentId!))) fail('agentId missing from getOwnerAgents()');
  pass(`getOwnerAgents() includes agentId ${agentId}`);

  // ── Step 4: verify AgentNFT minted ──────────────────────────────────────────
  console.log('\nStep 4 — verify AgentNFT minted');

  const nftOwner = await nft.ownerOf(agentId!) as string;
  if (nftOwner.toLowerCase() !== signer.address.toLowerCase()) fail(`NFT owner mismatch: ${nftOwner}`);
  pass(`NFT ownerOf(${agentId}) = ${nftOwner}`);

  const meta = await nft.getAgentMeta(agentId!) as { configRoot: string };
  if (meta.configRoot !== configRoot) fail('NFT configRoot mismatch');
  pass('NFT configRoot matches');

  console.log(`\n✓ All checks passed. agentId = ${agentId}`);
  console.log(`\nVerify on explorer: https://chainscan-galileo.0g.ai/tx/${deployTx.hash}\n`);
}

main().catch(err => { console.error('\nFATAL:', err.message ?? err); process.exit(1); });
