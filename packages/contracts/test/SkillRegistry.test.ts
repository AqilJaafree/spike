import { expect } from 'chai';
import { ethers } from 'hardhat';
import type { SkillRegistry } from '../typechain-types';

// Category enum values
const CAT_LP = 0;
const CAT_DCA = 1;
const CAT_LENDING = 2;
const CAT_SIM = 3;

describe('SkillRegistry', () => {
  let registry: SkillRegistry;
  let owner: any;
  let other: any;

  const LP_ID      = 'lp-provider';
  const LP_NAME    = 'Liquidity Provider';
  const LP_HASH    = ethers.keccak256(ethers.toUtf8Bytes('lp-provider-content'));
  const LP_KEY     = ethers.keccak256(ethers.toUtf8Bytes(LP_ID));

  beforeEach(async () => {
    [owner, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory('SkillRegistry');
    registry = (await Factory.deploy()) as SkillRegistry;
  });

  // ── registerSkill ──────────────────────────────────────────────────────────

  it('owner can register a skill and it emits SkillRegistered', async () => {
    await expect(registry.registerSkill(LP_ID, LP_NAME, CAT_LP, LP_HASH))
      .to.emit(registry, 'SkillRegistered')
      .withArgs(LP_KEY, LP_ID, CAT_LP, LP_HASH);
  });

  it('non-owner cannot register a skill', async () => {
    await expect(
      registry.connect(other).registerSkill(LP_ID, LP_NAME, CAT_LP, LP_HASH)
    ).to.be.revertedWithCustomError(registry, 'OwnableUnauthorizedAccount');
  });

  it('duplicate registration reverts with SkillAlreadyRegistered', async () => {
    await registry.registerSkill(LP_ID, LP_NAME, CAT_LP, LP_HASH);
    await expect(
      registry.registerSkill(LP_ID, LP_NAME, CAT_LP, LP_HASH)
    ).to.be.revertedWithCustomError(registry, 'SkillAlreadyRegistered');
  });

  it('getSkill returns correct fields after registration', async () => {
    await registry.registerSkill(LP_ID, LP_NAME, CAT_LP, LP_HASH);
    const skill = await registry.getSkill(LP_KEY);
    expect(skill.id).to.equal(LP_ID);
    expect(skill.name).to.equal(LP_NAME);
    expect(skill.category).to.equal(CAT_LP);
    expect(skill.storageHash).to.equal(LP_HASH);
    expect(skill.active).to.be.true;
    expect(skill.registeredAt).to.be.gt(0n);
  });

  it('getSkill reverts for unknown skillKey', async () => {
    const unknown = ethers.keccak256(ethers.toUtf8Bytes('unknown'));
    await expect(registry.getSkill(unknown))
      .to.be.revertedWithCustomError(registry, 'SkillNotFound');
  });

  // ── isActive ───────────────────────────────────────────────────────────────

  it('isActive returns true for a registered active skill', async () => {
    await registry.registerSkill(LP_ID, LP_NAME, CAT_LP, LP_HASH);
    expect(await registry.isActive(LP_KEY)).to.be.true;
  });

  it('isActive returns true for bytes32(0) (backward-compat skip)', async () => {
    expect(await registry.isActive(ethers.ZeroHash)).to.be.true;
  });

  it('isActive returns false for unknown key (not registered)', async () => {
    const unknown = ethers.keccak256(ethers.toUtf8Bytes('nope'));
    expect(await registry.isActive(unknown)).to.be.false;
  });

  it('isActive returns false after setActive(false)', async () => {
    await registry.registerSkill(LP_ID, LP_NAME, CAT_LP, LP_HASH);
    await registry.setActive(LP_KEY, false);
    expect(await registry.isActive(LP_KEY)).to.be.false;
  });

  it('setActive re-enables a deactivated skill', async () => {
    await registry.registerSkill(LP_ID, LP_NAME, CAT_LP, LP_HASH);
    await registry.setActive(LP_KEY, false);
    await registry.setActive(LP_KEY, true);
    expect(await registry.isActive(LP_KEY)).to.be.true;
  });

  it('setActive emits SkillStatusChanged', async () => {
    await registry.registerSkill(LP_ID, LP_NAME, CAT_LP, LP_HASH);
    await expect(registry.setActive(LP_KEY, false))
      .to.emit(registry, 'SkillStatusChanged')
      .withArgs(LP_KEY, false);
  });

  it('setActive reverts for unknown skillKey', async () => {
    await expect(registry.setActive(ethers.ZeroHash, false))
      .to.be.revertedWithCustomError(registry, 'SkillNotFound');
  });

  // ── getAllSkills / skillCount ───────────────────────────────────────────────

  it('registers all 4 DeFi skills and lists them', async () => {
    const skills = [
      { id: 'lp-provider',       name: 'Liquidity Provider',  cat: CAT_LP      },
      { id: 'dca-strategy',      name: 'DCA Strategy',        cat: CAT_DCA     },
      { id: 'lending-borrowing', name: 'Lending & Borrowing', cat: CAT_LENDING },
      { id: 'sim-trade',         name: 'Simulation Trade',    cat: CAT_SIM     },
    ];
    for (const s of skills) {
      const hash = ethers.keccak256(ethers.toUtf8Bytes(s.id + '-content'));
      await registry.registerSkill(s.id, s.name, s.cat, hash);
    }
    expect(await registry.skillCount()).to.equal(4n);
    const all = await registry.getAllSkills();
    expect(all.length).to.equal(4);
    expect(all[0].id).to.equal('lp-provider');
    expect(all[3].id).to.equal('sim-trade');
  });

  // ── AgentRegistry integration: skillKey validation ─────────────────────────

  it('deployAgent reverts with SkillNotActive when skill is deactivated', async () => {
    const KeyReg = await ethers.getContractFactory('PQCKeyRegistry');
    const keyReg = await KeyReg.deploy();

    const AgentReg = await ethers.getContractFactory('AgentRegistry');
    const agentReg = await AgentReg.deploy(
      await keyReg.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      await registry.getAddress()
    );

    // Register and immediately deactivate the skill
    await registry.registerSkill(LP_ID, LP_NAME, CAT_LP, LP_HASH);
    await registry.setActive(LP_KEY, false);

    // Register PQC key for the deployer
    const dilFp  = ethers.keccak256(ethers.toUtf8Bytes('dil'));
    const kyberFp = ethers.keccak256(ethers.toUtf8Bytes('kyb'));
    await keyReg.register(dilFp, kyberFp, ethers.ZeroHash);

    await expect(
      agentReg.deployAgent(
        ethers.keccak256(ethers.toUtf8Bytes('config')),
        ethers.keccak256(ethers.toUtf8Bytes('sig')),
        ethers.ZeroHash,
        LP_KEY
      )
    ).to.be.revertedWithCustomError(agentReg, 'SkillNotActive');
  });

  it('deployAgent succeeds with an active skill', async () => {
    const KeyReg = await ethers.getContractFactory('PQCKeyRegistry');
    const keyReg = await KeyReg.deploy();

    const AgentReg = await ethers.getContractFactory('AgentRegistry');
    const agentReg = await AgentReg.deploy(
      await keyReg.getAddress(),
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      await registry.getAddress()
    );

    await registry.registerSkill(LP_ID, LP_NAME, CAT_LP, LP_HASH);

    const dilFp  = ethers.keccak256(ethers.toUtf8Bytes('dil'));
    const kyberFp = ethers.keccak256(ethers.toUtf8Bytes('kyb'));
    await keyReg.register(dilFp, kyberFp, ethers.ZeroHash);

    await expect(
      agentReg.deployAgent(
        ethers.keccak256(ethers.toUtf8Bytes('config')),
        ethers.keccak256(ethers.toUtf8Bytes('sig')),
        ethers.ZeroHash,
        LP_KEY
      )
    ).to.emit(agentReg, 'AgentDeployed');
  });
});
