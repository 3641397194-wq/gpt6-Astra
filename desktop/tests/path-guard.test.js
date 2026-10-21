'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { SeatTransactions, guardPath, atomic } = require('../src/lib/seat-transactions');

const LINK_ERROR = /符号链接|目录联接/;
const linkType = process.platform === 'win32' ? 'junction' : 'dir';

function fixture(t) {
  const base = fs.realpathSync.native(os.tmpdir());
  const root = fs.mkdtempSync(path.join(base, 'cc-path-guard-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), base);
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 4, retryDelay: 50 });
  });
  return root;
}

test('canonical paths keep one lstat and one native realpath per existing target', (t) => {
  const root = fixture(t), file = path.join(root, 'ordinary.txt');
  fs.writeFileSync(file, 'unchanged');
  const lstat = t.mock.method(fs, 'lstatSync');
  const realpath = t.mock.method(fs.realpathSync, 'native');
  guardPath(file);
  assert.equal(lstat.mock.callCount(), 1);
  assert.equal(realpath.mock.callCount(), 1);
  assert.equal(fs.readFileSync(file, 'utf8'), 'unchanged');
});

test('a missing normal target validates its closest existing ancestor without creating it', (t) => {
  const root = fixture(t), file = path.join(root, 'missing', 'nested', 'ordinary.txt');
  const lstat = t.mock.method(fs, 'lstatSync');
  const realpath = t.mock.method(fs.realpathSync, 'native');
  guardPath(file);
  assert.equal(lstat.mock.callCount(), 4);
  assert.equal(realpath.mock.callCount(), 1);
  assert.equal(fs.existsSync(path.join(root, 'missing')), false);
});

test('a canonical spelling difference checks the original ancestor chain including its root', (t) => {
  const root = fixture(t), directory = path.join(root, 'ordinary');
  fs.mkdirSync(directory);
  // Model an OS spelling expansion without depending on NTFS 8.3 being enabled.
  // The native Windows integration test below also exercises a real short name.
  t.mock.method(fs.realpathSync, 'native', () => path.join(root, 'canonical-spelling', 'ordinary'));
  const lstat = t.mock.method(fs, 'lstatSync');
  assert.doesNotThrow(() => guardPath(directory));
  const checked = lstat.mock.calls.map((call) => call.arguments[0]);
  for (let part = directory; ; part = path.dirname(part)) {
    assert.ok(checked.includes(part), `original ancestor was checked: ${part}`);
    if (path.dirname(part) === part) break;
  }
});

test('canonical spelling fallback also validates the filesystem root instead of trusting a basename', (t) => {
  const root = fixture(t), filesystemRoot = path.parse(root).root;
  const lstat = fs.lstatSync;
  t.mock.method(fs.realpathSync, 'native', () => path.join(root, 'canonical-spelling'));
  t.mock.method(fs, 'lstatSync', (file, ...args) => file === filesystemRoot
    ? { isSymbolicLink: () => true, isFile: () => false }
    : lstat(file, ...args));
  assert.throws(() => guardPath(root), LINK_ERROR);
});

test('leaf and ancestor junctions are rejected even when source and destination leaf names match', (t) => {
  const root = fixture(t), outside = path.join(root, 'outside'), link = path.join(root, 'selected');
  const sameName = path.join(outside, 'same-name');
  fs.mkdirSync(sameName, { recursive: true });
  fs.writeFileSync(path.join(sameName, 'sentinel.txt'), 'unchanged');
  fs.symlinkSync(outside, link, linkType);
  assert.throws(() => guardPath(link), LINK_ERROR);
  assert.throws(() => guardPath(path.join(link, 'same-name')), LINK_ERROR);
  assert.throws(() => guardPath(path.join(link, 'same-name', 'sentinel.txt')), LINK_ERROR);
  assert.throws(() => guardPath(path.join(link, 'missing', 'nested', 'new.txt')), LINK_ERROR);
  assert.throws(() => new SeatTransactions().select(path.join(link, 'same-name')), LINK_ERROR);
  assert.equal(fs.readFileSync(path.join(sameName, 'sentinel.txt'), 'utf8'), 'unchanged');
});

test('hardlinked target files are still rejected before reading or replacing their bytes', (t) => {
  const root = fixture(t), original = path.join(root, 'original.txt'), linked = path.join(root, 'linked.txt');
  fs.writeFileSync(original, 'unchanged');
  fs.linkSync(original, linked);
  assert.throws(() => guardPath(linked), /硬链接/);
  assert.throws(() => atomic(linked, Buffer.from('replacement')), /硬链接/);
  assert.equal(fs.readFileSync(original, 'utf8'), 'unchanged');
});

test('a previously checked directory is revalidated after a junction swap between sibling writes', (t) => {
  const root = fixture(t), directory = path.join(root, 'selected'), outside = path.join(root, 'outside');
  fs.mkdirSync(directory); fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'sentinel.txt'), 'unchanged');
  atomic(path.join(directory, 'first.txt'), Buffer.from('first'));
  fs.renameSync(directory, path.join(root, 'original-selected'));
  fs.symlinkSync(outside, directory, linkType);
  assert.throws(() => atomic(path.join(directory, 'second.txt'), Buffer.from('second')), LINK_ERROR);
  assert.deepEqual(fs.readdirSync(outside), ['sentinel.txt']);
  assert.equal(fs.readFileSync(path.join(outside, 'sentinel.txt'), 'utf8'), 'unchanged');
});

if (process.platform === 'win32') {
  test('Windows drive and share roots stay excluded with or without a DOS namespace prefix', (t) => {
    t.mock.method(fs, 'lstatSync', () => { throw new Error('root selection should stop before filesystem access'); });
    for (const root of ['C:\\', '\\\\path-guard-fixture\\share\\']) {
      assert.throws(() => new SeatTransactions().select(root), /磁盘根目录/);
      assert.throws(() => new SeatTransactions().select(path.toNamespacedPath(root)), /磁盘根目录/);
    }
  });

  function shortPath(file) {
    const script = `
      $ErrorActionPreference = 'Stop'
      $ProgressPreference = 'SilentlyContinue'
      Add-Type -TypeDefinition 'using System; using System.Text; using System.Runtime.InteropServices; public static class PathGuardNames { [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern uint GetShortPathNameW(string source, StringBuilder result, uint length); }'
      $result = [Text.StringBuilder]::new(32768)
      $length = [PathGuardNames]::GetShortPathNameW($env:PATH_GUARD_FIXTURE, $result, $result.Capacity)
      if ($length -eq 0 -or $length -ge $result.Capacity) { throw 'GetShortPathNameW failed' }
      [Console]::Write($result.ToString())
    `;
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
      encoding: 'utf8', timeout: 30000, windowsHide: true, env: { ...process.env, PATH_GUARD_FIXTURE: file },
    }).trim();
  }

  test('Windows native namespace and 8.3 spellings accept ordinary paths and preserve junction checks', (t) => {
    const root = fixture(t), directory = path.join(root, 'ordinary long directory name');
    fs.mkdirSync(directory);
    const short = shortPath(directory), namespaced = path.toNamespacedPath(directory);
    const ordinary = fs.lstatSync(directory, { bigint: true }), aliased = fs.lstatSync(short, { bigint: true });
    assert.equal(ordinary.dev, aliased.dev); assert.equal(ordinary.ino, aliased.ino);
    assert.equal(aliased.isSymbolicLink(), false);
    assert.equal(fs.realpathSync.native(short), fs.realpathSync.native(directory));
    for (const selected of [short, namespaced, path.toNamespacedPath(short)]) {
      assert.doesNotThrow(() => guardPath(selected));
      const file = path.join(selected, 'nested', 'settings.txt');
      const tx = new SeatTransactions({ plan: () => ({ pack: 'fixture', writes: [{ kind: 'file', file, body: 'fixture bytes' }] }) });
      tx.select(selected);
      const preview = tx.preview('codex'), result = tx.deploy(preview.id);
      assert.equal(fs.readFileSync(file, 'utf8'), 'fixture bytes');
      tx.restore(result.id);
      assert.equal(fs.existsSync(file), false);
    }
    if (short.toLowerCase() === directory.toLowerCase()) t.diagnostic('NTFS 8.3 is disabled here; deterministic spelling-fallback and native namespace cases remain covered.');
    const outside = path.join(root, 'outside'), link = path.join(short, 'junction');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'sentinel.txt'), 'unchanged');
    fs.symlinkSync(outside, link, 'junction');
    assert.throws(() => guardPath(path.join(link, 'new.txt')), LINK_ERROR);
    assert.throws(() => guardPath(path.toNamespacedPath(path.join(link, 'new.txt'))), LINK_ERROR);
    assert.throws(() => guardPath(path.join(link, 'sentinel.txt')), LINK_ERROR);
    assert.throws(() => guardPath(path.toNamespacedPath(path.join(link, 'sentinel.txt'))), LINK_ERROR);
    assert.equal(fs.readFileSync(path.join(outside, 'sentinel.txt'), 'utf8'), 'unchanged');
  });

  test('Windows namespaced UNC spelling checks the original chain through the share root', (t) => {
    const root = '\\\\path-guard-fixture\\share\\', directory = path.join(root, 'SHORT~1', 'same-name');
    let hasLink = false;
    // A virtual share keeps this a filesystem-unit test: no network lookup.
    const lstat = t.mock.method(fs, 'lstatSync', (file) => ({
      isFile: () => false, isSymbolicLink: () => hasLink && file === path.join(root, 'SHORT~1'),
    }));
    t.mock.method(fs.realpathSync, 'native', () => path.join(root, 'ordinary long name', 'same-name'));
    assert.doesNotThrow(() => guardPath(path.toNamespacedPath(directory)));
    const checked = lstat.mock.calls.map((call) => call.arguments[0]);
    assert.ok(checked.includes(root));
    assert.equal(checked.some((file) => file === '\\\\path-guard-fixture\\'), false);
    hasLink = true;
    assert.throws(() => guardPath(path.toNamespacedPath(directory)), LINK_ERROR);
  });
}
