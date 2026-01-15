const fs = require('fs');
const path = require('path');

const BUILT_IN_WORDS = [
  'AA', 'AB', 'AD', 'AE', 'AG', 'AH', 'AI', 'AL', 'AM', 'AN', 'AR', 'AS', 'AT', 'AW', 'AX', 'AY',
  'BA', 'BE', 'BI', 'BO', 'BY', 'DA', 'DE', 'DO', 'ED', 'EF', 'EH', 'EL', 'EM', 'EN', 'ER', 'ES',
  'ET', 'EX', 'FA', 'FE', 'GO', 'HA', 'HE', 'HI', 'HM', 'HO', 'ID', 'IF', 'IN', 'IS', 'IT', 'JO',
  'KA', 'KI', 'LA', 'LI', 'LO', 'MA', 'ME', 'MI', 'MM', 'MO', 'MU', 'MY', 'NA', 'NE', 'NO', 'NU',
  'OD', 'OE', 'OF', 'OH', 'OI', 'OK', 'OM', 'ON', 'OP', 'OR', 'OS', 'OW', 'OX', 'OY', 'PA', 'PE',
  'PI', 'QI', 'RE', 'SH', 'SI', 'SO', 'TA', 'TI', 'TO', 'UH', 'UM', 'UN', 'UP', 'US', 'UT', 'WE',
  'WO', 'XI', 'XU', 'YA', 'YE', 'YO', 'ZA',
];

let dictionaryLoaded = false;
let dictionaryStats = { totalWords: 0, loadedFrom: 'embedded', createdAt: null };
let dictionarySet = new Set();

function normalizeWord(word = '') {
  return word.trim().toUpperCase();
}

function getDictionaryPath() {
  const preferred = [
    path.join(__dirname, '../data/wordlist.txt'),
    path.join(__dirname, '../data/dictionary.txt'),
  ];
  return preferred.find((candidate) => fs.existsSync(candidate)) || null;
}

function loadWordlist() {
  if (dictionaryLoaded) {
    return dictionaryStats;
  }

  const dictionaryPath = getDictionaryPath();
  const sourceLabel = dictionaryPath ? path.relative(process.cwd(), dictionaryPath) : 'embedded';
  let words = [];

  try {
    if (dictionaryPath) {
      words = fs.readFileSync(dictionaryPath, 'utf8')
        .split(/\r?\n/)
        .map(normalizeWord)
        .filter((word) => word.length > 0 && word.length <= 15);
    } else {
      words = BUILT_IN_WORDS.map(normalizeWord);
    }
  } catch (err) {
    console.error('❌ Failed to load dictionary file. Falling back to embedded list.', err.message);
    words = BUILT_IN_WORDS.map(normalizeWord);
  }

  // IMPORTANT: Avoid building large in-memory tries/DAWGs in production.
  // Fly shared-cpu 512mb VMs can easily OOM when constructing per-character
  // node graphs. A Set lookup is fast enough and far more memory efficient.
  dictionarySet = new Set(words);
  dictionaryLoaded = true;
  dictionaryStats = {
    totalWords: words.length,
    loadedFrom: sourceLabel,
    createdAt: new Date().toISOString(),
  };

  console.log(`📚 Dictionary ready (${words.length.toLocaleString()} words from ${sourceLabel})`);
  return dictionaryStats;
}

function ensureDictionary() {
  if (!dictionaryLoaded) {
    loadWordlist();
  }
}

function isValidWord(word) {
  const normalized = normalizeWord(word || '');
  if (!normalized) return false;
  ensureDictionary();
  if (normalized.length > 15) return false;
  return Boolean(dictionarySet && dictionarySet.size && dictionarySet.has(normalized));
}

function validateWords(words) {
  ensureDictionary();
  if (!Array.isArray(words)) return { valid: [], invalid: [] };
  const valid = [];
  const invalid = [];
  words.forEach((word) => {
    const normalized = normalizeWord(word || '');
    if (!normalized) return;
    if (isValidWord(normalized)) {
      valid.push(normalized);
    } else {
      invalid.push(normalized);
    }
  });
  return { valid, invalid };
}

function searchWords(pattern, limit = 10) {
  ensureDictionary();
  if (!pattern) return [];
  const regex = new RegExp(pattern.replace(/\*/g, '.*').toUpperCase());
  const matches = [];
  for (const word of dictionarySet) {
    if (regex.test(word)) {
      matches.push(word);
      if (matches.length >= limit) break;
    }
  }
  return matches;
}

function getStats() {
  ensureDictionary();
  return {
    ...dictionaryStats,
    memoryUsage: process.memoryUsage().heapUsed,
  };
}

module.exports = {
  loadWordlist,
  isValidWord,
  validateWords,
  searchWords,
  getStats,
};