'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const { assertTrustedSender, protectWindow } = require('../src/lib/window-security');
const src = path.resolve(__dirname, '../src');

function mainFixture() {
  const handlers = new Map(), windows = [], calls = [];
  class Window {
    constructor() {
      this.webContents = { mainFrame: { url: '' }, on() {}, setWindowOpenHandler() {}, isDestroyed: () => false };
      windows.push(this);
    }
    loadFile(file) { this.webContents.mainFrame.url = pathToFileURL(file).href; }
    once() {}
    isDestroyed() { return false; }
    show() {}
    focus() {}
  }
  class Empty {}
  const electron = {
    app: { isPackaged: false, whenReady: () => ({ then(fn) { fn(); } }), on() {} },
    BrowserWindow: Window, ipcMain: { handle(channel, handler) { handlers.set(channel, handler); } },
    dialog: {}, shell: { openPath: async () => { calls.push(['open']); return ''; } },
  };
  const beginner = {
    statusOne: (seat) => { calls.push(['status', seat]); return { seat, upstream: { verified: false } }; },
    prepareOne: async (seat, options) => { calls.push(['prepare', seat, options]); return { seat, ok: options.confirm }; },
    matchLauncher: () => ({ path: 'synthetic-app.lnk', name: 'Synthetic App' }),
  };
  const modules = {
    './lib/seat-transactions': { SeatTransactions: Empty },
    './lib/activation-gate': { ActivationGate: Empty },
    './lib/workflow': { WorkflowEngine: Empty },
    './lib/relay-adapter': { RelayAdapter: Empty },
    './lib/beginner-install': beginner,
    './lib/window-security': { assertTrustedSender, protectWindow },
    './lib/upstream-skills': { catalog: () => ({ skillCount: 94, sources: ['synthetic-rea', 'synthetic-reverse'] }) },
  };
  vm.runInNewContext(fs.readFileSync(path.join(src, 'main.js'), 'utf8'), {
    __dirname: src, process: { argv: [], env: {} }, setTimeout() {},
    require(name) {
      if (name === 'electron') return electron;
      if (name.startsWith('node:')) return require(name);
      if (modules[name]) return modules[name];
      if (name.endsWith(path.join('toolbox', 'engine.js'))) return { ToolboxEngine: Empty };
      return {};
    },
  }, { filename: 'main.js' });
  const main = windows.at(-1);
  const event = { sender: main.webContents, senderFrame: main.webContents.mainFrame };
  return { calls, handlers, event };
}

test('desktop IPC routes bundled catalog, read-only status and explicit dependency preparation through trusted local renderer', async () => {
  const f = mainFixture(), handle = f.handlers.get('coldbrew:beginner');
  assert.equal(typeof handle, 'function');
  assert.equal((await handle(f.event, 'catalog')).skillCount, 94);
  assert.deepEqual(f.calls, [], 'Opening the bundled catalog must not inspect a client profile');
  const status = await handle(f.event, 'upstream-status', { seat: 'deepseek' });
  assert.equal(status.seat, 'deepseek');
  await handle(f.event, 'upstream-prepare', { seat: 'codex', confirm: true });
  await handle(f.event, 'upstream-prepare', { seat: 'codex', confirm: 'true' });
  assert.equal(f.calls[0][0], 'status');
  assert.equal(f.calls[1][2].confirm, true);
  assert.equal(f.calls[2][2].confirm, false);
  assert.throws(() => handle({ ...f.event, sender: {} }, 'catalog'), /未获准/);
});

test('launching an installed client only opens its validated shortcut, without silently rewriting MCP configuration', async () => {
  const f = mainFixture();
  const result = await f.handlers.get('coldbrew:beginner')(f.event, 'open', { seat: 'codex', path: 'synthetic-app.lnk' });
  assert.equal(result.ok, true);
  assert.deepEqual(f.calls, [['open']]);
});

test('preload exposes dependency status and preparation without granting arbitrary process or file access', async () => {
  const calls = []; let api;
  vm.runInNewContext(fs.readFileSync(path.join(src, 'preload.js'), 'utf8'), {
    process: { platform: 'synthetic' },
    require(name) {
      assert.equal(name, 'electron');
      return { contextBridge: { exposeInMainWorld(key, value) { assert.equal(key, 'coldbrew'); api = value; } },
        ipcRenderer: { invoke: async (...args) => { calls.push(args); }, on() {}, removeListener() {} } };
    },
  }, { filename: 'preload.js' });
  await api.upstream.catalog();
  await api.upstream.status('codex');
  await api.upstream.prepare('codex', false);
  await api.upstream.prepare('codex', true);
  assert.deepEqual(calls.map(([channel, action]) => [channel, action]), [
    ['coldbrew:beginner', 'catalog'], ['coldbrew:beginner', 'upstream-status'],
    ['coldbrew:beginner', 'upstream-prepare'], ['coldbrew:beginner', 'upstream-prepare'],
  ]);
  assert.equal(calls[2][2].confirm, false);
  assert.equal(calls[3][2].confirm, true);
  assert.equal(Object.isFrozen(api.upstream), true);
});
