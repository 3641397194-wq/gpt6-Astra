'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { deepseekHarnessHome } = require('../src/lib/deepseek-home');
const { detectDirectory } = require('../src/lib/detect-directory');
const runtime = require('../src/lib/seat-runtime');
const { SeatTransactions } = require('../src/lib/seat-transactions');

const repoRoot = path.resolve(__dirname, '..', '..');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'cc-deepseek-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function withEnv(values, run) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function homeCases(paths, home, cwd) {
  return [
    { value: undefined, expected: paths.join(home, '.dsh') },
    { value: '', expected: paths.join(home, '.dsh') },
    { value: ' \t\r\n', expected: paths.join(home, '.dsh') },
    { value: '~', expected: home },
    { value: '~/harness', expected: paths.join(home, 'harness') },
    { value: '~\\harness', expected: paths.join(home, 'harness') },
    { value: '~//harness', expected: paths.join(home, 'harness') },
    { value: paths.join(home, 'absolute home'), expected: paths.join(home, 'absolute home') },
    { value: 'relative/home', expected: paths.resolve(cwd, 'relative/home') },
    { value: ' relative/home ', expected: paths.resolve(cwd, ' relative/home ') },
    { value: 'relative/trailing.', expected: paths.resolve(cwd, 'relative/trailing.') },
    { value: '~other/harness', expected: paths.resolve(cwd, '~other/harness') },
  ];
}

// Contract checked against deepseek-harness 0.2.1-rc.2, 687f282e:
// packages/util/home-paths, context/agent-instructions and skill/skill-filesystem.
for (const [platform, pathApi, home, cwd] of [
  ['Windows', path.win32, 'C:\\Users\\fixture', 'C:\\workspace'],
  ['macOS/Linux', path.posix, '/home/fixture', '/workspace'],
]) {
  test(`DeepSeek home resolution follows Harness on ${platform}`, () => {
    for (const { value, expected } of homeCases(pathApi, home, cwd)) {
      const env = { DSH_HOME: value, DSH_AGENTS_HOME: 'shared-agents', DEEPSEEK_HOME: 'legacy-home' };
      assert.equal(deepseekHarnessHome({ env, home, cwd, pathApi }), expected, JSON.stringify(value));
    }
    for (const override of ['', '~', '~/explicit', '~\\explicit', ' explicit ']) {
      const expected = override === '~' ? home : override.startsWith('~/') || override.startsWith('~\\')
        ? pathApi.join(home, override.slice(2)) : pathApi.resolve(cwd, override);
      assert.equal(deepseekHarnessHome({ env: { DSH_HOME: 'ignored' }, home, cwd, override, pathApi }), expected);
    }
  });
}

test('DeepSeek discovery and runtime use one native resolver without creating a home', t => {
  const root = fixture(t);
  const home = path.join(root, 'home');
  t.mock.method(os, 'homedir', () => home);
  for (const { value, expected } of homeCases(path, home, process.cwd())) {
    const env = { DSH_HOME: value, DSH_AGENTS_HOME: path.join(root, 'shared'), DEEPSEEK_HOME: path.join(root, 'legacy') };
    const detected = detectDirectory('deepseek', { env, home });
    assert.equal(detected.root, expected, JSON.stringify(value));
    assert.equal(detected.layout, 'deepseek-harness');
    assert.equal(detected.source, value?.trim() ? 'DSH_HOME' : 'DeepSeek 官方 Harness 配置目录');
    withEnv(env, () => {
      assert.equal(runtime.seatHomes().deepseek, expected);
      assert.equal(runtime.basePlan('deepseek').home, expected);
    });
  }
  assert.equal(fs.existsSync(home), false);
  assert.equal(fs.existsSync(path.join(root, 'shared')), false);
  const file = path.join(root, 'not-a-directory');
  fs.writeFileSync(file, 'fixture');
  assert.throws(() => detectDirectory('deepseek', { env: { DSH_HOME: file }, home }), /不是目录/);
  withEnv({ DSH_HOME: 'ignored' }, () => {
    assert.equal(runtime.basePlan('deepseek', '').home, process.cwd());
    assert.equal(runtime.basePlan('deepseek', '~/manual').home, path.join(home, 'manual'));
  });
});

function assertSkill(text, expectedName) {
  const header = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  assert.ok(header, `${expectedName}: frontmatter starts at the first line`);
  const name = header[1].match(/^name:\s*(.+)$/m)?.[1].trim();
  assert.equal(name, expectedName);
  assert.match(name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.ok(header[1].match(/^description:\s*(.+)$/m)?.[1].trim());
  assert.doesNotMatch(header[1], /^(?:disableModelInvocation|userInvocable):/m);
}

// These contract checks intentionally exercise only the original Harness word
// pack. Full upstream resources/configuration have independent integrity and
// transaction tests and are not repeatedly installed by this small fixture.
test('DeepSeek base plan keeps a short AGENTS loader and top-level discoverable skills', t => {
  const home = path.join(fixture(t), '.dsh');
  const spec = runtime.basePlan('deepseek', home);
  const entry = spec.writes.find(item => item.kind === 'marked');
  assert.equal(entry.file, path.join(home, 'AGENTS.md'));
  assert.match(entry.body, /skills\/cha-deepseek\/SKILL\.md/);
  assert.ok(Buffer.byteLength(entry.body) < 65536);
  assert.ok(Buffer.byteLength(spec.pack) > Buffer.byteLength(entry.body));
  assert.equal(spec.writes.filter(item => item.kind === 'marked').length, 1);
  for (const item of spec.writes.filter(item => item.kind !== 'marked')) {
    const relative = path.relative(home, item.file).replaceAll('\\', '/');
    assert.match(relative, /^skills\/[a-z0-9]+(?:-[a-z0-9]+)*\/SKILL\.md$/);
    assertSkill(item.kind === 'file' ? spec.pack : item.body, path.basename(path.dirname(item.file)));
  }
  assert.equal(fs.existsSync(home), false);
});

test('DeepSeek transactional deploy is idempotent and restores existing bytes', t => {
  const root = fixture(t);
  const home = path.join(root, '.dsh');
  const agents = path.join(home, 'AGENTS.md');
  const skill = path.join(home, 'skills', 'cha-deepseek', 'SKILL.md');
  const route = path.join(home, 'skills', 'cha-bin-unlock', 'SKILL.md');
  const profile = path.join(home, 'profiles', 'web', 'cordis.patch.yml');
  const shared = path.join(root, '.agents', 'AGENTS.md');
  const originals = new Map([
    [agents, Buffer.from('# Existing user instructions\r\nKeep this.\r\n')],
    [skill, Buffer.from('prior skill\r\n')],
    [route, Buffer.from('prior route\n')],
    [profile, Buffer.from('# existing profile\n')],
    [shared, Buffer.from('# shared agent instructions\n')],
  ]);
  for (const [file, content] of originals) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  const tx = new SeatTransactions({ plan: runtime.basePlan });
  tx.select(home, { layout: 'deepseek-harness' });
  const preview = tx.preview('deepseek');
  for (const [file, content] of originals) assert.deepEqual(fs.readFileSync(file), content);
  const installed = tx.deploy(preview.id);
  assert.equal(installed.ok, true);
  assert.equal(fs.existsSync(installed.backup), true);
  assert.equal(tx.verify('deepseek').ok, true);
  assert.equal(tx.preview('deepseek').changes, 0);
  assert.ok(fs.readFileSync(agents).subarray(0, originals.get(agents).length).equals(originals.get(agents)));
  assert.equal(fs.readFileSync(agents, 'utf8').split('<!-- CHA-DEEPSEEK-POJIA:BEGIN -->').length - 1, 1);
  assert.equal(fs.readFileSync(skill, 'utf8'), runtime.basePlan('deepseek', home).pack);
  for (const file of [profile, shared]) assert.deepEqual(fs.readFileSync(file), originals.get(file));
  assert.equal(fs.existsSync(path.join(root, '.agents', 'skills')), false);
  const restored = tx.restore(installed.id);
  assert.equal(restored.ok, true);
  for (const [file, content] of originals) assert.deepEqual(fs.readFileSync(file), content);
  for (const item of runtime.basePlan('deepseek', home).writes) {
    if (!originals.has(item.file)) assert.equal(fs.existsSync(item.file), false);
  }
});

test('DeepSeek legacy runtime deployment restores original files', t => {
  const home = path.join(fixture(t), '.dsh');
  const agents = path.join(home, 'AGENTS.md');
  fs.mkdirSync(home);
  const original = Buffer.from('# Keep my rules\r\n');
  fs.writeFileSync(agents, original);
  const installed = runtime.deploy('deepseek', home, { planFn: runtime.basePlan });
  assert.equal(runtime.verify('deepseek', home, { planFn: runtime.basePlan }).ok, true);
  assert.ok(installed.backups.length > 0);
  assert.equal(runtime.restore('deepseek', home, { planFn: runtime.basePlan }).ok, true);
  assert.deepEqual(fs.readFileSync(agents), original);
  assert.equal(fs.existsSync(path.join(home, 'skills', 'cha-deepseek', 'SKILL.md')), false);
});

const python = (process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'])
  .find(command => {
    const probe = spawnSync(command, ['--version'], { encoding: 'utf8', windowsHide: true });
    return probe.status === 0 && /^Python 3\./.test(probe.stdout || probe.stderr);
  });

function runPython(script, payload) {
  const result = spawnSync(python, ['-c', script, repoRoot], {
    cwd: process.cwd(), input: JSON.stringify(payload), encoding: 'utf8', windowsHide: true,
    env: { ...process.env, PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' },
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return JSON.parse(result.stdout);
}

test('Python and JavaScript agree on Harness paths and the 10.17 CLI aliases', { skip: !python }, t => {
  const home = path.join(fixture(t), 'home');
  const rows = homeCases(path, home, process.cwd()).map(({ value, expected }) => ({
    env: { DSH_HOME: value, DSH_AGENTS_HOME: 'shared-agents', DEEPSEEK_HOME: 'legacy-home' }, expected,
  }));
  for (const value of ['//server/share/fixture', '///server/share/fixture', 'relative/trailing ']) {
    rows.push({ env: { DSH_HOME: value }, expected: deepseekHarnessHome({ env: { DSH_HOME: value }, home }) });
  }
  if (process.platform === 'win32') {
    for (const value of ['D:relative', 'D:', '\\rooted', 'C:/fixture/trailing.']) {
      rows.push({ env: { DSH_HOME: value }, expected: deepseekHarnessHome({ env: { DSH_HOME: value }, home }) });
    }
  }
  for (const override of ['', '~', '~/manual', '~\\manual', ' manual ']) {
    rows.push({ env: { DSH_HOME: 'ignored' }, override, expected: deepseekHarnessHome({ env: { DSH_HOME: 'ignored' }, home, override }) });
  }
  const result = runPython(`
import json, os, sys
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, sys.argv[1])
import seats
data = json.load(sys.stdin)
homes = []
for row in data['rows']:
    with patch.dict(os.environ, row['env'], clear=True), patch.object(Path, 'home', return_value=Path(data['home'])):
        homes.append(str(seats.seat_home('deepseek', row.get('override'))))
aliases = [seats.DEEPSEEK_LABEL, 'deepseek-v4.1-flash-10.17', 'deepseekv4.1flash10.17', 'deepseek-v4.1-flash', 'deepseek']
print(json.dumps({'homes': homes, 'label': seats.DEEPSEEK_LABEL, 'aliases': [seats.resolve_seat(v) for v in aliases]}))
`, { rows, home });
  assert.deepEqual(result.homes, rows.map(row => row.expected));
  assert.equal(result.label, 'DeepSeek v4.1 Flash 10.17版本');
  assert.deepEqual(result.aliases, Array(5).fill('deepseek'));
});

test('Python DeepSeek deployment keeps the Harness loader and restores original files', { skip: !python }, t => {
  const root = fixture(t);
  const result = runPython(String.raw`
import json, sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import seats
root = Path(json.load(sys.stdin)['root'])
home = root / '.dsh'
home.mkdir()
agents = home / 'AGENTS.md'
original = b'# Preserve user instructions\r\n'
agents.write_bytes(original)
spec = seats.plan('deepseek', home)
loader = spec['writes'][0]['body']
assert len(loader.encode('utf-8')) < 65536
assert 'skills/cha-deepseek/SKILL.md' in loader
first = seats.deploy('deepseek', home)
assert seats.verify('deepseek', home)['ok']
skill = home / 'skills' / 'cha-deepseek' / 'SKILL.md'
assert skill.read_text(encoding='utf-8') == spec['pack']
assert not (root / '.agents').exists()
assert seats.restore('deepseek', home)['ok']
assert agents.read_bytes() == original
assert not skill.exists()
print(json.dumps({'verified': True, 'backups': len(first['backups']), 'writes': len(first['writes'])}))
`, { root });
  assert.equal(result.verified, true);
  assert.ok(result.backups > 0);
  assert.equal(result.writes, runtime.basePlan('deepseek', path.join(root, '.dsh')).writes.length);
});

test('DeepSeek full plan extends the original Harness contract with 94 adapters and native MCP without installing', t => {
  const home = path.join(fixture(t), '.dsh');
  const original = runtime.basePlan('deepseek', home);
  const full = runtime.plan('deepseek', home);
  assert.equal(full.home, original.home);
  assert.equal(full.pack, original.pack);
  assert.deepEqual(full.writes.slice(0, original.writes.length), original.writes);
  const adapters = full.writes.filter(item => item.kind === 'asset' && /[\\/]skills[\\/]cc-(?:rea|rs)-[^\\/]+[\\/]SKILL\.md$/.test(item.file));
  assert.equal(adapters.length, 94);
  assert.equal(full.upstream.skillCount, 94);
  const mcp = full.writes.filter(item => item.kind === 'upstream-mcp');
  assert.equal(mcp.length, 1);
  assert.equal(mcp[0].file, path.join(home, 'cordis.patch.yml'));
  assert.equal(mcp[0].mode, 'dsh');
  assert.equal(fs.existsSync(home), false, 'planning must not install or create the Harness root');
});
