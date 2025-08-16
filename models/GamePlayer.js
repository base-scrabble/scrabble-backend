const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const GamePlayer = sequelize.define('GamePlayer', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  gameId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  playerNumber: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  score: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  tiles: {
    type: DataTypes.TEXT,
    defaultValue: JSON.stringify([])
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  joinedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'game_players',
  timestamps: true
});

module.exports = GamePlayer;
