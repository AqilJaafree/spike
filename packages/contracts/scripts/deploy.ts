import { ethers } from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';

// Pre-compute skillKeys exactly as the contract does: keccak256(abi.encodePacked(id))
function skillKey(id: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(id));
}

// storageHash = keccak256 of skill file content (placeholder; real upload via registerSkills.ts)
function contentHash(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf8');
  return ethers.keccak256(ethers.toUtf8Bytes(content));
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying with:', deployer.address);

  // ── PQCKeyRegistry ──────────────────────────────────────────────────────────
  const PQCKeyRegistry = await ethers.getContractFactory('PQCKeyRegistry');
  const keyRegistry = await PQCKeyRegistry.deploy();
  await keyRegistry.waitForDeployment();
  const keyRegistryAddr = await keyRegistry.getAddress();
  console.log('PQCKeyRegistry:', keyRegistryAddr);

  // ── TeeAttestationVerifier ──────────────────────────────────────────────────
  const attestorAddress = process.env.ATTESTOR_ADDRESS ?? deployer.address;
  const TeeV = await ethers.getContractFactory('TeeAttestationVerifier');
  const teeVerifier = await TeeV.deploy(attestorAddress);
  await teeVerifier.waitForDeployment();
  const teeVerifierAddr = await teeVerifier.getAddress();
  console.log('TeeAttestationVerifier:', teeVerifierAddr, '(attestor:', attestorAddress, ')');

  // ── SkillRegistry ───────────────────────────────────────────────────────────
  const SkillReg = await ethers.getContractFactory('SkillRegistry');
  const skillRegistry = await SkillReg.deploy();
  await skillRegistry.waitForDeployment();
  const skillRegistryAddr = await skillRegistry.getAddress();
  console.log('SkillRegistry:', skillRegistryAddr);

  // Register the 4 DeFi skills (storageHash = keccak256 of file content as placeholder)
  const skillsDir = path.join(__dirname, '../../skills');
  const skills = [
    { id: 'lp-provider',       name: 'Liquidity Provider', category: 0, file: 'lp-provider.md' },
    { id: 'dca-strategy',      name: 'DCA Strategy',       category: 1, file: 'dca-strategy.md' },
    { id: 'lending-borrowing', name: 'Lending & Borrowing', category: 2, file: 'lending-borrowing.md' },
    { id: 'sim-trade',         name: 'Simulation Trade',   category: 3, file: 'sim-trade.md' },
  ];

  for (const skill of skills) {
    const filePath = path.join(skillsDir, skill.file);
    const hash = contentHash(filePath);
    const tx = await skillRegistry.registerSkill(skill.id, skill.name, skill.category, hash);
    await tx.wait();
    console.log(`  Registered skill "${skill.id}" → storageHash ${hash.slice(0, 10)}...`);
  }

  // ── AgentNFT + AgentRegistry (CREATE address cycle break) ──────────────────
  // nonce N   → AgentNFT  (minter = scorer = predicted AgentRegistry address)
  // nonce N+1 → AgentRegistry (agentNFT = AgentNFT address from nonce N)
  const currentNonce = await ethers.provider.getTransactionCount(deployer.address);
  const predictedRegistryAddr = ethers.getCreateAddress({
    from: deployer.address,
    nonce: currentNonce + 1,
  });
  console.log('Predicted AgentRegistry:', predictedRegistryAddr);

  const AgentNFTFactory = await ethers.getContractFactory('AgentNFT');
  const agentNFT = await AgentNFTFactory.deploy(
    keyRegistryAddr,
    teeVerifierAddr,
    predictedRegistryAddr,  // minter
    predictedRegistryAddr   // scorer
  );
  await agentNFT.waitForDeployment();
  const agentNFTAddr = await agentNFT.getAddress();
  console.log('AgentNFT:', agentNFTAddr);

  const AgentRegistry = await ethers.getContractFactory('AgentRegistry');
  const agentRegistry = await AgentRegistry.deploy(
    keyRegistryAddr,
    teeVerifierAddr,
    agentNFTAddr,
    skillRegistryAddr
  );
  await agentRegistry.waitForDeployment();
  const agentRegistryAddr = await agentRegistry.getAddress();
  console.log('AgentRegistry:', agentRegistryAddr);

  if (agentRegistryAddr.toLowerCase() !== predictedRegistryAddr.toLowerCase()) {
    throw new Error(`Address mismatch! Predicted ${predictedRegistryAddr} got ${agentRegistryAddr}`);
  }
  console.log('Address prediction verified.');

  // ── Set NFT base URI (optional — requires APP_URL env var) ─────────────────
  // Allows chainscan-galileo and other explorers to fetch metadata via HTTP
  // instead of getting a data: URI they can't resolve.
  const appUrl = process.env.APP_URL?.replace(/\/$/, '');
  if (appUrl) {
    const baseURI = `${appUrl}/api/nft/`;
    const tx = await (agentNFT as any).setBaseURI(baseURI);
    await tx.wait();
    console.log('AgentNFT.setBaseURI:', baseURI);
  } else {
    console.log('APP_URL not set — skipping setBaseURI (tokenURI returns data: URI)');
  }

  // ── Save manifest ───────────────────────────────────────────────────────────
  const network = await ethers.provider.getNetwork();
  const addresses = {
    network:                network.name,
    chainId:                network.chainId.toString(),
    PQCKeyRegistry:         keyRegistryAddr,
    TeeAttestationVerifier: teeVerifierAddr,
    SkillRegistry:          skillRegistryAddr,
    AgentNFT:               agentNFTAddr,
    AgentRegistry:          agentRegistryAddr,
    deployedAt:             new Date().toISOString(),
  };

  const outPath = path.join(__dirname, '../deployments.json');
  fs.writeFileSync(outPath, JSON.stringify(addresses, null, 2));
  console.log('Saved to deployments.json');
}

main().catch(err => { console.error(err); process.exit(1); });
