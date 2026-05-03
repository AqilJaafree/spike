import { expect } from 'chai';
import { ethers } from 'hardhat';
import { PQCKeyRegistry, AgentRegistry } from '../typechain-types';

describe('AgentRegistry', () => {
  let keyRegistry: PQCKeyRegistry;
  let agentRegistry: AgentRegistry;
  let owner: any;

  const dilithiumFp = ethers.keccak256(ethers.toUtf8Bytes('dil'));
  const kyberFp = ethers.keccak256(ethers.toUtf8Bytes('kyb'));
  const storageRoot = ethers.keccak256(ethers.toUtf8Bytes('root'));
  const configRoot = ethers.keccak256(ethers.toUtf8Bytes('config'));
  const dilithiumSig = ethers.keccak256(ethers.toUtf8Bytes('sig'));
  const attestationId = ethers.keccak256(ethers.toUtf8Bytes('attest'));

  beforeEach(async () => {
    [owner] = await ethers.getSigners();

    const KeyReg = await ethers.getContractFactory('PQCKeyRegistry');
    keyRegistry = await KeyReg.deploy() as PQCKeyRegistry;

    const AgentReg = await ethers.getContractFactory('AgentRegistry');
    agentRegistry = await AgentReg.deploy(await keyRegistry.getAddress()) as AgentRegistry;

    await keyRegistry.register(dilithiumFp, kyberFp, storageRoot);
  });

  it('deploys an agent and emits event', async () => {
    await expect(agentRegistry.deployAgent(configRoot, dilithiumSig, attestationId))
      .to.emit(agentRegistry, 'AgentDeployed')
      .withArgs(1, owner.address, configRoot, attestationId);
  });

  it('reverts deploy if PQC keys not registered', async () => {
    const [, other] = await ethers.getSigners();
    await expect(
      agentRegistry.connect(other).deployAgent(configRoot, dilithiumSig, attestationId)
    ).to.be.revertedWithCustomError(agentRegistry, 'PQCKeyNotRegistered');
  });

  it('pause / resume cycle', async () => {
    await agentRegistry.deployAgent(configRoot, dilithiumSig, attestationId);
    await agentRegistry.pauseAgent(1);
    const paused = await agentRegistry.getAgent(1);
    expect(paused.status).to.equal(1); // AgentStatus.Paused

    await agentRegistry.resumeAgent(1);
    const resumed = await agentRegistry.getAgent(1);
    expect(resumed.status).to.equal(0); // AgentStatus.Active
  });

  it('records rebalance action and increments counter', async () => {
    await agentRegistry.deployAgent(configRoot, dilithiumSig, attestationId);
    const actionHash = ethers.keccak256(ethers.toUtf8Bytes('rebalance-1'));
    await agentRegistry.recordAction(1, actionHash);
    const agent = await agentRegistry.getAgent(1);
    expect(agent.rebalanceCount).to.equal(1);
  });
});
