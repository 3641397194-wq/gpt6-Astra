'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

for (const relative of ['README.md', 'docs/index.html', 'docs/readme-preview.html', 'tools/build_readme.py']) {
  test(`${relative} preserves official client brand names with translation-resistant markup`, () => {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    for (const brand of ['WorkBuddy', 'Cursor']) {
      assert.ok(source.includes(`<td><code translate="no">${brand}</code></td>`), `${relative}: unprotected ${brand} table label`);
    }
    assert.doesNotMatch(source, /<td>(?:WorkBuddy|Cursor|工作伙伴|光标)<\/td>/, `${relative}: a client name is exposed to literal translation`);
    assert.doesNotMatch(source, /包括 Cursor 的/, `${relative}: inline Cursor name is unprotected`);
    for (const target of ['~/.workbuddy', '~/.cursor', 'skills/cha-workbuddy/SKILL.md', 'rules/cha-cursor.mdc']) {
      assert.ok(source.includes(`<code>${target}</code>`), `${relative}: original install target changed: ${target}`);
    }
  });
}
