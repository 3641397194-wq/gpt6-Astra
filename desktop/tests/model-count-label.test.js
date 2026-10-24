'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

test('public pages and the software hero label the release as fifteen AI models', () => {
  for (const relative of ['README.md', 'docs/index.html', 'docs/readme-preview.html', 'desktop/src/workbench/index.html']) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    assert.match(source, /十五个 AI 模型/, `${relative}: missing current model count label`);
  }
  assert.doesNotMatch(
    fs.readFileSync(path.join(root, 'desktop/src/workbench/index.html'), 'utf8'),
    /九模型席位/,
    'software hero still contains the stale nine-seat label',
  );
});
