// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./PQCKeyRegistry.sol";
import "./MlDsaVerifier.sol";
import "./IPerformanceScorer.sol";

/// @notice ERC-721 representing ownership of a Spike DeFi agent.
///
/// Mint:  called exclusively by AgentRegistry on deployAgent().
///
/// Transfer rules (quantum-safe ownership):
///   1. Recipient must have PQC keys in PQCKeyRegistry.
///   2. Caller must call authoriseTransfer() first — single-use TEE-attested ML-DSA gate.
///
/// On-chain metadata: dilithiumFingerprint, configRoot, actionSigFingerprint, skillKey.
/// tokenURI includes live performance score fetched from AgentRegistry (the minter/scorer).
contract AgentNFT is ERC721, ReentrancyGuard {

    struct AgentMeta {
        bytes32 dilithiumFingerprint; // keccak256 of ML-DSA-65 public key at deploy time
        bytes32 configRoot;           // 0G Storage root of encrypted AgentConfig
        bytes32 actionSigFingerprint; // keccak256(configRoot ‖ full ML-DSA sig)
        bytes32 skillKey;             // keccak256(skillId); zero = no skill assigned
        uint256 mintedAt;
    }

    PQCKeyRegistry     public immutable keyRegistry;
    IMlDsaVerifier     public immutable verifier;
    /// @notice Only AgentRegistry may call mint().
    address            public immutable minter;
    /// @notice AgentRegistry implementing IPerformanceScorer for live tokenURI data.
    ///         Set to the same address as minter. address(0) = static URI.
    IPerformanceScorer public immutable scorer;

    mapping(uint256 => AgentMeta) private _meta;

    // Single-use transfer gate: keccak256(tokenId ‖ from ‖ to) → authorised
    mapping(bytes32 => bool) private _transferGate;

    event AgentNFTMinted(
        uint256 indexed tokenId,
        address indexed owner,
        bytes32 dilithiumFingerprint,
        bytes32 configRoot,
        bytes32 skillKey
    );
    event TransferAuthorised(
        uint256 indexed tokenId,
        address indexed from,
        address indexed to,
        string  attestationId
    );

    error OnlyMinter();
    error RecipientLacksQPCKeys();
    error TransferNotAuthorised();
    error TransferAlreadyAuthorised();

    constructor(
        address keyRegistryAddress,
        address verifierAddress,
        address minterAddress,
        address scorerAddress
    ) ERC721("Spike Agent NFT", "INFT") {
        keyRegistry = PQCKeyRegistry(keyRegistryAddress);
        verifier    = IMlDsaVerifier(verifierAddress);
        minter      = minterAddress;
        scorer      = IPerformanceScorer(scorerAddress);
    }

    // ─── Minting ──────────────────────────────────────────────────────────────

    function mint(
        address to,
        uint256 tokenId,
        bytes32 dilithiumFingerprint,
        bytes32 configRoot,
        bytes32 actionSigFingerprint,
        bytes32 skillKey
    ) external {
        if (msg.sender != minter) revert OnlyMinter();
        _safeMint(to, tokenId);
        _meta[tokenId] = AgentMeta({
            dilithiumFingerprint: dilithiumFingerprint,
            configRoot:           configRoot,
            actionSigFingerprint: actionSigFingerprint,
            skillKey:             skillKey,
            mintedAt:             block.timestamp
        });
        emit AgentNFTMinted(tokenId, to, dilithiumFingerprint, configRoot, skillKey);
    }

    // ─── PQC-gated transfer authorisation ─────────────────────────────────────

    /// @notice Pre-authorise a transfer with a TEE-attested ML-DSA signature.
    ///
    ///   Off-chain steps before calling this:
    ///     1. transferHash = keccak256(abi.encodePacked(tokenId, from, to))
    ///     2. Sign transferHash with owner's ML-DSA-65 key → fullSig
    ///     3. sigFp = keccak256(abi.encodePacked(transferHash, fullSig))
    ///     4. Attestor calls TeeAttestationVerifier.registerVerification(
    ///            ownerDilFp, transferHash, sigFp, attestationId)
    ///     5. Call this function
    function authoriseTransfer(
        uint256 tokenId,
        address to,
        bytes32 sigFingerprint,
        string calldata attestationId
    ) external nonReentrant {
        address from = ownerOf(tokenId);
        if (!keyRegistry.isRegistered(to)) revert RecipientLacksQPCKeys();

        bytes32 gateKey = keccak256(abi.encodePacked(tokenId, from, to));
        if (_transferGate[gateKey]) revert TransferAlreadyAuthorised();

        bytes32 senderFp = keyRegistry.getKeys(from).dilithiumFingerprint;
        if (!verifier.isVerified(senderFp, gateKey, sigFingerprint)) {
            revert TransferNotAuthorised();
        }

        _transferGate[gateKey] = true;
        emit TransferAuthorised(tokenId, from, to, attestationId);
    }

    // ─── On-chain metadata ────────────────────────────────────────────────────

    function getAgentMeta(uint256 tokenId) external view returns (AgentMeta memory) {
        return _meta[tokenId];
    }

    /// @notice Fully on-chain JSON data URI. Includes static PQC identity fields
    ///         plus live performance score from AgentRegistry.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        AgentMeta memory m = _meta[tokenId];

        string memory perf = _buildPerfAttributes(tokenId);

        return string(abi.encodePacked(
            'data:application/json;charset=utf-8,{"name":"Spike Agent #',
            _toString(tokenId),
            '","description":"Quantum-safe DeFi agent on 0G Network","attributes":[',
            '{"trait_type":"skillKey","value":"',             _toHex(m.skillKey),             '"},',
            '{"trait_type":"dilithiumFingerprint","value":"', _toHex(m.dilithiumFingerprint), '"},',
            '{"trait_type":"configRoot","value":"',           _toHex(m.configRoot),           '"},',
            '{"trait_type":"actionSigFingerprint","value":"', _toHex(m.actionSigFingerprint), '"},',
            '{"trait_type":"mintedAt","value":',              _toString(m.mintedAt),           '}',
            perf,
            ']}'
        ));
    }

    // ─── Transfer hook (PQC gate) ─────────────────────────────────────────────

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);
        bool isMint = (from == address(0));
        bool isBurn = (to   == address(0));

        if (!isMint && !isBurn) {
            if (!keyRegistry.isRegistered(to)) revert RecipientLacksQPCKeys();

            bytes32 gateKey = keccak256(abi.encodePacked(tokenId, from, to));
            if (!_transferGate[gateKey]) revert TransferNotAuthorised();
            delete _transferGate[gateKey]; // single-use
        }

        return super._update(to, tokenId, auth);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    function _buildPerfAttributes(uint256 tokenId) internal view returns (string memory) {
        if (address(scorer) == address(0)) return '';
        try scorer.getPerformanceScore(tokenId) returns (IPerformanceScorer.PerformanceScore memory s) {
            return string(abi.encodePacked(
                ',{"trait_type":"totalActions","value":',   _toString(s.totalActions),    '}',
                ',{"trait_type":"successCount","value":',   _toString(s.successCount),    '}',
                ',{"trait_type":"pnlBasisPoints","value":', _toSignedString(s.pnlBasisPoints), '}',
                ',{"trait_type":"scoreUpdatedAt","value":', _toString(s.lastUpdatedAt),   '}'
            ));
        } catch {
            return '';
        }
    }

    function _toString(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 tmp = v; uint256 len;
        while (tmp != 0) { len++; tmp /= 10; }
        bytes memory buf = new bytes(len);
        while (v != 0) { buf[--len] = bytes1(uint8(48 + v % 10)); v /= 10; }
        return string(buf);
    }

    function _toSignedString(int256 v) internal pure returns (string memory) {
        if (v >= 0) return _toString(uint256(v));
        return string(abi.encodePacked('-', _toString(uint256(-v))));
    }

    function _toHex(bytes32 b) internal pure returns (string memory) {
        bytes memory h = new bytes(66);
        h[0] = '0'; h[1] = 'x';
        bytes memory alpha = "0123456789abcdef";
        for (uint256 i = 0; i < 32; i++) {
            h[2 + i * 2]     = alpha[uint8(b[i]) >> 4];
            h[2 + i * 2 + 1] = alpha[uint8(b[i]) & 0x0f];
        }
        return string(h);
    }
}
