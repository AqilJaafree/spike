import { expect } from 'chai';
import { ethers } from 'hardhat';
import { PQCKeyRegistry, AgentRegistry } from '../typechain-types';

describe('AgentRegistry', () => {
  let keyRegistry: PQCKeyRegistry;
  let agentRegistry: AgentRegistry;
  let owner: any;

  const dilithiumFp        = ethers.keccak256(ethers.toUtf8Bytes('dil'));
  const kyberFp            = ethers.keccak256(ethers.toUtf8Bytes('kyb'));
  const storageRoot        = ethers.keccak256(ethers.toUtf8Bytes('root'));
  const configRoot         = ethers.keccak256(ethers.toUtf8Bytes('config'));
  const actionSigFingerprint = ethers.keccak256(ethers.toUtf8Bytes('sig'));
  const attestationId      = ethers.keccak256(ethers.toUtf8Bytes('attest'));

  beforeEach(async () => {
    [owner] = await ethers.getSigners();

    const KeyReg = await ethers.getContractFactory('PQCKeyRegistry');
    keyRegistry = await KeyReg.deploy() as PQCKeyRegistry;

    const AgentReg = await ethers.getContractFactory('AgentRegistry');
    agentRegistry = await AgentReg.deploy(
      await keyRegistry.getAddress(),
      ethers.ZeroAddress,  // verifier
      ethers.ZeroAddress,  // agentNFT
      ethers.ZeroAddress   // skillRegistry
    ) as AgentRegistry;

    await keyRegistry.register(dilithiumFp, kyberFp, storageRoot);
  });

  it('deploys an agent with skillKey and emits event', async () => {
    const skillKey = ethers.keccak256(ethers.toUtf8Bytes('lp-provider'));
    await expect(
      agentRegistry.deployAgent(configRoot, actionSigFingerprint, attestationId, skillKey)
    ).to.emit(agentRegistry, 'AgentDeployed')
      .withArgs(1, owner.address, configRoot, attestationId, skillKey);
  });

  it('stores skillKey in agent struct', async () => {
    const skillKey = ethers.keccak256(ethers.toUtf8Bytes('dca-strategy'));
    await agentRegistry.deployAgent(configRoot, actionSigFingerprint, attestationId, skillKey);
    const agent = await agentRegistry.getAgent(1);
    expect(agent.skillKey).to.equal(skillKey);
  });

  it('reverts deploy if PQC keys not registered', async () => {
    const [, other] = await ethers.getSigners();
    await expect(
      agentRegistry.connect(other).deployAgent(configRoot, actionSigFingerprint, attestationId, ethers.ZeroHash)
    ).to.be.revertedWithCustomError(agentRegistry, 'PQCKeyNotRegistered');
  });

  it('pause / resume cycle', async () => {
    await agentRegistry.deployAgent(configRoot, actionSigFingerprint, attestationId, ethers.ZeroHash);
    await agentRegistry.pauseAgent(1);
    expect((await agentRegistry.getAgent(1)).status).to.equal(1);

    await agentRegistry.resumeAgent(1);
    expect((await agentRegistry.getAgent(1)).status).to.equal(0);
  });

  it('records action and increments rebalanceCount', async () => {
    await agentRegistry.deployAgent(configRoot, actionSigFingerprint, attestationId, ethers.ZeroHash);
    const actionHash = ethers.keccak256(ethers.toUtf8Bytes('rebalance-1'));
    await agentRegistry.recordAction(1, actionHash, true, 100n);
    const agent = await agentRegistry.getAgent(1);
    expect(agent.rebalanceCount).to.equal(1);
  });

  // ── Performance score ──────────────────────────────────────────────────────

  it('getPerformanceScore starts at zero', async () => {
    await agentRegistry.deployAgent(configRoot, actionSigFingerprint, attestationId, ethers.ZeroHash);
    const score = await agentRegistry.getPerformanceScore(1);
    expect(score.totalActions).to.equal(0n);
    expect(score.successCount).to.equal(0n);
    expect(score.pnlBasisPoints).to.equal(0n);
  });

  it('accumulates performance score correctly across mixed actions', async () => {
    await agentRegistry.deployAgent(configRoot, actionSigFingerprint, attestationId, ethers.ZeroHash);
    const h = ethers.keccak256(ethers.toUtf8Bytes('a'));
    await agentRegistry.recordAction(1, h, true,  150n);
    await agentRegistry.recordAction(1, h, false, -50n);
    await agentRegistry.recordAction(1, h, true,  200n);

    const score = await agentRegistry.getPerformanceScore(1);
    expect(score.totalActions).to.equal(3n);
    expect(score.successCount).to.equal(2n);
    expect(score.pnlBasisPoints).to.equal(300n); // 150 - 50 + 200
    expect(score.lastUpdatedAt).to.be.gt(0n);
  });

  it('recordAction emits AgentActionRecorded with success and pnl', async () => {
    await agentRegistry.deployAgent(configRoot, actionSigFingerprint, attestationId, ethers.ZeroHash);
    const actionHash = ethers.keccak256(ethers.toUtf8Bytes('act'));
    await expect(agentRegistry.recordAction(1, actionHash, true, 75n))
      .to.emit(agentRegistry, 'AgentActionRecorded');
  });

  // ── updateConfig ──────────────────────────────────────────────────────────

  it('updates config and emits ConfigUpdated', async () => {
    await agentRegistry.deployAgent(configRoot, actionSigFingerprint, attestationId, ethers.ZeroHash);
    const newCR  = ethers.keccak256(ethers.toUtf8Bytes('config-v2'));
    const newSig = ethers.keccak256(ethers.toUtf8Bytes('sig-v2'));

    await expect(agentRegistry.updateConfig(1, newCR, newSig))
      .to.emit(agentRegistry, 'ConfigUpdated')
      .withArgs(1, newCR);

    const agent = await agentRegistry.getAgent(1);
    expect(agent.configRoot).to.equal(newCR);
    expect(agent.actionSigFingerprint).to.equal(newSig);
  });

  it('reverts updateConfig by non-owner', async () => {
    await agentRegistry.deployAgent(configRoot, actionSigFingerprint, attestationId, ethers.ZeroHash);
    const [, other] = await ethers.getSigners();
    await expect(
      agentRegistry.connect(other).updateConfig(1, configRoot, actionSigFingerprint)
    ).to.be.revertedWithCustomError(agentRegistry, 'NotOwner');
  });

  // ── withdrawAgent ─────────────────────────────────────────────────────────

  it('withdraws an agent and emits AgentWithdrawn', async () => {
    await agentRegistry.deployAgent(configRoot, actionSigFingerprint, attestationId, ethers.ZeroHash);
    await expect(agentRegistry.withdrawAgent(1))
      .to.emit(agentRegistry, 'AgentWithdrawn').withArgs(1);
    expect((await agentRegistry.getAgent(1)).status).to.equal(2);
  });

  // ── invalid status transitions ────────────────────────────────────────────

  it('reverts pauseAgent when already paused', async () => {
    await agentRegistry.deployAgent(configRoot, actionSigFingerprint, attestationId, ethers.ZeroHash);
    await agentRegistry.pauseAgent(1);
    await expect(agentRegistry.pauseAgent(1))
      .to.be.revertedWithCustomError(agentRegistry, 'InvalidStatus');
  });

  it('reverts resumeAgent when not paused', async () => {
    await agentRegistry.deployAgent(configRoot, actionSigFingerprint, attestationId, ethers.ZeroHash);
    await expect(agentRegistry.resumeAgent(1))
      .to.be.revertedWithCustomError(agentRegistry, 'InvalidStatus');
  });

  // ── recordAction guards ───────────────────────────────────────────────────

  it('reverts recordAction by non-owner', async () => {
    await agentRegistry.deployAgent(configRoot, actionSigFingerprint, attestationId, ethers.ZeroHash);
    const [, other] = await ethers.getSigners();
    await expect(
      agentRegistry.connect(other).recordAction(1, ethers.keccak256(ethers.toUtf8Bytes('a')), true, 0n)
    ).to.be.revertedWithCustomError(agentRegistry, 'NotOwner');
  });

  it('reverts recordAction on non-existent agent', async () => {
    await expect(agentRegistry.recordAction(999, ethers.keccak256(ethers.toUtf8Bytes('a')), true, 0n))
      .to.be.revertedWithCustomError(agentRegistry, 'AgentNotFound');
  });

  // ── multi-agent ───────────────────────────────────────────────────────────

  it('tracks multiple agents per owner', async () => {
    const cr2   = ethers.keccak256(ethers.toUtf8Bytes('config-2'));
    const sig2  = ethers.keccak256(ethers.toUtf8Bytes('sig-2'));
    await agentRegistry.deployAgent(configRoot, actionSigFingerprint, attestationId, ethers.ZeroHash);
    await agentRegistry.deployAgent(cr2, sig2, attestationId, ethers.ZeroHash);
    const ids = await agentRegistry.getOwnerAgents(owner.address);
    expect(ids.length).to.equal(2);
    expect(ids[0]).to.equal(1n);
    expect(ids[1]).to.equal(2n);
  });
});
