import { ethers } from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying with:', deployer.address);

  const PQCKeyRegistry = await ethers.getContractFactory('PQCKeyRegistry');
  const keyRegistry = await PQCKeyRegistry.deploy();
  await keyRegistry.waitForDeployment();
  const keyRegistryAddr = await keyRegistry.getAddress();
  console.log('PQCKeyRegistry deployed to:', keyRegistryAddr);

  const AgentRegistry = await ethers.getContractFactory('AgentRegistry');
  const agentRegistry = await AgentRegistry.deploy(keyRegistryAddr);
  await agentRegistry.waitForDeployment();
  const agentRegistryAddr = await agentRegistry.getAddress();
  console.log('AgentRegistry deployed to:', agentRegistryAddr);

  const network = await ethers.provider.getNetwork();
  const addresses = {
    network: network.name,
    chainId: network.chainId.toString(),
    PQCKeyRegistry: keyRegistryAddr,
    AgentRegistry: agentRegistryAddr,
    deployedAt: new Date().toISOString(),
  };

  const outPath = path.join(__dirname, '../deployments.json');
  fs.writeFileSync(outPath, JSON.stringify(addresses, null, 2));
  console.log('Addresses saved to deployments.json');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
