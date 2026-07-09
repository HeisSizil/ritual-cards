import hre from "hardhat";

// Redeploys FairDeck, Leaderboard, and WhotGame fresh, in the order required
// by their constructor dependencies, then wires Leaderboard's authorized
// caller to the newly deployed WhotGame. PlayerRegistry is unaffected by this
// change, so the existing deployment is reused rather than redeployed.
const EXISTING_PLAYER_REGISTRY_ADDRESS = "0x6477df397688Cf8eCd63b029Fb46D274BfcC2582";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // 1. FairDeck has no dependencies.
  const FairDeck = await hre.ethers.getContractFactory("FairDeck");
  const fairDeck = await FairDeck.deploy();
  await fairDeck.waitForDeployment();
  const fairDeckAddress = await fairDeck.getAddress();
  console.log("FairDeck deployed to:", fairDeckAddress);

  // 2. Leaderboard needs an authorized caller up front, but WhotGame
  // (the real authorized caller) doesn't exist yet. Point it at the
  // deployer temporarily; it gets repointed at WhotGame in step 4.
  const Leaderboard = await hre.ethers.getContractFactory("Leaderboard");
  const leaderboard = await Leaderboard.deploy(deployer.address);
  await leaderboard.waitForDeployment();
  const leaderboardAddress = await leaderboard.getAddress();
  console.log("Leaderboard deployed to:", leaderboardAddress);

  // 3. WhotGame depends on both FairDeck and Leaderboard's addresses.
  const WhotGame = await hre.ethers.getContractFactory("WhotGame");
  const whotGame = await WhotGame.deploy(fairDeckAddress, leaderboardAddress);
  await whotGame.waitForDeployment();
  const whotGameAddress = await whotGame.getAddress();
  console.log("WhotGame deployed to:", whotGameAddress);

  // 4. Repoint Leaderboard at the real WhotGame contract.
  const setAuthorizedCallerTx = await leaderboard.setAuthorizedCaller(whotGameAddress);
  await setAuthorizedCallerTx.wait();
  console.log("Leaderboard authorized caller set to WhotGame:", whotGameAddress);

  console.log("\nDeployed addresses:");
  console.log("  FairDeck:       ", fairDeckAddress, "(new)");
  console.log("  Leaderboard:    ", leaderboardAddress, "(new)");
  console.log("  WhotGame:       ", whotGameAddress, "(new)");
  console.log("  PlayerRegistry: ", EXISTING_PLAYER_REGISTRY_ADDRESS, "(unchanged, not redeployed)");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
