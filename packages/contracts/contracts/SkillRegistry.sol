// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice On-chain catalog of approved DeFi agent skills.
///         Each skill is defined by a markdown file stored on 0G Storage.
///         The `storageHash` is the 0G Merkle root of that file.
///
/// `skillKey` used everywhere else = keccak256(abi.encodePacked(id)).
contract SkillRegistry is Ownable {

    enum SkillCategory {
        LiquidityProvision, // 0
        DCA,                // 1
        LendingBorrowing,   // 2
        SimTrade            // 3
    }

    struct Skill {
        string        id;          // e.g. "lp-provider"
        string        name;        // e.g. "Liquidity Provider"
        SkillCategory category;
        bytes32       storageHash; // 0G Storage Merkle root of the skill markdown file
        bool          active;
        uint256       registeredAt;
    }

    // skillKey = keccak256(abi.encodePacked(id)) → Skill
    mapping(bytes32 => Skill) private _skills;
    bytes32[] private _skillKeys;

    event SkillRegistered(
        bytes32 indexed skillKey,
        string  id,
        SkillCategory category,
        bytes32 storageHash
    );
    event SkillStatusChanged(bytes32 indexed skillKey, bool active);

    error SkillNotFound();
    error SkillAlreadyRegistered();

    constructor() Ownable(msg.sender) {}

    // ─── Admin ────────────────────────────────────────────────────────────────

    function registerSkill(
        string calldata id,
        string calldata name,
        SkillCategory   category,
        bytes32         storageHash
    ) external onlyOwner returns (bytes32 skillKey) {
        skillKey = keccak256(abi.encodePacked(id));
        if (_skills[skillKey].registeredAt != 0) revert SkillAlreadyRegistered();

        _skills[skillKey] = Skill({
            id:           id,
            name:         name,
            category:     category,
            storageHash:  storageHash,
            active:       true,
            registeredAt: block.timestamp
        });
        _skillKeys.push(skillKey);

        emit SkillRegistered(skillKey, id, category, storageHash);
    }

    function setActive(bytes32 skillKey, bool active) external onlyOwner {
        if (_skills[skillKey].registeredAt == 0) revert SkillNotFound();
        _skills[skillKey].active = active;
        emit SkillStatusChanged(skillKey, active);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getSkill(bytes32 skillKey) external view returns (Skill memory) {
        if (_skills[skillKey].registeredAt == 0) revert SkillNotFound();
        return _skills[skillKey];
    }

    /// @notice Returns true if the skill is active.
    ///         bytes32(0) always returns true — used as a backward-compat skip sentinel.
    function isActive(bytes32 skillKey) external view returns (bool) {
        if (skillKey == bytes32(0)) return true;
        return _skills[skillKey].active;
    }

    function getAllSkills() external view returns (Skill[] memory skills) {
        skills = new Skill[](_skillKeys.length);
        for (uint256 i = 0; i < _skillKeys.length; i++) {
            skills[i] = _skills[_skillKeys[i]];
        }
    }

    function skillCount() external view returns (uint256) {
        return _skillKeys.length;
    }
}
