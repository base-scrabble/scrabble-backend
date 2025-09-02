const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Game = sequelize.define('Game', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  gameCode: {
    type: DataTypes.STRING(10),
    allowNull: false,
    unique: true
  },
  status: {
    type: DataTypes.ENUM('waiting', 'active', 'completed', 'cancelled'),
    defaultValue: 'waiting'
  },
  currentTurn: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  maxPlayers: {
    type: DataTypes.INTEGER,
    defaultValue: 4
  },
  boardState: {
    type: DataTypes.TEXT,
    defaultValue: JSON.stringify(Array(15).fill(null).map(() => Array(15).fill(null)))
  },
  availableLetters: {
    type: DataTypes.TEXT,
    defaultValue: JSON.stringify([
      'A','A','A','A','A','A','A','A','A','B','B','C','C','D','D','D','D',
      'E','E','E','E','E','E','E','E','E','E','E','E','F','F','G','G','G',
      'H','H','I','I','I','I','I','I','I','I','I','J','K','L','L','L','L',
      'M','M','N','N','N','N','N','N','O','O','O','O','O','O','O','O',
      'P','P','Q','R','R','R','R','R','R','S','S','S','S','T','T','T',
      'T','T','T','U','U','U','U','V','V','W','W','X','Y','Y','Z'
    ])
  },
  winnerId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  startedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  // Blockchain integration fields
  blockchainGameId: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Game ID on the blockchain'
  },
  stakeAmount: {
    type: DataTypes.DECIMAL(18, 8),
    allowNull: true,
    comment: 'Stake amount in ETH'
  },
  tokenAddress: {
    type: DataTypes.STRING(42),
    allowNull: true,
    comment: 'Token contract address'
  },
  player1Address: {
    type: DataTypes.STRING(42),
    allowNull: true,
    comment: 'Player 1 wallet address'
  },
  player2Address: {
    type: DataTypes.STRING(42),
    allowNull: true,
    comment: 'Player 2 wallet address'
  },
  player1Score: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0
  },
  player2Score: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0
  },
  winner: {
    type: DataTypes.ENUM('player1', 'player2', 'draw'),
    allowNull: true,
    comment: 'Game winner designation'
  },
  finalWinner: {
    type: DataTypes.STRING(42),
    allowNull: true,
    comment: 'Winner wallet address from blockchain'
  },
  payout: {
    type: DataTypes.DECIMAL(18, 8),
    allowNull: true,
    comment: 'Payout amount in ETH'
  },
  transactionHash: {
    type: DataTypes.STRING(66),
    allowNull: true,
    comment: 'Transaction hash for game creation'
  },
  blockchainSubmitted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether game result has been submitted to blockchain'
  },
  submissionTxHash: {
    type: DataTypes.STRING(66),
    allowNull: true,
    comment: 'Transaction hash for result submission'
  },
  submissionBlockNumber: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Block number where result was submitted'
  },
  submissionAttempts: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Number of submission attempts'
  },
  submissionFailed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether submission permanently failed'
  },
  lastSubmissionError: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Last submission error message'
  },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'User ID who created the game'
  }
}, {
  tableName: 'games',
  timestamps: true
});

module.exports = Game;
