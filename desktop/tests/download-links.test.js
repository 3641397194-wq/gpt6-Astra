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
const mobileVersion = JSON.parse(read('mobile/package.json')).version;
const mobileTag = mobileVersion === version ? `v${mobileVersion}` : `android-v${mobileVersion}`;
const IOS_VERSION = read('mobile-ios/VERSION').trim();
const iosTag = `ios-v${IOS_VERSION}`;
const repository = 'https://github.com/3641397194-wq/gpt6-Astra';
const assetUrl = (tagVersion, name) => `${repository}/releases/download/v${tagVersion}/${name}`;
const installers = [
  ['win', 'x64', 'exe', `ColdCoffee-Workbench-Windows-${version}-x64.exe`],
  ['mac', 'arm64', 'dmg', `ColdCoffee-Workbench-macOS-arm64-${version}.dmg`],
  ['mac', 'arm64', 'zip', `ColdCoffee-Workbench-macOS-arm64-${version}.zip`],
  ['mac', 'x64', 'dmg', `ColdCoffee-Workbench-macOS-x64-${version}.dmg`],
  ['mac', 'x64', 'zip', `ColdCoffee-Workbench-macOS-x64-${version}.zip`],
  ['linux', 'x86_64', 'AppImage', `ColdCoffee-Workbench-Linux-x86_64-${version}.AppImage`],
  ['linux', 'amd64', 'deb', `ColdCoffee-Workbench-Linux-amd64-${version}.deb`],
];
const mobileAssets = [
  `ColdCoffee-Mobile-Android-${mobileVersion}.apk`,
  `ColdCoffee-Mobile-Source-${mobileVersion}.zip`,
];
const iosDevelopmentAssets = [
  `ColdCoffee-iOS-Source-${IOS_VERSION}.zip`,
  `ColdCoffee-iOS-Unsigned-${IOS_VERSION}.zip`,
  'SHA256SUMS-iOS.txt',
];
const desktopUrls = installers.map(([, , , name]) => assetUrl(version, name));
const mobileUrls = mobileAssets.map((name) => `${repository}/releases/download/${mobileTag}/${name}`);
const iosUrls = iosDevelopmentAssets.map((name) => `${repository}/releases/download/${iosTag}/${name}`);
const expected = [...desktopUrls, ...mobileUrls, ...iosUrls].sort();
const python = (process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python'])
  .find((command) => spawnSync(command, ['--version'], { windowsHide: true }).status === 0);

function downloadLinks(source, pattern = /\bhref\s*=\s*["']([^"']+)["']/gi) {
  return [...source.matchAll(pattern)]
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

test('the independently versioned mobile metadata and Android version agree', () => {
  const pkg = JSON.parse(read('mobile/package.json'));
  const lock = JSON.parse(read('mobile/package-lock.json'));
  assert.equal(pkg.version, mobileVersion);
  assert.equal(lock.version, mobileVersion);
  assert.equal(lock.packages[''].version, mobileVersion);
  assert.ok(read('mobile/android/app/build.gradle').includes(`versionName '${mobileVersion}'`));
  assert.ok(read('mobile/src/config.js').includes(`VERSION = '${mobileVersion}'`));
  assert.equal(mobileAssets.length, 2, 'APK and corresponding GPL source are published together');
});

test('iOS development links include source, unsigned app, and checksums on the pinned release', () => {
  const links = downloadLinks(read('README.md'));
  for (const url of iosUrls) assert.ok(links.includes(url), `Missing ${url}`);
});

for (const relative of ['README.md', 'docs/index.html', 'docs/readme-preview.html']) {
  test(`${relative} links exactly the seven desktop, two Android, and three iOS development assets`, () => {
    assert.deepEqual(downloadLinks(read(relative)), expected);
  });
}

test('the English README points at the same split desktop/Android and iOS releases', () => {
  const source = read('README_EN.md');
  assert.ok(source.includes(`[Desktop release](${repository}/releases/tag/v${version})`));
  assert.ok(source.includes(`[iOS development release](${repository}/releases/tag/${iosTag})`));
  assert.deepEqual(downloadLinks(source, /\]\(([^()]+)\)/g), expected);
});

function fixture(t) {
  const temp = fs.realpathSync(os.tmpdir());
  const dir = fs.mkdtempSync(path.join(temp, 'cc readme fixture '));
  t.after(() => {
    assert.equal(path.dirname(dir), temp);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(dir, 'desktop'));
  fs.mkdirSync(path.join(dir, 'mobile'));
  fs.mkdirSync(path.join(dir, 'mobile-ios'));
  fs.mkdirSync(path.join(dir, 'docs'));
  for (const relative of ['VERSION', 'README.md', 'desktop/package.json', 'mobile/package.json', 'mobile-ios/VERSION']) {
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
    for (const preserved of ['免责声明 · Disclaimer', 'https://t.me/coolcoffeeai',
      'https://t.me/chachachalkf', '1057540028', '1077074552', '618179023', '1131239659',
      '<td><code translate="no">WorkBuddy</code></td>', '<td><code translate="no">Cursor</code></td>']) {
      assert.ok(page.includes(preserved), `${relative}: lost ${preserved}`);
    }
    assert.ok(page.includes(`<h3>当前预览</h3><p>桌面：${version}<br>Android：${mobileVersion}<br>`));
    assert.ok(page.includes(`iOS 开发附件：${IOS_VERSION}<br>`));
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

const missingAsset = {
  'missing mobile APK': mobileUrls[0],
  'missing mobile source': mobileUrls[1],
  'missing iOS source': iosUrls[0],
  'missing iOS unsigned app': iosUrls[1],
  'missing iOS checksums': iosUrls[2],
};
for (const kind of ['version mismatch', 'mobile version mismatch', 'iOS version mismatch', 'stale installer', 'duplicate installer', ...Object.keys(missingAsset)]) {
  test(`generation validates ${kind} before touching existing previews`, (t) => {
    const dir = fixture(t);
    const readmePath = path.join(dir, 'README.md');
    if (kind === 'version mismatch') fs.writeFileSync(path.join(dir, 'VERSION'), '0.0.0-preview.1\n');
    if (kind === 'iOS version mismatch') fs.writeFileSync(path.join(dir, 'mobile-ios/VERSION'), '0.0.0-preview.1\n');
    if (kind === 'mobile version mismatch') {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'mobile/package.json'), 'utf8'));
      pkg.version = '0.0.0-preview.1';
      fs.writeFileSync(path.join(dir, 'mobile/package.json'), JSON.stringify(pkg));
    }
    if (kind === 'duplicate installer') fs.appendFileSync(readmePath, `<a href="${desktopUrls[0]}">Duplicate</a>`);
    if (kind === 'stale installer' || missingAsset[kind]) {
      const url = missingAsset[kind] || desktopUrls[0];
      const replacement = missingAsset[kind] ? '#removed-by-fixture' : url.replace(`/v${version}/`, '/v0.0.0/');
      const source = fs.readFileSync(readmePath, 'utf8');
      assert.ok(downloadLinks(source).includes(url), `Fixture did not contain ${url}`);
      fs.writeFileSync(readmePath, source.replace(url, replacement));
    }
    const original = fs.readFileSync(readmePath);
    for (const name of ['index.html', 'readme-preview.html']) fs.writeFileSync(path.join(dir, 'docs', name), 'UNCHANGED');
    const result = generate(dir);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, kind === 'version mismatch' ? /version disagree/ : /release asset links do not match/);
    for (const name of ['index.html', 'readme-preview.html']) {
      assert.equal(fs.readFileSync(path.join(dir, 'docs', name), 'utf8'), 'UNCHANGED');
    }
    assert.deepEqual(fs.readFileSync(readmePath), original);
  });
}
