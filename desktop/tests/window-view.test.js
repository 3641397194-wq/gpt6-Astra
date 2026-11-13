'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { readZoom, attachWindowView, ZOOM_STEPS } = require('../src/lib/window-view');

function fixture(t) {
  const parent = fs.realpathSync(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(parent, 'coldcoffee-display-state-'));
  t.after(() => {
    assert.equal(path.dirname(directory), parent);
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const contents = new EventEmitter(), window = new EventEmitter(), events = [];
  let nativeZoom = 1, failNative = false;
  Object.assign(contents, {
    isDestroyed: () => false,
    send: (channel, value) => events.push({ channel, value }),
    setZoomFactor: value => { if (failNative) throw new Error('fixture zoom unavailable'); nativeZoom = value; },
    setVisualZoomLevelLimits: () => Promise.resolve(),
  });
  Object.assign(window, { webContents: contents, isDestroyed: () => false, isMaximized: () => false });
  const file = path.join(directory, 'display.json');
  return { directory, file, window, contents, events, native: () => nativeZoom, failNative: value => { failNative = value; } };
}

test('unwritable preferences preserve live zoom, notify IPC and recover without restarting', t => {
  const f = fixture(t);
  fs.mkdirSync(f.file); // A deterministic rename failure on all three platforms.
  const view = attachWindowView(f.window, f.file);
  const failed = view.execute('in');
  assert.equal(failed.percent, 110);
  assert.equal(f.native(), 1.1);
  assert.equal(failed.preferenceSaved, false);
  assert.match(failed.preferenceError, /缩放已生效/);
  assert.ok(!failed.preferenceError.includes(f.directory));
  assert.equal(f.events.at(-1).value.percent, 110);
  assert.equal(f.events.at(-1).value.preferenceSaved, false);
  assert.deepEqual(fs.readdirSync(f.directory), ['display.json'], 'failed temporary file is cleaned up');
  assert.ok(fs.statSync(f.file).isDirectory(), 'the failing destination remains untouched');
  fs.rmdirSync(f.file);
  const recovered = view.execute('out');
  assert.equal(recovered.preferenceSaved, true);
  assert.equal(recovered.preferenceError, '');
  assert.equal(readZoom(f.file), 1);
  assert.equal(f.events.at(-1).value.preferenceSaved, true);
});

test('native zoom shortcuts stay functional when the preferences directory is blocked', t => {
  const f = fixture(t), blocker = path.join(f.directory, 'blocked-parent');
  fs.writeFileSync(blocker, 'fixture');
  const view = attachWindowView(f.window, path.join(blocker, 'display.json'));
  let prevented = 0;
  const press = key => f.contents.emit('before-input-event', { preventDefault: () => { prevented++; } }, { type: 'keyDown', control: true, key });
  assert.doesNotThrow(() => press('+'));
  assert.equal(view.status().percent, 110);
  assert.equal(view.status().preferenceSaved, false);
  assert.doesNotThrow(() => press('0'));
  assert.equal(view.status().percent, 100);
  assert.equal(prevented, 2);
  assert.equal(fs.readFileSync(blocker, 'utf8'), 'fixture');
});

test('reset retries an unsaved default zoom without requiring a different zoom level', t => {
  const f = fixture(t);
  fs.mkdirSync(f.file);
  const view = attachWindowView(f.window, f.file);
  view.execute('in');
  view.execute('reset');
  assert.equal(view.status().percent, 100);
  assert.equal(view.status().preferenceSaved, false);
  fs.rmdirSync(f.file);
  const recovered = view.execute('reset');
  assert.equal(recovered.percent, 100);
  assert.equal(recovered.preferenceSaved, true);
  assert.equal(readZoom(f.file), 1);
});

test('zoom clamps at the documented limits and survives document reload', t => {
  const f = fixture(t), view = attachWindowView(f.window, f.file);
  for (let i = 0; i < 20; i++) view.execute('in');
  assert.equal(view.status().zoom, ZOOM_STEPS.at(-1));
  assert.equal(view.status().max, true);
  for (let i = 0; i < 20; i++) view.execute('out');
  assert.equal(view.status().zoom, ZOOM_STEPS[0]);
  assert.equal(view.status().min, true);
  f.contents.emit('did-finish-load');
  assert.equal(f.native(), 0.8);
  assert.equal(readZoom(f.file), 0.8);
  assert.throws(() => view.execute('unknown'), /未知显示操作/);
});

test('a native zoom failure does not move the stored or reported setting', t => {
  const f = fixture(t);
  fs.writeFileSync(f.file, '{"zoom":1}');
  const view = attachWindowView(f.window, f.file);
  f.failNative(true);
  assert.throws(() => view.execute('in'), /fixture zoom unavailable/);
  assert.equal(view.status().zoom, 1);
  assert.equal(f.native(), 1);
  assert.equal(readZoom(f.file), 1);
});

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
