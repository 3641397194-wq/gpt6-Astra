'use strict';
// Immutable, hash-checked upstream snapshots. Never reads a user's home directory.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');

const SERVER = 'coldcoffee-rea';
const CACHE = new Map();
const digest = (data) => crypto.createHash('sha256').update(data).digest('hex');
const posix = (file) => file.replace(/\\/g, '/');

function resourceDirectory() {
  const unpacked = process.resourcesPath && path.join(process.resourcesPath, 'upstream-skills');
  if (unpacked && fs.existsSync(path.join(unpacked, 'catalog.json'))) return unpacked;
  return path.resolve(__dirname, '../../resources/upstream-skills');
}

function checkedRelative(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0') || value.includes(':') || value.startsWith('/') || value.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('上游资源包含无效相对路径');
  }
  return value;
}

function deploymentRelative(relative, platform = process.platform) {
  checkedRelative(relative);
  // Some upstream Unix test fixtures intentionally have names Windows rejects.
  // Preserve their exact bytes under a content-addressed sidecar, with a map.
  const invalid = platform === 'win32' && relative.split('/').some((part) => /[<>"|?*\x00-\x1f]/.test(part) || /[ .]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
  return invalid ? `.coldcoffee-preserved/${digest(relative)}.bin` : relative;
}

function readCatalog(directory = resourceDirectory()) {
  const key = 'catalog:' + directory;
  if (CACHE.has(key)) return CACHE.get(key);
  const catalog = JSON.parse(fs.readFileSync(path.join(directory, 'catalog.json'), 'utf8'));
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.sources) || catalog.sources.length !== 2 || !catalog.runtime) throw new Error('完整技能资源清单缺失或版本错误');
  for (const source of catalog.sources) {
    if (!/^[a-z0-9-]+$/.test(source.id) || !/^[a-f0-9]{40}$/.test(source.commit) || !Array.isArray(source.skills)) throw new Error('上游来源信息格式错误');
    checkedRelative(source.bundle);
    for (const skill of source.skills) checkedRelative(skill.path);
  }
  checkedRelative(catalog.runtime.bundle);
  CACHE.set(key, catalog);
  return catalog;
}

function bundleFiles(descriptor, directory = resourceDirectory()) {
  const key = descriptor.sha256 + ':' + directory;
  if (CACHE.has(key)) return CACHE.get(key);
  const packed = fs.readFileSync(path.join(directory, checkedRelative(descriptor.bundle)));
  if (digest(packed) !== descriptor.sha256) throw new Error(`上游资源包校验失败：${descriptor.id}`);
  const bundle = JSON.parse(zlib.gunzipSync(packed, { maxOutputLength: 768 * 1024 * 1024 }).toString('utf8'));
  if (bundle.schemaVersion !== 1 || bundle.id !== descriptor.id || !Array.isArray(bundle.files)) throw new Error('上游资源包结构错误');
  const seen = new Set();
  const files = bundle.files.map((entry) => {
    const relative = checkedRelative(entry.path);
    const key = process.platform === 'win32' ? relative.toLowerCase() : relative;
    if (seen.has(key)) throw new Error(`上游资源包含重复文件：${relative}`);
    seen.add(key);
    const data = Buffer.from(entry.content, 'base64');
    if (data.length !== entry.bytes || data.length > 64 * 1024 * 1024 || digest(data) !== entry.sha256 || !['100644', '100755'].includes(entry.mode)) throw new Error(`上游文件完整性检查失败：${relative}`);
    return { path: relative, data, sha256: entry.sha256, mode: entry.mode === '100755' ? 0o755 : 0o644 };
  });
  if (files.length !== descriptor.fileCount || files.reduce((sum, item) => sum + item.data.length, 0) !== descriptor.bytes) throw new Error('上游资源文件数量或大小与清单不符');
  CACHE.set(key, files);
  return files;
}

function catalog() {
  const locked = readCatalog();
  const sources = locked.sources.map((source) => ({ ...source, skillCount: source.skills.length }));
  return {
    schemaVersion: 1,
    sources,
    skillCount: sources.reduce((sum, source) => sum + source.skillCount, 0),
    fileCount: sources.reduce((sum, source) => sum + source.fileCount, 0) + locked.runtime.fileCount,
    bytes: sources.reduce((sum, source) => sum + source.bytes, 0) + locked.runtime.bytes,
    runtime: { version: locked.runtime.version, nodeRange: locked.runtime.nodeRange, fileCount: locked.runtime.fileCount },
  };
}

function skillName(source, skill, used) {
  let name = `cc-${source.id === 'rea' ? 'rea' : 'rs'}-${skill.name || path.posix.basename(path.posix.dirname(skill.path))}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  if (name.length > 64) name = name.slice(0, 54).replace(/-$/, '') + '-' + digest(skill.path).slice(0, 8);
  if (used.has(name)) name = name.slice(0, 54).replace(/-$/, '') + '-' + digest(skill.path).slice(0, 8);
  if (used.has(name)) throw new Error('上游技能入口重名');
  used.add(name);
  return name;
}

function licenseText(source, skillPath = '') {
  if (source.id === 'reverse-skill') {
    if (skillPath.startsWith('CTF-Sandbox-Orchestrator/')) return 'GPL-3.0（CTF-Sandbox-Orchestrator 独立许可证）';
    if (skillPath.startsWith('skills/pentest-tools/src-hunter/')) return 'MIT（MyuriKanao 独立版权声明）';
    return '主体 MIT；CTF-Sandbox-Orchestrator 为 GPL-3.0，src-hunter 为独立 MIT；burp-mcp-full 固定快照未发现独立许可证';
  }
  return `${source.license}；第三方依赖和子模块保留各自许可证与声明`;
}

function wrapper(source, skill, name, original, sourceRoot) {
  return [
    '---', `name: ${name}`, `description: ${JSON.stringify(`冷咖啡扩展 · ${skill.description || skill.name || name}`)}`, '---', '',
    `# 冷咖啡扩展 · ${skill.name || name}`, '',
    `- 上游：${source.repository}`, `- 固定提交：${source.commit}`, `- 原始入口：\`${posix(original)}\``, `- 完整来源目录：\`${posix(sourceRoot)}\``,
    `- 许可：${licenseText(source, skill.path)}；原作者、原文、资源与许可证保存在完整来源目录。`, '',
    '此文件仅作客户端适配入口，不是上游正文的删减版本。先读取上述原始入口；所有相对资源路径以原始入口所在目录为准，仓库根路径使用上述完整来源目录。',
    '需要运行上游脚本时使用该来源目录内的脚本，不从其他用户配置中复制工具、凭证或工作成果。',
    '“冷咖啡”仍使用原来的启动说明与完整欢迎词；此扩展不改写欢迎词或群号。技能、工具连接、外部分析器各自核对，不把文件存在当作模型效果证明。', '',
  ].join('\n');
}

function mcpInfo(seat, root, { zcode = false } = {}) {
  const launcher = path.join(root, '.coldcoffee-upstream', 'rea-launcher.cjs');
  const entry = { command: 'node', args: [launcher, 'mcp'] };
  if (seat === 'codex') return { configured: true, mode: 'toml', file: path.join(root, 'config.toml'), entry, message: 'REA stdio 连接随安装写入；重启客户端后连接' };
  if (seat === 'grok') return { configured: false, mode: 'cli', entry, message: 'Grok 有多个客户端，MCP 路径各不相同；完整技能与 REA 已附带，请按所用客户端手动接入，不猜写 config.toml' };
  if (seat === 'deepseek') return { configured: true, mode: 'dsh', file: path.join(root, 'cordis.patch.yml'), entry, message: 'DeepSeek 官方 Harness 的 Cordis MCP 插件入口随安装写入' };
  if (seat === 'cursor' || seat === 'workbuddy') return { configured: true, mode: 'json', file: path.join(root, 'mcp.json'), keys: ['mcpServers', SERVER], entry, message: 'REA stdio 连接随安装写入；重启客户端后连接' };
  if (seat === 'gemini') return { configured: true, mode: 'json', file: path.join(root, 'settings.json'), keys: ['mcpServers', SERVER], entry, message: 'REA stdio 连接随安装写入；客户端允许列表仍以其当前设置为准' };
  if (seat === 'glm53' && zcode) return { configured: true, mode: 'json', file: path.join(root, 'cli', 'config.json'), keys: ['mcp', 'servers', SERVER], entry: { type: 'stdio', command: 'node', args: [launcher, 'mcp'], enabled: true }, feature: ['features', 'mcp'], message: 'ZCode 官方 stdio MCP 入口随安装写入；已显式禁用的 MCP 功能保留原设置并中止本次安装' };
  return { configured: false, mode: 'cli', entry, message: '完整技能与 REA 程序已附带；此客户端使用所附 CLI/MCP 连接说明，不猜写未确认的全局配置' };
}

function loaderText(sourceRoot) {
  return [
    '# 冷咖啡 · 完整技能扩展入口', '',
    '保留原“冷咖啡”启动词、完整欢迎词与三个 QQ 群号。此扩展只补充技能索引，不替换原词包。',
    `激活后按任务读取 \`${posix(path.join(sourceRoot, 'INDEX.md'))}\`，选择相应技能原始入口；资源与脚本均以完整来源树中的原路径为准。`,
    'REA 需要工具时使用 coldcoffee-rea MCP；未连接时按所附运行说明修复或使用同一固定版本 CLI。不要用“技能已安装”代替真实工具结果。', '',
  ].join('\n');
}

function installationWrites(seat, root, { zcode = false, directory } = {}) {
  const locked = readCatalog(directory);
  const out = [];
  const base = path.join(root, '.coldcoffee-upstream');
  const skillsRoot = seat === 'doubao' ? root : path.join(root, 'skills');
  const names = new Set();
  const preserved = [];
  const index = ['# 冷咖啡 · 完整上游技能索引', '', '原有启动词和完整欢迎词保持不变。下列入口和所有资源均随一键安装写入；相对引用以原始入口所在目录为准。', ''];
  const raw = (file, data, mode = 0o644, source = '') => ({ kind: 'asset', file, data, mode, source, home: root });
  for (const source of locked.sources) {
    const sourceRoot = path.join(base, 'sources', source.id);
    for (const file of bundleFiles(source, directory)) {
      const deployedPath = deploymentRelative(file.path);
      if (deployedPath !== file.path) preserved.push({ source: source.id, path: file.path, deployedPath, sha256: file.sha256, bytes: file.data.length, reason: 'Windows 非法文件名；原路径和原始字节已无损保留' });
      out.push(raw(path.join(sourceRoot, deployedPath), file.data, file.mode, source.id));
    }
    index.push(`## ${source.name} · ${source.version}`, '', `来源：${source.repository} · 固定提交：${source.commit} · 许可：${licenseText(source)}`, '');
    for (const skill of source.skills) {
      const name = skillName(source, skill, names);
      const original = path.join(sourceRoot, skill.path);
      const text = wrapper(source, skill, name, original, sourceRoot);
      out.push(raw(path.join(skillsRoot, name, 'SKILL.md'), Buffer.from(text), 0o644, source.id));
      index.push(`- **${skill.name || name}**：\`${posix(original)}\` — ${String(skill.description || '').replace(/\s+/g, ' ')}`);
    }
    index.push('');
  }
  const runtimeRoot = path.join(base, 'runtime', 'rea');
  for (const file of bundleFiles(locked.runtime, directory)) out.push(raw(path.join(runtimeRoot, file.path), file.data, file.mode, 'rea-runtime'));
  const launcher = fs.readFileSync(path.join(__dirname, 'upstream', 'rea-launcher.cjs'));
  out.push(raw(path.join(base, 'rea-launcher.cjs'), launcher, 0o755, 'coldcoffee-adapter'));
  const info = mcpInfo(seat, root, { zcode });
  const harnessPlugin = seat === 'deepseek' ? require('./harness-install').installationWrites(root) : null;
  const manifest = { ...locked, adapter: 'coldcoffee-upstream-v1', seat, skillCount: names.size, preservedPaths: preserved, mcp: info, ...(harnessPlugin ? { harnessPlugin: harnessPlugin.summary } : {}) };
  out.push(raw(path.join(base, 'manifest.json'), Buffer.from(JSON.stringify(manifest, null, 2) + '\n')));
  // An authoritative snapshot also retains Unix symlink records and all paths.
  for (const source of locked.sources) {
    const bytes = fs.readFileSync(path.join(directory || resourceDirectory(), source.bundle));
    if (digest(bytes) !== source.sha256) throw new Error('来源快照在安装前发生变化');
    out.push(raw(path.join(base, 'snapshots', source.bundle), bytes, 0o644, 'snapshot'));
  }
  index.push('## REA 程序与依赖', '', `已附带官方固定发行版 ${locked.runtime.version}；Node 要求：${locked.runtime.nodeRange}。`,
    `CLI：\`node ${JSON.stringify(posix(path.join(base, 'rea-launcher.cjs')))} <命令>\``,
    `MCP：\`node ${JSON.stringify(posix(path.join(base, 'rea-launcher.cjs')))} mcp\``,
    '依赖准备只在本扩展目录中执行锁定的 npm ci，不复制客户机上的 API Key、浏览器凭证或历史资料。Ghidra、IDA、JDK、ADB 等外部分析器仍按任务需要单独检测。', '',
    `客户端连接说明：${info.message}`, '',
    '## 来源与许可证', '',
    'REA 原文及其 THIRD_PARTY_NOTICES.md、licenses/ 和所有已固定子模块一并保留。reverse-skill 根 MIT、CTF-Sandbox-Orchestrator GPL-3.0 以及 src-hunter 独立 MIT 均保持原文；这些独立来源文件不改标成冷咖啡原创。',
    'burp-mcp-full/ 的固定快照未发现独立 LICENSE、COPYING 或 NOTICE；保留上游根许可证和来源记录，不把该子目录宣称为已有独立许可的组件。', '');
  if (harnessPlugin) index.push('## DeepSeek Harness 冷咖啡插件', '',
    `原生入口：\`${posix(harnessPlugin.summary.entry)}\`，随同技能写入 Cordis 补丁。`,
    'Web 与桌面界面提供冰蓝开屏、技能索引、任务进度与结果面板；仅在 Harness 提供 webServer 时启用界面，TUI 继续使用原有技能入口。',
    '任务继续使用本安装的 REA 与 reverse-skill，不另外下载词包，也不改动原“冷咖啡”完整欢迎词。', '');
  out.push(raw(path.join(base, 'INDEX.md'), Buffer.from(index.join('\n'))));
  const body = loaderText(base);
  out.push(raw(path.join(skillsRoot, 'coldcoffee-upstream', 'SKILL.md'), Buffer.from(`---\nname: coldcoffee-upstream\ndescription: 冷咖啡激活后的完整 REA 与 reverse-skill 技能索引；用户需要逆向、分析或选择扩展技能时读取。\n---\n\n${body}`)));
  const loaderFiles = { codex: 'AGENTS.md', claude: 'CLAUDE.md', grok: 'AGENTS.md', deepseek: 'AGENTS.md', glm53: zcode ? 'AGENTS.md' : 'GLM.md', gemini: 'GEMINI.md' };
  if (loaderFiles[seat]) out.push({ kind: 'marked', file: path.join(root, loaderFiles[seat]), body: `<!-- COLDCOFFEE-UPSTREAM:BEGIN -->\n${body}<!-- COLDCOFFEE-UPSTREAM:END -->\n`, begin: '<!-- COLDCOFFEE-UPSTREAM:BEGIN -->', end: '<!-- COLDCOFFEE-UPSTREAM:END -->', home: root });
  if (seat === 'cursor') out.push(raw(path.join(root, 'rules', 'coldcoffee-upstream.mdc'), Buffer.from(`---\ndescription: 冷咖啡完整技能索引\nalwaysApply: true\n---\n\n${body}`)));
  if (info.configured) {
    if (info.feature) out.push({ kind: 'upstream-mcp', file: info.file, mode: 'json', entry: true, keys: info.feature, rejectDisabled: true, home: root });
    out.push({ kind: 'upstream-mcp', file: info.file, mode: info.mode, entry: info.entry, keys: info.keys, home: root });
  }
  if (harnessPlugin) out.push(...harnessPlugin.writes);
  return { writes: out, summary: { skillCount: names.size, fileCount: out.length, preservedPaths: preserved.length, mcp: info, ...(harnessPlugin ? { harnessPlugin: harnessPlugin.summary } : {}) } };
}

function extendPlan(spec, seat, { directory, zcode = false } = {}) {
  const roots = [...new Set(spec.writes.map((item) => item.home || spec.home))];
  const writes = [...spec.writes];
  let summary;
  for (const root of roots) {
    const extra = installationWrites(seat, root, { zcode: zcode || (seat === 'glm53' && root !== spec.home), directory });
    writes.push(...extra.writes);
    if (!summary) summary = extra.summary;
  }
  return { ...spec, writes, upstream: summary };
}

module.exports = { SERVER, checkedRelative, deploymentRelative, resourceDirectory, readCatalog, bundleFiles, catalog, installationWrites, extendPlan, mcpInfo, digest };
