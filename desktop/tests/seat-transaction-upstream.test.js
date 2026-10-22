'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { SeatTransactions, atomic } = require('../src/lib/seat-transactions');
const runtime = require('../src/lib/seat-runtime');

const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const MARKER_BEGIN = '<!-- PACK:BEGIN -->';
const MARKER_END = '<!-- PACK:END -->';
const temp = (t) => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'cc transaction '));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), fs.realpathSync(os.tmpdir()));
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 4, retryDelay: 50 });
  });
  return root;
};
const asAsset = (file, content, source, mode = 0o644) => ({ kind: 'asset', file, data: Buffer.from(content), source, mode });
const withPlan = (root, writes) => new SeatTransactions({ plan: () => ({ home: root, pack: 'base', begin: MARKER_BEGIN, end: MARKER_END, writes }) });
const install = (tx, seat = 'codex') => { const preview = tx.preview(seat); return { preview, result: tx.deploy(preview.id) }; };

test('preview composes multiple edits to one physical file and exposes resource provenance/hashes', (t) => {
  const root = temp(t), agents = path.join(root, 'AGENTS.md'), resource = path.join(root, 'skills', 'cc-rea-demo', 'SKILL.md');
  fs.writeFileSync(agents, `User instructions stay above.\n${MARKER_BEGIN}\nold base\n${MARKER_END}\nKeep this footer.\n`);
  const writes = [
    { kind: 'marked', file: agents, begin: MARKER_BEGIN, end: MARKER_END, body: `${MARKER_BEGIN}\nnew base\n${MARKER_END}\n` },
    { kind: 'marked', file: agents, begin: '<!-- EXT:BEGIN -->', end: '<!-- EXT:END -->', body: '<!-- EXT:BEGIN -->\nextension\n<!-- EXT:END -->\n', source: 'REA adapter' },
    asAsset(resource, 'skill bytes\n', 'REA', 0o644),
    asAsset(resource, 'skill bytes\n', 'reverse-skill', 0o644),
  ];
  const tx = withPlan(root, writes); tx.select(root);
  const preview = tx.preview('codex');
  assert.equal(preview.files.filter((file) => file.path === 'AGENTS.md').length, 1);
  const agentFile = preview.files.find((file) => file.path === 'AGENTS.md');
  assert.equal(agentFile.kinds.length, 1);
  assert.deepEqual(agentFile.sources, ['REA adapter']);
  assert.equal(agentFile.beforeHash, sha(fs.readFileSync(agents)));
  assert.equal(agentFile.changed, true);
  const resourceFile = preview.files.find((file) => file.path.endsWith('SKILL.md'));
  assert.deepEqual(resourceFile.sources, ['REA', 'reverse-skill']);
  assert.equal(resourceFile.kind, 'asset'); assert.equal(resourceFile.bytes, Buffer.byteLength('skill bytes\n'));
  assert.equal(resourceFile.afterHash, sha(Buffer.from('skill bytes\n')));
  const review = tx.file(preview.id, preview.files.findIndex((file) => file.path.endsWith('SKILL.md')));
  assert.deepEqual(review.sources, ['REA', 'reverse-skill']);
  assert.equal(review.afterHash, resourceFile.afterHash);
  assert.equal(review.after, 'skill bytes\n');
  assert.equal(fs.readFileSync(agents, 'utf8').includes('new base'), false, 'preview must be read-only');
  assert.equal(fs.existsSync(resource), false, 'preview must not create resource directories');
});

test('different upstream assets colliding on one destination fail closed; exact duplicates are deduplicated', (t) => {
  const root = temp(t), target = path.join(root, 'same.bin');
  const good = withPlan(root, [asAsset(target, 'same', 'REA'), asAsset(target, 'same', 'REA duplicate')]); good.select(root);
  assert.equal(good.preview('codex').files.length, 1);
  const conflict = withPlan(root, [asAsset(target, 'one', 'REA'), asAsset(target, 'two', 'reverse-skill')]); conflict.select(root);
  assert.throws(() => conflict.preview('codex'), /不同上游资源映射到同一文件/);
  const invalid = withPlan(root, [{ ...asAsset(target, 'same', 'REA'), mode: 0o777 }]); invalid.select(root);
  assert.throws(() => invalid.preview('codex'), /权限模式/);
});

test('Codex TOML base setting and REA MCP patch merge into one reversible physical write', (t) => {
  const root = temp(t), config = path.join(root, 'config.toml');
  fs.writeFileSync(config, '# user comment\nmodel = "keep"\n\n[mcp_servers.other]\ncommand = "other"\n');
  const tx = withPlan(root, [
    { kind: 'toml', file: config, key: 'model_instructions_file', value: 'prompts/cha-codex.md' },
    { kind: 'upstream-mcp', file: config, mode: 'toml', entry: { command: 'node', args: [path.join(root, '.coldcoffee-upstream', 'rea-launcher.cjs'), 'mcp'] } },
  ]);
  tx.select(root);
  const preview = tx.preview('codex');
  assert.equal(preview.files.length, 1);
  assert.deepEqual(preview.files[0].kinds, ['toml', 'upstream-mcp']);
  const { result } = install(tx);
  assert.equal(result.changed, 1);
  const saved = fs.readFileSync(config, 'utf8');
  assert.match(saved, /# user comment/); assert.match(saved, /model = "keep"/); assert.match(saved, /model_instructions_file/);
  assert.match(saved, /\[mcp_servers\.coldcoffee-rea\]/); assert.match(saved, /\[mcp_servers\.other\]/);
  tx.restore(result.id);
  assert.equal(fs.readFileSync(config, 'utf8'), '# user comment\nmodel = "keep"\n\n[mcp_servers.other]\ncommand = "other"\n');
});

test('settings and MCP merge retain comments, unrelated fields and names; TOML values with dollar signs remain literal', (t) => {
  const root = temp(t), settings = path.join(root, 'settings.json'), config = path.join(root, 'config.toml');
  const original = '{\n  // customer comment\n  "context": { "fileName": ["USER.md"] },\n  "theme": "keep",\n}\n';
  fs.writeFileSync(settings, original);
  fs.writeFileSync(config, 'model_instructions_file = "old"\n');
  const literal = path.join(root, '$&-dollar-$`-$\'', 'instructions.md');
  const tx = withPlan(root, [
    { kind: 'settings', file: settings, name: 'GEMINI.md' },
    { kind: 'upstream-mcp', file: settings, mode: 'json', keys: ['mcpServers', 'coldcoffee-rea'], entry: { command: 'node', args: ['rea-launcher.cjs', 'mcp'] } },
    { kind: 'toml', file: config, key: 'model_instructions_file', value: literal },
  ]); tx.select(root);
  const { result } = install(tx, 'gemini');
  const text = fs.readFileSync(settings, 'utf8');
  assert.match(text, /\/\/ customer comment/); assert.match(text, /"theme": "keep"/); assert.match(text, /USER\.md/); assert.match(text, /GEMINI\.md/);
  const TOML = require('smol-toml');
  assert.equal(TOML.parse(fs.readFileSync(config, 'utf8')).model_instructions_file, literal);
  assert.equal(tx.preview('gemini').changes, 0);
  tx.restore(result.id);
  assert.equal(fs.readFileSync(settings, 'utf8'), original);
});

test('asset install verifies exact bytes/mode and restores an existing user file exactly', (t) => {
  const root = temp(t), target = path.join(root, 'resources', 'demo.bin');
  fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, Buffer.from([0, 1, 2, 255]));
  if (process.platform !== 'win32') fs.chmodSync(target, 0o600);
  const old = fs.readFileSync(target), oldMode = fs.statSync(target).mode & 0o777;
  const tx = withPlan(root, [asAsset(target, Buffer.from([5, 6, 7, 8]), 'REA', 0o644)]); tx.select(root);
  const { preview, result } = install(tx);
  assert.equal(preview.files[0].beforeHash, sha(old)); assert.equal(preview.files[0].afterHash, sha(Buffer.from([5, 6, 7, 8])));
  assert.equal(fs.readFileSync(target).equals(Buffer.from([5, 6, 7, 8])), true);
  if (process.platform !== 'win32') assert.equal(fs.statSync(target).mode & 0o777, 0o644);
  assert.equal(tx.verify('codex').ok, true);
  const journal = tx.snapshot(result.id);
  assert.match(journal.files[0].before, /^blob:/); assert.match(journal.files[0].after, /^blob:/);
  tx.restore(result.id);
  assert.deepEqual(fs.readFileSync(target), old);
  if (process.platform !== 'win32') assert.equal(fs.statSync(target).mode & 0o777, oldMode);
});

test('hash validation blocks install after preview and blocks restore after user edits, before touching sibling files', (t) => {
  const root = temp(t), config = path.join(root, 'config.toml'), skill = path.join(root, 'skills', 'new', 'SKILL.md');
  fs.writeFileSync(config, 'model = "keep"\n');
  const tx = withPlan(root, [
    { kind: 'toml', file: config, key: 'model', value: 'new' },
    asAsset(skill, 'skill\n', 'REA'),
  ]); tx.select(root);
  const preview = tx.preview('codex');
  fs.writeFileSync(config, 'model = "user-race"\n');
  assert.throws(() => tx.deploy(preview.id), /文件已被其他操作修改/);
  assert.equal(fs.existsSync(skill), false); assert.equal(fs.readFileSync(config, 'utf8'), 'model = "user-race"\n');

  fs.writeFileSync(config, 'model = "keep"\n');
  const installed = install(tx);
  fs.writeFileSync(skill, 'user edited skill\n');
  assert.throws(() => tx.restore(installed.result.id), /文件已被其他操作修改/);
  assert.equal(fs.readFileSync(skill, 'utf8'), 'user edited skill\n');
  assert.equal(fs.readFileSync(config, 'utf8').includes('model = "new"'), true, 'the preflight conflict must leave all sibling files untouched');
});

test('write failure rolls earlier files back, journals status, and retains hashes for inspection', (t) => {
  const root = temp(t), first = path.join(root, 'one.txt'), second = path.join(root, 'two.txt');
  fs.writeFileSync(first, 'old one'); fs.writeFileSync(second, 'old two');
  let calls = 0;
  const tx = new SeatTransactions({ plan: () => ({ home: root, pack: '', begin: MARKER_BEGIN, end: MARKER_END, writes: [
    { kind: 'file', file: first, body: 'new one' }, { kind: 'file', file: second, body: 'new two' },
  ] }), write(file, data, mode) { if (++calls === 2) throw new Error('synthetic write failure'); return atomic(file, data, mode); } });
  tx.select(root);
  const preview = tx.preview('codex');
  assert.throws(() => tx.deploy(preview.id), /本次已写文件已回滚/);
  assert.equal(fs.readFileSync(first, 'utf8'), 'old one'); assert.equal(fs.readFileSync(second, 'utf8'), 'old two');
  const rolledBack = tx.history().find((row) => row.status === 'rolled-back');
  assert.ok(rolledBack); assert.equal(tx.snapshot(rolledBack.id).files.length, 2);
  assert.throws(() => tx.restore(rolledBack.id), /没有可恢复/);
});

test('a writer that commits before throwing is also rolled back rather than leaving an unrecorded change', (t) => {
  const root = temp(t), target = path.join(root, 'one.txt'); fs.writeFileSync(target, 'old');
  const tx = new SeatTransactions({ plan: () => ({ home: root, pack: '', writes: [{ kind: 'file', file: target, body: 'new' }] }),
    write(file, bytes, mode) { atomic(file, bytes, mode); throw new Error('after-rename failure'); } });
  tx.select(root);
  assert.throws(() => install(tx), /本次已写文件已回滚/);
  assert.equal(fs.readFileSync(target, 'utf8'), 'old');
  assert.equal(tx.history()[0].status, 'rolled-back');
});

test('final verification catches an earlier installed resource disappearing and rolls back the remaining writes', (t) => {
  const root = temp(t), resource = path.join(root, 'resource.bin'), config = path.join(root, 'config.txt');
  fs.writeFileSync(config, 'old config');
  const tx = new SeatTransactions({ plan: () => ({ home: root, pack: '', writes: [
    asAsset(resource, 'resource bytes', 'REA'), { kind: 'file', file: config, body: 'new config' },
  ] }), write(file, bytes, mode) {
    atomic(file, bytes, mode);
    if (file === config) fs.unlinkSync(resource);
  } });
  tx.select(root);
  assert.throws(() => install(tx), /resource\.bin.*本次已写文件已回滚/);
  assert.equal(fs.existsSync(resource), false);
  assert.equal(fs.readFileSync(config, 'utf8'), 'old config');
  assert.equal(tx.history()[0].status, 'rolled-back');
});

test('final verification covers unchanged files and preserves concurrent user edits', (t) => {
  const root = temp(t), unchanged = path.join(root, 'keep.txt'), resource = path.join(root, 'new.bin');
  fs.writeFileSync(unchanged, 'existing');
  const tx = new SeatTransactions({ plan: () => ({ home: root, pack: '', writes: [
    { kind: 'file', file: unchanged, body: 'existing' }, asAsset(resource, 'new bytes', 'REA'),
  ] }), write(file, bytes, mode) {
    atomic(file, bytes, mode);
    fs.writeFileSync(unchanged, 'concurrent user edit');
  } });
  tx.select(root);
  assert.throws(() => install(tx), /keep\.txt.*本次已写文件已回滚/);
  assert.equal(fs.existsSync(resource), false);
  assert.equal(fs.readFileSync(unchanged, 'utf8'), 'concurrent user edit');
});

test('preparing/restoring journals recover byte-exact partial state; third-party edits block the whole recovery', (t) => {
  const root = temp(t), first = path.join(root, 'one.txt'), second = path.join(root, 'two.txt');
  fs.writeFileSync(first, 'old one'); fs.writeFileSync(second, 'old two');
  const tx = withPlan(root, [ { kind: 'file', file: first, body: 'new one' }, { kind: 'file', file: second, body: 'new two' } ]); tx.select(root);
  const preview = tx.preview('codex'), plan = tx.getPlan(preview.id);
  const files = plan.files.map((file) => ({ path: file.path, kind: file.kind, kinds: file.kinds, sources: file.sources,
    beforeHash: file.beforeHash, afterHash: file.afterHash, beforeMode: file.beforeMode, afterMode: file.afterMode,
    changed: true, before: tx.retain(file.before, file.beforeHash), after: tx.retain(file.after, file.afterHash) }));
  const snapshot = { schemaVersion: 2, id: crypto.randomUUID(), seat: 'codex', root, at: new Date().toISOString(), status: 'preparing', files };
  // Simulate a committed write with the same recorded permissions as deploy().
  tx.save(snapshot); atomic(first, Buffer.from('new one'), plan.files.find((file) => file.path === 'one.txt').afterMode);
  tx.validateRestore(snapshot.id);
  assert.equal(tx.restore(snapshot.id).restored, 1);
  assert.equal(fs.readFileSync(first, 'utf8'), 'old one'); assert.equal(fs.readFileSync(second, 'utf8'), 'old two');

  const preview2 = tx.preview('codex'), plan2 = tx.getPlan(preview2.id);
  const snapshot2 = { schemaVersion: 2, id: crypto.randomUUID(), seat: 'codex', root, at: new Date().toISOString(), status: 'restoring', files: plan2.files.map((file) => ({
    path: file.path, kind: file.kind, kinds: file.kinds, beforeHash: file.beforeHash, afterHash: file.afterHash,
    beforeMode: file.beforeMode, afterMode: file.afterMode, before: file.before !== null ? tx.retain(file.before, file.beforeHash) : null,
    after: tx.retain(file.after, file.afterHash), changed: true,
  })) };
  tx.save(snapshot2); atomic(first, Buffer.from('new one'), plan2.files.find((file) => file.path === 'one.txt').afterMode); fs.writeFileSync(second, 'a user edit');
  assert.throws(() => tx.restore(snapshot2.id), /文件已被其他操作修改/);
  assert.equal(fs.readFileSync(first, 'utf8'), 'new one'); assert.equal(fs.readFileSync(second, 'utf8'), 'a user edit');
});

test('mode-only changes are detected and restored exactly even when content hashes match', (t) => {
  if (process.platform === 'win32') { t.skip('Windows does not expose POSIX permission semantics'); return; }
  const root = temp(t), target = path.join(root, 'program.sh'), data = Buffer.from('same bytes');
  fs.writeFileSync(target, data); fs.chmodSync(target, 0o600);
  const tx = withPlan(root, [asAsset(target, data, 'REA', 0o644)]); tx.select(root);
  const { preview, result } = install(tx);
  assert.equal(preview.files[0].beforeHash, preview.files[0].afterHash);
  assert.equal(preview.files[0].changed, true);
  fs.chmodSync(target, 0o600);
  assert.throws(() => tx.restore(result.id), /文件已被其他操作修改/);
  assert.equal(fs.statSync(target).mode & 0o777, 0o600);
  fs.chmodSync(target, 0o644);
  assert.equal(tx.restore(result.id).restored, 1);
  assert.equal(fs.statSync(target).mode & 0o777, 0o600);
});

test('transaction guard detects directory junction and hardlink, while a missing normal path remains previewable', (t) => {
  const root = temp(t), outsideDirectory = path.join(root, 'outside'); fs.mkdirSync(outsideDirectory);
  const outside = path.join(outsideDirectory, 'file.txt'); fs.writeFileSync(outside, 'outside');
  const symlink = path.join(root, 'linked');
  fs.symlinkSync(outsideDirectory, symlink, process.platform === 'win32' ? 'junction' : 'dir');
  const linkTx = withPlan(root, [asAsset(path.join(symlink, 'file.txt'), 'replacement', 'REA')]); linkTx.select(root);
  assert.throws(() => linkTx.preview('codex'), /符號链接|符号链接|目录联接/);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'outside');

  const hard = path.join(root, 'hardlink');
  fs.linkSync(outside, hard);
  const hardTx = withPlan(root, [asAsset(hard, 'replacement', 'REA')]); hardTx.select(root);
  assert.throws(() => hardTx.preview('codex'), /硬链接/);
  const absent = path.join(root, 'nested', 'missing.txt');
  const normal = withPlan(root, [{ kind: 'file', file: absent, body: 'new' }]); normal.select(root);
  assert.equal(normal.preview('codex').files[0].exists, false);
  assert.equal(fs.existsSync(absent), false);
});

test('runtime multi-root deploy preflights every root and compensates earlier roots on later failure', (t) => {
  const root = temp(t), firstRoot = path.join(root, 'first'), secondRoot = path.join(root, 'second');
  fs.mkdirSync(firstRoot); fs.mkdirSync(secondRoot);
  const first = path.join(firstRoot, 'settings.txt'), second = path.join(secondRoot, 'settings.txt');
  fs.writeFileSync(first, 'old first'); fs.writeFileSync(second, 'old second');
  const spec = { home: firstRoot, pack: '', upstream: { fileCount: 2 }, writes: [
    { kind: 'file', file: first, body: 'new first', home: firstRoot }, { kind: 'file', file: second, body: 'new second', home: secondRoot },
  ] };
  const createTx = (selected, build) => new SeatTransactions({ plan: build, write(file, data, mode) {
    if (path.resolve(selected) === path.resolve(secondRoot)) throw new Error('second root unavailable');
    return atomic(file, data, mode);
  } });
  assert.throws(() => runtime.deploy('codex', firstRoot, { planFn: () => spec, createTx }), /补偿恢复/);
  assert.equal(fs.readFileSync(first, 'utf8'), 'old first'); assert.equal(fs.readFileSync(second, 'utf8'), 'old second');

  const badSecond = path.join(root, 'bad-second'); fs.mkdirSync(badSecond);
  const outsideDirectory = path.join(root, 'other-folder'); fs.mkdirSync(outsideDirectory); fs.writeFileSync(path.join(outsideDirectory, 'settings.txt'), 'outside');
  const link = path.join(badSecond, 'linked');
  fs.symlinkSync(outsideDirectory, link, process.platform === 'win32' ? 'junction' : 'dir');
  const conflictSpec = { home: firstRoot, pack: '', writes: [
    { kind: 'file', file: first, body: 'conflict-plan', home: firstRoot }, { kind: 'file', file: path.join(link, 'settings.txt'), body: 'outside overwrite', home: badSecond },
  ] };
  assert.throws(() => runtime.deploy('codex', firstRoot, { planFn: () => conflictSpec, createTx: (selected, build) => new SeatTransactions({ plan: build }) }), /符号链接|目录联接/);
  assert.equal(fs.readFileSync(first, 'utf8'), 'old first', 'all roots are previewed before the first write');
});

test('runtime restore preflights recovery states across roots before mutating either root', (t) => {
  const root = temp(t), firstRoot = path.join(root, 'first'), secondRoot = path.join(root, 'second');
  fs.mkdirSync(firstRoot); fs.mkdirSync(secondRoot);
  const first = path.join(firstRoot, 'one.txt'), second = path.join(secondRoot, 'two.txt');
  fs.writeFileSync(first, 'old first'); fs.writeFileSync(second, 'old second');
  const spec = { home: firstRoot, pack: '', writes: [
    { kind: 'file', file: first, body: 'new first', home: firstRoot }, { kind: 'file', file: second, body: 'new second', home: secondRoot },
  ] };
  const createTx = (selected, build) => new SeatTransactions({ plan: build });
  const deployed = runtime.deploy('codex', firstRoot, { planFn: () => spec, createTx });
  assert.equal(deployed.changed, 2);
  fs.writeFileSync(second, 'outside user edit');
  assert.throws(() => runtime.restore('codex', firstRoot, { planFn: () => spec, createTx }), /文件已被其他操作修改/);
  assert.equal(fs.readFileSync(first, 'utf8'), 'new first');
  assert.equal(fs.readFileSync(second, 'utf8'), 'outside user edit');
});
