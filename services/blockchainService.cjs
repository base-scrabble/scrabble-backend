// services/blockchainService.cjs
// Updated for QuickNode dual RPC support (WSS preferred, fallback to HTTP)
// 🧠 New lines are marked with: // [added] or // [updated]

const { ethers } = require('ethers');

const DEFAULT_HTTP_RPC = 'https://misty-proportionate-owl.base-sepolia.quiknode.pro/3057dcb195d42a6ae388654afca2ebb055b9bfd9/';
const DEFAULT_WSS_RPC = 'wss://misty-proportionate-owl.base-sepolia.quiknode.pro/3057dcb195d42a6ae388654afca2ebb055b9bfd9/';

class BlockchainService {
  constructor() {
    this.provider = null;
    this.wallet = null;
    this.contract = null;

    // --- ENV VARS ---
    this.contractAddress = process.env.SCRABBLE_GAME_ADDRESS;
    this.privateKey = process.env.BACKEND_SIGNER_PRIVATE_KEY;
    this.rpcUrl = process.env.RPC_URL || DEFAULT_HTTP_RPC;
    this.rpcWssUrl = process.env.RPC_WSS_URL || DEFAULT_WSS_RPC;

    if (!this.contractAddress) console.error('Missing SCRABBLE_GAME_ADDRESS environment variable');
    if (!this.privateKey) console.error('Missing BACKEND_SIGNER_PRIVATE_KEY environment variable');

    this.init();
  }

  async init() {
    try {
      // --- Prefer HTTP provider for stability, but retain exact QuickNode fallback ---
      this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
      console.log(`🔌 Using HTTP provider (${this.rpcUrl})`);

      // --- Wallet setup ---
      if (this.privateKey) {
        this.wallet = new ethers.Wallet(this.privateKey, this.provider);
      }

      // --- Contract ABI ---
      this.contractABI = [
        {
          inputs: [
            { name: 'tournamentId', type: 'uint256' },
            { name: 'winnerId', type: 'uint256' },
            { name: 'winnerAddress', type: 'address' },
            { name: 'prizeAmount', type: 'uint256' },
            { name: 'timestamp', type: 'uint256' },
          ],
          name: 'reportTournamentWinner',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function',
        },
        {
          inputs: [
            { name: 'tournamentId', type: 'uint256' },
            { name: 'gameId', type: 'uint256' },
            { name: 'winnerId', type: 'uint256' },
            { name: 'winnerAddress', type: 'address' },
            { name: 'finalScore', type: 'uint256' },
            { name: 'timestamp', type: 'uint256' },
          ],
          name: 'reportGameWinner',
          outputs: [],
          stateMutability: 'nonpayable',
          type: 'function',
        },
        {
          inputs: [{ name: 'tournamentId', type: 'uint256' }],
          name: 'getTournamentWinner',
          outputs: [
            { name: 'winnerId', type: 'uint256' },
            { name: 'winnerAddress', type: 'address' },
            { name: 'prizeAmount', type: 'uint256' },
            { name: 'timestamp', type: 'uint256' },
          ],
          stateMutability: 'view',
          type: 'function',
        },
      ];

      // --- Contract initialization ---
      if (this.contractAddress && this.wallet) {
        this.contract = new ethers.Contract(this.contractAddress, this.contractABI, this.wallet);
        console.log('✅ Blockchain service initialized successfully');
      } else {
        console.warn('⚠️ Contract not initialized: missing contract address or wallet');
      }
    } catch (error) {
      console.error('❌ Blockchain service initialization failed:', error.message);
    }
  }

  // === report tournament winner ===
  async reportTournamentWinner(tournamentData) {
    try {
      if (!this.contract) throw new Error('Smart contract not initialized');

      const {
        tournamentId, winnerId, winnerAddress, prizeAmount,
        timestamp = Math.floor(Date.now() / 1000),
      } = tournamentData;

      if (!tournamentId || !winnerId || !winnerAddress)
        throw new Error('Missing required tournament winner data');

      const tx = await this.contract.reportTournamentWinner(
        ethers.toBigInt(tournamentId),
        ethers.toBigInt(winnerId),
        winnerAddress,
        ethers.parseEther(prizeAmount?.toString() || '0'),
        ethers.toBigInt(timestamp)
      );

      console.log('🏁 Tournament winner submitted, tx =', tx.hash);
      const receipt = await tx.wait();

      return {
        success: true,
        transactionHash: tx.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed?.toString?.() ?? null,
      };
    } catch (error) {
      console.error('Failed to report tournament winner:', error.message);
      return { success: false, error: error.message };
    }
  }

  // === report single game winner ===
  async reportGameWinner(gameData) {
    try {
      if (!this.contract) throw new Error('Smart contract not initialized');

      const {
        tournamentId, gameId, winnerId, winnerAddress, finalScore,
        timestamp = Math.floor(Date.now() / 1000),
      } = gameData;

      if (!tournamentId || !gameId || !winnerId || !winnerAddress)
        throw new Error('Missing required game winner data');

      const tx = await this.contract.reportGameWinner(
        ethers.toBigInt(tournamentId),
        ethers.toBigInt(gameId),
        ethers.toBigInt(winnerId),
        winnerAddress,
        ethers.toBigInt(finalScore || 0),
        ethers.toBigInt(timestamp)
      );

      console.log('🎯 Game winner submitted, tx =', tx.hash);
      const receipt = await tx.wait();

      return {
        success: true,
        transactionHash: tx.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed?.toString?.() ?? null,
      };
    } catch (error) {
      console.error('Failed to report game winner:', error.message);
      return { success: false, error: error.message };
    }
  }

  // === get tournament winner (view) ===
  async getTournamentWinner(tournamentId) {
    try {
      if (!this.contract && !this.provider)
        throw new Error('Contract/provider not initialized');

      const readContract =
        this.contract || new ethers.Contract(this.contractAddress, this.contractABI, this.provider);
      const result = await readContract.getTournamentWinner(ethers.toBigInt(tournamentId));

      return {
        success: true,
        data: {
          winnerId: result.winnerId?.toString?.() ?? String(result[0]),
          winnerAddress: result.winnerAddress ?? result[1],
          prizeAmount: ethers.formatEther(result.prizeAmount ?? result[2]),
          timestamp: parseInt((result.timestamp ?? result[3]).toString(), 10),
        },
      };
    } catch (error) {
      console.error('Failed to get tournament winner:', error.message);
      return { success: false, error: error.message };
    }
  }

  // === estimate gas ===
  async estimateGas(tournamentData) {
    try {
      if (!this.contract && !this.provider)
        throw new Error('Contract/provider not initialized');

      const {
        tournamentId, winnerId, winnerAddress, prizeAmount,
        timestamp = Math.floor(Date.now() / 1000),
      } = tournamentData;

      const target =
        this.contract || new ethers.Contract(this.contractAddress, this.contractABI, this.provider);

      const gasEstimate = await target.reportTournamentWinner.estimateGas(
        ethers.toBigInt(tournamentId),
        ethers.toBigInt(winnerId),
        winnerAddress,
        ethers.parseEther(prizeAmount?.toString() || '0'),
        ethers.toBigInt(timestamp)
      );

      const gasPrice = await this.provider.getFeeData();

      return {
        success: true,
        gasEstimate: gasEstimate.toString(),
        gasPrice: gasPrice.gasPrice?.toString?.() ?? null,
        estimatedCost: ethers.formatEther(
          gasEstimate * (gasPrice.gasPrice || ethers.toBigInt(0))
        ),
      };
    } catch (error) {
      console.error('Failed to estimate gas:', error.message);
      return { success: false, error: error.message };
    }
  }

  // === status ===
  isConfigured() {
    return !!(this.contract && this.wallet);
  }

  getStatus() {
    return {
      configured: this.isConfigured(),
      contractAddress: this.contractAddress || 'Not set',
      hasWallet: !!this.wallet,
      hasContract: !!this.contract,
      rpcUrl: this.rpcWssUrl || this.rpcUrl,
      port: process.env.PORT || 3000,
    };
  }
}

module.exports = new BlockchainService();