'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const telegram = ['https://t.me/coolcoffeeai', 'https://t.me/chachachalkf'];
const groups = ['1057540028', '1077074552', '618179023'];
const { allowedExternalUrl } = require('../src/lib/external-links');

test('desktop links open the current relay and both Telegram entries without widening the host boundary', () => {
  for (const url of [...telegram, 'https://coldcoffeeai.com/', 'https://coldcoffeeai.com/keys', 'https://www.coldcoffeeai.com/', 'https://github.com/3641397194-wq/gpt6-Astra']) assert.equal(allowedExternalUrl(url), true, url);
  for (const url of ['http://t.me/coolcoffeeai', 'https://t.me/unlisted-group', 'https://t.me/coolcoffeeai?next=other', 'https://t.me/coolcoffeeai#other', 'https://t.me:444/coolcoffeeai', 'https://t.me.evil.invalid/coolcoffeeai', 'https://github.com.evil.invalid/', 'https://user:password@coldcoffeeai.com/', 'file:///example', 'javascript:alert(1)']) assert.equal(allowedExternalUrl(url), false, url);
});

for (const relative of ['README.md', 'README_EN.md', 'docs/index.html', 'docs/readme-preview.html']) {
  test(`${relative} preserves the current Telegram chat/channel and all three QQ groups`, () => {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    const links = [...source.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)].map((match) => match[1]);
    for (const url of telegram) assert.ok(links.includes(url), `${relative}: missing clickable community link ${url}`);
    for (const group of groups) assert.match(source, new RegExp(`\\b${group}\\b`), `${relative}: missing QQ group ${group}`);
  });
}
