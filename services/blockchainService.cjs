// services/blockchainService.cjs
const { ethers } = require('ethers');

/**
 * BlockchainService (V1-style, strict wallet)
 * - Uses env names exactly as used in your repo:
 * SCRABBLE_GAME_ADDRESS
 * BACKEND_SIGNER_PRIVATE_KEY
 * - Requires wallet for write operations (report* methods)
 * - Returns txHash, blockNumber, gasUsed on successful writes
 * - Does not print private keys
 */

class BlockchainService {
  constructor() {
    this.provider = null;
    this.wallet = null;
    this.contract = null;

        // ENV VARS used in your codebase
    this.contractAddress = process.env.SCRABBLE_GAME_ADDRESS;
    this.privateKey = process.env.BACKEND_SIGNER_PRIVATE_KEY;
    this.rpcUrl = process.env.RPC_URL || 'https://sepolia.base.org';

    if (!this.contractAddress) {
      console.error('Missing SCRABBLE_GAME_ADDRESS environment variable');
    }
    if (!this.privateKey) {
      console.error('Missing BACKEND_SIGNER_PRIVATE_KEY environment variable');
    }

    this.init();
  }

  async init() {
    try {
      // provider
      this.provider = new ethers.JsonRpcProvider(this.rpcUrl);

      // wallet (required for reporting)
      if (this.privateKey) {
        this.wallet = new ethers.Wallet(this.privateKey, this.provider);
      }
      // ABI: keep functions needed by backend
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

      // strict: require wallet for contract (V1 behavior)
      if (this.contractAddress && this.wallet) {
        this.contract = new ethers.Contract(this.contractAddress, this.contractABI, this.wallet);
        console.log('Blockchain service initialized successfully');
      } else {
        console.warn('Contract not initialized: missing contract address or wallet');
      }
    } catch (error) {
      console.error('Blockchain service initialization failed:', error.message);
    }
  }

  // === report tournament winner ===
  async reportTournamentWinner(tournamentData) {
    try {
      if (!this.contract) throw new Error('Smart contract not initialized');

      const { tournamentId, winnerId, winnerAddress, prizeAmount, timestamp = Math.floor(Date.now() / 1000) } =
        tournamentData;

      if (!tournamentId || !winnerId || !winnerAddress) throw new Error('Missing required tournament winner data');

      const tx = await this.contract.reportTournamentWinner(
        ethers.toBigInt(tournamentId),
        ethers.toBigInt(winnerId),
        winnerAddress,
        ethers.parseEther(prizeAmount?.toString() || '0'),
        ethers.toBigInt(timestamp)
      );

      console.log('Tournament winner submitted, tx=', tx.hash);
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

      const { tournamentId, gameId, winnerId, winnerAddress, finalScore, timestamp = Math.floor(Date.now() / 1000) } =
        gameData;

      if (!tournamentId || !gameId || !winnerId || !winnerAddress) throw new Error('Missing required game winner data');

      const tx = await this.contract.reportGameWinner(
        ethers.toBigInt(tournamentId),
        ethers.toBigInt(gameId),
        ethers.toBigInt(winnerId),
        winnerAddress,
        ethers.toBigInt(finalScore || 0),
        ethers.toBigInt(timestamp)
      );

      console.log('Game winner submitted, tx=', tx.hash);
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
      if (!this.contract && !this.provider) throw new Error('Contract/provider not initialized');

      const readContract = this.contract || new ethers.Contract(this.contractAddress, this.contractABI, this.provider);
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

  // === estimate gas (keeps behavior) ===
  async estimateGas(tournamentData) {
    try {
      if (!this.contract && !this.provider) throw new Error('Contract/provider not initialized');

      const { tournamentId, winnerId, winnerAddress, prizeAmount, timestamp = Math.floor(Date.now() / 1000) } =
        tournamentData;

      const target = this.contract || new ethers.Contract(this.contractAddress, this.contractABI, this.provider);

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
        estimatedCost: ethers.formatEther(gasEstimate * (gasPrice.gasPrice || ethers.toBigInt(0))),
      };
    } catch (error) {
      console.error('Failed to estimate gas:', error.message);
      return { success: false, error: error.message };
    }
  }

  // strict V1 check: contract AND wallet required for being "configured"
  isConfigured() {
    return !!(this.contract && this.wallet);
  }

  // keep port in status (V1)
  getStatus() {
    return {
      configured: this.isConfigured(),
      contractAddress: this.contractAddress || 'Not set',
      hasWallet: !!this.wallet,
      hasContract: !!this.contract,
      rpcUrl: this.rpcUrl,
      port: process.env.PORT || 3000,
    };
  }
}

module.exports = new BlockchainService();