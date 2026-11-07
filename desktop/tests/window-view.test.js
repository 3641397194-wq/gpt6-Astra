'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readZoom } = require('../src/lib/window-view');

test('missing, corrupt or unsupported display preferences keep a readable default', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'coldcoffee-display-'));
  const file = path.join(directory, 'display.json');
  t.after(() => { if (fs.existsSync(file)) fs.unlinkSync(file); fs.rmdirSync(directory); });
  assert.equal(readZoom(file), 1);
  for (const text of ['{broken', '{"zoom":0}', '{"zoom":900}', '{"zoom":"1.5"}', '{"zoom":0.01}']) {
    fs.writeFileSync(file, text); assert.equal(readZoom(file), 1);
  }
  fs.writeFileSync(file, '{"zoom":1.5}'); assert.equal(readZoom(file), 1.5);
});
