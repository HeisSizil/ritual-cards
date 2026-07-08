import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";

describe("FairDeck", function () {
  const GAME_ID = 1n;
  const SALT = 12345n;
  const CARDS = [2, 51, 0, 17, 33];

  // Computes the same commitment hash the contract expects:
  // keccak256(abi.encode(cards, salt)).
  function deckHash(cards: number[], salt: bigint): string {
    const encoded = hre.ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint8[]", "uint256"],
      [cards, salt],
    );
    return hre.ethers.keccak256(encoded);
  }

  // Deploy a fresh contract once and reuse the snapshot across tests.
  async function deployFairDeckFixture() {
    const [dealer, other] = await hre.ethers.getSigners();

    const FairDeck = await hre.ethers.getContractFactory("FairDeck");
    const fairDeck = await FairDeck.deploy();

    return { fairDeck, dealer, other };
  }

  describe("Happy path", function () {
    it("Should commit a deck hash for a game", async function () {
      const { fairDeck } = await loadFixture(deployFairDeckFixture);

      await expect(fairDeck.commitDeck(GAME_ID, deckHash(CARDS, SALT))).not.to
        .be.reverted;
      expect(await fairDeck.isRevealed(GAME_ID)).to.equal(false);
    });

    it("Should reveal a deck matching the commitment", async function () {
      const { fairDeck } = await loadFixture(deployFairDeckFixture);

      await fairDeck.commitDeck(GAME_ID, deckHash(CARDS, SALT));
      await fairDeck.revealDeck(GAME_ID, CARDS, SALT);

      expect(await fairDeck.isRevealed(GAME_ID)).to.equal(true);
    });

    it("Should emit DeckRevealed on successful reveal", async function () {
      const { fairDeck } = await loadFixture(deployFairDeckFixture);

      await fairDeck.commitDeck(GAME_ID, deckHash(CARDS, SALT));

      await expect(fairDeck.revealDeck(GAME_ID, CARDS, SALT))
        .to.emit(fairDeck, "DeckRevealed")
        .withArgs(GAME_ID, CARDS);
    });

    it("Should track independent games separately", async function () {
      const { fairDeck } = await loadFixture(deployFairDeckFixture);
      const otherGameId = 2n;
      const otherCards = [7, 8, 9];
      const otherSalt = 999n;

      await fairDeck.commitDeck(GAME_ID, deckHash(CARDS, SALT));
      await fairDeck.commitDeck(otherGameId, deckHash(otherCards, otherSalt));

      await fairDeck.revealDeck(GAME_ID, CARDS, SALT);

      expect(await fairDeck.isRevealed(GAME_ID)).to.equal(true);
      expect(await fairDeck.isRevealed(otherGameId)).to.equal(false);
    });
  });

  describe("Reverts", function () {
    it("Should revert commitDeck if the game already has a commitment", async function () {
      const { fairDeck } = await loadFixture(deployFairDeckFixture);

      await fairDeck.commitDeck(GAME_ID, deckHash(CARDS, SALT));

      await expect(fairDeck.commitDeck(GAME_ID, deckHash(CARDS, SALT)))
        .to.be.revertedWithCustomError(fairDeck, "DeckAlreadyCommitted")
        .withArgs(GAME_ID);
    });

    it("Should revert revealDeck if the game was never committed", async function () {
      const { fairDeck } = await loadFixture(deployFairDeckFixture);

      await expect(fairDeck.revealDeck(GAME_ID, CARDS, SALT))
        .to.be.revertedWithCustomError(fairDeck, "GameNotCommitted")
        .withArgs(GAME_ID);
    });

    it("Should revert revealDeck if the cards/salt don't match the commitment", async function () {
      const { fairDeck } = await loadFixture(deployFairDeckFixture);

      await fairDeck.commitDeck(GAME_ID, deckHash(CARDS, SALT));

      const wrongCards = [1, 2, 3];
      await expect(fairDeck.revealDeck(GAME_ID, wrongCards, SALT))
        .to.be.revertedWithCustomError(fairDeck, "DeckHashMismatch")
        .withArgs(GAME_ID);
    });

    it("Should revert revealDeck if the salt doesn't match the commitment", async function () {
      const { fairDeck } = await loadFixture(deployFairDeckFixture);

      await fairDeck.commitDeck(GAME_ID, deckHash(CARDS, SALT));

      const wrongSalt = SALT + 1n;
      await expect(fairDeck.revealDeck(GAME_ID, CARDS, wrongSalt))
        .to.be.revertedWithCustomError(fairDeck, "DeckHashMismatch")
        .withArgs(GAME_ID);
    });

    it("Should revert revealDeck if the deck was already revealed", async function () {
      const { fairDeck } = await loadFixture(deployFairDeckFixture);

      await fairDeck.commitDeck(GAME_ID, deckHash(CARDS, SALT));
      await fairDeck.revealDeck(GAME_ID, CARDS, SALT);

      await expect(fairDeck.revealDeck(GAME_ID, CARDS, SALT))
        .to.be.revertedWithCustomError(fairDeck, "DeckAlreadyRevealed")
        .withArgs(GAME_ID);
    });
  });
});
