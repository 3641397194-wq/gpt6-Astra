'use strict';

const path = require('node:path');
const { fileURLToPath } = require('node:url');

function isTrustedDocument(value, entryFile) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'file:' || url.host || url.search || url.username || url.password) return false;
    const actual = path.resolve(fileURLToPath(url));
    const expected = path.resolve(entryFile);
    return process.platform === 'win32' ? actual.toLowerCase() === expected.toLowerCase() : actual === expected;
  } catch { return false; }
}

function assertTrustedSender(event, window, entryFile) {
  const contents = window && !window.isDestroyed() ? window.webContents : null;
  if (!contents || contents.isDestroyed() || event.sender !== contents ||
      !event.senderFrame || event.senderFrame !== contents.mainFrame ||
      !isTrustedDocument(event.senderFrame.url, entryFile)) {
    throw new Error('该页面未获准调用桌面接口');
  }
}

function protectWindow(window) {
  const contents = window.webContents;
  // The workbench is a fixed local document. External URLs open only through
  // the explicit, host-allowlisted shell handler in main.js.
  contents.on('will-navigate', event => event.preventDefault());
  contents.on('will-frame-navigate', event => event.preventDefault());
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

module.exports = { isTrustedDocument, assertTrustedSender, protectWindow };
