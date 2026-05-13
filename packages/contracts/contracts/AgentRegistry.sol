// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./PQCKeyRegistry.sol";
import "./MlDsaVerifier.sol";
import "./AgentNFT.sol";
import "./SkillRegistry.sol";
import "./IPerformanceScorer.sol";

/// @notice Deploys and tracks Spike DeFi agents. Each agent has one mastery skill.
///         Agent configs are Kyber-encrypted and stored in 0G Storage — only the
///         storage root hash lives on-chain. Performance is tracked per-agent.
contract AgentRegistry is ReentrancyGuard, IPerformanceScorer {
    enum AgentStatus { Active, Paused, Withdrawn }

    struct Agent {
        address     owner;
        bytes32     configRoot;           // 0G Storage root hash of Kyber-encrypted AgentConfig
        bytes32     actionSigFingerprint; // keccak256 commitment of (configRoot ‖ full ML-DSA sig)
        bytes32     attestationId;        // 0G Compute TEE attestation receipt
        bytes32     skillKey;             // keccak256(skillId) — zero = no skill assigned
        AgentStatus status;
        uint256     deployedAt;
        uint256     lastActionAt;
        uint256     rebalanceCount;
    }

    PQCKeyRegistry  public immutable keyRegistry;
    /// @notice Optional ML-DSA verifier (TeeML or ZK). Zero address = skip verification.
    IMlDsaVerifier  public immutable verifier;
    /// @notice AgentNFT contract. Zero address = no NFT minted.
    AgentNFT        public immutable agentNFT;
    /// @notice SkillRegistry. Zero address = skip skill validation.
    SkillRegistry   public immutable skillRegistry;

    mapping(address  => uint256[])              private _ownerAgentIds;
    mapping(uint256  => Agent)                  private _agents;
    mapping(uint256  => PerformanceScore)       private _scores;
    uint256 private _nextId = 1;

    event AgentDeployed(
        uint256 indexed agentId,
        address indexed owner,
        bytes32 configRoot,
        bytes32 attestationId,
        bytes32 skillKey
    );
    event AgentPaused(uint256 indexed agentId);
    event AgentResumed(uint256 indexed agentId);
    event AgentWithdrawn(uint256 indexed agentId);
    event AgentActionRecorded(
        uint256 indexed agentId,
        bytes32 actionHash,
        bool    success,
        int256  pnlBasisPoints,
        uint256 timestamp
    );
    event ConfigUpdated(uint256 indexed agentId, bytes32 newConfigRoot);

    error NotOwner();
    error PQCKeyNotRegistered();
    error SignatureNotVerified();
    error SkillNotActive();
    error InvalidStatus(AgentStatus current, AgentStatus required);
    error AgentNotFound();

    /// @param keyRegistryAddress   PQCKeyRegistry
    /// @param verifierAddress      IMlDsaVerifier, or address(0) to skip
    /// @param agentNFTAddress      AgentNFT, or address(0) to skip minting
    /// @param skillRegistryAddress SkillRegistry, or address(0) to skip skill validation
    constructor(
        address keyRegistryAddress,
        address verifierAddress,
        address agentNFTAddress,
        address skillRegistryAddress
    ) {
        keyRegistry   = PQCKeyRegistry(keyRegistryAddress);
        verifier      = IMlDsaVerifier(verifierAddress);
        agentNFT      = AgentNFT(agentNFTAddress);
        skillRegistry = SkillRegistry(skillRegistryAddress);
    }

    /// @param skillKey  keccak256(skillId) from SkillRegistry, or bytes32(0) for no skill.
    function deployAgent(
        bytes32 configRoot,
        bytes32 actionSigFingerprint,
        bytes32 attestationId,
        bytes32 skillKey
    ) external nonReentrant returns (uint256 agentId) {
        if (!keyRegistry.isRegistered(msg.sender)) revert PQCKeyNotRegistered();

        if (address(verifier) != address(0)) {
            bytes32 pubkeyFp = keyRegistry.getKeys(msg.sender).dilithiumFingerprint;
            if (!verifier.isVerified(pubkeyFp, configRoot, actionSigFingerprint)) {
                revert SignatureNotVerified();
            }
        }

        // Skill validation: skip when registry is not set or skillKey is zero.
        if (address(skillRegistry) != address(0) && skillKey != bytes32(0)) {
            if (!skillRegistry.isActive(skillKey)) revert SkillNotActive();
        }

        agentId = _nextId++;
        _agents[agentId] = Agent({
            owner:                msg.sender,
            configRoot:           configRoot,
            actionSigFingerprint: actionSigFingerprint,
            attestationId:        attestationId,
            skillKey:             skillKey,
            status:               AgentStatus.Active,
            deployedAt:           block.timestamp,
            lastActionAt:         block.timestamp,
            rebalanceCount:       0
        });
        _ownerAgentIds[msg.sender].push(agentId);

        if (address(agentNFT) != address(0)) {
            bytes32 dilFp = keyRegistry.getKeys(msg.sender).dilithiumFingerprint;
            agentNFT.mint(msg.sender, agentId, dilFp, configRoot, actionSigFingerprint, skillKey);
        }

        emit AgentDeployed(agentId, msg.sender, configRoot, attestationId, skillKey);
    }

    function pauseAgent(uint256 agentId) external nonReentrant {
        Agent storage agent = _requireOwner(agentId);
        if (agent.status != AgentStatus.Active) revert InvalidStatus(agent.status, AgentStatus.Active);
        agent.status = AgentStatus.Paused;
        emit AgentPaused(agentId);
    }

    function resumeAgent(uint256 agentId) external nonReentrant {
        Agent storage agent = _requireOwner(agentId);
        if (agent.status != AgentStatus.Paused) revert InvalidStatus(agent.status, AgentStatus.Paused);
        agent.status = AgentStatus.Active;
        emit AgentResumed(agentId);
    }

    function withdrawAgent(uint256 agentId) external nonReentrant {
        Agent storage agent = _requireOwner(agentId);
        agent.status = AgentStatus.Withdrawn;
        emit AgentWithdrawn(agentId);
    }

    function updateConfig(
        uint256 agentId,
        bytes32 newConfigRoot,
        bytes32 newActionSigFingerprint
    ) external nonReentrant {
        Agent storage agent = _requireOwner(agentId);
        agent.configRoot = newConfigRoot;
        agent.actionSigFingerprint = newActionSigFingerprint;
        agent.lastActionAt = block.timestamp;
        emit ConfigUpdated(agentId, newConfigRoot);
    }

    /// @notice Called by the TEE agent after each skill action.
    /// @param success        Whether the action was profitable / met strategy target.
    /// @param pnlBasisPoints Signed PnL delta in basis points for this action.
    function recordAction(
        uint256 agentId,
        bytes32 actionHash,
        bool    success,
        int256  pnlBasisPoints
    ) external nonReentrant {
        Agent storage agent = _agents[agentId];
        if (agent.owner == address(0)) revert AgentNotFound();
        if (agent.owner != msg.sender) revert NotOwner();

        agent.lastActionAt = block.timestamp;
        agent.rebalanceCount++;

        PerformanceScore storage score = _scores[agentId];
        score.totalActions++;
        if (success) score.successCount++;
        score.pnlBasisPoints  += pnlBasisPoints;
        score.lastUpdatedAt    = block.timestamp;

        emit AgentActionRecorded(agentId, actionHash, success, pnlBasisPoints, block.timestamp);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getAgent(uint256 agentId) external view returns (Agent memory) {
        return _agents[agentId];
    }

    function getOwnerAgents(address owner) external view returns (uint256[] memory) {
        return _ownerAgentIds[owner];
    }

    /// @inheritdoc IPerformanceScorer
    function getPerformanceScore(uint256 agentId)
        external view returns (PerformanceScore memory)
    {
        return _scores[agentId];
    }

    function _requireOwner(uint256 agentId) private view returns (Agent storage) {
        Agent storage agent = _agents[agentId];
        if (agent.owner == address(0)) revert AgentNotFound();
        if (agent.owner != msg.sender) revert NotOwner();
        return agent;
    }
}
