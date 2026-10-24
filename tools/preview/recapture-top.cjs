'use strict';
const { chromium } = require('playwright');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const shot = name => path.join(root, 'docs', 'assets', name);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 980 },
    deviceScaleFactor: 1,
    locale: 'zh-CN'
  });
  await page.goto('http://127.0.0.1:8772/workbench/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => [...document.querySelectorAll('.brand-avatar,.hero-art')].every(i => i.complete && i.naturalWidth > 0));

  async function topShot(name) {
    await page.evaluate(() => {
      const m = document.querySelector('main');
      if (m) m.scrollTop = 0;
      window.scrollTo(0, 0);
    });
    await page.locator('.topbar').scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.screenshot({ path: shot(name) });
  }

  await page.locator('#gate-input').fill('冷咖啡');
  await page.getByRole('button', { name: '发送验证', exact: true }).click();
  await page.waitForFunction(() => document.getElementById('gate-state').textContent.includes('已激活'));
  await page.getByRole('button', { name: '启用专用测试目录', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.pack-files button').length > 8);
  await topShot('ui-packs.png');

  await page.locator('[data-page=work]').click();
  await page.getByRole('button', { name: '代码交付', exact: true }).click();
  await page.getByRole('button', { name: '本地构建', exact: false }).click();
  await page.waitForFunction(() => document.getElementById('output').textContent.includes('笔记编辑器'));
  await topShot('ui-work.png');

  await page.locator('[data-page=eval]').click();
  await page.locator('#answer').fill('{"ok":true,"tests":["search","export"],"note":"本地检查通过"}');
  await page.locator('#eval-format').selectOption('json');
  await page.locator('#min-length').fill('1');
  await page.locator('#keywords').fill('ok,tests');
  await page.getByRole('button', { name: '执行检查', exact: false }).click();
  await page.waitForFunction(() => /\/ /.test(document.getElementById('eval-score').textContent));
  await topShot('ui-eval.png');

  await browser.close();
  console.log('rescroll-ok');
})().catch(e => {
  console.error(e);
  process.exit(1);
});
