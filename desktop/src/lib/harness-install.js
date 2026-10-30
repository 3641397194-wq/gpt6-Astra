'use strict';

// Deployment uses only application-owned assets. It never inspects another
// client's configuration, credentials or skill directories.
const fs = require('node:fs');
const path = require('node:path');

const PLUGIN_ID = 'coldcoffee-harness';
const PLUGIN_FILES = Object.freeze([
  'package.json',
  'index.mjs',
  'ui/panel.css',
  'ui/theme.css',
  'ui/host.css',
  'ui/panel.js',
  'ui/rem-blue.svg',
]);
const OPTIONAL_FILES = Object.freeze(['ui/rem-blue.png', 'ui/rem-blue.webp', 'ui/harness-background.png']);
const MAX_ASSET_BYTES = 16 * 1024 * 1024;

function pluginDirectory() {
  return path.join(__dirname, 'harness-plugin');
}

function readAsset(directory, relative) {
  const file = path.join(directory, ...relative.split('/'));
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_ASSET_BYTES) throw new Error(`Harness 插件资源格式或大小错误：${relative}`);
  return fs.readFileSync(file);
}

function installationWrites(root, { directory = pluginDirectory() } = {}) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw new Error('Harness 插件安装需要明确的绝对目录');
  const base = path.join(root, '.coldcoffee-upstream');
  const target = path.join(base, 'harness-plugin');
  const files = PLUGIN_FILES.map(relative => ({ relative, data: readAsset(directory, relative) }));
  for (const relative of OPTIONAL_FILES) {
    if (fs.existsSync(path.join(directory, ...relative.split('/')))) files.push({ relative, data: readAsset(directory, relative) });
  }
  files.push({ relative: 'welcome.md', data: readAsset(path.join(__dirname, 'packs'), 'activation-reply.md') });
  const pkg = JSON.parse(files.find(file => file.relative === 'package.json').data.toString('utf8'));
  if (typeof pkg.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version) || pkg.type !== 'module') throw new Error('Harness 插件版本或 ESM 入口声明错误');
  const entry = path.join(target, 'index.mjs');
  const configFile = path.join(root, 'cordis.patch.yml');
  const writes = files.map(({ relative, data }) => ({
    kind: 'asset', file: path.join(target, ...relative.split('/')), data, mode: 0o644, source: 'coldcoffee-harness-plugin', home: root,
  }));
  // Cordis loads absolute native modules. The plugin uses optional webServer
  // injection, so installing it does not introduce a WebUI dependency in TUI.
  writes.push({
    kind: 'harness-plugin', file: configFile, home: root,
    entry: { id: PLUGIN_ID, name: entry, config: { dshHome: root, upstreamRoot: base, animations: true } },
  });
  return {
    writes,
    summary: { enabled: true, version: pkg.version, directory: target, entry, configFile, ui: 'optional-web-server', profiles: ['web', 'desktop'], files: files.map(file => file.relative) },
  };
}

function statusFromChecks(summary, root, checks = []) {
  if (!summary || !Array.isArray(summary.files)) return { enabled: false, installed: false, message: '此席位没有 DeepSeek Harness 原生插件' };
  const expected = summary.files.map(relative => path.relative(root, path.join(summary.directory, ...relative.split('/'))).replace(/\\/g, '/'));
  expected.push(path.relative(root, summary.configFile).replace(/\\/g, '/'));
  const normalize = value => process.platform === 'win32' ? value.toLowerCase() : value;
  const byPath = new Map(checks.map(check => [normalize(String(check.path).replace(/\\/g, '/')), check]));
  const matched = expected.filter(relative => {
    const check = byPath.get(normalize(relative));
    return check?.ok === true && check.exists === true;
  }).length;
  const installed = matched === expected.length;
  return { enabled: true, installed, version: summary.version, directory: summary.directory, configFile: summary.configFile, matched, total: expected.length,
    message: installed ? '原生插件文件与 Cordis 配置已核对；运行连接以 Harness 界面状态为准' : '原生插件文件或 Cordis 配置尚未完整匹配' };
}

module.exports = { PLUGIN_ID, PLUGIN_FILES, OPTIONAL_FILES, pluginDirectory, installationWrites, statusFromChecks };
