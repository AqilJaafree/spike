// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./PQCKeyRegistry.sol";

/// @notice Deploys and tracks Spike DeFi agents. Agent configs are Kyber-encrypted and stored
/// in 0G Storage — only the storage root hash lives on-chain.
contract AgentRegistry is ReentrancyGuard {
    enum AgentStatus { Active, Paused, Withdrawn }

    struct Agent {
        address owner;
        bytes32 configRoot;       // 0G Storage root hash of Kyber-encrypted AgentConfig
        bytes32 dilithiumSig;     // Dilithium3 signature over configRoot (truncated to 32 bytes for event log)
        bytes32 attestationId;    // 0G Compute TEE attestation receipt
        AgentStatus status;
        uint256 deployedAt;
        uint256 lastActionAt;
        uint256 rebalanceCount;
    }

    PQCKeyRegistry public immutable keyRegistry;

    mapping(address => uint256[]) private _ownerAgentIds;
    mapping(uint256 => Agent) private _agents;
    uint256 private _nextId = 1;

    event AgentDeployed(
        uint256 indexed agentId,
        address indexed owner,
        bytes32 configRoot,
        bytes32 attestationId
    );
    event AgentPaused(uint256 indexed agentId);
    event AgentResumed(uint256 indexed agentId);
    event AgentWithdrawn(uint256 indexed agentId);
    event AgentActionRecorded(uint256 indexed agentId, bytes32 actionHash, uint256 timestamp);
    event ConfigUpdated(uint256 indexed agentId, bytes32 newConfigRoot);

    error NotOwner();
    error PQCKeyNotRegistered();
    error InvalidStatus(AgentStatus current, AgentStatus required);
    error AgentNotFound();

    constructor(address keyRegistryAddress) {
        keyRegistry = PQCKeyRegistry(keyRegistryAddress);
    }

    function deployAgent(
        bytes32 configRoot,
        bytes32 dilithiumSig,
        bytes32 attestationId
    ) external nonReentrant returns (uint256 agentId) {
        if (!keyRegistry.isRegistered(msg.sender)) revert PQCKeyNotRegistered();

        agentId = _nextId++;
        _agents[agentId] = Agent({
            owner: msg.sender,
            configRoot: configRoot,
            dilithiumSig: dilithiumSig,
            attestationId: attestationId,
            status: AgentStatus.Active,
            deployedAt: block.timestamp,
            lastActionAt: block.timestamp,
            rebalanceCount: 0
        });
        _ownerAgentIds[msg.sender].push(agentId);

        emit AgentDeployed(agentId, msg.sender, configRoot, attestationId);
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
        bytes32 newDilithiumSig
    ) external nonReentrant {
        Agent storage agent = _requireOwner(agentId);
        agent.configRoot = newConfigRoot;
        agent.dilithiumSig = newDilithiumSig;
        agent.lastActionAt = block.timestamp;
        emit ConfigUpdated(agentId, newConfigRoot);
    }

    /// @notice Called by the TEE agent after each rebalance action.
    function recordAction(uint256 agentId, bytes32 actionHash) external nonReentrant {
        Agent storage agent = _agents[agentId];
        if (agent.owner == address(0)) revert AgentNotFound();
        // Only owner or a designated executor can record — simplified to owner for MVP
        if (agent.owner != msg.sender) revert NotOwner();
        agent.lastActionAt = block.timestamp;
        agent.rebalanceCount++;
        emit AgentActionRecorded(agentId, actionHash, block.timestamp);
    }

    function getAgent(uint256 agentId) external view returns (Agent memory) {
        return _agents[agentId];
    }

    function getOwnerAgents(address owner) external view returns (uint256[] memory) {
        return _ownerAgentIds[owner];
    }

    function _requireOwner(uint256 agentId) private view returns (Agent storage) {
        Agent storage agent = _agents[agentId];
        if (agent.owner == address(0)) revert AgentNotFound();
        if (agent.owner != msg.sender) revert NotOwner();
        return agent;
    }
}
