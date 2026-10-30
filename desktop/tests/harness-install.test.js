'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const YAML = require('yaml');
const harness = require('../src/lib/harness-install');
const { patchHarnessPlugin } = require('../src/lib/upstream-config');
const { SeatTransactions } = require('../src/lib/seat-transactions');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'coldcoffee harness plugin '));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 4, retryDelay: 50 }));
  const directory = path.join(root, 'application assets');
  for (const relative of harness.PLUGIN_FILES) {
    const file = path.join(directory, ...relative.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, relative === 'package.json' ? JSON.stringify({ name: 'coldcoffee-harness-plugin', version: '1.0.0-preview.1', type: 'module' }) : `bundled ${relative}\n`);
  }
  return { root, directory, home: path.join(root, 'dedicated DSH home') };
}

function entries(text) {
  return YAML.parse(text).flatMap(operation => operation.insert || []);
}

test('native plugin planning reads its fixed application asset list and creates no client directories', t => {
  const { root, directory, home } = fixture(t);
  fs.writeFileSync(path.join(directory, 'private.key'), 'not-a-resource');
  fs.mkdirSync(path.join(directory, 'tests'));
  fs.writeFileSync(path.join(directory, 'tests', 'secret-fixture.js'), 'not-a-resource');
  const result = harness.installationWrites(home, { directory });
  assert.equal(result.summary.enabled, true);
  assert.equal(result.summary.version, '1.0.0-preview.1');
  assert.deepEqual(result.summary.files, [...harness.PLUGIN_FILES, 'welcome.md']);
  assert.deepEqual(result.summary.profiles, ['web', 'desktop']);
  assert.equal(result.writes.filter(write => write.kind === 'harness-plugin').length, 1);
  assert.equal(result.writes.length, harness.PLUGIN_FILES.length + 2);
  assert.deepEqual(result.writes.find(write => path.basename(write.file) === 'welcome.md').data, fs.readFileSync(path.join(__dirname, '../src/lib/packs/activation-reply.md')));
  const config = result.writes.at(-1);
  assert.equal(config.file, path.join(home, 'cordis.patch.yml'));
  assert.equal(config.entry.id, 'coldcoffee-harness');
  assert.equal(config.entry.name, path.join(home, '.coldcoffee-upstream', 'harness-plugin', 'index.mjs'));
  assert.deepEqual(config.entry.config, { dshHome: home, upstreamRoot: path.join(home, '.coldcoffee-upstream'), animations: true });
  assert.equal(result.writes.some(write => /private\.key|secret-fixture/.test(write.file)), false);
  assert.equal(fs.existsSync(home), false);
  assert.equal(fs.existsSync(path.join(root, '.agents')), false);
  assert.throws(() => harness.installationWrites('relative-root', { directory }), /绝对目录/);
});

test('native Cordis patch keeps comments, MCP/plugins, customer options and exact idempotence', t => {
  const { directory, home } = fixture(t);
  const item = harness.installationWrites(home, { directory }).writes.at(-1);
  const original = `# customer configuration\n- insert:\n    # keep the REA connection\n    - id: coldcoffee-rea-mcp\n      name: '@deepseek-ai/dsh-mcp-client'\n      config:\n        serverName: coldcoffee-rea\n    - id: coldcoffee-harness\n      name: old-path # keep native entry note\n      disabled: false\n      config:\n        # keep theme note\n        animations: false\n        customTheme: ice\n        dshHome: old-home # keep home note\n`;
  const result = patchHarnessPlugin(original, item);
  assert.match(result, /customer configuration/);
  assert.match(result, /keep the REA connection/);
  assert.match(result, /keep native entry note/);
  assert.match(result, /keep theme note/);
  assert.match(result, /keep home note/);
  const parsed = entries(result);
  assert.deepEqual(parsed[0], { id: 'coldcoffee-rea-mcp', name: '@deepseek-ai/dsh-mcp-client', config: { serverName: 'coldcoffee-rea' } });
  assert.equal(parsed[1].name, item.entry.name);
  assert.equal(parsed[1].disabled, false);
  assert.deepEqual(parsed[1].config, { animations: true, customTheme: 'ice', dshHome: home, upstreamRoot: path.join(home, '.coldcoffee-upstream') });
  assert.equal(patchHarnessPlugin(result, item), result);
  assert.deepEqual(entries(patchHarnessPlugin('', item)), [item.entry]);
});

test('native Cordis patch rejects ambiguous overrides, duplicates, malformed input and alias mutations', t => {
  const { directory, home } = fixture(t);
  const item = harness.installationWrites(home, { directory }).writes.at(-1);
  const owned = item.entry;
  assert.throws(() => patchHarnessPlugin(YAML.stringify([{ insert: [owned, owned] }]), item), /重复冷咖啡原生插件入口/);
  assert.throws(() => patchHarnessPlugin(YAML.stringify([{ id: owned.id, disabled: true }]), item), /后续覆盖补丁/);
  assert.throws(() => patchHarnessPlugin(YAML.stringify([{ id: 'group', insert: [owned] }]), item), /条件分组/);
  assert.throws(() => patchHarnessPlugin('- insert: []\n  insert: []\n', item), /有效的 YAML 补丁列表/);
  assert.throws(() => patchHarnessPlugin('- insert: {}\n', item), /insert 不是列表/);
  assert.throws(() => patchHarnessPlugin('- insert: [\n', item), /有效的 YAML 补丁列表/);
  assert.throws(() => patchHarnessPlugin(YAML.stringify([{ insert: [{ ...owned, config: 'invalid' }] }]), item), /config 应为对象/);
  assert.throws(() => patchHarnessPlugin(`- insert:\n    - id: other\n      config: &shared\n        animations: false\n    - id: coldcoffee-harness\n      name: old\n      config: *shared\n`, item), /YAML 别名/);
});

test('REA connection and native UI merge into one transaction; verification and rollback preserve original bytes', t => {
  const { directory, home } = fixture(t);
  fs.mkdirSync(home);
  const config = path.join(home, 'cordis.patch.yml');
  const welcome = path.join(home, 'AGENTS.md');
  const profile = path.join(home, 'profiles', 'web', 'cordis.patch.yml');
  const oldAsset = path.join(home, '.coldcoffee-upstream', 'harness-plugin', 'ui', 'rem-blue.svg');
  const originals = new Map([
    [config, Buffer.from('# preserve this comment\r\n- insert:\r\n    - id: other\r\n      name: other-plugin\r\n')],
    [welcome, Buffer.from('冷咖啡已激活\r\n原版完整欢迎词\r\nQQ一群 1057540028\r\n')],
    [profile, Buffer.from('# customer web profile\r\n- id: keep-profile\r\n  disabled: false\r\n')],
    [oldAsset, Buffer.from([0, 1, 127, 255])],
  ]);
  for (const [file, bytes] of originals) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); }
  const plugin = harness.installationWrites(home, { directory });
  const tx = new SeatTransactions({ plan: () => ({ home, pack: 'unchanged original word pack', upstream: { harnessPlugin: plugin.summary }, writes: [
    { kind: 'upstream-mcp', file: config, mode: 'dsh', entry: { command: 'node', args: [path.join(home, '.coldcoffee-upstream', 'rea-launcher.cjs'), 'mcp'] }, home },
    ...plugin.writes,
  ] }) });
  tx.select(home, { layout: 'deepseek-harness' });
  const preview = tx.preview('deepseek');
  const configRows = preview.files.filter(file => file.path === 'cordis.patch.yml');
  assert.equal(configRows.length, 1);
  assert.deepEqual(configRows[0].kinds, ['upstream-mcp', 'harness-plugin']);
  for (const [file, bytes] of originals) assert.deepEqual(fs.readFileSync(file), bytes, 'preview remains read-only');
  const installed = tx.deploy(preview.id);
  assert.equal(installed.ok, true);
  assert.deepEqual(entries(fs.readFileSync(config, 'utf8')).map(entry => entry.id), ['other', 'coldcoffee-rea-mcp', 'coldcoffee-harness']);
  assert.deepEqual(fs.readFileSync(welcome), originals.get(welcome));
  assert.deepEqual(fs.readFileSync(profile), originals.get(profile));
  const verified = tx.verify('deepseek');
  assert.equal(verified.ok, true);
  assert.equal(harness.statusFromChecks(plugin.summary, home, verified.checks).installed, true);
  assert.equal(tx.preview('deepseek').changes, 0);
  const incomplete = verified.checks.map(check => check.path === 'cordis.patch.yml' ? { ...check, ok: false } : check);
  assert.equal(harness.statusFromChecks(plugin.summary, home, incomplete).installed, false);
  tx.restore(installed.id);
  for (const [file, bytes] of originals) assert.deepEqual(fs.readFileSync(file), bytes, 'rollback restores original bytes');
  assert.equal(fs.existsSync(path.join(home, '.coldcoffee-upstream', 'harness-plugin', 'index.mjs')), false);
  assert.equal(harness.statusFromChecks(plugin.summary, home, tx.verify('deepseek').checks).installed, false);
});

test('post-install user edits prevent rollback before the shared Cordis configuration changes', t => {
  const { directory, home } = fixture(t);
  const plugin = harness.installationWrites(home, { directory });
  const tx = new SeatTransactions({ plan: () => ({ home, pack: '', writes: plugin.writes }) });
  tx.select(home, { layout: 'deepseek-harness' });
  const installed = tx.deploy(tx.preview('deepseek').id);
  const configBytes = fs.readFileSync(plugin.summary.configFile);
  fs.appendFileSync(plugin.summary.entry, '\nuser-edited-version');
  assert.throws(() => tx.restore(installed.id), /文件已被其他操作修改/);
  assert.deepEqual(fs.readFileSync(plugin.summary.configFile), configBytes);
  assert.match(fs.readFileSync(plugin.summary.entry, 'utf8'), /user-edited-version/);
});
