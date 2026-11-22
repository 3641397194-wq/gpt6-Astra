'use strict';

const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const baseUrl = process.env.PREVIEW_BASE_URL || 'http://127.0.0.1:8772';

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${baseUrl}/workbench/#packs`);
    await page.waitForFunction(() => document.querySelectorAll('.newbie-card[data-skill-id]').length === 5);
    assert.deepEqual(await page.locator('.newbie-card[data-skill-id] strong').allTextContents(), ['Grok Bot', 'Claude Duet', 'ChatGPT Dot', 'Meta Muse', 'OpenCode']);
    assert.equal(await page.locator('#page-packs .newbie-card').count(), 16);
    assert.equal(await page.locator('#newbie-cards > .newbie-card').count(), 16);
    assert.equal(await page.locator('#page-packs .newbie-card-group').count(), 0);

    const openCode = page.locator('.newbie-card[data-skill-id="opencode"]');
    await openCode.getByRole('button', { name: /选择 Skills 目录|更换 Skills 目录/ }).click();
    await page.waitForFunction(() => document.querySelector('[data-skill-id="opencode"] code')?.title.includes('interactive-preview'));
    const picked = page.locator('#newbie-cards .newbie-card[aria-pressed="true"]');
    while (await picked.count()) await picked.first().click();
    await openCode.click();
    assert.equal(await openCode.getAttribute('aria-pressed'), 'true');
    await page.locator('#newbie-go').click();
    await page.waitForFunction(() => document.getElementById('newbie-status').textContent.includes('预览不会写文件'));
    assert.equal(await page.locator('#newbie-cards .newbie-card[aria-pressed="true"]').count(), 1);

    const meta = page.locator('.newbie-card[data-skill-id="meta-muse"]');
    await meta.getByRole('button', { name: /选择 Skills 目录|更换 Skills 目录/ }).click();
    await page.waitForFunction(() => {
      const target = document.querySelector('.newbie-card[data-skill-id="meta-muse"] code');
      return !!target && /interactive-preview[\\/]local-agent-skills[\\/]meta-muse[\\/]skills[\\/]coldcoffee-meta-muse[\\/]SKILL\.md/.test(target.title);
    });
    await meta.click();
    assert.equal(await meta.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#page-packs .newbie-card').count(), 16);
    await page.locator('[data-page="relay"]').click();
    assert.equal(await page.locator('#page-relay [data-skill-id]').count(), 0);
    await page.locator('[data-page="packs"]').click();
    await page.locator('[data-page="community"]').click();
    assert.equal(await page.locator('#community .community-card').count(), 4);
    assert.equal(await page.locator('#community .community-link-card').count(), 2);
    assert.ok((await page.locator('#community').textContent()).includes('https://t.me/coolcoffeeai'));
    assert.ok((await page.locator('#community').textContent()).includes('https://t.me/chachachalkf'));

    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    console.log('PASS: OpenCode in original grid; isolated directory selection; browser install remains read-only; no skill cards on relay page; mobile width');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
