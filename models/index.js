const { sequelize } = require('../config/database');
const User = require('./User');
const Game = require('./Game');
const GamePlayer = require('./GamePlayer');
const Move = require('./Move');

// Define associations
User.hasMany(GamePlayer, { foreignKey: 'userId' });
GamePlayer.belongsTo(User, { foreignKey: 'userId' });

Game.hasMany(GamePlayer, { foreignKey: 'gameId' });
GamePlayer.belongsTo(Game, { foreignKey: 'gameId' });

Game.hasMany(Move, { foreignKey: 'gameId' });
Move.belongsTo(Game, { foreignKey: 'gameId' });

User.hasMany(Move, { foreignKey: 'userId' });
Move.belongsTo(User, { foreignKey: 'userId' });

Game.belongsTo(User, { foreignKey: 'winnerId', as: 'winner' });

module.exports = {
  sequelize,
  User,
  Game,
  GamePlayer,
  Move
};
