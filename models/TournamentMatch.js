const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const TournamentMatch = sequelize.define('TournamentMatch', {
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
  gameId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'game_id'
  },
  roundNumber: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'round_number'
  },
  matchNumber: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'match_number'
  },
  player1Id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'player1_id'
  },
  player2Id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'player2_id'
  },
  winnerId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'winner_id'
  },
  loserId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'loser_id'
  },
  player1Score: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'player1_score'
  },
  player2Score: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'player2_score'
  },
  status: {
    type: DataTypes.ENUM('scheduled', 'in_progress', 'completed', 'forfeit', 'cancelled'),
    allowNull: false,
    defaultValue: 'scheduled'
  },
  scheduledAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'scheduled_at'
  },
  startedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'started_at'
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'completed_at'
  },
  bracketPosition: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'bracket_position'
  },
  nextMatchId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'next_match_id'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'tournament_matches',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['tournament_id', 'round_number']
    },
    {
      fields: ['tournament_id', 'status']
    },
    {
      fields: ['player1_id']
    },
    {
      fields: ['player2_id']
    },
    {
      fields: ['winner_id']
    },
    {
      fields: ['game_id']
    }
  ]
});

module.exports = TournamentMatch;
