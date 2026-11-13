'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const { once } = require('node:events');
const { _electron } = require('playwright');
const root = path.resolve(__dirname, '..');
const reviewing = process.argv.includes('--review');
const output = process.env.COLDCOFFEE_ROUTING_TEST_OUTPUT || path.join(root, 'work/routing-ui'); fs.mkdirSync(output, { recursive: true });
const profile = path.join(output, crypto.randomUUID()); fs.mkdirSync(path.join(profile, 'Temp'), { recursive: true });
const env = {};
for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT']) if (process.env[key]) env[key] = process.env[key];
Object.assign(env, { USERPROFILE: profile, HOME: profile, APPDATA: path.join(profile, 'Roaming'), LOCALAPPDATA: path.join(profile, 'Local'), TEMP: path.join(profile, 'Temp'), TMP: path.join(profile, 'Temp'), COLDCOFFEE_GATEWAY_TEST_HOME: path.join(profile, 'gateway'), CODEX_HOME: path.join(profile, '.codex'), DSH_HOME: path.join(profile, '.dsh'), CLAUDE_CONFIG_DIR: path.join(profile, '.claude') });
(async () => {
  let app, page, releaseStream; const servers = [], received = [], report = { ok: false, externalModelRequests: 0, errors: [], checks: [] };
  try {
    const relayInputs = [];
    for (const id of ['primary', 'backup']) {
      const key = 'routing-ui-fixture-' + crypto.randomUUID();
      const server = http.createServer(async (req, res) => {
        assert.equal(req.headers.authorization, 'Bearer ' + key);
        res.setHeader('content-type', 'application/json');
        if (req.url === '/v1/models') return res.end(JSON.stringify({ data: [{ id: `${id}-model` }] }));
        let raw = ''; for await (const c of req) raw += c;
        const body = JSON.parse(raw), task = body.messages?.at(-1)?.content || '';
        received.push({ id, task });
        if ((id === 'primary' && task.includes('failover')) || task.includes('all-fail')) { res.statusCode = 503; return res.end(JSON.stringify({ error: { type: 'server_error', message: `synthetic ${id} failure, ${key}` } })); }
        res.setHeader('content-type', 'text/event-stream');
        res.write(`data: ${JSON.stringify({ id: 'ui-routing', object: 'chat.completion.chunk', model: `${id}-model`, choices: [{ index: 0, delta: { content: '真实本机' }, finish_reason: null }] })}\n\n`);
        if (task.includes('failover-slow')) {
          const pulse = setInterval(() => { if (!res.destroyed) res.write(`data: ${JSON.stringify({ id: 'ui-routing', object: 'chat.completion.chunk', model: `${id}-model`, choices: [{ index: 0, delta: { content: '·' }, finish_reason: null }] })}\n\n`); }, 180);
          try { await new Promise(resolve => { releaseStream = resolve; const timeout = setTimeout(resolve, 45000); timeout.unref(); }); } finally { clearInterval(pulse); }
        }
        else await new Promise(r => setTimeout(r, task.includes('slow') ? 3500 : 1800));
        if (res.destroyed) return;
        res.end(`data: ${JSON.stringify({ id: 'ui-routing', object: 'chat.completion.chunk', model: `${id}-model`, choices: [{ index: 0, delta: { content: '路由验证通过' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1200, completion_tokens: 20, total_tokens: 1220, prompt_tokens_details: { cached_tokens: 600 } } })}\n\ndata: [DONE]\n\n`);
      });
      server.listen(0, '127.0.0.1'); await once(server, 'listening'); servers.push(server);
      relayInputs.push({ id, name: id === 'primary' ? '本机主线路' : '本机后备线路', key, baseUrl: `http://127.0.0.1:${server.address().port}/v1`, wireApi: 'chat', remember: false });
    }
    const executablePath = process.env.COLDCOFFEE_APP_EXECUTABLE;
    const loader = path.join(path.dirname(require.resolve('playwright-core/package.json')), 'lib/server/electron/loader.js');
    app = await _electron.launch({ ...(executablePath ? { executablePath } : {}), args: [...(executablePath ? ['-r', loader] : [root]), '--preview-passive', '--user-data-dir=' + path.join(profile, 'chromium')], env, timeout: 90000 });
    page = await app.firstWindow(); page.on('pageerror', e => report.errors.push(e.message));
    await page.waitForSelector('#page-visual.active'); await page.waitForFunction(() => document.querySelector('#vg-engine').dataset.ready === 'true', { timeout: 40000 });
    await page.locator('#vg-about').click();
    await page.waitForFunction(() => document.querySelector('#vg-detail-content').textContent.includes('GNU GENERAL PUBLIC LICENSE'));
    assert.equal(await page.locator('#vg-detail-content details').getAttribute('open'), null);
    assert.match(await page.locator('#vg-detail-content').textContent(), /Copyright \(c\) 2026 yetone/);
    await page.locator('[data-vg-close="vg-detail-dialog"]').click();
    report.checks.push('copyright and complete license originals available on demand in About, without promotional source buttons');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/workbench/')).setContentSize(1580, 1080));
    const capture = async name => {
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); await page.waitForTimeout(350);
      const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/workbench/')).capturePage()).toPNG().toString('base64'));
      fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(png, 'base64'));
    };
    await page.locator('#vg-demo').click(); await page.waitForFunction(() => document.querySelector('#vg-flow-status').textContent.includes('HTTP 200'));
    assert.match(await page.locator('#vg-route-explanation').textContent(), /只有 1 条候选连接/);
    assert.equal(await page.locator('#vg-treemap [data-kind="remaining"]').count(), 1);
    assert.ok(await page.locator('#vg-context-items .vg-content-row').count() >= 4);
    await page.locator('[data-context-mode="content"]').click(); assert.equal(await page.locator('#vg-treemap [data-kind="remaining"]').count(), 0);
    await page.locator('#vg-context-filter').selectOption('results');
    assert.ok(await page.locator('#vg-context-items .vg-content-row[data-kind="results"]').count() > 0);
    assert.equal(await page.locator('#vg-context-items .vg-content-row:not([data-kind="results"])').count(), 0);
    await page.locator('[data-context-mode="window"]').click();
    await page.locator('.vg-context-card').scrollIntoViewIfNeeded(); await capture('01-context-window');
    report.checks.push('actual prompt parts and per-item counts, remaining-window area, used-only zoom and category filter');
    for (const input of relayInputs) await page.evaluate(input => window.coldbrew.gateway('configure', input), input);
    await page.evaluate(() => window.ColdCoffeeVisual.refresh());
    await page.locator('#vg-groups-open').click(); await page.waitForFunction(() => document.querySelector('#vg-group-status').textContent.includes('已从网关同步'));
    async function createGroup(id, name, members) {
      await page.locator('#vg-group-new').click(); await page.locator('#vg-group-id').fill(id); await page.locator('#vg-group-name').fill(name);
      await page.locator('#vg-group-routing').selectOption('order'); await page.locator('#vg-group-affinity').selectOption('off');
      for (const member of members) { await page.locator('#vg-group-add').selectOption(member); await page.locator('#vg-group-add-button').click(); }
      await page.locator('#vg-group-save').click(); await page.waitForFunction(() => document.querySelector('#vg-group-form').hidden && document.querySelector('#vg-group-status').textContent.includes('已保存'));
    }
    await createGroup('nested-backup', '嵌套后备组', ['backup/backup-model']);
    await createGroup('routing-fixture', '冷咖啡主备 · 本机验证', ['primary/primary-model', 'group/nested-backup']);
    await capture('02-native-groups');
    const mainCard = page.locator('.vg-group-card').filter({ has: page.locator('.vg-group-card-title strong', { hasText: '冷咖啡主备' }) });
    await mainCard.getByRole('button', { name: '选择此组用于接入' }).click();
    await page.locator('[data-vg-close="vg-groups-dialog"]').click();
    assert.equal(await page.locator('#vg-model-select').inputValue(), 'group/routing-fixture');
    const groupPlan = await page.evaluate(() => window.coldbrew.gateway('plan', { client: 'codex', model: 'group/routing-fixture' }));
    assert.ok(groupPlan.files.length > 0);
    await page.evaluate(id => window.coldbrew.gateway('connect', { id }), groupPlan.id);
    const customerConfig = path.join(env.COLDCOFFEE_GATEWAY_TEST_HOME, 'customer/.codex/config.toml');
    assert.match(fs.readFileSync(customerConfig, 'utf8'), /group\/routing-fixture/);
    await page.evaluate(() => window.coldbrew.gateway('restore', { client: 'codex' }));
    assert.equal(fs.existsSync(customerConfig), false);
    report.checks.push('native basic group creation, ordered cross-provider members, nested group and actual group selection');
    report.checks.push('routing group ref is deployable through the real Codex adapter and can be exactly restored');
    const send = text => page.evaluate(text => window.coldbrew.gateway('send', { model: 'group/routing-fixture', text }), text);
    await send('route-normal'); await page.evaluate(() => window.ColdCoffeeVisual.refresh());
    assert.equal(await page.locator('#vg-branches .vg-seat[data-state="hit"][data-provider="primary"]').count(), 1);
    assert.equal(await page.locator('#vg-branches .vg-seat[data-state="standby"][data-provider="backup"]').count(), 1);
    assert.equal(received.filter(r => r.task === 'route-normal').length, 1);
    const snapshot = () => page.evaluate(() => window.coldbrew.gateway('snapshot'));
    const first = (await snapshot()).routes.at(-1); assert.equal(first.tries.length, 1);
    await page.waitForFunction(() => document.getElementById('vg-flow').dataset.courier === 'arrived');
    await page.locator('#vg-courier-replay').click();
    assert.equal(await page.locator('#vg-flow').getAttribute('data-courier'), 'replay');
    await page.locator('#vg-courier-replay').click();
    assert.equal(await page.locator('#vg-flow').getAttribute('data-courier'), 'arrived');
    assert.equal(received.filter(r => r.task === 'route-normal').length, 1, 'animation replay makes no extra model requests');
    report.checks.push('first branch success leaves backups visibly untried; no invented calls or failover');
    const switching = send('route-failover-slow');
    switching.catch(() => {});
    let live;
    const liveDeadline = Date.now() + 20000;
    while (Date.now() < liveDeadline && !live) {
      live = (await snapshot()).routes.find(r => !r.done && r.tries?.length === 2 && r.tries[0].status === 503 && r.tries[1].provider === 'backup');
      if (!live) await page.waitForTimeout(100);
    }
    assert.ok(live, 'real two-attempt streaming trace arrives before releasing the fixture');
    assert.equal(live.done, false); assert.equal(live.tries.length, 2); assert.equal(live.tries[0].status, 503);
    await page.evaluate(() => window.ColdCoffeeVisual.refresh());
    await page.waitForSelector('#vg-branches .vg-seat[data-state="running"][data-provider="backup"]');
    await page.waitForFunction(() => document.querySelector('.vg-courier').dataset.moving === 'true');
    assert.equal(await page.locator('.vg-courier').getAttribute('data-seat'), live.tries[1].id);
    assert.ok(Number(await page.locator('#vg-flow').getAttribute('data-courier-distance')) >= 170, 'the cat has a real runway, beyond the former short node gap');
    assert.ok(Number(await page.locator('.vg-courier').getAttribute('data-travel-ms')) >= 3800, 'travel is slower and scales with route distance');
    const stableBefore = await page.evaluate(() => {
      window.__routingStable = [...document.querySelectorAll('#vg-branches .vg-branch, #vg-branches .vg-seat')];
      window.__routingStable.find(node => node.classList.contains('vg-seat')).focus();
      return document.querySelector('#vg-flow-status').textContent;
    });
    await page.waitForTimeout(500); await page.evaluate(() => window.ColdCoffeeVisual.refresh());
    const stableAfter = await page.evaluate(() => ({
      retained: [...document.querySelectorAll('#vg-branches .vg-branch, #vg-branches .vg-seat')].every((node, i) => node === window.__routingStable[i]),
      focusRetained: document.activeElement === window.__routingStable.find(node => node.classList.contains('vg-seat')),
      status: document.querySelector('#vg-flow-status').textContent,
      composite: getComputedStyle(document.querySelector('.vg-courier')).willChange,
    }));
    assert.equal(stableAfter.retained, true, 'stream updates keep branch/seat DOM identities');
    assert.equal(stableAfter.focusRetained, true, 'stream updates do not steal keyboard focus');
    assert.notEqual(stableAfter.status, stableBefore, 'verification spans actual new streaming bytes');
    assert.equal(stableAfter.composite, 'transform');
    report.checks.push('continuous streaming updates preserve branch nodes and keyboard focus; motion uses compositor transforms');
    const catBefore = await page.locator('.vg-courier').evaluate(node => ({ x: node.dataset.x, y: node.dataset.y }));
    await page.waitForTimeout(420);
    const catAfter = await page.locator('.vg-courier').evaluate(node => ({ x: node.dataset.x, y: node.dataset.y }));
    assert.notDeepEqual(catBefore, catAfter, 'Ragdoll runs along the actual active route');
    const walk = await page.evaluate(async () => {
      const cat = document.querySelector('.vg-courier'), sprite = cat.firstElementChild;
      const deadline = performance.now() + Number(cat.dataset.travelMs) * 2 + 1100;
      const directions = new Set(), facings = new Set(); let minOpacity = 1, maxStep = 0, previous = null, returns = 0;
      while (performance.now() < deadline) {
        await new Promise(requestAnimationFrame);
        const point = { x: Number(cat.dataset.x), y: Number(cat.dataset.y), direction: cat.dataset.direction };
        directions.add(point.direction); facings.add(getComputedStyle(sprite).transform);
        minOpacity = Math.min(minOpacity, Number(getComputedStyle(cat).opacity), Number(getComputedStyle(sprite).opacity));
        if (previous) { maxStep = Math.max(maxStep, Math.hypot(point.x - previous.x, point.y - previous.y)); if (previous.direction === 'backward' && point.direction === 'forward') returns++; }
        previous = point;
      }
      return { directions: [...directions].sort(), facings: [...facings], minOpacity, maxStep, returns };
    });
    assert.deepEqual(walk.directions, ['backward', 'forward']); assert.ok(walk.returns >= 1, 'the cat comes home before starting another trip');
    assert.equal(walk.minOpacity, 1, 'no fade or invisible restart during either direction');
    assert.ok(walk.maxStep < 24, 'no teleport at the turn or gateway');
    assert.ok(walk.facings.some(value => value.startsWith('matrix(-1,')), 'the cat faces left when returning');
    report.courierRoundTrip = walk;
    assert.equal(await page.locator('.vg-courier-layer').evaluate(node => getComputedStyle(node).pointerEvents), 'none');
    await page.locator('#vg-courier-toggle').click();
    assert.equal(await page.locator('.vg-courier').getAttribute('data-moving'), 'false');
    await page.locator('#vg-courier-toggle').click();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => document.querySelector('.vg-courier').dataset.moving === 'false');
    assert.equal(await page.locator('#vg-courier-replay').isDisabled(), true);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.waitForFunction(() => document.querySelector('.vg-courier').dataset.moving === 'true');
    report.checks.push('Ragdoll continuously walks out and back, faces the return direction, remains fully visible and never teleports at endpoints; pause, reduced motion and replay preserve actual route evidence');
    await page.locator('.vg-flow-card').scrollIntoViewIfNeeded(); await capture('03-live-failover');
    const beforeDone = await page.locator('.vg-courier').evaluate(node => ({ x: Number(node.dataset.x), y: Number(node.dataset.y) }));
    releaseStream(); releaseStream = null;
    await switching; await page.evaluate(() => window.ColdCoffeeVisual.refresh());
    const afterDone = await page.locator('.vg-courier').evaluate(node => ({ x: Number(node.dataset.x), y: Number(node.dataset.y) }));
    assert.ok(Math.hypot(afterDone.x - beforeDone.x, afterDone.y - beforeDone.y) < 50, 'completed requests do not snap the cat to the model');
    const done = (await snapshot()).routes.at(-1);
    assert.equal(done.actualProvider, 'backup'); assert.equal(done.actualModel, 'backup-model'); assert.equal(done.group.subs[0].id, 'nested-backup');
    assert.equal(await page.locator('#vg-branches .vg-nested-group').count(), 1);
    assert.equal(await page.locator('#vg-branches .vg-seat[data-state="failed"][data-provider="primary"]').count(), 1);
    assert.equal(await page.locator('#vg-branches .vg-seat[data-state="hit"][data-provider="backup"]').count(), 1);
    assert.match(await page.locator('#vg-route-story').textContent(), /HTTP 503/);
    assert.match(await page.locator('#vg-cache').textContent(), /50%/);
    assert.match(await page.locator('#vg-free').textContent(), /未提供窗口上限/);
    const totals = (await snapshot()).totals; assert.equal(totals.requests, 3); assert.equal(totals.rerouted, 1); assert.equal(totals.errors, 0);
    assert.equal(await page.locator('#vg-total-requests').textContent(), '3');
    assert.equal(await page.locator('#vg-total-rerouted').textContent(), '1');
    await capture('04-complete-failover');
    report.checks.push('real 503 to backup 200 through pinned binary, streaming state, nested topology, cache hit, unknown window, authoritative totals');
    const text = JSON.stringify(await snapshot()); for (const input of relayInputs) assert.ok(!text.includes(input.key));
    assert.ok(!(await page.locator('#vg-route-story').textContent()).includes(relayInputs[0].key));
    await page.locator('#vg-model-select').selectOption('primary/primary-model');
    assert.match(await page.locator('#vg-route-name').textContent(), /冷咖啡主备/); assert.match(await page.locator('#vg-model-stat').textContent(), /backup-model/);
    await page.locator('#vg-route-select').selectOption(String(first.id));
    assert.equal(await page.locator('#vg-branches .vg-seat[data-state="hit"][data-provider="primary"]').count(), 1);
    const concurrent = send('route-concurrent-slow');
    let concurrentObserved = false;
    for (const deadline = Date.now() + 10000; Date.now() < deadline;) {
      if ((await snapshot()).routes.some(r => !r.done)) { concurrentObserved = true; break; }
      await page.waitForTimeout(80);
    }
    assert.equal(concurrentObserved, true, 'the concurrent request reaches the actual gateway before checking historical selection');
    await page.evaluate(() => window.ColdCoffeeVisual.refresh());
    assert.equal(await page.locator('#vg-flow').getAttribute('data-flow'), 'done');
    assert.equal(await page.locator('#vg-route-select').inputValue(), String(first.id));
    await concurrent;
    report.checks.push('viewing a historical request stays accurate when setup model changes or a different request streams concurrently');
    await page.locator('#vg-route-select').selectOption(String(done.id));
    await page.waitForTimeout(350);
    await page.locator('#vg-flow-detail').click(); assert.match(await page.locator('#vg-detail-dialog').textContent(), /下一次实际尝试/); await page.locator('[data-vg-close="vg-detail-dialog"]').click();
    const branch = page.locator('#vg-branches .vg-branch').first(); await branch.locator('summary').click(); assert.equal(await branch.getAttribute('open'), null); await branch.locator('summary').click();
    report.checks.push('branch collapse/expand and full evidence timeline are functional');
    const currentCatalog = await page.evaluate(() => window.coldbrew.gateway('groups'));
    const group = currentCatalog.groups.find(g => g.id === 'routing-fixture');
    const rejected = await page.evaluate(async g => { try { await window.coldbrew.gateway('group-save', { create: false, id: g.id, name: 'stale', revision: 'stale', members: g.members, routing: g.routing, affinity: g.affinity }); return false; } catch (e) { return e.message.includes('其他窗口更新'); } }, group);
    assert.equal(rejected, true);
    report.checks.push('stale routing group edits are rejected rather than overwriting another window');
    if (!reviewing) {
      const failedRequest = await page.evaluate(async () => { try { await window.coldbrew.gateway('send', { model: 'group/routing-fixture', text: 'all-fail' }); return false; } catch { return true; } });
      assert.equal(failedRequest, true);
      await page.locator('#vg-refresh').click(); const failure = (await snapshot()).routes.at(-1); assert.ok(failure.status >= 400); assert.equal(failure.actualProvider, '');
      await page.locator('#vg-route-select').selectOption(String(failure.id));
      assert.equal(await page.locator('#vg-flow').getAttribute('data-flow'), 'error');
      assert.equal(await page.locator('#vg-branches .vg-seat[data-state="hit"]').count(), 0);
      assert.ok((await snapshot()).totals.errors > 0);
      report.checks.push('all-upstream failure reports the real client error, without a fictitious successful path');
    }
    await page.locator('#vg-route-select').selectOption(String(done.id));
    await page.locator('.vg-flow-card').scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    const placement = () => page.evaluate(() => {
      const cat = document.querySelector('.vg-courier').getBoundingClientRect();
      const flow = document.querySelector('#vg-flow').getBoundingClientRect();
      const models = [...document.querySelectorAll('#vg-branches .vg-branch-title')].map(node => node.getBoundingClientRect());
      return { inside: cat.left >= flow.left && cat.right <= flow.right && cat.top >= flow.top && cat.bottom <= flow.bottom, overlapping: models.some(node => cat.left < node.right && cat.right > node.left && cat.top < node.bottom && cat.bottom > node.top), distance: Number(document.querySelector('#vg-flow').dataset.courierDistance) };
    });
    assert.deepEqual(await placement(), { inside: true, overlapping: false, distance: (await placement()).distance }, 'arrived cat parks outside branch titles');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/workbench/')).webContents.setZoomFactor(1.25));
    await page.waitForTimeout(250);
    const zoomed = await placement(); assert.equal(zoomed.inside, true); assert.equal(zoomed.overlapping, false);
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/workbench/')); w.webContents.setZoomFactor(1); w.setMinimumSize(600, 600); w.setContentSize(680, 1000); });
    await page.waitForTimeout(250);
    const narrow = await placement(); assert.equal(narrow.inside, true); assert.equal(narrow.overlapping, false); assert.ok(narrow.distance >= 120);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await capture('06-narrow-route');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/workbench/')).setContentSize(1580, 1080));
    await page.waitForTimeout(250);
    report.checks.push('cat parks clear of model titles at normal size, 125% zoom and a narrow window; no horizontal overflow');
    await capture('05-final-route');
    assert.deepEqual(report.errors, []); report.ok = true; report.receivedFixtureCalls = received.length;
    if (reviewing) {
      await page.evaluate(() => {
        const banner = document.getElementById('vg-banner'); banner.hidden = false;
        banner.textContent = '独立本机预览 · 当前显示实际经过网关的双线路切换：测试主线路 503 → 嵌套后备组 200。零外部模型调用；测试 Key、模型与客户端目录均为独立样例。';
        window.scrollTo(0, document.querySelector('.vg-flow-card').offsetTop - 95);
      });
      await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/workbench/')); w.setTitle('冷咖啡 · 多分支路由增强 · 独立本机预览'); w.showInactive(); });
      await page.locator('#vg-courier-replay').click();
      await capture('preview-opened');
      const opened = { ok: true, pid: app.process().pid, executablePath, nativeDesktop: true, isolatedReview: true, externalModelRequests: 0, routeId: done.id, tries: done.tries.map(t => ({ provider: t.provider, status: t.status })), screenshot: path.join(output, 'preview-opened.png') };
      fs.writeFileSync(path.join(output, 'opened.json'), JSON.stringify(opened, null, 2)); console.log(JSON.stringify(opened, null, 2));
      await app.waitForEvent('close', { timeout: 0 });
    }
  } catch (error) { report.error = error.message; console.error(error); if (page) await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {}); process.exitCode = 1; }
  finally { releaseStream?.(); if (app) await app.close().catch(() => {}); for (const s of servers) { s.closeAllConnections(); await new Promise(r => s.close(r)); } fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
