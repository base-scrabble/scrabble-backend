// NOTE: This Hardhat config is kept only for reference.
// Contracts already deployed on Base Sepolia Testnet.
// Do NOT redeploy or compile unless updating contract logic later.

const DEFAULT_HTTP_RPC = 'https://misty-proportionate-owl.base-sepolia.quiknode.pro/3057dcb195d42a6ae388654afca2ebb055b9bfd9/';

module.exports = {
  solidity: "0.8.28",
  networks: {
    sepolia: {
      url: process.env.RPC_URL || DEFAULT_HTTP_RPC,
      accounts: [process.env.PRIVATE_KEY]
    }
  }
};
