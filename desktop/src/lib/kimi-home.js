'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function samePath(left, right) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function normPath(target) {
  return path.resolve(String(target || '')).replace(/\\/g, '/').toLowerCase();
}

function looksLikeKimiInstall(target) {
  const resolved = path.resolve(String(target || ''));
  const norm = normPath(resolved);
  if (norm.includes('/node_modules/')) return true;
  if (/\/appdata\/roaming\/npm(\/|$)/.test(norm)) return true;
  if (fs.existsSync(path.join(resolved, 'kimi.cmd')) || fs.existsSync(path.join(resolved, 'kimi.exe'))) return true;
  const pkg = path.join(resolved, 'package.json');
  if (!fs.existsSync(pkg)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(pkg, 'utf8'));
    const name = String(data.name || '').toLowerCase();
    return name.includes('kimi') || name.includes('moonshot');
  } catch {
    return false;
  }
}

function kimiCodeHome(env = process.env, home = os.homedir()) {
  const configured = String(env.KIMI_CODE_HOME || '').trim();
  if (configured) {
    if (!path.isAbsolute(configured)) throw new Error('KIMI_CODE_HOME 必须是绝对路径');
    return path.resolve(configured);
  }
  return path.join(home, '.kimi-code');
}

function forbiddenLanding(resolved) {
  const norm = normPath(resolved);
  const base = path.basename(resolved).toLowerCase();
  if (base === '.agents' || norm.endsWith('/.agents') || norm.includes('/.agents/')) return 'shared';
  if (base === '.kimi' || /\/\.kimi(\/|$)/.test(norm)) return 'legacy';
  if (norm.endsWith('/.claude/skills') || norm.endsWith('/.codex/skills')) return 'shared';
  if (['credentials', 'sessions', 'plugins', 'config.toml', 'mcp.json', 'tui.toml'].includes(base)) return 'private';
  return '';
}

function assertKimiUserDir(target, env = process.env, home = os.homedir()) {
  const resolved = path.resolve(String(target));
  if (looksLikeKimiInstall(resolved) || looksLikeKimiInstall(path.dirname(resolved))) {
    throw new Error('这是 Kimi 程序安装目录，破甲不写这里');
  }
  const blocked = forbiddenLanding(resolved);
  if (blocked === 'shared') throw new Error('~/.agents/skills 是跨工具通用技能，Kimi K3.1 破甲不写这里');
  if (blocked === 'legacy') throw new Error('~/.kimi 是旧版 kimi-cli，Kimi K3.1 破甲写在 .kimi-code');
  if (blocked === 'private') throw new Error('不写 config.toml、凭据、会话和 mcp.json');
  const expected = kimiCodeHome(env, home);
  if (samePath(resolved, expected)) return resolved;
  const configured = String(env.KIMI_CODE_HOME || '').trim();
  const baseName = path.basename(resolved).toLowerCase();
  const besideGit = fs.existsSync(path.join(path.dirname(resolved), '.git'));
  if (!configured && baseName === '.kimi-code' && !besideGit) return resolved;
  throw new Error('Kimi K3.1 破甲只写入 Kimi Code 数据根 %USERPROFILE%\\.kimi-code（或绝对路径 KIMI_CODE_HOME），技能在 skills/cha-kimi/SKILL.md。不写 ~/.kimi，不写 ~/.agents/skills，不写 config.toml');
}

module.exports = { kimiCodeHome, assertKimiUserDir, looksLikeKimiInstall };
