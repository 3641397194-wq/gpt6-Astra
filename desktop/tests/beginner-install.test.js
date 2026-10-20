'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { scanAll, installOne: installActual, uninstallOne: uninstallActual, findLaunchers, matchLauncher } = require('../src/lib/beginner-install');
const { detectDirectory } = require('../src/lib/detect-directory');
const runtime = require('../src/lib/seat-runtime');
// Exercise the original seat payload and selected-root IDA transaction here.
// Full upstream snapshot integrity and installation are tested independently.
const installOne = (seat, options) => installActual(seat, { ...options, plan: runtime.basePlan });
const uninstallOne = (seat, options) => uninstallActual(seat, { ...options, plan: runtime.basePlan });

test('scan reports each seat without creating directories', () => {
  const missing = path.join(fs.realpathSync(os.tmpdir()), 'cc-newbie-missing-' + process.pid);
  const rows = scanAll({
    seats: ['codex', 'claude'],
    detect(seat) {
      if (seat === 'claude') throw new Error('boom');
      return { root: missing, exists: false, source: 'test', layout: 'default' };
    },
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].ok, true);
  assert.equal(rows[0].exists, false);
  assert.equal(rows[0].name, 'Codex');
  assert.equal(fs.existsSync(missing), false);
  assert.equal(rows[1].ok, false);
  assert.match(rows[1].error, /boom/);
});

test('install writes once, verifies, and refuses a click that was not confirmed', () => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'cc-newbie-'));
  const detect = () => ({ root, exists: true, source: 'test', layout: 'default' });
  assert.throws(() => installOne('codex', { confirm: false, detect }), /一键破甲/);
  const first = installOne('codex', { confirm: true, detect });
  assert.equal(first.ok, true);
  assert.equal(first.verified, true);
  assert.equal(first.toolbox, 'ida');
  assert.match(fs.readFileSync(path.join(root, 'config.toml'), 'utf8'), /127\.0\.0\.1:13337\/mcp/);
  assert.ok(first.changed > 0);
  assert.ok(first.files >= first.changed);
  const again = installOne('codex', { confirm: true, detect });
  assert.equal(again.changed, 0);
  assert.equal(again.verified, true);
  fs.rmSync(root, { recursive: true, force: true });
});

test('cursor install lands in a directory named .cursor', () => {
  const base = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'cc-cursor-'));
  try {
    const install = path.join(base, 'E', 'cursor');
    const roaming = path.join(base, 'Roaming', 'Cursor');
    const user = path.join(base, '.cursor');
    fs.mkdirSync(path.join(install, 'resources', 'app'), { recursive: true });
    fs.writeFileSync(path.join(install, 'Cursor.exe'), '');
    fs.mkdirSync(roaming, { recursive: true });
    fs.mkdirSync(user);
    assert.throws(() => detectDirectory('cursor', { env: { CURSOR_HOME: install }, home: base }), /\.cursor/);
    assert.throws(() => detectDirectory('cursor', { env: { CURSOR_HOME: roaming }, home: base }), /\.cursor/);
    assert.throws(() => runtime.plan('cursor', install), /程序目录|\.cursor/);
    const found = detectDirectory('cursor', { env: { CURSOR_HOME: user }, home: base });
    assert.equal(found.root, path.resolve(user));
    const fallback = detectDirectory('cursor', { env: {}, home: base });
    assert.equal(fallback.root, path.resolve(path.join(base, '.cursor')));
    const refused = require('../src/lib/ida-mcp').attachSeat('cursor', { root: install });
    assert.equal(refused.code, 'location');
    assert.equal(fs.existsSync(path.join(install, 'mcp.json')), false);
    const hooked = require('../src/lib/ida-mcp').attachSeat('cursor', { root: user });
    assert.equal(hooked.code, 'ida');
    assert.equal(JSON.parse(fs.readFileSync(path.join(user, 'mcp.json'), 'utf8')).mcpServers['ida-pro-mcp'].url, 'http://127.0.0.1:13337/mcp');
    const deployed = runtime.deploy('cursor', user, { planFn: runtime.basePlan });
    const rulePath = path.join(user, 'rules', 'cha-cursor.mdc');
    assert.equal(deployed.writes.includes(rulePath), true);
    const head = fs.readFileSync(rulePath, 'utf8').slice(0, 120);
    assert.match(head, /^---\r?\ndescription:/);
    assert.match(head, /alwaysApply: true/);
    assert.equal(fs.existsSync(path.join(install, 'rules')), false);
    assert.equal(fs.existsSync(path.join(roaming, 'rules')), false);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('mimo install lands in .config/mimocode and skips npm', () => {
  const base = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'cc-mimo-'));
  try {
    const user = path.join(base, '.config', 'mimocode');
    const data = path.join(base, '.local', 'share', 'mimocode');
    const local = path.join(base, 'AppData', 'Local', 'mimocode');
    const npm = path.join(base, 'AppData', 'Roaming', 'npm');
    fs.mkdirSync(npm, { recursive: true });
    fs.writeFileSync(path.join(npm, 'mimo.cmd'), '@echo off\r\n');
    fs.writeFileSync(path.join(npm, 'package.json'), JSON.stringify({ name: '@mimo-ai/cli' }));
    const fallback = detectDirectory('mimo', { env: {}, home: base });
    assert.equal(fallback.root, path.resolve(user));
    assert.throws(() => detectDirectory('mimo', { env: { MIMOCODE_HOME: npm }, home: base }), /安装目录/);
    assert.throws(() => detectDirectory('mimo', { env: { MIMOCODE_HOME: 'relative' }, home: base }), /绝对路径/);
    assert.throws(() => runtime.plan('mimo', data), /数据目录|\.config\\mimocode|用户配置目录/);
    assert.throws(() => runtime.plan('mimo', local), /LOCALAPPDATA|用户配置目录/);
    assert.throws(() => runtime.plan('mimo', npm), /安装目录/);
    const xdg = path.join(base, 'xdg');
    const viaXdg = detectDirectory('mimo', { env: { XDG_CONFIG_HOME: xdg }, home: base });
    assert.equal(viaXdg.root, path.resolve(path.join(xdg, 'mimocode')));
    const profile = path.join(base, 'profile');
    const viaHome = detectDirectory('mimo', { env: { MIMOCODE_HOME: profile }, home: base });
    assert.equal(viaHome.root, path.resolve(path.join(profile, 'config')));
    const deployed = runtime.deploy('mimo', user, { planFn: runtime.basePlan });
    const skill = path.join(user, 'skills', 'cha-mimo', 'SKILL.md');
    assert.equal(deployed.writes.includes(skill), true);
    assert.match(fs.readFileSync(skill, 'utf8').slice(0, 80), /^---\r?\nname: cha-mimo/);
    assert.equal(fs.existsSync(path.join(user, 'mimocode.json')), false);
    assert.equal(fs.existsSync(path.join(user, 'auth.json')), false);
    assert.equal(fs.existsSync(path.join(npm, 'skills')), false);
    assert.equal(fs.existsSync(path.join(local, 'skills')), false);
    assert.equal(fs.existsSync(path.join(data, 'skills')), false);
    const hooked = require('../src/lib/ida-mcp').attachSeat('mimo', { root: user });
    assert.equal(hooked.code, 'manual');
    assert.equal(fs.existsSync(path.join(user, 'mcp.json')), false);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('kimi k3 install lands in .kimi-code skills and skips config', () => {
  const base = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'cc-kimi-'));
  try {
    const user = path.join(base, '.kimi-code');
    const agents = path.join(base, '.agents', 'skills');
    const legacy = path.join(base, '.kimi');
    const project = path.join(base, 'repo');
    const npm = path.join(base, 'AppData', 'Roaming', 'npm');
    fs.mkdirSync(project, { recursive: true });
    fs.mkdirSync(path.join(project, '.git'), { recursive: true });
    fs.mkdirSync(npm, { recursive: true });
    fs.writeFileSync(path.join(npm, 'kimi.cmd'), '@echo off\r\n');
    fs.writeFileSync(path.join(project, '.kimi-code'), '');
    const fallback = detectDirectory('kimi', { env: {}, home: base });
    assert.equal(fallback.root, path.resolve(user));
    assert.equal(fallback.source, 'Kimi Code 数据根');
    assert.throws(() => detectDirectory('kimi', { env: { KIMI_CODE_HOME: npm }, home: base }), /安装目录/);
    assert.throws(() => detectDirectory('kimi', { env: { KIMI_CODE_HOME: 'relative' }, home: base }), /绝对路径/);
    assert.throws(() => detectDirectory('kimi', { env: { KIMI_CODE_HOME: agents }, home: base }), /agents/);
    assert.throws(() => detectDirectory('kimi', { env: { KIMI_CODE_HOME: legacy }, home: base }), /\.kimi/);
    assert.throws(() => runtime.plan('kimi', agents), /agents/);
    assert.throws(() => runtime.plan('kimi', legacy), /\.kimi/);
    assert.throws(() => runtime.plan('kimi', path.join(project, '.kimi-code')), /数据根|KIMI_CODE_HOME|\.kimi-code/);
    const relocated = path.join(base, '.config', 'kimi-code');
    const viaHome = detectDirectory('kimi', { env: { KIMI_CODE_HOME: relocated }, home: base });
    assert.equal(viaHome.root, path.resolve(relocated));
    assert.equal(viaHome.source, 'KIMI_CODE_HOME');
    const deployed = runtime.deploy('kimi', user, { planFn: runtime.basePlan });
    const skill = path.join(user, 'skills', 'cha-kimi', 'SKILL.md');
    assert.equal(deployed.writes.includes(skill), true);
    assert.equal(deployed.writes.length, 1);
    const text = fs.readFileSync(skill, 'utf8');
    assert.match(text.slice(0, 120), /^---\r?\nname: cha-kimi/);
    assert.match(text, /description:/);
    assert.equal(fs.existsSync(path.join(user, 'config.toml')), false);
    assert.equal(fs.existsSync(path.join(user, 'mcp.json')), false);
    assert.equal(fs.existsSync(path.join(user, 'credentials')), false);
    assert.equal(fs.existsSync(path.join(user, 'AGENTS.md')), false);
    assert.equal(fs.existsSync(agents), false);
    assert.equal(fs.existsSync(path.join(legacy, 'skills')), false);
    assert.equal(fs.existsSync(path.join(npm, 'skills')), false);
    const hooked = require('../src/lib/ida-mcp').attachSeat('kimi', { root: user });
    assert.equal(hooked.code, 'manual');
    assert.equal(fs.existsSync(path.join(user, 'mcp.json')), false);
    assert.equal(fs.existsSync(path.join(user, 'config.toml')), false);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('uninstall restores the backup and drops the toolbox hook', () => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'cc-undo-'));
  const agents = path.join(root, 'AGENTS.md');
  fs.writeFileSync(agents, 'keep-me\n');
  fs.writeFileSync(path.join(root, 'config.toml'), 'model = "keep"\n');
  const detect = () => ({ root, exists: true, source: 'test', layout: 'default' });
  try {
    assert.throws(() => uninstallOne('codex', { confirm: false, detect }), /一键卸载/);
    const installed = installOne('codex', { confirm: true, detect });
    assert.equal(installed.toolbox, 'ida');
    assert.match(fs.readFileSync(agents, 'utf8'), /CHA-CODEX-POJIA/);
    assert.match(fs.readFileSync(path.join(root, 'config.toml'), 'utf8'), /127\.0\.0\.1:13337\/mcp/);
    const removed = uninstallOne('codex', { confirm: true, detect });
    assert.equal(removed.ok, true);
    assert.ok(removed.restored > 0);
    assert.equal(fs.readFileSync(agents, 'utf8'), 'keep-me\n');
    assert.equal(fs.readFileSync(path.join(root, 'config.toml'), 'utf8'), 'model = "keep"\n');
    assert.equal(fs.existsSync(path.join(root, 'prompts', 'cha-codex.md')), false);
    const again = uninstallOne('codex', { confirm: true, detect });
    assert.equal(again.ok, true);
    assert.equal(again.restored, 0);
    assert.match(again.message, /本来就没有/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('cursor uninstall preserves later user MCP edits and stops the transaction before removing rules', () => {
  const base = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'cc-undo-cursor-'));
  const user = path.join(base, '.cursor');
  fs.mkdirSync(user);
  const detect = () => ({ root: user, exists: true, source: 'test', layout: 'default' });
  try {
    installOne('cursor', { confirm: true, detect });
    const mcp = path.join(user, 'mcp.json');
    const data = { mcpServers: { 'ida-pro-mcp': { url: 'http://127.0.0.1:13337/mcp' }, keep: { url: 'http://127.0.0.1:9' } } };
    fs.writeFileSync(mcp, JSON.stringify(data, null, 2));
    const before = fs.readFileSync(mcp);
    const removed = uninstallOne('cursor', { confirm: true, detect });
    assert.equal(removed.ok, false);
    assert.match(removed.message, /改过|修改|冲突/);
    assert.equal(fs.existsSync(path.join(user, 'rules', 'cha-cursor.mdc')), true);
    assert.deepEqual(fs.readFileSync(mcp), before);
    const left = JSON.parse(fs.readFileSync(mcp, 'utf8'));
    assert.equal(left.mcpServers['ida-pro-mcp'].url, 'http://127.0.0.1:13337/mcp');
    assert.equal(left.mcpServers.keep.url, 'http://127.0.0.1:9');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('launcher lookup only returns matching shortcuts', () => {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'cc-lnk-'));
  fs.writeFileSync(path.join(dir, 'Codex.lnk'), '');
  fs.writeFileSync(path.join(dir, 'Cursor.lnk'), '');
  fs.writeFileSync(path.join(dir, '冷咖啡破甲工作台.lnk'), '');
  fs.writeFileSync(path.join(dir, 'notes.txt'), '');
  const hits = findLaunchers('codex', { platform: 'win32', roots: [dir] });
  assert.deepEqual(hits.map((item) => item.name), ['Codex']);
  const cursorHits = findLaunchers('cursor', { platform: 'win32', roots: [dir] });
  assert.deepEqual(cursorHits.map((item) => item.name), ['Cursor']);
  const hit = matchLauncher('codex', hits[0].path, { platform: 'win32', roots: [dir] });
  assert.equal(hit.name, 'Codex');
  assert.throws(() => matchLauncher('codex', path.join(dir, 'notes.txt'), { platform: 'win32', roots: [dir] }), /快捷方式/);
  fs.rmSync(dir, { recursive: true, force: true });
});
