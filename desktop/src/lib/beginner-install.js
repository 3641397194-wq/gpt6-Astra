'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { detectDirectory } = require('./detect-directory');
const { SeatTransactions } = require('./seat-transactions');
const { PACK_IDS } = require('./seat-runtime');
const { attachSeat, detachSeat } = require('./ida-mcp');
const { DEEPSEEK_LABEL } = require('../shared/workbench-core');

const CARDS = {
  codex: { name: 'Codex', line: 'GPT' },
  claude: { name: 'Claude', line: 'Code' },
  grok: { name: 'Grok', line: '4.7' },
  deepseek: { name: DEEPSEEK_LABEL, line: 'Harness' },
  glm53: { name: 'GLM', line: '5.3' },
  gemini: { name: 'Gemini', line: '全模型' },
  doubao: { name: '豆包', line: '技能' },
  workbuddy: { name: 'WorkBuddy', line: '搭档' },
  cursor: { name: 'Cursor', line: '.cursor' },
  mimo: { name: 'MiMo-V2.6-Pro', line: '.config' },
  kimi: { name: 'Kimi K3', line: '.kimi-code' },
};

const LAUNCH = {
  codex: [/codex/i],
  claude: [/claude/i],
  grok: [/grok/i],
  deepseek: [/deepseek/i],
  glm53: [/zcode/i, /智谱/, /chatglm/i],
  gemini: [/gemini/i],
  doubao: [/doubao/i, /豆包/],
  workbuddy: [/workbuddy/i],
  cursor: [/cursor/i],
  mimo: [/mimo/i],
  kimi: [/kimi/i],
};

const SKIP_LINK = /破甲|冷咖啡|coldcoffee|coldbrew/i;

function cardOf(seat) {
  return CARDS[seat] || { name: seat, line: '' };
}

function scanAll({ detect = detectDirectory, seats = PACK_IDS } = {}) {
  return seats.map((seat) => {
    const card = cardOf(seat);
    try {
      const found = detect(seat);
      return {
        ok: true,
        seat,
        name: card.name,
        line: card.line,
        root: found.root,
        exists: !!found.exists,
        source: found.source,
        layout: found.layout || 'default',
      };
    } catch (error) {
      return { ok: false, seat, name: card.name, line: card.line, error: error.message };
    }
  });
}

function installOne(seat, { confirm, detect = detectDirectory, createTx = () => new SeatTransactions() } = {}) {
  if (confirm !== true) throw new Error('请先在界面上点「一键破甲」');
  if (!PACK_IDS.includes(seat)) throw new Error('未知席位');
  const found = detect(seat);
  const tx = createTx();
  tx.select(found.root, { layout: found.layout || 'default' });
  const plan = tx.preview(seat);
  const deployed = tx.deploy(plan.id);
  const verified = tx.verify(seat);
  const toolbox = attachSeat(seat, { root: found.root, layout: found.layout || 'default' });
  return {
    ok: true,
    seat,
    root: found.root,
    existed: !!found.exists,
    changed: deployed.changed,
    verified: verified.ok,
    files: verified.checks.length,
    toolbox: toolbox.code,
    toolboxFile: toolbox.file || '',
    message: deployed.message,
  };
}

function sayBlock(error) {
  const text = String(error && error.message || error || '');
  if (text.includes('文件已被其他操作修改') || text.includes('恢复中断')) return '这份文件在安装之后又被改过，卸载停住了，没有覆盖。';
  return text || '卸载停住了';
}

function uninstallOne(seat, { confirm, detect = detectDirectory, createTx = () => new SeatTransactions() } = {}) {
  if (confirm !== true) throw new Error('请先在界面上点「一键卸载」');
  if (!PACK_IDS.includes(seat)) throw new Error('未知软件');
  const found = detect(seat);
  const toolbox = detachSeat(seat, { root: found.root, layout: found.layout || 'default' });
  const tx = createTx();
  tx.select(found.root, { layout: found.layout || 'default' });
  let restored = 0;
  let files = 0;
  let blocked = '';
  for (let round = 0; round < 20; round += 1) {
    const applied = tx.history().filter((row) => row.seat === seat && row.status === 'applied');
    if (!applied.length) break;
    try {
      const result = tx.restore(applied[0].id);
      restored += 1;
      files += result.restored || 0;
    } catch (error) {
      blocked = sayBlock(error);
      break;
    }
  }
  const left = tx.verify(seat);
  let message = '这里本来就没有要撤的内容。';
  if (blocked) message = blocked;
  else if (restored) message = '已经撤回，文件回到安装之前。';
  else if (left.ok) message = '文件还在，但没有找到可撤回的备份。';
  return {
    ok: !blocked && (restored > 0 || !left.ok),
    seat,
    root: found.root,
    restored,
    files,
    stillThere: !!left.ok,
    toolbox: toolbox.code,
    toolboxFile: toolbox.file || '',
    message,
  };
}

function defaultLaunchRoots({ home = os.homedir(), env = process.env } = {}) {
  return [
    path.join(home, 'Desktop'),
    path.join(home, 'OneDrive', 'Desktop'),
    env.APPDATA ? path.join(env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs') : '',
    env.ProgramData ? path.join(env.ProgramData, 'Microsoft', 'Windows', 'Start Menu', 'Programs') : '',
  ].filter(Boolean);
}

function collectShortcuts(options = {}) {
  const platform = options.platform || process.platform;
  if (platform !== 'win32') return [];
  const roots = options.roots || defaultLaunchRoots(options);
  const links = [];
  function walk(dir, depth) {
    if (depth > 3) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, depth + 1);
      else if (entry.isFile() && /\.lnk$/i.test(entry.name) && !SKIP_LINK.test(entry.name)) {
        links.push({ name: entry.name.replace(/\.lnk$/i, ''), path: full });
      }
    }
  }
  for (const root of roots) walk(root, 0);
  return links;
}

function launchersFrom(seat, links) {
  const patterns = LAUNCH[seat] || [];
  if (!patterns.length) return [];
  return links.filter((item) => patterns.some((pattern) => pattern.test(item.name))).slice(0, 4);
}

function findLaunchers(seat, options = {}) {
  return launchersFrom(seat, collectShortcuts(options));
}

function matchLauncher(seat, targetPath, options = {}) {
  const wanted = path.resolve(String(targetPath || ''));
  const hit = findLaunchers(seat, options).find((item) => path.resolve(item.path) === wanted);
  if (!hit) throw new Error('没有找到这个软件的快捷方式');
  return hit;
}

module.exports = { CARDS, scanAll, installOne, uninstallOne, findLaunchers, matchLauncher, collectShortcuts, launchersFrom, defaultLaunchRoots };
