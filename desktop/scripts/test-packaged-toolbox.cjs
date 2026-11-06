'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const asar = require('@electron/asar');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
let executable, resources;
if (process.platform === 'win32') {
  const dir = path.join(dist, 'win-unpacked');
  executable = path.join(dir, fs.readdirSync(dir).find(n => n.endsWith('.exe') && n !== 'elevate.exe'));
  resources = path.join(dir, 'resources');
} else if (process.platform === 'darwin') {
  const dir = path.join(dist, process.arch === 'arm64' ? 'mac-arm64' : 'mac');
  const bundle = path.join(dir, fs.readdirSync(dir).find(n => n.endsWith('.app')));
  const bin = path.join(bundle, 'Contents', 'MacOS');
  executable = path.join(bin, fs.readdirSync(bin).find(n => fs.statSync(path.join(bin, n)).isFile()));
  resources = path.join(bundle, 'Contents', 'Resources');
} else {
  executable = path.join(dist, 'linux-unpacked', 'coldbrew-zero');
  resources = path.join(dist, 'linux-unpacked', 'resources');
}
assert.ok(fs.existsSync(executable), 'native packaged executable exists');
const archive = path.join(resources, 'app.asar');
const version = JSON.parse(asar.extractFile(archive, 'package.json').toString()).version;
assert.equal(version, fs.readFileSync(path.join(root, '..', 'VERSION'), 'utf8').trim());
const qr = fs.readFileSync(path.join(root, 'assets/community/qq-group-4.jpg'));
for (const name of ['assets/community/qq-group-4.jpg', 'src/lib/harness-plugin/ui/qq-group-4.jpg']) {
  assert.deepEqual(asar.extractFile(archive, path.normalize(name)), qr, 'packaged QQ four-group QR: ' + name);
}
assert.match(asar.extractFile(archive, path.normalize('src/lib/packs/activation-reply.md')).toString('utf8'), /QQ四群 1131239659/);
const grokResources = path.join(resources, 'grok-memory');
const grokManifest = JSON.parse(fs.readFileSync(path.join(grokResources, 'source-manifest.json')));
assert.equal(grokManifest.commit, 'b8fb8ed08d0657cb07675f31d5110b2da4c8744b');
for (const file of ['source-manifest.json', grokManifest.archive, 'LICENSE.souhun.txt', 'NOTICE.md']) {
  assert.deepEqual(fs.readFileSync(path.join(grokResources, file)), fs.readFileSync(path.join(root, 'resources/grok-memory', file)), 'Grok source/notice parity: ' + file);
}
for (const name of ['src/lib/grok-memory/session.js', 'src/lib/grok-memory/protocol.js', 'src/lib/grok-memory/controller.js', 'src/workbench/grok-memory-view.js']) {
  assert.deepEqual(asar.extractFile(archive, path.normalize(name)), fs.readFileSync(path.join(root, name)), 'Grok implementation parity: ' + name);
}
for (const name of ['agent.js', 'binary.js', 'common.js', 'engine.js', 'ida.js', 'mcp.js', 'network.js', 'registry.js', 'SKILL.md']) {
  assert.ok(fs.existsSync(path.join(resources, 'toolbox', name)), 'MCP resource: ' + name);
}
assert.equal(typeof require(path.join(resources, 'toolbox', 'engine.js')).ToolboxEngine, 'function');
assert.equal(typeof require(path.join(resources, 'toolbox', 'agent.js')).runAgent, 'function');
const forbidden = /(?:^|[/\\])(?:auth\.json|credentials\.json|\.env(?:\.[^/\\]+)?|[^/\\]*\.bak-[^/\\]*|[^/\\]*\.(?:log|dmp|pem|pfx|p12|key)|[^/\\]*\.test\.js|seat-selftest\.js)$/i;
for (const name of asar.listPackage(archive)) assert.ok(!forbidden.test(name), 'excluded private/test file: ' + name);
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else assert.ok(!forbidden.test(path.relative(resources, file)), 'excluded resource: ' + entry.name);
  }
}
walk(resources);
const env = { ...process.env, COLDCOFFEE_APP_EXECUTABLE: executable, COLDCOFFEE_UI_OUTPUT: path.join(root, 'work', 'packaged-ui') };
if (process.env.CI) env.DEBUG = 'pw:browser';
delete env.ELECTRON_RUN_AS_NODE;
if (process.platform === 'win32') env.COLDCOFFEE_SIMULATE_PORTABLE = '1';
if (process.platform === 'linux') env.COLDCOFFEE_UI_NO_SANDBOX = '1'; // CI launcher only; application defaults stay unchanged.
const result = spawnSync(process.execPath, [path.join(__dirname, 'test-original-toolbox-ui.cjs')], { env, stdio: 'inherit', timeout: 180000 });
if (result.error) throw result.error;
assert.equal(result.status, 0, 'native packaged UI test passes');
const grokResult = spawnSync(process.execPath, [path.join(__dirname, 'test-grok-memory-desktop.cjs')], { env, stdio: 'inherit', timeout: 120000 });
if (grokResult.error) throw grokResult.error;
assert.equal(grokResult.status, 0, 'native packaged Grok memory IPC/crypto test passes');
console.log('PASS: packaged version, MCP resources, exclusions and real native GUI / IPC flow.');
