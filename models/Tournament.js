const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Tournament = sequelize.define('Tournament', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [3, 100]
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  type: {
    type: DataTypes.ENUM('single_elimination', 'double_elimination', 'round_robin', 'swiss'),
    allowNull: false,
    defaultValue: 'single_elimination'
  },
  status: {
    type: DataTypes.ENUM('draft', 'registration_open', 'registration_closed', 'in_progress', 'completed', 'cancelled'),
    allowNull: false,
    defaultValue: 'draft'
  },
  schedulingType: {
    type: DataTypes.ENUM('manual', 'automatic'),
    allowNull: false,
    defaultValue: 'manual',
    field: 'scheduling_type'
  },
  maxPlayers: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 16,
    validate: {
      min: 2,
      max: 256
    },
    field: 'max_players'
  },
  entryFee: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00,
    field: 'entry_fee'
  },
  prizePool: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00,
    field: 'prize_pool'
  },
  registrationStartAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'registration_start_at'
  },
  registrationEndAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'registration_end_at'
  },
  startAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'start_at'
  },
  endAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'end_at'
  },
  rules: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {
      timeLimit: 300, // 5 minutes per turn
      gameMode: 'classic',
      allowChallenges: true,
      minWordLength: 2
    }
  },
  settings: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {
      autoAdvance: false,
      sendNotifications: true,
      allowSpectators: true,
      recordGames: true
    }
  },
  winnerId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'winner_id'
  },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'created_by'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_active'
  }
}, {
  tableName: 'tournaments',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['status']
    },
    {
      fields: ['type']
    },
    {
      fields: ['scheduling_type']
    },
    {
      fields: ['created_by']
    },
    {
      fields: ['start_at']
    }
  ]
});

module.exports = Tournament;
