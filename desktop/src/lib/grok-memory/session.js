'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { MemoryError } = require('./errors');

const NATIVE_SCRIPT = `
$ErrorActionPreference = 'Stop'
$data = [Console]::In.ReadToEnd() | ConvertFrom-Json
if ($data.mode -eq 'version') {
  [Console]::Out.Write((Get-Item -LiteralPath $data.path).VersionInfo.ProductVersion)
} elseif ($data.mode -eq 'dpapi') {
  Add-Type -AssemblyName System.Security
  $bytes = [Convert]::FromBase64String($data.blob)
  $plain = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  [Console]::Out.Write([Convert]::ToBase64String($plain))
  [Array]::Clear($plain, 0, $plain.Length)
} else { exit 2 }
`;

function native(file, args, input = '', signal) {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, { windowsHide: true, timeout: 15000,
      maxBuffer: 1024 * 1024, encoding: 'buffer', signal }, (error, stdout) => {
      if (error) { reject(new MemoryError(signal?.aborted ? 'CANCELLED' : 'DECRYPT')); return; }
      resolve(stdout);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

function windowsHelper(input, signal, env = process.env) {
  const powershell = path.join(env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return native(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', NATIVE_SCRIPT], JSON.stringify(input), signal);
}

function decode64(text) {
  if (typeof text !== 'string' || !text.length || text.length > 2 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) throw new MemoryError('DECRYPT');
  return Buffer.from(text, 'base64');
}

function decryptGCM(raw, key) {
  if (key.length !== 32 || raw.length <= 28) throw new MemoryError('DECRYPT');
  const cipher = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  cipher.setAuthTag(raw.subarray(-16));
  return Buffer.concat([cipher.update(raw.subarray(12, -16)), cipher.final()]);
}

function decryptCBC(raw, password) {
  const key = crypto.pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1');
  try {
    const cipher = crypto.createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, 32));
    return Buffer.concat([cipher.update(raw), cipher.final()]);
  } finally { key.fill(0); }
}

async function jsonFile(file) {
  const stat = await fs.stat(file);
  if (!stat.isFile() || stat.size > 4 * 1024 * 1024) throw new MemoryError('LOGIN_FILE');
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

function jwtExpiry(token) {
  try {
    const pieces = token.split('.');
    if (pieces.length !== 3) return null;
    const value = JSON.parse(Buffer.from(pieces[1], 'base64url').toString('utf8')).exp;
    return typeof value === 'number' && Number.isFinite(value) ? value * 1000 : null;
  } catch { return null; }
}

async function discoverApp(platform, env, home, signal) {
  const candidates = platform === 'win32' ? [
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs', 'Grok Bot', 'Grok Bot.exe'),
    env.ProgramFiles && path.join(env.ProgramFiles, 'Grok Bot', 'Grok Bot.exe'),
    env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'Grok Bot', 'Grok Bot.exe'),
  ] : ['/Applications/Grok Bot.app', path.join(home, 'Applications', 'Grok Bot.app')];
  for (const file of candidates.filter(Boolean)) {
    try {
      const stat = await fs.stat(file);
      if (platform === 'win32' ? !stat.isFile() : !stat.isDirectory()) continue;
      let version = '0.0.0';
      try {
        const raw = platform === 'win32'
          ? await windowsHelper({ mode: 'version', path: file }, signal, env)
          : await native('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', path.join(file, 'Contents', 'Info.plist')], '', signal);
        const match = raw.toString('utf8').trim().match(/^\d+\.\d+\.\d+(?:[-.][0-9A-Za-z.]+)?$/);
        if (match) version = match[0];
        raw.fill(0);
      } catch { if (signal?.aborted) throw new MemoryError('CANCELLED'); }
      return { version };
    } catch (error) { if (signal?.aborted) throw new MemoryError('CANCELLED'); }
  }
  throw new MemoryError('APP_MISSING');
}

// Invoked only by an explicit Connect action. No browser/profile enumeration.
async function loadSession({ platform = process.platform, env = process.env, home = os.homedir(), signal,
  discover = discoverApp, readJSON = jsonFile, unprotect = async (blob) => {
    const result = await windowsHelper({ mode: 'dpapi', blob: blob.toString('base64') }, signal, env);
    try { return decode64(result.toString('utf8').trim()); } finally { result.fill(0); }
  }, keychain = () => native('/usr/bin/security', ['find-generic-password', '-s', 'Grok Bot Safe Storage', '-a', 'Grok Bot Key', '-w'], '', signal), now = Date.now } = {}) {
  const checks = [];
  let key, password, tokenBuffer, machineBuffer;
  try {
    if (!['win32', 'darwin'].includes(platform)) throw new MemoryError('PLATFORM');
    const app = await discover(platform, env, home, signal);
    checks.push({ id: 'app', title: '桌面客户端', ok: true, detail: `已发现 Grok Bot ${app.version}` });
    const root = platform === 'win32' ? (env.APPDATA && path.join(env.APPDATA, 'Grok Bot')) : path.join(home, 'Library', 'Application Support', 'Grok Bot');
    if (!root) throw new MemoryError('LOGIN_FILE');
    let stored, record;
    try {
      stored = await readJSON(path.join(root, 'sand-secrets.json'));
      const accounts = JSON.parse(stored['cursor-accounts']);
      record = accounts.accounts?.[accounts.active];
      if (!record || typeof record['cursor-access-token'] !== 'string' || typeof stored['cursor-machine-id'] !== 'string') throw new Error();
    } catch { throw new MemoryError('LOGIN_FILE'); }
    checks.push({ id: 'secrets', title: '本机登录记录', ok: true, detail: '仅使用 Grok Bot 当前活跃账号，不读取账号个人资料' });
    try {
      if (platform === 'win32') {
        try {
          const state = await readJSON(path.join(root, 'Local State'));
          const encrypted = decode64(state.os_crypt?.encrypted_key);
          if (encrypted.subarray(0, 5).toString() !== 'DPAPI') throw new Error();
          key = await unprotect(encrypted.subarray(5));
        } catch { key = null; }
      } else {
        password = await keychain();
        // security appends a newline; preserve other password bytes.
        if (password.at(-1) === 10) password = password.subarray(0, -1);
        if (!password.length) throw new Error();
      }
      async function decrypt(blob) {
        const raw = decode64(blob);
        try {
          const prefixed = raw.subarray(0, 3).toString() === 'v10';
          if (platform === 'darwin') {
            if (!prefixed) throw new Error();
            return decryptCBC(raw.subarray(3), password);
          }
          if (prefixed) {
            // A corrupt GCM record must not silently fall back to legacy DPAPI.
            if (!key) throw new Error();
            return decryptGCM(raw.subarray(3), key);
          }
          return await unprotect(raw);
        } finally { raw.fill(0); }
      }
      tokenBuffer = await decrypt(record['cursor-access-token']);
      machineBuffer = await decrypt(stored['cursor-machine-id']);
    } catch { throw new MemoryError(signal?.aborted ? 'CANCELLED' : 'DECRYPT'); }
    const token = tokenBuffer.toString('utf8'), machine = machineBuffer.toString('utf8');
    if (!token || token.length > 64000 || /[\s\x00-\x1f\x7f]/.test(token) || !machine || machine.length > 2048 || /[\s\x00-\x1f\x7f]/.test(machine)) throw new MemoryError('DECRYPT');
    checks.push({ id: 'crypto', title: '系统加密', ok: true, detail: '登录材料仅留在主进程内存' });
    const expiresAt = jwtExpiry(token);
    if (expiresAt && expiresAt <= now()) throw new MemoryError('EXPIRED');
    checks.push({ id: 'login', title: '登录有效期', ok: true, detail: expiresAt ? '本机记录尚在有效期内，接下来检查服务连接' : '本机记录已读取，接下来检查服务连接' });
    if (signal?.aborted) throw new MemoryError('CANCELLED');
    return { session: { token, machine, version: app.version, platform, expiresAt }, checks };
  } catch (error) {
    if (!(error instanceof MemoryError)) error = new MemoryError('LOGIN_FILE');
    error.checks = checks;
    throw error;
  } finally {
    for (const value of [key, password, tokenBuffer, machineBuffer]) if (Buffer.isBuffer(value)) value.fill(0);
  }
}

module.exports = { loadSession, decryptGCM, decryptCBC, jwtExpiry };
