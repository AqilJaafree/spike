import { expect } from 'chai';
import { ethers } from 'hardhat';
import type { PQCKeyRegistry, AgentRegistry, AgentNFT, TeeAttestationVerifier } from '../typechain-types';

describe('AgentNFT', () => {
  let keyRegistry:   PQCKeyRegistry;
  let teeVerifier:   TeeAttestationVerifier;
  let agentRegistry: AgentRegistry;
  let agentNFT:      AgentNFT;
  let attestor:      any;
  let owner:         any;
  let recipient:     any;
  let stranger:      any;

  const dilFp      = ethers.keccak256(ethers.toUtf8Bytes('dil-key'));
  const kyberFp    = ethers.keccak256(ethers.toUtf8Bytes('kyb-key'));
  const configRoot = ethers.keccak256(ethers.toUtf8Bytes('config'));
  const sigFp      = ethers.keccak256(ethers.toUtf8Bytes('sig'));
  const skillKey   = ethers.keccak256(ethers.toUtf8Bytes('lp-provider'));
  const attestId   = 'tee-agent-mint-001';

  beforeEach(async () => {
    [attestor, owner, recipient, stranger] = await ethers.getSigners();

    const KeyReg = await ethers.getContractFactory('PQCKeyRegistry');
    keyRegistry = (await KeyReg.deploy()) as PQCKeyRegistry;

    const TeeV = await ethers.getContractFactory('TeeAttestationVerifier');
    teeVerifier = (await TeeV.deploy(attestor.address)) as TeeAttestationVerifier;

    // Deploy AgentNFT with attestor as minter for unit tests
    const AgentNFTFactory = await ethers.getContractFactory('AgentNFT');
    agentNFT = (await AgentNFTFactory.deploy(
      await keyRegistry.getAddress(),
      await teeVerifier.getAddress(),
      attestor.address,   // minter
      ethers.ZeroAddress  // scorer — static URI for unit tests
    )) as AgentNFT;

    // Full-stack AgentRegistry pointing to agentNFT
    const AgentReg = await ethers.getContractFactory('AgentRegistry');
    agentRegistry = (await AgentReg.deploy(
      await keyRegistry.getAddress(),
      await teeVerifier.getAddress(),
      await agentNFT.getAddress(),
      ethers.ZeroAddress  // skillRegistry
    )) as AgentRegistry;
  });

  // ── Unit: direct mint ──────────────────────────────────────────────────────

  describe('mint (direct)', () => {
    it('minter can mint a token with PQC metadata including skillKey', async () => {
      await agentNFT.connect(attestor).mint(
        owner.address, 1, dilFp, configRoot, sigFp, skillKey
      );
      expect(await agentNFT.ownerOf(1)).to.equal(owner.address);

      const meta = await agentNFT.getAgentMeta(1);
      expect(meta.dilithiumFingerprint).to.equal(dilFp);
      expect(meta.configRoot).to.equal(configRoot);
      expect(meta.actionSigFingerprint).to.equal(sigFp);
      expect(meta.skillKey).to.equal(skillKey);
      expect(meta.mintedAt).to.be.gt(0n);
    });

    it('emits AgentNFTMinted with skillKey', async () => {
      await expect(
        agentNFT.connect(attestor).mint(owner.address, 1, dilFp, configRoot, sigFp, skillKey)
      ).to.emit(agentNFT, 'AgentNFTMinted')
        .withArgs(1, owner.address, dilFp, configRoot, skillKey);
    });

    it('reverts when caller is not the minter', async () => {
      await expect(
        agentNFT.connect(stranger).mint(owner.address, 1, dilFp, configRoot, sigFp, skillKey)
      ).to.be.revertedWithCustomError(agentNFT, 'OnlyMinter');
    });
  });

  // ── tokenURI ───────────────────────────────────────────────────────────────

  describe('tokenURI', () => {
    it('returns a data URI with all on-chain PQC + skill attributes', async () => {
      await agentNFT.connect(attestor).mint(owner.address, 1, dilFp, configRoot, sigFp, skillKey);
      const uri = await agentNFT.tokenURI(1);
      expect(uri).to.include('data:application/json');
      expect(uri).to.include('Spike Agent #1');
      expect(uri).to.include('skillKey');
      expect(uri).to.include('dilithiumFingerprint');
      expect(uri).to.include('configRoot');
      expect(uri).to.include('actionSigFingerprint');
      expect(uri).to.include('mintedAt');
    });

    it('tokenURI includes performance attributes when scorer is set', async () => {
      // Deploy a paired (AgentNFT, AgentRegistry) with proper nonce prediction
      const [deployer] = await ethers.getSigners();
      const AgentNFTFactory = await ethers.getContractFactory('AgentNFT');
      const AgentReg = await ethers.getContractFactory('AgentRegistry');

      const nonce = await ethers.provider.getTransactionCount(deployer.address);
      const predictedReg = ethers.getCreateAddress({ from: deployer.address, nonce: nonce + 1 });

      const nft2 = (await AgentNFTFactory.deploy(
        await keyRegistry.getAddress(),
        await teeVerifier.getAddress(),
        predictedReg,
        predictedReg
      )) as AgentNFT;

      const reg2 = (await AgentReg.deploy(
        await keyRegistry.getAddress(),
        await teeVerifier.getAddress(),
        await nft2.getAddress(),
        ethers.ZeroAddress
      )) as AgentRegistry;

      // Register PQC key + TEE attestation + deploy agent
      const freshDil = ethers.keccak256(ethers.toUtf8Bytes('scorer-dil'));
      await keyRegistry.connect(owner).register(freshDil, kyberFp, ethers.ZeroHash);
      await teeVerifier.connect(attestor).registerVerification(freshDil, configRoot, sigFp, 'scorer-attest');
      await reg2.connect(owner).deployAgent(configRoot, sigFp, ethers.ZeroHash, ethers.ZeroHash);

      // Record an action to populate performance score
      const h = ethers.keccak256(ethers.toUtf8Bytes('action1'));
      await reg2.connect(owner).recordAction(1, h, true, 250n);

      const uri = await nft2.tokenURI(1);
      expect(uri).to.include('totalActions');
      expect(uri).to.include('successCount');
      expect(uri).to.include('pnlBasisPoints');
      expect(uri).to.include('scoreUpdatedAt');
    });

    it('reverts for non-existent token', async () => {
      await expect(agentNFT.tokenURI(999)).to.be.reverted;
    });
  });

  // ── PQC-gated transfers ────────────────────────────────────────────────────

  describe('authoriseTransfer + transferFrom', () => {
    const tokenId = 1n;

    beforeEach(async () => {
      const recDilFp = ethers.keccak256(ethers.toUtf8Bytes('recipient-dil'));
      const recKybFp = ethers.keccak256(ethers.toUtf8Bytes('recipient-kyb'));
      await keyRegistry.connect(recipient).register(recDilFp, recKybFp, ethers.ZeroHash);

      await agentNFT.connect(attestor).mint(owner.address, tokenId, dilFp, configRoot, sigFp, skillKey);
      await keyRegistry.connect(owner).register(dilFp, kyberFp, ethers.ZeroHash);
    });

    it('transfer succeeds after valid authoriseTransfer', async () => {
      const transferHash = ethers.keccak256(
        ethers.solidityPacked(['uint256', 'address', 'address'], [tokenId, owner.address, recipient.address])
      );
      const transferSigFp = ethers.keccak256(ethers.toUtf8Bytes('transfer-sig-fp'));

      await teeVerifier.connect(attestor).registerVerification(
        dilFp, transferHash, transferSigFp, 'transfer-attest-001'
      );
      await agentNFT.connect(owner).authoriseTransfer(
        tokenId, recipient.address, transferSigFp, 'transfer-attest-001'
      );
      await agentNFT.connect(owner).transferFrom(owner.address, recipient.address, tokenId);
      expect(await agentNFT.ownerOf(tokenId)).to.equal(recipient.address);
    });

    it('emits TransferAuthorised', async () => {
      const transferHash = ethers.keccak256(
        ethers.solidityPacked(['uint256', 'address', 'address'], [tokenId, owner.address, recipient.address])
      );
      const transferSigFp = ethers.keccak256(ethers.toUtf8Bytes('ts-fp'));
      await teeVerifier.connect(attestor).registerVerification(dilFp, transferHash, transferSigFp, 'ta-002');

      await expect(
        agentNFT.connect(owner).authoriseTransfer(tokenId, recipient.address, transferSigFp, 'ta-002')
      ).to.emit(agentNFT, 'TransferAuthorised')
        .withArgs(tokenId, owner.address, recipient.address, 'ta-002');
    });

    it('transfer blocked when recipient has no PQC keys', async () => {
      // RecipientLacksQPCKeys fires before verifier.isVerified — no TEE registration needed
      const transferSigFp = ethers.keccak256(ethers.toUtf8Bytes('stranger-sig'));
      await expect(
        agentNFT.connect(owner).authoriseTransfer(tokenId, stranger.address, transferSigFp, 'ta-stranger')
      ).to.be.revertedWithCustomError(agentNFT, 'RecipientLacksQPCKeys');
    });

    it('transfer blocked without prior authoriseTransfer', async () => {
      await expect(
        agentNFT.connect(owner).transferFrom(owner.address, recipient.address, tokenId)
      ).to.be.revertedWithCustomError(agentNFT, 'TransferNotAuthorised');
    });

    it('authorisation is single-use', async () => {
      const transferHash = ethers.keccak256(
        ethers.solidityPacked(['uint256', 'address', 'address'], [tokenId, owner.address, recipient.address])
      );
      const transferSigFp = ethers.keccak256(ethers.toUtf8Bytes('one-time-sig'));
      await teeVerifier.connect(attestor).registerVerification(dilFp, transferHash, transferSigFp, 'ta-oneuse');
      await agentNFT.connect(owner).authoriseTransfer(tokenId, recipient.address, transferSigFp, 'ta-oneuse');
      await agentNFT.connect(owner).transferFrom(owner.address, recipient.address, tokenId);

      // Second transfer from recipient back to owner — gate consumed
      await expect(
        agentNFT.connect(recipient).transferFrom(recipient.address, owner.address, tokenId)
      ).to.be.revertedWithCustomError(agentNFT, 'TransferNotAuthorised');
    });

    it('reverts authoriseTransfer when TEE verification not registered', async () => {
      const badSigFp = ethers.keccak256(ethers.toUtf8Bytes('unregistered-sig'));
      await expect(
        agentNFT.connect(owner).authoriseTransfer(tokenId, recipient.address, badSigFp, 'no-tee')
      ).to.be.revertedWithCustomError(agentNFT, 'TransferNotAuthorised');
    });
  });

  // ── AgentRegistry integration: mint via deployAgent ────────────────────────

  describe('AgentRegistry integration', () => {
    it('mints INFT with skillKey when deployAgent is called', async () => {
      const [deployer] = await ethers.getSigners();
      const AgentNFTFactory = await ethers.getContractFactory('AgentNFT');
      const AgentReg = await ethers.getContractFactory('AgentRegistry');

      const nonce = await ethers.provider.getTransactionCount(deployer.address);
      const predictedReg = ethers.getCreateAddress({ from: deployer.address, nonce: nonce + 1 });

      const nft = (await AgentNFTFactory.deploy(
        await keyRegistry.getAddress(),
        await teeVerifier.getAddress(),
        predictedReg,
        predictedReg
      )) as AgentNFT;

      const reg = (await AgentReg.deploy(
        await keyRegistry.getAddress(),
        await teeVerifier.getAddress(),
        await nft.getAddress(),
        ethers.ZeroAddress
      )) as AgentRegistry;

      expect(await reg.getAddress()).to.equal(predictedReg);

      const freshDil = ethers.keccak256(ethers.toUtf8Bytes('integ-dil'));
      await keyRegistry.connect(owner).register(freshDil, kyberFp, ethers.ZeroHash);
      await teeVerifier.connect(attestor).registerVerification(freshDil, configRoot, sigFp, 'integ-attest');

      await expect(
        reg.connect(owner).deployAgent(configRoot, sigFp, ethers.ZeroHash, skillKey)
      ).to.emit(nft, 'AgentNFTMinted');

      expect(await nft.ownerOf(1)).to.equal(owner.address);
      const meta = await nft.getAgentMeta(1);
      expect(meta.dilithiumFingerprint).to.equal(freshDil);
      expect(meta.skillKey).to.equal(skillKey);
    });
  });
});
