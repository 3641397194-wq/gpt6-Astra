'use strict';
// Headless, fixture-only renderer check. No personal profiles or client directories are read.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const fixture = {
  skillCount: 94, fileCount: 700, bytes: 10 * 1024 * 1024,
  runtime: { version: '6.7.0', nodeRange: '^22.19.0 || ^24.11.0 || >=26.0.0' },
  sources: [
    { id: 'rea', name: 'REA', repository: 'https://github.com/morluto/rea', commit: '833136507dd79d959340b09862a53af344e4f1b3', version: '6.7.0', license: 'MIT', fileCount: 101, bytes: 2 * 1024 * 1024, skillCount: 5,
      skills: Array.from({ length: 5 }, (_, index) => ({ name: index ? 'rea-skill-' + index : 'rea-runner', path: 'skills/rea-' + index + '/SKILL.md', description: index ? '夹具技能说明' : '<img src=x onerror=alert(1)> 按原文显示' })) },
    { id: 'reverse-skill', name: 'reverse-skill', repository: 'https://github.com/zhaoxuya520/reverse-skill', commit: 'cab634bd855fc287f6e420c1f36fd1a6b9245960', version: '1.0.1', license: 'MIT / GPL-3.0', fileCount: 599, bytes: 8 * 1024 * 1024, skillCount: 89,
      skills: Array.from({ length: 89 }, (_, index) => ({ name: 'reverse-skill-' + index, path: 'skills/skill-' + index + '/SKILL.md', description: '夹具完整技能' })) },
  ],
};
const result = (seat = 'codex', installed = false, ready = false) => ({ seat, upstream: {
  skillCount: installed ? 94 : 0, fileCount: installed ? 700 : 0, verified: installed,
  mcp: { configured: installed, mode: installed ? 'stdio' : 'pending', message: installed ? 'REA 连接配置已写入，重启客户端加载。' : '尚未在隔离目录安装。' },
  runtime: { ok: ready, ready, version: '6.7.0', message: ready ? 'REA 依赖准备完成。' : 'REA 运行依赖尚未准备。' },
} });

(async () => {
  const commands = [];
  const server = http.createServer((request, response) => {
    if (request.url === '/api/session') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ nonce: 'fixture-nonce-only' })); return;
    }
    if (request.url === '/api/command') {
      let body = '';
      request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => {
        const command = JSON.parse(body);
        commands.push({ ...command, nonce: request.headers['x-coldcoffee-token'] });
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ result: command.action === 'upstream-catalog' ? fixture : result(command.payload.seat) }));
      }); return;
    }
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    const file = path.resolve(root, '.' + decodeURIComponent(pathname));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { response.statusCode = 404; response.end(); return; }
    if (file.endsWith('index.html')) {
      const html = fs.readFileSync(file, 'utf8')
        .replace(/<script\b[^>]*src="(?!upstream-skills-view\.js")[^"]*"[^>]*><\/script>/g, '')
        .replace('<section id="page-packs" class="page">', '<section id="page-packs" class="page active">')
        .replace('<section id="page-relay" class="page active">', '<section id="page-relay" class="page">');
      response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); return;
    }
    const types = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
    response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    response.end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.COLDCOFFEE_BROWSER_CHANNEL ? { channel: process.env.COLDCOFFEE_BROWSER_CHANNEL } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (value) => { window.fixtureCopied = value; } } }); });
    const url = `http://127.0.0.1:${server.address().port}/src/workbench/index.html`;
    await page.goto(url);
    await page.waitForFunction(() => document.getElementById('upstream-total-skills').textContent === '94');
    assert.equal(await page.locator('#upstream-context').textContent(), '隔离预览 · 不读取个人目录');
    assert.deepEqual(commands.map((entry) => entry.action), ['upstream-catalog']);
    assert.equal(commands[0].nonce, 'fixture-nonce-only');
    assert.equal(await page.locator('.upstream-source').count(), 2);
    assert.equal(await page.locator('.upstream-source .upstream-source-links').count(), 0, 'Source cards must not contain the removed action row');
    assert.equal(await page.locator('.upstream-source').getByText(/查看原仓库|固定快照/).count(), 0, 'Removed source/snapshot actions must not remain hidden in the DOM');
    assert.equal(await page.locator('.upstream-source details.upstream-version').count(), 0, 'Source cards must not include the removed metadata disclosure');
    assert.equal(await page.locator('.upstream-source').getByText(/版本与许可证|上游版本|固定提交|查看许可证原文/).count(), 0);
    for (const source of fixture.sources) {
      assert.equal(await page.locator('.upstream-source h3').getByText(source.name, { exact: true }).count(), 1);
      assert.equal((await page.locator('#upstream-sources').textContent()).includes(source.commit), false);
    }
    assert.equal(await page.locator('#upstream-prepare').isDisabled(), true);
    await page.locator('.upstream-all>summary').click();
    assert.equal(await page.locator('#upstream-skill-list li').count(), 94);
    assert.equal(await page.locator('#upstream-skills a[href*="github.com"]').count(), 0, 'Expanded skills must not expose other repositories as promotion links');
    assert.equal(await page.locator('#upstream-skill-list a').count(), 0, 'Skill titles are plain text');
    assert.equal(await page.locator('#upstream-skills img').count(), 0);
    await page.locator('#upstream-search').fill('rea-runner');
    assert.equal(await page.locator('#upstream-skill-list li').count(), 1);
    assert.match(await page.locator('#upstream-skill-list').textContent(), /<img src=x onerror=alert\(1\)>/);
    await page.locator('#upstream-search').fill('');
    assert.equal(await page.locator('#upstream-skills a[href*="github.com"]').count(), 0, 'Search refresh must keep skill titles as text');
    await page.locator('#upstream-seat').selectOption('deepseek');
    assert.equal(commands.length, 1, 'Selecting a seat must not inspect a user directory automatically');
    await page.locator('#upstream-status-check').click();
    await page.waitForFunction(() => document.getElementById('upstream-rea-state').textContent.includes('尚未在隔离目录安装'));
    assert.equal(commands.at(-1).payload.seat, 'deepseek');
    assert.equal(commands.at(-1).action, 'upstream-status');
    const pendingRuntime = result('codex', true, false);
    pendingRuntime.upstream.runtime.ok = true;
    await page.evaluate((detail) => window.dispatchEvent(new CustomEvent('coldcoffee:upstream-install', { detail })), pendingRuntime);
    assert.equal(await page.locator('#upstream-runtime-state').getAttribute('data-state'), 'pending', 'A successful status call is not proof of ready dependencies');
    await page.evaluate((detail) => window.dispatchEvent(new CustomEvent('coldcoffee:upstream-install', { detail })), result('claude', true, true));
    assert.equal(await page.locator('#upstream-install-state').textContent(), '文件已核验');
    assert.equal(await page.locator('#upstream-seat').inputValue(), 'claude');
    assert.match(await page.locator('#upstream-result-note').textContent(), /重启目标软件/);
    await page.locator('#upstream-copy-word').click();
    assert.equal(await page.evaluate(() => window.fixtureCopied), '冷咖啡');
    await page.setViewportSize({ width: 800, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    await context.close();

    const desktopContext = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
    await desktopContext.addInitScript(({ fixture, ready }) => {
      window.fixtureCalls = [];
      window.ColdCoffeeCore = { DEEPSEEK_LABEL: 'DeepSeek v4.1 Flash 10.17版本' };
      window.coldbrew = { beginner: async (action, payload = {}) => {
        window.fixtureCalls.push({ action, payload });
        return action === 'catalog' ? fixture : { ...ready, seat: payload.seat };
      } };
    }, { fixture, ready: result('codex', true, true) });
    const desktopPage = await desktopContext.newPage();
    desktopPage.on('pageerror', (error) => errors.push(error.message));
    await desktopPage.goto(url);
    await desktopPage.waitForFunction(() => document.getElementById('upstream-total-skills').textContent === '94');
    assert.equal(await desktopPage.locator('#upstream-seat option[value="deepseek"]').textContent(), 'DeepSeek v4.1 Flash 10.17版本');
    assert.deepEqual(await desktopPage.evaluate(() => window.fixtureCalls.map((entry) => entry.action)), ['catalog']);
    await desktopPage.locator('#upstream-refresh').click();
    await desktopPage.waitForFunction(() => window.fixtureCalls.filter((entry) => entry.action === 'catalog').length === 2 && document.getElementById('upstream-skills').getAttribute('aria-busy') === 'false');
    assert.equal(await desktopPage.locator('.upstream-source .upstream-source-links').count(), 0, 'Refreshing the catalog must not resurrect removed source actions');
    assert.equal(await desktopPage.locator('.upstream-source').getByText(/查看原仓库|固定快照/).count(), 0);
    assert.equal(await desktopPage.locator('.upstream-source details.upstream-version').count(), 0, 'Refreshing the catalog must not resurrect metadata details');
    assert.equal(await desktopPage.locator('.upstream-source').getByText(/版本与许可证|上游版本|固定提交|查看许可证原文/).count(), 0);
    assert.deepEqual(await desktopPage.locator('.upstream-source h3').allTextContents(), ['REA', 'reverse-skill']);
    await desktopPage.locator('.upstream-all>summary').click();
    assert.equal(await desktopPage.locator('#upstream-skill-list li').count(), 94);
    assert.equal(await desktopPage.locator('#upstream-skills a[href*="github.com"]').count(), 0, 'Catalog refresh must not restore repository links');
    await desktopPage.locator('.upstream-all>summary').click();
    await desktopPage.locator('#upstream-prepare').click();
    await desktopPage.locator('#upstream-confirm-cancel').click();
    assert.equal(await desktopPage.evaluate(() => window.fixtureCalls.length), 2);
    await desktopPage.locator('#upstream-prepare').click();
    await desktopPage.locator('#upstream-confirm-ok').click();
    await desktopPage.waitForFunction(() => document.getElementById('upstream-runtime-state').textContent.includes('依赖准备完成'));
    assert.deepEqual(await desktopPage.evaluate(() => window.fixtureCalls.at(-1)), { action: 'upstream-prepare', payload: { seat: 'codex', confirm: true } });

    // Drive the actual uninstall button while old IPC reads are pending. A late
    // status, preparation, or catalog response must not resurrect removed files.
    await desktopPage.evaluate(({ fixture, ready }) => {
      window.coldbrew.beginner = async (action, payload = {}) => {
        window.fixtureCalls.push({ action, payload });
        if (action === 'scan') return [{ ok: true, exists: true, seat: 'codex', name: 'Codex', line: 'GPT', root: 'fixture-only', launchers: [] }];
        if (action === 'uninstall') return { ok: true, seat: payload.seat, message: '已经按夹具备份撤回。' };
        if (action === window.fixtureHoldAction) return new Promise((resolve) => {
          window.fixturePendingAction = action;
          window.fixtureRelease = () => {
            window.fixturePendingAction = null;
            resolve(action === 'catalog' ? { ...fixture, installed: ready } : { ...ready, seat: payload.seat });
          };
        });
        return action === 'catalog' ? fixture : { ...ready, seat: payload.seat };
      };
    }, { fixture, ready: result('codex', true, true) });
    await desktopPage.addScriptTag({ url: new URL('newbie.js', url).href });
    await desktopPage.waitForFunction(() => document.querySelectorAll('#newbie-cards .newbie-card').length === 1);
    for (const action of ['upstream-status', 'upstream-prepare', 'catalog']) {
      for (const seat of ['claude', 'codex']) await desktopPage.evaluate((detail) => window.dispatchEvent(new CustomEvent('coldcoffee:upstream-install', { detail })), result(seat, true, true));
      await desktopPage.evaluate((held) => { window.fixtureHoldAction = held; }, action);
      await desktopPage.locator(action === 'catalog' ? '#upstream-refresh' : action === 'upstream-prepare' ? '#upstream-prepare' : '#upstream-status-check').click();
      if (action === 'upstream-prepare') await desktopPage.locator('#upstream-confirm-ok').click();
      await desktopPage.waitForFunction((held) => window.fixturePendingAction === held, action);
      await desktopPage.locator('#newbie-undo').click();
      await desktopPage.locator('#pack-confirm-ok').click();
      await desktopPage.waitForFunction(() => document.getElementById('upstream-result-note').textContent.includes('已经按夹具备份撤回'));
      assert.equal(await desktopPage.locator('#upstream-install-state').textContent(), '等待检查', action);
      assert.equal(await desktopPage.locator('#upstream-rea-state').getAttribute('data-state'), 'idle', action);
      assert.equal(await desktopPage.locator('#upstream-runtime-state').getAttribute('data-state'), 'idle', action);
      await desktopPage.evaluate(() => { window.fixtureHoldAction = null; window.fixtureRelease(); });
      await desktopPage.waitForFunction(() => document.getElementById('upstream-skills').getAttribute('aria-busy') === 'false');
      assert.equal(await desktopPage.locator('#upstream-install-state').textContent(), '等待检查', `late ${action}`);
      await desktopPage.locator('#upstream-seat').selectOption('claude');
      assert.equal(await desktopPage.locator('#upstream-install-state').textContent(), '文件已核验', 'Uninstall must leave other seats cached');
      await desktopPage.locator('#upstream-seat').selectOption('codex');
      assert.equal(await desktopPage.locator('#upstream-install-state').textContent(), '等待检查', 'Switching back must not restore the uninstalled seat cache');
    }
    assert.deepEqual(errors, []);
    await desktopContext.close();
    console.log('PASS: 简洁来源卡无仓库入口及版本详情、94 项标题纯文本无GitHub外链、搜索与刷新不恢复已删入口、保留两来源名称、来源文本转义、同源 nonce、手动状态检查、安装事件、依赖确认/取消、实际卸载按钮清理对应缓存、三类迟到响应失效、隔离预览不写入、中文启动口令、无横向溢出。');
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
