'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { _electron } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'work/brand-v6-ui');
const profile = path.join(output, crypto.randomUUID());
fs.mkdirSync(path.join(profile, 'Temp'), { recursive: true });
const env = {};
for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT']) if (process.env[key]) env[key] = process.env[key];
Object.assign(env, {
  USERPROFILE: profile, HOME: profile, APPDATA: path.join(profile, 'Roaming'), LOCALAPPDATA: path.join(profile, 'Local'),
  TEMP: path.join(profile, 'Temp'), TMP: path.join(profile, 'Temp'), COLDCOFFEE_GATEWAY_TEST_HOME: path.join(profile, 'gateway'),
  CODEX_HOME: path.join(profile, '.codex'), DSH_HOME: path.join(profile, '.dsh'), CLAUDE_CONFIG_DIR: path.join(profile, '.claude'),
});
(async () => {
  let app;
  const report = { ok: false, checks: [], screenshots: [], errors: [] };
  try {
    const executablePath = process.env.COLDCOFFEE_APP_EXECUTABLE;
    const loader = path.join(path.dirname(require.resolve('playwright-core/package.json')), 'lib/server/electron/loader.js');
    app = await _electron.launch({ ...(executablePath ? { executablePath } : {}), args: [...(executablePath ? ['-r', loader] : [root]), '--preview-passive', '--user-data-dir=' + path.join(profile, 'chromium')], env, timeout: 90000 });
    const page = await app.firstWindow();
    page.on('pageerror', error => report.errors.push(error.message));
    await page.waitForSelector('#page-visual.active');
    await page.waitForFunction(() => document.getElementById('vg-engine').dataset.ready === 'true', { timeout: 40000 });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/workbench/index.html')).setContentSize(1480, 1000));
    await page.locator('.vg-hero-art').evaluate(img => img.decode());
    async function capture(file) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      // Native capture may precede a background window's compositor commit.
      await page.waitForTimeout(300);
      const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/workbench/index.html')).capturePage()).toPNG().toString('base64'));
      fs.writeFileSync(path.join(output, file), Buffer.from(png, 'base64'));
      report.screenshots.push(file);
    }
    assert.equal(await page.locator('#vg-setup').count(), 1);
    assert.equal(await page.locator('#vg-demo').count(), 1);
    const hero = await page.locator('.vg-hero-art').evaluate(img => ({ width: img.naturalWidth, height: img.naturalHeight, url: img.getAttribute('src') }));
    assert.equal(hero.width, 3840); assert.equal(hero.height, 2160);
    assert.match(hero.url, /brand-v6/);
    await capture('01-home.png');
    await page.locator('#vg-demo').click();
    await page.waitForFunction(() => document.querySelectorAll('#vg-treemap .vg-tile').length >= 3);
    await page.waitForFunction(() => document.querySelector('#vg-flow-status').textContent.includes('HTTP 200'));
    await capture('02-home-live.png');
    const columns = await page.evaluate(() => {
      const flow = document.querySelector('.vg-flow-card').getBoundingClientRect();
      const context = document.querySelector('.vg-context-card').getBoundingClientRect();
      return { fullWidthRoute: context.top >= flow.bottom && Math.abs(context.left - flow.left) < 1 && Math.abs(context.width - flow.width) < 1, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    assert.equal(columns.fullWidthRoute, true); assert.equal(columns.overflow, false);
    report.checks.push('4K original heroine, unified portrait, full-width live routing and context, no horizontal overflow');
    await page.locator('#vg-setup').click(); await capture('03-setup.png');
    await page.locator('[data-vg-close="vg-setup-dialog"]').click();
    for (const name of ['packs', 'relay', 'toolbox', 'community']) {
      await page.locator(`.nav[data-page="${name}"]`).click();
      await page.locator(`#page-${name}.active`).waitFor();
      await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1);
      if (name === 'packs') {
        await page.waitForFunction(() => document.querySelectorAll('.newbie-card').length === 15);
        assert.match(await page.locator('#newbie').evaluate(el => getComputedStyle(el).backgroundImage), /brand-v6/);
      }
      if (name === 'community') {
        assert.equal(await page.locator('#community .community-card').count(), 4);
        assert.equal(await page.locator('#community .community-link-card').count(), 2);
        assert.ok((await page.locator('#community').textContent()).includes('1131239659'));
        assert.ok((await page.locator('#community').textContent()).includes('coolcoffeeai'));
      }
      await capture(`04-${name}.png`);
    }
    report.checks.push('all fifteen model seats, original installer, relay and toolbox preserved; four QQ cards and both Telegram entrances present');
    await page.locator('.nav[data-page="visual"]').click();
    const splashFile = path.join(root, 'src/splash/index.html');
    const splashPromise = app.waitForEvent('window');
    await app.evaluate(({ BrowserWindow }, file) => {
      const splash = new BrowserWindow({ width: 920, height: 560, frame: false, show: false, backgroundColor: '#0b0b0d', webPreferences: { contextIsolation: true, sandbox: true } });
      return splash.loadFile(file);
    }, executablePath ? (await app.evaluate(({ app }) => app.getAppPath())) + '/src/splash/index.html' : splashFile);
    const splash = await splashPromise;
    await splash.locator('.splash-art img').evaluate(img => img.decode());
    await splash.emulateMedia({ reducedMotion: 'reduce' });
    const splashPng = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/splash/index.html')).capturePage()).toPNG().toString('base64'));
    fs.writeFileSync(path.join(output, '05-splash.png'), Buffer.from(splashPng, 'base64')); report.screenshots.push('05-splash.png');
    assert.equal(await splash.locator('h1').textContent(), '冷咖啡');
    await splash.close();
    assert.deepEqual(report.errors, []);
    report.checks.push('matching native splash with reduced-motion support');
    report.ok = true;
    console.log(JSON.stringify(report, null, 2));
  } catch (error) { report.failure = error.stack; console.error(error); process.exitCode = 1; }
  finally { if (app) await app.close().catch(() => {}); fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); }
})();
