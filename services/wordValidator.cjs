const fs = require('fs');
const path = require('path');

class TrieNode {
  constructor() {
    this.children = Object.create(null);
    this.isWord = false;
  }
}

class Trie {
  constructor() {
    this.root = new TrieNode();
  }

  add(word = '') {
    if (!word) return;
    let node = this.root;
    for (const char of word) {
      if (!node.children[char]) {
        node.children[char] = new TrieNode();
      }
      node = node.children[char];
    }
    node.isWord = true;
  }

  has(word = '') {
    if (!word) return false;
    let node = this.root;
    for (const char of word) {
      node = node.children[char];
      if (!node) return false;
    }
    return Boolean(node && node.isWord);
  }
}

class BloomFilter {
  constructor(size = 131072) {
    this.size = Math.max(2048, size);
    this.bits = new Uint8Array(Math.ceil(this.size / 8));
  }

  _hash(word, seed) {
    let hash = seed;
    for (let i = 0; i < word.length; i += 1) {
      hash ^= (hash << 5) + (hash >> 2) + word.charCodeAt(i);
    }
    return Math.abs(hash) >>> 0;
  }

  _indexes(word) {
    const h1 = this._hash(word, 0x9e3779b9);
    const h2 = this._hash(word, 0x85ebca6b);
    return [
      h1 % this.size,
      (h1 + h2) % this.size,
      (h1 + (h2 << 1)) % this.size,
    ];
  }

  add(word) {
    this._indexes(word).forEach((idx) => {
      const byteIndex = Math.floor(idx / 8);
      const bitIndex = idx % 8;
      this.bits[byteIndex] |= (1 << bitIndex);
    });
  }

  mightContain(word) {
    return this._indexes(word).every((idx) => {
      const byteIndex = Math.floor(idx / 8);
      const bitIndex = idx % 8;
      return (this.bits[byteIndex] & (1 << bitIndex)) !== 0;
    });
  }
}

const BUILT_IN_WORDS = [
  'AA', 'AB', 'AD', 'AE', 'AG', 'AH', 'AI', 'AL', 'AM', 'AN', 'AR', 'AS', 'AT', 'AW', 'AX', 'AY',
  'BA', 'BE', 'BI', 'BO', 'BY', 'DA', 'DE', 'DO', 'ED', 'EF', 'EH', 'EL', 'EM', 'EN', 'ER', 'ES',
  'ET', 'EX', 'FA', 'FE', 'GO', 'HA', 'HE', 'HI', 'HM', 'HO', 'ID', 'IF', 'IN', 'IS', 'IT', 'JO',
  'KA', 'KI', 'LA', 'LI', 'LO', 'MA', 'ME', 'MI', 'MM', 'MO', 'MU', 'MY', 'NA', 'NE', 'NO', 'NU',
  'OD', 'OE', 'OF', 'OH', 'OI', 'OK', 'OM', 'ON', 'OP', 'OR', 'OS', 'OW', 'OX', 'OY', 'PA', 'PE',
  'PI', 'QI', 'RE', 'SH', 'SI', 'SO', 'TA', 'TI', 'TO', 'UH', 'UM', 'UN', 'UP', 'US', 'UT', 'WE',
  'WO', 'XI', 'XU', 'YA', 'YE', 'YO', 'ZA',
];

let trie = new Trie();
let bloom = null;
let dictionaryLoaded = false;
let dictionaryStats = { totalWords: 0, loadedFrom: 'embedded', createdAt: null };
let dictionaryWords = [];
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

  trie = new Trie();
  bloom = new BloomFilter(words.length * 12);
  dictionarySet = new Set();
  words.forEach((word) => {
    trie.add(word);
    bloom.add(word);
    dictionarySet.add(word);
  });

  dictionaryWords = words;
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
  if (dictionarySet && dictionarySet.size && dictionarySet.has(normalized)) {
    return true;
  }
  if (bloom && !bloom.mightContain(normalized)) return false;
  return trie.has(normalized);
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
  for (const word of dictionaryWords) {
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