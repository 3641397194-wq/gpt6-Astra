'use strict';

// Exercise renderer -> desktop bridge -> real HTTP transport against an isolated
// loopback fixture. No customer account or paid request is used by this test.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { RelayAdapter } = require('../../desktop/src/lib/relay-adapter');

(async () => {
  const calls = [];
  let remaining = null;
  let failed = false;
  const fixture = http.createServer(async (req, res) => {
    let text = '';
    for await (const part of req) text += part;
    const body = text ? JSON.parse(text) : null;
    calls.push({ method: req.method, path: req.url, body });
    res.setHeader('Content-Type', 'application/json');
    if (req.headers.authorization !== 'Bearer FIXTURE_VALID_KEY') {
      res.statusCode = 401;
      res.end(JSON.stringify({ message: `Invalid API key: ${req.headers.authorization}` }));
    } else if (req.url === '/v1/models') {
      res.end(JSON.stringify({ object: 'list', data: [{ id: 'gpt-5.6-sol' }, { id: 'Exact-Versioned-Model-2026' }] }));
    } else if (req.url === '/v1/usage') {
      res.end(JSON.stringify({ quota: { remaining, unit: 'USD' }, is_active: true }));
    } else if (req.url === '/v1/responses' && req.method === 'POST') {
      res.end(JSON.stringify({ id: 'resp_fixture', status: failed ? 'incomplete' : 'completed', incomplete_details: failed ? { reason: 'max_output_tokens' } : null, output: [{ type: 'message', content: [{ type: 'output_text', text: '真实传输夹具：<img src=x onerror=alert(1)>\n任务完成' }] }] }));
    } else { res.statusCode = 404; res.end('{}'); }
  });
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${fixture.address().port}/v1`;
  const adapter = new RelayAdapter();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.exposeBinding('relayBridgeFixture', async (_, action, payload) => {
      if (action === 'configure') {
        assert.equal(payload.baseUrl, base, 'Fixture is the only allowed API destination');
        return adapter.reconfigure(payload);
      }
      const methods = { test: 'testConnection', status: 'status', catalog: 'catalog', usage: 'usage', preflight: 'preflight', submit: 'submit' };
      assert.ok(methods[action]);
      return adapter[methods[action]](payload);
    });
    await page.addInitScript(() => {
      window.coldbrew = { relay: (action, payload) => window.relayBridgeFixture(action, payload) };
      window.fixtureClipboard = '';
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.fixtureClipboard = text; } } });
    });
    await page.goto('http://127.0.0.1:8772/workbench/#relay');
    await page.waitForFunction(() => document.getElementById('page-relay').classList.contains('active'));
    const exportFixtureKey='FIXTURE_ONLY_EXPORT_GUARD_42';
    await page.locator('#relay-api-key').fill(exportFixtureKey);
    for(const unsafeBase of [
      `https://${exportFixtureKey}@relay.example.test/v1`,
      `https://relay.example.test/v1?key=${exportFixtureKey}`,
      `https://relay.example.test/v1#${exportFixtureKey}`,
      `https://relay.example.test/${exportFixtureKey}/v1`,
      `https://relay.example.test/%46${exportFixtureKey.slice(1)}/v1`,
      'http://relay.example.test/v1', 'http://127.1/v1', 'http://localhost.example.test/v1'
    ]) {
      await page.locator('#relay-api-base').fill(unsafeBase);
      await page.evaluate(()=>{window.fixtureClipboard='PREVIOUS_CLIPBOARD_FIXTURE';});
      await page.locator('#relay-test').click();
      assert.equal(await page.locator('#relay-connection-state').getAttribute('data-state'),'error');
      assert.equal((await page.locator('#relay-connection-detail').textContent()).includes(exportFixtureKey),false);
      for(const id of ['relay-copy-base','relay-copy-config']) {
        await page.locator(`#${id}`).click();
        assert.equal(await page.evaluate(()=>window.fixtureClipboard),'PREVIOUS_CLIPBOARD_FIXTURE','Rejected URL must leave clipboard unchanged');
        const notice=await page.locator('#toast').textContent();
        assert.match(notice,/API 地址/);
        assert.equal(notice.includes(exportFixtureKey),false);
      }
    }
    assert.equal(calls.length,0,'Rejected URL must never reach HTTP transport');
    assert.deepEqual(errors,[],'Rejected copy operations must not throw page errors');
    await page.locator('#relay-api-base').fill(base);
    await page.locator('#relay-api-key').fill('FIXTURE_BAD_KEY');
    await page.locator('#relay-test').click();
    await page.waitForFunction(() => document.getElementById('relay-connection-state').dataset.state === 'error');
    const errorText = await page.locator('#relay-connection-detail').textContent();
    assert.match(errorText, /401/);
    assert.ok(!errorText.includes('FIXTURE_BAD_KEY'));
    await page.locator('#relay-api-key').fill('FIXTURE_VALID_KEY');
    await page.locator('#relay-test').click();
    await page.waitForFunction(() => !document.getElementById('relay-test').disabled && document.getElementById('relay-connection-state').dataset.state === 'ready');
    assert.equal(await page.locator('#relay-provider option').count(), 2);
    assert.equal(await page.locator('#relay-usage-state').textContent(), '服务器未返回余额');
    assert.match(await page.locator('#relay-catalog-state').textContent(), /产品说明/);
    assert.equal(calls.some(call => call.method === 'POST'), false, 'Connection tests must never generate a task');
    await page.locator('#relay-provider').selectOption('Exact-Versioned-Model-2026');
    await page.locator('#relay-copy-base').click();
    assert.equal(await page.evaluate(()=>window.fixtureClipboard),base);
    await page.locator('#relay-copy-config').click();
    const config = await page.evaluate(() => window.fixtureClipboard);
    assert.ok(!config.includes('FIXTURE_VALID_KEY'));
    assert.ok(!config.includes('$env:'));
    const parsed = JSON.parse(execFileSync('python', ['-c', 'import sys,tomllib,json; print(json.dumps(tomllib.loads(sys.stdin.read())))'], { input: config, encoding: 'utf8' }));
    assert.equal(parsed.model, 'Exact-Versioned-Model-2026');
    assert.equal(parsed.model_providers.coldcoffee.base_url, base);
    assert.equal(parsed.model_providers.coldcoffee.requires_openai_auth, false);
    await page.locator('#relay-copy-env').click();
    assert.match(await page.evaluate(() => window.fixtureClipboard), /SetEnvironmentVariable/);
    await page.locator('[data-page=work]').click();
    await page.locator('#goal').fill('写一条简短说明');
    await page.locator('#format').selectOption('json');
    await page.locator('#compose-form [type=submit]').click();
    assert.equal(calls.some(call => call.method === 'POST'), false, 'Local compose must never generate a paid request');
    await page.locator('#relay-submit-task').click();
    await page.waitForFunction(() => document.getElementById('relay-task-status').textContent.includes('resp_fixture'));
    const sent = calls.filter(call => call.path === '/v1/responses');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].body.model, 'Exact-Versioned-Model-2026');
    assert.equal(sent[0].body.reasoning, undefined);
    assert.match(sent[0].body.input, /有效 JSON/);
    assert.equal(await page.locator('#output img').count(), 0);
    assert.match(await page.locator('#revision').textContent(), /中转/);
    failed = true;
    await page.locator('#relay-submit-task').click();
    await page.waitForFunction(() => document.getElementById('relay-task-status').textContent.includes('incomplete'));
    assert.match(await page.locator('#output').textContent(), /任务完成/, 'Last successful response is preserved');
    await page.locator('[data-page=relay]').click();
    remaining = 0.25;
    await page.locator('#relay-refresh').click();
    await page.waitForFunction(() => document.getElementById('relay-usage-state').textContent === '0.25 USD');
    await page.waitForFunction(() => !document.getElementById('relay-test').disabled);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator('#relay-api-key').fill('REPLACED_KEY');
    assert.equal(await page.locator('#relay-submit-task').isDisabled(), true, 'Editing Key invalidates the old successful test');
    assert.deepEqual(errors, []);
    console.log('PASS: renderer -> bridge -> HTTP models/usage/responses; secret-free TOML; credential URL clipboard guard; exact model ID; no unintended submit; errors; mobile layout');
  } finally {
    await browser.close();
    await new Promise(resolve => fixture.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
