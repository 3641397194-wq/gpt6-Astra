'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../src/shared/workbench-core');
const engine = require('../src/lib/prompt-engine');
const beginner = require('../src/lib/beginner-install');
const mcp = require('../src/lib/ida-mcp');

const label = 'DeepSeek v4.1 Flash 10.17版本';
const root = path.resolve(__dirname, '../..');

test('DeepSeek display name is shared by desktop seats and beginner cards', () => {
  assert.equal(core.DEEPSEEK_LABEL, label);
  assert.equal(core.SEATS.find(seat => seat.id === 'deepseek').tag, label);
  const seat = engine.SEATS.find(seat => seat.id === 'deepseek');
  assert.equal(seat.tag, label);
  assert.equal(seat.name, label);
  assert.equal(seat.mark, '04');
  assert.equal(beginner.CARDS.deepseek.name, label);
  const [card] = beginner.scanAll({
    seats: ['deepseek'],
    detect: () => ({ root: path.join(root, 'desktop/work/fixture/.dsh'), exists: false, layout: 'deepseek-harness' }),
  });
  assert.equal(card.name, label);
  assert.equal(card.layout, 'deepseek-harness');
  assert.equal(mcp.clients({ home: root, env: {} }).find(client => client.id === 'deepseek').label, label);
});

test('repository home pages and their source template keep the same DeepSeek name and paths', () => {
  for (const file of ['README.md', 'docs/index.html', 'docs/readme-preview.html', 'tools/build_readme.py']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const row = source.match(/<tr><td>04<\/td>[\s\S]*?<\/tr>/)?.[0];
    assert.ok(row, `${file}: missing DeepSeek row`);
    assert.ok(row.includes(`<td>${label}</td>`), `${file}: name drift`);
    assert.ok(row.includes('%USERPROFILE%'), `${file}: missing Windows home`);
    assert.ok(row.includes('~/.dsh'), `${file}: missing macOS/Linux home`);
    assert.ok(row.includes('skills/cha-deepseek/SKILL.md'), `${file}: missing skill path`);
  }
});

test('DeepSeek model date stays separate from the desktop product name and release version', () => {
  const pkg = require('../package.json');
  assert.equal(pkg.productName, '冷咖啡破甲工作台');
  assert.equal(pkg.build.productName, pkg.productName);
  assert.equal(pkg.version, fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim());
  assert.ok(pkg.description.includes(label));
  assert.ok(engine.APP_TITLE.includes(label));
  assert.equal(core.SEATS.length, 11);
});
