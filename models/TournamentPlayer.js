const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const TournamentPlayer = sequelize.define('TournamentPlayer', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  tournamentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'tournament_id'
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'user_id'
  },
  seedNumber: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'seed_number'
  },
  registrationDate: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'registration_date'
  },
  status: {
    type: DataTypes.ENUM('registered', 'confirmed', 'checked_in', 'active', 'eliminated', 'withdrawn', 'disqualified'),
    allowNull: false,
    defaultValue: 'registered'
  },
  currentRound: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    field: 'current_round'
  },
  wins: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  losses: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  draws: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  totalScore: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'total_score'
  },
  averageScore: {
    type: DataTypes.DECIMAL(8, 2),
    allowNull: false,
    defaultValue: 0.00,
    field: 'average_score'
  },
  ranking: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_active'
  }
}, {
  tableName: 'tournament_players',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['tournament_id', 'user_id'],
      unique: true
    },
    {
      fields: ['tournament_id', 'status']
    },
    {
      fields: ['tournament_id', 'ranking']
    },
    {
      fields: ['seed_number']
    }
  ]
});

module.exports = TournamentPlayer;
