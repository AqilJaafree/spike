/**
 * PQCIntegration.test.ts
 *
 * End-to-end test of the PQC ↔ contract pipeline using real ML-DSA-65 cryptography:
 *   keygen → keccak256 fingerprint → on-chain register → sign → commit → deploy agent → verify
 *
 * @noble/post-quantum is ESM-only; loaded via dynamic import() inside async tests.
 */
import { expect } from 'chai';
import { ethers } from 'hardhat';
import type { PQCKeyRegistry, AgentRegistry } from '../typechain-types';

/** Converts a Uint8Array to a 0x-prefixed hex string. */
function toHex(bytes: Uint8Array): string {
  return '0x' + Buffer.from(bytes).toString('hex');
}

/** keccak256 of a Uint8Array via ethers. */
function keccak256Bytes(bytes: Uint8Array): string {
  return ethers.keccak256(bytes);
}

describe('PQC Integration — real ML-DSA-65 keypair', () => {
  let keyRegistry: PQCKeyRegistry;
  let agentRegistry: AgentRegistry;
  let owner: any;

  beforeEach(async () => {
    [owner] = await ethers.getSigners();
    const KeyReg = await ethers.getContractFactory('PQCKeyRegistry');
    keyRegistry = (await KeyReg.deploy()) as PQCKeyRegistry;
    const AgentReg = await ethers.getContractFactory('AgentRegistry');
    agentRegistry = (await AgentReg.deploy(await keyRegistry.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress)) as AgentRegistry;
  });

  it('registers a real Dilithium fingerprint and reads it back correctly', async () => {
    const { ml_dsa65 } = await import('@noble/post-quantum/ml-dsa.js');

    // Deterministic seed for reproducibility
    const seed = new Uint8Array(32).fill(1);
    const { publicKey } = ml_dsa65.keygen(seed);

    const dilithiumFp = keccak256Bytes(publicKey);
    const kyberFp = ethers.keccak256(ethers.toUtf8Bytes('kyber-stub'));
    const storageRoot = ethers.keccak256(ethers.toUtf8Bytes('0g-storage-root'));

    await keyRegistry.register(dilithiumFp, kyberFp, storageRoot);

    expect(await keyRegistry.isRegistered(owner.address)).to.be.true;
    const stored = await keyRegistry.getKeys(owner.address);
    expect(stored.dilithiumFingerprint).to.equal(dilithiumFp);
    expect(stored.kyberFingerprint).to.equal(kyberFp);
  });

  it('signs a config with ML-DSA-65, commits the fingerprint, deploys agent, and verifies locally', async () => {
    const { ml_dsa65 } = await import('@noble/post-quantum/ml-dsa.js');

    const seed = new Uint8Array(32).fill(2);
    const { secretKey, publicKey } = ml_dsa65.keygen(seed);

    // Register key fingerprint on-chain
    const dilithiumFp = keccak256Bytes(publicKey);
    const kyberFp = ethers.keccak256(ethers.toUtf8Bytes('kyber-stub'));
    await keyRegistry.register(
      dilithiumFp,
      kyberFp,
      ethers.keccak256(ethers.toUtf8Bytes('0g-root'))
    );

    // Build the message: configRoot ‖ owner address (replay-safe binding)
    const configRoot = ethers.keccak256(ethers.toUtf8Bytes('agent-config-v1'));
    const configRootBytes = ethers.getBytes(configRoot);
    const ownerBytes = ethers.getBytes(owner.address);
    const message = Buffer.concat([Buffer.from(configRootBytes), Buffer.from(ownerBytes)]);

    // Sign with real ML-DSA-65
    const signature = ml_dsa65.sign(message, secretKey);
    expect(signature.length).to.equal(3309); // ML-DSA-65 signature is always 3309 bytes

    // actionSigFingerprint = keccak256(configRoot ‖ full_signature)
    const commitPreimage = Buffer.concat([Buffer.from(configRootBytes), Buffer.from(signature)]);
    const actionSigFingerprint = keccak256Bytes(new Uint8Array(commitPreimage));

    // Deploy agent with real commitment
    const attestationId = ethers.keccak256(ethers.toUtf8Bytes('tee-attest'));
    await agentRegistry.deployAgent(configRoot, actionSigFingerprint, attestationId, ethers.ZeroHash);

    // Verify stored commitment matches what we computed
    const agent = await agentRegistry.getAgent(1);
    expect(agent.configRoot).to.equal(configRoot);
    expect(agent.actionSigFingerprint).to.equal(actionSigFingerprint);
    expect(agent.owner.toLowerCase()).to.equal(owner.address.toLowerCase());

    // Verify the signature locally (off-chain verification — proves the commitment is sound)
    const verified = ml_dsa65.verify(signature, message, publicKey);
    expect(verified).to.be.true;
  });

  it('rejects a tampered config — commitment does not match', async () => {
    const { ml_dsa65 } = await import('@noble/post-quantum/ml-dsa.js');

    const seed = new Uint8Array(32).fill(3);
    const { secretKey, publicKey } = ml_dsa65.keygen(seed);

    const dilithiumFp = keccak256Bytes(publicKey);
    await keyRegistry.register(
      dilithiumFp,
      ethers.keccak256(ethers.toUtf8Bytes('kyber-stub')),
      ethers.keccak256(ethers.toUtf8Bytes('root'))
    );

    const configRoot = ethers.keccak256(ethers.toUtf8Bytes('original-config'));
    const message = ethers.getBytes(configRoot);
    const signature = ml_dsa65.sign(message, secretKey);

    // Build correct commitment
    const correctPreimage = Buffer.concat([Buffer.from(message), Buffer.from(signature)]);
    const correctFingerprint = keccak256Bytes(new Uint8Array(correctPreimage));

    // Build tampered commitment (different configRoot in preimage)
    const tamperedConfigRoot = ethers.keccak256(ethers.toUtf8Bytes('tampered-config'));
    const tamperedMessage = ethers.getBytes(tamperedConfigRoot);
    const tamperedPreimage = Buffer.concat([Buffer.from(tamperedMessage), Buffer.from(signature)]);
    const tamperedFingerprint = keccak256Bytes(new Uint8Array(tamperedPreimage));

    // Both deploy (contract only stores the commitment, doesn't verify)
    await agentRegistry.deployAgent(configRoot, correctFingerprint, ethers.ZeroHash, ethers.ZeroHash);
    await agentRegistry.deployAgent(tamperedConfigRoot, tamperedFingerprint, ethers.ZeroHash, ethers.ZeroHash);

    // Off-chain verification: correct config verifies; tampered config does not match
    const agent1 = await agentRegistry.getAgent(1);
    const agent2 = await agentRegistry.getAgent(2);

    // Reconstruct and verify agent 1's commitment
    const reconstructed1 = Buffer.concat([
      Buffer.from(ethers.getBytes(agent1.configRoot)),
      Buffer.from(signature),
    ]);
    expect(keccak256Bytes(new Uint8Array(reconstructed1))).to.equal(agent1.actionSigFingerprint);

    // Tampered: original signature does NOT verify against the tampered configRoot
    const tamperedVerified = ml_dsa65.verify(signature, tamperedMessage, publicKey);
    expect(tamperedVerified).to.be.false;

    // Commitments are different
    expect(agent1.actionSigFingerprint).to.not.equal(agent2.actionSigFingerprint);
  });

  it('key rotation: new fingerprint replaces old, re-signed config uses new key', async () => {
    const { ml_dsa65 } = await import('@noble/post-quantum/ml-dsa.js');

    // Generate two keypairs: original and rotated
    const { secretKey: sk1, publicKey: pk1 } = ml_dsa65.keygen(new Uint8Array(32).fill(4));
    const { secretKey: sk2, publicKey: pk2 } = ml_dsa65.keygen(new Uint8Array(32).fill(5));

    const fp1 = keccak256Bytes(pk1);
    const fp2 = keccak256Bytes(pk2);
    const kyberStub = ethers.keccak256(ethers.toUtf8Bytes('kyber'));

    // Register original key
    await keyRegistry.register(fp1, kyberStub, ethers.ZeroHash);
    expect((await keyRegistry.getKeys(owner.address)).dilithiumFingerprint).to.equal(fp1);

    // Rotate to new key
    await keyRegistry.rotate(fp2, kyberStub, ethers.ZeroHash);
    expect((await keyRegistry.getKeys(owner.address)).dilithiumFingerprint).to.equal(fp2);

    // Old key signature does NOT verify data signed by new key, and vice versa
    const message = new TextEncoder().encode('rebalance-decision');
    const sig2 = ml_dsa65.sign(message, sk2);

    expect(ml_dsa65.verify(sig2, message, pk2)).to.be.true;
    expect(ml_dsa65.verify(sig2, message, pk1)).to.be.false;

    // Deploy agent after rotation — still works since isRegistered is still true
    const configRoot = ethers.keccak256(ethers.toUtf8Bytes('config-after-rotation'));
    const commitPreimage = Buffer.concat([Buffer.from(ethers.getBytes(configRoot)), Buffer.from(sig2)]);
    const fingerprint = keccak256Bytes(new Uint8Array(commitPreimage));
    await agentRegistry.deployAgent(configRoot, fingerprint, ethers.ZeroHash, ethers.ZeroHash);

    const agent = await agentRegistry.getAgent(1);
    expect(agent.actionSigFingerprint).to.equal(fingerprint);
  });
});
