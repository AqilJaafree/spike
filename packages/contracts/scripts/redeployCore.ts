/**
 * Redeploys only AgentNFT + AgentRegistry with verifier = address(0).
 * Reuses existing PQCKeyRegistry, TeeAttestationVerifier, and SkillRegistry.
 * Run once, then PRIVATE_KEY can be removed from .env — no server-side key needed.
 */
import { ethers } from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';

const KEEP = {
  PQCKeyRegistry:         '0xa7e58D52e99AB7bC2F3B98475AF2BF8a8B3F97b2',
  TeeAttestationVerifier: '0x1922B98277A5eC6201B935386229367Dc4bF16b6',
  SkillRegistry:          '0x659f6969c383bFD0890830c4BF475B602524Eb3C',
};

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying with:', deployer.address);
  console.log('Reusing PQCKeyRegistry:', KEEP.PQCKeyRegistry);
  console.log('Reusing SkillRegistry: ', KEEP.SkillRegistry);
  console.log('Verifier:               address(0) — attestation check disabled\n');

  // Predict AgentRegistry address (nonce+1 from AgentNFT)
  const currentNonce = await ethers.provider.getTransactionCount(deployer.address);
  const predictedRegistryAddr = ethers.getCreateAddress({
    from: deployer.address,
    nonce: currentNonce + 1,
  });
  console.log('Predicted AgentRegistry:', predictedRegistryAddr);

  // Deploy AgentNFT — verifier = address(0) so transfer gate is open
  const AgentNFTFactory = await ethers.getContractFactory('AgentNFT');
  const agentNFT = await AgentNFTFactory.deploy(
    KEEP.PQCKeyRegistry,
    ethers.ZeroAddress,       // verifier = none
    predictedRegistryAddr,    // minter = AgentRegistry
    predictedRegistryAddr,    // scorer = AgentRegistry
  );
  await agentNFT.waitForDeployment();
  const agentNFTAddr = await agentNFT.getAddress();
  console.log('AgentNFT:      ', agentNFTAddr);

  // Deploy AgentRegistry — verifier = address(0) so SignatureNotVerified is never thrown
  const AgentRegistry = await ethers.getContractFactory('AgentRegistry');
  const agentRegistry = await AgentRegistry.deploy(
    KEEP.PQCKeyRegistry,
    ethers.ZeroAddress,       // verifier = none — no attestation required
    agentNFTAddr,
    KEEP.SkillRegistry,
  );
  await agentRegistry.waitForDeployment();
  const agentRegistryAddr = await agentRegistry.getAddress();
  console.log('AgentRegistry: ', agentRegistryAddr);

  if (agentRegistryAddr.toLowerCase() !== predictedRegistryAddr.toLowerCase()) {
    throw new Error(`Address mismatch! Predicted ${predictedRegistryAddr} got ${agentRegistryAddr}`);
  }
  console.log('Address prediction verified.\n');

  // Print env vars to update
  console.log('Update your .env and apps/web/.env.local:');
  console.log(`NEXT_PUBLIC_AGENT_NFT=${agentNFTAddr}`);
  console.log(`NEXT_PUBLIC_AGENT_REGISTRY=${agentRegistryAddr}`);

  // Save updated deployments.json
  const existing = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../deployments.json'), 'utf8').replace(/^[^{]*/, '') || '{}'
  );
  const updated = {
    ...existing,
    AgentNFT:      agentNFTAddr,
    AgentRegistry: agentRegistryAddr,
    redeployedAt:  new Date().toISOString(),
    note:          'verifier=address(0) — attestation check disabled',
  };
  fs.writeFileSync(path.join(__dirname, '../deployments.json'), JSON.stringify(updated, null, 2));
  console.log('\nSaved to deployments.json');
}

main().catch(err => { console.error(err); process.exit(1); });
