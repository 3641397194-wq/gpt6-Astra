'use strict';
const { app, BrowserWindow, shell, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const option = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const source = new URL(option('url') || 'http://127.0.0.1:8784/');
if (source.protocol !== 'http:' || source.hostname !== '127.0.0.1' || !source.port || source.username || source.password || source.pathname !== '/') throw new Error('预览窗口只接收本地 Harness 首页。');
const profile = option('profile');
if (!profile || !path.isAbsolute(profile)) throw new Error('预览窗口需要独立的本地资料目录。');
app.setPath('userData', path.resolve(profile));
const external = value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && ['coldcoffeeai.com', 'www.coldcoffeeai.com', 't.me'].includes(url.hostname);
  } catch { return false; }
};
app.whenReady().then(async () => {
  const sessionFile = option('session');
  if (sessionFile) {
    const access = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    if (access.url !== source.href || !access.cookie || /[\r\n]/.test(access.cookie)) throw new Error('预览会话与本地 Harness 地址不匹配。');
    const split = access.cookie.indexOf('=');
    if (split <= 0) throw new Error('预览会话格式错误。');
    await session.defaultSession.cookies.set({ url: source.origin, name: access.cookie.slice(0, split), value: access.cookie.slice(split + 1), httpOnly: true, sameSite: 'strict' });
  }
  const win = new BrowserWindow({ width: 1440, height: 940, minWidth: 960, minHeight: 680, show: false,
    title: '冷咖啡 · DeepSeek Harness 插件预览', backgroundColor: '#eaf5ff', autoHideMenuBar: true,
    icon: path.resolve(__dirname, '../assets/icon-v4.png'),
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false },
  });
  win.webContents.on('will-navigate', (event, value) => {
    if (new URL(value).origin === source.origin) return;
    event.preventDefault();
    if (external(value)) shell.openExternal(value);
  });
  win.webContents.on('will-attach-webview', event => event.preventDefault());
  win.on('page-title-updated', event => event.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (external(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.loadURL(source.href);
  // Display without taking over the user's current keyboard focus.
  win.once('ready-to-show', () => win.showInactive());
});
app.on('window-all-closed', () => app.quit());
