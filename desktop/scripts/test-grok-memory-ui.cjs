'use strict';
// Headless actual renderer + real memory controller/protocol, fixture transport only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { fixture } = require('../tests/grok-memory-fixture.cjs');
const { LOCAL_AGENT_PROFILES, SEATS } = require('../src/shared/workbench-core');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'work/grok-memory-ui');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png' };

(async () => {
  fs.mkdirSync(output, { recursive: true });
  const f = fixture();
  let browser;
  const report = { ok: false, fixtureOnly: true, checks: [], screenshots: [], errors: [], externalRequests: [] };
  const check = name => report.checks.push(name);
  try {
    const launch = fs.existsSync(chromium.executablePath()) ? {} : process.platform === 'win32' ? { channel: 'msedge' } : {};
    browser = await chromium.launch({ headless: true, ...launch });
    const context = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
    await context.exposeFunction('fixtureMemory', (action, payload) => f.controller.execute(action, payload));
    await context.addInitScript(({ seats, profiles }) => {
      window.coldbrew = { grokMemory: (action, payload) => window.fixtureMemory(action, payload),
        beginner: async () => seats.map(seat => ({ seat: seat.id, name: seat.tag, ok: true, exists: false, root: '', launchers: [] })),
        localSkills: async () => profiles, openExternal: async () => {} };
    }, { seats: SEATS, profiles: LOCAL_AGENT_PROFILES });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://coldcoffee-fixture.test') { report.externalRequests.push(url.origin); return route.abort(); }
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      let body = fs.readFileSync(file);
      if (file.endsWith('index.html')) body = body.toString().replace(/<script\b[^>]*src="(?!\.\.\/shared\/workbench-core\.js|newbie\.js|grok-memory-view\.js)[^"]*"[^>]*><\/script>/g, '')
        .replace('<section id="page-packs" class="page">', '<section id="page-packs" class="page active">');
      return route.fulfill({ status: 200, contentType: mime[path.extname(file)] || 'application/octet-stream', body });
    });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    await page.goto('http://coldcoffee-fixture.test/src/workbench/index.html');
    await page.waitForFunction(() => document.querySelectorAll('#newbie-cards .newbie-card').length === 15);
    const card = page.locator('[data-skill-id="grok-bot"]');
    const selected = await card.getAttribute('aria-pressed');
    const button = card.getByRole('button', { name: '管理 Bot 云端记忆' });
    await button.focus(); await page.keyboard.press('Enter');
    await page.locator('#grok-memory[open]').waitFor();
    assert.equal(await card.getAttribute('aria-pressed'), selected);
    assert.equal(f.calls.length, 0, 'opening must not load a login or contact service');
    check('15 seats; keyboard entry does not change install selection; open is passive');
    await page.locator('#gm-connect').click();
    await page.waitForFunction(() => document.querySelector('#gm-connection').textContent.includes('已连接'));
    assert.equal(await page.locator('#gm-bots button').count(), 2);
    await page.locator('#gm-pull').click();
    await page.waitForFunction(() => document.querySelectorAll('.gm-item').length === 2);
    assert.equal(await page.locator('.gm-item img').count(), 0);
    assert.equal(await page.evaluate(() => !!window.injected), false);
    check('Bot list, permission fallback and safe literal memory rendering');
    await page.locator('#gm-search').fill('按原文显示');
    assert.equal(await page.locator('.gm-item').count(), 1);
    await page.locator('#gm-search').fill('');
    check('memory search');
    await page.locator('#gm-text').fill('偏好：用中文给出结果与依据。');
    await page.locator('#gm-scope').selectOption('agent');
    await page.locator('#gm-tier').selectOption('profile');
    await page.locator('#gm-prepare').click();
    await page.locator('#gm-confirm:not([hidden])').waitFor();
    assert.equal(await page.locator('#gm-commit').isDisabled(), true);
    assert.equal(f.sent.length, 1);
    await page.locator('#gm-confirm-check').check();
    await page.locator('#gm-commit').click();
    await page.waitForFunction(() => document.querySelector('#gm-ack').textContent === 'Bot 已回复确认');
    assert.equal(await page.locator('.gm-item').count(), 2);
    assert.equal(await page.locator('#gm-readback').textContent(), '尚未验证');
    await page.locator('#gm-pull').click();
    await page.waitForFunction(() => document.querySelector('#gm-readback').textContent === '原文、范围与属性匹配');
    assert.equal(await page.locator('.gm-item').count(), 3);
    check('explicit preview/confirmation; no optimistic success; independent readback');
    const exportEvent = page.waitForEvent('download');
    await page.locator('#gm-export').click();
    const download = await exportEvent;
    const destination = path.join(output, 'memory-export.json');
    await download.saveAs(destination);
    const exported = JSON.parse(fs.readFileSync(destination, 'utf8'));
    assert.equal(exported.memories.length, 3);
    assert.ok(!JSON.stringify(exported).includes(f.session.token));
    check('user-selected JSON export contains memories, no session credentials');
    await page.locator('.gm-item').last().getByRole('button', { name: '预览忘掉' }).click();
    await page.locator('#gm-confirm:not([hidden])').waitFor();
    await page.locator('#gm-confirm-check').check(); await page.locator('#gm-commit').click();
    await page.waitForFunction(() => document.querySelector('#gm-ack').textContent === 'Bot 已回复确认');
    await page.locator('#gm-pull').click();
    await page.waitForFunction(() => document.querySelector('#gm-readback').textContent === '本次读取未见原文');
    check('forget with confirmation and readback');
    await page.locator('#gm-preset').click();
    await page.waitForFunction(() => document.querySelector('#gm-text').value.startsWith('冷咖啡已激活'));
    const originalPreset = (await f.controller.execute('preset')).text;
    assert.equal(await page.locator('#gm-text').inputValue(), originalPreset.replace(/\r\n/g, '\n'));
    await page.locator('#gm-prepare').click();
    await page.locator('#gm-confirm:not([hidden])').waitFor();
    assert.equal(await page.locator('#gm-preview-text').textContent(), originalPreset);
    check('full original welcome preset including QQ four groups and both Telegram links');
    for (const size of [{ width: 1500, height: 1100 }, { width: 1080, height: 900 }, { width: 590, height: 900 }]) {
      await page.setViewportSize(size);
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode().catch(() => {}))); document.querySelector('#grok-memory').scrollTop = 0; });
      const overflow = await page.locator('#grok-memory').evaluate(el => el.scrollWidth > el.clientWidth + 1);
      assert.equal(overflow, false, `no horizontal overflow at ${size.width}`);
      const screenshot = path.join(output, `grok-memory-${size.width}.png`);
      await page.locator('#grok-memory').screenshot({ path: screenshot }); report.screenshots.push(path.basename(screenshot));
    }
    check('responsive desktop and narrow layouts');
    await page.locator('#gm-discard').click();
    await page.locator('#gm-bots button').last().click();
    assert.equal(await page.locator('.gm-item').count(), 0);
    await page.locator('#gm-close').click();
    await page.waitForFunction(() => !document.querySelector('#grok-memory').open);
    assert.equal(f.controller.session, null);
    assert.equal(await page.locator('#gm-text').inputValue(), '');
    assert.equal(report.errors.length, 0, report.errors.join('\n'));
    assert.deepEqual(report.externalRequests, []);
    check('switch/close clear session and list; no external network or personal-profile reads');
    report.ok = true;
  } finally {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    if (browser) await browser.close();
  }
  console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
