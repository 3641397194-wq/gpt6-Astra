'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { fixture } = require('./grok-memory-fixture.cjs');
const { loadSession, jwtExpiry, decryptCBC } = require('../src/lib/grok-memory/session');
const { GrokMemoryController } = require('../src/lib/grok-memory/controller');
const { GrokMemoryClient, createRpc, replyObject, checksum, transcriptRows } = require('../src/lib/grok-memory/protocol');
const { MemoryError, publicError } = require('../src/lib/grok-memory/errors');

test('opening/status/preset never reads a login; connect lists bots and never exposes session material', async () => {
  let reads = 0;
  const f = fixture();
  const loader = f.controller.loader;
  f.controller.loader = (...args) => { reads++; return loader(...args); };
  assert.equal((await f.controller.execute('status')).state.connected, false);
  const preset = await f.controller.execute('preset');
  assert.match(preset.text, /冷咖啡已激活/);
  for (const value of ['1057540028', '1077074552', '618179023', '1131239659', 't.me/coolcoffeeai', 't.me/chachachalkf']) assert.ok(preset.text.includes(value));
  assert.equal(reads, 0);
  const connected = await f.controller.execute('connect');
  assert.equal(reads, 1); assert.equal(connected.state.bots.length, 2);
  assert.equal(connected.state.connected, true);
  assert.ok(!JSON.stringify(connected).includes(f.session.token));
  assert.ok(!JSON.stringify(connected).includes(f.session.machine));
  assert.deepEqual(f.calls, ['ListGrokBotAgents']);
});

test('full workflow: permission fallback, preview-bound original write, independent readback, forget and exportable records', async () => {
  const f = fixture();
  const c = f.controller;
  await c.execute('connect');
  let response = await c.execute('pull');
  assert.equal(response.state.source, 'bot');
  assert.equal(response.state.items.length, 2);
  const text = '  保持所有空格\n冷咖啡偏好\n  ';
  response = await c.execute('prepare-write', { text, scope: 'agent', tier: 'profile' });
  const id = response.state.preview.id;
  assert.equal(f.sent.length, 1, 'preview must not send a write');
  assert.equal((await c.execute('commit', { planId: id })).error.code, 'INPUT');
  response = await c.execute('commit', { planId: id, confirm: true });
  assert.equal(response.ok, true);
  assert.equal(response.state.evidence.acknowledgement, true);
  assert.equal(response.state.evidence.readBack, 'not-checked');
  assert.equal(response.state.evidence.newSession, 'unverified');
  assert.equal(response.state.items.length, 2, 'acknowledgement must not insert a fake persisted row');
  assert.equal(response.state.stale, true);
  assert.ok(f.sent.at(-1).text.includes('\n<<<\n' + text + '\n>>>\n'));
  assert.equal((await c.execute('commit', { planId: id, confirm: true })).error.code, 'STALE');
  response = await c.execute('pull');
  assert.equal(response.state.evidence.readBack, 'found');
  const item = response.state.items.find(item => item.text === text);
  response = await c.execute('prepare-forget', { key: item.key });
  response = await c.execute('commit', { planId: response.state.preview.id, confirm: true });
  assert.equal(response.state.items.length, 3, 'no optimistic deletion');
  response = await c.execute('pull');
  assert.equal(response.state.evidence.readBack, 'absent');
  assert.equal(response.state.items.length, 2);
  await c.execute('select', { bot: 'fixture-bot-two' });
  assert.deepEqual(c.snapshot().items, []); assert.equal(c.snapshot().evidence, null);
  await c.execute('disconnect');
  assert.equal(c.session, null); assert.deepEqual(c.snapshot().bots, []);
});

test('failed/partial independent readback never claims new-session or persisted success', async () => {
  const f = fixture({ direct: true, ignoreMutation: true, more: true }), c = f.controller;
  await c.execute('connect');
  let result = await c.execute('prepare-write', { text: '新的偏好', scope: 'user', tier: 'log' });
  await c.execute('commit', { planId: result.state.preview.id, confirm: true });
  result = await c.execute('pull');
  assert.equal(result.state.evidence.readBack, 'partial');
  assert.equal(result.state.evidence.newSession, 'unverified');
});

test('direct list works; network/auth errors never masquerade as an empty memory list or conversation fallback', async () => {
  const f = fixture({ direct: true });
  assert.equal((await f.client.pull(f.session, 'fixture-bot-one')).source, 'direct');
  assert.deepEqual(f.calls, ['ListGrokBotUserBotMemories']);
  for (const code of ['NETWORK', 'AUTH', 'TIMEOUT', 'RATE_LIMIT']) {
    let calls = 0;
    const client = new GrokMemoryClient({ rpc: async () => { calls++; throw new MemoryError(code); } });
    await assert.rejects(client.pull(f.session, 'fixture-bot-one'), error => error.code === code);
    assert.equal(calls, 1);
  }
});

test('strict id and user nonce correlation reject old/unrelated replies, negative results and unsent messages', async () => {
  for (const [options, code] of [[{ wrongId: true }, 'TIMEOUT'], [{ negative: true }, 'BOT_RESULT'], [{ notDispatched: true }, 'DELIVERY']]) {
    const f = fixture(options), c = f.controller;
    await c.execute('connect');
    const plan = await c.execute('prepare-write', { text: '这一次请求', scope: 'user', tier: 'log' });
    const result = await c.execute('commit', { planId: plan.state.preview.id, confirm: true });
    assert.equal(result.ok, false); assert.equal(result.error.code, code);
    assert.equal(result.state.evidence.acknowledgement, false);
  }
  assert.equal(replyObject('{"id":"old","ok":true}', 'new', () => true), null);
  assert.equal(replyObject('说明 ```json\n{"id":"new","ok":true,"s":"}\\\"{"}\n```', 'new', value => value.ok).id, 'new');
  const rows = transcriptRows({ entries: [{ seq: '9007199254740996', body: Buffer.from('{"kind":"send-message","message":{"content":"正文"}}').toString('base64') }] });
  assert.equal(rows[0].seq, 9007199254740996n);
});

test('parallel operation guard, cancellation and disconnect discard late results without restoring private state', async () => {
  let release, signal;
  const c = new GrokMemoryController({ loader: async ({ signal: value }) => {
    signal = value; await new Promise(resolve => { release = resolve; });
    return { session: { token: 'fixture-delayed-token' }, checks: [] };
  }, client: { listBots: async () => [{ id: 'late-bot', label: '迟到' }] } });
  const pending = c.execute('connect');
  assert.equal((await c.execute('connect')).error.code, 'BUSY');
  await c.execute('cancel'); assert.equal(signal.aborted, true);
  await c.execute('disconnect'); release();
  await pending;
  assert.equal(c.session, null); assert.equal(c.snapshot().connected, false);
  assert.deepEqual(c.snapshot().bots, []); assert.equal(c.snapshot().error, null);
});

test('preview is one-use, expires, rejects unknown Bot/ranges and cannot be moved to a different Bot', async () => {
  const f = fixture(), c = f.controller;
  await c.execute('connect');
  assert.equal((await c.execute('select', { bot: 'arbitrary-bot' })).error.code, 'BOT');
  for (const input of [{ text: '', scope: 'user', tier: 'log' }, { text: 'a', scope: 'team', tier: 'log' }, { text: 'a', scope: 'user', tier: 'unknown' }, { text: 'a'.repeat(32769), scope: 'user', tier: 'log' }]) {
    assert.equal((await c.execute('prepare-write', input)).error.code, 'INPUT');
  }
  let result = await c.execute('prepare-write', { text: 'a', scope: 'user', tier: 'log' });
  const id = result.state.preview.id;
  await c.execute('select', { bot: 'fixture-bot-two' });
  assert.equal((await c.execute('commit', { planId: id, confirm: true })).error.code, 'STALE');
  result = await c.execute('prepare-write', { text: 'a', scope: 'user', tier: 'log' });
  c.now = () => Date.now() + 400000;
  assert.equal((await c.execute('commit', { planId: result.state.preview.id, confirm: true })).error.code, 'STALE');
});

test('RPC pins HTTPS service/methods, blocks redirects, caps responses and removes sensitive error details', async () => {
  const session = { token: 'fixture-rpc-token', machine: 'fixture-rpc-machine', version: '1.2.3', platform: 'win32' };
  const requests = [];
  const rpc = createRpc({ now: () => 1700000000000, fetchImpl: async (url, options) => {
    requests.push({ url, options }); return new Response('{"agents":[]}');
  } });
  await rpc(session, 'ListGrokBotAgents', {});
  assert.equal(requests[0].url, 'https://api2.cursor.sh/aiserver.v1.GrokBotService/ListGrokBotAgents');
  assert.equal(requests[0].options.redirect, 'manual'); assert.equal(requests[0].options.credentials, 'omit');
  assert.equal(requests[0].options.headers.authorization, 'Bearer ' + session.token);
  assert.equal(checksum('machine', 0), 'paaoq6-0machine');
  await assert.rejects(rpc(session, 'https://other.test', {}), error => error.code === 'ACTION');
  assert.equal(requests.length, 1);
  for (const [response, code] of [[new Response('secret: ' + session.token, { status: 302 }), 'REDIRECT'],
    [new Response('secret: ' + session.token, { status: 401 }), 'AUTH'],
    [new Response('{}', { status: 403 }), 'PERMISSION'], [new Response('{}', { status: 429 }), 'RATE_LIMIT'],
    [new Response('broken-json'), 'RESPONSE'], [new Response('{}', { headers: { 'content-length': String(3 * 1024 * 1024) } }), 'RESPONSE']]) {
    const client = createRpc({ fetchImpl: async () => response });
    await assert.rejects(client(session, 'ListGrokBotAgents', {}), error => error.code === code && !error.message.includes(session.token));
  }
  assert.equal(publicError(new Error(session.token)).code, 'SERVICE');
});

test('RPC request timeout/abort interrupt waiting without logging credentials', async () => {
  const pendingFetch = (_url, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('private-native-detail')), { once: true }));
  const rpc = createRpc({ timeoutMs: 10, fetchImpl: pendingFetch });
  const session = { token: 'fixture-timeout', machine: 'fixture-machine', version: '1.0.0' };
  await assert.rejects(rpc(session, 'ListGrokBotAgents', {}), error => error.code === 'TIMEOUT');
  const abort = new AbortController(); abort.abort();
  await assert.rejects(rpc(session, 'ListGrokBotAgents', {}, abort.signal), error => error.code === 'CANCELLED');
});

function cryptoFixture(platform = 'win32', expired = false, corrupt = false) {
  const key = Buffer.alloc(32, 7), password = Buffer.from('fixture-macos-password');
  const token = 'header.' + Buffer.from(JSON.stringify({ exp: expired ? 1 : Math.floor(Date.now() / 1000) + 600 })).toString('base64url') + '.fixture';
  function encrypt(text) {
    let output;
    if (platform === 'win32') {
      const nonce = Buffer.alloc(12, 3), cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
      output = Buffer.concat([Buffer.from('v10'), nonce, cipher.update(text), cipher.final(), cipher.getAuthTag()]);
      if (corrupt) output[20] ^= 3;
    } else {
      const derived = crypto.pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1');
      const cipher = crypto.createCipheriv('aes-128-cbc', derived, Buffer.alloc(16, 32));
      output = Buffer.concat([Buffer.from('v10'), cipher.update(text), cipher.final()]);
    }
    return output.toString('base64');
  }
  const stored = { 'cursor-accounts': JSON.stringify({ active: 'fixture-active', accounts: {
    'fixture-active': { 'cursor-access-token': encrypt(token), 'cursor-account-profile': 'must-not-read-this-profile' } } }),
    'cursor-machine-id': encrypt('fixture-machine') };
  const reads = [], dpapi = [];
  const options = { platform, home: '/fixture-home', env: { APPDATA: '/fixture-appdata' },
    discover: async () => ({ version: '0.9.0' }), readJSON: async file => {
      reads.push(file);
      return path.basename(file) === 'Local State'
        ? { os_crypt: { encrypted_key: Buffer.from('DPAPIfixture-encrypted-key').toString('base64') } } : stored;
    }, unprotect: async bytes => { dpapi.push(bytes.toString()); return Buffer.from(key); },
    keychain: async () => Buffer.from(password) };
  return { options, reads, dpapi, token };
}

test('Windows native encrypted-record fixture decrypts GCM, ignores account profile, rejects corruption/expiry and supports legacy DPAPI', async () => {
  const f = cryptoFixture();
  const result = await loadSession(f.options);
  assert.equal(result.session.token, f.token); assert.equal(result.session.machine, 'fixture-machine');
  assert.equal(f.reads.length, 2); assert.deepEqual(f.dpapi, ['fixture-encrypted-key']);
  assert.equal(result.checks.length, 4);
  assert.equal(jwtExpiry(f.token) > Date.now(), true);
  const corrupt = cryptoFixture('win32', false, true);
  await assert.rejects(loadSession(corrupt.options), error => error.code === 'DECRYPT');
  assert.equal(corrupt.dpapi.length, 1, 'GCM corruption must not fall back to DPAPI');
  await assert.rejects(loadSession(cryptoFixture('win32', true).options), error => error.code === 'EXPIRED');
  const stored = { 'cursor-accounts': JSON.stringify({ active: 'x', accounts: { x: { 'cursor-access-token': Buffer.from('legacy-token').toString('base64') } } }), 'cursor-machine-id': Buffer.from('legacy-machine').toString('base64') };
  const legacy = await loadSession({ ...f.options, readJSON: async () => stored,
    unprotect: async raw => Buffer.from(raw.toString() === 'legacy-token' ? 'fixture-legacy-token' : 'fixture-legacy-machine') });
  assert.equal(legacy.session.token, 'fixture-legacy-token');
});

test('macOS keychain-format fixture decrypts CBC; unsupported platform and missing files return actionable sanitized errors', async () => {
  const f = cryptoFixture('darwin');
  assert.equal((await loadSession(f.options)).session.token, f.token);
  assert.equal(f.reads.length, 1); assert.equal(f.dpapi.length, 0);
  assert.throws(() => decryptCBC(Buffer.from('broken-cipher'), Buffer.from('fixture')));
  await assert.rejects(loadSession({ platform: 'linux' }), error => error.code === 'PLATFORM');
  await assert.rejects(loadSession({ ...f.options, readJSON: async () => { throw new Error('secret-system-path'); } }), error => error.code === 'LOGIN_FILE' && !error.message.includes('secret-system-path'));
});

test('complete pinned upstream source archive matches every manifest hash and ships its MIT license', () => {
  const root = path.resolve(__dirname, '../resources/grok-memory');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'source-manifest.json')));
  assert.equal(manifest.commit, 'b8fb8ed08d0657cb07675f31d5110b2da4c8744b');
  const archive = fs.readFileSync(path.join(root, manifest.archive));
  assert.equal(crypto.createHash('sha256').update(archive).digest('hex'), manifest.archiveSha256);
  const tar = zlib.gunzipSync(archive), found = new Map();
  for (let offset = 0; offset + 512 <= tar.length;) {
    const head = tar.subarray(offset, offset + 512);
    const name = head.subarray(0, 100).toString().replace(/\0.*$/s, '');
    if (!name) break;
    const size = parseInt(head.subarray(124, 136).toString().replace(/\0/g, '').trim(), 8);
    found.set(name, tar.subarray(offset + 512, offset + 512 + size));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  assert.equal(found.size, manifest.fileCount);
  for (const file of manifest.files) {
    assert.equal(found.get(file.path)?.length, file.bytes, file.path);
    assert.equal(crypto.createHash('sha256').update(found.get(file.path)).digest('hex'), file.sha256, file.path);
  }
  assert.match(fs.readFileSync(path.join(root, 'LICENSE.souhun.txt'), 'utf8'), /Copyright \(c\) 2026 lniosy/);
  assert.deepEqual(found.get('LICENSE'), fs.readFileSync(path.join(root, 'LICENSE.souhun.txt')));
});
