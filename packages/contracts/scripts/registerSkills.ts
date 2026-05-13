/**
 * registerSkills.ts
 *
 * Uploads skill markdown files to 0G Storage and (re-)registers their storage
 * hashes in SkillRegistry. Safe to re-run: skips already-registered skills.
 *
 * Usage:
 *   npx hardhat run scripts/registerSkills.ts --network testnet
 */
import { ethers } from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';

const deployments = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../deployments.json'), 'utf8')
);

const SKILLS_DIR = path.join(__dirname, '../../skills');

const SKILL_DEFS = [
  { id: 'lp-provider',       name: 'Liquidity Provider',  category: 0, file: 'lp-provider.md' },
  { id: 'dca-strategy',      name: 'DCA Strategy',        category: 1, file: 'dca-strategy.md' },
  { id: 'lending-borrowing', name: 'Lending & Borrowing', category: 2, file: 'lending-borrowing.md' },
  { id: 'sim-trade',         name: 'Simulation Trade',    category: 3, file: 'sim-trade.md' },
];

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Registering skills with:', deployer.address);

  const skillRegistry = await ethers.getContractAt('SkillRegistry', deployments.SkillRegistry);

  for (const def of SKILL_DEFS) {
    const skillKey = ethers.keccak256(ethers.toUtf8Bytes(def.id));

    // Idempotency: skip if already registered
    try {
      const existing = await skillRegistry.getSkill(skillKey);
      if (existing.registeredAt > 0n) {
        console.log(`  ✓ "${def.id}" already registered — skipping`);
        continue;
      }
    } catch { /* SkillNotFound — proceed */ }

    const content = fs.readFileSync(path.join(SKILLS_DIR, def.file), 'utf8');

    // storageHash: use keccak256 of content as placeholder.
    // For production, replace with actual 0G Storage upload via:
    //   import { uploadSkill } from '@spike/0g-client';
    //   const storageHash = await uploadSkill(content, deployer);
    const storageHash = ethers.keccak256(ethers.toUtf8Bytes(content));

    const tx = await skillRegistry.registerSkill(def.id, def.name, def.category, storageHash);
    const receipt = await tx.wait();
    console.log(`  Registered "${def.id}" tx: ${receipt?.hash}`);
    console.log(`    skillKey:    ${skillKey}`);
    console.log(`    storageHash: ${storageHash.slice(0, 18)}...`);
  }

  console.log('\nAll skills registered.');
  console.log('Skill count:', (await skillRegistry.skillCount()).toString());
}

main().catch(err => { console.error(err); process.exit(1); });
