'use strict';

// A transport fixture, not the official Desktop application. The sandboxed
// preload and main process share this one runner; no renderer receives Node.
if (process.type === 'renderer') {
  const { contextBridge, ipcRenderer } = require('electron');
  contextBridge.exposeInMainWorld('dshDesktopBoot', {
    ready: () => ipcRenderer.invoke('coldcoffee-transport-fixture:boot'),
  });
} else {
  const fs = require('node:fs');
  const path = require('node:path');
  const { app, BrowserWindow, protocol, ipcMain, session } = require('electron');
  const argument = process.argv.find(value => value.startsWith('--fixture-config='));
  if (!argument) throw new Error('The isolated transport fixture configuration is required.');
  const config = JSON.parse(fs.readFileSync(argument.slice('--fixture-config='.length), 'utf8'));
  app.setPath('userData', path.join(config.profile, 'electron'));
  app.setPath('sessionData', path.join(config.profile, 'session'));
  protocol.registerSchemesAsPrivileged([{
    scheme: 'dsh-app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  }]);

  const records = { proxyRequests: [], blockedExternal: [], rendererErrors: [] };
  global.__COLDCOFFEE_TRANSPORT_FIXTURE__ = { records, url: config.url };
  const withheld = ['set-cookie', 'content-encoding', 'content-length', 'transfer-encoding', 'connection', 'keep-alive', 'te', 'trailer', 'upgrade', 'proxy-authenticate', 'proxy-authorization'];

  // Matches the official forwardWebRequest contract at 687f282e and ce7073d:
  // owned dsh-app origin, same path/query, shell-owned cookie, stripped carrier
  // headers. The fixture host accepts only its own disposable cookie.
  async function forward(request) {
    const source = new URL(request.url);
    const sourceOrigin = request.headers.get('origin');
    if (sourceOrigin !== null && sourceOrigin !== 'dsh-app://app') return new Response(null, { status: 403 });
    const target = new URL(config.origin);
    target.pathname = source.pathname;
    target.search = source.search;
    const headers = new Headers(request.headers);
    for (const name of ['host', 'origin', 'cookie', 'sec-fetch-site']) headers.delete(name);
    headers.set('cookie', config.cookie);
    const response = await fetch(target, {
      method: request.method, headers, body: request.body,
      signal: request.signal, duplex: 'half', redirect: 'manual',
    });
    const outgoing = new Headers(response.headers);
    for (const name of withheld) outgoing.delete(name);
    records.proxyRequests.push({ path: source.pathname, method: request.method, status: response.status });
    return new Response(response.body, { status: response.status, headers: outgoing });
  }

  app.whenReady().then(() => {
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      const target = new URL(details.url);
      const allowed = ['dsh-app:', 'file:', 'data:', 'blob:', 'about:'].includes(target.protocol)
        || (config.origin && target.origin === config.origin);
      if (!allowed) records.blockedExternal.push({ origin: target.origin });
      callback({ cancel: !allowed });
    });
    protocol.handle('dsh-app', request => {
      const target = new URL(request.url);
      if (target.hostname !== 'app') return new Response(null, { status: 404 });
      if (target.pathname === '/') return new Response(config.html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      return forward(request);
    });
    // macOS may clamp offscreen bounds to a display. Assertions use DOM and
    // protocol events, not screen coordinates or screenshot availability;
    // showInactive and disabled throttling keep the test independent of focus.
    const window = new BrowserWindow({
      show: false, skipTaskbar: true, x: -20000, y: -20000,
      width: 1440, height: 1080,
      webPreferences: {
        preload: config.mode === 'desktop' ? __filename : undefined,
        nodeIntegration: false, contextIsolation: true, sandbox: true,
        webSecurity: true, backgroundThrottling: false,
      },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('render-process-gone', (_event, detail) => records.rendererErrors.push(detail.reason));
    ipcMain.handle('coldcoffee-transport-fixture:boot', event => {
      const caller = new URL(event.senderFrame.url);
      if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame
        || caller.protocol !== 'dsh-app:' || caller.host !== 'app') throw new Error('Unowned fixture boot caller.');
      return { injections: config.injections, streamBaseUrl: config.origin };
    });
    void window.loadURL('about:blank');
    window.showInactive();
  }).catch(error => { console.error(error.message); app.exit(1); });
  app.on('window-all-closed', () => app.quit());
}
