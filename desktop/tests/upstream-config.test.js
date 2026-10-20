'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const JSONC = require('jsonc-parser');
const TOML = require('smol-toml');
const YAML = require('yaml');
const { SERVER } = require('../src/lib/upstream-skills');
const { patchMcp, patchJson, patchToml, patchHarness } = require('../src/lib/upstream-config');

const entry = Object.freeze({ command: 'node', args: ['.coldcoffee-upstream/rea-launcher.cjs', 'mcp'] });
const jsonItem = { mode: 'json', keys: ['mcpServers', SERVER], entry };
const tomlItem = { mode: 'toml', entry };
const harnessItem = { mode: 'dsh', entry };

test('JSONC patch preserves user comments, other MCP entries, and entry-specific settings', () => {
  const source = `// user-owned header\n{\n  "mcpServers": {\n    // keep this unrelated connection\n    "other": { "command": "other-client" },\n    "${SERVER}": { "command": "old", "args": ["old"], "env": { "TOKEN": "synthetic" }, "timeout": 19 }\n  },\n  "otherSetting": true\n}\n`;
  const result = patchJson(source, jsonItem);
  const parsed = JSONC.parse(result);
  assert.match(result, /user-owned header/);
  assert.match(result, /keep this unrelated connection/);
  assert.deepEqual(parsed.mcpServers.other, { command: 'other-client' });
  assert.equal(parsed.otherSetting, true);
  assert.deepEqual(parsed.mcpServers[SERVER], { command: entry.command, args: entry.args, env: { TOKEN: 'synthetic' }, timeout: 19 });
});

test('JSONC patch is idempotent and creates a missing configuration from empty input', () => {
  const first = patchJson('', jsonItem);
  assert.deepEqual(JSONC.parse(first).mcpServers[SERVER], entry);
  assert.equal(patchJson(first, jsonItem), first);
  assert.deepEqual(JSONC.parse(patchMcp('{}', jsonItem)).mcpServers[SERVER], entry);
});

test('JSONC patch rejects duplicate keys, malformed JSONC, and incompatible object paths', () => {
  assert.throws(() => patchJson('{"mcpServers": {}, "mcpServers": {}}', jsonItem), /重复字段/);
  assert.throws(() => patchJson('{ "mcpServers": ', jsonItem), /有效 JSON 对象/);
  assert.throws(() => patchJson('[]', jsonItem), /有效 JSON 对象/);
  assert.throws(() => patchJson('{ "mcpServers": [] }', jsonItem), /应为对象/);
});

test('ZCode feature setup enables a missing MCP flag, keeps unrelated settings and respects explicit disablement', () => {
  const item = { mode: 'json', keys: ['features', 'mcp'], entry: true, rejectDisabled: true };
  const original = '// ZCode customer settings\n{ "features": { "other": true }, "model": "synthetic" }\n';
  const result = patchJson(original, item);
  assert.equal(JSONC.parse(result).features.mcp, true);
  assert.equal(JSONC.parse(result).features.other, true);
  assert.equal(JSONC.parse(result).model, 'synthetic');
  assert.match(result, /ZCode customer settings/);
  assert.equal(patchJson(result, item), result);
  assert.throws(() => patchJson('{ "features": { "mcp": false } }', item), /显式禁用/);
  assert.throws(() => patchJson('{ "features": { "mcp": "no" } }', item), /布尔值/);
});

test('TOML patch replaces only its managed block and preserves other tables/comments', () => {
  const source = `# user-owned header\n[tool]\nkeep = "yes"\n\n# COLDCOFFEE-REA:BEGIN\n[mcp_servers.${SERVER}]\ncommand = "old"\nargs = ["old"]\nenabled = false\n# COLDCOFFEE-REA:END\n\n[other]\nvalue = 7\n`;
  const result = patchToml(source, tomlItem);
  const parsed = TOML.parse(result);
  assert.match(result, /user-owned header/);
  assert.match(result, /COLDCOFFEE-REA:BEGIN/);
  assert.match(result, /COLDCOFFEE-REA:END/);
  assert.equal(parsed.tool.keep, 'yes');
  assert.equal(parsed.other.value, 7);
  assert.equal(parsed.mcp_servers[SERVER].command, 'node');
  assert.deepEqual(Array.from(parsed.mcp_servers[SERVER].args), entry.args);
  assert.equal(parsed.mcp_servers[SERVER].enabled, true);
  assert.equal(patchToml(result, tomlItem), result);
});

test('TOML patch refuses unmanaged name collisions, disabled servers, and malformed markers/files', () => {
  assert.throws(() => patchToml(`[mcp_servers.${SERVER}]\ncommand = "user-owned"\n`, tomlItem), /未由本安装器管理/);
  assert.throws(() => patchToml(`disabled_mcp_servers = ["${SERVER}"]\n`, tomlItem), /disabled_mcp_servers/);
  assert.throws(() => patchToml('mcp_servers = [\n', tomlItem), /TOML 解析失败/);
  assert.throws(() => patchToml('# COLDCOFFEE-REA:BEGIN\n[other]\nx = 1\n', tomlItem), /标记损坏或重复/);
  assert.throws(() => patchToml(`# COLDCOFFEE-REA:BEGIN\n[mcp_servers.${SERVER}]\ncommand = "node"\n# COLDCOFFEE-REA:END\n# COLDCOFFEE-REA:END\n`, tomlItem), /标记损坏或重复/);
});

test('Harness Cordis patch preserves comments and unrelated plugins and refreshes only the owned entry', () => {
  const source = `# keep this user note\n- insert:\n    - id: other-plugin\n      name: community/plugin\n      config:\n        enabled: true\n    - id: coldcoffee-rea-mcp\n      name: old/plugin\n      config:\n        serverName: old-name\n        transport: old-transport\n        retained: synthetic-value\n`;
  const result = patchHarness(source, harnessItem);
  const parsed = YAML.parse(result);
  assert.match(result, /keep this user note/);
  assert.deepEqual(parsed[0].insert[0], { id: 'other-plugin', name: 'community/plugin', config: { enabled: true } });
  assert.deepEqual(parsed[0].insert[1], {
    id: 'coldcoffee-rea-mcp', name: '@deepseek-ai/dsh-mcp-client',
    config: { serverName: SERVER, transport: 'stdio', command: entry.command, args: entry.args, retained: 'synthetic-value' },
  });
  assert.equal(patchHarness(result, harnessItem), result);
});

test('Harness Cordis patch adds an entry to a valid patch list and is idempotent', () => {
  const result = patchHarness('- insert: []\n', harnessItem);
  assert.deepEqual(YAML.parse(result)[1].insert[0], {
    id: 'coldcoffee-rea-mcp', name: '@deepseek-ai/dsh-mcp-client',
    config: { serverName: SERVER, transport: 'stdio', command: entry.command, args: entry.args },
  });
  assert.equal(patchHarness(result, harnessItem), result);
  const empty = patchHarness('', harnessItem);
  assert.equal(YAML.parse(empty).length, 1);
  assert.deepEqual(YAML.parse(empty)[0].insert[0], {
    id: 'coldcoffee-rea-mcp', name: '@deepseek-ai/dsh-mcp-client',
    config: { serverName: SERVER, transport: 'stdio', command: entry.command, args: entry.args },
  });
});

test('Harness Cordis patch refuses duplicate owned entries, direct overrides, and conditional groups', () => {
  const owned = { id: 'coldcoffee-rea-mcp', name: '@deepseek-ai/dsh-mcp-client', config: { serverName: SERVER } };
  assert.throws(() => patchHarness(YAML.stringify([{ insert: [owned, owned] }]), harnessItem), /重复 REA 插件入口/);
  assert.throws(() => patchHarness(YAML.stringify([{ id: 'coldcoffee-rea-mcp', enabled: false }]), harnessItem), /后续覆盖补丁/);
  assert.throws(() => patchHarness(YAML.stringify([{ id: 'conditional-group', insert: [owned] }]), harnessItem), /条件分组/);
});

test('Harness Cordis patch rejects duplicate YAML keys, malformed YAML, and invalid patch structures', () => {
  assert.throws(() => patchHarness('- insert: []\n  insert: []\n', harnessItem), /有效的 YAML 补丁列表/);
  assert.throws(() => patchHarness('- insert: [\n', harnessItem), /有效的 YAML 补丁列表/);
  assert.throws(() => patchHarness('{"not": "a list"}\n', harnessItem), /有效的 YAML 补丁列表/);
  assert.throws(() => patchHarness('- insert: {}\n', harnessItem), /insert 不是列表/);
  assert.throws(() => patchHarness('- scalar-entry\n', harnessItem), /未知结构/);
});

test('patchMcp rejects an unknown configuration format', () => {
  assert.throws(() => patchMcp('', { mode: 'unknown', entry }), /未知 REA 客户端配置格式/);
});
