'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { _electron } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'work/display-ui');
const profile = path.join(output, crypto.randomUUID());
fs.mkdirSync(path.join(profile, 'Temp'), { recursive: true });
const env = {};
for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT']) if (process.env[key]) env[key] = process.env[key];
Object.assign(env, { USERPROFILE: profile, HOME: profile, APPDATA: path.join(profile, 'Roaming'), LOCALAPPDATA: path.join(profile, 'Local'), TEMP: path.join(profile, 'Temp'), TMP: path.join(profile, 'Temp'), COLDCOFFEE_GATEWAY_TEST_HOME: path.join(profile, 'gateway'), CODEX_HOME: path.join(profile, '.codex'), DSH_HOME: path.join(profile, '.dsh'), CLAUDE_CONFIG_DIR: path.join(profile, '.claude') });
const executablePath = process.env.COLDCOFFEE_APP_EXECUTABLE;
const loader = path.join(path.dirname(require.resolve('playwright-core/package.json')), 'lib/server/electron/loader.js');
const args = [...(executablePath ? ['-r', loader] : [root]), '--preview-passive', '--user-data-dir=' + path.join(profile, 'chromium')];
(async () => {
  let app;
  const report = { ok: false, checks: [], layouts: [], errors: [] };
  async function launch() {
    app = await _electron.launch({ ...(executablePath ? { executablePath } : {}), args, env, timeout: 90000 });
    const page = await app.firstWindow(); page.on('pageerror', error => report.errors.push(error.message));
    await page.waitForSelector('#page-visual.active');
    await page.waitForFunction(() => document.getElementById('vg-engine').dataset.ready === 'true', { timeout: 40000 });
    await page.locator('#view-reset').waitFor(); return page;
  }
  const zoomStatus = page => page.evaluate(() => window.coldbrew.view('status'));
  async function capture(name) {
    const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/workbench/index.html')).capturePage()).toPNG().toString('base64'));
    fs.writeFileSync(path.join(output, name), Buffer.from(png, 'base64'));
  }
  async function atZoom(page, percent) { await page.waitForFunction(async value => (await window.coldbrew.view('status')).percent === value && document.getElementById('view-reset').textContent === value + '%', percent); }
  async function resize(width, height) { await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/workbench/index.html')).setContentSize(size.width, size.height), { width, height }); }
  try {
    let page = await launch();
    await resize(1480, 1000);
    const readable = await page.evaluate(() => Object.fromEntries(['.vg-heading p', '#vg-quick-start', '.vg-node strong', '.vg-node small', '.sidebar .nav span'].map(selector => [selector, parseFloat(getComputedStyle(document.querySelector(selector)).fontSize)])));
    for (const [selector, minimum] of [['.vg-heading p', 16], ['#vg-quick-start', 16], ['.vg-node strong', 15], ['.vg-node small', 13], ['.sidebar .nav span', 15]]) assert.ok(readable[selector] >= minimum, selector);
    await page.locator('#vg-demo').click(); await page.waitForFunction(() => document.querySelectorAll('#vg-treemap .vg-tile').length >= 3);
    await capture('01-readable-home.png');
    report.checks.push('body, primary controls, navigation and chart labels have readable default typography');
    await page.locator('#view-larger').click(); await atZoom(page, 110);
    await page.locator('#view-larger').click(); await atZoom(page, 125);
    await page.locator('#view-smaller').click(); await atZoom(page, 110);
    await page.locator('#view-reset').click(); await atZoom(page, 100);
    await page.keyboard.press('Control+='); await atZoom(page, 110);
    await page.keyboard.press('Control+0'); await atZoom(page, 100);
    await page.evaluate(() => document.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -120, cancelable: true })));
    await atZoom(page, 110);
    await page.locator('#view-reset').click(); await atZoom(page, 100);
    report.checks.push('toolbar, native Ctrl shortcuts and Ctrl+wheel use one zoom owner without double scaling');
    await page.locator('#maximize').click();
    await page.waitForFunction(async () => (await window.coldbrew.view('status')).maximized);
    await page.waitForFunction(() => document.getElementById('maximize').getAttribute('aria-label') === '还原窗口');
    await capture('02-maximized.png');
    await page.locator('#maximize').click();
    await page.waitForFunction(async () => !(await window.coldbrew.view('status')).maximized);
    assert.equal((await zoomStatus(page)).percent, 100);
    await page.locator('#minimize').click();
    await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/workbench/index.html'));
      const until = Date.now() + 3000;
      while (!win.isMinimized() && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 30));
      if (!win.isMinimized()) throw new Error('native minimize did not apply');
      win.restore(); win.showInactive();
    });
    report.checks.push('native maximize, restore, minimize and restore work and keep the selected page scale');
    for (const size of [{ width: 1480, height: 960 }, { width: 1080, height: 800 }, { width: 900, height: 700 }]) {
      await resize(size.width, size.height);
      await page.locator('#view-reset').click(); await atZoom(page, 100);
      for (const target of [100, 125, 150, 200]) {
        while ((await zoomStatus(page)).percent < target) await page.locator('#view-larger').click();
        await atZoom(page, target);
        await page.waitForFunction(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
        const layout = await page.evaluate(() => {
          const visible = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight; };
          return { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, toolbarVisible: visible('.display-controls'), windowButtonsVisible: visible('.window-actions'), bodyFont: parseFloat(getComputedStyle(document.querySelector('.vg-heading p')).fontSize) };
        });
        assert.equal(layout.toolbarVisible, true, JSON.stringify({ size, target, layout }));
        assert.equal(layout.windowButtonsVisible, true, JSON.stringify({ size, target, layout }));
        assert.ok(layout.bodyFont >= 16);
        await page.locator('#vg-setup').click(); await page.locator('#vg-setup-dialog[open]').waitFor();
        const dialogFits = await page.evaluate(() => { const d = document.getElementById('vg-setup-dialog'), r = d.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 && d.scrollWidth <= d.clientWidth + 1; });
        assert.equal(dialogFits, true, `setup dialog at ${size.width}/${target}%`);
        await page.locator('[data-vg-close="vg-setup-dialog"]').click();
        report.layouts.push({ nativeWidth: size.width, scale: target, ...layout });
      }
    }
    await capture('03-small-window-200.png');
    assert.equal(await page.locator('#view-larger').isDisabled(), true);
    await page.locator('#view-reset').click(); await atZoom(page, 100);
    await page.locator('#view-smaller').click(); await page.locator('#view-smaller').click(); await atZoom(page, 80);
    assert.equal(await page.locator('#view-smaller').isDisabled(), true);
    await page.locator('#view-reset').click(); await page.locator('#view-larger').click(); await page.locator('#view-larger').click(); await atZoom(page, 125);
    report.checks.push('12 window/zoom combinations fit without horizontal scrolling; toolbar and dialogs stay reachable; zoom limits clamp');
    await app.close(); app = null;
    page = await launch(); await atZoom(page, 125);
    await page.reload(); await atZoom(page, 125);
    report.checks.push('zoom preference survives a full desktop restart and document reload');
    assert.deepEqual(report.errors, []);
    report.ok = true; console.log(JSON.stringify(report, null, 2));
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { if (app) await app.close().catch(() => {}); fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); }
})();
