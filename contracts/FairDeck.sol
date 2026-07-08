// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

/// @notice Commit-reveal scheme for dealing a shuffled deck fairly.
/// @dev The dealer commits to a shuffled deck by submitting only its hash,
///      then later reveals the actual cards. Anyone can verify the reveal
///      matches the original commitment, so the dealer cannot alter the
///      deck after seeing how the game unfolds.
contract FairDeck {
  // gameId -> commitment hash of the shuffled deck (keccak256(cards, salt)).
  mapping(uint256 => bytes32) private deckHashes;

  // gameId -> whether the deck for that game has been revealed.
  mapping(uint256 => bool) private revealedGames;

  event DeckRevealed(uint256 indexed gameId, uint8[] cards);

  error DeckAlreadyCommitted(uint256 gameId);
  error GameNotCommitted(uint256 gameId);
  error DeckAlreadyRevealed(uint256 gameId);
  error DeckHashMismatch(uint256 gameId);

  /// @notice Commits to a shuffled deck for `gameId` by storing its hash.
  /// @dev Can only be called once per gameId; the actual cards and salt
  ///      are kept off-chain until revealDeck is called.
  function commitDeck(uint256 gameId, bytes32 deckHash) external {
    if (deckHashes[gameId] != bytes32(0)) {
      revert DeckAlreadyCommitted(gameId);
    }

    deckHashes[gameId] = deckHash;
  }

  /// @notice Reveals the deck for `gameId`, proving it matches the earlier commitment.
  /// @dev Re-hashes `cards` and `salt` the same way the commitment was built
  ///      and reverts if it doesn't match the stored hash. Can only succeed
  ///      once per gameId.
  function revealDeck(uint256 gameId, uint8[] calldata cards, uint256 salt) external {
    bytes32 storedHash = deckHashes[gameId];

    // A zero hash means commitDeck was never called for this gameId.
    if (storedHash == bytes32(0)) {
      revert GameNotCommitted(gameId);
    }

    if (revealedGames[gameId]) {
      revert DeckAlreadyRevealed(gameId);
    }

    bytes32 computedHash = keccak256(abi.encode(cards, salt));
    if (computedHash != storedHash) {
      revert DeckHashMismatch(gameId);
    }

    revealedGames[gameId] = true;

    emit DeckRevealed(gameId, cards);
  }

  /// @notice Returns whether the deck for `gameId` has been revealed.
  function isRevealed(uint256 gameId) external view returns (bool) {
    return revealedGames[gameId];
  }
}
