'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { projector, totalsView } = require('../src/lib/visual-gateway/trace-view');
const R = require('../src/shared/routing-view');
const { VisualGateway } = require('../src/lib/visual-gateway/controller');
const { groupRevision } = require('../src/lib/visual-gateway/trace-view');
const fixture = () => ({
  id: 41, seq: 10, model: 'group/fixture', provider: 'primary', agent: 'codex', done: true, status: 200, served: 'answer-model',
  group: { id: 'fixture', name: 'Fixture', routing: 'order', affinity: 'off', members: ['primary/model', 'backup/model'], subs: [{ id: 'nested', name: 'Nested', routing: 'rotate', in: 'fixture' }] },
  order: [{ id: 'raw-key-fingerprint', provider: 'primary', name: 'Main', model: 'model', kind: 'key', who: 'fixture@private.example', shared: true }, { id: 'raw-account-fingerprint', provider: 'backup', name: 'Backup', model: 'model', kind: 'account', who: 'private-user', via: ['nested'] }],
  left: [{ id: 'raw-disabled', provider: 'third', name: 'Excluded', model: 'model', kind: 'provider', rest: { why: 'quota', until: '2026-11-07T00:00:00Z', key: 'raw-rest-key' } }],
  tries: [{ id: 'raw-key-fingerprint', model: 'model', done: true, status: 503, ms: 50, fail: 'other', error: 'local failure', rest: { by: 'backoff', key: 'raw-rest-key' } }, { id: 'raw-account-fingerprint', model: 'model', done: true, status: 200, ms: 100, served: 'answer-model', effort: 'high' }],
  usage: [{ provider: 'backup', model: 'answer-model', in: 600, out: 20, cache_read: 400 }],
  prompt: { window: 2000, tokens: 1000, counted: true, turns: 3, parts: [{ kind: 'system', tokens: 200, items: [{ name: 'prompt', tokens: 200 }] }, { kind: 'results', tokens: 800, items: [{ name: 'exec_command', n: 8, tag: 'result', tokens: 800 }] }] },
  session: 'private-session', folder: 'private-folder', responseId: 'private-response', privateFutureField: 'must-not-cross-ipc',
});

test('explicit route projection preserves real candidates, excluded seats, joins and nested groups', () => {
  const view = projector({ salt: 'fixture' }).route(fixture());
  assert.equal(view.order.length, 2); assert.equal(view.left.length, 1); assert.equal(view.tries.length, 2);
  assert.equal(view.order[0].id, view.tries[0].id); assert.equal(view.order[1].id, view.tries[1].id);
  assert.equal(view.actualProvider, 'backup'); assert.equal(view.actualName, 'Backup'); assert.equal(view.actualModel, 'answer-model');
  assert.deepEqual(view.order[1].via, ['nested']); assert.equal(view.group.subs[0].routing, 'rotate');
  const text = JSON.stringify(view);
  for (const privatePart of ['raw-key-fingerprint', 'raw-account-fingerprint', 'raw-rest-key', 'fixture@private.example', 'private-user', 'private-session', 'private-folder', 'private-response', 'must-not-cross-ipc']) assert.ok(!text.includes(privatePart), privatePart);
});

test('projection scrubs nested credentials/errors/item names and rejects future fields', () => {
  const source = fixture();
  source.tries[0].error = 'Bearer fixture-secret at C:\\Users\\fixture\\secret.txt fixture@private.example bridge-cookie';
  const syntheticKey = 'sk-' + 'synthetic-fixture'.repeat(4);
  source.order[0].name = syntheticKey;
  source.prompt.parts[0].items[0].name = 'fixture-secret';
  const view = projector({ scrub: s => s.replaceAll('fixture-secret', '[API Key 已隐藏]'), secrets: ['bridge-cookie'] }).route(source);
  const text = JSON.stringify(view);
  for (const secret of ['fixture-secret', 'bridge-cookie', 'secret.txt', 'fixture@private.example', syntheticKey]) assert.ok(!text.includes(secret), secret);
  assert.ok(view.tries[0].error.includes('已隐藏'));
});

test('courier follows active attempts and never treats a failed stream or unused backup as delivery', () => {
  assert.equal(R.courier(null).phase, 'idle');
  const source = fixture(); source.done = false;
  source.tries[1].done = false;
  assert.equal(R.courier(source).phase, 'running'); assert.equal(R.courier(source).target.id, 'raw-account-fingerprint');
  source.tries[1].done = true; source.tries[1].status = 503;
  assert.equal(R.courier(source).phase, 'waiting');
  source.done = true; source.status = 503;
  assert.equal(R.courier(source).phase, 'failed');
  source.status = 200; source.error = 'stream interrupted'; source.tries[1].status = 200;
  assert.equal(R.courier(source).phase, 'failed');
  source.error = '';
  assert.equal(R.courier(source).phase, 'arrived'); assert.equal(R.courier(source).target.id, 'raw-account-fingerprint');
});

test('first-choice success does not invent rerouting on unused branches', () => {
  const source = fixture(); source.tries = [{ ...source.tries[0], status: 200, fail: '', error: '', rest: null }];
  const view = projector().route(source), seats = R.candidates(view);
  assert.deepEqual(seats.map(s => s.status), ['hit', 'standby', 'excluded']);
  assert.ok(!R.story(view).some(s => s.detail.includes('下一次实际尝试')));
});

test('recorded failover and in-flight response show independently for each request', () => {
  const done = projector().route(fixture()), live = fixture(); live.done = false; live.tries[1].done = false; live.tries[1].status = 0;
  const liveView = projector().route(live);
  assert.deepEqual(R.candidates(liveView).map(s => s.status), ['failed', 'running', 'excluded']);
  assert.deepEqual(R.candidates(done).map(s => s.status), ['failed', 'hit', 'excluded']);
  assert.ok(R.story(done).some(s => s.detail.includes('下一次实际尝试：Backup')));
});

test('all failed attempts and missing candidate evidence remain explicit', () => {
  const source = fixture(); source.status = 502; source.tries[1].status = 502; source.served = ''; source.tries[1].served = '';
  const view = projector().route(source);
  assert.equal(view.actualProvider, ''); assert.deepEqual(R.candidates(view).map(s => s.status), ['failed', 'failed', 'excluded']);
  const lone = projector().route({ id: 42, done: true, status: 400, error: 'early failure', tries: [], order: null });
  assert.deepEqual(R.candidates(lone), []); assert.match(R.story(lone).at(-1).detail, /early failure/);
});

test('content area includes actual free space and per-item tool counts, not a whole-window fiction', () => {
  const view = projector().route(fixture());
  const entries = R.contextEntries(view.prompt), tiles = R.treemap(entries);
  assert.equal(entries.find(e => e.kind === 'remaining').tokens, 1000);
  assert.equal(entries.find(e => e.kind === 'results').n, 8);
  assert.equal(entries.find(e => e.kind === 'results').index, 0);
  assert.ok(Math.abs(tiles.reduce((n, t) => n + t.w * t.h, 0) - 10000) < 1e-7);
  assert.equal(tiles.find(e => e.kind === 'remaining').w * tiles.find(e => e.kind === 'remaining').h, 5000);
});

test('unknown window, used-only view, category filter and overflow never fabricate capacity', () => {
  const prompt = fixture().prompt;
  for (const options of [{ mode: 'content' }, { kind: 'results' }]) assert.ok(!R.contextEntries(prompt, options).some(e => e.kind === 'remaining'));
  assert.ok(!R.contextEntries({ ...prompt, window: 0 }).some(e => e.kind === 'remaining'));
  assert.ok(!R.contextEntries({ ...prompt, tokens: 3000 }).some(e => e.kind === 'remaining'));
  assert.deepEqual(R.treemap([{ tokens: 0 }, { tokens: NaN }]), []);
});

test('cache rate uses the reply usage, marks unknown separately and ignores failed-attempt costs', () => {
  const route = projector().route(fixture());
  route.usage.unshift({ provider: 'primary', model: 'model', in: 3000, cache_read: 2000 });
  assert.equal(R.cache(route).ratio, .4);
  route.usage[1].cache_unknown = true; assert.equal(R.cache(route), null);
  route.usage = []; assert.equal(R.cache(route), null);
});

test('catalog projection keeps routing groups/pools without exposing account/key labels', () => {
  const catalog = projector().catalog({ models: [{ id: 'primary/model', name: 'model', provider: 'primary', providerName: 'Main' }], groups: [{ ...fixture().group, ready: true, ref: 'group/fixture', rules: [{ contains: 'private' }], accounts: ['raw-fingerprint'], memberInfo: [{ id: 'primary/model', ready: true, on: 2 }] }], pools: [{ provider: 'primary', name: 'Main', routing: 'order', who: ['private@example.com', 'sk-testfakekey12345'] }], accounts: { primary: ['never expose'] } });
  assert.equal(catalog.groups[0].rules, 1); assert.equal(catalog.groups[0].memberInfo[0].on, 2);
  assert.equal(catalog.pools[0].on, 2); assert.equal(catalog.availableModels[1].id, 'group/fixture');
  assert.ok(!JSON.stringify(catalog).includes('private')); assert.ok(!JSON.stringify(catalog).includes('raw-fingerprint'));
});

test('engine totals are retained separately from the limited recent-request sample', () => {
  assert.deepEqual(totalsView({ requests: 1700, rerouted: 13, errors: 2, key: 'secret' }), { requests: 1700, rerouted: 13, errors: 2 });
  assert.deepEqual(totalsView(), { requests: 0, rerouted: 0, errors: 0 });
});

test('basic group save preserves advanced rules and constraints; stale versions and cyclic edits are checked', async () => {
  const old = { id: 'fixture', name: 'Fixture', members: ['primary/model', 'backup/model'], routing: 'order', affinity: 'off', rules: [{ use: 'primary/model', contains: 'large' }], weights: { 'primary/model': 3 }, accounts: ['primary/private-fingerprint'], firstToken: 8, patience: 17, match: ['primary/*'] };
  let saved;
  const host = { start: async () => {}, catalogTime: 100, readCatalog: async () => saved, engine: { api: async (endpoint, body) => { if (endpoint === 'groups') return { groups: [old], models: [{ id: 'primary/model' }, { id: 'backup/model' }] }; if (endpoint === 'groups/save') { saved = body; return {}; } throw new Error('unexpected endpoint'); } } };
  const input = { create: false, id: 'fixture', revision: groupRevision(old), name: 'Renamed', members: ['backup/model', 'primary/model'], routing: 'rotate', affinity: 'turn' };
  await VisualGateway.prototype.saveGroup.call(host, input);
  for (const key of ['rules', 'weights', 'accounts', 'firstToken', 'patience', 'match']) assert.deepEqual(saved[key], old[key]);
  assert.equal(saved.name, 'Renamed'); assert.deepEqual(saved.members, input.members); assert.equal(saved.routing, 'rotate');
  await assert.rejects(VisualGateway.prototype.saveGroup.call(host, { ...input, revision: 'stale' }), /其他窗口更新/);
  await assert.rejects(VisualGateway.prototype.saveGroup.call(host, { ...input, members: ['group/fixture'] }), /有效成员/);
  await assert.rejects(VisualGateway.prototype.saveGroup.call(host, { ...input, create: true }), /已存在/);
});

test('stream failure with a 200 header is not a successful answer', () => {
  const source = fixture(); source.tries[1].error = 'incomplete stream'; source.served = 'answer-model'; source.status = 502;
  const route = projector().route(source);
  assert.equal(route.actualProvider, ''); assert.equal(route.actualModel, ''); assert.equal(R.candidates(route)[1].status, 'failed');
});
