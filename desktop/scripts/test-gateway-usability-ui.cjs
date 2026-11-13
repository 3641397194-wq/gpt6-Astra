'use strict';
// Actual renderer and styles; deterministic gateway fixture, no personal data or network.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'work/upgrade10-ui');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const models = Array.from({ length: 240 }, (_, i) => ({ id: `fixture/model-${i}`, name: i === 0 ? 'gpt-6-astra' : i === 239 ? 'DeepSeek Harness' : `Model ${i}`, provider: i % 2 ? '冷咖啡测试中转' : '第二测试中转' }));
const f = { running: false, failStart: true, failSnapshots: false, starts: 0, configureCalls: 0, connectCalls: 0, restoreCalls: 0, configuring: false, clipboard: [], warnings: [], models, holdConfigure: null, holdPlan: null };
const clients = [{ id: 'codex', name: 'Codex', detected: true, connected: false }, { id: 'claude', name: 'Claude Code', detected: false, connected: false }, { id: 'deepseek', name: 'DeepSeek Harness', detected: true, connected: false }];
const snapshot = () => ({ engine: { running: f.running, port: 12345, url: 'http://127.0.0.1:12345', error: '' }, encryption: false, configuring: f.configuring, providers: [{ id: 'coldcoffee', name: '冷咖啡中转', hasKey: true, models: ['model-0'] }], availableModels: f.models, routes: [], warnings: f.warnings, totals: {} });
const report = { ok: false, fixtureOnly: true, checks: [], errors: [], externalRequests: [] };
const pause = () => { let release; const promise = new Promise(resolve => { release = resolve; }); return { promise, release }; };

(async () => {
  fs.mkdirSync(output, { recursive: true });
  let browser;
  try {
    const launch = fs.existsSync(chromium.executablePath()) ? {} : process.platform === 'win32' ? { channel: 'msedge' } : {};
    browser = await chromium.launch({ headless: true, ...launch });
    const context = await browser.newContext({ viewport: { width: 1500, height: 1050 } });
    await context.exposeFunction('fixtureGateway', async (action, payload) => {
      if (action === 'status') return snapshot();
      if (action === 'clients') return clients;
      if (action === 'start') { f.starts++; if (f.failStart) throw new Error('测试：网关启动暂时失败'); f.running = true; return snapshot(); }
      if (action === 'snapshot') { if (f.failSnapshots) throw new Error('测试：数据同步暂时中断'); return snapshot(); }
      if (action === 'configure') { f.configureCalls++; if (f.holdConfigure) await f.holdConfigure.promise; return snapshot(); }
      if (action === 'plan') { if (f.holdPlan) await f.holdPlan.promise; return { id: 'fixture-plan', files: [{ action: '更新', name: 'config.toml' }] }; }
      if (action === 'connect') { f.connectCalls++; return { restart: '重新打开测试客户端。' }; }
      if (action === 'restore') { f.restoreCalls++; return {}; }
      throw new Error('Unexpected fixture action: ' + action);
    });
    await context.exposeFunction('fixtureClipboard', text => { f.clipboard.push(text); });
    await context.addInitScript(() => {
      window.coldbrew = { gateway: (action, payload) => window.fixtureGateway(action, payload), onGateway: () => () => {}, openExternal: async () => {} };
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: text => window.fixtureClipboard(text) } });
    });
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin !== 'http://coldcoffee-fixture.test') { report.externalRequests.push(url.origin); return route.abort(); }
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: '' });
      let body = fs.readFileSync(file);
      if (file.endsWith('index.html')) body = body.toString().replace(/<script\b[^>]*src="(?!\.\.\/shared\/routing-view\.js|routing-panel\.js|route-courier\.js|visual-gateway\.js)[^"]*"[^>]*><\/script>/g, '');
      return route.fulfill({ status: 200, contentType: mime[path.extname(file)] || 'application/octet-stream', body });
    });
    const page = await context.newPage(); page.on('pageerror', error => report.errors.push(error.message));
    await page.goto('http://coldcoffee-fixture.test/src/workbench/index.html');
    assert.equal(await page.locator('.topbar .version').textContent(), require('../package.json').version);
    await page.waitForFunction(() => document.querySelector('#vg-connection')?.dataset.state === 'offline');
    assert.equal(await page.locator('#vg-copy-connection').isDisabled(), true);
    assert.match(await page.locator('#vg-connection-note').textContent(), /启动暂时失败/);
    f.failStart = false;
    await page.locator('#vg-retry').click();
    await page.waitForFunction(() => document.querySelector('#vg-connection').dataset.state === 'ready');
    assert.equal(f.starts, 2); assert.equal(await page.locator('#vg-retry').isVisible(), false);
    assert.equal(await page.locator('#vg-copy-connection').isDisabled(), false);
    report.checks.push('failed startup has an explicit retry; successful retry clears only the connection failure');

    await page.locator('#vg-hub-node').click();
    const announcement = await page.locator('#vg-banner').textContent();
    f.failSnapshots = true; await page.evaluate(() => window.ColdCoffeeVisual.refresh());
    assert.equal(await page.locator('#vg-connection').getAttribute('data-state'), 'offline');
    assert.equal(await page.locator('#vg-engine').getAttribute('data-ready'), 'false');
    assert.equal(await page.locator('#vg-copy-connection').isDisabled(), true);
    f.failSnapshots = false; f.warnings = ['已保留异常配置副本，请重新验证中转。'];
    await page.evaluate(() => window.ColdCoffeeVisual.refresh());
    assert.equal(await page.locator('#vg-connection').getAttribute('data-state'), 'ready');
    assert.equal(await page.locator('#vg-banner').textContent(), announcement);
    assert.equal(await page.locator('#vg-config-warning').isVisible(), true);
    f.warnings = []; await page.evaluate(() => window.ColdCoffeeVisual.refresh());
    assert.equal(await page.locator('#vg-config-warning').isVisible(), false);
    report.checks.push('snapshot failure marks stale data, later recovery clears it and preserves unrelated notices; recovery warnings render separately');

    assert.equal(await page.locator('#vg-model-select option').count(), 240);
    await page.locator('#vg-model-search').fill('harness');
    assert.equal(await page.locator('#vg-model-select option').count(), 2);
    assert.match(await page.locator('#vg-model-results').textContent(), /匹配 1 \/ 240.*保留当前/);
    await page.locator('#vg-model-select').selectOption('fixture/model-239');
    assert.equal(await page.locator('#vg-setup-model').inputValue(), 'fixture/model-239');
    await page.locator('#vg-model-search').fill('no-such-model');
    assert.equal(await page.locator('#vg-model-select').inputValue(), 'fixture/model-239');
    assert.match(await page.locator('#vg-model-results').textContent(), /匹配 0 \/ 240/);
    await page.locator('#vg-model-search').fill('第二测试中转');
    assert.match(await page.locator('#vg-model-results').textContent(), /匹配 120 \/ 240/);
    await page.locator('#vg-model-search').fill('');
    assert.equal(await page.locator('#vg-model-select option').count(), 240);
    report.checks.push('240-model search matches name/provider, synchronizes both pickers and never drops the selected model');

    await page.locator('#vg-setup').click(); await page.locator('#vg-next-relay').click();
    f.configuring = true; await page.evaluate(() => window.ColdCoffeeVisual.refresh());
    await page.locator('#vg-verify').click();
    assert.equal(f.configureCalls, 0);
    assert.match(await page.locator('#vg-setup-status').textContent(), /配置正在更新/);
    f.configuring = false; await page.evaluate(() => window.ColdCoffeeVisual.refresh());
    await page.locator('#vg-key').fill('synthetic-fixture-value'); await page.locator('#vg-key-toggle').click();
    f.holdConfigure = pause();
    await page.locator('#vg-verify').click();
    assert.equal(await page.locator('#vg-provider-select').isDisabled(), true);
    assert.equal(await page.locator('#vg-key').isDisabled(), true);
    await page.evaluate(() => document.querySelector('#vg-relay-form').dispatchEvent(new Event('submit', { cancelable: true })));
    assert.equal(f.configureCalls, 1);
    await page.locator('[data-vg-close="vg-setup-dialog"]').click();
    assert.equal(await page.locator('#vg-key').inputValue(), '');
    assert.equal(await page.locator('#vg-key-toggle').textContent(), '显示');
    await page.locator('#vg-setup').click();
    f.holdConfigure.release(); f.holdConfigure = null;
    await page.waitForFunction(() => document.querySelector('#vg-setup-dialog').getAttribute('aria-busy') === 'false');
    assert.equal(await page.locator('[data-vg-section="1"]').isVisible(), true);
    assert.equal(await page.locator('[data-vg-section="3"]').isVisible(), false);
    assert.equal(await page.locator('#vg-connected').isVisible(), false);
    report.checks.push('duplicate verification is ignored; closing and reopening discards late wizard navigation and clears the password/reveal state');

    await page.locator('[data-vg-stage="3"]').click();
    f.holdPlan = pause(); await page.locator('#vg-connect').click();
    await page.locator('[data-vg-close="vg-setup-dialog"]').click(); await page.locator('#vg-setup').click();
    f.holdPlan.release(); f.holdPlan = null;
    await page.waitForFunction(() => document.querySelector('#vg-setup-dialog').getAttribute('aria-busy') === 'false');
    assert.equal(await page.locator('#vg-plan').isVisible(), false);
    assert.equal(f.connectCalls, 0);
    await page.locator('[data-vg-stage="3"]').click();
    f.holdPlan = pause(); await page.locator('#vg-connect').click();
    f.models = models.filter(model => model.id !== 'fixture/model-239');
    await page.evaluate(() => window.ColdCoffeeVisual.refresh());
    f.holdPlan.release(); f.holdPlan = null;
    await page.waitForFunction(() => document.querySelector('#vg-setup-dialog').getAttribute('aria-busy') === 'false');
    assert.equal(await page.locator('#vg-plan').isVisible(), false);
    assert.match(await page.locator('#vg-setup-status').textContent(), /所选模型已更新/);
    f.models = models; await page.evaluate(() => window.ColdCoffeeVisual.refresh());
    await page.locator('[data-vg-stage="3"]').click();
    await page.locator('#vg-setup-model-search').fill('harness');
    await page.locator('#vg-connect').click(); await page.locator('#vg-plan:not([hidden])').waitFor();
    await page.screenshot({ path: path.join(output, 'model-search-and-plan.png') });
    await page.locator('#vg-connect').click(); await page.locator('#vg-connected:not([hidden])').waitFor();
    assert.equal(f.connectCalls, 1);
    report.checks.push('late plan from a closed wizard is discarded; a fresh preview and confirmed connection still work');
    report.checks.push('background configuration blocks duplicate verification; model-list changes invalidate pending previews');

    await page.locator('[data-vg-close="vg-setup-dialog"]').click();
    await page.locator('.vg-test-box summary').nth(1).click();
    clients.forEach(client => { client.connected = true; });
    await page.locator('#vg-setup').click();
    await page.locator('#vg-clients button').nth(0).click();
    await page.locator('[data-vg-close="vg-setup-dialog"]').click();
    await page.locator('#vg-restore').click();
    assert.equal(await page.locator('#vg-restore').textContent(), '确认恢复所选软件');
    await page.locator('#vg-setup').click(); await page.locator('#vg-clients button').nth(1).click();
    await page.locator('[data-vg-close="vg-setup-dialog"]').click();
    assert.equal(await page.locator('#vg-restore').textContent(), '恢复接入前配置');
    await page.locator('#vg-restore').click(); assert.equal(f.restoreCalls, 0);
    report.checks.push('switching the selected client resets restore confirmation before any restore action');
    await page.locator('#vg-copy-connection').click();
    assert.equal(f.clipboard.length, 1); assert.ok(f.clipboard[0].includes('http://127.0.0.1:12345/v1'));
    assert.ok(!f.clipboard[0].includes('undefined'));
    f.models = []; await page.evaluate(() => window.ColdCoffeeVisual.refresh());
    assert.equal(await page.locator('#vg-copy-connection').isDisabled(), true);
    report.checks.push('copy connection is enabled only with a live gateway and selected model');
    f.models = models; await page.evaluate(() => window.ColdCoffeeVisual.refresh());
    await page.locator('#vg-model-search').fill('');
    await page.evaluate(() => { document.querySelector('main').scrollTop = 0; document.documentElement.scrollTop = 0; });
    await page.screenshot({ path: path.join(output, 'connection-home.png') });
    await page.setViewportSize({ width: 1000, height: 800 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await page.locator('#vg-setup').click(); await page.locator('[data-vg-stage="3"]').click();
    assert.ok(await page.evaluate(() => { const r = document.getElementById('vg-setup-dialog').getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; }));
    await page.screenshot({ path: path.join(output, 'compact-model-picker.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.externalRequests, []);
    report.ok = true;
  } catch (error) { report.failure = error.message; console.error(error); process.exitCode = 1; }
  finally { if (browser) await browser.close(); fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); }
})();
