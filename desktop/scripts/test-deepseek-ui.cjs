'use strict';
// Read-only UI regression: the desktop bridge is mocked and detection uses fixture paths only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const beginner = require('../src/lib/beginner-install');

const ROOT = path.resolve(__dirname, '../..');
const OUTPUT = path.resolve(__dirname, '../work/deepseek-ui');
const LABEL = 'DeepSeek v4.1 Flash 10.17版本';
const SIZES = [{ width: 1360, height: 1080 }, { width: 1080, height: 900 }];
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };

// Serve tracked assets directly through Playwright so host HTTP proxies do not
// inject third-party scripts into the page under test. No listening port or network is needed.
function localResponse(requestUrl, method) {
  try {
    if (!['GET', 'HEAD'].includes(method)) return { status: 405, body: '' };
    const requestPath = decodeURIComponent(new URL(requestUrl).pathname);
    const file = path.resolve(ROOT, '.' + requestPath);
    const relative = path.relative(ROOT, file).replaceAll(path.sep, '/');
    if (relative.startsWith('../') || path.isAbsolute(relative) || !/^(desktop\/(src\/(workbench|shared)\/|assets\/)|docs\/)/.test(relative)) {
      return { status: 403, body: '' };
    }
    if (!fs.statSync(file).isFile()) return { status: 404, body: '' };
    return {
      status: 200,
      contentType: MIME[path.extname(file)] || 'application/octet-stream',
      body: method === 'HEAD' ? '' : fs.readFileSync(file),
    };
  } catch { return { status: 404, body: '' }; }
}

async function launchBrowser() {
  if (process.env.COLDCOFFEE_BROWSER_EXECUTABLE) {
    return { browser: await chromium.launch({ headless: true, executablePath: process.env.COLDCOFFEE_BROWSER_EXECUTABLE }), source: 'COLDCOFFEE_BROWSER_EXECUTABLE' };
  }
  if (fs.existsSync(chromium.executablePath())) {
    return { browser: await chromium.launch({ headless: true }), source: 'playwright-chromium' };
  }
  if (process.platform === 'win32') {
    return { browser: await chromium.launch({ headless: true, channel: 'msedge' }), source: 'msedge' };
  }
  return { browser: await chromium.launch({ headless: true }), source: 'playwright-chromium' };
}

async function mockDesktop(context, platform) {
  const scan = beginner.scanAll({ detect: (seat) => ({
    root: path.join(OUTPUT, 'fixtures', platform, seat), exists: true,
    source: 'ui-fixture', layout: seat === 'deepseek' ? 'deepseek-harness' : 'default',
  }) });
  assert.equal(scan.find(row => row.seat === 'deepseek').name, LABEL);
  await context.addInitScript(({ rows, platform }) => {
    window.__deepseekUiCalls = [];
    const record = (method, action) => window.__deepseekUiCalls.push({ method, action });
    const noop = async () => null;
    window.coldbrew = {
      platform,
      beginner: async (action) => {
        record('beginner', action);
        if (action === 'scan') return rows;
        throw new Error('Unexpected fixture beginner action: ' + action);
      },
      transaction: async (action) => {
        record('transaction', action);
        throw new Error('Unexpected fixture transaction action: ' + action);
      },
      toolbox: async ({ action }) => { record('toolbox', action); return null; },
      originalToolbox: async (action) => {
        record('originalToolbox', action);
        if (action === 'catalog') return { tools: [] };
        throw new Error('Unexpected fixture toolbox action: ' + action);
      },
      onOriginalToolbox: () => () => {}, onWorkflow: () => () => {},
      relay: noop, openExternal: noop, minimize: noop, maximize: noop, close: noop,
    };
  }, { rows: scan, platform });
}

async function measureLabel(locator) {
  await locator.scrollIntoViewIfNeeded();
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const container = element.closest('.newbie-card, td') || element.parentElement;
    const outer = container.getBoundingClientRect();
    const style = getComputedStyle(element);
    const range = document.createRange();
    range.selectNodeContents(element);
    const lines = Array.from(range.getClientRects()).map(rect => ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }));
    const tolerance = 1.5;
    return {
      text: element.textContent.trim(), width: box.width, height: box.height,
      clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
      clientHeight: element.clientHeight, scrollHeight: element.scrollHeight,
      lineCount: lines.length, textOverflow: style.textOverflow, whiteSpace: style.whiteSpace,
      insideElement: lines.every(rect => rect.left >= box.left - tolerance && rect.right <= box.right + tolerance && rect.top >= box.top - tolerance && rect.bottom <= box.bottom + tolerance),
      insideContainer: lines.every(rect => rect.left >= outer.left - tolerance && rect.right <= outer.right + tolerance && rect.top >= outer.top - tolerance && rect.bottom <= outer.bottom + tolerance),
      pageWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth,
    };
  });
}

(async () => {
  fs.mkdirSync(OUTPUT, { recursive: true });
  const origin = 'http://coldcoffee-ui.test';
  const report = { ok: false, label: LABEL, bridge: 'mocked; scanAll uses fixture detection only', cases: [], failures: [] };
  let browser;
  try {
    const launched = await launchBrowser(); browser = launched.browser; report.browser = launched.source;
    const cases = [];
    for (const size of [...SIZES, { width: 390, height: 844 }]) cases.push({ kind: 'demo', size });
    for (const platform of ['win32', 'darwin', 'linux']) for (const size of SIZES) cases.push({ kind: 'desktop', platform, size });
    for (const doc of ['index.html', 'readme-preview.html']) for (const size of [...SIZES, { width: 390, height: 844 }]) cases.push({ kind: 'docs', doc, size });
    for (const test of cases) {
      const id = [test.kind, test.platform || test.doc || 'web', test.size.width].join('-');
      const result = { id, ...test, ok: false, pageErrors: [], blockedExternalRequests: [] };
      report.cases.push(result);
      const context = await browser.newContext({ viewport: test.size, reducedMotion: 'reduce' });
      try {
        await context.route('**/*', route => {
          if (new URL(route.request().url()).origin === origin) return route.fulfill(localResponse(route.request().url(), route.request().method()));
          result.blockedExternalRequests.push(route.request().url()); return route.abort();
        });
        if (test.kind === 'desktop') await mockDesktop(context, test.platform);
        const page = await context.newPage();
        page.on('pageerror', error => result.pageErrors.push(error.message));
        const url = test.kind === 'docs' ? '/docs/' + test.doc : '/desktop/src/workbench/index.html#packs';
        await page.goto(origin + url, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        let label;
        if (test.kind === 'docs') {
          const row = page.locator('tr').filter({ has: page.locator('td:first-child', { hasText: /^04$/ }) });
          assert.equal(await row.count(), 1, id + ': one seat 04 row');
          label = row.locator('td').nth(1);
          const cells = await row.locator('td').allTextContents();
          assert.equal(cells[2], '%USERPROFILE%\\.dsh');
          assert.equal(cells[3], '~/.dsh');
          assert.equal(cells[4], 'skills/cha-deepseek/SKILL.md');
        } else {
          await page.locator('#page-packs.active').waitFor();
          label = page.locator('#newbie-cards strong').filter({ hasText: /^DeepSeek/ });
          assert.equal(await label.count(), 1, id + ': one DeepSeek card');
          const sidebar = await page.locator('#seats .seat-line').filter({ hasText: 'DeepSeek' }).evaluate(element => {
            const copy = element.cloneNode(true); copy.querySelector('.mark').remove(); return copy.textContent;
          });
          assert.equal(sidebar, LABEL, id + ': hidden sidebar label');
          assert.equal(await page.locator('#seats').getAttribute('hidden'), '');
          const status = await page.locator('#newbie-status').textContent();
          assert.ok(status.includes(test.kind === 'desktop' ? '点卡片' : '现在看的是样子'), id + ': expected render path');
          if (test.kind === 'desktop') {
            result.ipcCalls = await page.evaluate(() => window.__deepseekUiCalls);
            assert.deepEqual(result.ipcCalls.filter(call => call.method === 'beginner'), [{ method: 'beginner', action: 'scan' }]);
            assert.equal(result.ipcCalls.some(call => call.method === 'transaction'), false);
          }
        }
        result.metrics = await measureLabel(label);
        await page.screenshot({ path: path.join(OUTPUT, id + '.png'), animations: 'disabled' });
        assert.equal(result.metrics.text, LABEL, id + ': exact display name');
        assert.ok(result.metrics.insideElement, id + ': label text must fit its own box');
        assert.ok(result.metrics.insideContainer, id + ': label text must fit its card/cell');
        assert.ok(result.metrics.scrollWidth <= result.metrics.clientWidth + 1, id + ': no label horizontal overflow');
        assert.ok(result.metrics.scrollHeight <= result.metrics.clientHeight + 1, id + ': no label vertical overflow');
        assert.deepEqual(result.pageErrors, [], id + ': no renderer errors');
        assert.deepEqual(result.blockedExternalRequests, [], id + ': all assets local');
        result.ok = true; console.log('PASS ' + id);
      } catch (error) {
        result.error = error.message; report.failures.push({ id, error: error.message }); console.error('FAIL ' + id + ': ' + error.message);
      } finally { await context.close(); }
    }
    report.ok = report.failures.length === 0;
    fs.writeFileSync(path.join(OUTPUT, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
    assert.equal(report.failures.length, 0, JSON.stringify(report.failures));
    console.log('PASS DeepSeek UI: ' + report.cases.length + ' cases; report and screenshots: ' + OUTPUT);
  } finally {
    if (browser) await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
