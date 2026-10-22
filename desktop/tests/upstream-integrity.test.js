'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const upstream = require('../src/lib/upstream-skills');
const runtime = require('../src/lib/seat-runtime');

function synthetic(t) {
  const parent = fs.realpathSync(os.tmpdir());
  const base = fs.mkdtempSync(path.join(parent, 'coldcoffee-upstream-integrity-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(base)), parent);
    fs.rmSync(base, { recursive: true, force: true, maxRetries: 3, retryDelay: 30 });
  });
  return base;
}

function byPath(descriptor) {
  return new Map(upstream.bundleFiles(descriptor).map((file) => [file.path, file]));
}

function groupWrites(spec) {
  const grouped = new Map();
  for (const item of spec.writes) {
    const root = item.home || spec.home;
    const relative = path.relative(root, item.file).replaceAll('\\', '/');
    assert.ok(relative && relative !== '..' && !relative.startsWith('../'), relative);
    assert.ok(path.isAbsolute(item.file));
    if (!grouped.has(root)) grouped.set(root, []);
    grouped.get(root).push(item);
  }
  return grouped;
}

function assertAdapterTree(writes, root, catalog) {
  const assets = writes.filter((item) => item.kind === 'asset');
  const all = new Map(assets.map((item) => [item.file.toLowerCase(), item]));
  assert.equal(all.size, assets.length, 'source assets must have unique destinations');
  const adapters = assets.filter((item) => /[\\/]cc-(?:rea|rs)-[^\\/]+[\\/]SKILL\.md$/.test(item.file));
  assert.equal(adapters.length, 94);
  const names = new Set();
  for (const adapter of adapters) {
    const name = /^---\nname: ([^\n]+)\n/.exec(adapter.data.toString('utf8'))?.[1];
    assert.match(name, /^cc-(rea|rs)-[a-z0-9-]+$/);
    assert.ok(name.length <= 64);
    assert.ok(!names.has(name), name); names.add(name);
  }
  for (const source of catalog.sources) {
    const sourceRoot = path.join(root, '.coldcoffee-upstream', 'sources', source.id);
    for (const file of upstream.bundleFiles(source)) {
      const destination = path.join(sourceRoot, upstream.deploymentRelative(file.path));
      const copy = all.get(destination.toLowerCase());
      assert.ok(copy, `${source.id}: missing ${file.path}`);
      assert.equal(copy.data, file.data, `${source.id}: source copy must retain original buffer`);
      assert.equal(copy.mode, file.mode);
    }
    for (const skill of source.skills) {
      const original = path.join(sourceRoot, skill.path).replaceAll('\\', '/');
      const matching = adapters.filter((item) => item.data.includes(Buffer.from(`原始入口：\`${original}\``)));
      assert.equal(matching.length, 1, original);
      const text = matching[0].data.toString('utf8');
      assert.ok(text.includes(source.repository));
      assert.ok(text.includes(source.commit));
      assert.ok(text.includes('冷咖啡'));
      if (skill.path.startsWith('CTF-Sandbox-Orchestrator/')) {
        assert.match(text, /许可：GPL-3\.0/);
        assert.doesNotMatch(text, /许可：MIT/);
      } else if (skill.path.startsWith('skills/pentest-tools/src-hunter/')) {
        assert.match(text, /许可：MIT（MyuriKanao 独立版权声明）/);
      }
    }
    const snapshot = all.get(path.join(root, '.coldcoffee-upstream', 'snapshots', source.bundle).toLowerCase());
    assert.ok(snapshot);
    assert.equal(upstream.digest(snapshot.data), source.sha256);
  }
  assert.equal(assets.filter((item) => item.source === 'rea-runtime').length, catalog.runtime.fileCount);
  const index = all.get(path.join(root, '.coldcoffee-upstream', 'INDEX.md').toLowerCase());
  assert.ok(index);
  assert.match(index.data.toString('utf8'), /burp-mcp-full\/ 的固定快照未发现独立 LICENSE、COPYING 或 NOTICE/);
  return all;
}

test('pinned catalog and bundles preserve source identity and every file digest', () => {
  const catalog = upstream.readCatalog();
  assert.equal(catalog.schemaVersion, 1);
  assert.deepEqual(catalog.sources.map((source) => source.id), ['rea', 'reverse-skill']);
  assert.deepEqual(catalog.sources.map((source) => source.commit), [
    '833136507dd79d959340b09862a53af344e4f1b3',
    'cab634bd855fc287f6e420c1f36fd1a6b9245960',
  ]);
  assert.equal(catalog.sources[0].skills.length, 5);
  assert.equal(catalog.sources[1].skills.length, 89);
  assert.equal(catalog.sources.reduce((count, source) => count + source.skills.length, 0), 94);
  assert.deepEqual(catalog.sources.map((source) => source.license), ['MIT', 'MIT']);
  assert.equal(catalog.sources[0].submodules.length, 5);
  assert.ok(catalog.sources[0].windowsPathIssues.length > 0);
  assert.equal(catalog.sources[0].submodules.reduce((count, module) => count + module.symlinks.length, 0), 214);
  for (const source of catalog.sources.concat(catalog.runtime)) {
    const files = upstream.bundleFiles(source);
    assert.equal(files.length, source.fileCount, source.id);
    assert.equal(files.reduce((size, file) => size + file.data.length, 0), source.bytes, source.id);
    for (const file of files) assert.equal(upstream.digest(file.data), file.sha256, `${source.id}:${file.path}`);
  }
});

test('licenses, source credits, and the fixed npm runtime remain intact', () => {
  const catalog = upstream.readCatalog();
  const rea = byPath(catalog.sources[0]), reverse = byPath(catalog.sources[1]), release = byPath(catalog.runtime);
  assert.match(rea.get('LICENSE').data.toString('utf8'), /MIT License[\s\S]*Copyright \(c\) 2026 morluto/);
  assert.match(reverse.get('LICENSE').data.toString('utf8'), /MIT License[\s\S]*Copyright \(c\) 2026 zhaoxuya520/);
  assert.match(reverse.get('CTF-Sandbox-Orchestrator/LICENSE').data.toString('utf8'), /GNU GENERAL PUBLIC LICENSE[\s\S]*Version 3, 29 June 2007/);
  assert.match(reverse.get('skills/pentest-tools/src-hunter/LICENSE').data.toString('utf8'), /MIT License[\s\S]*MyuriKanao/);
  assert.ok(reverse.has('burp-mcp-full/README.md'));
  assert.equal([...reverse.keys()].some((name) => /^burp-mcp-full\/(?:license|copying|notice)(?:\.|$)/i.test(name)), false, 'fixed Burp extension source does not ship a separate license file');
  const guide = fs.readFileSync(path.resolve(__dirname, '../../docs/UPSTREAM-SKILLS.md'), 'utf8');
  assert.match(guide, /`burp-mcp-full\/` 的固定快照未发现独立 `LICENSE`、`COPYING` 或 `NOTICE`/);
  for (const name of ['THIRD_PARTY_NOTICES.md', 'licenses/npm-dependencies.txt', 'licenses/npm-runtime-notices.txt', 'licenses/README.md']) {
    assert.ok(rea.has(name)); assert.ok(release.has(name));
    assert.match(rea.get(name).data.toString('utf8'), /\S/);
  }
  const sourcePackage = JSON.parse(rea.get('package.json').data), published = JSON.parse(release.get('package.json').data);
  const lock = JSON.parse(release.get('package-lock.json').data);
  for (const key of ['name', 'version', 'dependencies', 'optionalDependencies', 'devDependencies']) {
    assert.deepEqual(published[key], sourcePackage[key], key);
    assert.deepEqual(lock.packages[''][key], published[key], key);
  }
  assert.equal(release.get('package-lock.json').sha256, rea.get('package-lock.json').sha256);
  assert.equal(catalog.runtime.version, '6.7.0');
  assert.equal(catalog.runtime.entry, 'scripts/rea.mjs');
  assert.equal(catalog.runtime.tarball, 'https://registry.npmjs.org/rea-agents/-/rea-agents-6.7.0.tgz');
  assert.equal(catalog.runtime.integrity, 'sha512-yhIx2ioJYYT1C/tONfYeitC6LhnKmCh+ZwRUOgYuhSc733lGhkkt73zhug9WmLgxoMdKuqIYGCoBfD4fXkOhFw==');
  assert.deepEqual(catalog.runtime.installArgs.slice(0, 4), ['ci', '--omit=dev', '--omit=optional', '--ignore-scripts']);
});

test('all supported seat plans preserve complete source trees and ninety-four adapters per root', (t) => {
  const base = synthetic(t);
  const catalog = upstream.readCatalog();
  const roots = {
    codex: path.join(base, 'codex'), claude: path.join(base, 'claude'), grok: path.join(base, 'grok'),
    deepseek: path.join(base, 'deepseek'), glm53: path.join(base, 'glm53'), gemini: path.join(base, 'gemini'),
    doubao: path.join(base, 'doubao'), workbuddy: path.join(base, 'workbuddy'), cursor: path.join(base, '.cursor'),
    mimo: path.join(base, 'mimo-profile', 'config'), kimi: path.join(base, '.kimi-code'),
  };
  fs.mkdirSync(roots.cursor, { recursive: true });
  fs.mkdirSync(roots.mimo, { recursive: true });
  fs.mkdirSync(roots.kimi, { recursive: true });
  // Even code that calculates all possible client homes is routed solely to
  // this fixture; no user's configuration root is inspected by the test.
  const overrides = {
    CODEX_HOME: roots.codex, CLAUDE_CONFIG_DIR: roots.claude, GROK_HOME: roots.grok,
    DSH_HOME: roots.deepseek, GLM_HOME: roots.glm53, ZCODE_HOME: path.join(roots.glm53, 'zcode'),
    GEMINI_HOME: roots.gemini, DOUBAO_USER_SKILLS: roots.doubao, WORKBUDDY_HOME: roots.workbuddy,
    CURSOR_HOME: roots.cursor, MIMOCODE_HOME: path.dirname(roots.mimo), KIMI_CODE_HOME: roots.kimi,
  };
  const previous = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  Object.assign(process.env, overrides);
  try {
    for (const seat of runtime.PACK_IDS) {
      const spec = runtime.plan(seat, roots[seat]);
      assert.equal(spec.upstream.skillCount, 94, seat);
      const grouped = groupWrites(spec);
      assert.equal(grouped.size, seat === 'glm53' ? 2 : 1, seat);
      for (const [root, writes] of grouped) assertAdapterTree(writes, root, catalog);
      const mcp = spec.writes.filter((item) => item.kind === 'upstream-mcp');
      if (seat === 'deepseek') assert.equal(mcp[0].file, path.join(roots[seat], 'cordis.patch.yml'));
      else if (seat === 'codex') assert.equal(mcp[0].file, path.join(roots[seat], 'config.toml'));
      else if (['cursor', 'workbuddy'].includes(seat)) assert.equal(mcp[0].file, path.join(roots[seat], 'mcp.json'));
      else if (seat === 'gemini') assert.equal(mcp[0].file, path.join(roots[seat], 'settings.json'));
      else if (seat === 'glm53') assert.equal(mcp[0].file, path.join(roots[seat], 'zcode', 'cli', 'config.json'));
      else assert.equal(mcp.length, 0, seat);
      if (seat === 'grok') assert.equal(spec.upstream.mcp.configured, false, 'unidentified Grok clients must not receive guessed Codex configuration');
    }
    const zcode = runtime.plan('glm53', path.join(base, 'zcode-profile'), { layout: 'zcode' });
    assert.equal(groupWrites(zcode).size, 1);
    assertAdapterTree(zcode.writes, zcode.home, catalog);
    assert.equal(zcode.upstream.mcp.file, path.join(zcode.home, 'cli', 'config.json'));
    assert.deepEqual(zcode.upstream.mcp.keys, ['mcp', 'servers', 'coldcoffee-rea']);
    assert.equal(zcode.upstream.mcp.entry.type, 'stdio');
    assert.equal(zcode.upstream.mcp.entry.command, 'node');
    assert.deepEqual(zcode.upstream.mcp.entry.args, [path.join(zcode.home, '.coldcoffee-upstream', 'rea-launcher.cjs'), 'mcp']);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('Windows preservation and Unix link metadata retain original names and bytes without live links', (t) => {
  const root = synthetic(t), catalog = upstream.readCatalog();
  const spec = upstream.installationWrites('codex', root);
  const files = new Map(spec.writes.filter((item) => item.kind === 'asset').map((item) => [item.file.toLowerCase(), item]));
  const manifest = JSON.parse(files.get(path.join(root, '.coldcoffee-upstream', 'manifest.json').toLowerCase()).data);
  assert.match(upstream.deploymentRelative('third_party/x?fixture', 'win32'), /^\.coldcoffee-preserved\/[a-f0-9]{64}\.bin$/);
  assert.equal(upstream.deploymentRelative('third_party/x?fixture', 'linux'), 'third_party/x?fixture');
  for (const issue of catalog.sources[0].windowsPathIssues) {
    const mapped = upstream.deploymentRelative(issue.path, 'win32');
    assert.match(mapped, /^\.coldcoffee-preserved\/[a-f0-9]{64}\.bin$/);
    const original = byPath(catalog.sources[0]).get(issue.path);
    assert.ok(original);
    if (process.platform === 'win32') {
      const preserved = manifest.preservedPaths.find((entry) => entry.path === issue.path);
      assert.ok(preserved, issue.path);
      assert.equal(preserved.deployedPath, mapped);
      assert.equal(preserved.sha256, original.sha256);
      const copy = files.get(path.join(root, '.coldcoffee-upstream', 'sources', 'rea', mapped).toLowerCase());
      assert.deepEqual(copy.data, original.data);
      assert.equal(copy.data.length, preserved.bytes);
    }
  }
  for (const source of manifest.sources) {
    const allLinks = source.symlinks.concat(source.submodules.flatMap((module) => module.symlinks));
    for (const link of allLinks) {
      const target = Buffer.from(link.targetBase64, 'base64');
      assert.equal(target.length, link.bytes);
      assert.equal(upstream.digest(target), link.sha256);
      const deployed = path.join(root, '.coldcoffee-upstream', 'sources', source.id, link.path);
      assert.equal(files.has(deployed.toLowerCase()), false, `must not materialize fixture link: ${link.path}`);
    }
  }
  assert.equal(fs.existsSync(path.join(root, '.coldcoffee-upstream')), false, 'planning must create no installation directories');
});
