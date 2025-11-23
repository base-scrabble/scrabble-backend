const BOARD_SIZE = 15;
const CENTER_INDEX = 7;

const TILE_DISTRIBUTION = [
  { letter: 'A', count: 9, value: 1 },
  { letter: 'B', count: 2, value: 3 },
  { letter: 'C', count: 2, value: 3 },
  { letter: 'D', count: 4, value: 2 },
  { letter: 'E', count: 12, value: 1 },
  { letter: 'F', count: 2, value: 4 },
  { letter: 'G', count: 3, value: 2 },
  { letter: 'H', count: 2, value: 4 },
  { letter: 'I', count: 9, value: 1 },
  { letter: 'J', count: 1, value: 8 },
  { letter: 'K', count: 1, value: 5 },
  { letter: 'L', count: 4, value: 1 },
  { letter: 'M', count: 2, value: 3 },
  { letter: 'N', count: 6, value: 1 },
  { letter: 'O', count: 8, value: 1 },
  { letter: 'P', count: 2, value: 3 },
  { letter: 'Q', count: 1, value: 10 },
  { letter: 'R', count: 6, value: 1 },
  { letter: 'S', count: 4, value: 1 },
  { letter: 'T', count: 6, value: 1 },
  { letter: 'U', count: 4, value: 1 },
  { letter: 'V', count: 2, value: 4 },
  { letter: 'W', count: 2, value: 4 },
  { letter: 'X', count: 1, value: 8 },
  { letter: 'Y', count: 2, value: 4 },
  { letter: 'Z', count: 1, value: 10 },
  { letter: '?', count: 2, value: 0 },
];

const LETTER_SCORES = TILE_DISTRIBUTION.reduce((acc, tile) => {
  acc[tile.letter] = tile.value;
  return acc;
}, {});

const PREMIUM_SQUARES = {
  '0,0': 'TW', '0,7': 'TW', '0,14': 'TW',
  '7,0': 'TW', '7,14': 'TW',
  '14,0': 'TW', '14,7': 'TW', '14,14': 'TW',
  '1,1': 'DW', '2,2': 'DW', '3,3': 'DW', '4,4': 'DW',
  '10,10': 'DW', '11,11': 'DW', '12,12': 'DW', '13,13': 'DW',
  '1,13': 'DW', '2,12': 'DW', '3,11': 'DW', '4,10': 'DW',
  '10,4': 'DW', '11,3': 'DW', '12,2': 'DW', '13,1': 'DW',
  '5,1': 'TL', '9,1': 'TL', '1,5': 'TL', '5,5': 'TL', '9,5': 'TL', '13,5': 'TL',
  '1,9': 'TL', '5,9': 'TL', '9,9': 'TL', '13,9': 'TL', '5,13': 'TL', '9,13': 'TL',
  '0,3': 'DL', '0,11': 'DL', '2,6': 'DL', '2,8': 'DL', '3,0': 'DL', '3,7': 'DL', '3,14': 'DL',
  '6,2': 'DL', '6,6': 'DL', '6,8': 'DL', '6,12': 'DL',
  '7,3': 'DL', '7,11': 'DL',
  '8,2': 'DL', '8,6': 'DL', '8,8': 'DL', '8,12': 'DL',
  '11,0': 'DL', '11,7': 'DL', '11,14': 'DL', '12,6': 'DL', '12,8': 'DL', '14,3': 'DL', '14,11': 'DL',
};

function normalizeLetter(letter) {
  if (typeof letter !== 'string') return '';
  return letter.trim().toUpperCase();
}

function isAlpha(letter) {
  return /^[A-Z]$/.test(letter);
}

function sanitizeRackLetter(input) {
  if (typeof input !== 'string') return '';
  const normalized = input.trim().toUpperCase();
  if (normalized === '?') return '?';
  return isAlpha(normalized) ? normalized : '';
}

function encodeCell(letter, isBlank = false) {
  const normalized = normalizeLetter(letter);
  if (!isAlpha(normalized)) return null;
  return isBlank ? { letter: normalized, isBlank: true } : normalized;
}

function resolveCell(cell) {
  if (!cell) return null;
  if (typeof cell === 'string') {
    const normalized = normalizeLetter(cell);
    return isAlpha(normalized) ? { letter: normalized, isBlank: false } : null;
  }
  if (typeof cell === 'object') {
    const normalized = normalizeLetter(cell.letter);
    return isAlpha(normalized) ? { letter: normalized, isBlank: Boolean(cell.isBlank) } : null;
  }
  return null;
}

function createEmptyGrid() {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function shuffleBag(bag = []) {
  const copy = Array.isArray(bag) ? [...bag] : [];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createTileBag() {
  const bag = [];
  TILE_DISTRIBUTION.forEach(({ letter, count }) => {
    for (let i = 0; i < count; i += 1) {
      bag.push(letter);
    }
  });
  return shuffle(bag);
}

function cloneGrid(grid) {
  return (grid || createEmptyGrid()).map((row) => row.slice());
}

function hydrateBoardState(raw) {
  if (!raw) {
    return { grid: createEmptyGrid(), bag: createTileBag(), lastMove: null, passesInRow: 0 };
  }
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (Array.isArray(parsed)) {
      return { grid: parsed, bag: createTileBag(), lastMove: null, passesInRow: 0 };
    }
    return {
      grid: Array.isArray(parsed.grid) ? parsed.grid : createEmptyGrid(),
      bag: Array.isArray(parsed.bag) ? parsed.bag : createTileBag(),
      lastMove: parsed.lastMove || null,
      passesInRow: Number.isInteger(parsed.passesInRow) ? parsed.passesInRow : 0,
    };
  } catch (err) {
    return { grid: createEmptyGrid(), bag: createTileBag(), lastMove: null, passesInRow: 0 };
  }
}

function serializeBoardState(state) {
  return JSON.stringify({
    grid: state.grid,
    bag: state.bag,
    lastMove: state.lastMove || null,
    passesInRow: Number.isInteger(state.passesInRow) ? state.passesInRow : 0,
  });
}

function fillRack(boardState, rackLetters = []) {
  const rack = Array.isArray(rackLetters)
    ? rackLetters.map((letter) => sanitizeRackLetter(letter)).filter(Boolean)
    : [];
  const bag = Array.isArray(boardState.bag) ? boardState.bag : [];
  while (rack.length < 7 && bag.length) {
    rack.push(bag.shift());
  }
  return { rack, bag };
}

function hasTilesOnBoard(grid) {
  return grid.some((row) => row.some((cell) => {
    const resolved = resolveCell(cell);
    return Boolean(resolved && resolved.letter);
  }));
}

function normalizePlacements(rawPlacements = []) {
  return rawPlacements
    .map((placement) => {
      const row = Number(placement.row);
      const col = Number(placement.col);
      const letter = normalizeLetter(placement.letter);
      if (!isAlpha(letter)) return null;
      const rackSource = placement.rackLetter
        ?? placement.originalLetter
        ?? placement.tile
        ?? placement.sourceLetter
        ?? placement.letter;
      const rackLetter = sanitizeRackLetter(rackSource) || letter;
      const isBlank = placement.isBlank === true || rackLetter === '?';
      return {
        row,
        col,
        letter,
        rackLetter: isBlank ? '?' : rackLetter,
        isBlank,
      };
    })
    .filter((placement) => placement
      && Number.isInteger(placement.row)
      && Number.isInteger(placement.col)
      && placement.row >= 0
      && placement.row < BOARD_SIZE
      && placement.col >= 0
      && placement.col < BOARD_SIZE
      && isAlpha(placement.letter));
}

function determineOrientation(placements) {
  if (placements.length <= 1) return 'horizontal';
  const sameRow = placements.every((p) => p.row === placements[0].row);
  const sameCol = placements.every((p) => p.col === placements[0].col);
  if (sameRow) return 'horizontal';
  if (sameCol) return 'vertical';
  return null;
}

function inBounds(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function buildPlacementMap(placements) {
  return placements.reduce((acc, placement) => {
    acc.set(`${placement.row},${placement.col}`, {
      letter: placement.letter,
      isBlank: Boolean(placement.isBlank),
    });
    return acc;
  }, new Map());
}

function hasAdjacentTile(grid, row, col) {
  const neighbors = [
    [row - 1, col],
    [row + 1, col],
    [row, col - 1],
    [row, col + 1],
  ];
  return neighbors.some(([r, c]) => inBounds(r, c) && !!resolveCell(grid[r][c]));
}

function buildWord({
  grid,
  placementMap,
  orientation,
  startRow,
  startCol,
  stepRow,
  stepCol,
}) {
  let row = startRow;
  let col = startCol;
  while (inBounds(row - stepRow, col - stepCol)
    && (grid[row - stepRow][col - stepCol]
      || placementMap.has(`${row - stepRow},${col - stepCol}`))) {
    row -= stepRow;
    col -= stepCol;
  }

  const positions = [];
  let touchesExisting = false;
  while (inBounds(row, col)) {
    const key = `${row},${col}`;
      const placementEntry = placementMap.get(key);
      const cellData = placementEntry || resolveCell(grid[row][col]);
    if (!cellData) break;
    positions.push({
      row,
      col,
      letter: cellData.letter,
      isBlank: Boolean(cellData.isBlank),
    });
    if (!placementEntry) touchesExisting = true;
    row += stepRow;
    col += stepCol;
  }

  const word = positions.map((pos) => pos.letter).join('');
  return { word, positions, touchesExisting };
}

function calculateWordScore(positions, placementMap) {
  let total = 0;
  let wordMultiplier = 1;
  positions.forEach((pos) => {
    const key = `${pos.row},${pos.col}`;
    const isNewTile = placementMap.has(key);
    const letter = pos.letter;
    const letterScore = pos.isBlank ? 0 : (LETTER_SCORES[letter] || 0);
    let letterMultiplier = 1;
    if (isNewTile) {
      const premium = PREMIUM_SQUARES[key];
      if (premium === 'DL') letterMultiplier = 2;
      if (premium === 'TL') letterMultiplier = 3;
      if (premium === 'DW') wordMultiplier *= 2;
      if (premium === 'TW') wordMultiplier *= 3;
    }
    total += letterScore * letterMultiplier;
  });
  return total * wordMultiplier;
}

function gatherCrossWord({ grid, placement, placementMap, orientation }) {
  const stepRow = orientation === 'vertical' ? 1 : 0;
  const stepCol = orientation === 'horizontal' ? 1 : 0;
  const negativeStepRow = -stepRow;
  const negativeStepCol = -stepCol;

  let row = placement.row;
  let col = placement.col;

  while (inBounds(row + negativeStepRow, col + negativeStepCol)
    && (grid[row + negativeStepRow][col + negativeStepCol]
      || placementMap.has(`${row + negativeStepRow},${col + negativeStepCol}`))) {
    row += negativeStepRow;
    col += negativeStepCol;
  }

  const positions = [];
  let touchesExisting = false;
  while (inBounds(row, col)) {
    const key = `${row},${col}`;
    const placementEntry = placementMap.get(key);
    const cellData = placementEntry || resolveCell(grid[row][col]);
    if (!cellData) break;
    positions.push({
      row,
      col,
      letter: cellData.letter,
      isBlank: Boolean(cellData.isBlank),
    });
    if (!placementEntry) touchesExisting = true;
    row += stepRow;
    col += stepCol;
  }

  const word = positions.map((pos) => pos.letter).join('');
  return { word, positions, touchesExisting };
}

function analyzeMove(boardState, rawPlacements = []) {
  const placements = normalizePlacements(rawPlacements);
  if (!placements.length) {
    return { ok: false, reason: 'NO_TILES' };
  }

  const seen = new Set();
  for (const placement of placements) {
    const key = `${placement.row},${placement.col}`;
    if (seen.has(key)) {
      return { ok: false, reason: 'DUPLICATE_POSITION' };
    }
    seen.add(key);
  }

  const orientation = determineOrientation(placements);
  if (!orientation) {
    return { ok: false, reason: 'NOT_IN_LINE' };
  }

  const placementMap = buildPlacementMap(placements);
  for (const placement of placements) {
    if (boardState.grid[placement.row][placement.col]) {
      return { ok: false, reason: 'CELL_OCCUPIED' };
    }
  }

  const boardHasTiles = hasTilesOnBoard(boardState.grid);
  if (!boardHasTiles) {
    const coversCenter = placements.some((p) => p.row === CENTER_INDEX && p.col === CENTER_INDEX);
    if (!coversCenter) {
      return { ok: false, reason: 'FIRST_MOVE_NEEDS_CENTER' };
    }
  }

  const stepRow = orientation === 'vertical' ? 1 : 0;
  const stepCol = orientation === 'horizontal' ? 1 : 0;
  const anchor = placements.reduce((prev, current) => {
    if (!prev) return current;
    if (orientation === 'horizontal') {
      return current.col < prev.col ? current : prev;
    }
    if (orientation === 'vertical') {
      return current.row < prev.row ? current : prev;
    }
    return current;
  }, null);

  const mainWord = buildWord({
    grid: boardState.grid,
    placementMap,
    orientation,
    startRow: anchor.row,
    startCol: anchor.col,
    stepRow,
    stepCol,
  });

  if (!mainWord.word || !mainWord.word.length) {
    return { ok: false, reason: 'EMPTY_WORD' };
  }

  const placementKeys = new Set(placements.map((p) => `${p.row},${p.col}`));
  const mainWordKeys = new Set(mainWord.positions.map((pos) => `${pos.row},${pos.col}`));
  for (const key of placementKeys) {
    if (!mainWordKeys.has(key)) {
      return { ok: false, reason: 'GAPPED_WORD' };
    }
  }

  const crossWords = [];
  placements.forEach((placement) => {
    const crossOrientation = orientation === 'horizontal' ? 'vertical' : 'horizontal';
    const crossWord = gatherCrossWord({
      grid: boardState.grid,
      placement,
      placementMap,
      orientation: crossOrientation,
    });
    if (crossWord.word.length > 1) {
      crossWords.push(crossWord);
    }
  });

  let touchesExisting = mainWord.touchesExisting || crossWords.some((word) => word.touchesExisting);
  if (!boardHasTiles) {
    touchesExisting = true; // first move allowed without adjacency
  }
  if (!touchesExisting) {
    const adjacent = placements.some((placement) => hasAdjacentTile(boardState.grid, placement.row, placement.col));
    if (!adjacent) {
      return { ok: false, reason: 'MUST_CONNECT' };
    }
  }

  const scoredMainWord = {
    type: 'main',
    word: mainWord.word,
    score: calculateWordScore(mainWord.positions, placementMap),
    positions: mainWord.positions,
  };

  const scoredCrossWords = crossWords.map((cross) => ({
    type: 'cross',
    word: cross.word,
    score: calculateWordScore(cross.positions, placementMap),
    positions: cross.positions,
  }));

  const totalScore = scoredMainWord.score
    + scoredCrossWords.reduce((acc, word) => acc + word.score, 0)
    + (placements.length >= 7 ? 50 : 0);

  const updatedGrid = cloneGrid(boardState.grid);
  placements.forEach((placement) => {
    updatedGrid[placement.row][placement.col] = encodeCell(placement.letter, placement.isBlank);
  });

  return {
    ok: true,
    score: totalScore,
    words: [scoredMainWord, ...scoredCrossWords],
    updatedGrid,
    placements,
  };
}

function consumeRackLetters(rackLetters = [], placements = []) {
  const remaining = [...rackLetters];
  placements.forEach((placement) => {
    const target = sanitizeRackLetter(placement.rackLetter || placement.letter);
    if (!target) return;
    const idx = remaining.findIndex((letter) => letter === target);
    if (idx !== -1) {
      remaining.splice(idx, 1);
    }
  });
  return remaining;
}

function removeLettersFromRack(rackLetters = [], letters = []) {
  const remaining = [...rackLetters];
  for (const letter of letters.map((value) => sanitizeRackLetter(value)).filter(Boolean)) {
    const idx = remaining.findIndex((r) => r === letter);
    if (idx === -1) {
      return { ok: false, remaining: rackLetters };
    }
    remaining.splice(idx, 1);
  }
  return { ok: true, remaining };
}

module.exports = {
  BOARD_SIZE,
  PREMIUM_SQUARES,
  LETTER_SCORES,
  createTileBag,
  createEmptyGrid,
  hydrateBoardState,
  serializeBoardState,
  fillRack,
  analyzeMove,
  consumeRackLetters,
  removeLettersFromRack,
  shuffleBag,
};
