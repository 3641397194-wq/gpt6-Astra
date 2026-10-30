'use strict';

// End-to-end integration against the running official Harness. No route mocks,
// browser-profile reuse or customer configuration reads are involved.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PREVIEW = path.join(ROOT, 'work/deepseek-plugin-preview');
const OUTPUT = path.join(PREVIEW, 'checks');
const TASK = '只列出当前已安装技能的名称，不运行扫描、不修改文件';
const QQ = ['1057540028', '1077074552', '618179023'];
const LINKS = ['https://t.me/coolcoffeeai', 'https://t.me/chachachalkf'];
const EXPECTED = [
  ['web', 'cc-rs-pentest-tools'], ['api', 'cc-rs-api-security'], ['chain', 'cc-rs-attack-chain'],
  ['reverse', 'cc-rs-reverse-engineering'], ['audit', 'cc-rs-code-audit'], ['report', 'cc-rs-docs-generator'],
];
const result = { target: 'official DeepSeek Harness 0.2.1-rc.2', origin: '', mockedRoutes: false, checks: [], bugs: [], screenshots: [], browserErrors: [] };
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const redact = text => String(text).replace(/(?:Bearer\s+|sk-)[A-Za-z0-9_./+-]+/gi, '[redacted]').replace(/[a-f0-9]{48,}/gi, '[redacted]').slice(0, 400);

function check(name, details = {}) { result.checks.push({ name, ok: true, ...details }); }
async function launchBrowser() {
  if (process.env.COLDCOFFEE_BROWSER_EXECUTABLE) return chromium.launch({ headless: true, executablePath: process.env.COLDCOFFEE_BROWSER_EXECUTABLE });
  if (fs.existsSync(chromium.executablePath())) return chromium.launch({ headless: true });
  return chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
}

async function api(page, route, body, withCapability = true) {
  return page.evaluate(async ({ route, body, withCapability }) => {
    const config = window.COLDCOFFEE_HARNESS;
    const response = await fetch(`${config.apiBase}${route}`, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'omit', cache: 'no-store',
      headers: { ...(withCapability ? { 'X-ColdCoffee-Session': config.token } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, noStore: response.headers.get('cache-control'), body: await response.json() };
  }, { route, body, withCapability });
}

async function main() {
  fs.mkdirSync(OUTPUT, { recursive: true });
  const session = JSON.parse(fs.readFileSync(path.join(PREVIEW, 'preview-session.json'), 'utf8'));
  const target = new URL(session.url);
  assert.equal(target.origin, 'http://127.0.0.1:8784');
  assert.equal(target.pathname, '/');
  assert.equal(target.search, '');
  result.origin = target.origin;
  const resume = process.env.COLDCOFFEE_NATIVE_UI_RESUME === '1';
  const previous = resume ? JSON.parse(fs.readFileSync(path.join(OUTPUT, 'native-integration-summary.json'), 'utf8')) : null;
  const cookie = String(session.cookie).split(';')[0];
  const separator = cookie.indexOf('=');
  assert.ok(separator > 0, 'Expected a generated official session cookie');
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, reducedMotion: 'no-preference' });
    await context.addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: target.origin, httpOnly: true, sameSite: 'Lax' }]);
    const page = await context.newPage();
    page.on('pageerror', error => result.browserErrors.push(redact(error.message)));
    const injectedPage = await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
    assert.equal(injectedPage.status(), 200);
    const panel = page.locator('#coldcoffee-harness-companion');
    await panel.waitFor({ state: 'attached' });
    await page.waitForFunction(() => !!window.COLDCOFFEE_HARNESS?.initialStatus?.plugin?.loaded);
    const injection = await page.evaluate(() => ({
      preview: window.COLDCOFFEE_HARNESS.preview,
      apiOrigin: new URL(window.COLDCOFFEE_HARNESS.apiBase).origin,
      version: window.COLDCOFFEE_HARNESS.version,
      shadow: !!document.getElementById('coldcoffee-harness-companion')?.shadowRoot,
      styleInjected: !!window.COLDCOFFEE_HARNESS.styleText,
    }));
    assert.equal(typeof injection.preview, 'boolean');
    assert.equal(injection.apiOrigin, target.origin);
    assert.ok(injection.shadow && injection.styleInjected);
    check('official HTML has native Cordis injections and an isolated shadow-root panel', injection);

    const denied = await api(page, '/api/status', undefined, false);
    assert.equal(denied.status, 403);
    assert.equal(denied.body.code, 'SESSION_REQUIRED');
    const live = await api(page, '/api/status');
    assert.equal(live.status, 200);
    assert.equal(live.noStore, 'no-store');
    assert.ok(live.body.plugin.loaded && live.body.harness.connected && live.body.harness.sessionController && live.body.harness.apiAvailable);
    assert.equal(live.body.skills.bundledTotal, 94);
    assert.ok(live.body.skills.total >= 94);
    check('native status requires the ephemeral capability header and reports real installed resources', {
      withoutHeader: denied.status, withHeader: live.status, skills: live.body.skills.total,
      bundledSkills: live.body.skills.bundledTotal, rea: live.body.rea.status, reaConnected: live.body.rea.connected,
    });
    const previouslyActivated = live.body.activated;
    if (previouslyActivated) {
      assert.ok(resume, 'Use a fresh official Harness preview process for the activation-gate test');
      const evidence = previous.checks.find(item => item.name === 'tasks are gated before activation and API accepts only the exact keyword');
      assert.ok(evidence?.ok && evidence.beforeActivation === 409);
      check('pre-activation gate evidence from the initial fresh-process pass is retained for this resumed UI check', { beforeActivation: evidence.beforeActivation, rejectedKeywords: evidence.rejectedKeywords, observedEarlierInSameProcess: true });
    } else {
      const beforeActivation = await api(page, '/api/tasks', { workflow: 'report', input: TASK });
      assert.equal(beforeActivation.status, 409);
      assert.equal(beforeActivation.body.code, 'ACTIVATION_REQUIRED');
    }
    const wrong = [];
    for (const keyword of ['冷咖啡!', '冷咖啡 ', ' 冷咖啡', 'coldcoffee']) {
      const response = await api(page, '/api/activate', { keyword });
      assert.equal(response.status, 400);
      assert.equal(response.body.code, 'KEYWORD_MISMATCH');
      wrong.push(response.status);
    }
    assert.equal((await api(page, '/api/status')).body.activated, previouslyActivated);
    check('tasks are gated before activation and API accepts only the exact keyword', { beforeActivation: 409, rejectedKeywords: wrong.length, preActivationObservedInEarlierPass: previouslyActivated });

    const sourceWelcome = fs.readFileSync(path.join(ROOT, 'src/lib/packs/activation-reply.md'), 'utf8');
    const welcome = await api(page, '/api/welcome');
    assert.equal(welcome.status, 200);
    assert.equal(welcome.body.text, sourceWelcome);
    check('the entire original welcome text is preserved verbatim', { bytes: Buffer.byteLength(sourceWelcome), sha256: sha(sourceWelcome) });

    for (const [id, skill] of EXPECTED) {
      const workflow = live.body.workflows.find(item => item.id === id);
      assert.equal(workflow?.skill, skill);
      assert.equal(workflow?.available, true);
    }
    assert.equal(live.body.workflows.length, 6);
    const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'resources/upstream-skills/catalog.json'), 'utf8'));
    const upstreamNames = new Set(catalog.sources.find(source => source.id === 'reverse-skill').skills.map(skill => `cc-rs-${skill.name}`));
    for (const [, skill] of EXPECTED) assert.ok(upstreamNames.has(skill), `${skill} has a pinned upstream source`);
    check('six native workflows resolve to the existing bundled skills', { workflows: live.body.workflows.map(item => ({ id: item.id, skill: item.skill, available: item.available })) });

    const intro = panel.locator('.cc-intro');
    await intro.waitFor({ state: 'visible' });
    await page.waitForTimeout(950);
    await page.screenshot({ path: path.join(OUTPUT, 'actual-splash.png') });
    result.screenshots.push('actual-splash.png');
    await panel.locator('[data-action="intro-enter"]').click();
    await intro.waitFor({ state: 'detached' });
    await panel.locator('#cc-harness-panel').waitFor({ state: 'visible' });
    const officialNotice = page.getByRole('button', { name: '继续', exact: true });
    if (await officialNotice.count()) await officialNotice.click({ timeout: 5000 });
    if (!previouslyActivated) {
      await panel.locator('[data-action="view"][data-view="tasks"]').click();
      assert.equal(await panel.locator('form[data-form="task"] button[type="submit"]').isDisabled(), true);
      await panel.locator('[data-action="activate-focus"]').click();
      await panel.locator('#cc-activation-keyword').fill('冷咖啡!');
      await panel.locator('form[data-form="activate"] button[type="submit"]').click();
      await panel.locator('.cc-inline-alert').filter({ hasText: '启动词是' }).waitFor();
      assert.equal((await api(page, '/api/status')).body.activated, false);
      await panel.locator('#cc-activation-keyword').fill('冷咖啡');
      const activationResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/coldcoffee/api/activate' && response.request().method() === 'POST');
      await panel.locator('form[data-form="activate"] button[type="submit"]').click();
      assert.equal((await activationResponse).status(), 200);
    }
    await panel.locator('.cc-activation-ready').waitFor();
    assert.equal((await api(page, '/api/status')).body.activated, true);
    await panel.locator('[data-action="welcome"]').click();
    await panel.locator('.cc-welcome').waitFor();
    await page.waitForFunction(expected => document.getElementById('coldcoffee-harness-companion')?.shadowRoot?.querySelector('.cc-welcome')?.textContent.replace(/\r\n/g, '\n') === expected, sourceWelcome.replace(/\r\n/g, '\n'));
    check('visible UI shows the full original welcome after activation', { htmlNewlinesNormalized: true, activationPerformedInEarlierPass: previouslyActivated });
    // Keep the primary panel screenshot uncluttered; full welcome was asserted.
    await panel.locator('[data-action="welcome"]').click();
    await panel.locator('.cc-body').evaluate(node => { node.scrollTop = 0; });
    await page.waitForTimeout(950);
    await page.screenshot({ path: path.join(OUTPUT, 'actual-panel.png') });
    result.screenshots.push('actual-panel.png');

    await panel.locator('[data-action="view"][data-view="tasks"]').click();
    await panel.locator('[data-action="select-workflow"][data-workflow="report"]').click();
    await panel.locator('#cc-task-input').fill(TASK);
    const taskResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/coldcoffee/api/tasks' && response.request().method() === 'POST', { timeout: 40000 });
    await panel.locator('form[data-form="task"] button[type="submit"]').click();
    const submitted = await taskResponse;
    const submittedBody = await submitted.json();
    assert.ok([202, 502].includes(submitted.status()));
    assert.ok(submittedBody.task?.id);
    assert.equal(submittedBody.task.input, TASK);
    assert.ok(submittedBody.task.sessionId, 'The actual official sessionController created a Harness session');
    let history;
    const deadline = Date.now() + 20000;
    do {
      history = (await api(page, '/api/history')).body;
      if (history.tasks.find(task => task.id === submittedBody.task.id)?.status === 'error') break;
      await page.waitForTimeout(500);
    } while (Date.now() < deadline);
    const actualTask = history.tasks.find(task => task.id === submittedBody.task.id);
    assert.ok(actualTask);
    assert.ok(['accepted', 'running', 'error'].includes(actualTask.status), `No model credential was configured; observed ${actualTask.status}`);
    assert.notEqual(actualTask.status, 'completed');
    result.task = { httpStatus: submitted.status(), sessionCreated: true, accepted: actualTask.accepted === true, status: actualTask.status, error: redact(actualTask.error || ''), completed: false, input: TASK };
    check('UI submits the bounded task to the actual official sessionController and preserves a non-completed history record', result.task);
    await panel.locator('[data-action="view"][data-view="history"]').click();
    await panel.locator('[data-action="refresh-history"]').click();
    await panel.locator('.cc-task-input').filter({ hasText: TASK }).waitFor();
    assert.equal(await panel.locator('.cc-task-badge').filter({ hasText: /^已完成$/ }).count(), 0);
    check('native task history renders the actual task without a fabricated completion badge');

    await panel.locator('[data-action="view"][data-view="community"]').click();
    for (const id of QQ) assert.equal(await panel.locator(`[data-action="copy-qq"][data-value="${id}"]`).count(), 1);
    for (const link of LINKS) assert.equal(await panel.locator(`a[href="${link}"]`).count(), 1);
    await panel.locator('[data-action="view"][data-view="settings"]').click();
    const animation = panel.locator('[data-action="toggle-animation"]');
    assert.equal(await animation.getAttribute('aria-checked'), 'true');
    await animation.click();
    await panel.locator('[data-action="toggle-animation"][aria-checked="false"]').waitFor();
    assert.equal((await api(page, '/api/status')).body.settings.animations, false);
    assert.equal(await panel.locator('.cc-root.cc-no-motion').count(), 1);
    await panel.locator('[data-action="toggle-animation"]').click();
    await panel.locator('[data-action="toggle-animation"][aria-checked="true"]').waitFor();
    assert.equal((await api(page, '/api/status')).body.settings.animations, true);
    await panel.locator('.cc-toast').waitFor({ state: 'detached', timeout: 6000 });
    await page.waitForTimeout(950);
    await page.screenshot({ path: path.join(OUTPUT, 'actual-settings.png') });
    result.screenshots.push('actual-settings.png');
    check('animation preference changes actual plugin settings and all three QQ groups plus both Telegram links are correct', { qq: QQ, telegram: LINKS });
    result.ok = result.browserErrors.length === 0;
    assert.equal(result.browserErrors.length, 0, 'Browser runtime errors');
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  result.ok = false;
  result.failure = redact(error.message);
  process.exitCode = 1;
}).finally(() => {
  fs.mkdirSync(OUTPUT, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT, 'native-integration-summary.json'), JSON.stringify(result, null, 2) + '\n');
  // The report contains no cookies, capability tokens or request headers.
  console.log(JSON.stringify(result, null, 2));
});
