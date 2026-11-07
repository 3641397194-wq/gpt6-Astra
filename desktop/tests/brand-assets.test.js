'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'assets', 'brand-v6');

test('original heroine assets include production PNG, ICO and WebP variants', () => {
  const icon = fs.readFileSync(path.join(assets, 'icon.png'));
  assert.equal(icon.subarray(1, 4).toString(), 'PNG');
  assert.equal(icon.readUInt32BE(16), 1024);
  assert.equal(icon.readUInt32BE(20), 1024);
  const ico = fs.readFileSync(path.join(assets, 'icon.ico'));
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 7);
  for (const name of ['hero.webp', 'avatar.webp']) {
    const bytes = fs.readFileSync(path.join(assets, name));
    assert.equal(bytes.subarray(0, 4).toString(), 'RIFF');
    assert.equal(bytes.subarray(8, 12).toString(), 'WEBP');
  }
  const provenance = JSON.parse(fs.readFileSync(path.join(assets, 'provenance.json'), 'utf8'));
  assert.equal(provenance.model, 'gpt-image-2.6');
  assert.match(provenance.artwork, /heroine/);
  assert.equal(Object.keys(provenance.sourceSha256).length, 2);
  for (const sha of Object.values(provenance.sourceSha256)) assert.match(sha, /^[a-f0-9]{64}$/);
});

test('all desktop platform icons use the same original identity', () => {
  const pkg = require('../package.json');
  assert.equal(pkg.build.icon, 'assets/brand-v6/icon.png');
  assert.equal(pkg.build.win.icon, 'assets/brand-v6/icon.ico');
  assert.equal(pkg.build.win.signAndEditExecutable, true);
  assert.equal(pkg.build.win.signExecutable, false);
  for (const platform of ['mac', 'linux']) assert.equal(pkg.build[platform].icon, 'assets/brand-v6/icon.png');
  const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  assert.equal((main.match(/"brand-v6", "icon\.png"/g) || []).length, 2);
});
