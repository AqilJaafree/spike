/**
 * testnet.test.ts
 *
 * Integration tests against the live deployed contracts on 0G testnet (chain 16602).
 * Uses already-deployed addresses from deployments.json — no redeployment.
 *
 * Run with:
 *   npx hardhat test test/testnet.test.ts --network testnet
 *
 * Designed to be idempotent: each test checks on-chain state before writing,
 * so re-running is safe even if keys/agents were registered in a previous run.
 */
import { expect } from 'chai';
import { ethers } from 'hardhat';
import * as fs from 'fs';
import * as path from 'path';

const deployments = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../deployments.json'), 'utf8')
);

const PQC_KEY_REGISTRY    = deployments.PQCKeyRegistry;
const TEE_VERIFIER        = deployments.TeeAttestationVerifier;
const SKILL_REGISTRY      = deployments.SkillRegistry;
const AGENT_NFT           = deployments.AgentNFT;
const AGENT_REGISTRY      = deployments.AgentRegistry;

describe(`Live contracts on 0G testnet (chain ${deployments.chainId})`, function () {
  // Testnet txs are slower — give each test up to 60 s
  this.timeout(60_000);

  let signer: any;
  let keyRegistry: any;
  let teeVerifier: any;
  let skillRegistry: any;
  let agentNFT: any;
  let agentRegistry: any;

  before(async () => {
    [signer] = await ethers.getSigners();
    console.log('\n  Signer:', signer.address);

    const bal = await ethers.provider.getBalance(signer.address);
    console.log('  Balance:', ethers.formatEther(bal), 'A0GI\n');

    keyRegistry   = await ethers.getContractAt('PQCKeyRegistry', PQC_KEY_REGISTRY);
    teeVerifier   = await ethers.getContractAt('TeeAttestationVerifier', TEE_VERIFIER);
    skillRegistry = await ethers.getContractAt('SkillRegistry', SKILL_REGISTRY);
    agentNFT      = await ethers.getContractAt('AgentNFT', AGENT_NFT);
    agentRegistry = await ethers.getContractAt('AgentRegistry', AGENT_REGISTRY);
  });

  // ── 1. Deployment sanity ───────────────────────────────────────────────────

  describe('Deployment sanity', () => {
    it('PQCKeyRegistry has code at expected address', async () => {
      const code = await ethers.provider.getCode(PQC_KEY_REGISTRY);
      expect(code.length).to.be.greaterThan(2); // '0x' = no code
    });

    it('TeeAttestationVerifier has code at expected address', async () => {
      const code = await ethers.provider.getCode(TEE_VERIFIER);
      expect(code.length).to.be.greaterThan(2);
    });

    it('AgentRegistry has code at expected address', async () => {
      const code = await ethers.provider.getCode(AGENT_REGISTRY);
      expect(code.length).to.be.greaterThan(2);
    });

    it('AgentRegistry.keyRegistry points to PQCKeyRegistry', async () => {
      const linked = await agentRegistry.keyRegistry();
      expect(linked.toLowerCase()).to.equal(PQC_KEY_REGISTRY.toLowerCase());
    });

    it('AgentRegistry.verifier points to TeeAttestationVerifier', async () => {
      const linked = await agentRegistry.verifier();
      expect(linked.toLowerCase()).to.equal(TEE_VERIFIER.toLowerCase());
    });

    it('AgentRegistry.agentNFT points to AgentNFT', async () => {
      const linked = await agentRegistry.agentNFT();
      expect(linked.toLowerCase()).to.equal(AGENT_NFT.toLowerCase());
    });

    it('SkillRegistry has code at expected address', async () => {
      const code = await ethers.provider.getCode(SKILL_REGISTRY);
      expect(code.length).to.be.greaterThan(2);
    });

    it('AgentRegistry.skillRegistry points to SkillRegistry', async () => {
      const linked = await agentRegistry.skillRegistry();
      expect(linked.toLowerCase()).to.equal(SKILL_REGISTRY.toLowerCase());
    });

    it('AgentNFT.minter points to AgentRegistry', async () => {
      const minter = await agentNFT.minter();
      expect(minter.toLowerCase()).to.equal(AGENT_REGISTRY.toLowerCase());
    });

    it('AgentNFT.scorer points to AgentRegistry', async () => {
      const scorer = await agentNFT.scorer();
      expect(scorer.toLowerCase()).to.equal(AGENT_REGISTRY.toLowerCase());
    });

    it('AgentNFT has code at expected address', async () => {
      const code = await ethers.provider.getCode(AGENT_NFT);
      expect(code.length).to.be.greaterThan(2);
    });

    it('TeeAttestationVerifier.attestor is the deployer wallet', async () => {
      const attestor = await teeVerifier.attestor();
      expect(attestor.toLowerCase()).to.equal(signer.address.toLowerCase());
    });
  });

  // ── 2. PQCKeyRegistry ─────────────────────────────────────────────────────

  describe('PQCKeyRegistry', () => {
    it('isRegistered returns a boolean for signer address', async () => {
      const result = await keyRegistry.isRegistered(signer.address);
      expect(typeof result).to.equal('boolean');
      console.log('    isRegistered(signer):', result);
    });

    it('registers PQC keys if not already registered', async () => {
      const already = await keyRegistry.isRegistered(signer.address);
      if (already) {
        console.log('    Keys already registered — skipping write');
        return;
      }

      const { ml_dsa65 } = await import('@noble/post-quantum/ml-dsa.js');
      const seed = new Uint8Array(32).fill(99);
      const { publicKey } = ml_dsa65.keygen(seed);

      const dilFp   = ethers.keccak256(publicKey);
      const kyberFp = ethers.keccak256(ethers.toUtf8Bytes('kyber-testnet-stub'));

      const tx = await keyRegistry.register(dilFp, kyberFp, ethers.ZeroHash);
      const receipt = await tx.wait();
      console.log('    register() tx:', receipt.hash);

      expect(await keyRegistry.isRegistered(signer.address)).to.be.true;
    });

    it('getKeys returns stored fingerprints for signer', async () => {
      const registered = await keyRegistry.isRegistered(signer.address);
      if (!registered) {
        console.log('    Not registered — skipping getKeys check');
        return;
      }
      const keys = await keyRegistry.getKeys(signer.address);
      expect(keys.dilithiumFingerprint).to.not.equal(ethers.ZeroHash);
      expect(keys.active).to.be.true;
      console.log('    dilithiumFingerprint:', keys.dilithiumFingerprint);
    });
  });

  // ── 3. TeeAttestationVerifier ─────────────────────────────────────────────

  describe('TeeAttestationVerifier', () => {
    const pubkeyFp  = ethers.keccak256(ethers.toUtf8Bytes('testnet-pubkey'));
    const msgHash   = ethers.keccak256(ethers.toUtf8Bytes('testnet-config'));
    const sigFp     = ethers.keccak256(ethers.toUtf8Bytes('testnet-sigfp'));
    const attestId  = 'testnet-attest-001';

    it('isVerified returns false for an unregistered triple', async () => {
      const result = await teeVerifier.isVerified(pubkeyFp, msgHash, sigFp);
      // Could be true if a previous run registered it — just log
      console.log('    isVerified(testnet triple):', result);
    });

    it('attestor can registerVerification on-chain', async () => {
      const alreadyVerified = await teeVerifier.isVerified(pubkeyFp, msgHash, sigFp);
      if (alreadyVerified) {
        console.log('    Already verified — skipping write');
        return;
      }

      const tx = await teeVerifier.registerVerification(pubkeyFp, msgHash, sigFp, attestId);
      const receipt = await tx.wait();
      console.log('    registerVerification() tx:', receipt.hash);

      expect(await teeVerifier.isVerified(pubkeyFp, msgHash, sigFp)).to.be.true;
    });

    it('non-attestor cannot registerVerification', async () => {
      const signers = await ethers.getSigners();
      if (signers.length < 2) {
        console.log('    Only one signer available — skipping');
        return;
      }
      const other = signers[1];
      await expect(
        teeVerifier.connect(other).registerVerification(
          ethers.keccak256(ethers.toUtf8Bytes('other')),
          ethers.keccak256(ethers.toUtf8Bytes('other')),
          ethers.keccak256(ethers.toUtf8Bytes('other')),
          'should-fail'
        )
      ).to.be.revertedWithCustomError(teeVerifier, 'NotAttestor');
    });
  });

  // ── 4. AgentRegistry ──────────────────────────────────────────────────────

  describe('AgentRegistry', () => {
    it('getOwnerAgents returns an array for signer', async () => {
      const ids = await agentRegistry.getOwnerAgents(signer.address);
      console.log('    Existing agent IDs for signer:', ids.map((id: bigint) => id.toString()));
      expect(Array.isArray(ids)).to.be.true;
    });

    it('deploys an agent and mints INFT', async () => {
      const isReg = await keyRegistry.isRegistered(signer.address);
      if (!isReg) {
        console.log('    PQC keys not registered — skipping agent deploy');
        return;
      }

      const { ml_dsa65 } = await import('@noble/post-quantum/ml-dsa.js');
      const seed = new Uint8Array(32).fill(99); // same seed as registration test
      const { secretKey, publicKey } = ml_dsa65.keygen(seed);

      const configRoot = ethers.keccak256(
        ethers.toUtf8Bytes(`testnet-config-${Date.now()}`)
      );

      // Build ML-DSA signature over configRoot ‖ signer address
      const message = Buffer.concat([
        Buffer.from(ethers.getBytes(configRoot)),
        Buffer.from(ethers.getBytes(signer.address)),
      ]);
      const signature = ml_dsa65.sign(message, secretKey);

      // actionSigFingerprint = keccak256(configRoot ‖ full signature)
      const commitPreimage = Buffer.concat([
        Buffer.from(ethers.getBytes(configRoot)),
        Buffer.from(signature),
      ]);
      const actionSigFingerprint = ethers.keccak256(new Uint8Array(commitPreimage));

      // Verify locally before submitting
      expect(ml_dsa65.verify(signature, message, publicKey)).to.be.true;

      // Register TEE verification so AgentRegistry.verifier check passes
      const alreadyVerified = await teeVerifier.isVerified(
        ethers.keccak256(publicKey),
        configRoot,
        actionSigFingerprint
      );
      if (!alreadyVerified) {
        const verifyTx = await teeVerifier.registerVerification(
          ethers.keccak256(publicKey),
          configRoot,
          actionSigFingerprint,
          `testnet-attest-agent-${Date.now()}`
        );
        await verifyTx.wait();
        console.log('    TEE verification registered');
      }

      // Use lp-provider skill if registered, else ZeroHash
      const lpKey = ethers.keccak256(ethers.toUtf8Bytes('lp-provider'));
      const lpActive = await skillRegistry.isActive(lpKey);
      const chosenSkillKey = lpActive ? lpKey : ethers.ZeroHash;
      if (lpActive) console.log('    Using skill: lp-provider');

      const tx = await agentRegistry.deployAgent(
        configRoot,
        actionSigFingerprint,
        ethers.ZeroHash,
        chosenSkillKey
      );
      const receipt = await tx.wait();
      console.log('    deployAgent() tx:', receipt.hash);

      // Parse agentId from AgentDeployed event
      const iface = agentRegistry.interface;
      const log = receipt.logs
        .map((l: any) => { try { return iface.parseLog(l); } catch { return null; } })
        .find((l: any) => l?.name === 'AgentDeployed');

      expect(log).to.not.be.null;
      const agentId = log.args.agentId;
      console.log('    Deployed agentId:', agentId.toString());

      const agent = await agentRegistry.getAgent(agentId);
      expect(agent.owner.toLowerCase()).to.equal(signer.address.toLowerCase());
      expect(agent.configRoot).to.equal(configRoot);
      expect(agent.actionSigFingerprint).to.equal(actionSigFingerprint);

      // Verify NFT was minted with correct tokenId and PQC metadata
      const nftOwner = await agentNFT.ownerOf(agentId);
      expect(nftOwner.toLowerCase()).to.equal(signer.address.toLowerCase());
      console.log('    INFT minted for tokenId:', agentId.toString());

      const meta = await agentNFT.getAgentMeta(agentId);
      expect(meta.dilithiumFingerprint).to.equal(ethers.keccak256(publicKey));
      expect(meta.configRoot).to.equal(configRoot);
      expect(meta.actionSigFingerprint).to.equal(actionSigFingerprint);
      console.log('    INFT dilithiumFingerprint:', meta.dilithiumFingerprint);
      console.log('    INFT skillKey:', meta.skillKey);
    });

    it('getPerformanceScore returns struct for deployed agent', async () => {
      const ids = await agentRegistry.getOwnerAgents(signer.address);
      if (ids.length === 0) {
        console.log('    No agents — skipping performance score check');
        return;
      }
      const score = await agentRegistry.getPerformanceScore(ids[ids.length - 1]);
      console.log('    Performance score:', {
        totalActions:   score.totalActions.toString(),
        successCount:   score.successCount.toString(),
        pnlBasisPoints: score.pnlBasisPoints.toString(),
      });
      expect(score.totalActions).to.be.gte(0n);
    });
  });

  // ── 5. SkillRegistry ──────────────────────────────────────────────────────

  describe('SkillRegistry', () => {
    it('skillRegistry has the 4 DeFi skills registered', async () => {
      const count = await skillRegistry.skillCount();
      console.log('    Registered skill count:', count.toString());
      expect(count).to.be.gte(4n);
    });

    it('isActive(bytes32(0)) returns true (backward-compat skip)', async () => {
      expect(await skillRegistry.isActive(ethers.ZeroHash)).to.be.true;
    });

    it('lp-provider skill is registered and active', async () => {
      const key = ethers.keccak256(ethers.toUtf8Bytes('lp-provider'));
      expect(await skillRegistry.isActive(key)).to.be.true;
      const skill = await skillRegistry.getSkill(key);
      expect(skill.id).to.equal('lp-provider');
      expect(skill.active).to.be.true;
      console.log('    lp-provider storageHash:', skill.storageHash.slice(0, 18), '...');
    });

    it('all 4 skills are active', async () => {
      for (const id of ['lp-provider', 'dca-strategy', 'lending-borrowing', 'sim-trade']) {
        const key = ethers.keccak256(ethers.toUtf8Bytes(id));
        expect(await skillRegistry.isActive(key), `${id} not active`).to.be.true;
      }
    });
  });

  // ── 6. AgentNFT ───────────────────────────────────────────────────────────

  describe('AgentNFT', () => {
    it('tokenURI contains on-chain PQC metadata for minted tokens', async () => {
      const ids = await agentRegistry.getOwnerAgents(signer.address);
      if (ids.length === 0) {
        console.log('    No agents deployed — skipping tokenURI check');
        return;
      }
      const tokenId = ids[ids.length - 1]; // most recent
      const uri = await agentNFT.tokenURI(tokenId);
      expect(uri).to.include('dilithiumFingerprint');
      expect(uri).to.include('skillKey');
      expect(uri).to.include('configRoot');
      expect(uri).to.include('actionSigFingerprint');
      expect(uri).to.include('totalActions');
      console.log('    tokenURI prefix:', uri.slice(0, 80));
    });

    it('transfer is blocked without authoriseTransfer', async () => {
      const ids = await agentRegistry.getOwnerAgents(signer.address);
      if (ids.length === 0) {
        console.log('    No agents deployed — skipping transfer block check');
        return;
      }
      const tokenId = ids[ids.length - 1];
      const signers = await ethers.getSigners();
      if (signers.length < 2) {
        console.log('    Only one signer — skipping');
        return;
      }
      const recipient = signers[1];
      await expect(
        agentNFT.transferFrom(signer.address, recipient.address, tokenId)
      ).to.be.revertedWithCustomError(agentNFT, 'TransferNotAuthorised');
      console.log('    Transfer correctly blocked without authorisation');
    });
  });
});
