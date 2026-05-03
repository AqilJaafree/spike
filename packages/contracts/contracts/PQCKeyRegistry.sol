// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Registers post-quantum public key fingerprints (Dilithium3 + Kyber-1024) per wallet.
/// Fingerprints are keccak256 hashes of the full public keys, which are stored off-chain in 0G Storage.
contract PQCKeyRegistry is ReentrancyGuard {
    struct PQCKeys {
        bytes32 dilithiumFingerprint; // keccak256 of Dilithium3 public key
        bytes32 kyberFingerprint;     // keccak256 of Kyber-1024 public key
        bytes32 storageRoot;          // 0G Storage root hash of encrypted private key bundle
        uint256 registeredAt;
        uint256 updatedAt;
        bool active;
    }

    mapping(address => PQCKeys) private _keys;

    event KeyRegistered(
        address indexed wallet,
        bytes32 dilithiumFingerprint,
        bytes32 kyberFingerprint,
        bytes32 storageRoot
    );
    event KeyRevoked(address indexed wallet);
    event KeyRotated(
        address indexed wallet,
        bytes32 newDilithiumFingerprint,
        bytes32 newKyberFingerprint,
        bytes32 newStorageRoot
    );

    error AlreadyRegistered();
    error NotRegistered();
    error InvalidFingerprint();

    function register(
        bytes32 dilithiumFingerprint,
        bytes32 kyberFingerprint,
        bytes32 storageRoot
    ) external nonReentrant {
        if (_keys[msg.sender].active) revert AlreadyRegistered();
        if (dilithiumFingerprint == bytes32(0) || kyberFingerprint == bytes32(0)) {
            revert InvalidFingerprint();
        }

        _keys[msg.sender] = PQCKeys({
            dilithiumFingerprint: dilithiumFingerprint,
            kyberFingerprint: kyberFingerprint,
            storageRoot: storageRoot,
            registeredAt: block.timestamp,
            updatedAt: block.timestamp,
            active: true
        });

        emit KeyRegistered(msg.sender, dilithiumFingerprint, kyberFingerprint, storageRoot);
    }

    function rotate(
        bytes32 newDilithiumFingerprint,
        bytes32 newKyberFingerprint,
        bytes32 newStorageRoot
    ) external nonReentrant {
        if (!_keys[msg.sender].active) revert NotRegistered();
        if (newDilithiumFingerprint == bytes32(0) || newKyberFingerprint == bytes32(0)) {
            revert InvalidFingerprint();
        }

        _keys[msg.sender].dilithiumFingerprint = newDilithiumFingerprint;
        _keys[msg.sender].kyberFingerprint = newKyberFingerprint;
        _keys[msg.sender].storageRoot = newStorageRoot;
        _keys[msg.sender].updatedAt = block.timestamp;

        emit KeyRotated(msg.sender, newDilithiumFingerprint, newKyberFingerprint, newStorageRoot);
    }

    function revoke() external nonReentrant {
        if (!_keys[msg.sender].active) revert NotRegistered();
        _keys[msg.sender].active = false;
        emit KeyRevoked(msg.sender);
    }

    function getKeys(address wallet) external view returns (PQCKeys memory) {
        return _keys[wallet];
    }

    function isRegistered(address wallet) external view returns (bool) {
        return _keys[wallet].active;
    }
}
