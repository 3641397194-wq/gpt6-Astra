'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const asar = require('@electron/asar');
const root = path.resolve(__dirname, '..');
const buildDirectory = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, 'dist/brand-v6-preview');
const unpacked = path.join(buildDirectory, 'win-unpacked');
const archive = path.join(unpacked, 'resources/app.asar');
const files = asar.listPackage(archive).map(file => file.replace(/^[\\/]+/, '').replace(/\\/g, '/'));
const report = { ok: false, checkedEntries: files.length, artwork: [], sensitivePaths: [], credentialPatternFiles: [], checks: [] };
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const extract = file => asar.extractFile(archive, file.split('/').join(path.sep));
for (const name of ['hero.webp', 'avatar.webp', 'icon.png', 'icon.ico', 'provenance.json']) {
  const relative = `assets/brand-v6/${name}`;
  const packed = extract(relative);
  assert.equal(sha(packed), sha(fs.readFileSync(path.join(root, relative))), relative);
  report.artwork.push({ file: relative, sha256: sha(packed), bytes: packed.length });
}
for (const file of ['src/workbench/brand-refresh.css', 'src/workbench/visual-gateway.css', 'src/workbench/visual-gateway.js', 'src/workbench/routing-panel.js', 'src/workbench/routing-panel.css', 'src/shared/routing-view.js', 'src/lib/visual-gateway/trace-view.js', 'src/lib/visual-gateway/controller.js', 'src/lib/visual-gateway/engine.js', 'src/lib/visual-gateway/vault.js', 'src/lib/visual-gateway/config-store.js', 'src/lib/window-view.js', 'src/workbench/display-controls.js', 'src/workbench/display-controls.css', 'src/workbench/index.html', 'src/splash/index.html', 'src/splash/splash.css', 'src/main.js']) {
  assert.equal(sha(extract(file)), sha(fs.readFileSync(path.join(root, file))), file);
}
const privatePath = /(?:^|\/)(?:work|\.git|ImageProvider|keys)(?:\/|$)|(?:^|\/)(?:\.env(?:\..*)?|auth\.json|credentials\.json|credential\.dpapi|preview-session\.json)$|\.(?:secret|pem|p12|pfx|dmp)$/i;
const patterns = [/\bsk-[A-Za-z0-9_-]{30,}/, /\bghp_[A-Za-z0-9]{30,}/, /\bgithub_pat_[A-Za-z0-9_]{40,}/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
for (const file of files) {
  if (privatePath.test(file)) report.sensitivePaths.push(file);
  if (!/\.(?:js|cjs|json|html|css|md|txt)$/i.test(file)) continue;
  const text = extract(file).toString('utf8');
  if (patterns.some(pattern => pattern.test(text))) report.credentialPatternFiles.push(file);
}
assert.deepEqual(report.sensitivePaths, []);
assert.deepEqual(report.credentialPatternFiles, []);
const spec = require('../src/lib/visual-gateway/upstream.json');
for (const file of ['assets/route-ragdoll/atlas.png', 'assets/route-ragdoll/provenance.json', 'src/workbench/route-courier.js', 'src/workbench/route-courier.css']) {
  assert.equal(sha(extract(file)), sha(fs.readFileSync(path.join(root, file))), file);
}
assert.ok(fs.existsSync(path.join(unpacked, 'resources/magpie/LICENSE')));
assert.ok(fs.existsSync(path.join(unpacked, 'resources/magpie/THIRD_PARTY_NOTICES')));
for (const name of ['LICENSE', 'THIRD_PARTY_NOTICES.md', 'OPEN_SOURCE_NOTICES.txt']) {
  assert.equal(sha(fs.readFileSync(path.join(unpacked, 'resources/legal', name))), sha(fs.readFileSync(path.join(root, 'resources/legal', name))), `packaged legal/${name}`);
}
const legalText = fs.readFileSync(path.join(unpacked, 'resources/legal/OPEN_SOURCE_NOTICES.txt'), 'utf8');
assert.match(legalText, /GNU GENERAL PUBLIC LICENSE/);
assert.match(legalText, /Copyright \(c\) 2026 yetone/);
assert.ok(fs.existsSync(path.join(unpacked, 'LICENSE.electron.txt')));
assert.ok(fs.existsSync(path.join(unpacked, 'LICENSES.chromium.html')));
report.checks.push('root license, third-party notices, complete original license texts and Electron/Chromium notices retained in final distribution');
report.checks.push('final archive artwork and all edited UI assets match the tested sources');
report.checks.push('no preview directory, provider credential store, runtime key files or common credential patterns found in app archive');
report.checks.push(`Magpie fixed version metadata retained: ${spec.version}`);
const executable = path.join(buildDirectory, fs.readdirSync(buildDirectory).find(file => file.endsWith('.exe')));
report.portable = { file: path.basename(executable), bytes: fs.statSync(executable).size, sha256: sha(fs.readFileSync(executable)) };
report.ok = true;
const output = path.join(root, 'work', `${path.basename(buildDirectory)}-package-report.json`);
fs.writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
