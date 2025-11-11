// services/nonceService.cjs
const { ethers } = require('ethers');

class NonceService {
  constructor() {
    // Check if blockchain environment variables are configured
    if (!process.env.RPC_URL && !process.env.RPC_WSS_URL) {
      console.log('⚠️ Nonce service environment variables not configured - service disabled');
      this.isEnabled = false;
      this.cache = new Map();
      return;
    }

    try {
      // 🧠 Dual RPC setup — prefers WebSocket provider
      if (process.env.RPC_WSS_URL) {
        this.provider = new ethers.WebSocketProvider(process.env.RPC_WSS_URL);
        console.log('🔌 NonceService using WebSocket provider (RPC_WSS_URL)');
      } else {
        this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        console.log('🔌 NonceService using HTTP provider (RPC_URL)');
      }

      this.cache = new Map(); // In-memory cache for nonces
      this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
      this.isEnabled = true;
    } catch (error) {
      console.error('❌ Failed to initialize nonce service:', error.message);
      console.log('💡 Please check your RPC_URL or RPC_WSS_URL in .env file');
      this.isEnabled = false;
      this.cache = new Map();
    }

    if (this.isEnabled) {
      this.walletContract = new ethers.Contract(
        process.env.WALLET_ADDRESS || '0xb65fddbf513e46b5af907bfc9596c1a8d0712ab1',
        ['function getNonce(address player) view returns (uint256)'],
        this.provider
      );
    }
  }

  /**
   * Get current nonce for a user from the blockchain
   * @param {string} userAddress - User's wallet address
   * @returns {number} - Current nonce
   */
  async getCurrentNonce(userAddress) {
    if (!this.isEnabled) {
      // Return a mock nonce when service is disabled
      return 0;
    }

    try {
      const nonce = await this.walletContract.getNonce(userAddress);
      const nonceNumber = parseInt(nonce.toString());

      // Update cache
      this.cache.set(userAddress.toLowerCase(), nonceNumber);

      return nonceNumber;
    } catch (error) {
      console.error('Error fetching nonce from blockchain:', error);

      // Fallback to cached value if available
      const cachedNonce = this.cache.get(userAddress.toLowerCase());
      if (cachedNonce !== undefined) {
        console.warn(`Using cached nonce ${cachedNonce} for ${userAddress}`);
        return cachedNonce;
      }

      throw new Error('Failed to fetch user nonce');
    }
  }

  /**
   * Get next nonce for a user (current + 1)
   * @param {string} userAddress - User's wallet address
   * @returns {number} - Next nonce to use
   */
  async getNextNonce(userAddress) {
    if (!this.isEnabled) {
      return 1;
    }
    const currentNonce = await this.getCurrentNonce(userAddress);
    return currentNonce + 1;
  }

  /**
   * Increment cached nonce after successful transaction
   * @param {string} userAddress - User's wallet address
   */
  incrementCachedNonce(userAddress) {
    if (!this.isEnabled) return;
    const current = this.cache.get(userAddress.toLowerCase()) || 0;
    this.cache.set(userAddress.toLowerCase(), current + 1);
  }

  /**
   * Clear cached nonce for a user (force refresh from blockchain)
   * @param {string} userAddress - User's wallet address
   */
  clearCachedNonce(userAddress) {
    this.cache.delete(userAddress.toLowerCase());
  }

  /**
   * Validate that a nonce is still valid
   * @param {string} userAddress - User's wallet address
   * @param {number} nonce - Nonce to validate
   * @returns {boolean} - Whether nonce is valid
   */
  async validateNonce(userAddress, nonce) {
    if (!this.isEnabled) {
      return true; // Accept any nonce when service is disabled
    }

    try {
      const currentNonce = await this.getCurrentNonce(userAddress);
      return nonce === currentNonce;
    } catch (error) {
      console.error('Error validating nonce:', error);
      return false;
    }
  }
}

module.exports = new NonceService();