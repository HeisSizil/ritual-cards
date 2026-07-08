import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const RITUAL_DEPLOYER_PRIVATE_KEY = process.env.RITUAL_DEPLOYER_PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    ritual: {
      url: "https://rpc.ritualfoundation.org",
      chainId: 1979,
      accounts: RITUAL_DEPLOYER_PRIVATE_KEY ? [RITUAL_DEPLOYER_PRIVATE_KEY] : [],
    },
  },
};

export default config;
