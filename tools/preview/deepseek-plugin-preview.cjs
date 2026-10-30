'use strict';

// Launch the actual official Harness in a disposable, project-owned home.
// No customer configuration, API key, browser session or installed skill is read.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { SeatTransactions } = require('../../desktop/src/lib/seat-transactions');
const seatRuntime = require('../../desktop/src/lib/seat-runtime');
const harnessInstall = require('../../desktop/src/lib/harness-install');

const repo = path.resolve(__dirname, '../..');
const option = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const runtime = option('runtime') || process.env.COLDCOFFEE_DSH_RUNTIME;
if (!runtime || !path.isAbsolute(runtime)) throw new Error('请用 --runtime=<绝对目录> 指定独立安装的官方 @deepseek-ai/dsh 与 Node.js 24 运行时。');
const runtimeRoot = path.resolve(runtime);
const cli = path.join(runtimeRoot, 'node_modules/@deepseek-ai/dsh/lib/bin.js');
const node = path.join(runtimeRoot, process.platform === 'win32' ? 'node_modules/node/bin/node.exe' : 'node_modules/node/bin/node');
if (!fs.existsSync(cli) || !fs.existsSync(node)) throw new Error('预览运行时缺少官方 Harness 或 Node.js 24；请按 docs/DEEPSEEK-PLUGIN.md 准备独立运行目录。');

const port = Number(option('port') || 8784);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('预览端口需要在 1024–65535 之间。');
const previewRoot = path.join(repo, 'desktop/work/deepseek-plugin-preview');
const dshHome = path.join(previewRoot, 'home');
const workspace = path.join(previewRoot, 'workspace');
fs.mkdirSync(workspace, { recursive: true });
const pluginOnly = process.argv.includes('--plugin-only');
const tx = new SeatTransactions({ plan: (seat, root, options) => {
  let base;
  if (pluginOnly) {
    const original = seatRuntime.basePlan(seat, root, options);
    const plugin = harnessInstall.installationWrites(root);
    base = { ...original, writes: [...original.writes, ...plugin.writes], upstream: { harnessPlugin: plugin.summary } };
  } else base = seatRuntime.plan(seat, root, options);
  // Keep the opening visible for review. Production installs still use the
  // normal timed animation; this flag belongs only to the dedicated fixture.
  return { ...base, writes: base.writes.map(item => item.kind === 'harness-plugin'
    ? { ...item, entry: { ...item.entry, config: { ...item.entry.config, preview: true } } } : item) };
} });
tx.select(dshHome, { layout: 'deepseek-harness' });
const plan = tx.preview('deepseek');
const deployed = tx.deploy(plan.id);
const verified = tx.verify('deepseek');
if (!verified.ok) throw new Error('预览目录的完整安装校验未通过。');

// Only operating-system runtime variables reach the child. Model credentials
// and user-specific DSH overrides from the parent's environment are omitted.
const env = {};
for (const key of ['PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'COMSPEC', 'PATHEXT', 'LANG', 'LC_ALL']) {
  if (process.env[key]) env[key] = process.env[key];
}
Object.assign(env, {
  DSH_HOME: dshHome,
  DSH_AGENTS_HOME: path.join(previewRoot, 'shared-agents'),
  DSH_NO_TELEMETRY: '1',
  NO_PROXY: 'localhost,127.0.0.1,::1',
  no_proxy: 'localhost,127.0.0.1,::1',
});
// Put the independent runtime first for REA's existing `node` MCP command.
env.PATH = path.dirname(node) + path.delimiter + (env.PATH || env.Path || '');
delete env.Path;

const url = `http://127.0.0.1:${port}/`;
let browserUrl = url;
let launchUrl = url;
let bootstrapCookie = '';
const harness = spawn(node, [cli, 'web', '--host', '127.0.0.1', '--port', String(port), '--no-open'], {
  cwd: workspace, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
let windowProcess;
let finished = false;
const logs = [];
for (const [stream, label] of [[harness.stdout, 'stdout'], [harness.stderr, 'stderr']]) {
  stream.on('data', chunk => {
    const value = chunk.toString();
    const printed = value.match(/dsh web:\s+(http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/);
    if (printed && new URL(printed[1]).origin === new URL(url).origin) { browserUrl = printed[1]; launchUrl = printed[1]; }
    const visible = value.replace(/([?&]token=)[^\s&]+/g, '$1[local-session]');
    logs.push(visible); if (logs.length > 100) logs.shift();
    process[label].write(visible);
  });
}
function stop() {
  if (finished) return;
  finished = true;
  if (windowProcess && !windowProcess.killed) windowProcess.kill();
  if (!harness.killed) harness.kill();
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
harness.on('error', error => { console.error(error); stop(); process.exitCode = 1; });
harness.on('exit', code => { stop(); if (code) process.exitCode = code; });

(async () => {
  const deadline = Date.now() + 180000;
  let page = '';
  while (Date.now() < deadline && !finished) {
    try {
      const response = await fetch(browserUrl, { redirect: 'manual', headers: bootstrapCookie ? { Cookie: bootstrapCookie } : {}, signal: AbortSignal.timeout(2000) });
      if (response.headers.has('set-cookie')) bootstrapCookie = response.headers.get('set-cookie').split(';', 1)[0];
      if (response.status >= 300 && response.status < 400) { browserUrl = new URL(response.headers.get('location') || '/', url).href; continue; }
      page = await response.text();
      if (response.ok && page.includes('COLDCOFFEE_HARNESS')) break;
    } catch { /* Harness still booting. */ }
    await new Promise(resolve => setTimeout(resolve, 800));
  }
  if (!page.includes('COLDCOFFEE_HARNESS')) throw new Error('官方 Harness 启动或插件注入未完成。\n' + logs.join('').slice(-6000));
  const result = { ok: true, url, dshHome, workspace, verificationScope: pluginOnly ? 'original-word-pack-and-native-plugin' : 'full-seat-installation', officialVersion: JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'node_modules/@deepseek-ai/dsh/package.json'))).version,
    changed: deployed.changed, verifiedFiles: verified.checks.length, plugin: verified.upstream.harnessPlugin };
  fs.writeFileSync(path.join(previewRoot, 'preview-status.json'), JSON.stringify(result, null, 2) + '\n');
  // Ephemeral access created by this test Harness, never a customer credential.
  // Kept only in the ignored preview directory for the native UI check/window.
  fs.writeFileSync(path.join(previewRoot, 'preview-session.json'), JSON.stringify({ url, cookie: bootstrapCookie, launchUrl }) + '\n', { mode: 0o600 });
  console.log('\nCOLDCOFFEE_HARNESS_PREVIEW_READY ' + JSON.stringify({ url, officialVersion: result.officialVersion, verifiedFiles: result.verifiedFiles }));
  if (!process.argv.includes('--no-window')) {
    const electron = require(path.join(repo, 'desktop/node_modules/electron'));
    const electronEnv = { ...env };
    delete electronEnv.ELECTRON_RUN_AS_NODE;
    windowProcess = spawn(electron, [path.join(repo, 'desktop/scripts/harness-preview-window.cjs'), '--url=' + url, '--session=' + path.join(previewRoot, 'preview-session.json'), '--profile=' + path.join(previewRoot, 'window-profile')], {
      cwd: repo, env: electronEnv, windowsHide: true, stdio: 'inherit',
    });
    windowProcess.on('error', error => console.error(error));
    windowProcess.on('exit', stop);
  }
})().catch(error => { console.error(error); stop(); process.exitCode = 1; });
