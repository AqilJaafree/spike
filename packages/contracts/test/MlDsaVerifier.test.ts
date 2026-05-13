import { expect } from 'chai';
import { ethers } from 'hardhat';
import type { TeeAttestationVerifier, ZkProofVerifier } from '../typechain-types';

describe('TeeAttestationVerifier', () => {
  let verifier: TeeAttestationVerifier;
  let attestor: any;
  let other: any;

  const pubkeyFp = ethers.keccak256(ethers.toUtf8Bytes('ml-dsa-pubkey'));
  const msgHash = ethers.keccak256(ethers.toUtf8Bytes('config-root'));
  const sigFp = ethers.keccak256(ethers.toUtf8Bytes('sig-commitment'));
  const attestationId = 'zg-tee-attest-001';

  beforeEach(async () => {
    [attestor, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory('TeeAttestationVerifier');
    verifier = (await Factory.deploy(attestor.address)) as TeeAttestationVerifier;
  });

  it('registers a verification and returns true on isVerified', async () => {
    await verifier.registerVerification(pubkeyFp, msgHash, sigFp, attestationId);
    expect(await verifier.isVerified(pubkeyFp, msgHash, sigFp)).to.be.true;
  });

  it('returns false before registration', async () => {
    expect(await verifier.isVerified(pubkeyFp, msgHash, sigFp)).to.be.false;
  });

  it('emits VerificationRegistered with attestationId', async () => {
    await expect(verifier.registerVerification(pubkeyFp, msgHash, sigFp, attestationId))
      .to.emit(verifier, 'VerificationRegistered')
      .withArgs(pubkeyFp, msgHash, sigFp, attestationId);
  });

  it('reverts if non-attestor calls registerVerification', async () => {
    await expect(
      verifier.connect(other).registerVerification(pubkeyFp, msgHash, sigFp, attestationId)
    ).to.be.revertedWithCustomError(verifier, 'NotAttestor');
  });

  it('reverts on duplicate registration', async () => {
    await verifier.registerVerification(pubkeyFp, msgHash, sigFp, attestationId);
    await expect(
      verifier.registerVerification(pubkeyFp, msgHash, sigFp, 'different-id')
    ).to.be.revertedWithCustomError(verifier, 'AlreadyVerified');
  });

  it('different sigFp is not verified', async () => {
    await verifier.registerVerification(pubkeyFp, msgHash, sigFp, attestationId);
    const otherSigFp = ethers.keccak256(ethers.toUtf8Bytes('other-sig'));
    expect(await verifier.isVerified(pubkeyFp, msgHash, otherSigFp)).to.be.false;
  });

  it('different pubkeyFp is not verified', async () => {
    await verifier.registerVerification(pubkeyFp, msgHash, sigFp, attestationId);
    const otherPk = ethers.keccak256(ethers.toUtf8Bytes('other-pubkey'));
    expect(await verifier.isVerified(otherPk, msgHash, sigFp)).to.be.false;
  });
});

describe('ZkProofVerifier', () => {
  let verifier: ZkProofVerifier;

  beforeEach(async () => {
    const Factory = await ethers.getContractFactory('ZkProofVerifier');
    verifier = (await Factory.deploy()) as ZkProofVerifier;
  });

  it('reverts submitZkProof with ZkVerifierNotDeployed (stub)', async () => {
    await expect(verifier.submitZkProof('0x', '0x'))
      .to.be.revertedWithCustomError(verifier, 'ZkVerifierNotDeployed');
  });

  it('isVerified returns false before any proof', async () => {
    const fp = ethers.keccak256(ethers.toUtf8Bytes('test'));
    expect(await verifier.isVerified(fp, fp, fp)).to.be.false;
  });
});

describe('AgentRegistry + TeeAttestationVerifier integration', () => {
  it('deploys agent when verifier confirms signature', async () => {
    const [attestor, owner] = await ethers.getSigners();

    const KeyReg = await ethers.getContractFactory('PQCKeyRegistry');
    const keyRegistry = await KeyReg.deploy();

    const TeeV = await ethers.getContractFactory('TeeAttestationVerifier');
    const teeVerifier = await TeeV.deploy(attestor.address) as TeeAttestationVerifier;

    const AgentReg = await ethers.getContractFactory('AgentRegistry');
    const agentRegistry = await AgentReg.deploy(
      await keyRegistry.getAddress(),
      await teeVerifier.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress
    );

    // Register PQC keys for owner
    const dilFp = ethers.keccak256(ethers.toUtf8Bytes('dil-key'));
    const kyberFp = ethers.keccak256(ethers.toUtf8Bytes('kyb-key'));
    await keyRegistry.connect(owner).register(dilFp, kyberFp, ethers.ZeroHash);

    const configRoot = ethers.keccak256(ethers.toUtf8Bytes('config'));
    const sigFp = ethers.keccak256(ethers.toUtf8Bytes('sig'));

    // deployAgent fails before TEE verification is registered
    await expect(
      agentRegistry.connect(owner).deployAgent(configRoot, sigFp, ethers.ZeroHash, ethers.ZeroHash)
    ).to.be.revertedWithCustomError(agentRegistry, 'SignatureNotVerified');

    // Attestor registers TEE-attested verification result
    await teeVerifier.connect(attestor).registerVerification(dilFp, configRoot, sigFp, 'tee-id-001');

    // Now deployAgent succeeds
    await expect(
      agentRegistry.connect(owner).deployAgent(configRoot, sigFp, ethers.ZeroHash, ethers.ZeroHash)
    ).to.emit(agentRegistry, 'AgentDeployed');
  });

  it('deploys agent without verifier check when verifier is zero address', async () => {
    const [owner] = await ethers.getSigners();

    const KeyReg = await ethers.getContractFactory('PQCKeyRegistry');
    const keyRegistry = await KeyReg.deploy();

    const AgentReg = await ethers.getContractFactory('AgentRegistry');
    // Pass address(0) — no on-chain verification required
    const agentRegistry = await AgentReg.deploy(await keyRegistry.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress);

    const dilFp = ethers.keccak256(ethers.toUtf8Bytes('dil'));
    const kyberFp = ethers.keccak256(ethers.toUtf8Bytes('kyb'));
    await keyRegistry.connect(owner).register(dilFp, kyberFp, ethers.ZeroHash);

    const configRoot = ethers.keccak256(ethers.toUtf8Bytes('cfg'));
    const sigFp = ethers.keccak256(ethers.toUtf8Bytes('sig'));

    await expect(
      agentRegistry.connect(owner).deployAgent(configRoot, sigFp, ethers.ZeroHash, ethers.ZeroHash)
    ).to.emit(agentRegistry, 'AgentDeployed');
  });
});
