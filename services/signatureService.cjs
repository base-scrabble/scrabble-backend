const { ethers } = require('ethers');

class SignatureService {
  constructor() {
    // Check if blockchain environment variables are configured
    if (!process.env.BACKEND_SIGNER_PRIVATE_KEY || !process.env.SUBMITTER_PRIVATE_KEY) {
      console.log('⚠️ Blockchain environment variables not configured - signature services disabled');
      this.isEnabled = false;
      return;
    }

    try {
      this.backendSigner = new ethers.Wallet(process.env.BACKEND_SIGNER_PRIVATE_KEY);
      this.submitterSigner = new ethers.Wallet(process.env.SUBMITTER_PRIVATE_KEY);
      this.chainId = parseInt(process.env.CHAIN_ID) || 84532; // Base Sepolia Testnet
      this.walletAddress = process.env.WALLET_ADDRESS || '0xb65fddbf513e46b5af907bfc9596c1a8d0712ab1';
      this.gameAddress = process.env.SCRABBLE_GAME_ADDRESS || '0xED92f4334f80A8D43d69c10b7cC91B5347901D42';
      this.isEnabled = true;
    } catch (error) {
      console.error('❌ Failed to initialize signature service:', error.message);
      console.log('💡 Please check your BACKEND_SIGNER_PRIVATE_KEY and SUBMITTER_PRIVATE_KEY in .env file');
      this.isEnabled = false;
      return;
    }
    
    // EIP-712 Domain for auth signatures
    this.domain = {
      name: 'Wallet',
      version: '1',
      chainId: this.chainId,
      verifyingContract: this.walletAddress
    };

    // EIP-712 Types
    this.types = {
      Auth: [
        { name: 'player', type: 'address' },
        { name: 'nonce', type: 'uint256' }
      ]
    };
  }

  /**
   * Generate EIP-712 signature for user authentication
   * @param {string} userAddress - User's wallet address
   * @param {number} nonce - Current nonce for the user
   * @returns {string} - EIP-712 signature
   */
  async generateAuthSignature(userAddress, nonce) {
    if (!this.isEnabled) {
      throw new Error('Signature service not enabled - check blockchain environment variables');
    }

    try {
      const value = {
        player: userAddress,
        nonce: nonce
      };

      // Generate EIP-712 signature
      const signature = await this.backendSigner._signTypedData(
        this.domain,
        this.types,
        value
      );

      return signature;
    } catch (error) {
      console.error('Error generating auth signature:', error);
      throw new Error('Failed to generate authentication signature');
    }
  }

  /**
   * Verify that the backend signer address matches expected
   * @returns {string} - Backend signer address
   */
  getBackendSignerAddress() {
    if (!this.isEnabled) {
      return null;
    }
    return this.backendSigner.address;
  }

  /**
   * Get submitter signer address
   * @returns {string} - Submitter signer address
   */
  getSubmitterSignerAddress() {
    if (!this.isEnabled) {
      return null;
    }
    return this.submitterSigner.address;
  }

  /**
   * Sign transaction data for game result submission
   * @param {Object} gameData - Game result data
   * @returns {string} - Signed transaction
   */
  async signGameResult(gameData) {
    if (!this.isEnabled) {
      throw new Error('Signature service not enabled - check blockchain environment variables');
    }

    try {
      // Use SCRABBLE_GAME_ADDRESS for game result signing
      const gameContract = new ethers.Contract(
        this.gameAddress,
        ['function submitResult(address player, uint256 score)'], // Example ABI - adjust to match
        this.submitterSigner
      );
      const tx = await gameContract.populateTransaction.submitResult(gameData.player, gameData.score);
      return await this.submitterSigner.signTransaction(tx);
    } catch (error) {
      console.error('Error signing game result:', error);
      throw new Error('Failed to sign game result');
    }
  }
}

module.exports = new SignatureService();