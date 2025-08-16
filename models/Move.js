const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Move = sequelize.define('Move', {
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
  word: {
    type: DataTypes.STRING(15),
    allowNull: false
  },
  positions: {
    type: DataTypes.TEXT,
    allowNull: false // JSON array of {row, col, letter} objects
  },
  points: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  moveNumber: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  tableName: 'moves',
  timestamps: true
});

module.exports = Move;
