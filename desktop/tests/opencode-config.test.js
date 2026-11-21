'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parse } = require('jsonc-parser');
const { ClientConnector } = require('../src/lib/visual-gateway/clients');

const selectedModel = 'relay-fixture/vendor/model-id';
const provider = 'coldcoffee-workbench';
const defaultModel = `${provider}/gateway`;

function fixture(t, envFor = () => ({})) {
  const temp = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(temp, 'cc-opencode-'));
  t.after(() => {
    assert.equal(path.dirname(root), temp);
    fs.rmSync(root, { recursive: true, force: true });
  });
  const home = path.join(root, 'home');
  const engine = { directory: path.join(root, 'engine'), url: 'http://127.0.0.1:3436', port: 3436 };
  const connector = new ClientConnector({ home, env: envFor(root), engine, directory: path.join(root, 'backup') });
  const configRoot = connector.client('opencode').root;
  return { connector, configRoot, engine, home };
}

test('OpenCode installs a compatible default using the exact routed model and restores original JSONC bytes', async t => {
  const { connector, configRoot, home } = fixture(t);
  const configFile = path.join(configRoot, 'opencode.jsonc');
  const original = '\uFEFF{\r\n  // Keep this user comment\r\n  "model": "openai/earlier",\r\n  "enabled_providers": ["openai"],\r\n  "provider": { "openai": { "name": "Existing" } },\r\n}\r\n';
  assert.equal(configRoot, path.join(home, '.config', 'opencode'));
  fs.mkdirSync(configRoot, { recursive: true });
  fs.writeFileSync(configFile, original);

  const plan = await connector.plan('opencode', selectedModel, 64000);
  assert.deepEqual(plan.files, [{ name: 'opencode.jsonc', action: '备份并更新' }]);
  assert.equal(fs.readFileSync(configFile, 'utf8'), original, 'preview must be read-only');
  assert.equal(connector.deploy(plan.id).ok, true);

  const written = fs.readFileSync(configFile, 'utf8');
  const parsed = parse(written.slice(1));
  assert.ok(written.startsWith('\uFEFF'));
  assert.match(written, /\/\/ Keep this user comment\r\n/);
  assert.deepEqual(parsed.provider.openai, { name: 'Existing' });
  assert.deepEqual(parsed.enabled_providers, ['openai', provider]);
  assert.equal(parsed.model, defaultModel);
  assert.equal(parsed.provider[provider].npm, '@ai-sdk/openai-compatible');
  assert.equal(parsed.provider[provider].models.gateway.id, selectedModel);
  assert.equal(parsed.provider[provider].models.gateway.limit.context, 64000);
  assert.equal(parsed.provider[provider].options.baseURL, 'http://127.0.0.1:3436/v1');
  assert.equal((await connector.plan('opencode', selectedModel, 64000)).unchanged, true);
  assert.equal(connector.list().find(item => item.id === 'opencode').supportsSkills, false);
  assert.equal(connector.restore('opencode').ok, true);
  assert.equal(fs.readFileSync(configFile, 'utf8'), original);
});

test('OpenCode reuses a native V2 provider map in a custom config directory', async t => {
  const { connector, configRoot, engine } = fixture(t, root => ({
    XDG_CONFIG_HOME: path.join(root, 'xdg'),
    OPENCODE_CONFIG_DIR: path.join(root, 'chosen-opencode'),
  }));
  assert.equal(path.basename(configRoot), 'chosen-opencode');
  fs.mkdirSync(configRoot, { recursive: true });
  const configFile = path.join(configRoot, 'opencode.json');
  fs.writeFileSync(configFile, JSON.stringify({ providers: { anthropic: { name: 'Existing V2' } }, shell: 'pwsh' }));
  const plan = await connector.plan('opencode', selectedModel);
  connector.deploy(plan.id);
  const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  assert.equal(config.model, defaultModel);
  assert.equal(config.shell, 'pwsh');
  assert.deepEqual(config.providers.anthropic, { name: 'Existing V2' });
  assert.equal(config.providers[provider].models.gateway.modelID, selectedModel);
  assert.equal(config.provider, undefined);
  engine.port = 3437;
  assert.equal(connector.list().find(item => item.id === 'opencode').needsReconnect, true);
});

test('OpenCode honors an explicit config file and removes a newly created file on restore', async t => {
  const { connector, configRoot } = fixture(t, root => ({
    OPENCODE_CONFIG: path.join(root, 'explicit', 'workbench-config.jsonc'),
  }));
  const filename = path.join(configRoot, 'workbench-config.jsonc');
  const plan = await connector.plan('opencode', selectedModel);
  assert.deepEqual(plan.files, [{ name: 'workbench-config.jsonc', action: '新建' }]);
  assert.equal(fs.existsSync(filename), false);
  connector.deploy(plan.id);
  assert.equal(fs.existsSync(filename), true);
  connector.restore('opencode');
  assert.equal(fs.existsSync(filename), false);
});

test('OpenCode rejects stale previews, invalid JSONC and another provider using the same identifier', async t => {
  const { connector, configRoot } = fixture(t);
  const plan = await connector.plan('opencode', selectedModel);
  fs.mkdirSync(configRoot, { recursive: true });
  const configFile = path.join(configRoot, 'opencode.jsonc');
  const original = `{"provider":{"${provider}":{"name":"User-owned provider"}}}`;
  fs.writeFileSync(configFile, original);
  assert.throws(() => connector.deploy(plan.id), /配置位置/);
  await assert.rejects(() => connector.plan('opencode', selectedModel), /同名服务商/);
  assert.equal(fs.readFileSync(configFile, 'utf8'), original);
  fs.writeFileSync(configFile, '{');
  await assert.rejects(() => connector.plan('opencode', selectedModel), /语法错误/);
  assert.equal(fs.readFileSync(configFile, 'utf8'), '{');
});
