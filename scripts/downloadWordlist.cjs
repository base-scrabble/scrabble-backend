#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const https = require('https');

const TARGET_URL = process.env.WORDLIST_URL || 'https://raw.githubusercontent.com/dwyl/english-words/master/words.txt';
const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'wordlist.txt');

function download(url, destination) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination, { encoding: 'utf8' });
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close(() => resolve(destination));
      });
    }).on('error', (err) => {
      fs.unlink(destination, () => reject(err));
    });
  });
}

(async () => {
  try {
    console.log(`⬇️  Downloading word list from ${TARGET_URL}`);
    await download(TARGET_URL, OUTPUT_PATH);
    const stats = fs.statSync(OUTPUT_PATH);
    console.log(`✅ Saved word list to ${OUTPUT_PATH} (${stats.size.toLocaleString()} bytes)`);
  } catch (err) {
    console.error('❌ Failed to download word list:', err.message);
    process.exit(1);
  }
})();
