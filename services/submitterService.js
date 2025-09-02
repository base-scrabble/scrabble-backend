const { ethers } = require('ethers');
const { Game } = require('../models');

class SubmitterService {
  constructor() {
    // Check if blockchain environment variables are configured
    if (!process.env.SUBMITTER_PRIVATE_KEY || !process.env.SCRABBLE_CONTRACT_ADDRESS || !process.env.RPC_URL) {
      console.log('⚠️  Submitter service environment variables not configured - service disabled');
      this.isEnabled = false;
      this.isRunning = false;
      return;
    }

    try {
      this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
      this.submitterWallet = new ethers.Wallet(process.env.SUBMITTER_PRIVATE_KEY, this.provider);
      
      this.scrabbleContract = new ethers.Contract(
        process.env.SCRABBLE_CONTRACT_ADDRESS,
        [
          'function submitResult(uint256 gameId, address winner, uint256 player1Score, uint256 player2Score) external',
          'function getGame(uint256 gameId) view returns (tuple(address player1, address player2, uint256 stake, bool isActive, bool isSettled))'
        ],
        this.submitterWallet
      );

      this.isEnabled = true;
      this.isRunning = false;
      this.checkInterval = 30000; // Check every 30 seconds
    } catch (error) {
      console.error('❌ Failed to initialize submitter service:', error.message);
      console.log('💡 Please check your SUBMITTER_PRIVATE_KEY and contract addresses in .env file');
      this.isEnabled = false;
      this.isRunning = false;
    }
  }

  /**
   * Start the submitter service
   */
  start() {
    if (!this.isEnabled) {
      console.log('⚠️  Submitter service disabled - blockchain environment variables not configured');
      return;
    }

    if (this.isRunning) {
      console.log('Submitter service already running');
      return;
    }

    console.log('Starting submitter service...');
    this.isRunning = true;
    this.checkForCompletedGames();
    console.log('Submitter service started');
  }

  /**
   * Stop the submitter service
   */
  stop() {
    if (!this.isRunning) {
      console.log('Submitter service not running');
      return;
    }

    console.log('Stopping submitter service...');
    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    console.log('Submitter service stopped');
  }

  /**
   * Periodically check for completed games that need result submission
   */
  checkForCompletedGames() {
    this.intervalId = setInterval(async () => {
      if (!this.isRunning) return;

      try {
        await this.processCompletedGames();
      } catch (error) {
        console.error('Error in submitter service check:', error);
      }
    }, this.checkInterval);
  }

  /**
   * Process all completed games that haven't been submitted to blockchain
   */
  async processCompletedGames() {
    try {
      // Find games that are completed but not yet submitted to blockchain
      const completedGames = await Game.findAll({
        where: {
          status: 'completed',
          blockchainSubmitted: false,
          blockchainGameId: { [require('sequelize').Op.ne]: null }
        }
      });

      console.log(`Found ${completedGames.length} completed games to submit`);

      for (const game of completedGames) {
        await this.submitGameResult(game);
      }
    } catch (error) {
      console.error('Error processing completed games:', error);
    }
  }

  /**
   * Submit a single game result to the blockchain
   */
  async submitGameResult(game) {
    try {
      console.log(`Submitting result for game ${game.id} (blockchain ID: ${game.blockchainGameId})`);

      // Validate game data
      if (!game.winner || !game.player1Score || !game.player2Score) {
        console.error(`Game ${game.id} missing required result data`);
        return;
      }

      // Check if game is already settled on blockchain
      const blockchainGame = await this.scrabbleContract.getGame(game.blockchainGameId);
      if (blockchainGame.isSettled) {
        console.log(`Game ${game.blockchainGameId} already settled on blockchain`);
        await game.update({ blockchainSubmitted: true });
        return;
      }

      // Determine winner address and scores
      const player1Address = game.player1Address; // You'll need to store these
      const player2Address = game.player2Address;
      const winnerAddress = game.winner === 'player1' ? player1Address : player2Address;

      // Submit result to blockchain
      const tx = await this.scrabbleContract.submitResult(
        game.blockchainGameId,
        winnerAddress,
        game.player1Score,
        game.player2Score,
        {
          gasLimit: 200000 // Adjust based on your contract
        }
      );

      console.log(`Transaction submitted: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await tx.wait();
      console.log(`Transaction confirmed in block ${receipt.blockNumber}`);

      // Update game record
      await game.update({
        blockchainSubmitted: true,
        submissionTxHash: tx.hash,
        submissionBlockNumber: receipt.blockNumber
      });

      console.log(`Successfully submitted result for game ${game.id}`);

    } catch (error) {
      console.error(`Error submitting result for game ${game.id}:`, error);
      
      // Mark as failed after multiple attempts
      const attemptCount = (game.submissionAttempts || 0) + 1;
      await game.update({ 
        submissionAttempts: attemptCount,
        lastSubmissionError: error.message
      });

      if (attemptCount >= 3) {
        console.error(`Game ${game.id} failed submission after 3 attempts, marking as failed`);
        await game.update({ submissionFailed: true });
      }
    }
  }

  /**
   * Manually submit a specific game result
   */
  async manualSubmit(gameId) {
    try {
      const game = await Game.findByPk(gameId);
      if (!game) {
        throw new Error('Game not found');
      }

      if (game.status !== 'completed') {
        throw new Error('Game is not completed');
      }

      if (game.blockchainSubmitted) {
        throw new Error('Game result already submitted');
      }

      await this.submitGameResult(game);
      return { success: true, message: 'Game result submitted successfully' };
    } catch (error) {
      console.error(`Manual submission failed for game ${gameId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      submitterAddress: this.submitterWallet.address,
      checkInterval: this.checkInterval,
      contractAddress: process.env.SCRABBLE_CONTRACT_ADDRESS
    };
  }

  /**
   * Estimate gas for result submission
   */
  async estimateGas(gameId, winnerAddress, player1Score, player2Score) {
    try {
      const gasEstimate = await this.scrabbleContract.estimateGas.submitResult(
        gameId,
        winnerAddress,
        player1Score,
        player2Score
      );
      
      return gasEstimate.toString();
    } catch (error) {
      console.error('Gas estimation failed:', error);
      throw error;
    }
  }
}

module.exports = new SubmitterService();
