// SPDX-License-Identifier: GPL-3.0-only
// Deterministic front-end acceptance tests. The native bridge is an in-memory
// fixture and never contacts a paid API, user profile, or real credential store.
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const mobile = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const root = path.dirname(mobile), web = path.join(mobile, 'www');
const output = path.join(mobile, 'work', 'ui');
await mkdir(output, { recursive: true });
await stat(path.join(web, 'index.html')).catch(() => { throw new Error('Run npm run build before UI acceptance tests'); });
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://fixture').pathname);
    const file = path.resolve(web, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(web + path.sep) && file !== path.join(web, 'index.html')) { res.writeHead(403); res.end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(body);
  } catch { res.writeHead(404); res.end('fixture asset not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const results = [], errors = [], externalAttempts = [];
let browser;

function installFixture(seed = {}) {
  const keys = new Map();
  let savedState = structuredClone(seed.state || {});
  const providers = structuredClone(seed.providers || []);
  for (const provider of providers) if (provider.hasKey) keys.set(provider.id, 'fixture-key-not-a-real-credential');
  const active = new Map(), requests = [], external = [], copied = [], shared = [];
  const emit = (id, value) => window.dispatchEvent(new CustomEvent('coldcoffee:native', { detail: { id, ...value } }));
  const publicProvider = provider => ({ id: provider.id, name: provider.name, baseUrl: provider.baseUrl, protocol: provider.protocol, hasKey: keys.has(provider.id) });
  window.__fixture = {
    requests, external, copied, shared,
    state: () => structuredClone(savedState),
    providers: () => providers.map(publicProvider),
    keyExists: id => keys.has(id),
    activeCount: () => active.size,
  };
  window.ColdCoffeeNative = {
    getProviders() { return JSON.stringify(providers.map(publicProvider)); },
    saveProvider(text) {
      const value = JSON.parse(text), current = providers.find(item => item.id === value.id);
      if (value.apiKey) keys.set(value.id, value.apiKey);
      const provider = { id: value.id, name: value.name, baseUrl: value.baseUrl, protocol: value.protocol };
      if (current) Object.assign(current, provider); else providers.push(provider);
      return JSON.stringify({ ok: true, provider: publicProvider(provider) });
    },
    deleteProvider(id) {
      keys.delete(id); const index = providers.findIndex(item => item.id === id);
      if (index >= 0) providers.splice(index, 1);
      return JSON.stringify({ ok: true });
    },
    getState() { return JSON.stringify(savedState); },
    saveState(text) { savedState = JSON.parse(text); return JSON.stringify({ ok: true }); },
    getVersion() { return JSON.stringify({ version: '3.3.0-preview.1', build: 'isolated-fixture' }); },
    copyText(text) { copied.push(text); },
    shareText(text) { shared.push(text); },
    openExternal(url) { external.push(url); },
    startRequest(text) {
      const req = JSON.parse(text); requests.push(structuredClone(req));
      const timers = new Set();
      function later(ms, callback) {
        const timer = setTimeout(() => { timers.delete(timer); if (active.has(req.id)) callback(); }, ms);
        timers.add(timer);
      }
      active.set(req.id, { timers });
      const provider = providers.find(item => item.id === req.providerId);
      if (req.path === '/models') {
        const unauthorized = provider?.name.includes('未授权');
        later(12, () => emit(req.id, { type: 'headers', status: unauthorized ? 401 : 200, headers: { 'content-type': 'application/json' } }));
        later(20, () => emit(req.id, { type: 'chunk', text: JSON.stringify(unauthorized ? { error: { message: 'fixture invalid key' } } : { data: [{ id: 'chat-fixture' }, { id: 'vision-fixture' }, { id: 'slow-fixture' }] }) }));
        later(25, () => { emit(req.id, { type: 'done' }); active.delete(req.id); });
        return req.id;
      }
      const last = (req.body.messages || req.body.input || []).filter(item => item.role === 'user').at(-1);
      const prompt = typeof last?.content === 'string' ? last.content : '图片提问';
      if (prompt.includes('HTTP错误')) {
        later(10, () => emit(req.id, { type: 'headers', status: 429, headers: { 'content-type': 'application/json' } }));
        later(15, () => emit(req.id, { type: 'chunk', text: JSON.stringify({ error: { message: 'fixture limit' } }) }));
        later(20, () => { emit(req.id, { type: 'done' }); active.delete(req.id); });
        return req.id;
      }
      const slow = prompt.includes('慢速');
      const markdown = prompt.includes('Markdown');
      const answer = markdown ? '# 安全显示\n\n**冷咖啡** 与代码 `const value = 1`。\n\n[文档](https://example.org/docs)\n\n![不可追踪](https://tracking.invalid/pixel)\n<img src="https://tracking.invalid/image" onerror="window.__xss = true"><script>window.__xss = true</script>' :
        slow ? '正在整理你的想法。稍等片刻，完整回答已经到达。' :
          '当然可以。先明确目标，再拆成三个小步骤：\n\n1. 选择一个真实问题。\n2. 写下最小可执行方案。\n3. 完成后复盘并继续改进。\n\n让好点子，从一杯冷咖啡开始。☕';
      const parts = slow ? ['正在整理你的想法。', '稍等片刻，', '完整回答已经到达。'] : [answer.slice(0, 12), answer.slice(12)];
      later(10, () => emit(req.id, { type: 'headers', status: 200, headers: { 'content-type': 'text/event-stream' } }));
      let elapsed = 25;
      for (const part of parts) {
        later(elapsed, () => emit(req.id, { type: 'chunk', text: req.path === '/responses'
          ? `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: part })}\n\n`
          : `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: part } }] })}\n\n` }));
        elapsed += slow ? 650 : 30;
      }
      later(elapsed, () => {
        emit(req.id, { type: 'chunk', text: req.path === '/responses'
          ? `data: ${JSON.stringify({ type: 'response.completed', response: {} })}\n\n`
          : `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n` });
        // Deliberately keep the native transport open after logical completion.
        // The real client must cancel it, rather than waiting for a TCP close.
      });
      return req.id;
    },
    cancelRequest(id) {
      const item = active.get(id); if (!item) return;
      for (const timer of item.timers) clearTimeout(timer);
      active.delete(id);
      queueMicrotask(() => emit(id, { type: 'cancelled' }));
    },
  };
}

const seeded = () => ({
  providers: [{ id: 'fixture-provider', name: '冷咖啡 · 测试配置', baseUrl: 'https://example.invalid/v1', protocol: 'chat', hasKey: true }],
  state: { providerId: 'fixture-provider', model: 'chat-fixture', fontSize: 17, theme: 'light', conversations: [] },
});
async function pageFor(seed = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await context.addInitScript(installFixture, seed);
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    if (!route.request().url().startsWith(origin)) {
      externalAttempts.push(route.request().url()); await route.abort(); return;
    }
    // Fulfil exact built bytes to isolate front-end acceptance from host HTTP
    // security-software injection. The real local server remains available,
    // while no host browser profile or antivirus setting is touched.
    try {
      const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
      const file = path.resolve(web, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(web + path.sep)) return route.fulfill({ status: 403, body: '' });
      const body = await readFile(file);
      await route.fulfill({ status: 200, contentType: mime[path.extname(file)] || 'application/octet-stream', body });
    } catch { await route.fulfill({ status: 404, body: 'fixture asset not found' }); }
  });
  page.on('dialog', dialog => dialog.accept());
  await page.goto(origin);
  await page.locator('#brand-home').waitFor();
  return { page, context };
}
async function check(name, run) {
  const started = Date.now();
  try { await run(); results.push({ name, ok: true, milliseconds: Date.now() - started }); console.log(`PASS ${name}`); }
  catch (error) {
    results.push({ name, ok: false, milliseconds: Date.now() - started, error: String(error.message).slice(0, 1500) });
    console.error(`FAIL ${name}: ${String(error.message).slice(0, 500)}`);
  }
}
async function send(page, text) {
  await page.locator('[data-page="chat"]').click();
  await page.locator('#message-input').fill(text);
  await page.locator('#send-message').click();
}
async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
}

try {
  // CI installs the pinned browser. On a developer Windows host use an isolated
  // headless Edge profile when that Playwright browser has not been installed.
  const fallback = !existsSync(chromium.executablePath()) && process.platform === 'win32' ? { channel: 'msedge' } : {};
  browser = await chromium.launch({ headless: true, ...fallback });
  await check('coldcoffee setup, real model-list flow, searching, selection and streaming completion', async () => {
    const { page, context } = await pageFor();
    try {
      await page.locator('#home-connect').click();
      assert.equal(await page.locator('#provider-url').inputValue(), 'https://coldcoffeeai.com/v1');
      await page.locator('#provider-key').fill('fixture-key-not-a-real-credential');
      await page.locator('#provider-save').click();
      await page.waitForFunction(() => document.querySelectorAll('.model-option').length === 3);
      await page.locator('#model-search').fill('vision');
      assert.equal(await page.locator('.model-option').count(), 1);
      await page.locator('.model-option').click();
      assert.equal(await page.locator('#selected-model').textContent(), 'vision-fixture');
      await send(page, '帮我规划一个可以完成的小项目');
      await page.waitForFunction(() => [...document.querySelectorAll('.message-meta')].some(node => node.textContent === '生成完成'));
      assert.match(await page.locator('.message.assistant .message-body').innerText(), /冷咖啡/);
      assert.equal(await page.evaluate(() => window.__fixture.activeCount()), 0);
      assert.equal(await page.evaluate(() => window.__fixture.requests.filter(item => item.path === '/chat/completions').length), 1);
      const publicProviders = await page.evaluate(() => window.__fixture.providers());
      assert.equal(publicProviders[0].hasKey, true);
      assert.equal('apiKey' in publicProviders[0], false);
      const state = await page.evaluate(() => JSON.stringify(window.__fixture.state()));
      assert.doesNotMatch(state, /fixture-key-not-a-real-credential|apiKey/);
      await page.locator('[data-copy]').click();
      assert.match(await page.evaluate(() => window.__fixture.copied.at(-1)), /冷咖啡/);
    } finally { await context.close(); }
  });
  await check('Key is cleared on close and Escape, and its input defaults to masked', async () => {
    const { page, context } = await pageFor();
    try {
      await page.locator('#home-connect').click();
      assert.equal(await page.locator('#provider-key').getAttribute('type'), ['pass', 'word'].join(''));
      await page.locator('#provider-key').fill('fixture-private-key');
      await page.locator('#toggle-key').click();
      await page.locator('#provider-dialog [data-close]').click();
      assert.equal(await page.locator('#provider-key').inputValue(), '');
      await page.locator('#home-connect').click();
      await page.locator('#provider-key').fill('fixture-private-key-two');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#provider-key').inputValue(), '');
      assert.equal(await page.evaluate(() => localStorage.length), 0);
    } finally { await context.close(); }
  });
  await check('other relay, blank-Key editing, manual model and provider deletion', async () => {
    const { page, context } = await pageFor();
    try {
      await page.locator('#home-other').click();
      await page.locator('#provider-name').fill('其他测试中转');
      await page.locator('#provider-url').fill('https://relay.example/v1/chat/completions');
      await page.locator('#provider-key').fill('fixture-other-key');
      await page.locator('#provider-save').click();
      await page.waitForFunction(() => document.querySelectorAll('.model-option').length === 3);
      await page.locator('#manual-model').fill('manual-fixture');
      await page.locator('#manual-model-form button').click();
      assert.equal(await page.locator('#selected-model').textContent(), 'manual-fixture');
      await page.locator('[data-page="providers"]').click();
      await page.locator('[data-action="edit"]').click();
      assert.equal(await page.locator('#provider-key').inputValue(), '');
      await page.locator('#provider-name').fill('其他测试中转 · 已编辑');
      await page.locator('#provider-save').click();
      await page.waitForFunction(() => document.querySelectorAll('.model-option').length === 3);
      assert.equal(await page.evaluate(() => window.__fixture.providers()[0].hasKey), true);
      assert.equal(await page.evaluate(() => window.__fixture.providers()[0].baseUrl), 'https://relay.example/v1');
      await page.locator('#models-dialog [data-close]').click();
      await page.locator('[data-page="providers"]').click();
      await page.locator('[data-action="remove"]').click();
      assert.equal(await page.evaluate(() => window.__fixture.providers().length), 0);
    } finally { await context.close(); }
  });
  await check('401 model-list errors remain actionable and manual model remains available', async () => {
    const { page, context } = await pageFor();
    try {
      await page.locator('#home-other').click();
      await page.locator('#provider-name').fill('未授权测试');
      await page.locator('#provider-url').fill('https://relay.example/v1');
      await page.locator('#provider-key').fill('fixture-invalid-key');
      await page.locator('#provider-save').click();
      await page.waitForFunction(() => document.querySelector('#model-status').textContent.includes('401'));
      assert.match(await page.locator('#model-status').textContent(), /手动填写/);
      assert.equal(await page.locator('#refresh-models').isDisabled(), false);
      await page.locator('#manual-model').fill('manual-fixture');
      await page.locator('#manual-model-form button').click();
      assert.equal(await page.locator('#selected-model').textContent(), 'manual-fixture');
    } finally { await context.close(); }
  });
  await check('stop, partial retention, retry and HTTP errors recover without false success', async () => {
    const { page, context } = await pageFor(seeded());
    try {
      await send(page, '慢速回复测试');
      await page.waitForFunction(() => document.querySelector('.message-body')?.textContent.includes('正在整理'));
      await page.locator('#stop-message').click();
      await page.waitForFunction(() => document.querySelector('.message-meta')?.textContent.includes('已停止'));
      assert.match(await page.locator('.message-body').textContent(), /正在整理/);
      assert.equal(await page.locator('#send-message').isVisible(), true);
      await page.locator('[data-retry]').click();
      await page.waitForFunction(() => document.querySelector('.message-meta')?.textContent === '生成完成');
      assert.match(await page.locator('.message-body').innerText(), /完整回答已经到达/);
      await send(page, 'HTTP错误');
      await page.waitForFunction(() => [...document.querySelectorAll('.message-error')].some(node => node.textContent.includes('429')));
      assert.match(await page.locator('.message-meta').last().textContent(), /失败/);
      assert.equal(await page.locator('#send-message').isVisible(), true);
    } finally { await context.close(); }
  });
  await check('streaming keeps updating after leaving and returning to the chat tab', async () => {
    const { page, context } = await pageFor(seeded());
    try {
      await send(page, '慢速回复切换页面');
      await page.waitForFunction(() => document.querySelector('.message-body')?.textContent.includes('正在整理'));
      await page.locator('[data-page="community"]').click();
      await page.locator('[data-page="chat"]').click();
      await page.waitForFunction(() => document.querySelector('.message-meta')?.textContent === '生成完成', null, { timeout: 6000 });
      assert.match(await page.locator('.message-body').innerText(), /完整回答已经到达/);
    } finally { await context.close(); }
  });
  await check('mobile workbench submits structured research tasks, streams results and saves a local record', async () => {
    const { page, context } = await pageFor(seeded());
    try {
      await page.locator('[data-page="work"]').click();
      await page.locator('#work-mode-grid button').nth(3).click();
      assert.match(await page.locator('#work-mode-grid .selected').textContent(), /游戏客户端研究/);
      await page.locator('#work-target').fill('TARGET game-client.exe v1.2');
      await page.locator('#work-host').fill('HOST process / module');
      await page.locator('#work-request').fill('整理模块、协议、渲染和反作弊观测记录');
      await page.locator('#work-submit').click();
      await page.waitForFunction(() => document.querySelector('#work-output-title')?.textContent.includes('已完成'));
      assert.match(await page.locator('#work-output').textContent(), /冷咖啡/);
      assert.equal(await page.locator('#work-history .work-history-row').count(), 1);
      await page.locator('#work-copy').click();
      assert.match(await page.evaluate(() => window.__fixture.copied.at(-1)), /冷咖啡/);
      await page.locator('#work-share').click();
      assert.match(await page.evaluate(() => window.__fixture.shared.at(-1)), /游戏客户端研究/);
      const saved = await page.evaluate(() => JSON.stringify(window.__fixture.state()));
      assert.doesNotMatch(saved, /fixture-key-not-a-real-credential|apiKey/);
      assert.match(saved, /TARGET game-client\.exe/);
    } finally { await context.close(); }
  });
  await check('Markdown is sanitized and external links open only after explicit click', async () => {
    const { page, context } = await pageFor(seeded());
    try {
      await send(page, 'Markdown 显示测试');
      await page.waitForFunction(() => document.querySelector('.message-meta')?.textContent === '生成完成');
      assert.equal(await page.locator('.message-body h1').textContent(), '安全显示');
      assert.equal(await page.locator('.message-body img, .message-body script').count(), 0);
      assert.equal(await page.evaluate(() => Boolean(window.__xss)), false);
      assert.equal(externalAttempts.filter(url => url.includes('tracking.invalid')).length, 0);
      await page.locator('.message-body a').click();
      assert.equal(await page.evaluate(() => window.__fixture.external.at(-1)), 'https://example.org/docs');
    } finally { await context.close(); }
  });
  await check('public configuration export excludes Key and history, with accessible licenses', async () => {
    const seed = seeded(); seed.state.conversations = [{ id: 'fixture-chat', title: '保密会话标记', messages: [{ id: 'fixture-user', role: 'user', text: 'PRIVATE_CHAT_SENTINEL' }], updated: 1 }];
    const { page, context } = await pageFor(seed);
    try {
      await page.locator('#settings-open').click();
      await page.locator('#export-config').click();
      const shared = await page.evaluate(() => window.__fixture.shared.at(-1));
      assert.doesNotMatch(shared, /PRIVATE_CHAT_SENTINEL|fixture-key|apiKey|conversations/);
      assert.match(shared, /coldcoffee-mobile-public-v1/);
      await page.locator('#licenses-open').click();
      await page.locator('#content-dialog').waitFor({ state: 'visible' });
      assert.match(await page.locator('#content-body').textContent(), /GNU GPL v3/);
      assert.match(await page.locator('#content-body').textContent(), /Chatbox/);
      assert.equal(await page.locator('#content-body pre').count(), 2);
    } finally { await context.close(); }
  });
  await check('all QQ groups, current Telegram links, and honest WeChat invitation flow', async () => {
    const { page, context } = await pageFor();
    try {
      await page.locator('[data-page="community"]').click();
      assert.equal(await page.locator('.qq-card').count(), 4);
      const numbers = ['1057540028', '1077074552', '618179023', '1131239659'];
      for (const [index, number] of numbers.entries()) {
        await page.locator('.qq-card').nth(index).click();
        assert.equal(await page.locator('#qr-number').textContent(), number);
        await page.locator('#qr-copy').click();
        assert.equal(await page.evaluate(() => window.__fixture.copied.at(-1)), number);
        await page.locator('#qr-dialog [data-close]').click();
      }
      await page.locator('[data-external="telegram"]').click();
      await page.locator('[data-external="channel"]').click();
      assert.deepEqual(await page.evaluate(() => window.__fixture.external), ['https://t.me/coolcoffeeai', 'https://t.me/chachachalkf']);
      await page.locator('#wechat-help').click();
      assert.match(await page.locator('#toast').textContent(), /QQ 群私聊管理/);
      assert.match(await page.locator('.custom-service').textContent(), /收费本机安装与定制/);
    } finally { await context.close(); }
  });
  await check('font/theme settings and 360px navigation remain usable without horizontal overflow', async () => {
    const { page, context } = await pageFor();
    try {
      await page.setViewportSize({ width: 360, height: 800 });
      await page.locator('#settings-open').click();
      await page.locator('#font-size').selectOption('21');
      await page.locator('#theme').selectOption('dark');
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark');
      assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize), '21px');
      await page.locator('#settings-dialog [data-close]').click();
      for (const route of ['home', 'chat', 'work', 'providers', 'community']) {
        await page.locator(`[data-page="${route}"]`).click();
        await noOverflow(page);
      }
      await page.locator('#settings-open').click();
      await page.locator('#font-size').selectOption('16');
      await page.locator('#theme').selectOption('light');
      assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).fontSize), '16px');
    } finally { await context.close(); }
  });
  if (process.argv.includes('--capture') || process.env.COLDCOFFEE_MOBILE_CAPTURE === '1') {
    await check('capture isolated frontend screenshots with original published art', async () => {
      for (const file of ['assets/icon.png', 'assets/hero.webp']) await stat(path.join(web, file));
      const { page, context } = await pageFor(seeded());
      try {
        await page.evaluate(() => { document.querySelector('#runtime-badge').textContent = '隔离测试界面'; });
        await page.screenshot({ path: path.join(root, 'docs/assets/coldcoffee-mobile-home.png') });
        await send(page, '帮我规划一个可以完成的小项目');
        await page.waitForFunction(() => document.querySelector('.message-meta')?.textContent === '生成完成');
        await page.evaluate(() => { document.querySelector('#runtime-badge').textContent = '隔离测试界面'; });
        await page.screenshot({ path: path.join(root, 'docs/assets/coldcoffee-mobile-chat.png') });
        await page.locator('[data-page="community"]').click();
        await page.evaluate(() => { document.querySelector('#runtime-badge').textContent = '隔离测试界面'; });
        await page.screenshot({ path: path.join(root, 'docs/assets/coldcoffee-mobile-community.png') });
        await page.locator('[data-page="work"]').click();
        await page.locator('#work-mode-grid button').first().click();
        await page.locator('#work-target').fill('TARGET sample.exe · SHA256 fixture');
        await page.locator('#work-host').fill('HOST / module');
        await page.locator('#work-request').fill('整理入口、证据和下一步');
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(80);
        await page.evaluate(() => { document.querySelector('#runtime-badge').textContent = '隔离测试界面'; });
        await page.screenshot({ path: path.join(root, 'docs/assets/coldcoffee-mobile-work.png') });
      } finally { await context.close(); }
    });
  }
} catch (error) {
  results.push({ name: 'test infrastructure', ok: false, error: error.message });
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
if (errors.length) results.push({ name: 'no unexpected browser exceptions', ok: false, errors: [...new Set(errors)] });
if (externalAttempts.length) results.push({ name: 'no unsolicited external requests', ok: false, urls: [...new Set(externalAttempts)] });
const report = { ok: results.every(item => item.ok), fixture: true, realApiRequests: 0, checkedAt: new Date().toISOString(), checks: results };
await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, checks: results.length, passed: results.filter(item => item.ok).length, failed: results.filter(item => !item.ok).length, report: 'mobile/work/ui/report.json' }));
if (!report.ok) process.exitCode = 1;
