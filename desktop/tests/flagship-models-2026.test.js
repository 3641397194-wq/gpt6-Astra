'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../src/shared/workbench-core');
const beginner = require('../src/lib/beginner-install');
const engine = require('../src/lib/prompt-engine');
const mcp = require('../src/lib/ida-mcp');
const relayModels = require('../src/shared/relay-models');
const { renderPack } = require('../src/lib/seat-packs');

const root = path.resolve(__dirname, '../..');

test('GLM 5.4 and 2026 flagship model labels are consistent across desktop seats, cards, MCP, and packs', () => {
  assert.equal(core.SEATS.find(seat => seat.id === 'glm53').tag, 'GLM 5.4全模型支持');
  assert.equal(beginner.CARDS.glm53.name, 'GLM 5.4');
  assert.equal(engine.SEATS.find(seat => seat.id === 'glm53').tag, 'GLM 5.4全模型支持');
  assert.equal(mcp.clients({ home: root, env: {} }).find(client => client.id === 'glm53').label, 'GLM 5.4 / ZCode');
  assert.match(renderPack('glm53'), /GLM 5\.4全模型支持/);

  assert.equal(core.SEATS.find(seat => seat.id === 'claude').tag, 'Claude Fable 5.2 / 全模型支持');
  assert.equal(core.SEATS.find(seat => seat.id === 'gemini').tag, 'Gemini 4 全模型支持');
  assert.equal(core.SEATS.find(seat => seat.id === 'doubao').tag, '豆包 2.1');
});

test('relay recommendation families recognize GLM-5.4, Claude Fable 5.2, and Gemini 4 while preserving exact IDs', () => {
  assert.equal(relayModels.label('glm-5.4'), 'GLM-5.4');
  assert.equal(relayModels.label('coldcoffee/GLM-5.4'), 'GLM-5.4');
  assert.equal(relayModels.label('claude-fable-5.2'), 'Claude Fable 5.2');
  assert.equal(relayModels.label('gemini-4-carbon'), 'Gemini 4');
  assert.equal(relayModels.label('gemini-4-neon'), 'Gemini 4');
  assert.equal(relayModels.prefer(['custom-v1', 'claude-fable-5.2', 'glm-5.4']), 'glm-5.4');
});

test('README and generated preview pages carry GLM 5.4 and updated 2026 model labels without stale GLM 5.3', () => {
  for (const relative of ['README.md', 'docs/index.html', 'docs/readme-preview.html']) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    assert.match(source, /GLM 5\.4全模型支持/, `${relative}: missing GLM 5.4 seat label`);
    assert.doesNotMatch(source, /GLM 5\.3/, `${relative}: stale GLM 5.3 label`);
    assert.match(source, /Claude Fable 5\.2/, `${relative}: missing Claude Fable 5.2`);
    assert.match(source, /Gemini 4/, `${relative}: missing Gemini 4`);
  }
});
