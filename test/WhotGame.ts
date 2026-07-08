import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";

describe("WhotGame", function () {
  const WAGER = hre.ethers.parseEther("1");
  const SALT = 12345n;
  const CARDS = [2, 51, 0, 17, 33];

  // Computes the same commitment hash FairDeck expects:
  // keccak256(abi.encode(cards, salt)).
  function deckHash(cards: number[], salt: bigint): string {
    const encoded = hre.ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint8[]", "uint256"],
      [cards, salt],
    );
    return hre.ethers.keccak256(encoded);
  }

  // Deploys FairDeck, Leaderboard, and a WhotGame wired to both, and
  // reuses the snapshot across tests.
  async function deployWhotGameFixture() {
    const [deployer, player1, player2, other] = await hre.ethers.getSigners();

    const FairDeck = await hre.ethers.getContractFactory("FairDeck");
    const fairDeck = await FairDeck.deploy();

    // Leaderboard's constructor requires an authorized caller address, but
    // WhotGame's address isn't known until after WhotGame is deployed (and
    // WhotGame's constructor needs Leaderboard's address). Break the cycle
    // by pointing Leaderboard at the deployer first, then repointing it at
    // WhotGame once deployed via the owner-only setAuthorizedCaller.
    const Leaderboard = await hre.ethers.getContractFactory("Leaderboard");
    const leaderboard = await Leaderboard.connect(deployer).deploy(deployer.address);

    const WhotGame = await hre.ethers.getContractFactory("WhotGame");
    const whotGame = await WhotGame.deploy(
      await fairDeck.getAddress(),
      await leaderboard.getAddress(),
    );

    await leaderboard.connect(deployer).setAuthorizedCaller(await whotGame.getAddress());

    return { fairDeck, leaderboard, whotGame, deployer, player1, player2, other };
  }

  // Creates a game as player1 and returns the gameId, using a static call
  // to read the return value before sending the real transaction.
  async function createGame(whotGame: any, player1: any, wager = WAGER) {
    const gameId = await whotGame.connect(player1).createGame.staticCall({ value: wager });
    await whotGame.connect(player1).createGame({ value: wager });
    return gameId as bigint;
  }

  // Commits and reveals a deck for gameId on FairDeck, so settleGame's
  // isRevealed check passes.
  async function revealDeckFor(fairDeck: any, gameId: bigint) {
    await fairDeck.commitDeck(gameId, deckHash(CARDS, SALT));
    await fairDeck.revealDeck(gameId, CARDS, SALT);
  }

  describe("Happy path", function () {
    it("Should create a game with a wager and return a gameId", async function () {
      const { whotGame, player1 } = await loadFixture(deployWhotGameFixture);

      const gameId = await createGame(whotGame, player1);

      const game = await whotGame.games(gameId);
      expect(game.player1).to.equal(player1.address);
      expect(game.player2).to.equal(hre.ethers.ZeroAddress);
      expect(game.wagerAmount).to.equal(WAGER);
      expect(game.isFull).to.equal(false);
      expect(game.isSettled).to.equal(false);
    });

    it("Should emit GameCreated on createGame", async function () {
      const { whotGame, player1 } = await loadFixture(deployWhotGameFixture);

      await expect(whotGame.connect(player1).createGame({ value: WAGER }))
        .to.emit(whotGame, "GameCreated")
        .withArgs(1n, player1.address, WAGER);
    });

    it("Should let a second player join by matching the wager", async function () {
      const { whotGame, player1, player2 } = await loadFixture(deployWhotGameFixture);

      const gameId = await createGame(whotGame, player1);
      await whotGame.connect(player2).joinGame(gameId, { value: WAGER });

      const game = await whotGame.games(gameId);
      expect(game.player2).to.equal(player2.address);
      expect(game.isFull).to.equal(true);
    });

    it("Should emit GameJoined on joinGame", async function () {
      const { whotGame, player1, player2 } = await loadFixture(deployWhotGameFixture);

      const gameId = await createGame(whotGame, player1);

      await expect(whotGame.connect(player2).joinGame(gameId, { value: WAGER }))
        .to.emit(whotGame, "GameJoined")
        .withArgs(gameId, player2.address);
    });

    it("Should settle a game and pay both wagers to the winner after the deck is revealed", async function () {
      const { fairDeck, whotGame, player1, player2 } = await loadFixture(deployWhotGameFixture);

      const gameId = await createGame(whotGame, player1);
      await whotGame.connect(player2).joinGame(gameId, { value: WAGER });
      await revealDeckFor(fairDeck, gameId);

      const payout = WAGER * 2n;
      await expect(
        whotGame.connect(player1).settleGame(gameId, player2.address),
      ).to.changeEtherBalances([player2, whotGame], [payout, -payout]);

      const game = await whotGame.games(gameId);
      expect(game.isSettled).to.equal(true);
    });

    it("Should emit GameSettled on successful settlement", async function () {
      const { fairDeck, whotGame, player1, player2 } = await loadFixture(deployWhotGameFixture);

      const gameId = await createGame(whotGame, player1);
      await whotGame.connect(player2).joinGame(gameId, { value: WAGER });
      await revealDeckFor(fairDeck, gameId);

      await expect(whotGame.connect(player1).settleGame(gameId, player2.address))
        .to.emit(whotGame, "GameSettled")
        .withArgs(gameId, player2.address, WAGER * 2n);
    });

    it("Should record the win on the Leaderboard when settling", async function () {
      const { fairDeck, leaderboard, whotGame, player1, player2 } = await loadFixture(
        deployWhotGameFixture,
      );

      const gameId = await createGame(whotGame, player1);
      await whotGame.connect(player2).joinGame(gameId, { value: WAGER });
      await revealDeckFor(fairDeck, gameId);

      await expect(whotGame.connect(player1).settleGame(gameId, player2.address))
        .to.emit(leaderboard, "WinRecorded")
        .withArgs(player2.address, 1n);

      expect(await leaderboard.getWins(player2.address)).to.equal(1n);
    });

    it("Should accumulate wins across multiple settled games for the same winner", async function () {
      const { fairDeck, leaderboard, whotGame, player1, player2 } = await loadFixture(
        deployWhotGameFixture,
      );

      for (let i = 0; i < 2; i++) {
        const gameId = await createGame(whotGame, player1);
        await whotGame.connect(player2).joinGame(gameId, { value: WAGER });
        await revealDeckFor(fairDeck, gameId);
        await whotGame.connect(player1).settleGame(gameId, player2.address);
      }

      expect(await leaderboard.getWins(player2.address)).to.equal(2n);
    });
  });

  describe("Reverts", function () {
    it("Should revert createGame with a zero wager", async function () {
      const { whotGame, player1 } = await loadFixture(deployWhotGameFixture);

      await expect(
        whotGame.connect(player1).createGame({ value: 0 }),
      ).to.be.revertedWithCustomError(whotGame, "ZeroWager");
    });

    it("Should revert joinGame for a game that doesn't exist", async function () {
      const { whotGame, player2 } = await loadFixture(deployWhotGameFixture);

      await expect(whotGame.connect(player2).joinGame(999, { value: WAGER }))
        .to.be.revertedWithCustomError(whotGame, "GameDoesNotExist")
        .withArgs(999);
    });

    it("Should revert joinGame if the game is already full", async function () {
      const { whotGame, player1, player2, other } = await loadFixture(deployWhotGameFixture);

      const gameId = await createGame(whotGame, player1);
      await whotGame.connect(player2).joinGame(gameId, { value: WAGER });

      await expect(whotGame.connect(other).joinGame(gameId, { value: WAGER }))
        .to.be.revertedWithCustomError(whotGame, "GameAlreadyFull")
        .withArgs(gameId);
    });

    it("Should revert joinGame if the creator tries to join their own game", async function () {
      const { whotGame, player1 } = await loadFixture(deployWhotGameFixture);

      const gameId = await createGame(whotGame, player1);

      await expect(whotGame.connect(player1).joinGame(gameId, { value: WAGER }))
        .to.be.revertedWithCustomError(whotGame, "CannotJoinOwnGame")
        .withArgs(gameId);
    });

    it("Should revert joinGame if the wager doesn't match exactly", async function () {
      const { whotGame, player1, player2 } = await loadFixture(deployWhotGameFixture);

      const gameId = await createGame(whotGame, player1);
      const wrongWager = WAGER + 1n;

      await expect(whotGame.connect(player2).joinGame(gameId, { value: wrongWager }))
        .to.be.revertedWithCustomError(whotGame, "WagerMismatch")
        .withArgs(gameId, WAGER, wrongWager);
    });

    it("Should revert settleGame if the game isn't full yet", async function () {
      const { whotGame, player1, player2 } = await loadFixture(deployWhotGameFixture);

      const gameId = await createGame(whotGame, player1);

      await expect(whotGame.connect(player1).settleGame(gameId, player2.address))
        .to.be.revertedWithCustomError(whotGame, "GameNotFull")
        .withArgs(gameId);
    });

    it("Should revert settleGame if the deck hasn't been revealed yet", async function () {
      const { whotGame, player1, player2 } = await loadFixture(deployWhotGameFixture);

      const gameId = await createGame(whotGame, player1);
      await whotGame.connect(player2).joinGame(gameId, { value: WAGER });

      await expect(whotGame.connect(player1).settleGame(gameId, player2.address))
        .to.be.revertedWithCustomError(whotGame, "DeckNotRevealed")
        .withArgs(gameId);
    });

    it("Should revert settleGame if called by someone who isn't a participant", async function () {
      const { fairDeck, whotGame, player1, player2, other } = await loadFixture(
        deployWhotGameFixture,
      );

      const gameId = await createGame(whotGame, player1);
      await whotGame.connect(player2).joinGame(gameId, { value: WAGER });
      await revealDeckFor(fairDeck, gameId);

      await expect(whotGame.connect(other).settleGame(gameId, player2.address))
        .to.be.revertedWithCustomError(whotGame, "NotAGameParticipant")
        .withArgs(gameId, other.address);
    });

    it("Should revert settleGame if winner isn't one of the two players", async function () {
      const { fairDeck, whotGame, player1, player2, other } = await loadFixture(
        deployWhotGameFixture,
      );

      const gameId = await createGame(whotGame, player1);
      await whotGame.connect(player2).joinGame(gameId, { value: WAGER });
      await revealDeckFor(fairDeck, gameId);

      await expect(whotGame.connect(player1).settleGame(gameId, other.address))
        .to.be.revertedWithCustomError(whotGame, "InvalidWinner")
        .withArgs(gameId, other.address);
    });

    it("Should revert settleGame if the game was already settled", async function () {
      const { fairDeck, whotGame, player1, player2 } = await loadFixture(deployWhotGameFixture);

      const gameId = await createGame(whotGame, player1);
      await whotGame.connect(player2).joinGame(gameId, { value: WAGER });
      await revealDeckFor(fairDeck, gameId);

      await whotGame.connect(player1).settleGame(gameId, player2.address);

      await expect(whotGame.connect(player1).settleGame(gameId, player2.address))
        .to.be.revertedWithCustomError(whotGame, "GameAlreadySettled")
        .withArgs(gameId);
    });
  });
});
