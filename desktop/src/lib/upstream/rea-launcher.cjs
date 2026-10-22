#!/usr/bin/env node
'use strict';

// This file is copied unchanged into the explicitly selected installation root.
// Preparation never consults a user's npmrc or searches their document folders.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const PACKAGE_NAME = 'rea-agents';
const PACKAGE_VERSION = '6.7.0';
const NODE_RANGE = '^22.19.0 || ^24.11.0 || >=26.0.0';
const RECEIPT = '.coldcoffee-ready.json';
const LOCK = 'rea-prepare.lock';
const CORE_DEPENDENCIES = ['zod', '@modelcontextprotocol/server'];
const NPM_ARGS = ['ci', '--omit=dev', '--omit=optional', '--ignore-scripts', '--no-audit', '--no-fund'];
const EXIT = { REA_USAGE: 64, REA_NODE_UNSUPPORTED: 65, REA_PATH_ESCAPE: 66, REA_NOT_INSTALLED: 67,
  REA_INCOMPLETE: 67, REA_BUSY: 68, REA_NPM_MISSING: 69, REA_NPM_FAILED: 70,
  REA_PREPARE_TIMEOUT: 71, REA_DEPENDENCY_FAILED: 72, REA_SPAWN_FAILED: 73, REA_ABORTED: 130 };

class ReaError extends Error {
  constructor(code, message) { super(message); this.name = 'ReaError'; this.code = code; this.exitCode = EXIT[code] || 1; }
}

function supportedNode(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(value || ''));
  if (!match) return false;
  const major = Number(match[1]), minor = Number(match[2]);
  return (major === 22 && minor >= 19) || (major === 24 && minor >= 11) || major >= 26;
}

function isInside(root, file) {
  const relative = path.relative(root, file);
  return relative === '' || (relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative));
}

function lstatMaybe(file) {
  try { return fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

function assertOrdinaryPath(file) {
  const chain = [];
  for (let current = path.resolve(file); ; current = path.dirname(current)) {
    chain.push(current);
    if (path.dirname(current) === current) break;
  }
  for (const current of chain.reverse()) {
    const stat = lstatMaybe(current);
    if (stat?.isSymbolicLink() || (stat?.isFile() && stat.nlink > 1)) {
      throw new ReaError('REA_PATH_ESCAPE', 'REA 路径含符号链接、目录联接或硬链接；请使用独立的普通目录。');
    }
  }
}

function scopePath(base, relative) {
  const resolvedBase = path.resolve(base), file = path.resolve(resolvedBase, relative);
  if (!isInside(resolvedBase, file)) throw new ReaError('REA_PATH_ESCAPE', 'REA 路径超出已选安装目录。');
  assertOrdinaryPath(file);
  return file;
}

function layoutOf(base) {
  if (typeof base !== 'string' || !path.isAbsolute(base)) throw new ReaError('REA_PATH_ESCAPE', '请使用明确选择的绝对安装目录。');
  const scope = path.resolve(base);
  assertOrdinaryPath(scope);
  return {
    scope,
    runtime: scopePath(scope, 'runtime/rea'),
    launcher: scopePath(scope, 'rea-launcher.cjs'),
    cache: scopePath(scope, 'cache/npm'),
    lock: scopePath(scope, LOCK),
    receipt: scopePath(scope, 'runtime/rea/' + RECEIPT),
  };
}

function readFile(base, relative, maximum = 32 * 1024 * 1024) {
  const file = scopePath(base, relative), stat = lstatMaybe(file);
  if (!stat || !stat.isFile() || stat.size > maximum) throw new ReaError('REA_INCOMPLETE', 'REA 随包文件缺失、类型错误或过大：' + relative);
  return fs.readFileSync(file);
}

const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');

function parseJson(buffer, label) {
  try { return JSON.parse(buffer.toString('utf8').replace(/^\uFEFF/, '')); }
  catch { throw new ReaError('REA_INCOMPLETE', 'REA 的 ' + label + ' 不是有效 JSON。'); }
}

function assertLockSources(pkg, lock) {
  const local = /^(?:file:|link:|workspace:|git\+|git:|ssh:|\.{1,2}[\\/]|[\\/]|[A-Za-z]:[\\/]|~[\\/])/i;
  for (const group of ['dependencies', 'optionalDependencies', 'devDependencies', 'peerDependencies']) {
    for (const value of Object.values(pkg[group] || {})) {
      if (typeof value !== 'string' || local.test(value)) throw new ReaError('REA_PATH_ESCAPE', 'REA 依赖包含本地路径或非锁定的链接来源。');
    }
  }
  if (![2, 3].includes(lock.lockfileVersion) || !lock.packages || typeof lock.packages !== 'object') {
    throw new ReaError('REA_INCOMPLETE', 'REA 需要随包锁定的 npm package-lock.json（v2/v3）。');
  }
  const root = lock.packages[''];
  if (!root || root.name !== PACKAGE_NAME || root.version !== pkg.version || lock.version !== pkg.version) {
    throw new ReaError('REA_INCOMPLETE', 'REA package.json 与 package-lock.json 的版本不匹配。');
  }
  for (const [relative, entry] of Object.entries(lock.packages)) {
    if (relative && (!relative.startsWith('node_modules/') || relative.includes('\\') || relative.split('/').some((part) => part === '..' || part === '.'))) {
      throw new ReaError('REA_PATH_ESCAPE', 'REA 锁文件中的安装路径超出运行时目录。');
    }
    if (!entry || typeof entry !== 'object' || entry.link || (typeof entry.resolved === 'string' && local.test(entry.resolved))) {
      throw new ReaError('REA_PATH_ESCAPE', 'REA 锁文件包含本地路径或链接依赖。');
    }
  }
}

function readRuntime(base) {
  const layout = layoutOf(base);
  const packageBytes = readFile(base, 'runtime/rea/package.json', 1024 * 1024);
  const lockBytes = readFile(base, 'runtime/rea/package-lock.json');
  const pkg = parseJson(packageBytes, 'package.json'), lock = parseJson(lockBytes, 'package-lock.json');
  if (pkg.name !== PACKAGE_NAME || pkg.version !== PACKAGE_VERSION) throw new ReaError('REA_INCOMPLETE', 'REA 包标识不匹配，预期 ' + PACKAGE_NAME + '@' + PACKAGE_VERSION + '。');
  assertLockSources(pkg, lock);
  readFile(base, 'runtime/rea/scripts/rea.mjs', 1024 * 1024);
  readFile(base, 'runtime/rea/dist/mcp/main.js');
  readFile(base, 'rea-launcher.cjs', 2 * 1024 * 1024);
  return { ...layout, pkg, version: pkg.version, packageHash: digest(packageBytes), lockHash: digest(lockBytes) };
}

function readReceipt(info, nodeVersion) {
  const stat = lstatMaybe(info.receipt);
  if (!stat || !stat.isFile() || stat.size > 65536) return null;
  let receipt;
  try { receipt = JSON.parse(fs.readFileSync(scopePath(info.scope, path.relative(info.scope, info.receipt)), 'utf8')); } catch (error) {
    if (error instanceof ReaError) throw error;
    return null;
  }
  if (receipt.schema !== 1 || receipt.version !== info.version || receipt.packageHash !== info.packageHash || receipt.lockHash !== info.lockHash || !supportedNode(receipt.nodeVersion)) return null;
  if (nodeVersion && receipt.nodeVersion.split('.')[0] !== String(nodeVersion).replace(/^v/, '').split('.')[0]) return null;
  if (!Array.isArray(receipt.entries) || receipt.entries.length !== CORE_DEPENDENCIES.length) return null;
  const modules = scopePath(info.scope, 'runtime/rea/node_modules');
  if (!lstatMaybe(modules)?.isDirectory()) return null;
  for (const name of CORE_DEPENDENCIES) {
    const entry = receipt.entries.find((row) => row.name === name);
    if (!entry || typeof entry.path !== 'string' || !/^node_modules\//.test(entry.path)) return null;
    const file = scopePath(info.scope, 'runtime/rea/' + entry.path);
    if (!isInside(modules, file)) throw new ReaError('REA_PATH_ESCAPE', 'REA 就绪标记指向运行时之外。');
    const fileStat = lstatMaybe(file);
    if (!fileStat?.isFile() || fileStat.size > 32 * 1024 * 1024 || digest(fs.readFileSync(file)) !== entry.sha256) return null;
  }
  return receipt;
}

function statusOf(base) {
  try {
    const info = readRuntime(base), receipt = readReceipt(info);
    return { installed: true, ready: !!receipt, version: info.version, code: receipt ? 'REA_READY' : 'REA_NEEDS_PREPARE',
      message: receipt ? 'REA 运行时依赖已准备。' : 'REA 技能与运行时已安装，依赖尚待准备。', nodeVersion: receipt?.nodeVersion || '' };
  } catch (error) {
    return { installed: false, ready: false, version: '', code: error.code || 'REA_INCOMPLETE', message: error.message };
  }
}

function ensureDirectory(base, relative) {
  const file = scopePath(base, relative);
  fs.mkdirSync(file, { recursive: true });
  scopePath(base, relative);
  if (!fs.statSync(file).isDirectory()) throw new ReaError('REA_PATH_ESCAPE', 'REA 缓存路径不是普通目录。');
  return file;
}

function prepareEnvironment(base, source = process.env, { forMcp = false } = {}) {
  const env = {};
  for (const [key, value] of Object.entries(source)) {
    if (/^(NODE_OPTIONS|NODE_PATH|NODE_V8_COVERAGE|NPM_CONFIG_.*|NPM_TOKEN|NODE_AUTH_TOKEN)$/i.test(key)) continue;
    if (forMcp || /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|TMPDIR|LANG|LC_.*|TERM|CI|PROCESSOR_ARCHITECTURE|NUMBER_OF_PROCESSORS|HTTPS?_PROXY|ALL_PROXY|NO_PROXY)$/i.test(key)) env[key] = value;
  }
  const home = ensureDirectory(base, 'cache/home');
  for (const [key, relative] of Object.entries({ APPDATA: 'cache/home/AppData/Roaming', LOCALAPPDATA: 'cache/home/AppData/Local',
    XDG_CONFIG_HOME: 'cache/home/.config', XDG_CACHE_HOME: 'cache/home/.cache', TEMP: 'cache/tmp', TMP: 'cache/tmp', TMPDIR: 'cache/tmp' })) env[key] = ensureDirectory(base, relative);
  env.HOME = home; env.USERPROFILE = home;
  const cache = ensureDirectory(base, 'cache/npm');
  ensureDirectory(base, 'cache/config');
  for (const name of ['user.npmrc', 'global.npmrc']) {
    const config = scopePath(base, 'cache/config/' + name);
    try { fs.writeFileSync(config, '', { flag: 'wx', mode: 0o600 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    if (readFile(base, 'cache/config/' + name, 1024).length) throw new ReaError('REA_PATH_ESCAPE', 'REA 专用 npm 配置应为空。');
  }
  env.npm_config_cache = cache;
  env.npm_config_userconfig = scopePath(base, 'cache/config/user.npmrc');
  env.npm_config_globalconfig = scopePath(base, 'cache/config/global.npmrc');
  env.npm_config_prefix = ensureDirectory(base, 'cache/npm-prefix');
  env.npm_config_ignore_scripts = 'true';
  env.npm_config_audit = 'false';
  env.npm_config_fund = 'false';
  return env;
}

// Resolve npm's JavaScript entry, never execute npm.cmd through an interpolated shell.
function findNpmCli({ execPath = process.execPath, env = process.env, platform = process.platform, npmCli } = {}) {
  const candidates = [];
  function near(file) {
    if (!file) return;
    const directory = path.dirname(file);
    candidates.push(path.join(directory, 'node_modules/npm/bin/npm-cli.js'), path.join(directory, '../lib/node_modules/npm/bin/npm-cli.js'));
    try { const real = fs.realpathSync(file); if (path.basename(real).toLowerCase() === 'npm-cli.js') candidates.push(real); } catch { /* missing PATH entry */ }
  }
  if (npmCli) candidates.push(npmCli);
  if (path.basename(String(env.npm_execpath || '')).toLowerCase() === 'npm-cli.js') candidates.push(env.npm_execpath);
  near(execPath);
  let realNode;
  try { realNode = fs.realpathSync(execPath); } catch { /* node supplied by command */ }
  if (realNode) near(realNode);
  const pathValue = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] || '';
  for (const segment of String(pathValue).split(platform === 'win32' ? ';' : ':').slice(0, 256)) {
    const directory = segment.replace(/^"|"$/g, '');
    if (!directory || !path.isAbsolute(directory)) continue;
    for (const name of platform === 'win32' ? ['npm.cmd', 'npm.exe', 'npm'] : ['npm']) near(path.join(directory, name));
  }
  for (const candidate of [...new Set(candidates)]) {
    if (!path.isAbsolute(candidate)) continue;
    try { if (fs.statSync(candidate).isFile() && path.basename(candidate).toLowerCase() === 'npm-cli.js') return fs.realpathSync(candidate); } catch { /* next bounded candidate */ }
  }
  throw new ReaError('REA_NPM_MISSING', '找不到 npm-cli.js；请使用包含 npm 的 Node.js 安装，然后重试。');
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code !== 'ESRCH'; }
}

async function acquireLock(base, { lockTimeoutMs = 30000, pollMs = 100, isPidAlive = pidAlive, signal } = {}) {
  const lock = scopePath(base, LOCK), started = Date.now(), token = crypto.randomUUID();
  for (;;) {
    if (signal?.aborted) throw new ReaError('REA_ABORTED', 'REA 准备已中止。');
    try {
      scopePath(base, LOCK);
      const fd = fs.openSync(lock, 'wx', 0o600);
      try { fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, token, createdAt: new Date().toISOString() })); }
      catch (error) { fs.closeSync(fd); fs.unlinkSync(lock); throw error; }
      return () => {
        fs.closeSync(fd);
        try { if (JSON.parse(readFile(base, LOCK, 4096).toString()).token === token) fs.unlinkSync(lock); } catch { /* never remove someone else's lock */ }
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let bytes, stat;
      try { scopePath(base, LOCK); stat = fs.lstatSync(lock); bytes = fs.readFileSync(lock); }
      catch (readError) { if (readError.code === 'ENOENT') continue; throw readError; }
      if (!stat.isFile() || bytes.length > 4096) throw new ReaError('REA_PATH_ESCAPE', 'REA 准备锁文件类型错误。');
      let owner;
      try { owner = JSON.parse(bytes.toString()); } catch { /* interrupted before write */ }
      if ((owner && !isPidAlive(owner.pid)) || (!owner && Date.now() - stat.mtimeMs > 5 * 60000)) {
        // Recheck identity immediately before removing an abandoned lock.
        let current, currentStat;
        try { scopePath(base, LOCK); currentStat = fs.lstatSync(lock); current = fs.readFileSync(lock); }
        catch (readError) { if (readError.code === 'ENOENT') continue; throw readError; }
        if (bytes.equals(current) && stat.ino === currentStat.ino && stat.mtimeMs === currentStat.mtimeMs) {
          fs.unlinkSync(scopePath(base, LOCK));
          continue;
        }
      }
      if (Date.now() - started >= lockTimeoutMs) throw new ReaError('REA_BUSY', '另一个 REA 准备任务仍在运行；请稍后重试。');
      await new Promise((resolve) => setTimeout(resolve, Math.max(1, Math.min(pollMs, lockTimeoutMs))));
    }
  }
}

function runProcess(command, args, { spawnImpl = spawn, cwd, env, timeoutMs = 0, signal, onStdout, onStderr, inherit = false } = {}) {
  return new Promise((resolve) => {
    if (signal?.aborted) { resolve({ ok: false, status: null, stdout: '', stderr: '', timedOut: false, aborted: true }); return; }
    let child, timer, forceTimer, done = false, timedOut = false, aborted = false;
    let stdout = '', stderr = '';
    const tail = (before, chunk) => (before + chunk.toString()).slice(-256 * 1024);
    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer); clearTimeout(forceTimer);
      signal?.removeEventListener('abort', abort);
      resolve({ ...result, stdout, stderr, timedOut, aborted });
    };
    const stop = (kind) => {
      if (done || timedOut || aborted) return;
      clearTimeout(timer);
      if (kind === 'timeout') timedOut = true; else aborted = true;
      try { child?.kill(kind === 'abort' && signal?.reason === 'SIGINT' ? 'SIGINT' : 'SIGTERM'); } catch { /* error/close settles */ }
      if (done) return;
      forceTimer = setTimeout(() => {
        try { child?.kill('SIGKILL'); } catch { /* already gone */ }
        finish({ ok: false, status: null, signal: 'SIGKILL' });
      }, 1500);
    };
    const abort = () => stop('abort');
    try {
      child = spawnImpl(command, args, { cwd, env, shell: false, windowsHide: true, stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'] });
      child.stdout?.on('data', (chunk) => { stdout = tail(stdout, chunk); onStdout?.(chunk); });
      child.stderr?.on('data', (chunk) => { stderr = tail(stderr, chunk); onStderr?.(chunk); });
      child.once('error', (error) => finish({ ok: false, status: null, error }));
      child.once('close', (status, exitSignal) => finish({ ok: status === 0 && !timedOut && !aborted, status, signal: exitSignal }));
      if (timeoutMs > 0) timer = setTimeout(() => stop('timeout'), timeoutMs);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    } catch (error) { finish({ ok: false, status: null, error }); }
  });
}

function assertNodeModules(base) {
  const root = scopePath(base, 'runtime/rea/node_modules');
  if (!lstatMaybe(root)?.isDirectory()) throw new ReaError('REA_DEPENDENCY_FAILED', 'npm 未生成 REA node_modules。');
  const queue = [root];
  let count = 0;
  while (queue.length) {
    const directory = queue.pop();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (++count > 200000) throw new ReaError('REA_DEPENDENCY_FAILED', 'REA 依赖文件数量异常。');
      const file = path.join(directory, entry.name), stat = fs.lstatSync(file);
      if (stat.isSymbolicLink()) {
        let real;
        try { real = fs.realpathSync(file); } catch { throw new ReaError('REA_PATH_ESCAPE', 'REA 依赖包含失效链接。'); }
        if (!isInside(root, real)) throw new ReaError('REA_PATH_ESCAPE', 'REA 依赖链接超出隔离运行时目录。');
      } else if (stat.isDirectory()) queue.push(file);
      else if (!stat.isFile() || stat.nlink > 1) throw new ReaError('REA_PATH_ESCAPE', 'REA 依赖含特殊文件或硬链接。');
    }
  }
}

const VERIFY_SCRIPT = String.raw`
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fs.realpathSync(path.join(process.cwd(), 'node_modules'));
const entries = [];
for (const name of ['zod', '@modelcontextprotocol/server']) {
  const resolved = import.meta.resolve(name);
  const file = fs.realpathSync(fileURLToPath(resolved));
  const relative = path.relative(root, file);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('Dependency outside REA runtime: ' + name);
  await import(resolved);
  entries.push({ name, file });
}
process.stdout.write('\nCOLDCOFFEE_REA_VERIFY:' + JSON.stringify({ entries }) + '\n');
`;

async function verifyDependencies(info, options) {
  const result = await runProcess(options.execPath || process.execPath, ['--input-type=module', '--eval', VERIFY_SCRIPT], {
    spawnImpl: options.spawnImpl, cwd: info.runtime, env: options.childEnv, timeoutMs: options.verifyTimeoutMs ?? 10000,
    signal: options.signal, onStderr: options.log,
  });
  if (result.aborted) throw new ReaError('REA_ABORTED', 'REA 依赖检查已中止。');
  if (result.timedOut) throw new ReaError('REA_PREPARE_TIMEOUT', 'REA 核心依赖导入检查超时。');
  if (!result.ok) throw new ReaError('REA_DEPENDENCY_FAILED', 'REA 核心依赖导入失败（退出码 ' + (result.status ?? result.error?.code ?? 'unknown') + '），可重试准备。');
  let proof;
  try { proof = JSON.parse(result.stdout.split('COLDCOFFEE_REA_VERIFY:').pop().trim()); } catch { /* invalid proof below */ }
  if (!Array.isArray(proof?.entries) || proof.entries.length !== CORE_DEPENDENCIES.length) throw new ReaError('REA_DEPENDENCY_FAILED', 'REA 核心依赖没有返回有效的导入结果。');
  const modules = scopePath(info.scope, 'runtime/rea/node_modules');
  return CORE_DEPENDENCIES.map((name) => {
    const entry = proof.entries.find((row) => row.name === name);
    if (typeof entry?.file !== 'string' || !isInside(modules, path.resolve(entry.file))) throw new ReaError('REA_PATH_ESCAPE', 'REA 核心依赖解析到了运行时之外。');
    const relative = path.relative(info.runtime, entry.file).split(path.sep).join('/');
    return { name, path: relative, sha256: digest(readFile(info.scope, 'runtime/rea/' + relative)) };
  });
}

function saveReceipt(info, nodeVersion, entries) {
  const temporary = scopePath(info.scope, 'runtime/rea/' + RECEIPT + '.' + crypto.randomUUID() + '.tmp');
  const receipt = { schema: 1, version: info.version, packageHash: info.packageHash, lockHash: info.lockHash,
    nodeVersion: String(nodeVersion).replace(/^v/, ''), preparedAt: new Date().toISOString(), entries };
  try {
    fs.writeFileSync(temporary, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    scopePath(info.scope, 'runtime/rea/' + RECEIPT);
    fs.renameSync(temporary, info.receipt);
  } finally { if (lstatMaybe(temporary)) fs.unlinkSync(temporary); }
}

async function prepareScope(base, options = {}) {
  const nodeVersion = options.nodeVersion || process.versions.node;
  if (!supportedNode(nodeVersion)) throw new ReaError('REA_NODE_UNSUPPORTED', 'REA 需要 Node.js ' + NODE_RANGE + '；当前为 ' + nodeVersion + '。');
  let info = readRuntime(base);
  const release = await acquireLock(info.scope, options);
  try {
    info = readRuntime(base);
    const childEnv = prepareEnvironment(info.scope, options.env || process.env);
    const settings = { ...options, childEnv, log: options.log || ((chunk) => process.stderr.write(chunk)) };
    const ready = readReceipt(info, nodeVersion);
    if (lstatMaybe(scopePath(base, 'runtime/rea/node_modules'))) assertNodeModules(base);
    if (!ready) {
      if (lstatMaybe(info.receipt)) fs.unlinkSync(info.receipt);
      const projectNpmrc = lstatMaybe(scopePath(base, 'runtime/rea/.npmrc'));
      if (projectNpmrc && readFile(base, 'runtime/rea/.npmrc', 65536).toString().split(/\r?\n/).some((line) => line.trim() && !/^[;#]/.test(line.trim()))) {
        throw new ReaError('REA_PATH_ESCAPE', 'REA 运行时包含额外 npm 配置，请重新安装原始快照。');
      }
      const npm = findNpmCli(options);
      settings.log('[冷咖啡] 正在为 REA ' + info.version + ' 准备锁定依赖（禁用安装脚本）。\n');
      const result = await runProcess(options.execPath || process.execPath, [npm, ...NPM_ARGS], {
        spawnImpl: options.spawnImpl, cwd: info.runtime, env: childEnv, timeoutMs: options.npmTimeoutMs ?? 8 * 60000,
        signal: options.signal, onStdout: settings.log, onStderr: settings.log,
      });
      if (result.aborted) throw new ReaError('REA_ABORTED', 'REA 依赖安装已中止；已有技能文件保留，可重试。');
      if (result.timedOut) throw new ReaError('REA_PREPARE_TIMEOUT', 'REA 依赖安装超时；已有技能文件保留，可重试。');
      if (!result.ok) throw new ReaError('REA_NPM_FAILED', 'REA npm ci 失败（退出码 ' + (result.status ?? result.error?.code ?? 'unknown') + '）；已有技能文件保留，可重试。');
      assertNodeModules(base);
    }
    let entries;
    try { entries = await verifyDependencies(info, settings); }
    catch (error) { if (lstatMaybe(info.receipt)) fs.unlinkSync(scopePath(base, 'runtime/rea/' + RECEIPT)); throw error; }
    saveReceipt(info, nodeVersion, entries);
    return { ok: true, code: 'REA_READY', message: 'REA ' + info.version + ' 运行时已就绪。', version: info.version, nodeVersion: String(nodeVersion).replace(/^v/, ''), installedDependencies: !ready };
  } finally { release(); }
}

async function runCli(argv = process.argv.slice(2), options = {}) {
  const base = options.base || __dirname, mode = argv[0] || 'mcp';
  const stdout = options.stdout || process.stdout, stderr = options.stderr || process.stderr;
  if (argv.length > 1 || !['--prepare', 'mcp'].includes(mode)) {
    stderr.write('用法：node rea-launcher.cjs [--prepare|mcp]\n');
    return EXIT.REA_USAGE;
  }
  const controller = new AbortController();
  const onInt = () => controller.abort('SIGINT'), onTerm = () => controller.abort('SIGTERM');
  process.once('SIGINT', onInt); process.once('SIGTERM', onTerm);
  try {
    const prepared = await prepareScope(base, { ...options, signal: options.signal || controller.signal, log: (chunk) => stderr.write(chunk) });
    if (mode === '--prepare') { stdout.write(JSON.stringify(prepared) + '\n'); return 0; }
    const info = readRuntime(base);
    const result = await runProcess(options.execPath || process.execPath, [path.join(info.runtime, 'scripts', 'rea.mjs'), 'mcp'], {
      spawnImpl: options.spawnImpl, cwd: info.runtime, env: prepareEnvironment(base, options.env || process.env, { forMcp: true }),
      signal: options.signal || controller.signal, inherit: true,
    });
    if (result.error) throw new ReaError('REA_SPAWN_FAILED', 'REA MCP 启动失败：' + result.error.code);
    if (result.aborted) return (options.signal || controller.signal).reason === 'SIGTERM' ? 143 : 130;
    return Number.isInteger(result.status) ? result.status : result.signal === 'SIGTERM' ? 143 : 1;
  } catch (error) {
    const result = { ok: false, code: error.code || 'REA_PREPARE_FAILED', message: error.message, version: PACKAGE_VERSION };
    if (mode === '--prepare') stdout.write(JSON.stringify(result) + '\n');
    else stderr.write('[冷咖啡] ' + result.code + ': ' + result.message + '\n');
    return error.exitCode || 1;
  } finally { process.removeListener('SIGINT', onInt); process.removeListener('SIGTERM', onTerm); }
}

module.exports = { PACKAGE_NAME, PACKAGE_VERSION, NODE_RANGE, CORE_DEPENDENCIES, NPM_ARGS, ReaError, supportedNode,
  layoutOf, scopePath, readRuntime, statusOf, prepareEnvironment, findNpmCli, acquireLock, runProcess,
  assertNodeModules, prepareScope, runCli, VERIFY_SCRIPT };

if (require.main === module) runCli().then((code) => { process.exitCode = code; }, (error) => {
  process.stderr.write('[冷咖啡] REA launcher: ' + error.message + '\n'); process.exitCode = 1;
});
