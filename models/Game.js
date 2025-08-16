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
  }
}, {
  tableName: 'games',
  timestamps: true
});

module.exports = Game;
