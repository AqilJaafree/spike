// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Common interface for on-chain ML-DSA signature verification.
/// Implementations choose between TEE attestation (live today) or ZK proofs (future).
interface IMlDsaVerifier {
    /// @param publicKeyFingerprint  keccak256 of the ML-DSA-65 public key
    /// @param messageHash           keccak256 of the signed message (e.g. configRoot)
    /// @param sigFingerprint        keccak256 commitment of the full signature
    function isVerified(
        bytes32 publicKeyFingerprint,
        bytes32 messageHash,
        bytes32 sigFingerprint
    ) external view returns (bool);
}

// ─────────────────────────────────────────────────────────────────────────────
// TeeAttestationVerifier
//
// Stores ML-DSA verification results attested by a 0G Compute TeeML provider.
// A trusted relayer (attestor) submits results after confirming them via the
// 0G serving-broker SDK (broker.inference.processResponse). The attestation ID
// from 0G Compute is logged for auditability.
//
// Trust model: Intel TDX hardware root-of-trust → 0G Compute attestation →
//              relayer call → on-chain record.
// ─────────────────────────────────────────────────────────────────────────────
contract TeeAttestationVerifier is IMlDsaVerifier, ReentrancyGuard {
    /// @notice Address authorised to register TEE-attested results.
    address public immutable attestor;

    // key = keccak256(abi.encodePacked(pubkeyFp, msgHash, sigFp))
    mapping(bytes32 => bool) private _verified;

    event VerificationRegistered(
        bytes32 indexed publicKeyFingerprint,
        bytes32 indexed messageHash,
        bytes32 sigFingerprint,
        string  attestationId   // 0G Compute chatID / ZG-Res-Key
    );

    error NotAttestor();
    error AlreadyVerified();

    constructor(address attestorAddress) {
        attestor = attestorAddress;
    }

    /// @notice Called by the trusted attestor after verifying the TEE response
    ///         via `broker.inference.processResponse` in the 0G serving-broker SDK.
    function registerVerification(
        bytes32 publicKeyFingerprint,
        bytes32 messageHash,
        bytes32 sigFingerprint,
        string calldata attestationId
    ) external nonReentrant {
        if (msg.sender != attestor) revert NotAttestor();
        bytes32 key = keccak256(abi.encodePacked(publicKeyFingerprint, messageHash, sigFingerprint));
        if (_verified[key]) revert AlreadyVerified();
        _verified[key] = true;
        emit VerificationRegistered(publicKeyFingerprint, messageHash, sigFingerprint, attestationId);
    }

    function isVerified(
        bytes32 publicKeyFingerprint,
        bytes32 messageHash,
        bytes32 sigFingerprint
    ) external view returns (bool) {
        return _verified[keccak256(abi.encodePacked(publicKeyFingerprint, messageHash, sigFingerprint))];
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ZkProofVerifier  (stub — wires up when Risc0/SP1 is deployed on 0G Chain)
//
// Intended flow once live:
//   1. Off-chain: Rust guest (pqc_dilithium crate) verifies ML-DSA sig
//   2. Risc0 Bonsai / SP1 Prover Network generates Groth16 proof
//   3. proof + journal submitted to this contract
//   4. Groth16Verifier (Risc0) or SP1Verifier deployed on 0G Chain validates proof
//   5. Journal encodes (pubkeyFp, msgHash, sigFp, verified=true) → isVerified returns true
//
// Replace `_risc0Verifier` with the actual Risc0/SP1 verifier address once deployed.
// ─────────────────────────────────────────────────────────────────────────────
contract ZkProofVerifier is IMlDsaVerifier, ReentrancyGuard {
    // Placeholder — swap for Risc0 ImageID of the ml_dsa_verify guest program
    bytes32 public constant ML_DSA_VERIFY_IMAGE_ID = bytes32(0);

    // key = keccak256(pubkeyFp, msgHash, sigFp) → verified by ZK proof
    mapping(bytes32 => bool) private _verified;

    event ZkVerificationRegistered(
        bytes32 indexed publicKeyFingerprint,
        bytes32 indexed messageHash,
        bytes32 sigFingerprint
    );

    error ZkVerifierNotDeployed();
    error InvalidProof();
    error InvalidJournal();

    /// @notice Submit a Risc0/SP1 proof that ML-DSA verify returned true.
    /// @param proof       ABI-encoded Groth16/PLONK proof from Bonsai / SP1 Prover Network
    /// @param journal     ABI-encoded (pubkeyFp, msgHash, sigFp, verified) output from guest
    function submitZkProof(
        bytes calldata proof,
        bytes calldata journal
    ) external nonReentrant {
        // Stub: real implementation calls Risc0 Groth16Verifier.verify(imageId, journal, proof)
        // or SP1Verifier.verifyProof(vkey, publicValues, proofBytes)
        revert ZkVerifierNotDeployed();
    }

    function isVerified(
        bytes32 publicKeyFingerprint,
        bytes32 messageHash,
        bytes32 sigFingerprint
    ) external view returns (bool) {
        return _verified[keccak256(abi.encodePacked(publicKeyFingerprint, messageHash, sigFingerprint))];
    }
}
