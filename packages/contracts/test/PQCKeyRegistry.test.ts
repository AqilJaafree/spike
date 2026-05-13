import { expect } from 'chai';
import { ethers } from 'hardhat';
import { PQCKeyRegistry } from '../typechain-types';

describe('PQCKeyRegistry', () => {
  let registry: PQCKeyRegistry;
  let owner: any;
  let other: any;

  const dilithiumFp = ethers.keccak256(ethers.toUtf8Bytes('dilithium-pubkey'));
  const kyberFp = ethers.keccak256(ethers.toUtf8Bytes('kyber-pubkey'));
  const storageRoot = ethers.keccak256(ethers.toUtf8Bytes('storage-root'));

  beforeEach(async () => {
    [owner, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory('PQCKeyRegistry');
    registry = await Factory.deploy() as PQCKeyRegistry;
  });

  it('registers PQC keys and emits event', async () => {
    await expect(registry.register(dilithiumFp, kyberFp, storageRoot))
      .to.emit(registry, 'KeyRegistered')
      .withArgs(owner.address, dilithiumFp, kyberFp, storageRoot);

    expect(await registry.isRegistered(owner.address)).to.be.true;
  });

  it('rejects duplicate registration', async () => {
    await registry.register(dilithiumFp, kyberFp, storageRoot);
    await expect(registry.register(dilithiumFp, kyberFp, storageRoot))
      .to.be.revertedWithCustomError(registry, 'AlreadyRegistered');
  });

  it('rejects zero fingerprints', async () => {
    await expect(registry.register(ethers.ZeroHash, kyberFp, storageRoot))
      .to.be.revertedWithCustomError(registry, 'InvalidFingerprint');
  });

  it('rotates keys', async () => {
    await registry.register(dilithiumFp, kyberFp, storageRoot);
    const newDil = ethers.keccak256(ethers.toUtf8Bytes('new-dilithium'));
    const newKyb = ethers.keccak256(ethers.toUtf8Bytes('new-kyber'));
    const newRoot = ethers.keccak256(ethers.toUtf8Bytes('new-root'));

    await expect(registry.rotate(newDil, newKyb, newRoot))
      .to.emit(registry, 'KeyRotated')
      .withArgs(owner.address, newDil, newKyb, newRoot);

    const keys = await registry.getKeys(owner.address);
    expect(keys.dilithiumFingerprint).to.equal(newDil);
  });

  it('revokes keys', async () => {
    await registry.register(dilithiumFp, kyberFp, storageRoot);
    await registry.revoke();
    expect(await registry.isRegistered(owner.address)).to.be.false;
  });

  // ── additional edge cases ─────────────────────────────────────────────────

  it('reverts rotate when not registered', async () => {
    await expect(registry.rotate(dilithiumFp, kyberFp, storageRoot))
      .to.be.revertedWithCustomError(registry, 'NotRegistered');
  });

  it('reverts revoke when not registered', async () => {
    await expect(registry.revoke())
      .to.be.revertedWithCustomError(registry, 'NotRegistered');
  });

  it('returns zero-struct for unregistered wallet', async () => {
    const keys = await registry.getKeys(other.address);
    expect(keys.dilithiumFingerprint).to.equal(ethers.ZeroHash);
    expect(keys.active).to.be.false;
  });

  it('revoked key blocks agent deployment', async () => {
    // Register, revoke, then attempt to deploy via a separate AgentRegistry
    await registry.register(dilithiumFp, kyberFp, storageRoot);
    await registry.revoke();

    const AgentReg = await ethers.getContractFactory('AgentRegistry');
    const agentRegistry = await AgentReg.deploy(await registry.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress);
    const configRoot = ethers.keccak256(ethers.toUtf8Bytes('config'));
    const sigFp = ethers.keccak256(ethers.toUtf8Bytes('sig'));
    await expect(
      agentRegistry.deployAgent(configRoot, sigFp, ethers.ZeroHash, ethers.ZeroHash)
    ).to.be.revertedWithCustomError(agentRegistry, 'PQCKeyNotRegistered');
  });
});
