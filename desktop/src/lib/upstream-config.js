'use strict';
const TOML = require('smol-toml');
const YAML = require('yaml');
const JSONC = require('jsonc-parser');
const { SERVER } = require('./upstream-skills');

function patchJson(text, item) {
  const errors = [];
  const tree = text.trim() ? JSONC.parseTree(text, errors, { allowTrailingComma: true }) : null;
  if (errors.length || (tree && tree.type !== 'object')) throw new Error('MCP 配置不是有效 JSON 对象；原文件保持不变');
  function unique(node) {
    if (!node) return;
    if (node.type === 'object') {
      const names = new Set();
      for (const member of node.children || []) {
        const name = member.children[0].value;
        if (names.has(name)) throw new Error(`MCP JSON 存在重复字段：${name}；请先整理`);
        names.add(name);
      }
    }
    for (const child of node.children || []) unique(child);
  }
  unique(tree);
  const base = tree ? JSONC.getNodeValue(tree) : {};
  const keys = item.keys;
  for (let index = 1; index < keys.length; index += 1) {
    const parent = JSONC.findNodeAtLocation(tree, keys.slice(0, index));
    if (parent && parent.type !== 'object') throw new Error('MCP 服务器表应为对象；原配置未覆盖');
  }
  const current = keys.reduce((node, key) => node && node[key], base);
  if (item.rejectDisabled && current === false) throw new Error('ZCode features.mcp 已显式禁用；请先在客户端启用 MCP 后重试');
  if (item.rejectDisabled && current !== undefined && typeof current !== 'boolean') throw new Error('ZCode features.mcp 应为布尔值；请先整理原配置');
  // Keep caller-specific environment/timeouts while replacing our own command.
  const value = current && typeof current === 'object' && !Array.isArray(current) ? { ...current, ...item.entry } : item.entry;
  if (JSON.stringify(current) === JSON.stringify(value)) return text;
  const input = tree ? text : '{}\n';
  return JSONC.applyEdits(input, JSONC.modify(input, keys, value, { formattingOptions: { insertSpaces: true, tabSize: 2, eol: text.includes('\r\n') ? '\r\n' : '\n' } }));
}

function patchToml(text, item) {
  let data;
  try { data = TOML.parse(text.replace(/^\uFEFF/, '')); } catch (error) { throw new Error(`MCP TOML 解析失败：${error.message}`); }
  if (Array.isArray(data.disabled_mcp_servers) && data.disabled_mcp_servers.includes(SERVER)) throw new Error('REA 被当前客户端的 disabled_mcp_servers 禁用；请先在该客户端取消禁用');
  const begin = '# COLDCOFFEE-REA:BEGIN';
  const end = '# COLDCOFFEE-REA:END';
  const block = [begin, `[mcp_servers.${SERVER}]`, 'command = "node"', `args = ${JSON.stringify(item.entry.args)}`, 'enabled = true', end].join('\n') + '\n';
  const starts = text.split(begin).length - 1;
  const ends = text.split(end).length - 1;
  let result;
  if (starts || ends) {
    if (starts !== 1 || ends !== 1 || text.indexOf(end) < text.indexOf(begin)) throw new Error('REA 配置标记损坏或重复；原文件保持不变');
    const stop = text.indexOf(end) + end.length;
    result = text.slice(0, text.indexOf(begin)) + block.trimEnd() + text.slice(stop);
  } else {
    if (data.mcp_servers && Object.hasOwn(data.mcp_servers, SERVER)) throw new Error('存在未由本安装器管理的同名 REA 连接；请先重命名或移除该项');
    result = text + (text && !text.endsWith('\n') ? '\n' : '') + (text && !text.endsWith('\n\n') ? '\n' : '') + block;
  }
  try { TOML.parse(result.replace(/^\uFEFF/, '')); } catch (error) { throw new Error(`合并后的 MCP TOML 校验失败：${error.message}`); }
  return result;
}

function patchHarness(text, item) {
  const doc = YAML.parseDocument(text.trim() ? text : '[]\n', { uniqueKeys: true });
  if (doc.errors.length || !YAML.isSeq(doc.contents)) throw new Error('Harness cordis.patch.yml 应为有效的 YAML 补丁列表；原文件保持不变');
  // Bound aliases and reject expression-backed IDs before editing owned entries.
  const value = doc.toJS({ maxAliasCount: 100 });
  const id = 'coldcoffee-rea-mcp';
  const desired = { id, name: '@deepseek-ai/dsh-mcp-client', config: { serverName: SERVER, transport: 'stdio', ...item.entry } };
  let count = 0;
  let found;
  for (let index = 0; index < value.length; index += 1) {
    const operation = value[index];
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)) throw new Error('Harness 补丁包含未知结构；请先整理后重试');
    if (operation.id === id) throw new Error('Harness 已存在同名的后续覆盖补丁；请先检查其配置');
    if (operation.insert != null && !Array.isArray(operation.insert)) throw new Error('Harness insert 不是列表；原文件保持不变');
    for (let at = 0; at < (operation.insert || []).length; at += 1) {
      const entry = operation.insert[at];
      if (entry && entry.id === id) {
        count += 1;
        found = [index, 'insert', at];
        if (operation.id != null) throw new Error('REA 所在的 Harness 插入补丁带条件分组；请先检查是否启用');
        desired.config = { ...(entry.config || {}), ...desired.config };
        if (JSON.stringify(entry) === JSON.stringify(desired) && count === 1) continue;
      }
    }
  }
  if (count > 1) throw new Error('Harness 包含重复 REA 插件入口；原文件保持不变');
  if (found) {
    const current = value[found[0]].insert[found[2]];
    if (JSON.stringify(current) === JSON.stringify(desired)) return text;
    doc.setIn(found, desired);
  } else doc.contents.add(doc.createNode({ insert: [desired] }));
  const result = doc.toString();
  const checked = YAML.parseDocument(result, { uniqueKeys: true });
  if (checked.errors.length || !YAML.isSeq(checked.contents)) throw new Error('Harness 合并结果校验失败');
  return result;
}

function patchMcp(text, item) {
  if (item.mode === 'json') return patchJson(text, item);
  if (item.mode === 'toml') return patchToml(text, item);
  if (item.mode === 'dsh') return patchHarness(text, item);
  throw new Error('未知 REA 客户端配置格式');
}

module.exports = { patchMcp, patchJson, patchToml, patchHarness };
