require("@nomicfoundation/hardhat-toolbox");
require("hardhat-gas-reporter");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200, // Maximizes operational gas efficiency for deployment and function execution
      },
    },
  },
  gasReporter: {
    enabled: true,
    currency: "USD",
    coinmarketcap: process.env.COINMARKETCAP_API_KEY || undefined, // Optional: pulls live conversion rates
    token: "ETH",
    outputFile: "gas-report.txt",
    noColors: true, // Required for clean file output logging
  },
};