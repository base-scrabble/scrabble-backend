// scripts/e2eSmoke.cjs
// End-to-end API smoke for Free Game:
//   create -> join -> start -> submit a real word placement -> pass-to-complete.
//
// Usage (PowerShell):
//   Push-Location .\scrabble-backend; $env:E2E_BASE_URL='http://127.0.0.1:8000/api'; node scripts\e2eSmoke.cjs; Pop-Location
//   Push-Location .\scrabble-backend; $env:E2E_BASE_URL='https://<backend-host>/api'; node scripts\e2eSmoke.cjs; Pop-Location

const fs = require('node:fs');
const path = require('node:path');

const BOARD_SIZE = 15;

const WORDLIST_PATH = path.join(__dirname, '..', 'data', 'wordlist.txt');
let __WORDS_2 = null;
let __SAW_429 = false;

function nowStamp() {
  return new Date().toISOString();
}

function shortDateStamp() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

function newRequestId() {
  return `e2e-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === '') return fallback;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) ? n : fallback;
}

async function maybePaceRequests() {
  const baseMs = envInt('E2E_HTTP_PACE_MS', 0) || (__SAW_429 ? envInt('E2E_HTTP_PACE_MS_ON_429', 250) : 0);
  if (!baseMs) return;
  const jitterMs = envInt('E2E_HTTP_PACE_JITTER_MS', 150);
  const extra = jitterMs > 0 ? Math.floor(Math.random() * (jitterMs + 1)) : 0;
  await sleep(baseMs + extra);
}

function isDeployPlaceholderHtml(text) {
  if (!text) return false;
  return (
    text.includes('Your service is almost ready!') ||
    text.includes('We are deploying your application')
  );
}

function snippet(text, max = 240) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function transientError(message, extra = {}) {
  const err = new Error(message);
  err.transient = true;
  Object.assign(err, extra);
  return err;
}

function isRetryableHttpStatus(status) {
  return status === 429 || status === 408 || status === 425 || status === 502 || status === 503 || status === 504;
}

function parseRetryAfterMs(headers) {
  if (!headers) return null;

  const retryAfter = headers.get?.('retry-after');
  if (retryAfter) {
    const asNumber = Number.parseInt(retryAfter, 10);
    if (!Number.isNaN(asNumber) && asNumber >= 0) return asNumber * 1000;
    const asDate = Date.parse(retryAfter);
    if (!Number.isNaN(asDate)) return Math.max(0, asDate - Date.now());
  }

  // express-rate-limit with standardHeaders emits RateLimit-* headers.
  // The draft spec defines RateLimit-Reset as seconds until reset.
  const reset = headers.get?.('ratelimit-reset');
  if (reset) {
    const asNumber = Number.parseFloat(reset);
    if (!Number.isNaN(asNumber) && asNumber >= 0) {
      // Heuristic: values larger than a day are probably an epoch.
      if (asNumber > 86_400) {
        const epochMs = asNumber > 10_000_000_000 ? asNumber : asNumber * 1000;
        return Math.max(0, epochMs - Date.now());
      }
      return asNumber * 1000;
    }
  }

  return null;
}

async function safeFetch(url, options) {
  try {
    return await fetch(url, options);
  } catch (e) {
    const code = e?.cause?.code || e?.code || null;
    throw transientError(`Network fetch failed (${options?.method || 'GET'} ${url})`, {
      cause: e,
      code,
    });
  }
}

async function withTransientRetry(fn, { label = 'request', timeoutMs = 120_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt += 1;
    try {
      return await fn();
    } catch (err) {
      const transient = Boolean(err?.transient);
      const expired = Date.now() >= deadline;
      if (!transient || expired) throw err;

      const maxDelayMs = Number.parseInt(process.env.E2E_HTTP_RETRY_MAX_DELAY_MS || '900000', 10);
      const baseDelayMs = Number.parseInt(process.env.E2E_HTTP_RETRY_BASE_DELAY_MS || '350', 10);
      const jitterMs = Math.floor(Math.random() * 250);
      const exp = Math.min(attempt - 1, 8);
      const suggested = typeof err?.retryAfterMs === 'number' ? err.retryAfterMs : null;
      const backoff = Math.min(baseDelayMs * 2 ** exp, maxDelayMs);
      const delayMs = Math.max(0, Math.min(suggested ?? backoff, maxDelayMs)) + jitterMs;

      const remainingMs = Math.max(0, deadline - Date.now());
      const effectiveDelayMs = Math.min(delayMs, remainingMs);

      const statusStr = err?.status ? ` status=${err.status}` : '';
      console.log(
        `${label}: transient failure${statusStr}, retrying in ${effectiveDelayMs}ms (attempt ${attempt})`,
      );
      await sleep(effectiveDelayMs);
    }
  }
}

async function readResponse(res) {
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // leave json null
  }
  return { text, json };
}

async function httpGet(url) {
  const res = await safeFetch(url, {
    headers: {
      'cache-control': 'no-cache',
      'x-client-request-id': newRequestId(),
    },
  });
  const { text, json } = await readResponse(res);
  if (isDeployPlaceholderHtml(text)) {
    throw transientError(`Backend is still deploying (GET ${url}, status ${res.status}).`, {
      bodySnippet: snippet(text),
    });
  }

  if (!res.ok && isRetryableHttpStatus(res.status)) {
    if (res.status === 429) __SAW_429 = true;
    throw transientError(`HTTP ${res.status} (GET ${url})`, {
      status: res.status,
      retryAfterMs: parseRetryAfterMs(res.headers),
      bodySnippet: snippet(text, 400),
    });
  }

  await maybePaceRequests();
  return { res, text, json };
}

async function httpPost(url, body) {
  const res = await safeFetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-client-request-id': newRequestId(),
    },
    body: JSON.stringify(body || {}),
  });
  const { text, json } = await readResponse(res);
  if (isDeployPlaceholderHtml(text)) {
    throw transientError(`Backend is still deploying (POST ${url}, status ${res.status}).`, {
      bodySnippet: snippet(text),
    });
  }

  if (!res.ok && isRetryableHttpStatus(res.status)) {
    if (res.status === 429) __SAW_429 = true;
    throw transientError(`HTTP ${res.status} (POST ${url})`, {
      status: res.status,
      retryAfterMs: parseRetryAfterMs(res.headers),
      bodySnippet: snippet(text, 400),
    });
  }

  await maybePaceRequests();
  return { res, text, json };
}

async function waitForHealthy(base, { timeoutMs = 300_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  let lastStatus = null;
  let lastSnippet = null;

  while (Date.now() < deadline) {
    attempt += 1;
    try {
      const { res, text, json } = await httpGet(`${base}/health`);
      lastStatus = res.status;
      lastSnippet = snippet(text);

      // Treat "ok + JSON" as ready. (Deploy-placeholder HTML is handled in httpGet.)
      if (res.ok && json) {
        console.log(`health: ${res.status}`);
        return { res, text, json };
      }

      console.log(`health: ${res.status} (waiting for JSON...)`);
    } catch (err) {
      if (!err?.transient) throw err;
      lastStatus = lastStatus ?? 'unknown';
      lastSnippet = err?.bodySnippet ?? lastSnippet;
      console.log(`health: not ready yet (attempt ${attempt})`);
    }

    const delayMs = Math.min(1500 * attempt, 10_000);
    await sleep(delayMs);
  }

  throw new Error(
    `Timed out waiting for prod service readiness at ${base}/health. LastStatus=${lastStatus} LastBody=${lastSnippet}`,
  );
}

function pickGameId(payload) {
  return (
    payload?.data?.gameState?.gameId ??
    payload?.data?.gameState?.id ??
    payload?.data?.gameId ??
    payload?.data?.id ??
    null
  );
}

function normalizeRack(rawRack) {
  if (!rawRack) return [];
  if (!Array.isArray(rawRack)) return [];
  return rawRack
    .map((t) => {
      if (t == null) return null;
      if (typeof t === 'string') return t;
      if (typeof t === 'object') {
        if (typeof t.letter === 'string') return t.letter;
        if (typeof t.value === 'string') return t.value;
      }
      return String(t);
    })
    .filter(Boolean)
    .map((s) => String(s).trim())
    .filter(Boolean)
    .map((s) => (s === '?' ? '?' : s.toUpperCase()));
}

function resolveCellToLetter(cell) {
  if (!cell) return null;
  if (typeof cell === 'string') {
    const s = cell.trim().toUpperCase();
    return /^[A-Z]$/.test(s) ? s : null;
  }
  if (typeof cell === 'object' && cell) {
    const s = String(cell.letter || '').trim().toUpperCase();
    return /^[A-Z]$/.test(s) ? s : null;
  }
  return null;
}

function inBounds(row, col) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function isEmptyCell(grid, row, col) {
  if (!inBounds(row, col)) return false;
  return !resolveCellToLetter(grid?.[row]?.[col]);
}

function listAnchors(grid) {
  const anchors = [];
  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      const letter = resolveCellToLetter(grid?.[r]?.[c]);
      if (letter) anchors.push({ row: r, col: c, letter });
    }
  }
  return anchors;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function loadTwoLetterWordSet() {
  if (__WORDS_2) return __WORDS_2;
  let contents = '';
  try {
    contents = fs.readFileSync(WORDLIST_PATH, 'utf8');
  } catch {
    contents = '';
  }
  const set = new Set();
  if (contents) {
    contents
      .split(/\r?\n/)
      .map((l) => l.trim().toUpperCase())
      .filter((w) => w.length === 2 && /^[A-Z]{2}$/.test(w))
      .forEach((w) => set.add(w));
  }
  // Fallback if wordlist cannot be read for any reason.
  if (set.size === 0) {
    ['AA', 'AE', 'AI', 'AL', 'AM', 'AN', 'AR', 'AS', 'AT', 'AW', 'AX', 'AY', 'BA', 'BE', 'BI', 'BO', 'BY', 'DA', 'DE', 'DO', 'ED', 'EF', 'EH', 'EL', 'EM', 'EN', 'ER', 'ES', 'ET', 'EW', 'EX', 'FA', 'FE', 'GO', 'HA', 'HE', 'HI', 'HM', 'HO', 'ID', 'IF', 'IN', 'IS', 'IT', 'JO', 'KA', 'KI', 'LA', 'LI', 'LO', 'MA', 'ME', 'MI', 'MM', 'MO', 'MU', 'MY', 'NA', 'NE', 'NO', 'NU', 'OD', 'OE', 'OF', 'OH', 'OI', 'OK', 'OM', 'ON', 'OP', 'OR', 'OS', 'OW', 'OX', 'OY', 'PA', 'PE', 'PI', 'QI', 'RE', 'SH', 'SI', 'SO', 'TA', 'TE', 'TI', 'TO', 'UH', 'UM', 'UN', 'UP', 'US', 'UT', 'WE', 'WO', 'XI', 'XU', 'YA', 'YE', 'YO']
      .forEach((w) => set.add(w));
  }
  __WORDS_2 = set;
  return __WORDS_2;
}

function tryConsumeLetterFromRack(rack, neededLetter) {
  const upper = String(neededLetter || '').toUpperCase();
  const idx = rack.findIndex((x) => x === upper);
  if (idx !== -1) {
    return { ok: true, rackLetter: upper, isBlank: false, letter: upper };
  }
  const blankIdx = rack.findIndex((x) => x === '?');
  if (blankIdx !== -1 && /^[A-Z]$/.test(upper)) {
    return { ok: true, rackLetter: '?', isBlank: true, letter: upper };
  }
  return { ok: false };
}

function buildTwoLetterMove(grid, rack) {
  const words2 = loadTwoLetterWordSet();
  const anchors = shuffleInPlace(listAnchors(grid));
  const rackLetters = normalizeRack(rack);

  // Try to create a *single-tile* placement that forms a 2-letter word
  // without creating any perpendicular cross-words.
  //
  // This greatly increases reliability for soak testing (we avoid long-word
  // placement search and cross-word cascades).
  for (const anchor of anchors) {
    const r = anchor.row;
    const c = anchor.col;
    const A = anchor.letter;

    // left of anchor: X A
    if (inBounds(r, c - 1) && isEmptyCell(grid, r, c - 1)
      && (!inBounds(r, c - 2) || isEmptyCell(grid, r, c - 2))
      && (!inBounds(r, c + 1) || isEmptyCell(grid, r, c + 1))
      && (!inBounds(r - 1, c - 1) || isEmptyCell(grid, r - 1, c - 1))
      && (!inBounds(r + 1, c - 1) || isEmptyCell(grid, r + 1, c - 1))) {
      for (const candidate of rackLetters) {
        if (candidate === '?') {
          for (let code = 65; code <= 90; code += 1) {
            const X = String.fromCharCode(code);
            if (!words2.has(`${X}${A}`)) continue;
            const consume = tryConsumeLetterFromRack(rackLetters, X);
            if (!consume.ok) continue;
            return [{
              row: r,
              col: c - 1,
              letter: consume.letter,
              rackLetter: consume.rackLetter,
              isBlank: consume.isBlank,
            }];
          }
        } else {
          const X = candidate;
          if (!words2.has(`${X}${A}`)) continue;
          const consume = tryConsumeLetterFromRack(rackLetters, X);
          if (!consume.ok) continue;
          return [{
            row: r,
            col: c - 1,
            letter: consume.letter,
            rackLetter: consume.rackLetter,
            isBlank: consume.isBlank,
          }];
        }
      }
    }

    // right of anchor: A X
    if (inBounds(r, c + 1) && isEmptyCell(grid, r, c + 1)
      && (!inBounds(r, c - 1) || isEmptyCell(grid, r, c - 1))
      && (!inBounds(r, c + 2) || isEmptyCell(grid, r, c + 2))
      && (!inBounds(r - 1, c + 1) || isEmptyCell(grid, r - 1, c + 1))
      && (!inBounds(r + 1, c + 1) || isEmptyCell(grid, r + 1, c + 1))) {
      for (const candidate of rackLetters) {
        if (candidate === '?') {
          for (let code = 65; code <= 90; code += 1) {
            const X = String.fromCharCode(code);
            if (!words2.has(`${A}${X}`)) continue;
            const consume = tryConsumeLetterFromRack(rackLetters, X);
            if (!consume.ok) continue;
            return [{
              row: r,
              col: c + 1,
              letter: consume.letter,
              rackLetter: consume.rackLetter,
              isBlank: consume.isBlank,
            }];
          }
        } else {
          const X = candidate;
          if (!words2.has(`${A}${X}`)) continue;
          const consume = tryConsumeLetterFromRack(rackLetters, X);
          if (!consume.ok) continue;
          return [{
            row: r,
            col: c + 1,
            letter: consume.letter,
            rackLetter: consume.rackLetter,
            isBlank: consume.isBlank,
          }];
        }
      }
    }

    // above anchor: X A
    if (inBounds(r - 1, c) && isEmptyCell(grid, r - 1, c)
      && (!inBounds(r - 2, c) || isEmptyCell(grid, r - 2, c))
      && (!inBounds(r + 1, c) || isEmptyCell(grid, r + 1, c))
      && (!inBounds(r - 1, c - 1) || isEmptyCell(grid, r - 1, c - 1))
      && (!inBounds(r - 1, c + 1) || isEmptyCell(grid, r - 1, c + 1))) {
      for (const candidate of rackLetters) {
        if (candidate === '?') {
          for (let code = 65; code <= 90; code += 1) {
            const X = String.fromCharCode(code);
            if (!words2.has(`${X}${A}`)) continue;
            const consume = tryConsumeLetterFromRack(rackLetters, X);
            if (!consume.ok) continue;
            return [{
              row: r - 1,
              col: c,
              letter: consume.letter,
              rackLetter: consume.rackLetter,
              isBlank: consume.isBlank,
            }];
          }
        } else {
          const X = candidate;
          if (!words2.has(`${X}${A}`)) continue;
          const consume = tryConsumeLetterFromRack(rackLetters, X);
          if (!consume.ok) continue;
          return [{
            row: r - 1,
            col: c,
            letter: consume.letter,
            rackLetter: consume.rackLetter,
            isBlank: consume.isBlank,
          }];
        }
      }
    }

    // below anchor: A X
    if (inBounds(r + 1, c) && isEmptyCell(grid, r + 1, c)
      && (!inBounds(r - 1, c) || isEmptyCell(grid, r - 1, c))
      && (!inBounds(r + 2, c) || isEmptyCell(grid, r + 2, c))
      && (!inBounds(r + 1, c - 1) || isEmptyCell(grid, r + 1, c - 1))
      && (!inBounds(r + 1, c + 1) || isEmptyCell(grid, r + 1, c + 1))) {
      for (const candidate of rackLetters) {
        if (candidate === '?') {
          for (let code = 65; code <= 90; code += 1) {
            const X = String.fromCharCode(code);
            if (!words2.has(`${A}${X}`)) continue;
            const consume = tryConsumeLetterFromRack(rackLetters, X);
            if (!consume.ok) continue;
            return [{
              row: r + 1,
              col: c,
              letter: consume.letter,
              rackLetter: consume.rackLetter,
              isBlank: consume.isBlank,
            }];
          }
        } else {
          const X = candidate;
          if (!words2.has(`${A}${X}`)) continue;
          const consume = tryConsumeLetterFromRack(rackLetters, X);
          if (!consume.ok) continue;
          return [{
            row: r + 1,
            col: c,
            letter: consume.letter,
            rackLetter: consume.rackLetter,
            isBlank: consume.isBlank,
          }];
        }
      }
    }
  }

  return null;
}

function canFormWordFromRack(word, rackCounts, blankCount) {
  let blanksLeft = blankCount;
  for (const ch of word) {
    const have = rackCounts.get(ch) || 0;
    if (have > 0) {
      rackCounts.set(ch, have - 1);
      continue;
    }
    if (blanksLeft > 0) {
      blanksLeft -= 1;
      continue;
    }
    return false;
  }
  return true;
}

function chooseWordFromRack(rack) {
  const wordlistPath = path.join(__dirname, '..', 'data', 'wordlist.txt');
  const contents = fs.readFileSync(wordlistPath, 'utf8');
  const lines = contents.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const letters = rack.filter((x) => x !== '?');
  const blankCount = rack.filter((x) => x === '?').length;
  const maxLen = rack.length;

  // Prefer short words to reduce edge-case placement issues.
  const candidates = lines
    .map((w) => w.toUpperCase())
    .filter((w) => w.length >= 2 && w.length <= maxLen && /^[A-Z]+$/.test(w))
    .sort((a, b) => a.length - b.length);

  const baseCounts = new Map();
  for (const ch of letters) baseCounts.set(ch, (baseCounts.get(ch) || 0) + 1);

  for (const word of candidates) {
    const countsCopy = new Map(baseCounts);
    if (canFormWordFromRack(word, countsCopy, blankCount)) {
      return word;
    }
  }
  return null;
}

function computeFirstMoveStartCol(wordLen) {
  // Board is 15x15, center is (7,7). Must cover col 7.
  // Choose a start col such that: startCol <= 7 <= startCol+len-1 and fits on board.
  const center = 7;
  let startCol = center - Math.floor(wordLen / 2);
  if (startCol < 0) startCol = 0;
  if (startCol + wordLen > 15) startCol = 15 - wordLen;
  // Ensure center is covered; if not, force to align ending at center.
  if (!(startCol <= center && center <= startCol + wordLen - 1)) {
    startCol = Math.max(0, center - (wordLen - 1));
  }
  return startCol;
}

function buildPlacementsForWord(word, rack) {
  const row = 7;
  const startCol = computeFirstMoveStartCol(word.length);

  const rackCounts = new Map();
  let blanksLeft = 0;
  for (const t of rack) {
    if (t === '?') {
      blanksLeft += 1;
    } else {
      rackCounts.set(t, (rackCounts.get(t) || 0) + 1);
    }
  }

  const placements = [];
  for (let i = 0; i < word.length; i += 1) {
    const letter = word[i];
    const have = rackCounts.get(letter) || 0;
    if (have > 0) {
      rackCounts.set(letter, have - 1);
      placements.push({
        row,
        col: startCol + i,
        letter,
        rackLetter: letter,
        isBlank: false,
      });
      continue;
    }
    if (blanksLeft > 0) {
      blanksLeft -= 1;
      placements.push({
        row,
        col: startCol + i,
        letter,
        rackLetter: '?',
        isBlank: true,
      });
      continue;
    }
    throw new Error(`Cannot build placements: missing letter ${letter} in rack`);
  }

  return placements;
}

async function getState(base, gameId, playerName) {
  const qs = playerName ? `?playerName=${encodeURIComponent(playerName)}` : '';
  const state = await withTransientRetry(
    () => httpGet(`${base}/gameplay/${encodeURIComponent(gameId)}${qs}`),
    { label: `getState(${playerName || 'anon'})`, timeoutMs: envInt('E2E_HTTP_TIMEOUT_STATE_MS', 1_200_000) },
  );
  if (!state.res.ok) {
    throw new Error(`getState failed ${state.res.status}: ${state.text}`);
  }
  return state.json?.data?.gameState || state.json?.data || null;
}

async function doSkip(base, gameId, playerName, label) {
  const move = await withTransientRetry(
    () => httpPost(`${base}/gameplay/${encodeURIComponent(gameId)}/skip`, { playerName }),
    { label, timeoutMs: envInt('E2E_HTTP_TIMEOUT_MOVE_MS', 1_200_000) },
  );
  if (!move.res.ok) throw new Error(`${label} failed ${move.res.status}: ${move.text}`);
  return move.json?.data?.gameState || null;
}

async function doPlace(base, gameId, playerName, placements, label) {
  const move = await withTransientRetry(
    () => httpPost(`${base}/gameplay/${encodeURIComponent(gameId)}/move`, { playerName, placements }),
    { label, timeoutMs: envInt('E2E_HTTP_TIMEOUT_MOVE_MS', 1_200_000) },
  );
  if (!move.res.ok) {
    const msg = move.json?.message || move.text;
    const err = new Error(`${label} failed ${move.res.status}: ${snippet(msg, 400)}`);
    err.status = move.res.status;
    err.body = move.text;
    throw err;
  }
  return move.json?.data?.gameState || null;
}

async function doExchange(base, gameId, playerName, exchanged, label) {
  const move = await withTransientRetry(
    () => httpPost(`${base}/gameplay/${encodeURIComponent(gameId)}/move`, { playerName, exchanged }),
    { label, timeoutMs: envInt('E2E_HTTP_TIMEOUT_MOVE_MS', 1_200_000) },
  );
  if (!move.res.ok) throw new Error(`${label} failed ${move.res.status}: ${move.text}`);
  return move.json?.data?.gameState || null;
}

function pickRandomSubset(arr, n) {
  const copy = [...arr];
  shuffleInPlace(copy);
  return copy.slice(0, Math.max(0, Math.min(n, copy.length)));
}

async function playHumanLikeGame({ base, gameId, p1, p2, initialRackP1 }) {
  const minPlacementsPerPlayer = Number.parseInt(process.env.E2E_MIN_PLACEMENTS_PER_PLAYER || '2', 10);
  const allowEarlyPasses = ['1', 'true', 'yes'].includes(String(process.env.E2E_ALLOW_EARLY_PASSES || '').toLowerCase());
  const passProb = Number.parseFloat(process.env.E2E_PASS_PROB || '0.25');
  const endPassesTarget = Number.parseInt(process.env.E2E_END_PASSES || '6', 10);
  const maxTurns = Number.parseInt(process.env.E2E_MAX_TURNS || '80', 10);

  // With minPlacementsPerPlayer=2 and p1 placing first, we naturally reach 4 total placements
  // (p1: 2 placements, p2: 2 placements) before ending via passes.
  const minTotalPlacements = Number.parseInt(
    process.env.E2E_MIN_TOTAL_PLACEMENTS || String(Math.max(1, minPlacementsPerPlayer) * 2),
    10,
  );

  const placementsByPlayer = { [p1]: 0, [p2]: 0 };

  // First move: p1 places a real word covering center (reuses the old logic).
  const chosenWord = chooseWordFromRack(initialRackP1);
  if (!chosenWord) {
    throw new Error(`No valid word found from rack (${initialRackP1.join('')}). Cannot test placement.`);
  }
  const firstPlacements = buildPlacementsForWord(chosenWord, initialRackP1);
  console.log(`Submitting first word: ${chosenWord} placements=${firstPlacements.length}`);
  const afterFirst = await doPlace(base, gameId, p1, firstPlacements, 'move(place:first)');
  placementsByPlayer[p1] += 1;
  console.log(`move(place:first): ok -> status=${afterFirst?.status} currentTurn=${afterFirst?.currentTurn}`);
  if (afterFirst?.status === 'completed') return;

  // Early/mid game: alternate turns, ensure both players place words multiple times.
  // By default we do NOT pass before we have enough real placements.
  for (let turn = 1; turn <= maxTurns; turn += 1) {
    const stateAnon = await getState(base, gameId, null);
    const status = stateAnon?.status;
    const passesInRow = stateAnon?.passesInRow || 0;
    const currentTurn = stateAnon?.currentTurn;
    const currentPlayer = currentTurn === 2 ? p2 : p1;

    if (status === 'completed') {
      console.log('Game completed ✅');
      return;
    }

    const stateForPlayer = await getState(base, gameId, currentPlayer);
    const rack = normalizeRack(stateForPlayer?.rack || stateForPlayer?.gameState?.rack || stateForPlayer?.data?.rack);
    const grid = stateForPlayer?.boardState || stateForPlayer?.gameState?.boardState;

    const totalPlacements = (placementsByPlayer[p1] || 0) + (placementsByPlayer[p2] || 0);
    const placementTargetsMet =
      (placementsByPlayer[p1] || 0) >= minPlacementsPerPlayer &&
      (placementsByPlayer[p2] || 0) >= minPlacementsPerPlayer &&
      totalPlacements >= minTotalPlacements;

    // Once we've seen enough valid word placements between both players, move to endgame passes.
    if (placementTargetsMet && passesInRow === 0) {
      console.log(`Placement targets met (totalPlacements=${totalPlacements}). Proceeding to endgame passes...`);
      break;
    }

    const needsPlacements = placementsByPlayer[currentPlayer] < minPlacementsPerPlayer;
    const canRandomPass = allowEarlyPasses && !needsPlacements && passesInRow < 2;
    const shouldPass = canRandomPass && Math.random() < passProb;

    if (shouldPass) {
      const afterPass = await doSkip(base, gameId, currentPlayer, `skip(early:${turn})`);
      console.log(
        `turn ${turn}: pass by ${currentPlayer} -> status=${afterPass?.status} passesInRow=${afterPass?.passesInRow} currentTurn=${afterPass?.currentTurn}`,
      );
      continue;
    }

    // Try to place a short, low-risk 2-letter word via a single tile adjacent to existing tiles.
    let didPlace = false;
    const attempts = 18;
    for (let a = 1; a <= attempts; a += 1) {
      const placements = buildTwoLetterMove(grid, rack);
      if (!placements) break;
      try {
        const afterPlace = await doPlace(base, gameId, currentPlayer, placements, `move(place:${turn}:${a})`);
        placementsByPlayer[currentPlayer] += 1;
        didPlace = true;
        const words = Array.isArray(afterPlace?.lastMove?.placements) ? afterPlace.lastMove.placements.length : placements.length;
        console.log(
          `turn ${turn}: place by ${currentPlayer} tiles=${words} -> status=${afterPlace?.status} passesInRow=${afterPlace?.passesInRow} currentTurn=${afterPlace?.currentTurn}`,
        );
        break;
      } catch (err) {
        // If it's a move validation error (400/409), try another anchor.
        if (err?.status === 400 || err?.status === 409) {
          continue;
        }
        throw err;
      }
    }

    if (didPlace) continue;

    // Fallback: exchange a couple tiles (human-like), then continue.
    // Keep it small to avoid accelerating pass-limit completion.
    if (Array.isArray(rack) && rack.length) {
      const exchange = pickRandomSubset(rack, Math.min(2, rack.length));
      const afterEx = await doExchange(base, gameId, currentPlayer, exchange, `move(exchange:${turn})`);
      console.log(
        `turn ${turn}: exchange by ${currentPlayer} count=${exchange.length} -> status=${afterEx?.status} passesInRow=${afterEx?.passesInRow} currentTurn=${afterEx?.currentTurn}`,
      );
      continue;
    }

    // Last resort: pass.
    const afterPass = await doSkip(base, gameId, currentPlayer, `skip(fallback:${turn})`);
    console.log(
      `turn ${turn}: pass by ${currentPlayer} (fallback) -> status=${afterPass?.status} passesInRow=${afterPass?.passesInRow} currentTurn=${afterPass?.currentTurn}`,
    );
  }

  // Endgame: 6 consecutive passes should end the game.
  for (let i = 1; i <= endPassesTarget; i += 1) {
    const stateAnon = await getState(base, gameId, null);
    if (stateAnon?.status === 'completed') {
      console.log('Game completed ✅');
      return;
    }
    const currentPlayer = stateAnon?.currentTurn === 2 ? p2 : p1;
    const afterPass = await doSkip(base, gameId, currentPlayer, `skip(end:${i})`);
    console.log(
      `end ${i}: pass by ${currentPlayer} -> status=${afterPass?.status} passesInRow=${afterPass?.passesInRow} currentTurn=${afterPass?.currentTurn}`,
    );
    if (afterPass?.status === 'completed') {
      console.log('Game completed ✅');
      return;
    }
  }

  // If the server's pass-to-end rule ever changes, keep passing (but flag it clearly).
  console.warn(`Endgame did not complete after ${endPassesTarget} passes; continuing (cap 20).`);
  for (let i = endPassesTarget + 1; i <= 20; i += 1) {
    const stateAnon = await getState(base, gameId, null);
    if (stateAnon?.status === 'completed') {
      console.log('Game completed ✅');
      return;
    }
    const currentPlayer = stateAnon?.currentTurn === 2 ? p2 : p1;
    const afterPass = await doSkip(base, gameId, currentPlayer, `skip(end:${i})`);
    console.log(
      `end ${i}: pass by ${currentPlayer} -> status=${afterPass?.status} passesInRow=${afterPass?.passesInRow} currentTurn=${afterPass?.currentTurn}`,
    );
    if (afterPass?.status === 'completed') {
      console.log('Game completed ✅');
      return;
    }
  }

  throw new Error('Endgame pass loop did not complete the game (cap reached)');
}

async function main() {
  const base = (process.env.E2E_BASE_URL || 'http://127.0.0.1:8000/api').replace(/\/+$/, '');
  const mode = String(process.env.E2E_MODE || 'realistic').toLowerCase();
  const stamp = shortDateStamp();
  const p1 = `zz_dbg_${stamp}_p1`;
  const p2 = `zz_dbg_${stamp}_p2`;

  console.log(`[${nowStamp()}] E2E base = ${base}`);

  // 0) Health (some hosts can temporarily serve HTML during deploy; wait a bit.)
  await waitForHealthy(base);

  // 1) Create
  const created = await withTransientRetry(
    () => httpPost(`${base}/gameplay/create`, { playerName: p1, playerAddress: null }),
    { label: 'create', timeoutMs: envInt('E2E_HTTP_TIMEOUT_SETUP_MS', 300_000) },
  );
  console.log(`create: ${created.res.status}`);
  if (!created.res.ok) throw new Error(`create failed ${created.res.status}: ${created.text}`);

  const gameId = pickGameId(created.json);
  if (!gameId) throw new Error(`create: could not find gameId in response: ${created.text.slice(0, 400)}`);

  console.log(`Created gameId=${gameId} p1=${p1}`);

  const rack = normalizeRack(created.json?.data?.gameState?.rack || created.json?.data?.rack);
  if (!rack.length) {
    throw new Error(`create: rack missing/empty; cannot test word placement. Response: ${created.text.slice(0, 400)}`);
  }
  console.log(`Initial rack (${rack.length}): ${rack.join('')}`);

  // 2) Join p2
  const joined = await withTransientRetry(
    () =>
      httpPost(`${base}/gameplay/${encodeURIComponent(gameId)}/join`, {
        playerName: p2,
        playerAddress: null,
      }),
    { label: 'join', timeoutMs: envInt('E2E_HTTP_TIMEOUT_SETUP_MS', 300_000) },
  );
  console.log(`join: ${joined.res.status}`);
  if (!joined.res.ok) throw new Error(`join failed ${joined.res.status}: ${joined.text}`);

  // 3) Start
  const started = await withTransientRetry(
    () => httpPost(`${base}/gameplay/${encodeURIComponent(gameId)}/start`, {}),
    { label: 'start', timeoutMs: envInt('E2E_HTTP_TIMEOUT_SETUP_MS', 300_000) },
  );
  console.log(`start: ${started.res.status}`);
  if (!started.res.ok) throw new Error(`start failed ${started.res.status}: ${started.text}`);

  if (mode === 'simple') {
    // Old behavior: 1 word then pass-to-complete.
    const chosenWord = chooseWordFromRack(rack);
    if (!chosenWord) {
      throw new Error(`No valid word found from rack (${rack.join('')}). Cannot test placement.`);
    }
    const placements = buildPlacementsForWord(chosenWord, rack);
    console.log(`Submitting word: ${chosenWord} placements=${placements.length}`);
    const placed = await withTransientRetry(
      () =>
        httpPost(`${base}/gameplay/${encodeURIComponent(gameId)}/move`, {
          playerName: p1,
          placements,
        }),
      { label: 'move(place)', timeoutMs: envInt('E2E_HTTP_TIMEOUT_MOVE_MS', 900_000) },
    );
    console.log(`move(place): ${placed.res.status}`);
    if (!placed.res.ok) throw new Error(`move(place) failed ${placed.res.status}: ${placed.text}`);
    const afterPlaceStatus = placed.json?.data?.gameState?.status;
    const afterPlaceTurn = placed.json?.data?.gameState?.currentTurn;
    console.log(`After placement -> status=${afterPlaceStatus} currentTurn=${afterPlaceTurn}`);

    let currentPlayer = p2;
    for (let i = 1; i <= 10; i += 1) {
      const move = await withTransientRetry(
        () =>
          httpPost(`${base}/gameplay/${encodeURIComponent(gameId)}/skip`, {
            playerName: currentPlayer,
          }),
        { label: `skip(turn ${i})`, timeoutMs: envInt('E2E_HTTP_TIMEOUT_MOVE_MS', 900_000) },
      );

      if (!move.res.ok) {
        throw new Error(
          `skip failed turn ${i} (${currentPlayer}) ${move.res.status}: ${move.text}`,
        );
      }

      const status = move.json?.data?.gameState?.status ?? null;
      const passesInRow = move.json?.data?.gameState?.passesInRow ?? null;
      const currentTurn = move.json?.data?.gameState?.currentTurn ?? null;

      console.log(
        `turn ${i}: pass by ${currentPlayer} -> status=${status} passesInRow=${passesInRow} currentTurn=${currentTurn}`,
      );

      if (status === 'completed') {
        console.log('Game completed ✅');
        break;
      }

      currentPlayer = currentPlayer === p1 ? p2 : p1;
    }
  } else {
    console.log(`E2E mode: realistic (multi-move + intermittent passes)`);
    await playHumanLikeGame({ base, gameId, p1, p2, initialRackP1: rack });
  }

  // 6) Final state
  const finalState = await withTransientRetry(
    () => httpGet(`${base}/gameplay/${encodeURIComponent(gameId)}?playerName=${encodeURIComponent(p1)}`),
    { label: 'final getState', timeoutMs: envInt('E2E_HTTP_TIMEOUT_STATE_MS', 1_200_000) },
  );
  console.log(`final getState: ${finalState.res.status}`);
  console.log(finalState.text.slice(0, 700));

  console.log('E2E smoke finished ✅');

  // Small delay between game runs to avoid hammering rate limits when running in a loop.
  const postGameSleepMs = envInt('E2E_POST_GAME_SLEEP_MS', 250);
  const postGameJitterMs = envInt('E2E_POST_GAME_JITTER_MS', 250);
  const baseSleep = __SAW_429 ? Math.max(postGameSleepMs, envInt('E2E_POST_GAME_SLEEP_MS_ON_429', 1500)) : postGameSleepMs;
  const extra = postGameJitterMs > 0 ? Math.floor(Math.random() * (postGameJitterMs + 1)) : 0;
  if (baseSleep > 0) {
    await sleep(baseSleep + extra);
  }
}

main().catch((err) => {
  console.error('E2E smoke failed ❌');
  console.error(err?.stack || err?.message || err);
  process.exitCode = 1;
});
