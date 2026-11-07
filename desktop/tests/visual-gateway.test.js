'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { KeyVault } = require('../src/lib/visual-gateway/vault');
const { baseUrl } = require('../src/lib/visual-gateway/bridge');
const { ClientConnector } = require('../src/lib/visual-gateway/clients');

test('relay addresses reject credentials and external plaintext while allowing loopback fixtures', () => {
  assert.equal(baseUrl('https://api.example/v1/'), 'https://api.example/v1');
  assert.equal(baseUrl('http://127.0.0.1:3456/v1'), 'http://127.0.0.1:3456/v1');
  for (const input of ['https://fixture-user@api.example/v1', 'https://api.example/v1?key=fixture', 'https://api.example/v1#fixture', 'http://api.example/v1', 'file:///fixture']) assert.throws(() => baseUrl(input));
});

test('remembering requires native encryption; session keys never create plaintext files', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coldcoffee-vault-'));
  t.after(() => { for (const file of fs.readdirSync(root)) fs.unlinkSync(path.join(root, file)); fs.rmdirSync(root); });
  const vault = new KeyVault(root, { isEncryptionAvailable: () => false });
  assert.throws(() => vault.put('coldcoffee', 'fixture-token', true), /加密/);
  vault.put('coldcoffee', 'fixture-token', false); assert.equal(vault.get('coldcoffee'), 'fixture-token');
  assert.deepEqual(fs.readdirSync(root), []);
  assert.equal(vault.scrub('key=fixture-token'), 'key=[API Key 已隐藏]');
  assert.throws(() => vault.file('../outside'));
  vault.remove('coldcoffee'); assert.equal(vault.get('coldcoffee'), '');
});

test('restore validates every backup before changing any client file', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coldcoffee-restore-'));
  const home = path.join(root, 'customer'), dir = path.join(root, 'backups'), id = crypto.randomUUID();
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true }); fs.mkdirSync(path.join(dir, id), { recursive: true });
  const file = path.join(home, '.codex/config.toml'); fs.writeFileSync(file, 'current');
  const digest = s => crypto.createHash('sha256').update(s).digest('hex');
  const manifest = { id, client: 'codex', time: '2026-11-07', status: 'applied', writes: [{ file, relative: 'config.toml', before: digest('original'), after: digest('current'), backup: '0.backup' }] };
  fs.writeFileSync(path.join(dir, id, 'manifest.json'), JSON.stringify(manifest)); fs.writeFileSync(path.join(dir, id, '0.backup'), 'damaged');
  const connector = new ClientConnector({ directory: dir, engine: { directory: path.join(root, 'engine') }, home, env: {} });
  assert.throws(() => connector.restore('codex'), /备份校验/); assert.equal(fs.readFileSync(file, 'utf8'), 'current');
  t.after(() => { fs.unlinkSync(file); fs.unlinkSync(path.join(dir, id, 'manifest.json')); fs.unlinkSync(path.join(dir, id, '0.backup')); fs.rmdirSync(path.join(dir, id)); fs.rmdirSync(dir); fs.rmdirSync(path.dirname(file)); fs.rmdirSync(home); fs.rmdirSync(root); });
});
