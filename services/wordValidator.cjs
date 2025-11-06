const fs = require('fs');
const path = require('path');

class WordValidator {
  constructor() {
    this.dictionary = new Set();
    this.isLoaded = false;
    this.loadDictionary();
  }

  /**
   * Load dictionary from file or use built-in word list
   */
  async loadDictionary() {
    try {
      const dictionaryPath = path.join(__dirname, '../data/dictionary.txt');
      if (fs.existsSync(dictionaryPath)) {
        const words = fs.readFileSync(dictionaryPath, 'utf8')
          .split('\n')
          .map(word => word.trim().toUpperCase())
          .filter(word => word.length > 0 && word.length <= 15);
        words.forEach(word => this.dictionary.add(word));
        console.log(`📚 Loaded ${this.dictionary.size} words from dictionary file`);
      } else {
        this.loadBuiltInDictionary();
        console.log(`📚 Using built-in dictionary with ${this.dictionary.size} words`);
      }
      this.isLoaded = true;
    } catch (error) {
      console.error('❌ Error loading dictionary:', error);
      this.loadBuiltInDictionary();
      this.isLoaded = true;
    }
  }

  /**
   * Load a curated list of common Scrabble words
   */
  loadBuiltInDictionary() {
    const commonWords = [
      // 2-letter words
      'AA', 'AB', 'AD', 'AE', 'AG', 'AH', 'AI', 'AL', 'AM', 'AN', 'AR', 'AS', 'AT', 'AW', 'AX', 'AY',
      'BA', 'BE', 'BI', 'BO', 'BY', 'DA', 'DE', 'DO', 'ED', 'EF', 'EH', 'EL', 'EM', 'EN', 'ER', 'ES',
      'ET', 'EX', 'FA', 'FE', 'GO', 'HA', 'HE', 'HI', 'HM', 'HO', 'ID', 'IF', 'IN', 'IS', 'IT', 'JO',
      'KA', 'KI', 'LA', 'LI', 'LO', 'MA', 'ME', 'MI', 'MM', 'MO', 'MU', 'MY', 'NA', 'NE', 'NO', 'NU',
      'OD', 'OE', 'OF', 'OH', 'OI', 'OK', 'OM', 'ON', 'OP', 'OR', 'OS', 'OW', 'OX', 'OY', 'PA', 'PE',
      'PI', 'QI', 'RE', 'SH', 'SI', 'SO', 'TA', 'TI', 'TO', 'UH', 'UM', 'UN', 'UP', 'US', 'UT', 'WE',
      'WO', 'XI', 'XU', 'YA', 'YE', 'YO', 'ZA',
      // Common 3-letter words
      'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HER', 'WAS', 'ONE', 'OUR', 'OUT',
      'DAY', 'GET', 'HAS', 'HIM', 'HIS', 'HOW', 'ITS', 'MAY', 'NEW', 'NOW', 'OLD', 'SEE', 'TWO', 'WHO',
      'BOY', 'DID', 'ITS', 'LET', 'PUT', 'SAY', 'SHE', 'TOO', 'USE', 'WAY', 'WIN', 'YES', 'YET', 'BAD',
      'BAG', 'BED', 'BIG', 'BOX', 'CAR', 'CAT', 'CUP', 'DOG', 'EAR', 'EGG', 'END', 'EYE', 'FAR', 'FUN',
      'GOT', 'GUN', 'HAD', 'HAT', 'HIT', 'HOT', 'JOB', 'LAW', 'LEG', 'LOT', 'MAN', 'MAP', 'MOM', 'PEN',
      'PET', 'PIG', 'RED', 'RUN', 'SIT', 'SIX', 'SUN', 'TEN', 'TOP', 'TRY', 'WAR', 'WIN', 'ZOO',
      // Common 4-letter words
      'THAT', 'WITH', 'HAVE', 'THIS', 'WILL', 'YOUR', 'FROM', 'THEY', 'KNOW', 'WANT', 'BEEN', 'GOOD',
      'MUCH', 'SOME', 'TIME', 'VERY', 'WHEN', 'COME', 'HERE', 'JUST', 'LIKE', 'LONG', 'MAKE', 'MANY',
      'OVER', 'SUCH', 'TAKE', 'THAN', 'THEM', 'WELL', 'WERE', 'WHAT', 'WORD', 'WORK', 'YEAR', 'BACK',
      'CALL', 'CAME', 'EACH', 'EVEN', 'FIND', 'GIVE', 'HAND', 'HIGH', 'KEEP', 'LAST', 'LEFT', 'LIFE',
      'LIVE', 'LOOK', 'MADE', 'MOVE', 'MUST', 'NAME', 'NEED', 'NEXT', 'OPEN', 'PART', 'PLAY', 'RIGHT',
      'SAID', 'SAME', 'SEEM', 'SHOW', 'SIDE', 'TELL', 'TURN', 'USED', 'WANT', 'WAYS', 'WEEK', 'WENT',
      'BOOK', 'DOOR', 'FACE', 'FACT', 'GAME', 'GIRL', 'HELP', 'HOME', 'HOPE', 'IDEA', 'KIND', 'LAND',
      'LINE', 'LIST', 'LOVE', 'MIND', 'MOON', 'NEAR', 'ONLY', 'PAGE', 'PLAN', 'ROOM', 'SHIP', 'STOP',
      'TALK', 'TEAM', 'TOWN', 'TREE', 'WALK', 'WALL', 'WIND', 'WOOD',
      // Common 5+ letter words
      'ABOUT', 'AFTER', 'AGAIN', 'ALONG', 'ALSO', 'AMONG', 'BEING', 'BELOW', 'BETWEEN', 'BOTH',
      'COULD', 'EVERY', 'FIRST', 'FOUND', 'GREAT', 'GROUP', 'HOUSE', 'LARGE', 'LIGHT', 'MIGHT',
      'NEVER', 'OTHER', 'PLACE', 'RIGHT', 'SHALL', 'SMALL', 'SOUND', 'STILL', 'THEIR', 'THERE',
      'THESE', 'THING', 'THINK', 'THREE', 'UNDER', 'UNTIL', 'WATER', 'WHERE', 'WHICH', 'WHILE',
      'WORLD', 'WOULD', 'WRITE', 'YOUNG', 'ABOVE', 'AGAIN', 'ALONE', 'BEGAN', 'BLACK', 'BRING',
      'BUILD', 'CARRY', 'CLEAN', 'CLOSE', 'COLOR', 'COULD', 'DOING', 'EARLY', 'EARTH', 'FIELD',
      'FINAL', 'FORCE', 'FRONT', 'GIVEN', 'GREEN', 'HAPPY', 'HEARD', 'HORSE', 'HUMAN', 'LATER',
      'LEARN', 'LEAVE', 'LEVEL', 'LOCAL', 'MONEY', 'MUSIC', 'NIGHT', 'NORTH', 'ORDER', 'PAPER',
      'PARTY', 'PEACE', 'POINT', 'POWER', 'PRESS', 'QUICK', 'QUITE', 'REACH', 'ROUND', 'SERVE',
      'SHALL', 'SHORT', 'SHOWN', 'SINCE', 'SPACE', 'SPEAK', 'SPEED', 'SPEND', 'START', 'STATE',
      'STORY', 'STUDY', 'TABLE', 'TODAY', 'TOTAL', 'TRADE', 'TRIED', 'TRULY', 'UNION', 'UNTIL',
      'USUAL', 'VALUE', 'VOICE', 'WATCH', 'WHOLE', 'WHOSE', 'WOMAN', 'WORDS', 'WORKS', 'WORTH',
      'WRITE', 'WROTE', 'YEARS', 'YOUNG',
      // Scrabble-specific high-value words
      'QUIZ', 'JAZZ', 'FIZZ', 'BUZZ', 'FUZZ', 'JINX', 'LYNX', 'ONYX', 'ORYX', 'CALYX',
      'HELIX', 'LATEX', 'LUXES', 'NEXUS', 'PIXEL', 'PYXIS', 'SIXTH', 'SIXTY', 'TOXIC',
      'VIXEN', 'WAXED', 'XERUS', 'XYLEM', 'YACHT', 'YEARN', 'YIELD', 'YOUTH', 'ZEBRA',
      'ZESTY', 'ZILCH', 'ZIPPY', 'ZONAL', 'ZONED', 'ZONES', 'ZOOMS',
    ];

    commonWords.forEach(word => this.dictionary.add(word.toUpperCase()));
  }

  /**
   * Validate if a word exists in the dictionary
   * @param {string} word - Word to validate
   * @returns {boolean} - True if word is valid
   */
  isValidWord(word) {
    if (!word || typeof word !== 'string') return false;
    return this.dictionary.has(word.toUpperCase().trim());
  }

  /**
   * Validate multiple words at once
   * @param {string[]} words - Array of words to validate
   * @returns {Object} - Object with validation results
   */
  validateWords(words) {
    if (!Array.isArray(words)) return { valid: [], invalid: [] };
    const valid = [];
    const invalid = [];
    words.forEach(word => {
      if (this.isValidWord(word)) {
        valid.push(word.toUpperCase());
      } else {
        invalid.push(word.toUpperCase());
      }
    });
    return { valid, invalid };
  }

  /**
   * Get dictionary statistics
   * @returns {Object} - Dictionary info
   */
  getStats() {
    return {
      totalWords: this.dictionary.size,
      isLoaded: this.isLoaded,
      memoryUsage: process.memoryUsage().heapUsed,
    };
  }

  /**
   * Search for words by pattern (for word suggestions)
   * @param {string} pattern - Search pattern (can include wildcards)
   * @param {number} limit - Maximum results to return
   * @returns {string[]} - Array of matching words
   */
  searchWords(pattern, limit = 10) {
    if (!pattern) return [];
    const regex = new RegExp(pattern.replace(/\*/g, '.*').toUpperCase());
    const matches = [];
    for (const word of this.dictionary) {
      if (regex.test(word) && matches.length < limit) {
        matches.push(word);
      }
    }
    return matches.sort();
  }
}

module.exports = new WordValidator();