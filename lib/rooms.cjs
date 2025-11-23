function normalizeId(id) {
  if (id === undefined || id === null) return '';
  return String(id).trim();
}

function normalizePlayerName(name) {
  return (name || '').trim().toLowerCase();
}

function gameRoom(gameId) {
  return `game:${normalizeId(gameId)}`;
}

function playerRoom(gameId, playerName) {
  const safeGame = normalizeId(gameId);
  const safePlayer = normalizePlayerName(playerName);
  return `player:${safeGame}:${safePlayer}`;
}

module.exports = { gameRoom, playerRoom };
