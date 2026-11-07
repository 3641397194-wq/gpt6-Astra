'use strict';
// Full shipped Magpie binary + original controller + fixture upstream. No real
// credentials, real client directories or paid model requests are used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { once } = require('node:events');
const { VisualGateway } = require('../src/lib/visual-gateway/controller');
const { KeyVault } = require('../src/lib/visual-gateway/vault');
const { baseUrl } = require('../src/lib/visual-gateway/bridge');

(async () => {
  const root = path.resolve('work/gateway-integration', crypto.randomUUID()); fs.mkdirSync(root, { recursive: true });
  const home = path.join(root, 'customer'); fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  const original = '# customer comment\nmodel = "customer-original"\n\n[mcp_servers.example]\ncommand = "customer-tool"\n';
  const config = path.join(home, '.codex/config.toml'); fs.writeFileSync(config, original);
  const report = { checks: [], externalRequests: 0, ok: false }; const events = []; let requests = 0;
  const key = 'fixture-key-' + crypto.randomUUID();
  const upstream = http.createServer(async (req, res) => {
    assert.equal(req.headers.authorization, `Bearer ${key}`); requests++;
    res.setHeader('content-type', 'application/json');
    if (req.url === '/v1/models') return res.end(JSON.stringify({ data: [{ id: 'gpt-fixture', context_length: 32768 }] }));
    let text = ''; for await (const chunk of req) text += chunk;
    const body = JSON.parse(text); assert.equal(body.model, 'gpt-fixture');
    if (body.stream) {
      res.setHeader('content-type', 'text/event-stream');
      const contentParts = body.messages?.at(-1)?.content === 'echo-key-fixture'
        ? (`prefix ${key} gap ${key} suffix`).match(/.{1,7}/gs)
        : ['fixture ', 'stream ', 'passed'];
      for (const content of contentParts) res.write(`data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', model: body.model, choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`);
      res.end(`data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 120, completion_tokens: 7, total_tokens: 127 } })}\n\ndata: [DONE]\n\n`);
    } else res.end(JSON.stringify({ id: 'fixture', object: 'chat.completion', model: body.model, choices: [{ index: 0, message: { role: 'assistant', content: 'fixture conversion passed' }, finish_reason: 'stop' }], usage: { prompt_tokens: 120, completion_tokens: 7, total_tokens: 127 } }));
  });
  upstream.listen(0, '127.0.0.1'); await once(upstream, 'listening');
  const g = new VisualGateway({ directory: path.join(root, 'gateway'), resources: process.env.COLDCOFFEE_GATEWAY_RESOURCES || path.resolve('resources/magpie'), home, env: {}, port: 0, emit: e => events.push(e) });
  try {
    await g.start(); assert.equal(g.status().engine.running, true);
    report.checks.push('pinned shipped binary starts isolated, without account discovery');
    const providerCatalog = await g.engine.api('providers');
    assert.ok(Array.isArray(providerCatalog.presets));
    assert.equal(providerCatalog.presets.filter(preset => preset.sponsored).length, 0);
    assert.equal(fs.existsSync(path.join(g.directory, 'cache/magpie/partners.json')), false);
    const licenses = await g.execute('licenses');
    for (const name of ['Copyright (c) 2026 yetone', 'Copyright (c) 2026 morluto', 'Copyright (c) 2026 zhaoxuya520', 'GNU GENERAL PUBLIC LICENSE']) assert.ok(licenses.notices.includes(name), name);
    report.checks.push('engine returns no sponsored provider entries; complete copyright and GPL texts remain readable through About');
    const demo = await g.execute('demo'); assert.equal(demo.demo, true); assert.match(demo.text, /本机/);
    const snapshot = await g.snapshot(); const demoRoute = snapshot.routes.find(r => r.demo);
    assert.equal(demoRoute.status, 200); assert.ok(demoRoute.prompt.parts.length >= 3);
    const kind = demoRoute.prompt.parts[0].kind;
    const detail = await g.text({ id: demoRoute.id, kind, item: 0 }); assert.ok(detail.items.length);
    report.checks.push('actual streaming route + upstream prompt decomposition + context detail');
    const result = await g.configure({ id: 'coldcoffee', baseUrl: `http://127.0.0.1:${upstream.address().port}/v1`, key, wireApi: 'chat', remember: false });
    assert.deepEqual(result.models, ['coldcoffee/gpt-fixture']);
    assert.ok(!JSON.stringify(g.status()).includes(key));
    assert.ok(!fs.readFileSync(g.configFile, 'utf8').includes(key));
    assert.ok(!fs.readFileSync(path.join(g.directory, 'config/magpie/providers.json'), 'utf8').includes(key));
    const stream = await g.send({ model: 'coldcoffee/gpt-fixture', text: 'test' }); assert.equal(stream.text, 'fixture stream passed');
    assert.ok(events.some(e => e.type === 'chunk'));
    report.checks.push('API key stays outside native provider file, IPC status and metadata; real fixture streaming');
    const eventStart = events.length;
    const redacted = await g.send({ model: 'coldcoffee/gpt-fixture', text: 'echo-key-fixture' });
    assert.equal(redacted.text, 'prefix [API Key 已隐藏] gap [API Key 已隐藏] suffix');
    assert.equal(events.slice(eventStart).filter(e => e.type === 'chunk').map(e => e.text).join(''), redacted.text);
    await assert.rejects(g.configure({ id: 'unsafe-path', baseUrl: `https://api.example/${encodeURIComponent(key)}/v1`, key }), /密钥栏/);
    report.checks.push('split and repeated streamed credentials remain redacted; keys in API address paths are rejected');
    const response = await fetch(`${g.engine.url}/v1/responses`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer coldcoffee-local' }, body: JSON.stringify({ model: 'coldcoffee/gpt-fixture', input: 'fixture conversion test', stream: false }) });
    const converted = await response.json(); assert.equal(response.status, 200, JSON.stringify(converted)); assert.ok(converted.output?.length, JSON.stringify(converted)); assert.match(JSON.stringify(converted), /fixture (conversion|stream) passed/);
    report.checks.push('native Responses-to-Chat protocol conversion');
    const plan = await g.clients.plan('codex', 'coldcoffee/gpt-fixture');
    assert.equal(fs.readFileSync(config, 'utf8'), original, 'preview must not write real target');
    assert.ok(plan.files.some(f => f.name === 'config.toml'));
    g.clients.deploy(plan.id);
    const installed = fs.readFileSync(config, 'utf8'); assert.match(installed, /coldcoffee\/gpt-fixture/); assert.match(installed, /customer comment/); assert.match(installed, /customer-tool/); assert.ok(!installed.includes(key));
    g.clients.restore('codex'); assert.equal(fs.readFileSync(config, 'utf8'), original);
    report.checks.push('real upstream Codex adapter, preview, backup, atomic deployment and byte-identical restore');
    for (const id of ['claude', 'deepseek']) {
      const client = g.clients.client(id);
      const relative = id === 'claude' ? 'settings.json' : 'profiles/web/cordis.patch.yml';
      const file = path.join(client.root, relative); fs.mkdirSync(path.dirname(file), { recursive: true });
      const before = id === 'claude' ? '{\n  "env": {"CUSTOMER_ENV":"keep"},\n  "permissions":{"allow":["Read"]}\n}\n' : '# customer profile comment\n[]\n';
      fs.writeFileSync(file, before);
      const plan = await g.clients.plan(id, 'coldcoffee/gpt-fixture');
      assert.equal(fs.readFileSync(file, 'utf8'), before);
      assert.ok(plan.files.length, id + ' native configuration should be generated');
      g.clients.deploy(plan.id);
      assert.ok(!plan.files.some(f => fs.readFileSync(path.join(client.root, f.name), 'utf8').includes(key)));
      g.clients.restore(id); assert.equal(fs.readFileSync(file, 'utf8'), before);
      report.checks.push(`real upstream ${id} adapter, configuration preview, deployment and original restore`);
    }
    const conflict = await g.clients.plan('codex', 'coldcoffee/gpt-fixture'); fs.appendFileSync(config, '\n# concurrent customer change');
    assert.throws(() => g.clients.deploy(conflict.id), /更新了配置/); assert.match(fs.readFileSync(config, 'utf8'), /concurrent/);
    report.checks.push('concurrent client changes block stale deployment');
    assert.throws(() => baseUrl('http://external.example/v1')); assert.throws(() => baseUrl('https://api.example/v1?key=fixture')); assert.throws(() => new KeyVault(root).file('../outside'));
    const unauthorized = await fetch(`${g.bridge.url}/coldcoffee/v1/models`); assert.equal(unauthorized.status, 401);
    report.checks.push('URL credential rejection, path validation and credential-bridge authentication');
    report.requests = requests; report.ok = true;
    console.log(JSON.stringify(report, null, 2));
  } catch (error) { console.error(error); console.error(g.engine.logs.join('')); process.exitCode = 1; }
  finally { await g.stop(); upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)); fs.writeFileSync(path.join(root, 'report.json'), JSON.stringify(report, null, 2)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
