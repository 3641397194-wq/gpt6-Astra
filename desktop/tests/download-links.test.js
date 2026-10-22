'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const version = read('VERSION').trim();
const repository = 'https://github.com/3641397194-wq/gpt6-Astra';
const installers = [
  ['win', 'x64', 'exe', `ColdCoffee-Workbench-Windows-${version}-x64.exe`],
  ['mac', 'arm64', 'dmg', `ColdCoffee-Workbench-macOS-arm64-${version}.dmg`],
  ['mac', 'arm64', 'zip', `ColdCoffee-Workbench-macOS-arm64-${version}.zip`],
  ['mac', 'x64', 'dmg', `ColdCoffee-Workbench-macOS-x64-${version}.dmg`],
  ['mac', 'x64', 'zip', `ColdCoffee-Workbench-macOS-x64-${version}.zip`],
  ['linux', 'x86_64', 'AppImage', `ColdCoffee-Workbench-Linux-x86_64-${version}.AppImage`],
  ['linux', 'amd64', 'deb', `ColdCoffee-Workbench-Linux-amd64-${version}.deb`],
];
const expected = installers.map(([, , , name]) => `${repository}/releases/download/v${version}/${name}`).sort();
const python = (process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'])
  .find((command) => spawnSync(command, ['--version'], { windowsHide: true }).status === 0);

function downloadLinks(source) {
  return [...source.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)]
    .map((match) => match[1])
    .filter((url) => url.startsWith(`${repository}/releases/download/`))
    .sort();
}

test('VERSION, package metadata and all seven configured installer names agree', () => {
  const pkg = JSON.parse(read('desktop/package.json'));
  const lock = JSON.parse(read('desktop/package-lock.json'));
  assert.equal(pkg.version, version);
  assert.equal(lock.version, version);
  assert.equal(lock.packages[''].version, version);
  for (const [platform, arch, ext, name] of installers) {
    const actual = pkg.build[platform].artifactName
      .replaceAll('${version}', version).replaceAll('${arch}', arch).replaceAll('${ext}', ext);
    assert.equal(actual, name);
  }
});

for (const relative of ['README.md', 'docs/index.html', 'docs/readme-preview.html']) {
  test(`${relative} links exactly the current seven installers`, () => {
    assert.deepEqual(downloadLinks(read(relative)), expected);
  });
}

test('the English README points at the same release version', () => {
  const source = read('README_EN.md');
  assert.ok(source.includes(`[Download all platforms](${repository}/releases/tag/v${version})`));
  assert.ok(source.includes(`Release ${version}:`));
});

function fixture(t) {
  const temp = fs.realpathSync(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(temp, 'cc readme fixture '));
  t.after(() => {
    assert.equal(path.dirname(dir), temp);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(dir, 'desktop'));
  fs.mkdirSync(path.join(dir, 'docs'));
  for (const relative of ['VERSION', 'README.md', 'desktop/package.json']) {
    fs.copyFileSync(path.join(root, relative), path.join(dir, relative));
  }
  return dir;
}

function generate(dir, args = []) {
  assert.ok(python, 'Python 3 is required to test README preview generation');
  return spawnSync(python, [path.join(root, 'tools/build_readme.py'), '--root', dir, ...args], {
    cwd: dir,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15000,
    env: { ...process.env, PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' },
  });
}

function generatedBody(source) {
  const start = '<div class="markdown-body">';
  const end = '</div></article><aside class="about">';
  assert.ok(source.includes(start) && source.includes(end), 'preview wrapper changed');
  return source.slice(source.indexOf(start) + start.length, source.indexOf(end));
}

test('isolated preview generation preserves the complete canonical README and is repeatable', (t) => {
  const dir = fixture(t);
  const readmePath = path.join(dir, 'README.md');
  fs.appendFileSync(readmePath,
    '\n<p>FIXTURE: canonical README content</p>\n<a href=\'docs/fixture.png\'><img src=\'docs/fixture.png\'></a>\n');
  const original = fs.readFileSync(readmePath);
  const canonical = original.toString('utf8').replace(/\r\n/g, '\n');
  const result = generate(dir);
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const first = new Map();
  for (const [relative, prefix] of [['docs/readme-preview.html', '/docs/'], ['docs/index.html', '']]) {
    const page = fs.readFileSync(path.join(dir, relative), 'utf8');
    first.set(relative, page);
    const rebased = canonical.replace(/(\b(?:src|href)\s*=\s*)(["'])docs\//g,
      (_, attribute, quote) => attribute + quote + prefix);
    assert.equal(generatedBody(page), rebased);
    assert.deepEqual(downloadLinks(page), expected);
    for (const preserved of ['免责声明 · Disclaimer', 'https://t.me/chachachachalkf',
      'https://t.me/chachachalkf', '1057540028', '1077074552', '618179023',
      '<td><code translate="no">WorkBuddy</code></td>', '<td><code translate="no">Cursor</code></td>']) {
      assert.ok(page.includes(preserved), `${relative}: lost ${preserved}`);
    }
    assert.ok(page.includes(`<h3>当前预览</h3><p>${version}<br>`));
  }
  assert.ok(first.get('docs/readme-preview.html').includes('href="/workbench/"'));
  assert.ok(first.get('docs/index.html').includes('href="#上手使用"'));
  assert.ok(!first.get('docs/index.html').includes('href="/workbench/"'));
  for (const args of [[], ['--check']]) {
    const repeated = generate(dir, args);
    assert.equal(repeated.status, 0, repeated.stderr || repeated.error?.message);
    for (const [relative, content] of first) {
      assert.equal(fs.readFileSync(path.join(dir, relative), 'utf8'), content);
    }
  }
  assert.deepEqual(fs.readFileSync(readmePath), original, 'the generator edited README.md');
});

for (const kind of ['version mismatch', 'stale installer', 'duplicate installer']) {
  test(`generation validates ${kind} before touching existing previews`, (t) => {
    const dir = fixture(t);
    const readmePath = path.join(dir, 'README.md');
    if (kind === 'version mismatch') fs.writeFileSync(path.join(dir, 'VERSION'), '0.0.0-preview.1\n');
    if (kind === 'stale installer') {
      fs.writeFileSync(readmePath, fs.readFileSync(readmePath, 'utf8')
        .replace(expected[0], expected[0].replace(`/v${version}/`, '/v0.0.0/')));
    }
    if (kind === 'duplicate installer') fs.appendFileSync(readmePath, `<a href="${expected[0]}">Duplicate</a>`);
    const original = fs.readFileSync(readmePath);
    for (const name of ['index.html', 'readme-preview.html']) fs.writeFileSync(path.join(dir, 'docs', name), 'UNCHANGED');
    const result = generate(dir);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, kind === 'version mismatch' ? /version disagree/ : /installer links do not match/);
    for (const name of ['index.html', 'readme-preview.html']) {
      assert.equal(fs.readFileSync(path.join(dir, 'docs', name), 'utf8'), 'UNCHANGED');
    }
    assert.deepEqual(fs.readFileSync(readmePath), original);
  });
}
