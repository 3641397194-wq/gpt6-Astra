'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const PIN = require('./upstream.json');

async function freePort(preferred = 0) {
  const server = net.createServer();
  try { server.listen(preferred, '127.0.0.1'); await once(server, 'listening'); const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port; }
  catch (error) { server.close(); if (preferred) return freePort(); throw error; }
}
class MagpieEngine {
  constructor({ directory, resources, port = 3436 }) {
    this.directory = directory; this.resources = resources; this.preferredPort = port;
    this.process = null; this.starting = null; this.webKey = crypto.randomBytes(32).toString('hex');
    this.port = 0; this.webPort = 0; this.error = ''; this.logs = []; this.stopping = false;
  }
  async start() {
    if (this.starting) return this.starting;
    if (this.process && this.ready) return this.status();
    this.starting = this.boot().finally(() => { this.starting = null; }); return this.starting;
  }
  async boot() {
    const platform = `${process.platform}-${process.arch}`;
    const pin = PIN.binaries[platform];
    if (!pin) throw new Error('此平台的网关核心尚未准备');
    const binary = path.join(this.resources, platform, process.platform === 'win32' ? 'magpie.exe' : 'magpie');
    if (!fs.existsSync(binary)) throw new Error('网关核心尚未打包，请先准备固定版本资源');
    const digest = crypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex');
    if (digest !== pin.sha256) throw new Error('网关核心校验未通过，请重新准备资源');
    const home = path.join(this.directory, 'engine-home');
    const config = path.join(this.directory, 'config');
    for (const dir of [home, path.join(config, 'magpie'), path.join(home, 'AppData', 'Roaming'), path.join(home, 'AppData', 'Local')]) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    // Isolate every client path: Magpie's background catalog maintenance must
    // never rewrite real client configs. Explicit customer writes use clients.js.
    const env = { ...process.env, HOME: home, USERPROFILE: home, APPDATA: path.join(home, 'AppData', 'Roaming'), LOCALAPPDATA: path.join(home, 'AppData', 'Local'), XDG_CONFIG_HOME: config, XDG_CACHE_HOME: path.join(this.directory, 'cache'), XDG_DATA_HOME: path.join(home, '.local', 'share'), XDG_STATE_HOME: path.join(home, '.local', 'state'), MAGPIE_NO_ACCOUNTS: '1', DO_NOT_TRACK: '1', MAGPIE_WEB_KEY: this.webKey, MAGPIE_THEME: 'dark' };
    for (const key of Object.keys(env)) if (/^(CODEX_HOME|CLAUDE_CONFIG_DIR|DSH_HOME|GEMINI_CLI_HOME|KIMI_SHARE_DIR|QWEN_HOME|REASONIX_HOME|ANTE_HOME|MAGPIE_)/.test(key) && !['MAGPIE_NO_ACCOUNTS', 'MAGPIE_WEB_KEY', 'MAGPIE_THEME'].includes(key)) delete env[key];
    Object.assign(env, { CODEX_HOME: path.join(home, '.codex'), CLAUDE_CONFIG_DIR: path.join(home, '.claude'), DSH_HOME: path.join(home, '.dsh'), MAGPIE_PARTNERS: 'off' });
    let previous = {}; const settings = path.join(config, 'magpie', 'settings.json');
    if (fs.existsSync(settings)) previous = JSON.parse(fs.readFileSync(settings, 'utf8'));
    fs.writeFileSync(settings, JSON.stringify({ ...previous, lang: 'zh', theme: 'dark', noAccountDiscovery: true, noStats: true, noAutoUpdate: true, autoRestart: false, gatewayMode: 'on' }), { mode: 0o600 });
    const portFile = path.join(this.directory, 'gateway-port.json');
    let savedPort = 0;
    try { savedPort = Number(JSON.parse(fs.readFileSync(portFile, 'utf8')).port) || 0; } catch {}
    this.port = await freePort(savedPort || this.preferredPort); this.webPort = await freePort();
    this.portChanged = savedPort > 0 && this.port !== savedPort;
    env.MAGPIE_ADDR = `127.0.0.1:${this.port}`;
    this.url = `http://127.0.0.1:${this.port}`; this.webUrl = `http://127.0.0.1:${this.webPort}`;
    this.error = ''; this.ready = false; this.stopping = false;
    const child = spawn(binary, ['web', '--addr', `127.0.0.1:${this.webPort}`, '--no-open', '--gateway'], { cwd: this.directory, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    this.process = child;
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { this.logs.push(chunk.toString().replaceAll(this.webKey, '[local-control]')); if (this.logs.length > 30) this.logs.shift(); });
    child.on('error', () => { this.error = '网关核心启动失败'; });
    child.on('exit', () => { if (this.process === child) { this.process = null; this.ready = false; if (!this.stopping) this.error = '网关核心已停止，请点击重新启动'; } });
    const limit = Date.now() + 30000;
    while (Date.now() < limit) {
      if (!this.process || this.error) throw new Error(this.error || '网关启动中断');
      try { await this.api('gateway/trace'); this.ready = true; fs.writeFileSync(portFile, JSON.stringify({ port: this.port }), { mode: 0o600 }); return this.status(); } catch { await new Promise(resolve => setTimeout(resolve, 150)); }
    }
    await this.stop(); throw new Error('网关启动超时，请重试');
  }
  async api(endpoint, body) {
    if (!this.webUrl || !/^[a-z0-9/?&=_.%-]+$/i.test(endpoint)) throw new Error('网关控制请求有误');
    const response = await fetch(`${this.webUrl}/api/${endpoint}`, { method: body === undefined ? 'GET' : 'POST', headers: { cookie: `magpie_web_${this.webPort}=${this.webKey}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok) { let message = ''; try { message = (await response.json()).error || ''; } catch {} throw new Error(message || `网关操作失败（${response.status}）`); }
    if (response.status === 204) return {};
    return response.json();
  }
  status() { return { running: !!this.process && !!this.ready, version: PIN.version, port: this.port, url: this.url || '', portChanged: this.portChanged === true, error: this.error, isolated: true, accountsDiscovery: false, license: 'MIT' }; }
  async stop() {
    this.stopping = true; this.ready = false;
    const child = this.process;
    if (child) { const ended = once(child, 'exit').catch(() => {}); child.kill(); await Promise.race([ended, new Promise(resolve => setTimeout(resolve, 2500))]); this.process = null; }
  }
}
module.exports = { MagpieEngine, freePort };
