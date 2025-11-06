// services/submitterService.cjs
const { ethers } = require('ethers');
const { prisma } = require('../lib/prisma.cjs');
const cron = require('node-cron');

/**
 * SubmitterService (V1-style)
 * - Uses SUBMITTER_PRIVATE_KEY and SCRABBLE_GAME_ADDRESS
 * - Periodically finds completed games and calls submitResult on-chain
 * - Writes submissionTxHash, submissionBlockNumber, submissionAttempts, lastSubmissionError
 */

class SubmitterService {
  constructor() {
    // Validate blockchain environment variables
    if (
      !process.env.SUBMITTER_PRIVATE_KEY ||
      process.env.SUBMITTER_PRIVATE_KEY === '0x0000000000000000000000000000000000000000000000000000000000000000' ||
      !process.env.SCRABBLE_GAME_ADDRESS ||
      !process.env.RPC_URL
    ) {
      console.log('Submitter service disabled - blockchain environment variables not configured or invalid');
      this.isEnabled = false;
      this.isRunning = false;
      return;
    }

    try {
      this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
      this.submitterWallet = new ethers.Wallet(process.env.SUBMITTER_PRIVATE_KEY, this.provider);

      this.scrabbleContract = new ethers.Contract(
        process.env.SCRABBLE_GAME_ADDRESS,
        [
          'function submitResult(uint256 gameId, address winner, uint256 player1Score, uint256 player2Score) external',
          'function getGame(uint256 gameId) view returns (tuple(address player1, address player2, uint256 stake, bool isActive, bool isSettled))',
        ],
        this.submitterWallet
      );

      this.isEnabled = true;
      this.isRunning = false;
      this.checkInterval = process.env.SUBMITTER_CHECK_CRON || '*/30 * * * * *'; // Every 30 seconds by default
      this.maxAttempts = Number(process.env.SUBMITTER_MAX_ATTEMPTS || 3);

      console.log(`Submitter initialized for address: ${this.submitterWallet.address}`);
    } catch (error) {
      console.error('Failed to initialize submitter service:', error.message);
      console.log('Check SUBMITTER_PRIVATE_KEY, SCRABBLE_GAME_ADDRESS, and RPC_URL in .env');
      this.isEnabled = false;
      this.isRunning = false;
    }
  }

  start() {
    if (!this.isEnabled) {
      console.log('Submitter service disabled - not starting');
      return;
    }
    if (this.isRunning) {
      console.log('Submitter service already running');
      return;
    }

    console.log('Starting submitter service...');
    this.isRunning = true;

    this.cronJob = cron.schedule(this.checkInterval, async () => {
      if (!this.isRunning) return;
      try {
        await this.processCompletedGames();
      } catch (error) {
        console.error('Error in submitter service loop:', error.message);
      }
    });

    console.log('Submitter service started successfully');
  }

  stop() {
    if (!this.isRunning) {
      console.log('Submitter service not running');
      return;
    }

    console.log('Stopping submitter service...');
    this.isRunning = false;

    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }

    console.log('Submitter service stopped');
  }

  async processCompletedGames() {
    if (!this.isEnabled || !this.isRunning) return;

    try {
      const completedGames = await prisma.games.findMany({
        where: {
          status: 'completed',
          blockchainSubmitted: false,
          blockchainGameId: { not: null },
        },
      });

      if (completedGames.length > 0) {
        console.log(`Found ${completedGames.length} completed games pending submission`);
      }

      for (const game of completedGames) {
        await this.submitGameResult(game);
      }
    } catch (error) {
      console.error('Error processing completed games:', error.message);
    }
  }

  async submitGameResult(game) {
    try {
      console.log(`Submitting result for game ${game.id} (chain ID: ${game.blockchainGameId})`);

      if (!game.winner || (game.player1Score == null) || (game.player2Score == null) || !game.player1Address || !game.player2Address) {
        console.error(`Game ${game.id} missing result data`);
        return;
      }

      if (!ethers.isAddress(game.player1Address) || !ethers.isAddress(game.player2Address)) {
        console.error(`Game ${game.id} has invalid addresses`);
        return;
      }

      const blockchainGame = await this.scrabbleContract.getGame(ethers.toBigInt(game.blockchainGameId));
      if (blockchainGame.isSettled) {
        console.log(`Game ${game.blockchainGameId} already settled on-chain`);
        await prisma.games.update({
          where: { id: parseInt(game.id, 10) },
          data: { blockchainSubmitted: true, updatedAt: new Date() },
        });
        return;
      }

      const winnerAddress = game.winner === 'player1' ? game.player1Address : game.player2Address;

      let tx = null;
      let attempt = 0;
      while (attempt < this.maxAttempts) {
        try {
          tx = await this.scrabbleContract.submitResult(
            ethers.toBigInt(game.blockchainGameId),
            winnerAddress,
            ethers.toBigInt(game.player1Score),
            ethers.toBigInt(game.player2Score),
            { gasLimit: 200000 }
          );
          break;
        } catch (error) {
          attempt++;
          console.error(`Attempt ${attempt} failed for game ${game.id}: ${error.message}`);
          if (attempt === this.maxAttempts) throw error;
          await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
      }

      console.log(`Transaction submitted: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`Confirmed in block ${receipt.blockNumber}`);

      await prisma.games.update({
        where: { id: parseInt(game.id, 10) },
        data: {
          blockchainSubmitted: true,
          submissionTxHash: tx.hash,
          submissionBlockNumber: receipt.blockNumber,
          submissionAttempts: (game.submissionAttempts || 0) + attempt + 1,
          updatedAt: new Date(),
        },
      });

      console.log(`Successfully submitted game ${game.id}`);
    } catch (error) {
      console.error(`Error submitting game ${game.id}: ${error.message}`);

      const attemptCount = (game.submissionAttempts || 0) + 1;
      try {
        await prisma.games.update({
          where: { id: parseInt(game.id, 10) },
          data: {
            submissionAttempts: attemptCount,
            lastSubmissionError: error.message,
            submissionFailed: attemptCount >= this.maxAttempts,
            updatedAt: new Date(),
          },
        });
      } catch (e) {
        console.error('Failed to persist submission failure:', e.message);
      }

      if (attemptCount >= this.maxAttempts) {
        console.error(`Game ${game.id} failed submission after ${this.maxAttempts} attempts`);
      }
    }
  }

  async manualSubmit(gameId) {
    try {
      if (!this.isEnabled) throw new Error('Submitter service disabled');

      const game = await prisma.games.findUnique({ where: { id: parseInt(gameId, 10) } });
      if (!game) throw new Error('Game not found');
      if (game.status !== 'completed') throw new Error('Game not completed');
      if (game.blockchainSubmitted) throw new Error('Result already submitted');

      await this.submitGameResult(game);
      return { success: true, message: 'Game result submitted successfully' };
    } catch (error) {
      console.error(`Manual submission failed for game ${gameId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isEnabled: this.isEnabled,
      submitterAddress: this.submitterWallet?.address || 'N/A',
      checkInterval: this.checkInterval,
      contractAddress: process.env.SCRABBLE_GAME_ADDRESS || 'N/A',
      rpcUrl: process.env.RPC_URL || 'N/A',
      port: process.env.PORT || 3000,
    };
  }
}

module.exports = new SubmitterService();