'use strict';
// Real Electron IPC/native crypto with a synthetic Grok profile and intercepted RPC.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { _electron } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'work/grok-native');
fs.mkdirSync(output, { recursive: true });
const profile = fs.mkdtempSync(path.join(output, 'profile-'));
const env = {};
for (const name of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'DISPLAY', 'XAUTHORITY']) if (process.env[name]) env[name] = process.env[name];
Object.assign(env, { USERPROFILE: profile, HOME: profile, APPDATA: path.join(profile, 'Roaming'), LOCALAPPDATA: path.join(profile, 'Local'),
  ProgramFiles: path.join(profile, 'Programs'), 'ProgramFiles(x86)': path.join(profile, 'Programs32'), ProgramData: path.join(profile, 'ProgramData'),
  TEMP: path.join(profile, 'Temp'), TMP: path.join(profile, 'Temp'),
  CODEX_HOME: path.join(profile, '.codex'), CLAUDE_CONFIG_DIR: path.join(profile, '.claude'), GROK_HOME: path.join(profile, '.grok'),
  DSH_HOME: path.join(profile, '.dsh'), GLM_HOME: path.join(profile, '.glm'), GEMINI_HOME: path.join(profile, '.gemini'),
  DOUBAO_USER_SKILLS: path.join(profile, '.doubao'), WORKBUDDY_HOME: path.join(profile, '.workbuddy'), CURSOR_HOME: path.join(profile, '.cursor'),
  MIMOCODE_HOME: path.join(profile, '.mimocode'), KIMI_CODE_HOME: path.join(profile, '.kimi-code'),
});
fs.mkdirSync(env.TEMP, { recursive: true });
const token = 'fixture.' + Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') + '.fixture';
const machine = 'fixture-native-machine';
if (process.platform === 'win32') {
  const install = path.join(env.LOCALAPPDATA, 'Programs/Grok Bot');
  fs.mkdirSync(install, { recursive: true });
  fs.writeFileSync(path.join(install, 'Grok Bot.exe'), 'fixture file for version inspection; never executed');
  const key = crypto.randomBytes(32);
  const powershell = path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const protectedKey = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-Command',
    "Add-Type -AssemblyName System.Security; $data=[Convert]::FromBase64String([Console]::In.ReadToEnd()); [Console]::Out.Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($data,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))"],
  { windowsHide: true, input: key.toString('base64'), encoding: 'utf8', timeout: 15000 });
  assert.equal(protectedKey.status, 0, 'create synthetic DPAPI fixture');
  const encrypt = text => {
    const nonce = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
    return Buffer.concat([Buffer.from('v10'), nonce, cipher.update(text), cipher.final(), cipher.getAuthTag()]).toString('base64');
  };
  const config = path.join(env.APPDATA, 'Grok Bot');
  fs.mkdirSync(config, { recursive: true });
  fs.writeFileSync(path.join(config, 'Local State'), JSON.stringify({ os_crypt: {
    encrypted_key: Buffer.concat([Buffer.from('DPAPI'), Buffer.from(protectedKey.stdout.trim(), 'base64')]).toString('base64') } }));
  fs.writeFileSync(path.join(config, 'sand-secrets.json'), JSON.stringify({ 'cursor-accounts': JSON.stringify({ active: 'fixture',
    accounts: { fixture: { 'cursor-access-token': encrypt(token) } } }), 'cursor-machine-id': encrypt(machine) }));
  key.fill(0);
}

(async () => {
  let app;
  const executable = process.env.COLDCOFFEE_APP_EXECUTABLE;
  const loader = path.join(path.dirname(require.resolve('playwright-core/package.json')), 'lib/server/electron/loader.js');
  const args = [...(executable ? ['-r', loader] : [root]), '--preview-passive', '--packs', '--force-device-scale-factor=1', '--user-data-dir=' + path.join(profile, 'chromium')];
  if (process.platform === 'linux' && process.env.COLDCOFFEE_UI_NO_SANDBOX === '1') args.unshift('--no-sandbox');
  if (executable && process.platform === 'win32') env.PORTABLE_EXECUTABLE_FILE = executable;
  const report = { ok: false, packaged: !!executable, isolatedProfile: true, nativeCrypto: false, checks: [], browserErrors: [] };
  try {
    app = await _electron.launch({ ...(executable ? { executablePath: executable } : {}), args, env, timeout: 60000 });
    let page;
    for (let i = 0; i < 200 && !page; i++) { page = app.windows().find(item => item.url().includes('/workbench/index.html')); if (!page) await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.ok(page, 'actual workbench window');
    page.on('pageerror', error => report.browserErrors.push(error.message));
    await page.waitForFunction(() => document.querySelectorAll('#newbie-cards .newbie-card').length === 15);
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find(item => item.webContents.getURL().includes('/workbench/index.html'));
      win.webContents.setBackgroundThrottling(false); win.setContentSize(1500, 1100); win.showInactive();
    });
    await app.evaluate(async ({ protocol }, expectedToken) => {
      const fixture = { calls: [], entries: [], memories: [{ text: '回答先给结果，再说明依据。', scope: 'user', tier: 'log' }], seq: 1 };
      globalThis.__coldcoffeeMemoryFixture = fixture;
      const response = (doc, status = 200) => new Response(JSON.stringify(doc), { status, headers: { 'content-type': 'application/json' } });
      const body = value => Buffer.from(JSON.stringify(value)).toString('base64');
      protocol.handle('https', async request => {
        const url = new URL(request.url);
        if (url.origin !== 'https://api2.cursor.sh') { fixture.calls.push('unexpected-origin'); return response({}, 403); }
        if (request.headers.get('authorization') !== 'Bearer ' + expectedToken) { fixture.calls.push('bad-auth'); return response({}, 401); }
        const method = url.pathname.split('/').at(-1), data = await request.json();
        fixture.calls.push(method);
        if (method === 'ListGrokBotAgents') return response({ agents: [{ agentId: 'fixture-native-bot', name: '冷咖啡助手' }, { agentId: 'fixture-native-project', name: '项目搭档' }] });
        if (method === 'ListGrokBotUserBotMemories') return response({}, 403);
        if (method === 'SendGrokBotUserMessage') {
          const [, action, id] = data.text.match(/\[冷咖啡记忆 (READ|WRITE|FORGET) ([\w-]+)\]/);
          if (action === 'WRITE') fixture.memories.push({ text: data.text.match(/\n<<<\n([\s\S]*)\n>>>\n/)[1], scope: data.text.match(/^scope: (\w+)$/m)[1], tier: data.text.match(/^tier: (\w+)$/m)[1] });
          if (action === 'FORGET') fixture.memories = [];
          fixture.entries.push({ seq: String(++fixture.seq), body: body({ kind: 'user-message', clientNonce: data.messageId }) });
          const result = action === 'READ' ? { id, memories: fixture.memories } : { id, ok: true };
          fixture.entries.push({ seq: String(++fixture.seq), body: body({ kind: 'send-message', message: { content: JSON.stringify(result) } }) });
          return response({ dispatched: true });
        }
        if (method === 'ListGrokBotTranscriptEntries') return response({ entries: fixture.entries });
        return response({}, 404);
      });
    }, token);
    await page.locator('.nav[data-page="packs"]').click();
    await page.locator('[data-skill-id="grok-bot"]').getByRole('button', { name: '管理 Bot 云端记忆' }).click();
    assert.equal((await page.evaluate(() => window.coldbrew.grokMemory('status'))).state.connected, false);
    await page.locator('#gm-connect').click();
    if (process.platform === 'win32') {
      await page.waitForFunction(() => document.querySelector('#gm-connection').textContent.includes('已连接'), { timeout: 30000 });
      assert.match(await page.locator('#gm-checks').textContent(), /系统加密/);
      report.nativeCrypto = true;
      await page.locator('#gm-pull').click();
      await page.waitForFunction(() => document.querySelectorAll('.gm-item').length === 1);
      await page.locator('#gm-preset').click();
      await page.waitForFunction(() => document.querySelector('#gm-text').value.startsWith('冷咖啡已激活'));
      await page.locator('#gm-tier').selectOption('profile');
      await page.locator('#gm-prepare').click();
      await page.locator('#gm-confirm:not([hidden])').waitFor();
      await page.locator('#gm-confirm-check').check(); await page.locator('#gm-commit').click();
      await page.waitForFunction(() => document.querySelector('#gm-ack').textContent === 'Bot 已回复确认');
      await page.locator('#gm-pull').click();
      await page.waitForFunction(() => document.querySelector('#gm-readback').textContent === '原文、范围与属性匹配');
      report.checks.push('real DPAPI/GCM loader, trusted IPC, fixed RPC transport, write and independent readback');
      const state = await page.evaluate(() => window.coldbrew.grokMemory('status'));
      assert.ok(!JSON.stringify(state).includes(token)); assert.ok(!JSON.stringify(state).includes(machine));
      await page.locator('#gm-prepare').click();
      await page.locator('#gm-confirm:not([hidden])').waitFor();
    } else {
      await page.waitForFunction(() => document.querySelector('#gm-status').dataset.error === 'true');
      report.checks.push('trusted IPC and actionable missing-profile/platform error without personal data');
    }
    await page.evaluate(async () => {
      await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
      document.querySelector('#grok-memory').scrollTop = 0;
    });
    await page.locator('#grok-memory').screenshot({ path: path.join(output, 'native-memory.png') });
    const metrics = await app.evaluate(() => ({ calls: globalThis.__coldcoffeeMemoryFixture.calls }));
    assert.ok(!metrics.calls.includes('unexpected-origin')); assert.ok(!metrics.calls.includes('bad-auth'));
    report.rpcCalls = metrics.calls.length;
    report.checks.push('all service responses intercepted in-process; no real cloud request');
    await page.locator('#gm-close').click();
    await page.waitForFunction(async () => !(await window.coldbrew.grokMemory('status')).state.connected);
    const closed = await page.evaluate(() => window.coldbrew.grokMemory('status'));
    assert.equal(closed.state.connected, false); assert.equal(closed.state.items.length, 0);
    if (process.env.COLDCOFFEE_CAPTURE_PAGES === '1') {
      for (const name of ['packs', 'relay', 'community']) {
        await app.evaluate(({ BrowserWindow }, height) => {
          BrowserWindow.getAllWindows().find(win => win.webContents.getURL().includes('/workbench/index.html')).setContentSize(1600, height);
        }, name === 'community' ? 1280 : 1120);
        await page.locator(`.nav[data-page="${name}"]`).click();
        await page.locator(`#page-${name}.active`).waitFor();
        if (name === 'packs') await page.locator('#newbie-all').click();
        await page.evaluate(async () => {
          const main = document.querySelector('main'); if (main) main.scrollTop = 0;
          await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
        });
        assert.equal(await page.locator('#relay-api-key').inputValue(), '');
        await page.screenshot({ path: path.join(output, `workbench-${name}.png`) });
      }
    }
    assert.deepEqual(report.browserErrors, []);
    report.ok = true;
  } finally {
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    if (app) await app.close();
  }
  console.log(JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
