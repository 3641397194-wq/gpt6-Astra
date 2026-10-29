'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const telegram = ['https://t.me/coolcoffeeai', 'https://t.me/chachachalkf'];
const groups = ['1057540028', '1077074552', '618179023'];

for (const relative of ['README.md', 'README_EN.md', 'docs/index.html', 'docs/readme-preview.html']) {
  test(`${relative} preserves the current Telegram chat/channel and all three QQ groups`, () => {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    const links = [...source.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]);
    for (const url of telegram) assert.ok(links.includes(url), `${relative}: missing clickable community link ${url}`);
    for (const group of groups) assert.match(source, new RegExp(`\\b${group}\\b`), `${relative}: missing QQ group ${group}`);
  });
}
