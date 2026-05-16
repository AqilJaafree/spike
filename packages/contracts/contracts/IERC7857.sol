// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// ─── ERC-7857: AI Agents NFT with Private Metadata ───────────────────────────
// https://eips.ethereum.org/EIPS/eip-7857

enum OracleType { TEE, ZKP }

/// @notice Single piece of (encrypted) intelligent data attached to an agent token.
struct IntelligentData {
    string  dataDescription; // e.g. "encrypted_config", "dilithium_fingerprint"
    bytes32 dataHash;        // on-chain commitment; actual data lives off-chain
}

struct AccessProof {
    bytes32 oldDataHash;
    bytes32 newDataHash;
    bytes   nonce;
    bytes   encryptedPubKey;
    bytes   proof;
}

struct OwnershipProof {
    OracleType oracleType;
    bytes32    oldDataHash;
    bytes32    newDataHash;
    bytes      sealedKey;     // key sealed to recipient's TEE/pubkey
    bytes      encryptedPubKey;
    bytes      nonce;
    bytes      proof;
}

struct TransferValidityProof {
    OwnershipProof ownershipProof;
    AccessProof[]  accessProofs;
}

struct TransferValidityProofOutput {
    bool      valid;
    bytes32[] newDataHashes;
    bytes[]   sealedKeys;
    address   recipient;
}

/// @notice Verifies re-encryption proofs via TEE or ZKP before a transfer.
interface IERC7857DataVerifier {
    function verifyTransferValidity(
        TransferValidityProof[] calldata _proofs
    ) external returns (TransferValidityProofOutput[] memory);
}

/// @notice Collection-level metadata and per-token intelligent data access.
interface IERC7857Metadata {
    function name()   external view returns (string memory);
    function symbol() external view returns (string memory);
    function intelligentDataOf(uint256 _tokenId) external view returns (IntelligentData[] memory);
}

/// @notice Core ERC-7857 interface: ownership, transfer-with-proof, and usage authorisation.
interface IERC7857 {
    event Authorization(address indexed _from, address indexed _to, uint256 indexed _tokenId);
    event AuthorizationRevoked(address indexed _from, address indexed _to, uint256 indexed _tokenId);
    event Transferred(uint256 _tokenId, address indexed _from, address indexed _to);
    event Cloned(uint256 indexed _tokenId, uint256 indexed _newTokenId, address _from, address _to);
    event PublishedSealedKey(address indexed _to, uint256 indexed _tokenId, bytes[] _sealedKeys);
    event DelegateAccess(address indexed _user, address indexed _assistant);

    // ─── Transfer ─────────────────────────────────────────────────────────────
    function iTransfer(address _to, uint256 _tokenId, TransferValidityProof[] calldata _proofs) external;
    function iClone(address _to, uint256 _tokenId, TransferValidityProof[] calldata _proofs) external returns (uint256);

    // ─── Access control ───────────────────────────────────────────────────────
    function authorizeUsage(uint256 _tokenId, address _user) external;
    function revokeAuthorization(uint256 _tokenId, address _user) external;
    function delegateAccess(address _assistant) external;

    // ─── ERC-721 compatibility ────────────────────────────────────────────────
    function approve(address _to, uint256 _tokenId) external;
    function setApprovalForAll(address _operator, bool _approved) external;

    // ─── Views ────────────────────────────────────────────────────────────────
    function ownerOf(uint256 _tokenId) external view returns (address);
    function authorizedUsersOf(uint256 _tokenId) external view returns (address[] memory);
    function getApproved(uint256 _tokenId) external view returns (address);
    function isApprovedForAll(address _owner, address _operator) external view returns (bool);
    function getDelegateAccess(address _user) external view returns (address);
    function verifier() external view returns (IERC7857DataVerifier);
}
