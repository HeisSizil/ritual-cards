import hre from "hardhat";

// Deploys FairDeck, Leaderboard, WhotGame, and PlayerRegistry in the order
// required by their constructor dependencies, then wires Leaderboard's
// authorized caller to the deployed WhotGame contract.
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

  // 5. PlayerRegistry has no dependencies.
  const PlayerRegistry = await hre.ethers.getContractFactory("PlayerRegistry");
  const playerRegistry = await PlayerRegistry.deploy();
  await playerRegistry.waitForDeployment();
  const playerRegistryAddress = await playerRegistry.getAddress();
  console.log("PlayerRegistry deployed to:", playerRegistryAddress);

  console.log("\nDeployed addresses:");
  console.log("  FairDeck:       ", fairDeckAddress);
  console.log("  Leaderboard:    ", leaderboardAddress);
  console.log("  WhotGame:       ", whotGameAddress);
  console.log("  PlayerRegistry: ", playerRegistryAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
