// SPDX-License-Identifier: MIT

pragma solidity ^0.7.6;
pragma abicoder v2;

interface IMulticall2 {
  struct Call {
    address target;
    bytes callData;
  }
  struct Result {
    bool success;
    bytes returnData;
  }

  function aggregate(Call[] memory calls) external returns (uint256 blockNumber, bytes[] memory returnData);

  function blockAndAggregate(Call[] memory calls)
    external
    returns (
      uint256 blockNumber,
      bytes32 blockHash,
      Result[] memory returnData
    );

  function getBlockNumber() external view returns (uint256 blockNumber);

  function getCurrentBlockTimestamp() external view returns (uint256 timestamp);
}
