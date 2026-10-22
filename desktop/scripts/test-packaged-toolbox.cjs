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
console.log('PASS: packaged version, MCP resources, exclusions and real native GUI / IPC flow.');
