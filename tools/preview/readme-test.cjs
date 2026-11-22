'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const { chromium } = require(require.resolve('playwright', { paths: [__dirname, path.join(root, 'desktop')] }));
const preview = new URL(process.env.PREVIEW_URL || 'http://127.0.0.1:8772/readme-preview');
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const screenshots = ['install', 'relay', 'community'].map(page => `coldcoffee-workbench-${page}-current.png`);
const entryNumbers = Array.from({ length: 16 }, (_, index) => String(index + 1).padStart(2, '0'));
const version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
const iosVersion = '3.3.0-preview.3';

async function launch() {
  try {
    return await chromium.launch({ headless: true, executablePath });
  } catch (error) {
    if (executablePath || process.platform !== 'win32' || !error.message.includes("Executable doesn't exist")) throw error;
    return chromium.launch({ headless: true, channel: 'msedge' });
  }
}

(async () => {
  assert.ok(['127.0.0.1', 'localhost'].includes(preview.hostname), 'PREVIEW_URL must be local');
  const english = fs.readFileSync(path.join(root, 'README_EN.md'), 'utf8');
  assert.deepEqual([...english.matchAll(/^\| (\d{2}) \|/gm)].map(match => match[1]), entryNumbers);
  assert.match(english, /^\| 16 \| \[OpenCode\]\(#opencode\) \(client\) \| Included;/m);
  assert.equal((english.match(/16 installation entries; includes OpenCode/g) || []).length, 4);
  const englishAssets = [...english.matchAll(/\]\((https:\/\/github\.com\/[^()]+\/releases\/download\/[^()]+)\)/g)].map(match => match[1]);
  assert.equal(englishAssets.filter(url => url.includes(`/download/v${version}/ColdCoffee-Workbench-`)).length, 7);
  assert.equal(englishAssets.filter(url => url.includes(`/download/v${version}/ColdCoffee-Mobile-`)).length, 2);
  assert.equal(englishAssets.filter(url => url.includes(`/download/v${iosVersion}/`) && /(ColdCoffee-iOS|SHA256SUMS-iOS)/.test(url)).length, 3);
  assert.equal(englishAssets.length, 12);
  for (const file of screenshots) assert.ok(english.includes(`src="docs/assets/${file}"`));

  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      if (new URL(route.request().url()).origin === preview.origin) return route.continue();
      return route.abort();
    });
    const response = await page.goto(preview.href);
    assert.ok(response?.ok(), `Could not load ${preview.href}`);
    await page.waitForFunction(() => [...document.images].every(img => img.complete));
    assert.deepEqual(await page.locator('img').evaluateAll(images =>
      images.filter(img => !img.naturalWidth).map(img => img.getAttribute('src'))), []);
    for (const file of screenshots) {
      const image = page.locator(`img[src$="/${file}"]`);
      assert.equal(await image.count(), 1, file);
      assert.equal(await image.locator('..').getAttribute('href'), await image.getAttribute('src'));
    }

    const compatibility = page.locator('table[id="安装入口列表"]');
    const rows = compatibility.locator('tr').filter({ has: page.locator('td') });
    assert.deepEqual(await rows.locator('td:first-child').allTextContents(), entryNumbers);
    assert.match(await rows.last().textContent(), /OpenCode.*客户端.*中转配置另行设置/);
    const downloads = page.locator('table[id="已发布安装包"]');
    const releaseRows = downloads.locator('tr').filter({ hasText: '16 个安装入口，含 OpenCode' });
    assert.deepEqual(await releaseRows.locator('td:first-child').allTextContents(), ['Windows', 'macOS Apple 芯片', 'macOS Intel', 'Linux']);
    assert.deepEqual(await releaseRows.locator('td:nth-child(2)').allTextContents(), Array(4).fill(version));
    assert.equal(await releaseRows.locator(`a[href*="/download/v${version}/"]`).count(), 7);
    assert.equal(await downloads.locator(`a[href$="/v${version}/ColdCoffee-Mobile-Android-${version}.apk"]`).count(), 1);
    assert.equal(await downloads.locator(`a[href$="/v${iosVersion}/ColdCoffee-iOS-Source-${iosVersion}.zip"]`).count(), 1);

    const sidebar = page.locator('aside.about');
    assert.ok(await sidebar.isVisible());
    await sidebar.locator('a[href="#opencode"]').click();
    assert.equal(new URL(page.url()).hash, '#opencode');
    const openCode = await page.locator('#opencode').textContent();
    assert.ok(openCode.includes(`${version} 桌面安装包包含 OpenCode`));
    assert.match(openCode, /中转配置另行设置.*预览.*备份/);
    const start = await sidebar.getByRole('link', { name: /操作新版软件|查看软件启动步骤/ }).getAttribute('href');
    assert.ok(['/workbench/', '#上手使用'].includes(start));

    assert.equal(await page.locator('img[src*="/qq-group-"]').count(), 4);
    for (const chat of ['coolcoffeeai', 'chachachalkf']) assert.equal(await page.locator(`a[href="https://t.me/${chat}"]`).count(), 1);

    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(await compatibility.evaluate(table => table.scrollWidth > table.clientWidth), 'Compatibility table should scroll inside the mobile page');
    assert.equal(await sidebar.isVisible(), false);
    assert.ok(await page.locator('.markdown-body a[href="#opencode"]').first().isVisible());
    assert.deepEqual(errors, []);
    console.log('PASS: README screenshots, 16 compatibility entries, desktop and mobile release links, OpenCode anchor, community links, and mobile layout');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
