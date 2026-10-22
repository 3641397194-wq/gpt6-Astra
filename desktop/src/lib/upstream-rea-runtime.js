'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const launcher = require('./upstream/rea-launcher.cjs');
const BUNDLED_LAUNCHER = path.join(__dirname, 'upstream', 'rea-launcher.cjs');
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');

function scopeOf(root) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw new launcher.ReaError('REA_PATH_ESCAPE', '请先明确选择安装目录的绝对路径。');
  return launcher.layoutOf(path.join(path.resolve(root), '.coldcoffee-upstream'));
}

function sameLauncher(layout) {
  const stat = fs.lstatSync(layout.launcher);
  if (!stat.isFile() || stat.size > 2 * 1024 * 1024 || hash(fs.readFileSync(layout.launcher)) !== hash(fs.readFileSync(BUNDLED_LAUNCHER))) {
    throw new launcher.ReaError('REA_LAUNCHER_MISMATCH', 'REA 启动器与本版软件不匹配，请重新执行安装。');
  }
}

// This is deliberately read-only and looks only at the explicitly chosen root.
function statusRea(root) {
  try {
    const layout = scopeOf(root), status = launcher.statusOf(layout.scope);
    if (status.installed) sameLauncher(layout);
    return status;
  } catch (error) {
    return { installed: false, ready: false, version: '', code: error.code || 'REA_INCOMPLETE', message: error.message };
  }
}

async function prepareRea(root, { nodeCommand = 'node', spawnImpl, timeoutMs = 10 * 60000, env = process.env, signal, onLog } = {}) {
  let version = '';
  try {
    const layout = scopeOf(root), status = launcher.statusOf(layout.scope);
    version = status.version;
    if (!status.installed) return { ok: false, code: status.code, message: status.message, version };
    sameLauncher(layout);
    if (typeof nodeCommand !== 'string' || !nodeCommand.trim() || nodeCommand.includes('\0')) throw new launcher.ReaError('REA_NODE_MISSING', 'Node.js 命令未配置。');
    const childEnv = { ...env };
    for (const key of Object.keys(childEnv)) if (/^(NODE_OPTIONS|NODE_PATH|NODE_V8_COVERAGE)$/i.test(key)) delete childEnv[key];
    const result = await launcher.runProcess(nodeCommand, [layout.launcher, '--prepare'], {
      spawnImpl, cwd: layout.runtime, env: childEnv, timeoutMs, signal,
      onStderr: typeof onLog === 'function' ? (chunk) => onLog(chunk.toString()) : undefined,
    });
    if (result.aborted) return { ok: false, code: 'REA_ABORTED', message: 'REA 准备已中止；技能文件保留，可稍后重试。', version };
    if (result.timedOut) return { ok: false, code: 'REA_PREPARE_TIMEOUT', message: 'REA 依赖准备超时；技能文件保留，可稍后重试。', version };
    if (result.error) return { ok: false, code: result.error.code === 'ENOENT' ? 'REA_NODE_MISSING' : 'REA_SPAWN_FAILED',
      message: result.error.code === 'ENOENT' ? '找不到 Node.js；请安装 Node.js ' + launcher.NODE_RANGE + ' 后重试。' : 'REA 准备进程启动失败：' + result.error.message, version };
    let parsed;
    try { parsed = JSON.parse(result.stdout.trim()); } catch { /* machine-readable result required */ }
    if (!parsed || typeof parsed.ok !== 'boolean' || typeof parsed.code !== 'string' || typeof parsed.message !== 'string') {
      return { ok: false, code: 'REA_INVALID_RESULT', message: 'REA 启动器未返回有效准备结果（退出码 ' + result.status + '）。', version };
    }
    if (parsed.ok && !result.ok) return { ok: false, code: 'REA_PREPARE_FAILED', message: 'REA 准备进程异常退出（退出码 ' + result.status + '）。', version };
    if (parsed.ok && !statusRea(root).ready) return { ok: false, code: 'REA_NOT_READY', message: 'REA 准备结果未通过文件状态复核；请重试准备。', version };
    return { ...parsed, ok: parsed.ok && result.ok, version: parsed.version || version };
  } catch (error) {
    return { ok: false, code: error.code || 'REA_PREPARE_FAILED', message: error.message, version };
  }
}

module.exports = { prepareRea, statusRea };
