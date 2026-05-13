// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal interface used by AgentNFT to pull live performance data
///         from AgentRegistry without a circular import.
interface IPerformanceScorer {
    struct PerformanceScore {
        uint256 totalActions;
        uint256 successCount;
        int256  pnlBasisPoints; // cumulative signed PnL in bps; can be negative
        uint256 lastUpdatedAt;
    }

    function getPerformanceScore(uint256 agentId)
        external view returns (PerformanceScore memory);
}
