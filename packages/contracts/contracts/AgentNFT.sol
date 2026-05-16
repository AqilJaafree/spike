// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./PQCKeyRegistry.sol";
import "./MlDsaVerifier.sol";
import "./IPerformanceScorer.sol";
import "./IERC7857.sol";

/// @notice ERC-721 + ERC-7857 token representing ownership of a Spike DeFi agent.
///
/// Mint:  called exclusively by AgentRegistry on deployAgent().
///
/// Transfer rules (quantum-safe ownership):
///   ERC-721 path  — caller must pre-authorise via authoriseTransfer() (single-use ML-DSA gate).
///   ERC-7857 path — caller uses iTransfer() with optional re-encryption proofs; the
///                   transfer gate is set automatically, so no separate authoriseTransfer() call
///                   is required when the owner initiates directly.
///   Both paths require the recipient to have PQC keys in PQCKeyRegistry.
///
/// On-chain metadata: dilithiumFingerprint, configRoot, actionSigFingerprint, skillKey.
/// intelligentDataOf() returns the ERC-7857 view of those same fields.
/// tokenURI includes live performance score fetched from AgentRegistry (the minter/scorer).
contract AgentNFT is ERC721, ReentrancyGuard, IERC7857, IERC7857Metadata {

    struct AgentMeta {
        bytes32 dilithiumFingerprint; // keccak256 of ML-DSA-65 public key at deploy time
        bytes32 configRoot;           // 0G Storage root of encrypted AgentConfig
        bytes32 actionSigFingerprint; // keccak256(configRoot ‖ full ML-DSA sig)
        bytes32 skillKey;             // keccak256(skillId); zero = no skill assigned
        uint256 mintedAt;
    }

    PQCKeyRegistry     public immutable keyRegistry;
    /// @notice Optional ML-DSA verifier (TeeML or ZK). Zero address = skip verification.
    IMlDsaVerifier     public immutable mldsaVerifier;
    /// @notice Only AgentRegistry may call mint().
    address            public immutable minter;
    /// @notice AgentRegistry implementing IPerformanceScorer for live tokenURI data.
    ///         Set to the same address as minter. address(0) = static URI.
    IPerformanceScorer public immutable scorer;

    mapping(uint256 => AgentMeta) private _meta;

    // Single-use transfer gate: keccak256(tokenId ‖ from ‖ to) → authorised
    mapping(bytes32 => bool) private _transferGate;

    // ERC-7857 usage authorisation
    mapping(uint256 => address[])                   private _authorizedUsers;
    mapping(uint256 => mapping(address => bool))    private _usageAuthorized;

    // ERC-7857 delegate access (owner → assistant address)
    mapping(address => address) private _delegates;

    // Counter for clone token IDs — offset from type(uint256).max/2 to avoid
    // collisions with AgentRegistry's sequential agent IDs
    uint256 private _cloneCounter;

    // ─── Events ───────────────────────────────────────────────────────────────

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

    // ─── Errors ───────────────────────────────────────────────────────────────

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
        keyRegistry   = PQCKeyRegistry(keyRegistryAddress);
        mldsaVerifier = IMlDsaVerifier(verifierAddress);
        minter        = minterAddress;
        scorer        = IPerformanceScorer(scorerAddress);
    }

    // ─── ERC-165 ──────────────────────────────────────────────────────────────

    function supportsInterface(bytes4 interfaceId)
        public view override(ERC721)
        returns (bool)
    {
        return
            interfaceId == type(IERC7857).interfaceId         ||
            interfaceId == type(IERC7857Metadata).interfaceId ||
            super.supportsInterface(interfaceId);
    }

    // Explicit overrides required by Solidity when the same function is declared
    // in both ERC721 (implementation) and IERC7857/IERC7857Metadata (interface).
    function name()
        public view override(ERC721, IERC7857Metadata)
        returns (string memory) { return super.name(); }

    function symbol()
        public view override(ERC721, IERC7857Metadata)
        returns (string memory) { return super.symbol(); }

    function ownerOf(uint256 tokenId)
        public view override(ERC721, IERC7857)
        returns (address) { return super.ownerOf(tokenId); }

    function approve(address to, uint256 tokenId)
        public override(ERC721, IERC7857) { super.approve(to, tokenId); }

    function getApproved(uint256 tokenId)
        public view override(ERC721, IERC7857)
        returns (address) { return super.getApproved(tokenId); }

    function setApprovalForAll(address operator, bool approved)
        public override(ERC721, IERC7857) { super.setApprovalForAll(operator, approved); }

    function isApprovedForAll(address owner, address operator)
        public view override(ERC721, IERC7857)
        returns (bool) { return super.isApprovedForAll(owner, operator); }

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

    // ─── ERC-7857: Transfer with proof ────────────────────────────────────────

    /// @notice ERC-7857 transfer. Owner calls directly — no separate authoriseTransfer()
    ///         needed. Any non-empty proofs are emitted as PublishedSealedKey events so
    ///         the recipient can recover the re-encrypted agent data off-chain via 0G Storage.
    function iTransfer(
        address _to,
        uint256 _tokenId,
        TransferValidityProof[] calldata _proofs
    ) external nonReentrant {
        address from = ownerOf(_tokenId);
        if (msg.sender != from
            && !isApprovedForAll(from, msg.sender)
            && getApproved(_tokenId) != msg.sender)
        {
            revert TransferNotAuthorised();
        }
        if (!keyRegistry.isRegistered(_to)) revert RecipientLacksQPCKeys();

        // Auto-set gate so _update() hook allows the transfer
        bytes32 gateKey = keccak256(abi.encodePacked(_tokenId, from, _to));
        if (!_transferGate[gateKey]) _transferGate[gateKey] = true;

        if (_proofs.length > 0) {
            bytes[] memory sealedKeys = new bytes[](_proofs.length);
            for (uint256 i = 0; i < _proofs.length; i++) {
                sealedKeys[i] = _proofs[i].ownershipProof.sealedKey;
            }
            emit PublishedSealedKey(_to, _tokenId, sealedKeys);
        }

        _safeTransfer(from, _to, _tokenId, "");
        emit Transferred(_tokenId, from, _to);
    }

    /// @notice Clone an agent to a new owner. The clone shares the same configRoot —
    ///         the caller is expected to have re-encrypted the config for the recipient
    ///         (sealed keys published via proofs). Clone tokens live outside AgentRegistry.
    function iClone(
        address _to,
        uint256 _tokenId,
        TransferValidityProof[] calldata _proofs
    ) external nonReentrant returns (uint256 newTokenId) {
        if (ownerOf(_tokenId) != msg.sender) revert TransferNotAuthorised();
        if (!keyRegistry.isRegistered(_to)) revert RecipientLacksQPCKeys();

        // Clone IDs start at max/2 to avoid collision with AgentRegistry IDs
        newTokenId = type(uint256).max / 2 + ++_cloneCounter;
        AgentMeta memory m = _meta[_tokenId];
        _safeMint(_to, newTokenId);
        _meta[newTokenId] = AgentMeta({
            dilithiumFingerprint: m.dilithiumFingerprint,
            configRoot:           m.configRoot,
            actionSigFingerprint: m.actionSigFingerprint,
            skillKey:             m.skillKey,
            mintedAt:             block.timestamp
        });

        if (_proofs.length > 0) {
            bytes[] memory sealedKeys = new bytes[](_proofs.length);
            for (uint256 i = 0; i < _proofs.length; i++) {
                sealedKeys[i] = _proofs[i].ownershipProof.sealedKey;
            }
            emit PublishedSealedKey(_to, newTokenId, sealedKeys);
        }

        emit AgentNFTMinted(newTokenId, _to, m.dilithiumFingerprint, m.configRoot, m.skillKey);
        emit Cloned(_tokenId, newTokenId, msg.sender, _to);
    }

    // ─── ERC-7857: Usage authorisation ───────────────────────────────────────

    function authorizeUsage(uint256 _tokenId, address _user) external {
        if (ownerOf(_tokenId) != msg.sender) revert TransferNotAuthorised();
        if (!_usageAuthorized[_tokenId][_user]) {
            _usageAuthorized[_tokenId][_user] = true;
            _authorizedUsers[_tokenId].push(_user);
        }
        emit Authorization(msg.sender, _user, _tokenId);
    }

    function revokeAuthorization(uint256 _tokenId, address _user) external {
        if (ownerOf(_tokenId) != msg.sender) revert TransferNotAuthorised();
        if (_usageAuthorized[_tokenId][_user]) {
            _usageAuthorized[_tokenId][_user] = false;
            address[] storage users = _authorizedUsers[_tokenId];
            for (uint256 i = 0; i < users.length; i++) {
                if (users[i] == _user) {
                    users[i] = users[users.length - 1];
                    users.pop();
                    break;
                }
            }
        }
        emit AuthorizationRevoked(msg.sender, _user, _tokenId);
    }

    function authorizedUsersOf(uint256 _tokenId) external view returns (address[] memory) {
        return _authorizedUsers[_tokenId];
    }

    // ─── ERC-7857: Delegate access ────────────────────────────────────────────

    function delegateAccess(address _assistant) external {
        _delegates[msg.sender] = _assistant;
        emit DelegateAccess(msg.sender, _assistant);
    }

    function getDelegateAccess(address _user) external view returns (address) {
        return _delegates[_user];
    }

    // ─── ERC-7857: Verifier ───────────────────────────────────────────────────

    /// @notice Returns the ERC-7857 data verifier. Currently address(0) — re-encryption
    ///         proofs are verified off-chain via 0G Compute TeeML; mldsaVerifier handles
    ///         the ML-DSA gate for the ERC-721 transfer path.
    function verifier() external pure returns (IERC7857DataVerifier) {
        return IERC7857DataVerifier(address(0));
    }

    // ─── ERC-7857: Metadata ───────────────────────────────────────────────────

    /// @notice Returns the three on-chain data commitments that constitute the agent's
    ///         "intelligent data": encrypted config root, PQC key fingerprint, skill key.
    function intelligentDataOf(uint256 _tokenId)
        external view
        returns (IntelligentData[] memory data)
    {
        _requireOwned(_tokenId);
        AgentMeta memory m = _meta[_tokenId];
        data = new IntelligentData[](3);
        data[0] = IntelligentData({ dataDescription: "encrypted_config",       dataHash: m.configRoot });
        data[1] = IntelligentData({ dataDescription: "dilithium_fingerprint",  dataHash: m.dilithiumFingerprint });
        data[2] = IntelligentData({ dataDescription: "skill_key",              dataHash: m.skillKey });
    }

    // ─── PQC-gated transfer authorisation (ERC-721 path) ─────────────────────

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
        if (!mldsaVerifier.isVerified(senderFp, gateKey, sigFingerprint)) {
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
