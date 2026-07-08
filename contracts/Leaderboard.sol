// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

/// @notice Tracks win counts per address, updatable only by an approved
///         caller contract (e.g. WhotGame), so wins can't be self-reported.
contract Leaderboard {
  // Can update authorizedCaller. Set to the deployer at construction.
  address public owner;

  // The only address allowed to call recordWin (e.g. a WhotGame contract).
  address public authorizedCaller;

  // player -> number of recorded wins.
  mapping(address => uint256) private wins;

  event WinRecorded(address indexed winner, uint256 newTotal);

  error NotOwner();
  error NotAuthorizedCaller();
  error ZeroAddress();

  modifier onlyOwner() {
    if (msg.sender != owner) {
      revert NotOwner();
    }
    _;
  }

  constructor(address initialAuthorizedCaller) {
    if (initialAuthorizedCaller == address(0)) {
      revert ZeroAddress();
    }

    owner = msg.sender;
    authorizedCaller = initialAuthorizedCaller;
  }

  /// @notice Increments `winner`'s win count. Only callable by authorizedCaller.
  function recordWin(address winner) external {
    if (msg.sender != authorizedCaller) {
      revert NotAuthorizedCaller();
    }

    uint256 newTotal = ++wins[winner];

    emit WinRecorded(winner, newTotal);
  }

  /// @notice Returns the number of wins recorded for `player`.
  function getWins(address player) external view returns (uint256) {
    return wins[player];
  }

  /// @notice Updates the address allowed to call recordWin. Owner-only.
  /// @dev Lets the owner point the leaderboard at a new game contract,
  ///      e.g. when redeploying WhotGame.
  function setAuthorizedCaller(address newCaller) external onlyOwner {
    if (newCaller == address(0)) {
      revert ZeroAddress();
    }

    authorizedCaller = newCaller;
  }
}
