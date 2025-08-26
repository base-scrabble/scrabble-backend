const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Admin = sequelize.define('Admin', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    field: 'user_id'
  },
  role: {
    type: DataTypes.ENUM('super_admin', 'tournament_admin', 'moderator', 'content_manager'),
    allowNull: false,
    defaultValue: 'moderator'
  },
  permissions: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {
      tournaments: {
        create: false,
        read: true,
        update: false,
        delete: false,
        manage_players: false
      },
      users: {
        create: false,
        read: true,
        update: false,
        delete: false,
        ban: false
      },
      games: {
        create: false,
        read: true,
        update: false,
        delete: false,
        moderate: false
      },
      system: {
        settings: false,
        logs: false,
        backup: false,
        analytics: true
      }
    }
  },
  lastLoginAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_login_at'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_active'
  },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'created_by'
  }
}, {
  tableName: 'admins',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['user_id'],
      unique: true
    },
    {
      fields: ['role']
    },
    {
      fields: ['is_active']
    }
  ]
});

module.exports = Admin;
