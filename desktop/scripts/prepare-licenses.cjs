'use strict';
// Rebuild notices only from pinned project resources and installed lockfile dependencies.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');
const desktop = path.resolve(__dirname, '..');
const root = path.dirname(desktop);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

function prepare() {
  const sections = [], seen = new Set();
  function add(label, bytes) {
    const hash = sha(bytes);
    if (seen.has(hash)) return;
    seen.add(hash);
    sections.push(`${'='.repeat(72)}\n${label}\nSHA-256: ${hash}\n${'='.repeat(72)}\n\n${bytes.toString('utf8')}\n`);
  }
  const local = (label, file) => add(label, fs.readFileSync(path.join(root, file)));
  local('ColdCoffee / LICENSE', 'LICENSE');
  local('ColdCoffee / THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md');
  for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES']) local(`Magpie / ${name}`, `desktop/resources/magpie/${name}`);
  for (const name of ['LICENSE.souhun.txt', 'NOTICE.md']) local(`Grok Bot reference / ${name}`, `desktop/resources/grok-memory/${name}`);
  for (const name of ['LICENSE', 'NOTICE.md']) local(`IDA translation / ${name}`, `tools/ida-zh-cn/${name}`);

  const catalogRoot = path.join(desktop, 'resources/upstream-skills');
  const catalog = JSON.parse(fs.readFileSync(path.join(catalogRoot, 'catalog.json'), 'utf8'));
  for (const source of [...catalog.sources, catalog.runtime]) {
    const bytes = fs.readFileSync(path.join(catalogRoot, source.bundle));
    assert.equal(sha(bytes), source.sha256, `${source.id} pinned archive`);
    const bundle = JSON.parse(zlib.gunzipSync(bytes));
    const byPath = new Map(bundle.files.map(file => [file.path, file]));
    for (const required of source.licenseFiles || ['LICENSE', 'THIRD_PARTY_NOTICES.md']) assert.ok(byPath.has(required), `${source.id}/${required}`);
    for (const file of bundle.files) {
      if (!/(?:^|\/)(?:LICENSE[^/]*|COPYING[^/]*|NOTICE[^/]*|THIRD_PARTY_NOTICES[^/]*)$/i.test(file.path) && !/(?:^|\/)licenses\//i.test(file.path)) continue;
      const original = Buffer.from(file.content, 'base64');
      assert.equal(sha(original), file.sha256, `${source.id}/${file.path}`);
      add(`${source.id} / ${file.path} (unmodified source bytes)`, original);
    }
  }

  const lock = JSON.parse(fs.readFileSync(path.join(desktop, 'package-lock.json'), 'utf8'));
  for (const [key, entry] of Object.entries(lock.packages)) {
    if (!key || entry.dev) continue;
    assert.ok(!key.includes('..'));
    const folder = path.join(desktop, key), pkg = JSON.parse(fs.readFileSync(path.join(folder, 'package.json'), 'utf8'));
    assert.equal(pkg.version, entry.version, key);
    const notices = fs.readdirSync(folder).filter(file => /^(?:licen[cs]e|copying|notice)(?:[.-]|$)/i.test(file));
    assert.ok(notices.length, `${key}: license document required`);
    for (const name of notices) add(`${pkg.name}@${pkg.version} / ${name}`, fs.readFileSync(path.join(folder, name)));
  }
  const target = path.join(desktop, 'resources/legal');
  fs.mkdirSync(target, { recursive: true });
  fs.copyFileSync(path.join(root, 'LICENSE'), path.join(target, 'LICENSE'));
  fs.copyFileSync(path.join(root, 'THIRD_PARTY_NOTICES.md'), path.join(target, 'THIRD_PARTY_NOTICES.md'));
  const contents = '冷咖啡 · 开源许可原文汇编\n\n重复的相同许可文本按 SHA-256 合并一次。完整来源仍保留每个原始文件。\nElectron/Chromium 的完整声明另随安装包提供：LICENSE.electron.txt、LICENSES.chromium.html。\n\n' + sections.join('\n');
  fs.writeFileSync(path.join(target, 'OPEN_SOURCE_NOTICES.txt'), contents);
  console.log(`Prepared ${sections.length} distinct copyright/license/notice documents (${Buffer.byteLength(contents)} bytes)`);
  return target;
}
if (require.main === module) prepare();
module.exports = { prepare };
