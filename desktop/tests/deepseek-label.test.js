'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
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

function assertDeepSeekRow(source, file) {
  const row = source.match(/<tr><td>04<\/td>[\s\S]*?<\/tr>/)?.[0];
  assert.ok(row, `${file}: missing DeepSeek row`);
  assert.ok(row.includes(`<td>${label}</td>`), `${file}: name drift`);
  assert.ok(row.includes('<code>%USERPROFILE%\\.dsh</code>'), `${file}: missing Windows home`);
  assert.ok(row.includes('<code>~/.dsh</code>'), `${file}: missing macOS/Linux home`);
  assert.ok(row.includes('<code>skills/cha-deepseek/SKILL.md</code>'), `${file}: missing skill path`);
}

test('repository home pages keep the same DeepSeek name and paths', () => {
  for (const file of ['README.md', 'docs/index.html', 'docs/readme-preview.html']) {
    assertDeepSeekRow(fs.readFileSync(path.join(root, file), 'utf8'), file);
  }
});

test('generated previews preserve the canonical DeepSeek row and platform paths', (t) => {
  const temp = fs.realpathSync(os.tmpdir());
  const fixture = fs.mkdtempSync(path.join(temp, 'cc DeepSeek readme '));
  t.after(() => {
    assert.equal(path.dirname(fixture), temp);
    fs.rmSync(fixture, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(fixture, 'desktop'));
  for (const file of ['VERSION', 'README.md', 'desktop/package.json']) {
    fs.copyFileSync(path.join(root, file), path.join(fixture, file));
  }
  const original = fs.readFileSync(path.join(fixture, 'README.md'));
  const python = (process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'])
    .find((command) => spawnSync(command, ['--version'], { windowsHide: true }).status === 0);
  assert.ok(python, 'Python 3 is required to test generated DeepSeek documentation');
  const result = spawnSync(python, [path.join(root, 'tools/build_readme.py'), '--root', fixture], {
    cwd: fixture,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15000,
    env: { ...process.env, PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' },
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  for (const file of ['docs/index.html', 'docs/readme-preview.html']) {
    assertDeepSeekRow(fs.readFileSync(path.join(fixture, file), 'utf8'), `generated ${file}`);
  }
  assert.deepEqual(fs.readFileSync(path.join(fixture, 'README.md')), original);
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
