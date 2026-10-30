'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');

const entry = pathToFileURL(path.resolve(__dirname, '../src/lib/harness-plugin/index.mjs')).href;
const load = () => import(entry);

function fixture(t, services = {}) {
  const home = fs.mkdtempSync(path.join(fs.realpathSync.native(os.tmpdir()), 'cc-native-plugin-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hooks = new Map();
  const ctx = {
    get: key => services[key],
    on: (event, listener) => { hooks.set(event, listener); },
    effect: callback => callback(),
    inject: (keys, callback) => { if (keys.every(key => services[key])) callback(ctx); },
  };
  function skill(name) {
    fs.mkdirSync(path.join(home, 'skills', name), { recursive: true });
    fs.writeFileSync(path.join(home, 'skills', name, 'SKILL.md'), `---\nname: ${name}\ndescription: synthetic test skill\n---\nTest fixture.\n`);
  }
  return { home, ctx, hooks, services, skill };
}

test('native status distinguishes installed skills, registered tools and successful tool execution', async t => {
  const { createPluginRuntime } = await load();
  const f = fixture(t, { tools: { schemas: () => [{ name: 'mcp__coldcoffee-rea__inspect' }] } });
  f.skill('cc-rs-pentest-tools');
  f.skill('cc-rs-reverse-engineering');
  const runtime = createPluginRuntime(f.ctx, { dshHome: f.home });
  const first = runtime.status();
  assert.equal(first.skills.total, 2);
  assert.equal(first.skills.catalogVerified, false);
  assert.equal(first.rea.registered, true);
  assert.equal(first.rea.connected, false);
  assert.equal(first.rea.ready, false);
  runtime.observeTool({ name: 'mcp__coldcoffee-rea__inspect' }, { isError: true });
  assert.equal(runtime.status().rea.connected, false);
  runtime.observeTool({ name: 'mcp__other__inspect' }, { isError: false });
  assert.equal(runtime.status().rea.connected, false);
  runtime.observeTool({ name: 'mcp__coldcoffee-rea__inspect' }, { isError: false });
  assert.equal(runtime.status().rea.connected, true);
  assert.equal(first.community.chat, 'https://t.me/coolcoffeeai');
  assert.doesNotMatch(JSON.stringify(first), new RegExp(f.home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('the exact activation word gates real SessionController create and prompt calls', async t => {
  const { createPluginRuntime } = await load();
  const calls = [];
  const f = fixture(t, { sessionController: {
    create: async request => { calls.push(['create', request]); return { sessionId: 'fixture-session' }; },
    prompt: async (request, signal) => { assert.equal(signal.aborted, false); calls.push(['prompt', request]); return { accepted: true }; },
    cancel: request => { calls.push(['cancel', request]); return { accepted: true }; },
  } });
  f.skill('cc-rs-pentest-tools');
  const runtime = createPluginRuntime(f.ctx, { dshHome: f.home });
  const task = { workflow: 'web', input: 'Inspect the synthetic fixture response headers.' };
  assert.equal((await runtime.api('POST', '/api/tasks', task)).status, 409);
  assert.equal((await runtime.api('POST', '/api/activate', { keyword: 'wrong' })).status, 400);
  assert.equal(calls.length, 0);
  const activation = await runtime.api('POST', '/api/activate', { keyword: '冷咖啡' });
  assert.equal(activation.body.activated, true);
  assert.match(activation.body.text, /QQ三群 618179023/);
  assert.match(activation.body.text, /https:\/\/t\.me\/coolcoffeeai/);
  const dispatched = await runtime.api('POST', '/api/tasks', task);
  assert.equal(dispatched.status, 202);
  assert.equal(dispatched.body.task.status, 'accepted');
  assert.deepEqual(calls[0], ['create', {}]);
  assert.equal(calls[1][1].sessionId, 'fixture-session');
  assert.equal(calls[1][1].mode, 'queue');
  assert.match(calls[1][1].requestId, /^[0-9a-f-]{36}$/);
  assert.match(calls[1][1].content[0].text, /^\/cc-rs-pentest-tools\n/);
  assert.match(calls[1][1].content[0].text, /synthetic fixture/);
  runtime.observeSession({ id: 'unrelated-session' }, { type: 'turn/end', data: { reason: { kind: 'error' } } });
  assert.equal(runtime.status().tasks[0].status, 'accepted');
  runtime.observeSession({ id: 'fixture-session' }, { type: 'turn/start', data: {} });
  assert.equal(runtime.status().tasks[0].status, 'running');
  runtime.observeSession({ id: 'fixture-session' }, { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'Actual event result.' }] } } });
  runtime.observeSession({ id: 'fixture-session' }, { type: 'turn/end', data: { reason: { kind: 'completed' } } });
  assert.equal(runtime.status().tasks[0].output, 'Actual event result.');
  assert.equal(runtime.status().tasks[0].status, 'completed');
  assert.equal((await runtime.api('POST', '/api/tasks/cancel', { taskId: dispatched.body.task.id })).status, 200);
  assert.deepEqual(calls.at(-1), ['cancel', { sessionId: 'fixture-session' }]);
});

test('missing tools or rejected prompt receipts never produce fake task success', async t => {
  const { createPluginRuntime } = await load();
  const f = fixture(t);
  f.skill('cc-rs-pentest-tools');
  const runtime = createPluginRuntime(f.ctx, { dshHome: f.home });
  await runtime.api('POST', '/api/activate', { keyword: '冷咖啡' });
  assert.equal((await runtime.api('POST', '/api/tasks', { workflow: 'web', input: 'Synthetic task' })).status, 503);
  f.services.sessionController = { create: async () => ({ sessionId: 'rejected-session' }), prompt: async () => ({ accepted: false }) };
  const rejected = await runtime.api('POST', '/api/tasks', { workflow: 'web', input: 'Synthetic task' });
  assert.equal(rejected.status, 502);
  assert.equal(rejected.body.task.status, 'error');
  const missing = await runtime.api('POST', '/api/tasks', { workflow: 'reverse', input: 'Synthetic task' });
  assert.equal(missing.status, 409);
  assert.equal(missing.body.code, 'SKILL_MISSING');
});

test('HTTP routes require the page capability and exact local origin, including Desktop null-origin handling', async t => {
  const { createPluginRuntime } = await load();
  const f = fixture(t);
  let runtime;
  const server = http.createServer((req, res) => runtime.handler(req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections?.(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  f.services.webServer = { getOrigin: () => origin, register: () => () => {} };
  runtime = createPluginRuntime(f.ctx, { dshHome: f.home });
  runtime.mount(f.ctx);
  const rows = [];
  runtime.injections(rows);
  const boot = rows.find(row => row.name === 'COLDCOFFEE_HARNESS').value;
  assert.equal(boot.preview, false);
  assert.equal(boot.apiBase, `${origin}/coldcoffee`);
  assert.equal(boot.initialStatus.harness.connected, true);
  const noToken = await fetch(`${boot.apiBase}/api/status`);
  assert.equal(noToken.status, 403);
  const headers = { 'X-ColdCoffee-Session': boot.token };
  const good = await fetch(`${boot.apiBase}/api/status`, { headers });
  assert.equal(good.status, 200);
  assert.equal((await good.json()).activated, false);
  const external = await fetch(`${boot.apiBase}/api/status`, { headers: { ...headers, Origin: 'https://example.invalid' } });
  assert.equal(external.status, 403);
  const desktop = await fetch(`${boot.apiBase}/api/status`, { headers: { ...headers, Origin: 'null' } });
  assert.equal(desktop.status, 200);
  assert.equal(desktop.headers.get('access-control-allow-origin'), 'null');
  const malformed = await fetch(`${boot.apiBase}/api/activate`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  assert.equal(runtime.status().activated, false);
  const oversized = await fetch(`${boot.apiBase}/api/tasks`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ input: 'x'.repeat(50000) }) });
  assert.equal(oversized.status, 413);
});

test('loading in a headless profile stays optional and does not create a second listener', async t => {
  const { apply } = await load();
  const f = fixture(t);
  assert.doesNotThrow(() => apply(f.ctx, { dshHome: f.home }));
  assert.equal(f.hooks.has('webserver/index-inject'), false);
  assert.equal(f.hooks.has('tools/result'), true);
  assert.equal(f.hooks.has('session/event'), true);
});
