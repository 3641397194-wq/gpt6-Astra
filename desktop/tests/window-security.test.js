'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { isTrustedDocument, assertTrustedSender, protectWindow } = require('../src/lib/window-security');

const entry = path.resolve(__dirname, '../src/workbench/index.html');
const entryUrl = pathToFileURL(entry).href;

test('桌面信任范围只包含确切的本地工作台文件，可带页面锚点', () => {
  assert.equal(isTrustedDocument(entryUrl, entry), true);
  assert.equal(isTrustedDocument(`${entryUrl}#relay`, entry), true);
  for (const url of ['https://coldcoffeeai.com/', 'about:blank', 'data:text/html,fixture', `${entryUrl}?redirect=fixture`, pathToFileURL(`${entry}.other`).href]) {
    assert.equal(isTrustedDocument(url, entry), false);
  }
});

test('IPC 接受本地主窗口主 frame，拒绝子 frame、其他窗口、远程导航及销毁窗口', () => {
  const mainFrame = { url: `${entryUrl}#relay` };
  const contents = { mainFrame, isDestroyed: () => false };
  const window = { webContents: contents, isDestroyed: () => false };
  const valid = { sender: contents, senderFrame: mainFrame };
  assert.doesNotThrow(() => assertTrustedSender(valid, window, entry));
  for (const event of [
    { sender: {}, senderFrame: mainFrame },
    { sender: contents, senderFrame: { url: entryUrl } },
    { sender: contents, senderFrame: null }
  ]) assert.throws(() => assertTrustedSender(event, window, entry));
  mainFrame.url = 'https://coldcoffeeai.com/';
  assert.throws(() => assertTrustedSender(valid, window, entry));
  mainFrame.url = entryUrl;
  assert.throws(() => assertTrustedSender(valid, null, entry));
  assert.throws(() => assertTrustedSender(valid, { ...window, isDestroyed: () => true }, entry));
});

test('工作台拒绝页面导航、子 frame 导航、webview 和新窗口', () => {
  const listeners = new Map();
  let openHandler;
  protectWindow({ webContents: { on: (name, handler) => listeners.set(name, handler), setWindowOpenHandler: handler => { openHandler = handler; } } });
  for (const name of ['will-navigate', 'will-frame-navigate', 'will-attach-webview']) {
    let prevented = false;
    listeners.get(name)({ preventDefault: () => { prevented = true; } });
    assert.equal(prevented, true);
  }
  assert.deepEqual(openHandler({ url: 'https://example.test/' }), { action: 'deny' });
});
