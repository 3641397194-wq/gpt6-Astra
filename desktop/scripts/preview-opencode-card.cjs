'use strict';
// Isolated visual review. No real client configuration is read or written.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { _electron } = require('playwright');

const root = path.resolve(__dirname, '..');
const profile = path.join(root, 'work', 'opencode-card-preview', crypto.randomUUID());
fs.mkdirSync(path.join(profile, 'Temp'), { recursive: true });
const env = {};
for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT']) if (process.env[key]) env[key] = process.env[key];
Object.assign(env, {
  USERPROFILE: profile, HOME: profile, APPDATA: path.join(profile, 'Roaming'), LOCALAPPDATA: path.join(profile, 'Local'),
  TEMP: path.join(profile, 'Temp'), TMP: path.join(profile, 'Temp'),
  OPENCODE_CONFIG_DIR: path.join(profile, 'opencode'),
  COLDCOFFEE_GATEWAY_TEST_HOME: path.join(profile, 'gateway'),
  CODEX_HOME: path.join(profile, '.codex'), DSH_HOME: path.join(profile, '.dsh'), CLAUDE_CONFIG_DIR: path.join(profile, '.claude'),
});

(async () => {
  const app = await _electron.launch({ args: [root, '--preview-passive', '--user-data-dir=' + path.join(profile, 'chromium')], env, timeout: 90000 });
  try {
    const page = await app.firstWindow();
    await page.locator('#page-visual.active').waitFor();
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/workbench/index.html'));
      win.webContents.setBackgroundThrottling(false);
      win.setContentSize(1600, 1100);
      win.showInactive();
    });
    await page.locator('.nav[data-page="packs"]').click();
    await page.locator('[data-skill-id="opencode"]').waitFor();
    await page.evaluate(() => {
      const card = document.querySelector('[data-skill-id="opencode"]');
      window.scrollTo({ top: window.scrollY + card.getBoundingClientRect().top - 280, behavior: 'instant' });
    });
    console.log('OpenCode isolated preview ready; original installer cards are preserved.');
    await new Promise(resolve => app.on('close', resolve));
  } finally {
    await app.close().catch(() => {});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
