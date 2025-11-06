// NOTE: This Hardhat config is kept only for reference.
// Contracts already deployed on Base Sepolia Testnet.
// Do NOT redeploy or compile unless updating contract logic later.

module.exports = {
  solidity: "0.8.28",
  networks: {
    sepolia: {
      url: process.env.RPC_URL || "https://sepolia.base.org",
      accounts: [process.env.PRIVATE_KEY]
    }
  }
};
