import { ethers } from 'hardhat';

const REGISTRY_ABI = [
  'function deployAgent(bytes32,bytes32,bytes32,bytes32) external returns (uint256)',
  'function getOwnerAgents(address) external view returns (uint256[])',
  'event AgentDeployed(uint256 indexed agentId, address indexed owner, bytes32 configRoot, bytes32 attestationId, bytes32 skillKey)',
];

async function main() {
  const [signer] = await ethers.getSigners();
  const registry = await ethers.getContractAt(REGISTRY_ABI, '0x4d5E4Ec7401FAAA64BaE53b43F3F1332739962C0', signer);

  console.log(`\nBroadcasting 3 deployAgent txs in parallel (wallet: ${signer.address})...`);
  const nonce = await signer.getNonce();

  // Fire all 3 without awaiting — different nonces so they don't conflict
  const txs = await Promise.all([0, 1, 2].map(i =>
    registry.deployAgent(
      ethers.keccak256(ethers.toUtf8Bytes(`config-parallel-${i}`)),
      ethers.keccak256(ethers.randomBytes(32)),
      ethers.ZeroHash,
      ethers.ZeroHash,
      { nonce: nonce + i }
    )
  ));

  console.log('All 3 txs broadcasted. Waiting for receipts...\n');
  const receipts = await Promise.all(txs.map(tx => tx.wait()));

  const iface = new ethers.Interface(REGISTRY_ABI);
  for (const r of receipts) {
    for (const log of r.logs) {
      try {
        const p = iface.parseLog({ topics: [...log.topics], data: log.data });
        if (p?.name === 'AgentDeployed')
          console.log(`  agentId=${p.args.agentId}  block=${r.blockNumber}  gas=${r.gasUsed}  tx=${r.hash.slice(0,18)}…`);
      } catch { /* skip */ }
    }
  }

  const all = await registry.getOwnerAgents(signer.address) as bigint[];
  console.log(`\nAll agentIds owned by this wallet: [${all.map(String).join(', ')}]`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
