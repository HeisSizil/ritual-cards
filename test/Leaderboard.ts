import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import hre from "hardhat";

describe("Leaderboard", function () {
  // Deploys a fresh Leaderboard, authorizing `authorizedCaller` to call
  // recordWin, and reuses the snapshot across tests.
  async function deployLeaderboardFixture() {
    const [owner, authorizedCaller, player, other] = await hre.ethers.getSigners();

    const Leaderboard = await hre.ethers.getContractFactory("Leaderboard");
    const leaderboard = await Leaderboard.connect(owner).deploy(authorizedCaller.address);

    return { leaderboard, owner, authorizedCaller, player, other };
  }

  describe("Happy path", function () {
    it("Should set the deployer as owner and the given initial authorized caller", async function () {
      const { leaderboard, owner, authorizedCaller } = await loadFixture(
        deployLeaderboardFixture,
      );

      expect(await leaderboard.owner()).to.equal(owner.address);
      expect(await leaderboard.authorizedCaller()).to.equal(authorizedCaller.address);
    });

    it("Should return zero wins for a player with no recorded wins", async function () {
      const { leaderboard, player } = await loadFixture(deployLeaderboardFixture);

      expect(await leaderboard.getWins(player.address)).to.equal(0n);
    });

    it("Should let the authorized caller record a win", async function () {
      const { leaderboard, authorizedCaller, player } = await loadFixture(
        deployLeaderboardFixture,
      );

      await leaderboard.connect(authorizedCaller).recordWin(player.address);

      expect(await leaderboard.getWins(player.address)).to.equal(1n);
    });

    it("Should accumulate multiple wins for the same player", async function () {
      const { leaderboard, authorizedCaller, player } = await loadFixture(
        deployLeaderboardFixture,
      );

      await leaderboard.connect(authorizedCaller).recordWin(player.address);
      await leaderboard.connect(authorizedCaller).recordWin(player.address);
      await leaderboard.connect(authorizedCaller).recordWin(player.address);

      expect(await leaderboard.getWins(player.address)).to.equal(3n);
    });

    it("Should emit WinRecorded with the new running total", async function () {
      const { leaderboard, authorizedCaller, player } = await loadFixture(
        deployLeaderboardFixture,
      );

      await leaderboard.connect(authorizedCaller).recordWin(player.address);

      await expect(leaderboard.connect(authorizedCaller).recordWin(player.address))
        .to.emit(leaderboard, "WinRecorded")
        .withArgs(player.address, 2n);
    });

    it("Should let the owner repoint the authorized caller", async function () {
      const { leaderboard, owner, authorizedCaller, other, player } = await loadFixture(
        deployLeaderboardFixture,
      );

      await leaderboard.connect(owner).setAuthorizedCaller(other.address);

      expect(await leaderboard.authorizedCaller()).to.equal(other.address);

      // The new authorized caller can record wins...
      await expect(leaderboard.connect(other).recordWin(player.address)).not.to.be.reverted;

      // ...and the old one can no longer do so.
      await expect(
        leaderboard.connect(authorizedCaller).recordWin(player.address),
      ).to.be.revertedWithCustomError(leaderboard, "NotAuthorizedCaller");
    });
  });

  describe("Reverts", function () {
    it("Should revert deployment with a zero-address initial authorized caller", async function () {
      const Leaderboard = await hre.ethers.getContractFactory("Leaderboard");

      await expect(Leaderboard.deploy(hre.ethers.ZeroAddress)).to.be.revertedWithCustomError(
        Leaderboard,
        "ZeroAddress",
      );
    });

    it("Should revert recordWin if called by a non-authorized address", async function () {
      const { leaderboard, other, player } = await loadFixture(deployLeaderboardFixture);

      await expect(
        leaderboard.connect(other).recordWin(player.address),
      ).to.be.revertedWithCustomError(leaderboard, "NotAuthorizedCaller");
    });

    it("Should revert setAuthorizedCaller if called by a non-owner", async function () {
      const { leaderboard, other } = await loadFixture(deployLeaderboardFixture);

      await expect(
        leaderboard.connect(other).setAuthorizedCaller(other.address),
      ).to.be.revertedWithCustomError(leaderboard, "NotOwner");
    });

    it("Should revert setAuthorizedCaller with the zero address", async function () {
      const { leaderboard, owner } = await loadFixture(deployLeaderboardFixture);

      await expect(
        leaderboard.connect(owner).setAuthorizedCaller(hre.ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(leaderboard, "ZeroAddress");
    });
  });
});
