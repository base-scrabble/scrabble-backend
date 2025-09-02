const { ethers } = require('ethers');
const { Game, GamePlayer, User } = require('../models');

class BlockchainListener {
  constructor() {
    // Check if blockchain environment variables are configured
    if (!process.env.RPC_URL || !process.env.SMART_CONTRACT_ADDRESS || !process.env.SCRABBLE_CONTRACT_ADDRESS) {
      console.log('⚠️  Blockchain listener environment variables not configured - service disabled');
      this.isEnabled = false;
      this.isListening = false;
      return;
    }

    try {
      this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
      this.walletContract = new ethers.Contract(
        process.env.SMART_CONTRACT_ADDRESS,
        [
          'event FundsDeposited(address indexed user, address indexed token, uint256 amount)',
          'event FundsWithdrawn(address indexed user, address indexed token, uint256 amount)',
          'event GameCreated(uint256 indexed gameId, address indexed creator, uint256 stake)',
          'event GameJoined(uint256 indexed gameId, address indexed player)',
          'event GameCancelled(uint256 indexed gameId)',
          'event GameSettled(uint256 indexed gameId, address indexed winner, uint256 payout)'
        ],
        this.provider
      );
      
      this.scrabbleContract = new ethers.Contract(
        process.env.SCRABBLE_CONTRACT_ADDRESS,
        [
          'event GameSettled(uint256 indexed gameId, address indexed winner, uint256 player1Score, uint256 player2Score)'
        ],
        this.provider
      );

      this.isEnabled = true;
      this.isListening = false;
    } catch (error) {
      console.error('❌ Failed to initialize blockchain listener:', error.message);
      console.log('💡 Please check your RPC_URL and contract addresses in .env file');
      this.isEnabled = false;
      this.isListening = false;
    }
  }

  /**
   * Start listening to blockchain events
   */
  startListening() {
    if (!this.isEnabled) {
      console.log('⚠️  Blockchain listener disabled - environment variables not configured');
      return;
    }

    if (this.isListening) {
      console.log('Blockchain listener already running');
      return;
    }

    console.log('Starting blockchain event listener...');
    this.isListening = true;

    // Listen to Wallet contract events
    this.walletContract.on('FundsDeposited', this.handleFundsDeposited.bind(this));
    this.walletContract.on('FundsWithdrawn', this.handleFundsWithdrawn.bind(this));
    this.walletContract.on('GameCreated', this.handleGameCreated.bind(this));
    this.walletContract.on('GameJoined', this.handleGameJoined.bind(this));
    this.walletContract.on('GameCancelled', this.handleGameCancelled.bind(this));
    this.walletContract.on('GameSettled', this.handleGameSettled.bind(this));

    // Listen to Scrabble contract events
    this.scrabbleContract.on('GameSettled', this.handleScrabbleGameSettled.bind(this));

    console.log('Blockchain listener started successfully');
  }

  /**
   * Stop listening to blockchain events
   */
  stopListening() {
    if (!this.isListening) {
      console.log('Blockchain listener not running');
      return;
    }

    console.log('Stopping blockchain event listener...');
    this.walletContract.removeAllListeners();
    this.scrabbleContract.removeAllListeners();
    this.isListening = false;
    console.log('Blockchain listener stopped');
  }

  /**
   * Handle funds deposited event
   */
  async handleFundsDeposited(userAddress, tokenAddress, amount, event) {
    try {
      console.log(`Funds deposited: ${userAddress}, ${ethers.formatEther(amount)} ETH`);
      
      // Update user's balance in database if needed
      // This could be used for caching or analytics
      
      // Log the transaction
      console.log(`Transaction hash: ${event.transactionHash}`);
      console.log(`Block number: ${event.blockNumber}`);
      
    } catch (error) {
      console.error('Error handling FundsDeposited event:', error);
    }
  }

  /**
   * Handle funds withdrawn event
   */
  async handleFundsWithdrawn(userAddress, tokenAddress, amount, event) {
    try {
      console.log(`Funds withdrawn: ${userAddress}, ${ethers.formatEther(amount)} ETH`);
      
      // Update user's balance in database if needed
      
      console.log(`Transaction hash: ${event.transactionHash}`);
      console.log(`Block number: ${event.blockNumber}`);
      
    } catch (error) {
      console.error('Error handling FundsWithdrawn event:', error);
    }
  }

  /**
   * Handle game created event
   */
  async handleGameCreated(gameId, creatorAddress, stake, event) {
    try {
      console.log(`Game created: ID ${gameId}, Creator ${creatorAddress}, Stake ${ethers.formatEther(stake)} ETH`);
      
      // Update game status in database
      await Game.update(
        { 
          blockchainGameId: gameId.toString(),
          status: 'waiting',
          transactionHash: event.transactionHash
        },
        { 
          where: { 
            // Match by creator and stake amount or other identifier
            // You might need to adjust this based on your game creation flow
          } 
        }
      );
      
    } catch (error) {
      console.error('Error handling GameCreated event:', error);
    }
  }

  /**
   * Handle game joined event
   */
  async handleGameJoined(gameId, playerAddress, event) {
    try {
      console.log(`Game joined: ID ${gameId}, Player ${playerAddress}`);
      
      // Update game status to active
      await Game.update(
        { status: 'active' },
        { where: { blockchainGameId: gameId.toString() } }
      );
      
    } catch (error) {
      console.error('Error handling GameJoined event:', error);
    }
  }

  /**
   * Handle game cancelled event
   */
  async handleGameCancelled(gameId, event) {
    try {
      console.log(`Game cancelled: ID ${gameId}`);
      
      // Update game status to cancelled
      await Game.update(
        { status: 'cancelled' },
        { where: { blockchainGameId: gameId.toString() } }
      );
      
    } catch (error) {
      console.error('Error handling GameCancelled event:', error);
    }
  }

  /**
   * Handle game settled event from Wallet contract
   */
  async handleGameSettled(gameId, winner, payout, event) {
    try {
      console.log(`Game settled: ID ${gameId}, Winner ${winner}, Payout ${ethers.formatEther(payout)} ETH`);
      
      // Update game status to completed
      await Game.update(
        { 
          status: 'completed',
          winner: winner,
          payout: ethers.formatEther(payout)
        },
        { where: { blockchainGameId: gameId.toString() } }
      );
      
    } catch (error) {
      console.error('Error handling GameSettled event:', error);
    }
  }

  /**
   * Handle game settled event from Scrabble contract
   */
  async handleScrabbleGameSettled(gameId, winner, player1Score, player2Score, event) {
    try {
      console.log(`Scrabble game settled: ID ${gameId}, Winner ${winner}, Scores ${player1Score}-${player2Score}`);
      
      // Update game with final scores
      await Game.update(
        { 
          player1Score: player1Score.toString(),
          player2Score: player2Score.toString(),
          finalWinner: winner
        },
        { where: { blockchainGameId: gameId.toString() } }
      );
      
    } catch (error) {
      console.error('Error handling Scrabble GameSettled event:', error);
    }
  }

  /**
   * Get past events for synchronization
   */
  async syncPastEvents(fromBlock = 'earliest') {
    try {
      console.log('Syncing past events...');
      
      const filter = {
        fromBlock,
        toBlock: 'latest'
      };

      // Get past events from Wallet contract
      const walletEvents = await this.walletContract.queryFilter('*', fromBlock, 'latest');
      console.log(`Found ${walletEvents.length} wallet events`);

      // Get past events from Scrabble contract
      const scrabbleEvents = await this.scrabbleContract.queryFilter('*', fromBlock, 'latest');
      console.log(`Found ${scrabbleEvents.length} scrabble events`);

      // Process events chronologically
      const allEvents = [...walletEvents, ...scrabbleEvents].sort((a, b) => 
        a.blockNumber - b.blockNumber || a.transactionIndex - b.transactionIndex
      );

      for (const event of allEvents) {
        await this.processEvent(event);
      }

      console.log('Past events sync completed');
    } catch (error) {
      console.error('Error syncing past events:', error);
    }
  }

  /**
   * Process individual event
   */
  async processEvent(event) {
    try {
      switch (event.event) {
        case 'FundsDeposited':
          await this.handleFundsDeposited(...event.args, event);
          break;
        case 'FundsWithdrawn':
          await this.handleFundsWithdrawn(...event.args, event);
          break;
        case 'GameCreated':
          await this.handleGameCreated(...event.args, event);
          break;
        case 'GameJoined':
          await this.handleGameJoined(...event.args, event);
          break;
        case 'GameCancelled':
          await this.handleGameCancelled(...event.args, event);
          break;
        case 'GameSettled':
          if (event.address === process.env.SMART_CONTRACT_ADDRESS) {
            await this.handleGameSettled(...event.args, event);
          } else {
            await this.handleScrabbleGameSettled(...event.args, event);
          }
          break;
      }
    } catch (error) {
      console.error(`Error processing event ${event.event}:`, error);
    }
  }
}

module.exports = new BlockchainListener();
