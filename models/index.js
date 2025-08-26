const { sequelize } = require('../config/database');
const User = require('./User');
const Game = require('./Game');
const GamePlayer = require('./GamePlayer');
const Move = require('./Move');
const Tournament = require('./Tournament');
const TournamentPlayer = require('./TournamentPlayer');
const TournamentMatch = require('./TournamentMatch');
const Admin = require('./Admin');
const TournamentSchedule = require('./TournamentSchedule');

// Define associations
User.hasMany(GamePlayer, { foreignKey: 'userId' });
GamePlayer.belongsTo(User, { foreignKey: 'userId' });

Game.hasMany(GamePlayer, { foreignKey: 'gameId' });
GamePlayer.belongsTo(Game, { foreignKey: 'gameId' });

Game.hasMany(Move, { foreignKey: 'gameId' });
Move.belongsTo(Game, { foreignKey: 'gameId' });

User.hasMany(Move, { foreignKey: 'userId' });
Move.belongsTo(User, { foreignKey: 'userId' });

Game.belongsTo(User, { as: 'Winner', foreignKey: 'winnerId' });

// Tournament associations
User.hasMany(Tournament, { as: 'CreatedTournaments', foreignKey: 'createdBy' });
Tournament.belongsTo(User, { as: 'Creator', foreignKey: 'createdBy' });

Tournament.belongsTo(User, { as: 'Winner', foreignKey: 'winnerId' });

Tournament.hasMany(TournamentPlayer, { foreignKey: 'tournamentId' });
TournamentPlayer.belongsTo(Tournament, { foreignKey: 'tournamentId' });

User.hasMany(TournamentPlayer, { foreignKey: 'userId' });
TournamentPlayer.belongsTo(User, { foreignKey: 'userId' });

Tournament.hasMany(TournamentMatch, { foreignKey: 'tournamentId' });
TournamentMatch.belongsTo(Tournament, { foreignKey: 'tournamentId' });

TournamentMatch.belongsTo(User, { as: 'Player1', foreignKey: 'player1Id' });
TournamentMatch.belongsTo(User, { as: 'Player2', foreignKey: 'player2Id' });
TournamentMatch.belongsTo(User, { as: 'Winner', foreignKey: 'winnerId' });
TournamentMatch.belongsTo(User, { as: 'Loser', foreignKey: 'loserId' });

TournamentMatch.belongsTo(Game, { foreignKey: 'gameId' });
Game.hasOne(TournamentMatch, { foreignKey: 'gameId' });

Tournament.hasMany(TournamentSchedule, { foreignKey: 'tournamentId' });
TournamentSchedule.belongsTo(Tournament, { foreignKey: 'tournamentId' });

// Admin associations
User.hasOne(Admin, { foreignKey: 'userId' });
Admin.belongsTo(User, { foreignKey: 'userId' });

Admin.belongsTo(User, { as: 'CreatedBy', foreignKey: 'createdBy' });

module.exports = {
  sequelize,
  User,
  Game,
  GamePlayer,
  Move,
  Tournament,
  TournamentPlayer,
  TournamentMatch,
  Admin,
  TournamentSchedule
};
