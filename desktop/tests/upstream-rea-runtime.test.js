'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const rea = require('../src/lib/upstream/rea-launcher.cjs');
const { prepareRea, statusRea } = require('../src/lib/upstream-rea-runtime');
const SOURCE = path.resolve(__dirname, '../src/lib/upstream/rea-launcher.cjs');

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'cc REA 测试 '));
  t.after(() => {
    // All synthetic test targets resolve within this explicitly created root.
    assert.equal(path.dirname(path.resolve(root)), fs.realpathSync(os.tmpdir()));
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 4, retryDelay: 50 });
  });
  const base = path.join(root, '.coldcoffee-upstream'), runtime = path.join(base, 'runtime', 'rea');
  const pkg = { name: 'rea-agents', version: '6.7.0', type: 'module', dependencies: { zod: '4.0.0', '@modelcontextprotocol/server': '2.0.0' } };
  write(path.join(runtime, 'package.json'), JSON.stringify(pkg));
  write(path.join(runtime, 'package-lock.json'), JSON.stringify({ name: pkg.name, version: pkg.version, lockfileVersion: 3,
    packages: { '': pkg, 'node_modules/zod': { version: '4.0.0', resolved: 'https://registry.npmjs.org/zod/-/zod-4.0.0.tgz' },
      'node_modules/@modelcontextprotocol/server': { version: '2.0.0', resolved: 'https://registry.npmjs.org/@modelcontextprotocol/server/-/server-2.0.0.tgz' } } }));
  write(path.join(runtime, 'scripts', 'rea.mjs'), '// synthetic entry; never executed\n');
  write(path.join(runtime, 'dist', 'mcp', 'main.js'), '// synthetic mcp; never imported\n');
  const launcher = path.join(base, 'rea-launcher.cjs');
  fs.copyFileSync(SOURCE, launcher);
  const npmCli = path.join(root, 'node with spaces', 'node_modules', 'npm', 'bin', 'npm-cli.js');
  write(npmCli, '// synthetic npm; mocked spawn only\n');
  return { root, base, runtime, launcher, npmCli };
}

function modules(f) {
  const entries = rea.CORE_DEPENDENCIES.map((name) => ({ name, file: path.join(f.runtime, 'node_modules', name, 'index.js') }));
  for (const entry of entries) {
    write(entry.file, 'export const synthetic = true;\n');
    write(path.join(path.dirname(entry.file), 'package.json'), JSON.stringify({ name: entry.name, version: '1.0.0', type: 'module', exports: './index.js' }));
  }
  return entries;
}

function child({ stdout = '', stderr = '', status = 0, error, never = false } = {}) {
  const process = new EventEmitter();
  process.stdout = new PassThrough(); process.stderr = new PassThrough();
  process.kills = [];
  process.kill = (signal) => { process.kills.push(signal); queueMicrotask(() => process.emit('close', null, signal)); return true; };
  if (!never) queueMicrotask(() => {
    if (error) { process.emit('error', error); return; }
    process.stdout.end(stdout); process.stderr.end(stderr);
    process.emit('close', status, null);
  });
  return process;
}

function mockRuntime(f, { npmStatus = 0, importStatus = 0 } = {}) {
  const calls = [], logs = [];
  const spawnImpl = (command, args, options) => {
    calls.push({ command, args, options });
    if (args[0] === f.npmCli) {
      if (!npmStatus) modules(f);
      return child({ stdout: 'npm progress must stay off MCP stdout\n', stderr: 'npm diagnostic\n', status: npmStatus });
    }
    assert.equal(args[0], '--input-type=module');
    const entries = rea.CORE_DEPENDENCIES.map((name) => ({ name, file: path.join(f.runtime, 'node_modules', name, 'index.js') }));
    return child({ stdout: '\nCOLDCOFFEE_REA_VERIFY:' + JSON.stringify({ entries }) + '\n', status: importStatus });
  };
  return { calls, logs, options: { nodeVersion: '22.19.0', npmCli: f.npmCli, execPath: process.execPath, env: {}, spawnImpl, log: (value) => logs.push(value.toString()) } };
}

test('Node engine range includes only stable supported release lines', () => {
  for (const value of ['22.19.0', 'v22.22.3', '22.99.0', '24.11.0', '24.20.0', '26.0.0', '27.1.2']) assert.equal(rea.supportedNode(value), true, value);
  for (const value of ['22.18.9', '20.19.0', '23.9.0', '24.10.9', '25.0.0', '26.0.0-rc.1', '22.19', '', null]) assert.equal(rea.supportedNode(value), false, String(value));
});

test('read-only status reports installed but unprepared and creates no cache', (t) => {
  const f = fixture(t), before = fs.readdirSync(f.base).sort();
  const result = statusRea(f.root);
  assert.equal(result.installed, true); assert.equal(result.ready, false); assert.equal(result.version, '6.7.0');
  assert.deepEqual(fs.readdirSync(f.base).sort(), before);
  assert.equal(fs.existsSync(path.join(f.base, 'cache')), false);
});

test('missing selected root stays missing and never falls back to home', (t) => {
  const f = fixture(t), missing = path.join(f.root, 'missing');
  const result = statusRea(missing);
  assert.equal(result.installed, false); assert.equal(result.ready, false);
  assert.equal(fs.existsSync(missing), false);
  assert.equal(statusRea('relative').code, 'REA_PATH_ESCAPE');
});

test('preparation invokes Node plus npm-cli with deterministic args, scoped cwd and isolated cache/config', async (t) => {
  const f = fixture(t), mock = mockRuntime(f);
  const result = await rea.prepareScope(f.base, { ...mock.options, env: { PATH: 'synthetic PATH', HOME: 'outside-home', USERPROFILE: 'outside-profile',
    npm_config_userconfig: 'outside.npmrc', NPM_TOKEN: 'test-never-forward', NODE_AUTH_TOKEN: 'test-never-forward', GITHUB_TOKEN: 'test-never-forward', NODE_OPTIONS: '--require=outside.js' } });
  assert.equal(result.ok, true); assert.equal(result.installedDependencies, true);
  const npm = mock.calls[0];
  assert.equal(npm.command, process.execPath);
  assert.deepEqual(npm.args, [f.npmCli, 'ci', '--omit=dev', '--omit=optional', '--ignore-scripts', '--no-audit', '--no-fund']);
  assert.equal(npm.options.cwd, f.runtime); assert.equal(npm.options.shell, false); assert.equal(npm.options.windowsHide, true);
  assert.deepEqual(npm.options.stdio, ['ignore', 'pipe', 'pipe']);
  assert.equal(npm.options.env.npm_config_cache, path.join(f.base, 'cache', 'npm'));
  assert.equal(npm.options.env.HOME, path.join(f.base, 'cache', 'home'));
  assert.equal(npm.options.env.USERPROFILE, path.join(f.base, 'cache', 'home'));
  assert.equal(npm.options.env.TEMP, path.join(f.base, 'cache', 'tmp'));
  assert.equal(npm.options.env.NPM_TOKEN, undefined); assert.equal(npm.options.env.NODE_AUTH_TOKEN, undefined);
  assert.equal(npm.options.env.GITHUB_TOKEN, undefined); assert.equal(npm.options.env.NODE_OPTIONS, undefined);
  assert.equal(fs.readFileSync(npm.options.env.npm_config_userconfig, 'utf8'), '');
  assert.equal(fs.readFileSync(npm.options.env.npm_config_globalconfig, 'utf8'), '');
  assert.ok(mock.logs.some((value) => value.includes('npm progress')));
  assert.equal(statusRea(f.root).ready, true);
  assert.equal(fs.existsSync(path.join(f.base, 'rea-prepare.lock')), false);
});

test('already-ready preparation skips npm but rechecks real dependency imports', async (t) => {
  const f = fixture(t), mock = mockRuntime(f);
  await rea.prepareScope(f.base, mock.options);
  mock.calls.length = 0;
  const result = await rea.prepareScope(f.base, mock.options);
  assert.equal(result.installedDependencies, false);
  assert.equal(mock.calls.length, 1); assert.equal(mock.calls[0].args[0], '--input-type=module');
});

test('dependency hash damage invalidates readiness and performs a clean locked reinstall', async (t) => {
  const f = fixture(t), mock = mockRuntime(f);
  await rea.prepareScope(f.base, mock.options);
  fs.appendFileSync(path.join(f.runtime, 'node_modules', 'zod', 'index.js'), '// altered\n');
  assert.equal(statusRea(f.root).ready, false);
  mock.calls.length = 0;
  const result = await rea.prepareScope(f.base, mock.options);
  assert.equal(result.installedDependencies, true); assert.equal(mock.calls[0].args[0], f.npmCli);
});

test('npm failure keeps source files, releases lock, and permits retry', async (t) => {
  const f = fixture(t), failed = mockRuntime(f, { npmStatus: 23 });
  await assert.rejects(rea.prepareScope(f.base, failed.options), (error) => error.code === 'REA_NPM_FAILED' && /23/.test(error.message));
  assert.equal(statusRea(f.root).installed, true); assert.equal(statusRea(f.root).ready, false);
  assert.equal(fs.existsSync(path.join(f.base, 'rea-prepare.lock')), false);
  assert.equal(fs.existsSync(path.join(f.runtime, 'scripts', 'rea.mjs')), true);
  const retry = mockRuntime(f);
  assert.equal((await rea.prepareScope(f.base, retry.options)).ok, true);
});

test('npm timeout has an explicit error code and releases the preparation lock', async (t) => {
  const f = fixture(t), mock = mockRuntime(f), hung = child({ never: true });
  await assert.rejects(rea.prepareScope(f.base, { ...mock.options, npmTimeoutMs: 5, spawnImpl: () => hung }), { code: 'REA_PREPARE_TIMEOUT' });
  assert.deepEqual(hung.kills, ['SIGTERM']);
  assert.equal(fs.existsSync(path.join(f.base, 'rea-prepare.lock')), false);
  assert.equal(statusRea(f.root).installed, true); assert.equal(statusRea(f.root).ready, false);
});

test('failed import invalidates an old receipt rather than claiming ready', async (t) => {
  const f = fixture(t), good = mockRuntime(f);
  await rea.prepareScope(f.base, good.options);
  const bad = mockRuntime(f, { importStatus: 9 });
  await assert.rejects(rea.prepareScope(f.base, bad.options), { code: 'REA_DEPENDENCY_FAILED' });
  assert.equal(statusRea(f.root).ready, false);
});

test('unsupported Node fails before writing cache or invoking npm', async (t) => {
  const f = fixture(t), mock = mockRuntime(f);
  await assert.rejects(rea.prepareScope(f.base, { ...mock.options, nodeVersion: '22.18.0' }), { code: 'REA_NODE_UNSUPPORTED' });
  assert.equal(mock.calls.length, 0); assert.equal(fs.existsSync(path.join(f.base, 'cache')), false);
});

test('active exclusive lock prevents concurrent preparation; stale dead-owner lock recovers', async (t) => {
  const f = fixture(t), mock = mockRuntime(f), lock = path.join(f.base, 'rea-prepare.lock');
  write(lock, JSON.stringify({ pid: process.pid, token: 'other-owner' }));
  await assert.rejects(rea.prepareScope(f.base, { ...mock.options, lockTimeoutMs: 5, pollMs: 1 }), { code: 'REA_BUSY' });
  assert.equal(mock.calls.length, 0); assert.equal(JSON.parse(fs.readFileSync(lock)).token, 'other-owner');
  write(lock, JSON.stringify({ pid: 123456, token: 'abandoned' }));
  const result = await rea.prepareScope(f.base, { ...mock.options, isPidAlive: () => false });
  assert.equal(result.ok, true); assert.equal(fs.existsSync(lock), false);
});

test('local/link dependencies and traversal in package lock are blocked before npm', async (t) => {
  const f = fixture(t), mock = mockRuntime(f), file = path.join(f.runtime, 'package-lock.json');
  const original = fs.readFileSync(file);
  for (const [relative, entry] of [
    ['node_modules/escape', { version: '1.0.0', resolved: 'file:../../outside' }],
    ['node_modules/escape', { version: '1.0.0', link: true, resolved: '../outside' }],
    ['node_modules/../../outside', { version: '1.0.0' }],
  ]) {
    const lock = JSON.parse(original);
    lock.packages[relative] = entry;
    fs.writeFileSync(file, JSON.stringify(lock));
    await assert.rejects(rea.prepareScope(f.base, mock.options), { code: 'REA_PATH_ESCAPE' });
  }
  assert.equal(mock.calls.length, 0); assert.equal(fs.existsSync(path.join(f.base, 'cache')), false);
});

test('runtime directory junction escape is rejected without touching its target', async (t) => {
  const f = fixture(t), mock = mockRuntime(f), outside = path.join(f.root, 'outside');
  fs.mkdirSync(outside);
  write(path.join(outside, 'sentinel.txt'), 'unchanged');
  const link = path.join(f.base, 'cache');
  fs.symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(rea.prepareScope(f.base, mock.options), { code: 'REA_PATH_ESCAPE' });
  assert.equal(mock.calls.length, 0);
  assert.deepEqual(fs.readdirSync(outside), ['sentinel.txt']);
  assert.equal(fs.readFileSync(path.join(outside, 'sentinel.txt'), 'utf8'), 'unchanged');
});

test('node_modules escape junction is rejected before invoking npm or importing anything', async (t) => {
  const f = fixture(t), mock = mockRuntime(f), outside = path.join(f.root, 'outside-modules');
  fs.mkdirSync(outside);
  fs.mkdirSync(path.join(f.runtime, 'node_modules'));
  fs.symlinkSync(outside, path.join(f.runtime, 'node_modules', 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(rea.prepareScope(f.base, mock.options), { code: 'REA_PATH_ESCAPE' });
  assert.equal(mock.calls.length, 0); assert.deepEqual(fs.readdirSync(outside), []);
});

test('prepare CLI returns one machine-readable stdout record; npm logs stay on stderr', async (t) => {
  const f = fixture(t), mock = mockRuntime(f);
  let stdout = '', stderr = '';
  const status = await rea.runCli(['--prepare'], { ...mock.options, base: f.base, stdout: { write: (value) => { stdout += value; } }, stderr: { write: (value) => { stderr += value; } } });
  assert.equal(status, 0); assert.equal(JSON.parse(stdout).code, 'REA_READY');
  assert.equal(stdout.trim().split('\n').length, 1); assert.equal(stdout.includes('npm progress'), false);
  assert.match(stderr, /npm progress/); assert.match(stderr, /npm diagnostic/);
});

test('MCP mode starts scoped official CLI with inherited stdio, without extra stdout', async (t) => {
  const f = fixture(t), mock = mockRuntime(f);
  await rea.prepareScope(f.base, mock.options);
  const calls = []; let stdout = '';
  const spawnImpl = (command, args, options) => {
    calls.push({ command, args, options });
    if (args[0] === '--input-type=module') return mock.options.spawnImpl(command, args, options);
    return child({ status: 0 });
  };
  const status = await rea.runCli(['mcp'], { ...mock.options, spawnImpl, base: f.base, stdout: { write: (value) => { stdout += value; } }, stderr: { write() {} } });
  assert.equal(status, 0); assert.equal(stdout, '');
  const last = calls.at(-1);
  assert.equal(last.command, process.execPath); assert.deepEqual(last.args, [path.join(f.runtime, 'scripts', 'rea.mjs'), 'mcp']);
  assert.equal(last.options.cwd, f.runtime); assert.equal(last.options.stdio, 'inherit');
  assert.equal(last.options.shell, false); assert.equal(last.options.windowsHide, true);
});

test('bounded spawn timeout kills child and yields explicit timeout state', async () => {
  const hung = child({ never: true });
  const result = await rea.runProcess('node', ['synthetic'], { spawnImpl: () => hung, timeoutMs: 5 });
  assert.equal(result.ok, false); assert.equal(result.timedOut, true); assert.deepEqual(hung.kills, ['SIGTERM']);
});

test('abort forwards SIGINT and an already-aborted request never spawns a process', async () => {
  const controller = new AbortController(), running = child({ never: true });
  const pending = rea.runProcess('node', ['synthetic'], { spawnImpl: () => running, signal: controller.signal });
  controller.abort('SIGINT');
  assert.equal((await pending).aborted, true); assert.deepEqual(running.kills, ['SIGINT']);
  let spawned = false;
  const stopped = await rea.runProcess('node', [], { signal: controller.signal, spawnImpl: () => { spawned = true; return child(); } });
  assert.equal(stopped.aborted, true); assert.equal(spawned, false);
});

test('npm-cli detection works with Node paths containing spaces and never runs npm.cmd', (t) => {
  const f = fixture(t), node = path.join(f.root, 'node with spaces', process.platform === 'win32' ? 'node.exe' : 'node');
  write(node, 'synthetic node');
  assert.equal(rea.findNpmCli({ execPath: node, env: {} }), f.npmCli);
});

test('prepareRea invokes installed launcher with safe args, propagates errors, and rechecks state', async (t) => {
  const f = fixture(t); let observed;
  const result = await prepareRea(f.root, { nodeCommand: path.join(f.root, 'Node Dir', 'node.exe'), env: { NODE_OPTIONS: '--require=outside.js' },
    spawnImpl: (command, args, options) => {
      observed = { command, args, options };
      return child({ stdout: JSON.stringify({ ok: false, code: 'REA_NPM_FAILED', message: 'synthetic failure', version: '6.7.0' }), status: 70 });
    } });
  assert.equal(result.ok, false); assert.equal(result.code, 'REA_NPM_FAILED');
  assert.deepEqual(observed.args, [f.launcher, '--prepare']); assert.equal(observed.options.shell, false); assert.equal(observed.options.windowsHide, true);
  assert.equal(observed.options.env.NODE_OPTIONS, undefined);
  const falseSuccess = await prepareRea(f.root, { spawnImpl: () => child({ stdout: JSON.stringify({ ok: true, code: 'REA_READY', message: 'synthetic', version: '6.7.0' }) }) });
  assert.equal(falseSuccess.ok, false); assert.equal(falseSuccess.code, 'REA_NOT_READY');
  const mock = mockRuntime(f); await rea.prepareScope(f.base, mock.options);
  const verified = await prepareRea(f.root, { spawnImpl: () => child({ stdout: JSON.stringify({ ok: true, code: 'REA_READY', message: 'synthetic', version: '6.7.0' }) }) });
  assert.equal(verified.ok, true); assert.equal(verified.version, '6.7.0');
});

test('prepareRea reports missing Node and refuses a modified launcher', async (t) => {
  const f = fixture(t);
  const missing = Object.assign(new Error('spawn node ENOENT'), { code: 'ENOENT' });
  const result = await prepareRea(f.root, { spawnImpl: () => child({ error: missing }) });
  assert.equal(result.code, 'REA_NODE_MISSING');
  fs.appendFileSync(f.launcher, '// changed\n');
  let spawned = false;
  const changed = await prepareRea(f.root, { spawnImpl: () => { spawned = true; return child(); } });
  assert.equal(changed.code, 'REA_LAUNCHER_MISMATCH'); assert.equal(spawned, false);
});

test('actual Node dependency imports and actual copied launcher prepare work with synthetic packages, without network', async (t) => {
  if (!rea.supportedNode(process.versions.node)) { t.skip('Host Node is outside the upstream supported range'); return; }
  const f = fixture(t), mock = mockRuntime(f);
  const { spawn } = require('node:child_process');
  const prepared = await rea.prepareScope(f.base, { ...mock.options, nodeVersion: process.versions.node,
    spawnImpl(command, args, options) {
      if (args[0] === f.npmCli) { modules(f); return child({ status: 0 }); }
      return spawn(command, args, options);
    } });
  assert.equal(prepared.ok, true); assert.equal(statusRea(f.root).ready, true);
  const actual = await prepareRea(f.root, { nodeCommand: process.execPath, timeoutMs: 15000 });
  assert.equal(actual.ok, true, JSON.stringify(actual)); assert.equal(actual.version, '6.7.0');
  assert.equal(actual.installedDependencies, false);
});
