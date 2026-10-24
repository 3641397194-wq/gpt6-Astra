'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../src/shared/workbench-core');
const beginner = require('../src/lib/beginner-install');
const engine = require('../src/lib/prompt-engine');
const mcp = require('../src/lib/ida-mcp');
const { renderPack } = require('../src/lib/seat-packs');

const root = path.resolve(__dirname, '../..');
const label = 'MiniMax 3.1 Flash';

test('MiniMax 3.1 Flash is consistent across software surfaces', () => {
  assert.equal(core.SEATS.find(seat => seat.id === 'mimo').tag, label);
  assert.equal(beginner.CARDS.mimo.name, label);
  assert.equal(engine.SEATS.find(seat => seat.id === 'mimo').tag, label);
  assert.equal(mcp.clients({ home: root, env: {} }).find(client => client.id === 'mimo').label, label);
  assert.match(renderPack('mimo'), /MiniMax 3\.1 Flash/);
});

test('homepage surfaces use MiniMax 3.1 Flash and keep stable install paths', () => {
  for (const relative of ['README.md', 'docs/index.html', 'docs/readme-preview.html']) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    assert.match(source, /MiniMax 3\.1 Flash/, `${relative}: missing current label`);
    assert.doesNotMatch(source, /MiMo-V2\.6-Pro/, `${relative}: stale label`);
    assert.match(source, /\.config(?:\\|\/)mimocode/, `${relative}: missing stable data path`);
  }
});
