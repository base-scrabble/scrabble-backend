// scripts/e2eSmoke.cjs
// End-to-end API smoke for Free Game:
//   create -> join -> start -> submit a real word placement -> pass-to-complete.
//
// Usage (PowerShell):
//   Push-Location .\scrabble-backend; $env:E2E_BASE_URL='http://127.0.0.1:8000/api'; node scripts\e2eSmoke.cjs; Pop-Location
//   Push-Location .\scrabble-backend; $env:E2E_BASE_URL='https://<koyeb-app>.koyeb.app/api'; node scripts\e2eSmoke.cjs; Pop-Location

const fs = require('node:fs');
const path = require('node:path');

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

function isKoyebDeployHtml(text) {
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

      const delayMs = Math.min(1000 * attempt, 5_000);
      console.log(`${label}: transient failure, retrying in ${delayMs}ms (attempt ${attempt})`);
      await sleep(delayMs);
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
  if (isKoyebDeployHtml(text)) {
    throw transientError(`Koyeb is still deploying (GET ${url}, status ${res.status}).`, {
      bodySnippet: snippet(text),
    });
  }
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
  if (isKoyebDeployHtml(text)) {
    throw transientError(`Koyeb is still deploying (POST ${url}, status ${res.status}).`, {
      bodySnippet: snippet(text),
    });
  }
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

      // Treat "ok + JSON" as ready. (Koyeb deploy page is handled in httpGet.)
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

async function main() {
  const base = (process.env.E2E_BASE_URL || 'http://127.0.0.1:8000/api').replace(/\/+$/, '');
  const stamp = shortDateStamp();
  const p1 = `zz_dbg_${stamp}_p1`;
  const p2 = `zz_dbg_${stamp}_p2`;

  console.log(`[${nowStamp()}] E2E base = ${base}`);

  // 0) Health (Koyeb can temporarily serve HTML during deploy; wait a bit.)
  await waitForHealthy(base);

  // 1) Create
  const created = await withTransientRetry(
    () => httpPost(`${base}/gameplay/create`, { playerName: p1, playerAddress: null }),
    { label: 'create', timeoutMs: 120_000 },
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
    { label: 'join', timeoutMs: 120_000 },
  );
  console.log(`join: ${joined.res.status}`);
  if (!joined.res.ok) throw new Error(`join failed ${joined.res.status}: ${joined.text}`);

  // 3) Start
  const started = await withTransientRetry(
    () => httpPost(`${base}/gameplay/${encodeURIComponent(gameId)}/start`, {}),
    { label: 'start', timeoutMs: 120_000 },
  );
  console.log(`start: ${started.res.status}`);
  if (!started.res.ok) throw new Error(`start failed ${started.res.status}: ${started.text}`);

  // 4) Submit a real word placement from p1 (covers center)
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
    { label: 'move(place)', timeoutMs: 300_000 },
  );
  console.log(`move(place): ${placed.res.status}`);
  if (!placed.res.ok) throw new Error(`move(place) failed ${placed.res.status}: ${placed.text}`);
  const afterPlaceStatus = placed.json?.data?.gameState?.status;
  const afterPlaceTurn = placed.json?.data?.gameState?.currentTurn;
  console.log(`After placement -> status=${afterPlaceStatus} currentTurn=${afterPlaceTurn}`);

  // 5) Alternate pass turns until completed (ensures endgame + submit path stays healthy)
  let currentPlayer = p2;
  for (let i = 1; i <= 10; i += 1) {
    const move = await withTransientRetry(
      () =>
        httpPost(`${base}/gameplay/${encodeURIComponent(gameId)}/skip`, {
          playerName: currentPlayer,
        }),
      { label: `skip(turn ${i})`, timeoutMs: 120_000 },
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

  // 6) Final state
  const finalState = await withTransientRetry(
    () => httpGet(`${base}/gameplay/${encodeURIComponent(gameId)}?playerName=${encodeURIComponent(p1)}`),
    { label: 'final getState', timeoutMs: 120_000 },
  );
  console.log(`final getState: ${finalState.res.status}`);
  console.log(finalState.text.slice(0, 700));

  console.log('E2E smoke finished ✅');
}

main().catch((err) => {
  console.error('E2E smoke failed ❌');
  console.error(err?.stack || err?.message || err);
  process.exitCode = 1;
});
