'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { VisualGateway } = require('../src/lib/visual-gateway/controller');
const { KeyVault } = require('../src/lib/visual-gateway/vault');
const { readConfig } = require('../src/lib/visual-gateway/config-store');

function fixture(t, options = {}) {
  const temp = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(temp, 'cc-gateway-reliability-'));
  t.after(() => { assert.equal(path.dirname(root), temp); fs.rmSync(root, { recursive: true, force: true }); });
  const create = () => new VisualGateway({ directory: root, resources: path.join(root, 'resources'),
    home: path.join(root, 'customer'), env: {}, port: 0, ...options });
  return { root, create };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
const models = () => new Response(JSON.stringify({ data: [{ id: 'fixture-model' }] }), { headers: { 'content-type': 'application/json' } });
const input = { id: 'fixture', name: 'Fixture relay', key: 'fixture-session-key', baseUrl: 'https://relay.example.invalid/v1', remember: false };
function stubEngine(gateway) {
  gateway.engine.status = () => ({ running: true });
  gateway.engine.api = async () => ({});
}

for (const source of ['{"providers":', JSON.stringify({ providers: null }), JSON.stringify({ providers: [null] }),
  JSON.stringify({ providers: [{ id: 'fixture', name: 'Fixture', baseUrl: 'https://relay.example.invalid/v1', models: 'bad' }] })]) {
  test('invalid relay configuration is preserved and status remains usable: ' + source, t => {
    const f = fixture(t);
    const file = path.join(f.root, 'relays.json'); fs.writeFileSync(file, source);
    const gateway = f.create();
    assert.deepEqual(gateway.status().providers, []);
    assert.equal(gateway.status().warnings.length, 1);
    assert.ok(!JSON.stringify(gateway.status()).includes(f.root));
    const backup = fs.readdirSync(f.root).find(name => name.startsWith('relays.json.bak-corrupt-'));
    assert.ok(backup); assert.equal(fs.readFileSync(path.join(f.root, backup), 'utf8'), source);
    gateway.persist();
    assert.deepEqual(f.create().status().providers, []);
    assert.equal(fs.readFileSync(path.join(f.root, backup), 'utf8'), source);
  });
}

test('valid relay settings including UTF-8 BOM are loaded without rewriting', t => {
  const f = fixture(t); const file = path.join(f.root, 'relays.json');
  const provider = { id: 'fixture', name: 'Fixture', baseUrl: 'https://relay.example.invalid/v1', models: ['fixture-model'], wireApi: 'chat', remembered: false };
  const original = '\uFEFF' + JSON.stringify({ version: 1, providers: [provider] });
  fs.writeFileSync(file, original);
  const gateway = f.create();
  assert.equal(gateway.status().providers[0].id, 'fixture');
  assert.deepEqual(gateway.status().warnings, []);
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  assert.deepEqual(fs.readdirSync(f.root), ['relays.json']);
});

test('malformed engine settings are backed up while filesystem errors remain errors', t => {
  const f = fixture(t); const file = path.join(f.root, 'settings.json');
  fs.writeFileSync(file, '[invalid');
  assert.deepEqual(readConfig(file, {}), { value: {}, recovered: true });
  const backup = fs.readdirSync(f.root).find(name => name.startsWith('settings.json.bak-corrupt-'));
  assert.equal(fs.readFileSync(path.join(f.root, backup), 'utf8'), '[invalid');
  fs.mkdirSync(file);
  assert.throws(() => readConfig(file, {}));
  assert.ok(fs.statSync(file).isDirectory());
});

test('verification reserves the operation before network await and blocks competing sends/configures', async t => {
  const pending = deferred(); let calls = 0;
  const f = fixture(t, { fetchImpl: async () => { calls++; await pending.promise; return models(); } });
  const gateway = f.create(); stubEngine(gateway);
  const first = gateway.configure(input);
  assert.equal(gateway.status().configuring, true);
  await assert.rejects(gateway.configure({ ...input, key: 'other-fixture-key' }), /正在验证/);
  await assert.rejects(gateway.send({ demo: true }), /正在更新/);
  assert.equal(calls, 1); assert.equal(gateway.providers.length, 0);
  pending.resolve();
  const result = await first;
  assert.equal(result.ok, true); assert.equal(result.configuring, false);
  assert.equal(gateway.providers.length, 1); assert.equal(gateway.vault.get('fixture'), input.key);
  assert.ok(!fs.readFileSync(gateway.configFile, 'utf8').includes(input.key));
  assert.equal((await gateway.configure(input)).ok, true);
});

test('failed model verification releases its operation and a retry succeeds', async t => {
  let calls = 0;
  const f = fixture(t, { fetchImpl: async () => ++calls === 1 ? new Response('null') : models() });
  const gateway = f.create(); stubEngine(gateway);
  await assert.rejects(gateway.configure(input), /可用模型/);
  assert.equal(gateway.status().configuring, false); assert.equal(gateway.providers.length, 0);
  assert.equal((await gateway.configure(input)).ok, true);
});

test('empty model ids are discarded before persistence so valid models survive restart', async t => {
  const f = fixture(t, { fetchImpl: async () => new Response(JSON.stringify({ data: ['', { id: '' }, { id: 'fixture-model' }] })) });
  const gateway = f.create(); stubEngine(gateway);
  const result = await gateway.configure(input);
  assert.deepEqual(result.models, ['fixture/fixture-model']);
  const restarted = f.create();
  assert.deepEqual(restarted.status().providers[0].models, ['fixture-model']);
  assert.deepEqual(restarted.status().warnings, []);
  assert.ok(!fs.readdirSync(f.root).some(name => name.includes('.bak-corrupt-')));
});

test('an all-empty model list is rejected without changing the saved configuration or key', async t => {
  let empty = false;
  const f = fixture(t, { fetchImpl: async () => empty ? new Response(JSON.stringify({ data: ['', { id: '' }] })) : models() });
  const gateway = f.create(); stubEngine(gateway);
  await gateway.configure(input);
  const saved = fs.readFileSync(gateway.configFile);
  empty = true;
  await assert.rejects(gateway.configure({ ...input, key: 'synthetic-replacement-key' }), /可用模型/);
  assert.equal(gateway.status().configuring, false);
  assert.equal(gateway.vault.get(input.id), input.key);
  assert.deepEqual(fs.readFileSync(gateway.configFile), saved);
});

for (const existing of [true, false]) {
  test(`persist failure restores both the native engine and local state (${existing ? 'existing' : 'new'} provider)`, async t => {
    let model = 'original-model';
    const f = fixture(t, { fetchImpl: async () => new Response(JSON.stringify({ data: [{ id: model }] })) });
    const gateway = f.create(); stubEngine(gateway);
    const native = new Map();
    gateway.engine.api = async (action, body) => {
      if (action === 'provider/save') native.set(body.id, structuredClone(body));
      else if (action === 'provider/delete') native.delete(body.id);
      else throw new Error('Unexpected native operation: ' + action);
      return {};
    };
    if (existing) await gateway.configure(input);
    const previous = existing ? fs.readFileSync(gateway.configFile) : null;
    const originalError = new Error('synthetic failure includes private-path and replacement-fixture-key');
    gateway.persist = () => { throw originalError; };
    gateway.catalog = { availableModels: [{ id: 'stale-catalog-model' }] }; gateway.catalogTime = Date.now();
    model = 'replacement-model';
    await assert.rejects(gateway.configure({ ...input, key: 'replacement-fixture-key' }), error => {
      assert.match(error.message, /已恢复原配置/); assert.equal(error.cause, originalError);
      assert.ok(!error.message.includes('private-path')); assert.ok(!error.message.includes('replacement-fixture-key'));
      return true;
    });
    assert.equal(gateway.status().configuring, false); assert.equal(gateway.status().busy, false);
    assert.equal(gateway.catalog, null); assert.equal(gateway.catalogTime, 0);
    if (existing) {
      assert.deepEqual(native.get(input.id).models, ['original-model']);
      assert.deepEqual(gateway.providers[0].models, ['original-model']);
      assert.equal(gateway.vault.get(input.id), input.key);
      assert.deepEqual(fs.readFileSync(gateway.configFile), previous);
    } else {
      assert.equal(native.has(input.id), false); assert.deepEqual(gateway.providers, []);
      assert.equal(gateway.vault.has(input.id), false); assert.equal(fs.existsSync(gateway.configFile), false);
    }
    gateway.persist = VisualGateway.prototype.persist;
    assert.equal((await gateway.configure({ ...input, key: 'replacement-fixture-key' })).ok, true);
  });
}

test('rollback failure stops both engine and bridge, keeps diagnostics private, and releases the operation', async t => {
  const gateway = fixture(t, { fetchImpl: async () => models() }).create(); stubEngine(gateway);
  let engineStopped = false, bridgeStopped = false;
  const originalError = new Error('fixture write error: private-path replacement-fixture-key');
  const rollbackError = new Error('fixture native restore error: private-path');
  gateway.persist = () => { throw originalError; };
  gateway.engine.api = async action => { if (action === 'provider/delete') throw rollbackError; return {}; };
  gateway.engine.stop = async () => { engineStopped = true; gateway.engine.status = () => ({ running: false }); };
  gateway.bridge.stop = async () => { bridgeStopped = true; };
  await assert.rejects(gateway.execute('configure', { ...input, key: 'replacement-fixture-key' }), error => {
    assert.match(error.message, /网关接入已停用/);
    assert.ok(!error.message.includes('private-path')); assert.ok(!error.message.includes('replacement-fixture-key'));
    assert.deepEqual(error.cause.cause.errors, [originalError, rollbackError]);
    return true;
  });
  assert.equal(engineStopped, true); assert.equal(bridgeStopped, true);
  assert.equal(gateway.status().engine.running, false);
  assert.equal(gateway.status().configuring, false); assert.equal(gateway.status().busy, false);
  assert.ok(!JSON.stringify(gateway.status()).includes('private-path'));
  assert.equal(gateway.vault.has(input.id), false);
});

test('failed rollback blocks ordinary starts and sends until the same provider is reverified and committed', async t => {
  let verifyOk = true, running = true, starts = 0, failDelete = true;
  const gateway = fixture(t, { fetchImpl: async () => verifyOk ? models() : new Response('{}', { status: 401 }) }).create();
  gateway.engine.status = () => ({ running });
  gateway.engine.start = async () => { starts++; running = true; };
  gateway.bridge.start = async () => {};
  gateway.engine.stop = async () => { running = false; };
  gateway.bridge.stop = async () => {};
  gateway.engine.api = async action => { if (action === 'provider/delete' && failDelete) throw new Error('fixture rollback failure'); return {}; };
  const persist = gateway.persist;
  gateway.persist = () => { throw new Error('fixture disk failure'); };
  await assert.rejects(gateway.configure(input), /网关接入已停用/);
  for (const retry of [() => gateway.start(), () => gateway.execute('start'), () => gateway.send({ demo: true })]) {
    await assert.rejects(retry(), /网关接入已停用/);
  }
  await assert.rejects(gateway.configure({ ...input, id: 'another' }), /网关接入已停用/);
  assert.equal(starts, 0); assert.equal(running, false);
  verifyOk = false;
  await assert.rejects(gateway.configure(input), /HTTP 401/);
  await assert.rejects(gateway.start(), /网关接入已停用/);
  assert.equal(starts, 0);
  verifyOk = true; failDelete = false;
  await assert.rejects(gateway.configure(input), /网关接入已停用/);
  assert.equal(starts, 1); assert.equal(running, false);
  await assert.rejects(gateway.start(), /网关接入已停用/);
  gateway.persist = persist;
  const result = await gateway.configure(input);
  assert.equal(result.ok, true); assert.deepEqual(result.warnings, []);
  assert.equal(gateway.transactionFailureId, ''); assert.equal(starts, 2);
  assert.equal((await gateway.start()).engine.running, true);
  assert.equal(gateway.status().configuring, false); assert.equal(gateway.status().busy, false);
});

test('a process stop failure retains the recovery gate without claiming the process stopped', async t => {
  const gateway = fixture(t, { fetchImpl: async () => models() }).create(); stubEngine(gateway);
  gateway.persist = () => { throw new Error('fixture persist failed'); };
  gateway.engine.api = async action => { if (action === 'provider/delete') throw new Error('fixture rollback failed'); return {}; };
  gateway.engine.stop = async () => { throw new Error('fixture stop failed'); };
  gateway.bridge.stop = async () => {};
  await assert.rejects(gateway.configure(input), error => {
    assert.match(error.message, /网关接入已停用/); assert.ok(!error.message.includes('已停止'));
    assert.equal(error.cause.errors.length, 3); return true;
  });
  await assert.rejects(gateway.start(), /网关接入已停用/);
  assert.equal(gateway.status().configuring, false);
});

test('cold start failure leaves committed provider settings and keys untouched', async t => {
  const gateway = fixture(t, { fetchImpl: async () => models() }).create();
  gateway.start = async () => { throw new Error('fixture cold start failed'); };
  await assert.rejects(gateway.configure(input), /fixture cold start failed/);
  assert.deepEqual(gateway.providers, []); assert.equal(gateway.vault.has(input.id), false);
  assert.equal(fs.existsSync(gateway.configFile), false); assert.equal(gateway.status().configuring, false);
});

test('sending reserves busy during cold start; cancel prevents network delivery and releases busy', async t => {
  const pending = deferred(), events = [];
  const gateway = fixture(t, { emit: event => events.push(event) }).create();
  gateway.start = () => pending.promise; gateway.syncProvider = async () => {};
  // An invalid address is deliberate: any accidental fetch makes this test fail.
  gateway.engine.url = 'not-a-url';
  const sending = gateway.send({ demo: true });
  assert.equal(gateway.status().busy, true);
  await assert.rejects(gateway.send({ demo: true }), /仍在返回/);
  await assert.rejects(gateway.configure(input), /当前请求/);
  await gateway.execute('cancel'); pending.resolve();
  await assert.rejects(sending, /请求已停止/);
  assert.equal(gateway.status().busy, false); assert.equal(gateway.abort, null);
  assert.ok(!events.some(event => event.type === 'begin'));
  assert.equal(events.filter(event => event.type === 'error').length, 1);
});

test('startup error releases busy so the next request can be attempted', async t => {
  const gateway = fixture(t).create();
  gateway.start = async () => { throw new Error('fixture startup failed'); };
  for (let attempt = 0; attempt < 2; attempt++) {
    await assert.rejects(gateway.send({ demo: true }), /fixture startup failed/);
    assert.equal(gateway.status().busy, false); assert.equal(gateway.abort, null);
  }
});

test('native encryption or atomic write failure preserves both the old session key and ciphertext', t => {
  const f = fixture(t); let failEncryption = false;
  const storage = { isEncryptionAvailable: () => true,
    encryptString: text => { if (failEncryption) throw new Error('fixture encryption failed'); return Buffer.from('encrypted-fixture:' + text); },
    decryptString: data => data.toString().slice('encrypted-fixture:'.length) };
  const vault = new KeyVault(f.root, storage);
  vault.put('fixture', 'original-fixture-key', true);
  const original = fs.readFileSync(vault.file('fixture'));
  failEncryption = true;
  assert.throws(() => vault.put('fixture', 'replacement-fixture-key', true), /fixture encryption failed/);
  assert.equal(vault.get('fixture'), 'original-fixture-key');
  assert.deepEqual(fs.readFileSync(vault.file('fixture')), original);
  failEncryption = false;
  const rename = fs.renameSync;
  t.mock.method(fs, 'renameSync', (from, to) => { if (to === vault.file('fixture')) throw new Error('fixture rename failed'); return rename(from, to); });
  assert.throws(() => vault.put('fixture', 'replacement-fixture-key', true), /fixture rename failed/);
  assert.equal(vault.get('fixture'), 'original-fixture-key');
  assert.deepEqual(fs.readFileSync(vault.file('fixture')), original);
  assert.equal(fs.existsSync(vault.file('fixture') + '.tmp'), false);
});

test('temporarily unavailable native encryption leaves session-only use operational', t => {
  const vault = new KeyVault(fixture(t).root, { isEncryptionAvailable() { throw new Error('fixture native store unavailable'); } });
  assert.equal(vault.persistent(), false);
  vault.put('fixture', 'fixture-session-key', false);
  assert.equal(vault.get('fixture'), 'fixture-session-key');
  assert.throws(() => vault.put('fixture', 'replacement-fixture-key', true), /系统加密/);
  assert.equal(vault.get('fixture'), 'fixture-session-key');
});
