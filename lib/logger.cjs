const fs = require('fs');
const path = require('path');

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];
const LOG_DIR = path.resolve(__dirname, '..');
const LOG_FILE = path.join(LOG_DIR, 'backend.log');

let stream;

function ensureStream() {
  if (!stream) {
    stream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
    stream.on('error', (err) => {
      console.error('Logger stream error:', err);
    });
  }
  return stream;
}

function formatMeta(meta) {
  if (!meta) return '';
  try {
    return JSON.stringify(meta, (key, value) => {
      if (value instanceof Error) {
        return { message: value.message, stack: value.stack };
      }
      if (typeof value === 'bigint') {
        return value.toString();
      }
      if (typeof value === 'function') {
        return undefined;
      }
      return value;
    });
  } catch (err) {
    return `"<meta serialization failed: ${err.message}>"`;
  }
}

function write(level, message, meta) {
  const timestamp = new Date().toISOString();
  const payload = { level, message, timestamp };
  if (meta && Object.keys(meta).length) {
    payload.meta = meta;
  }
  const line = `${timestamp} [${level.toUpperCase()}] ${message}${meta ? ` ${formatMeta(meta)}` : ''}`;
  const writable = ensureStream();
  writable.write(`${line}\n`);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

const logger = {
  debug: (message, meta) => write('debug', message, meta),
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta),
};

module.exports = logger;
