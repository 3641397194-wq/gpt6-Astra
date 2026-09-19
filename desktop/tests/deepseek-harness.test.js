'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const yaml = require('js-yaml');
const {SeatTransactions} = require('../src/lib/seat-transactions');
const {renderPack} = require('../src/lib/seat-packs');
const runtime = require('../src/lib/seat-runtime');
const repo = path.resolve(__dirname, '../..');
const base = path.join(repo, '.coldbrew', 'deepseek-harness-tests');
fs.mkdirSync(base, {recursive: true});

function fixture(fn) {
  const root = fs.mkdtempSync(path.join(base, 'case-'));
  try { return fn(root); }
  finally {
    assert.ok(path.resolve(root).startsWith(base + path.sep));
    fs.rmSync(root, {recursive: true, force: true});
  }
}

test('official Harness gets a bounded loader and a complete discoverable original skill', () => fixture(root => {
  const tx = new SeatTransactions();
  tx.select(root, {layout: 'deepseek-harness'});
  const plan = tx.preview('deepseek');
  assert.ok(plan.files.some(f => f.path === 'AGENTS.md'));
  assert.ok(plan.files.some(f => f.path === 'skills/cha-deepseek/SKILL.md'));
  assert.ok(plan.files.every(f => f.path === 'AGENTS.md' || /^skills\/[^/]+\/SKILL\.md$/.test(f.path)));
  const loader = tx.file(plan.id, plan.files.findIndex(f => f.path === 'AGENTS.md')).after;
  assert.ok(Buffer.byteLength(loader) < 2048);
  assert.match(loader, /冷咖啡/);
  assert.match(loader, /skill 工具加载 cha-deepseek/);
  for (const [index, file] of plan.files.entries()) {
    if (!file.path.endsWith('/SKILL.md')) continue;
    const text = tx.file(plan.id, index).after;
    const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    assert.ok(match, `${file.path}: valid frontmatter begins on line one`);
    const metadata = yaml.load(match[1]);
    assert.equal(metadata.name, file.path.split('/')[1]);
    assert.match(metadata.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(typeof metadata.description, 'string');
    assert.ok(metadata.description.length > 0);
  }
  const applied = tx.deploy(plan.id);
  assert.equal(fs.readFileSync(path.join(root, 'skills/cha-deepseek/SKILL.md'), 'utf8'), renderPack('deepseek'));
  assert.equal(tx.verify('deepseek').ok, true);
  fs.appendFileSync(path.join(root, 'skills/cha-deepseek/SKILL.md'), '\nchanged outside the app');
  assert.equal(tx.verify('deepseek').ok, false);
  assert.throws(() => tx.restore(applied.id), /其他操作/);
  fs.writeFileSync(path.join(root, 'skills/cha-deepseek/SKILL.md'), renderPack('deepseek'));
  tx.restore(applied.id);
  for (const file of plan.files) assert.equal(fs.existsSync(path.join(root, file.path)), false);
}));

test('Harness transactions retain existing instructions and restore exact bytes', () => fixture(root => {
  const original = Buffer.from('\uFEFF# customer notes\r\nKeep this instruction.\r\n');
  fs.writeFileSync(path.join(root, 'AGENTS.md'), original);
  const tx = new SeatTransactions();
  tx.select(root, {layout: 'deepseek-harness'});
  const applied = tx.deploy(tx.preview('deepseek').id);
  assert.ok(fs.readFileSync(path.join(root, 'AGENTS.md')).subarray(0, original.length).equals(original));
  assert.equal(tx.preview('deepseek').changes, 0);
  tx.restore(applied.id);
  assert.deepEqual(fs.readFileSync(path.join(root, 'AGENTS.md')), original);
}));

test('JavaScript and Python CLI use DSH_HOME and complete matching install/check/restore cycles', () => fixture(root => {
  const jsRoot = path.join(root, 'javascript');
  const pyRoot = path.join(root, 'python');
  const legacy = path.join(root, 'legacy');
  const hermes = path.join(root, 'hermes');
  fs.mkdirSync(jsRoot); fs.mkdirSync(pyRoot); fs.mkdirSync(legacy); fs.mkdirSync(hermes);
  fs.writeFileSync(path.join(jsRoot, 'AGENTS.md'), '# existing\n');
  fs.writeFileSync(path.join(pyRoot, 'AGENTS.md'), '# existing\n');
  const script = `const assert=require('node:assert/strict');const r=require('./desktop/src/lib/seat-runtime');const expected=process.argv[1];assert.equal(r.seatHomes().deepseek,expected);r.deploy('deepseek');assert.equal(r.verify('deepseek').ok,true);`;
  execFileSync(process.execPath, ['-e', script, jsRoot], {cwd: repo, env: {...process.env, DSH_HOME: jsRoot, DEEPSEEK_HOME: legacy, HERMES_HOME: hermes}});
  const pyScript = `import sys\nfrom pathlib import Path\nimport seats\nroot=Path(sys.argv[1])\nassert seats.resolve_seat('deepseek-v4.1-flash')=='deepseek'\nassert seats.seat_home('deepseek')==root\nseats.deploy('deepseek')\nassert seats.verify('deepseek')['ok']\n`;
  execFileSync('python', ['-c', pyScript, pyRoot], {cwd: repo, env: {...process.env, DSH_HOME: pyRoot, DEEPSEEK_HOME: legacy, HERMES_HOME: hermes}});
  const spec = runtime.plan('deepseek', jsRoot);
  for (const item of spec.writes) {
    const rel = path.relative(jsRoot, item.file);
    const jsText = fs.readFileSync(item.file, 'utf8').replaceAll('\r\n', '\n');
    const pyText = fs.readFileSync(path.join(pyRoot, rel), 'utf8').replaceAll('\r\n', '\n');
    assert.ok(jsText === pyText, `${rel}: both runtimes preserve matching text (platform newlines normalized)`);
  }
  assert.equal(fs.readFileSync(path.join(jsRoot, 'skills/cha-deepseek/SKILL.md'), 'utf8'), renderPack('deepseek'));
  runtime.restore('deepseek', jsRoot);
  execFileSync('python', ['-c', "import sys, seats; seats.restore('deepseek', sys.argv[1])", pyRoot], {cwd: repo});
  for (const dir of [jsRoot, pyRoot]) {
    assert.equal(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8'), '# existing\n');
    assert.equal(fs.existsSync(path.join(dir, 'skills/cha-deepseek/SKILL.md')), false);
  }
  assert.deepEqual(fs.readdirSync(legacy), []);
  assert.deepEqual(fs.readdirSync(hermes), []);
}));
