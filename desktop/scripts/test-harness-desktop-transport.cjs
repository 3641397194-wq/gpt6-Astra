'use strict';

// Real Electron/custom-protocol regression with synthetic SessionController
// events. This is a transport fixture, not acceptance of the official product.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { _electron } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'work/desktop-compat/transport-test');
const WELCOME = fs.readFileSync(path.join(ROOT, 'src/lib/packs/activation-reply.md'), 'utf8');
const SKILLS = ['cc-rs-pentest-tools', 'cc-rs-api-security', 'cc-rs-attack-chain', 'cc-rs-reverse-engineering', 'cc-rs-code-audit', 'cc-rs-docs-generator'];
const WORKFLOWS = ['web', 'api', 'chain', 'reverse', 'audit', 'report'];
const report = { kind: 'electron-desktop-transport-fixture', officialDesktopAcceptance: false, customerConfigurationRead: false, externalModelRequests: 0, checks: [], modes: [] };
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
function check(name, detail = {}) { report.checks.push({ name, ok: true, ...detail }); }
async function until(predicate, message) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) { if (await predicate()) return; await delay(30); }
  throw new Error(message);
}

function documentHtml(rows, desktop) {
  // Desktop receives its injection table asynchronously through a sandboxed
  // preload, in the same order as applyIndexInjections. Web/file use parser
  // injection. The host document deliberately contains no app/client mocks.
  const head = '<meta charset="utf-8"><title>Coldcoffee transport fixture</title>';
  const body = '<main id="fixture-host"><h1>Transport fixture</h1><p>No model provider is configured.</p></main>';
  if (desktop) return `<!doctype html><html><head>${head}<script>globalThis.__DSH_BOOT_READY__ = Promise.withResolvers()</script></head><body>${body}<script>
    dshDesktopBoot.ready().then(({injections,streamBaseUrl})=>{
      globalThis.__DSH_TRANSPORT__={ownsHost:true,streamBaseUrl};
      for(const row of injections){
        if(row.kind==='global')globalThis[row.name]=row.value;
        else if(row.kind==='style'){const el=document.createElement('style');el.textContent=row.text;document.head.append(el);}
        else if(row.kind==='script'){const el=document.createElement('script');el.textContent=row.text;(row.placement==='head'?document.head:document.body).append(el);}
      }
      __DSH_BOOT_READY__.resolve();
    }).catch(error=>{__DSH_BOOT_READY__.reject(error);console.error(error)});
  </script></body></html>`;
  let injectedHead = '', injectedBody = '';
  for (const row of rows) {
    if (row.kind === 'global') injectedHead += `<script>globalThis[${JSON.stringify(row.name)}]=${JSON.stringify(row.value).replaceAll('<', '\\u003c')}</script>`;
    else if (row.kind === 'style') injectedHead += `<style>${row.text}</style>`;
    else if (row.kind === 'script') {
      const tag = `<script>${row.text.replace(/<\/script/gi, '<\\/script')}</script>`;
      if (row.placement === 'head') injectedHead += tag; else injectedBody += tag;
    }
  }
  return `<!doctype html><html><head>${head}${injectedHead}</head><body>${body}${injectedBody}</body></html>`;
}

async function fixture(mode, run) {
  const { createPluginRuntime } = await import(pathToFileURL(path.join(ROOT, 'src/lib/harness-plugin/index.mjs')).href);
  const home = path.join(run, mode, 'home');
  fs.mkdirSync(home, { recursive: true });
  for (const skill of SKILLS) {
    const directory = path.join(home, 'skills', skill);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'SKILL.md'), `---\nname: ${skill}\ndescription: transport fixture only\n---\nSynthetic fixture.\n`);
  }
  const calls = [], requests = [], timers = new Set();
  let runtime, origin;
  const cookie = `coldcoffee_fixture=${crypto.randomBytes(16).toString('hex')}`;
  const services = {
    sessionController: {
      create: async request => { const sessionId = `transport-fixture-${calls.filter(row => row.kind === 'create').length + 1}`; calls.push({ kind: 'create', request, sessionId }); return { sessionId }; },
      prompt: async (request, signal) => {
        assert.equal(signal.aborted, false);
        calls.push({ kind: 'prompt', request });
        if (!request.content[0].text.includes('HOLD_FOR_CANCEL')) {
          const timer = setTimeout(() => {
            timers.delete(timer);
            const session = { id: request.sessionId };
            runtime.observeSession(session, { type: 'turn/start', data: {} });
            runtime.observeSession(session, { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: `TRANSPORT_FIXTURE_RESULT::${request.sessionId}` }] } } });
            runtime.observeSession(session, { type: 'turn/end', data: { reason: { kind: 'completed' } } });
          }, 80);
          timers.add(timer);
        }
        return { accepted: true };
      },
      cancel: async request => { calls.push({ kind: 'cancel', request }); return { accepted: true }; },
    },
  };
  const ctx = { get: key => services[key], on() {}, effect: callback => callback() };
  let server, html;
  if (mode !== 'file') {
    server = http.createServer((req, res) => {
      const record = { path: req.url, method: req.method, origin: req.headers.origin || null, shellCookie: req.headers.cookie === cookie };
      requests.push(record);
      res.once('finish', () => { record.status = res.statusCode; });
      if (req.url === '/' && req.method === 'GET') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); return; }
      // Model the official shell's authenticated host ownership, without using
      // a real browser cookie or exposing any production credential.
      if (mode === 'desktop' && !record.shellCookie && !record.origin) { res.writeHead(401); res.end(); return; }
      runtime.handler(req, res).catch(error => { res.writeHead(500); res.end(error.message); });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${server.address().port}`;
    services.webServer = { getOrigin: () => origin, register: () => () => {} };
  }
  runtime = createPluginRuntime(ctx, { dshHome: home });
  if (mode !== 'file') runtime.mount(ctx);
  const rows = [];
  runtime.injections(rows);
  html = documentHtml(rows, mode === 'desktop');
  const directory = path.join(run, mode);
  const index = path.join(directory, 'index.html');
  fs.writeFileSync(index, html);
  const url = mode === 'desktop' ? 'dsh-app://app/' : mode === 'web' ? `${origin}/` : pathToFileURL(index).href;
  const config = path.join(directory, 'fixture-config.json');
  const profile = path.join(directory, 'profile');
  fs.mkdirSync(path.join(profile, 'temp'), { recursive: true });
  fs.writeFileSync(config, JSON.stringify({ mode, profile, url, origin, cookie, html, injections: rows }), { mode: 0o600 });
  return {
    mode, profile, config, runtime, calls, requests, origin,
    async close() {
      for (const timer of timers) clearTimeout(timer);
      runtime.dispose();
      if (server) { server.closeAllConnections?.(); await new Promise(resolve => server.close(resolve)); }
    },
  };
}

async function request(page, route, body) {
  return page.evaluate(async ({ route, body }) => {
    const config = window.COLDCOFFEE_HARNESS;
    const response = await fetch(`${config.basePath}${route}`, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'omit',
      headers: { 'X-ColdCoffee-Session': config.token, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() };
  }, { route, body });
}

async function runMode(mode, run) {
  const f = await fixture(mode, run);
  let application;
  const errors = [], browserRequests = [];
  const result = { mode, expectedCarrier: mode === 'desktop' ? 'dsh-app://app' : mode, checks: [] };
  const env = {};
  for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'DISPLAY', 'WAYLAND_DISPLAY', 'XDG_RUNTIME_DIR']) if (process.env[key]) env[key] = process.env[key];
  Object.assign(env, { USERPROFILE: f.profile, HOME: f.profile, APPDATA: path.join(f.profile, 'roaming'), LOCALAPPDATA: path.join(f.profile, 'local'), TEMP: path.join(f.profile, 'temp'), TMP: path.join(f.profile, 'temp'), DSH_HOME: path.join(f.profile, '.dsh') });
  try {
    application = await _electron.launch({
      executablePath: require('electron'),
      args: [...(process.env.COLDCOFFEE_UI_NO_SANDBOX === '1' ? ['--no-sandbox'] : []), path.join(__dirname, 'harness-desktop-transport-fixture.cjs'), `--fixture-config=${f.config}`],
      env, timeout: 45000,
    });
    const page = await application.firstWindow();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', item => browserRequests.push({ url: item.url(), method: item.method() }));
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].loadURL(global.__COLDCOFFEE_TRANSPORT_FIXTURE__.url));
    const panel = page.locator('#coldcoffee-harness-companion');
    await panel.waitFor({ state: 'attached' });
    if (mode === 'file') {
      await page.waitForFunction(() => document.getElementById('coldcoffee-harness-companion').shadowRoot.querySelector('.cc-intro'));
      await panel.locator('[data-action="intro-skip"]').click();
      await panel.locator('[data-action="toggle"]').click();
      assert.equal(await panel.locator('[data-form="activate"] button[type="submit"]').isDisabled(), true);
      await panel.locator('[data-action="view"][data-view="tasks"]').click();
      assert.equal(await panel.locator('.cc-task-submit').isDisabled(), true);
      assert.equal(f.calls.length, 0);
      assert.equal(f.requests.length, 0);
      assert.equal(browserRequests.filter(item => item.url.startsWith('http:') || item.url.startsWith('dsh-app:')).length, 0);
      result.checks.push('file document without a host exposes the skin but keeps activation and tasks disabled');
    } else {
      await page.waitForFunction(() => document.getElementById('coldcoffee-harness-companion').shadowRoot.querySelector('[data-footer-state]').textContent.includes('已连接'));
      await panel.locator('[data-action="intro-skip"]').click();
      await panel.locator('[data-action="toggle"]').click();
      const loaded = await page.evaluate(async () => {
        const root = document.getElementById('coldcoffee-harness-companion').shadowRoot;
        const images = [...root.querySelectorAll('img')];
        await Promise.all(images.map(image => image.decode()));
        const blob = document.documentElement.style.getPropertyValue('--cc-host-artwork').match(/url\("(.+)"\)/)?.[1];
        const image = new Image(); image.src = blob; await image.decode();
        return { images: images.length, allDecoded: images.every(image => image.naturalWidth > 0), blobDecoded: image.naturalWidth > 0 && blob.startsWith('blob:'), skin: document.documentElement.classList.contains('coldcoffee-harness-skin'), isolated: !!root };
      });
      assert.ok(loaded.images >= 2 && loaded.allDecoded && loaded.blobDecoded && loaded.skin && loaded.isolated);
      result.checks.push('real injected images, Blob wallpaper, whole-host skin and shadow panel render');
      const gated = await request(page, '/api/tasks', { workflow: 'web', input: 'fixture before activation' });
      assert.equal(gated.status, 409);
      assert.equal(f.calls.length, 0);
      for (const keyword of ['冷咖啡!', 'coffee', '']) {
        assert.equal((await request(page, '/api/activate', { keyword })).status, 400);
      }
      await panel.locator('#cc-activation-keyword').fill('冷咖啡!');
      await panel.locator('[data-form="activate"] button[type="submit"]').click();
      await panel.locator('.cc-inline-alert').filter({ hasText: '启动词是' }).waitFor();
      assert.equal(f.runtime.status().activated, false);
      await panel.locator('#cc-activation-keyword').fill('冷咖啡');
      await panel.locator('[data-form="activate"] button[type="submit"]').click();
      await panel.locator('.cc-activation-ready').waitFor();
      await panel.locator('[data-action="welcome"]').click();
      assert.equal((await request(page, '/api/welcome')).body.text, WELCOME);
      await until(async () => (await panel.locator('.cc-welcome').textContent()).replace(/\r\n/g, '\n') === WELCOME.replace(/\r\n/g, '\n'), 'The complete original welcome must survive browser line-ending normalization.');
      assert.equal(f.runtime.status().activated, true);
      result.checks.push('exact activation gate and byte-for-byte complete original welcome');

      await panel.locator('[data-action="view"][data-view="tasks"]').click();
      for (let index = 0; index < WORKFLOWS.length; index++) {
        const workflow = WORKFLOWS[index];
        await panel.locator(`[data-action="select-workflow"][data-workflow="${workflow}"]`).click();
        await panel.locator('#cc-task-input').fill(`TRANSPORT_FIXTURE_TASK::${workflow}`);
        const receipt = page.waitForResponse(response => response.url().endsWith('/coldcoffee/api/tasks') && response.request().method() === 'POST');
        await panel.locator('.cc-task-submit').click();
        const response = await receipt;
        assert.equal(response.status(), 202);
        await panel.locator('.cc-task-submit').filter({ hasText: '开始任务' }).waitFor();
      }
      await until(() => f.runtime.status().tasks.length === 6 && f.runtime.status().tasks.every(task => task.status === 'completed'), 'Synthetic controller results should reach the production runtime.');
      const prompts = f.calls.filter(call => call.kind === 'prompt');
      assert.equal(prompts.length, 6);
      for (let index = 0; index < prompts.length; index++) {
        assert.equal(prompts[index].request.mode, 'queue');
        assert.equal(prompts[index].request.content[0].text.split('\n')[0], `/${SKILLS[index]}`);
        assert.ok(prompts[index].request.content[0].text.includes(`TRANSPORT_FIXTURE_TASK::${WORKFLOWS[index]}`));
      }
      await panel.locator('[data-action="view"][data-view="history"]').click();
      await until(async () => (await panel.locator('.cc-task-result').count()) === 6, 'All six event-derived results should render in history.');
      for (let index = 1; index <= 6; index++) assert.ok((await panel.locator('#cc-view-history').textContent()).includes(`TRANSPORT_FIXTURE_RESULT::transport-fixture-${index}`));
      result.checks.push('all six workflow mappings submit through actual runtime dispatch and render controller event results');

      await panel.locator('[data-action="view"][data-view="tasks"]').click();
      await panel.locator('#cc-task-input').fill('HOLD_FOR_CANCEL');
      await panel.locator('.cc-task-submit').click();
      await panel.locator('[data-action="cancel-task"]').waitFor();
      await panel.locator('[data-action="cancel-task"]').click();
      await until(() => f.runtime.status().tasks.at(-1).status === 'cancelled', 'Cancellation should call the host controller.');
      assert.equal(f.calls.filter(call => call.kind === 'cancel').length, 1);
      result.checks.push('task cancellation reaches the SessionController fixture');

      await panel.locator('[data-action="view"][data-view="settings"]').click();
      await panel.locator('[data-action="toggle-skin"]').click();
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains('coldcoffee-harness-skin')), false);
      await panel.locator('[data-action="toggle-skin"]').click();
      assert.equal(await page.evaluate(() => document.documentElement.classList.contains('coldcoffee-harness-skin')), true);
      await panel.locator('[data-action="set-backdrop"][data-mode="focus"]').click();
      assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--cc-host-artwork-opacity')), '.08');
      await panel.locator('[data-action="toggle-animation"]').click();
      await until(() => !f.runtime.status().settings.animations, 'Animation off should persist in runtime settings.');
      await panel.locator('[data-action="toggle-animation"][aria-checked="false"]').waitFor();
      assert.equal(await panel.locator('.cc-root').evaluate(element => element.classList.contains('cc-no-motion')), true);
      await panel.locator('[data-action="toggle-animation"]').click();
      await panel.locator('[data-action="toggle-animation"][aria-checked="true"]').waitFor();
      assert.equal(f.runtime.status().settings.animations, true);
      await panel.locator('[data-action="replay-intro"]').click();
      await panel.locator('.cc-intro-art').waitFor();
      assert.notEqual(await panel.locator('.cc-intro-art').evaluate(element => getComputedStyle(element).animationName), 'none');
      await panel.locator('[data-action="intro-skip"]').click();
      result.checks.push('skin restore, wallpaper strength, live animation settings and opening replay');

      await panel.locator('[data-action="view"][data-view="community"]').click();
      assert.equal(await panel.locator('[data-footer-state]').textContent(), mode === 'desktop' ? '已连接 Harness 桌面端' : '已连接 Harness 插件');
      const community = await panel.locator('#cc-view-community').textContent();
      for (const group of ['1057540028', '1077074552', '618179023']) assert.ok(community.includes(group));
      for (const link of ['https://t.me/coolcoffeeai', 'https://t.me/chachachalkf', 'https://coldcoffeeai.com/']) assert.ok(await panel.locator(`#cc-view-community a[href="${link}"]`).count());
      result.checks.push('current QQ groups, Telegram chat/channel and relay promotion remain visible');

      const panelCalls = browserRequests.filter(item => item.url.includes('/coldcoffee/'));
      assert.ok(panelCalls.length >= 15);
      for (const item of panelCalls) {
        const url = new URL(item.url);
        assert.equal(url.protocol, mode === 'desktop' ? 'dsh-app:' : 'http:');
        if (mode === 'desktop') assert.equal(url.host, 'app');
      }
      if (mode === 'desktop') {
        assert.ok(f.requests.filter(item => item.path.startsWith('/coldcoffee/')).every(item => item.shellCookie && item.origin === null));
        // This is the exact direct-loopback request shape emitted by the old
        // panel. It goes through Chromium/CORS and the real production handler.
        const before = f.requests.length;
        const oldRequest = await page.evaluate(async () => {
          const config = window.COLDCOFFEE_HARNESS;
          try {
            const response = await fetch(`${config.apiBase}${config.status}`, { credentials: 'omit', headers: { 'X-ColdCoffee-Session': config.token } });
            return { status: response.status, failed: !response.ok };
          } catch (error) { return { failed: true, errorType: error.name }; }
        });
        assert.equal(oldRequest.failed, true);
        await until(() => f.requests.slice(before).some(item => item.origin === 'dsh-app://app' && item.status === 403), 'The legacy direct-loopback request should reproduce an actual host 403.');
        result.legacyAbsoluteRequest = { failed: oldRequest.failed, hostStatus: 403 };
        result.checks.push('old absolute HTTP request fails with actual host 403; fixed UI stays on the owned custom protocol');
      }
      result.panelRequests = panelCalls.length;
    }
    const records = await application.evaluate(() => global.__COLDCOFFEE_TRANSPORT_FIXTURE__.records);
    assert.deepEqual(records.blockedExternal, []);
    assert.deepEqual(records.rendererErrors, []);
    assert.deepEqual(errors, []);
    result.rendererErrors = 0;
    result.externalRequests = 0;
    result.hostTaskCalls = f.calls.length;
    result.proxyRequests = records.proxyRequests.length;
    result.ok = true;
    report.modes.push(result);
    for (const item of result.checks) check(`${mode}: ${item}`);
    console.log(`PASS ${mode}: ${result.checks.length} checks`);
  } catch (error) {
    result.ok = false;
    result.error = error.message;
    result.rendererErrors = errors;
    report.modes.push(result);
    throw error;
  } finally {
    if (application) await application.close();
    await f.close();
    // Ephemeral capabilities and shell cookies are not retained in QA reports.
    fs.rmSync(f.config, { force: true });
  }
}

async function main() {
  fs.mkdirSync(OUTPUT, { recursive: true });
  const run = fs.mkdtempSync(path.join(OUTPUT, 'run-'));
  try {
    for (const mode of ['desktop', 'web', 'file']) await runMode(mode, run);
    report.ok = true;
  } finally {
    // run is a uniquely created child of the verified ignored output directory.
    assert.equal(path.dirname(run), OUTPUT);
    fs.rmSync(run, { recursive: true, force: true });
    fs.writeFileSync(path.join(OUTPUT, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
  }
  console.log(`PASS: ${report.checks.length} Electron transport checks; no external model requests.`);
}
main().catch(error => { console.error(error.stack); process.exitCode = 1; });
