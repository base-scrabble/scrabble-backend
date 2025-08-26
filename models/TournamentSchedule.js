const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const TournamentSchedule = sequelize.define('TournamentSchedule', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  tournamentId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'tournament_id'
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM('recurring', 'one_time'),
    allowNull: false,
    defaultValue: 'one_time'
  },
  frequency: {
    type: DataTypes.ENUM('daily', 'weekly', 'monthly', 'custom'),
    allowNull: true
  },
  cronExpression: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'cron_expression'
  },
  nextRunAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'next_run_at'
  },
  lastRunAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_run_at'
  },
  autoStart: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'auto_start'
  },
  minPlayers: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 2,
    field: 'min_players'
  },
  registrationDuration: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 3600, // 1 hour in seconds
    field: 'registration_duration'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_active'
  },
  settings: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {
      notifications: {
        registrationOpen: true,
        tournamentStart: true,
        roundStart: true
      },
      automation: {
        createBrackets: true,
        startMatches: false,
        advanceRounds: false
      }
    }
  },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'created_by'
  }
}, {
  tableName: 'tournament_schedules',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['tournament_id']
    },
    {
      fields: ['type']
    },
    {
      fields: ['next_run_at']
    },
    {
      fields: ['is_active']
    }
  ]
});

module.exports = TournamentSchedule;
