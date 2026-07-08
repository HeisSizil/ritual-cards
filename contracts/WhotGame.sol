// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

/// @dev Minimal interface for the parts of FairDeck this contract needs.
interface IFairDeck {
  function isRevealed(uint256 gameId) external view returns (bool);
}

/// @dev Minimal interface for the parts of Leaderboard this contract needs.
interface ILeaderboard {
  function recordWin(address winner) external;
}

/// @notice A simple wagered two-player Whot game, settled once the deck
///         dealt for the game has been revealed via a FairDeck contract.
contract WhotGame {
  struct Game {
    address player1;
    address player2;
    uint256 wagerAmount;
    bool isFull;
    bool isSettled;
  }

  // The FairDeck contract used to verify a game's deck has been revealed
  // before any payout is allowed.
  IFairDeck public immutable fairDeck;

  // The Leaderboard contract that win counts are reported to on settlement.
  ILeaderboard public immutable leaderboard;

  // gameId -> game state.
  mapping(uint256 => Game) public games;

  // Counter used to hand out sequential, unique gameIds. Starts at 1 so
  // that 0 can be treated as "no such game" where needed.
  uint256 private nextGameId = 1;

  event GameCreated(uint256 indexed gameId, address indexed player1, uint256 wagerAmount);
  event GameJoined(uint256 indexed gameId, address indexed player2);
  event GameSettled(uint256 indexed gameId, address indexed winner, uint256 payout);

  error ZeroWager();
  error GameDoesNotExist(uint256 gameId);
  error GameAlreadyFull(uint256 gameId);
  error CannotJoinOwnGame(uint256 gameId);
  error WagerMismatch(uint256 gameId, uint256 expected, uint256 actual);
  error GameNotFull(uint256 gameId);
  error GameAlreadySettled(uint256 gameId);
  error DeckNotRevealed(uint256 gameId);
  error NotAGameParticipant(uint256 gameId, address caller);
  error InvalidWinner(uint256 gameId, address winner);
  error PayoutFailed(uint256 gameId);

  constructor(address fairDeckAddress, address leaderboardAddress) {
    fairDeck = IFairDeck(fairDeckAddress);
    leaderboard = ILeaderboard(leaderboardAddress);
  }

  /// @notice Creates a new game wagering `msg.value`, with the caller as player1.
  /// @dev The gameId returned here is also the id used to commit/reveal the
  ///      deck on the FairDeck contract for this game.
  function createGame() external payable returns (uint256 gameId) {
    if (msg.value == 0) {
      revert ZeroWager();
    }

    gameId = nextGameId++;

    games[gameId] = Game({
      player1: msg.sender,
      player2: address(0),
      wagerAmount: msg.value,
      isFull: false,
      isSettled: false
    });

    emit GameCreated(gameId, msg.sender, msg.value);
  }

  /// @notice Joins an existing game as player2 by matching player1's wager exactly.
  function joinGame(uint256 gameId) external payable {
    Game storage game = games[gameId];

    if (game.player1 == address(0)) {
      revert GameDoesNotExist(gameId);
    }
    if (game.isFull) {
      revert GameAlreadyFull(gameId);
    }
    if (msg.sender == game.player1) {
      revert CannotJoinOwnGame(gameId);
    }
    if (msg.value != game.wagerAmount) {
      revert WagerMismatch(gameId, game.wagerAmount, msg.value);
    }

    game.player2 = msg.sender;
    game.isFull = true;

    emit GameJoined(gameId, msg.sender);
  }

  /// @notice Settles a full game, paying both wagers to `winner` and
  ///         recording the win on the Leaderboard contract.
  /// @dev Only a participant of the game may call this, `winner` must be
  ///      one of the two players, and the deck for this gameId must have
  ///      already been revealed on the FairDeck contract. Can only succeed
  ///      once per game.
  function settleGame(uint256 gameId, address winner) external {
    Game storage game = games[gameId];

    if (!game.isFull) {
      revert GameNotFull(gameId);
    }
    if (game.isSettled) {
      revert GameAlreadySettled(gameId);
    }
    if (msg.sender != game.player1 && msg.sender != game.player2) {
      revert NotAGameParticipant(gameId, msg.sender);
    }
    if (winner != game.player1 && winner != game.player2) {
      revert InvalidWinner(gameId, winner);
    }
    if (!fairDeck.isRevealed(gameId)) {
      revert DeckNotRevealed(gameId);
    }

    // Effects before interaction to guard against reentrancy.
    game.isSettled = true;

    uint256 payout = game.wagerAmount * 2;

    (bool success, ) = payable(winner).call{value: payout}("");
    if (!success) {
      revert PayoutFailed(gameId);
    }

    leaderboard.recordWin(winner);

    emit GameSettled(gameId, winner, payout);
  }
}
