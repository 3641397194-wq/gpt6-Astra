'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function samePath(left, right) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function looksLikeMimoInstall(target) {
  const resolved = path.resolve(String(target || ''));
  const norm = resolved.replace(/\\/g, '/').toLowerCase();
  if (norm.includes('/node_modules/@mimo-ai') || norm.includes('/node_modules/mimo')) return true;
  if (/\/appdata\/roaming\/npm(\/|$)/.test(norm)) return true;
  if (fs.existsSync(path.join(resolved, 'mimo.cmd'))) return true;
  const pkg = path.join(resolved, 'package.json');
  if (!fs.existsSync(pkg)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(pkg, 'utf8'));
    return String(data.name || '').startsWith('@mimo-ai/');
  } catch {
    return false;
  }
}

function mimoConfigDir(env = process.env, home = os.homedir()) {
  const configured = String(env.MIMOCODE_HOME || '').trim();
  if (configured) {
    if (!path.isAbsolute(configured)) throw new Error('MIMOCODE_HOME 必须是绝对路径');
    return path.join(path.resolve(configured), 'config');
  }
  const xdg = String(env.XDG_CONFIG_HOME || '').trim();
  const base = xdg ? path.resolve(xdg) : path.join(home, '.config');
  return path.join(base, 'mimocode');
}

function assertMimoUserDir(target, env = process.env, home = os.homedir()) {
  const resolved = path.resolve(String(target));
  if (looksLikeMimoInstall(resolved) || looksLikeMimoInstall(path.dirname(resolved))) {
    throw new Error('这是 MiniMax 3.1 Flash 程序安装目录，破甲不写这里');
  }
  const expected = mimoConfigDir(env, home);
  if (samePath(resolved, expected)) return resolved;
  const parentName = path.basename(path.dirname(resolved)).toLowerCase();
  const baseName = path.basename(resolved).toLowerCase();
  if (parentName === 'share' || parentName === 'state' || parentName === 'cache' || parentName === 'data') {
    throw new Error('这是 MiniMax 3.1 Flash 的数据目录，不写 auth.json，也不写数据库');
  }
  if (baseName === 'mimocode' && parentName === '.config' && !String(env.MIMOCODE_HOME || '').trim()) return resolved;
  throw new Error('MiniMax 3.1 Flash 破甲只写入用户配置目录 %USERPROFILE%\\.config\\mimocode（或 MIMOCODE_HOME\\config、XDG_CONFIG_HOME\\mimocode），不写 npm 安装目录，不写 %LOCALAPPDATA%，也不写 auth.json');
}

module.exports = { mimoConfigDir, assertMimoUserDir, looksLikeMimoInstall };
