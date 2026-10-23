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
const label = 'Kimi K3.1';

test('Kimi K3.1 is consistent across the desktop seat, beginner card, MCP, and skill', () => {
  assert.equal(core.SEATS.find(seat => seat.id === 'kimi').tag, label);
  assert.equal(beginner.CARDS.kimi.name, label);
  assert.equal(engine.SEATS.find(seat => seat.id === 'kimi').tag, label);
  assert.equal(mcp.clients({ home: root, env: {} }).find(client => client.id === 'kimi').label, label);
  assert.match(renderPack('kimi'), /Kimi K3\.1/);
});

test('Kimi K3.1 is used in the README and both generated home pages', () => {
  for (const relative of ['README.md', 'docs/index.html', 'docs/readme-preview.html']) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    assert.match(source, /Kimi K3\.1/, `${relative}: missing current label`);
    assert.doesNotMatch(source, /Kimi K3(?!\.1)/, `${relative}: stale label`);
  }
});

test('Kimi data and skill paths remain stable while the display label changes', () => {
  const source = fs.readFileSync(path.join(root, 'desktop/src/lib/packs/kimi.md'), 'utf8');
  assert.match(source, /name: cha-kimi/);
  assert.match(source, /skills\/cha-kimi\/SKILL\.md/);
  assert.match(source, /Kimi K3\.1/);
  assert.match(source, /\.kimi-code/);
});
