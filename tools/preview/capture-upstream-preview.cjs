'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const localRequire = createRequire(path.resolve(__dirname, '../../desktop/package.json'));
const { chromium } = localRequire('playwright');
const upstream = require('../../desktop/src/lib/upstream-skills');
const out = path.resolve(__dirname, '../../.coldbrew/upstream-preview');

(async () => {
  const expected = upstream.catalog();
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: process.env.COLDCOFFEE_BROWSER_CHANNEL || 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('http://127.0.0.1:8772/workbench/?v=upstream-skills#packs', { waitUntil: 'networkidle' });
    await page.waitForFunction((count) => document.getElementById('upstream-total-skills').textContent === String(count), expected.skillCount);
    assert.equal(await page.locator('#page-packs').evaluate((element) => element.classList.contains('active')), true);
    assert.equal(await page.locator('.upstream-source').count(), 2);
    assert.equal(await page.locator('#upstream-context').textContent(), '隔离预览 · 不读取个人目录');
    assert.equal(await page.locator('#upstream-prepare').isDisabled(), true);
    await page.screenshot({ path: path.join(out, 'workbench.png') });
    await page.locator('.upstream-all>summary').click();
    assert.equal(await page.locator('#upstream-skill-list li').count(), 94);
    assert.equal(await page.locator('#upstream-skills a[href*="github.com"]').count(), 0);
    assert.equal(await page.locator('#upstream-skill-list a').count(), 0);
    await page.locator('#upstream-search').fill('ghidra');
    assert.ok(await page.locator('#upstream-skill-list li').count() > 0);
    await page.locator('#upstream-search').fill('');
    assert.equal(await page.locator('#upstream-skills a[href*="github.com"]').count(), 0);
    await page.locator('.upstream-all>summary').click();
    await page.locator('#upstream-status-check').click();
    await page.waitForFunction(() => document.getElementById('upstream-result-note').textContent.includes('只核对项目内合成目录'), undefined, { timeout: 30000 });
    await page.locator('#upstream-skills').screenshot({ path: path.join(out, 'skills.png') });
    assert.equal(await page.locator('.upstream-source details.upstream-version').count(), 0);
    assert.equal(await page.locator('.upstream-source .upstream-source-links').count(), 0);
    assert.equal(await page.locator('.upstream-source').getByText(/查看原仓库|固定快照|版本与许可证|上游版本|固定提交|查看许可证原文/).count(), 0);
    for (const source of expected.sources) {
      assert.equal(await page.locator('.upstream-source h3').getByText(source.name || source.id, { exact: true }).count(), 1);
      assert.equal((await page.locator('#upstream-sources').textContent()).includes(source.commit), false);
    }
    await page.locator('[data-page="community"]').click();
    for (const group of ['1057540028', '1077074552', '618179023']) assert.ok((await page.locator('#page-community').textContent()).includes(group));
    assert.equal(await page.locator('img').evaluateAll((images) => images.filter((image) => image.offsetParent !== null).every((image) => image.complete && image.naturalWidth > 0)), true);
    assert.deepEqual(errors, []);
    console.log('PASS: real preview catalog, clean source cards without metadata details, both source names retained, 94 searchable entries, isolated status API, 3 QQ groups, visible images, no browser errors.');
    console.log('Screenshots: ' + out);
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
