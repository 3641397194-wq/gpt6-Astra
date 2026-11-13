'use strict';
// Native display controls with a disposable, deliberately unwritable preference.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { _electron } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'work/display-resilience');
fs.mkdirSync(output, { recursive: true });
const profile = fs.mkdtempSync(path.join(output, 'profile-'));
const chromium = path.join(profile, 'chromium');
const preference = path.join(chromium, 'display-preferences.json');
fs.mkdirSync(preference, { recursive: true }); // Rename cannot overwrite a directory.
fs.mkdirSync(path.join(profile, 'Temp'), { recursive: true });
const env = {};
for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'DISPLAY', 'XAUTHORITY']) if (process.env[key]) env[key] = process.env[key];
Object.assign(env, { USERPROFILE: profile, HOME: profile, APPDATA: path.join(profile, 'Roaming'), LOCALAPPDATA: path.join(profile, 'Local'), TEMP: path.join(profile, 'Temp'), TMP: path.join(profile, 'Temp'), COLDCOFFEE_GATEWAY_TEST_HOME: path.join(profile, 'gateway'), CODEX_HOME: path.join(profile, '.codex'), DSH_HOME: path.join(profile, '.dsh'), CLAUDE_CONFIG_DIR: path.join(profile, '.claude') });
const executablePath = process.env.COLDCOFFEE_APP_EXECUTABLE;
const loader = path.join(path.dirname(require.resolve('playwright-core/package.json')), 'lib/server/electron/loader.js');
const args = [...(executablePath ? ['-r', loader] : [root]), '--preview-passive', '--packs', '--user-data-dir=' + chromium];
if (process.platform === 'darwin') args.push('--use-mock-keychain');
if (process.platform === 'linux' && process.env.COLDCOFFEE_UI_NO_SANDBOX === '1') args.unshift('--no-sandbox');
if (executablePath && process.platform === 'win32') env.PORTABLE_EXECUTABLE_FILE = executablePath;
const bounded = (work, ms, name) => {
  let timer;
  return Promise.race([work, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(name + ' timed out')), ms); })]).finally(() => clearTimeout(timer));
};
(async () => {
  let app;
  const report = { ok: false, packaged: !!executablePath, isolatedProfile: true, checks: [], browserErrors: [] };
  async function launch() {
    app = await _electron.launch({ ...(executablePath ? { executablePath } : {}), args, env, timeout: 60000 });
    let page;
    for (let i = 0; i < 200 && !page; i++) { page = app.windows().find(win => win.url().includes('/workbench/index.html')); if (!page) await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.ok(page, 'workbench window');
    page.on('pageerror', error => report.browserErrors.push(error.message));
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find(item => item.webContents.getURL().includes('/workbench/index.html'));
      win.webContents.setBackgroundThrottling(false); win.setContentSize(1100, 800); win.showInactive();
      const original = win.webContents.setZoomFactor.bind(win.webContents);
      globalThis.__displayZoomEvents = [];
      win.webContents.setZoomFactor = value => { const before = win.webContents.getZoomFactor(); original(value); globalThis.__displayZoomEvents.push({ before, requested: value, after: win.webContents.getZoomFactor() }); };
    });
    await page.waitForSelector('#view-larger');
    return page;
  }
  async function atZoom(page, percent, saved) {
    // waitForFunction treats an async predicate as a truthy Promise. Poll IPC
    // explicitly, then also verify the actual Electron zoom below.
    const until = Date.now() + 15000;
    let state;
    do {
      state = await page.evaluate(async () => ({ ...await window.coldbrew.view('status'), label: document.querySelector('#view-reset').textContent }));
      if (state.percent === percent && state.preferenceSaved === saved && state.label === percent + '%') break;
      await new Promise(resolve => setTimeout(resolve, 50));
    } while (Date.now() < until);
    assert.equal(state.percent, percent, 'reported zoom');
    assert.equal(state.preferenceSaved, saved, 'saved preference state');
    assert.equal(state.label, percent + '%', 'visible zoom label');
    const native = await app.evaluate(async ({ BrowserWindow }, expected) => {
      const contents = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/workbench/index.html')).webContents;
      const until = Date.now() + 3000;
      while (Math.abs(contents.getZoomFactor() - expected) >= 0.001 && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 50));
      return contents.getZoomFactor();
    }, percent / 100);
    assert.ok(Math.abs(native - percent / 100) < 0.001, `native zoom ${native}, expected ${percent / 100}`);
  }
  async function shortcut(key) {
    // Exercise the real main-process handler without focusing the native
    // window or sending keyboard input to the user's current application.
    const prevented = await app.evaluate(({ BrowserWindow }, key) => {
      const contents = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/workbench/index.html')).webContents;
      let prevented = false;
      contents.emit('before-input-event', { preventDefault: () => { prevented = true; } }, { type: 'keyDown', key, control: process.platform !== 'darwin', meta: process.platform === 'darwin', alt: false });
      return prevented;
    }, key);
    assert.equal(prevented, true, 'programmatic shortcut prevents Chromium double scaling');
  }
  async function close() { const closing = app; app = null; try { await bounded(closing.close(), 8000, 'Electron close'); } catch (error) { closing.process().kill('SIGKILL'); throw error; } }
  try {
    let page = await launch();
    report.phase = 'toolbar-failed-write';
    await page.locator('#view-larger').click(); await atZoom(page, 110, false);
    await page.locator('#view-feedback:not([hidden])').waitFor();
    assert.match(await page.locator('#view-feedback').innerText(), /缩放已生效/);
    assert.ok(!(await page.locator('#view-feedback').innerText()).includes(profile));
    report.phase = 'shortcut-failed-write';
    await shortcut('0');
    await atZoom(page, 100, false);
    report.phase = 'reload-failed-write';
    await page.reload(); await atZoom(page, 100, false);
    report.checks.push('native toolbar, programmatic before-input shortcut and reload retain consistent native/visible zoom despite a failed preference write');
    assert.ok(fs.statSync(preference).isDirectory());
    fs.rmdirSync(preference);
    report.phase = 'same-zoom-retry';
    await page.locator('#view-reset').click(); await atZoom(page, 100, true);
    assert.equal(await page.locator('#view-feedback').isHidden(), true);
    assert.equal(JSON.parse(fs.readFileSync(preference, 'utf8')).zoom, 1);
    report.checks.push('same-zoom retry persists the preference and clears the visible warning after the disk error is removed');
    report.phase = 'persisted-zoom';
    await page.locator('#view-larger').click(); await page.locator('#view-larger').click(); await atZoom(page, 125, true);
    await close();
    report.phase = 'restart';
    page = await launch(); await atZoom(page, 125, true);
    assert.equal(await page.locator('#view-feedback').isHidden(), true);
    report.checks.push('recovered preferences survive a complete desktop restart');
    assert.deepEqual(report.browserErrors, []);
    report.ok = true;
  } catch (error) { console.error(error.message); report.error = error.message; if (app) report.zoomEvents = await bounded(app.evaluate(() => globalThis.__displayZoomEvents), 3000, 'zoom diagnostics').catch(() => []); process.exitCode = 1; }
  finally {
    if (app) try { await close(); } catch (error) { report.ok = false; report.cleanupError = error.message; process.exitCode = 1; }
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  }
})();
