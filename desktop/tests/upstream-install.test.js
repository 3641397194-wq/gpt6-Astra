'use strict';
// Deliberately small synthetic plans: no source in a personal profile is read.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const beginner = require('../src/lib/beginner-install');
const { planSeatConnection, patchSeatConnection } = require('../src/lib/ida-mcp');
const { mcpInfo } = require('../src/lib/upstream-skills');

function fixture(t, seat = 'codex') {
  const base = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'cc upstream installer '));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(base)), fs.realpathSync(os.tmpdir()));
    fs.rmSync(base, { recursive: true, force: true, maxRetries: 4, retryDelay: 50 });
  });
  const root = path.join(base, '.' + seat);
  const mcp = mcpInfo(seat, root);
  let ready = false;
  const detect = () => ({ root, exists: fs.existsSync(root), layout: seat === 'deepseek' ? 'deepseek-harness' : 'default' });
  const plan = () => ({ home: root, pack: 'synthetic original activation\n', writes: [
    { kind: 'file', file: path.join(root, 'activation.txt'), body: 'synthetic original activation\n' },
    { kind: 'asset', file: path.join(root, '.coldcoffee-upstream', 'sources', 'rea', 'SKILL.md'), data: Buffer.from('synthetic source only\n'), mode: 0o644 },
    { kind: 'upstream-mcp', file: mcp.file, mode: mcp.mode, keys: mcp.keys, entry: mcp.entry },
  ], upstream: { skillCount: 2, fileCount: 3, mcp } });
  const readRuntime = () => ({ installed: true, ready, version: 'synthetic', message: ready ? 'ready' : 'pending' });
  return { base, root, mcp, detect, plan, readRuntime, options: { detect, plan, readRuntime }, ready: () => { ready = true; } };
}

test('confirmation gates installation and dependency preparation before directory detection', async () => {
  let touched = false;
  const detect = () => { touched = true; throw new Error('must not inspect'); };
  assert.throws(() => beginner.installOne('codex', { detect }), /一键破甲/);
  await assert.rejects(beginner.prepareOne('codex', { confirm: false, detect }), /确认准备/);
  assert.equal(touched, false);
});

test('one transaction owns TOML REA and IDA entries, is idempotent and restores exact bytes', (t) => {
  const f = fixture(t);
  fs.mkdirSync(f.root);
  const original = '# customer comment\r\nmodel = "synthetic"\r\n';
  fs.writeFileSync(f.mcp.file, original);
  const first = beginner.installOne('codex', { confirm: true, ...f.options });
  assert.equal(first.ok, true);
  assert.equal(first.verified, true);
  assert.equal(first.toolbox, 'ida');
  assert.equal(first.upstream.verified, true);
  assert.equal(first.upstream.mcp.configured, true);
  assert.equal(first.upstream.runtime.ready, false);
  assert.match(fs.readFileSync(f.mcp.file, 'utf8'), /mcp_servers\.coldcoffee-rea/);
  assert.match(fs.readFileSync(f.mcp.file, 'utf8'), /mcp_servers\.ida-pro-mcp/);
  const again = beginner.installOne('codex', { confirm: true, ...f.options });
  assert.equal(again.changed, 0);
  const removed = beginner.uninstallOne('codex', { confirm: true, ...f.options });
  assert.equal(removed.ok, true);
  assert.equal(fs.readFileSync(f.mcp.file, 'utf8'), original);
  assert.equal(fs.existsSync(path.join(f.root, 'activation.txt')), false);
  assert.equal(fs.existsSync(path.join(f.base, '.coldcoffee-history')), false, 'No backup outside selected root');
});

test('JSONC REA and IDA merge keeps comments, then rollback restores the original JSONC bytes', (t) => {
  const f = fixture(t, 'cursor');
  fs.mkdirSync(f.root);
  const original = '// customer MCP\n{ "mcpServers": { "other": { "command": "synthetic" } } }\n';
  fs.writeFileSync(f.mcp.file, original);
  const installed = beginner.installOne('cursor', { confirm: true, ...f.options });
  assert.equal(installed.verified, true);
  assert.match(fs.readFileSync(f.mcp.file, 'utf8'), /customer MCP/);
  assert.equal(beginner.installOne('cursor', { confirm: true, ...f.options }).changed, 0);
  assert.equal(beginner.uninstallOne('cursor', { confirm: true, ...f.options }).ok, true);
  assert.equal(fs.readFileSync(f.mcp.file, 'utf8'), original);
});

test('customer edits after installation stop uninstall before any target is changed', (t) => {
  const f = fixture(t, 'cursor');
  beginner.installOne('cursor', { confirm: true, ...f.options });
  fs.appendFileSync(f.mcp.file, '\n// a later customer edit\n');
  const before = fs.readFileSync(f.mcp.file);
  const result = beginner.uninstallOne('cursor', { confirm: true, ...f.options });
  assert.equal(result.ok, false);
  assert.match(result.message, /修改|改过|冲突/);
  assert.deepEqual(fs.readFileSync(f.mcp.file), before);
  assert.equal(fs.existsSync(path.join(f.root, 'activation.txt')), true);
});

test('status on a missing selected directory never creates it or claims connection readiness', (t) => {
  const f = fixture(t);
  const result = beginner.statusOne('codex', f.options);
  assert.equal(result.ok, false);
  assert.equal(result.upstream.verified, false);
  assert.equal(result.upstream.mcp.configured, false);
  assert.equal(fs.existsSync(f.root), false);
});

test('dependency preparation requires a verified install, reports actual readiness, and prevents concurrent mutation', async (t) => {
  const f = fixture(t);
  let calls = 0;
  const notInstalled = await beginner.prepareOne('codex', { confirm: true, ...f.options, prepare: async () => { calls += 1; } });
  assert.equal(notInstalled.code, 'REA_INSTALL_UNVERIFIED');
  assert.equal(calls, 0);
  beginner.installOne('codex', { confirm: true, ...f.options });
  let release;
  const pending = beginner.prepareOne('codex', { confirm: true, ...f.options, prepare: async (root) => {
    assert.equal(root, f.root); calls += 1;
    await new Promise((resolve) => { release = resolve; });
    f.ready();
    return { ok: true, code: 'REA_READY', message: 'synthetic preparation complete' };
  } });
  await assert.rejects(beginner.prepareOne('codex', { confirm: true, ...f.options }), /正在准备/);
  assert.throws(() => beginner.installOne('codex', { confirm: true, ...f.options }), /正在准备/);
  assert.throws(() => beginner.uninstallOne('codex', { confirm: true, ...f.options }), /正在准备/);
  release();
  const result = await pending;
  assert.equal(calls, 1);
  assert.equal(result.ok, true);
  assert.equal(result.upstream.runtime.ready, true);
});

test('transport success without ready dependency state is not reported as ready', async (t) => {
  const f = fixture(t);
  beginner.installOne('codex', { confirm: true, ...f.options });
  const result = await beginner.prepareOne('codex', { confirm: true, ...f.options,
    prepare: async () => ({ ok: true, code: 'REA_READY', message: 'synthetic false success' }) });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'REA_NOT_READY');
  assert.equal(result.upstream.runtime.ready, false);
});

test('IDA planning creates nothing and does not write an out-of-root Claude global configuration', (t) => {
  const f = fixture(t, 'claude');
  const result = planSeatConnection('claude', { root: f.root });
  assert.equal(result.code, 'manual');
  assert.deepEqual(result.writes, []);
  assert.equal(fs.existsSync(f.root), false);
  assert.equal(fs.existsSync(path.join(f.base, '.claude.json')), false);
});

test('IDA TOML preserves an unmanaged existing name and rejects malformed inputs', () => {
  const source = '[mcp_servers.ida-pro-mcp]\nurl = "https://synthetic.invalid/mcp"\n';
  assert.equal(patchSeatConnection(source, { mode: 'toml' }), source);
  assert.throws(() => patchSeatConnection('bad = [', { mode: 'toml' }), /TOML 解析失败/);
  assert.throws(() => patchSeatConnection('# CHA-IDA-MCP:BEGIN\n', { mode: 'toml' }), /标记损坏/);
});
