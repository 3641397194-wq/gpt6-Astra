/**
 * Native DeepSeek Harness plugin. Uses the official Cordis services already
 * provided by the host, not a second harness or a page that impersonates one.
 * Official contracts: docs/HARNESS-PLUGIN-CONTRACT.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
export const name = 'coldcoffee-harness';
export const VERSION = '0.1.0';
export const COMMUNITY = Object.freeze({
  qq: ['1057540028', '1077074552', '618179023'],
  chat: 'https://t.me/coolcoffeeai',
  channel: 'https://t.me/chachachalkf',
});
const WORKFLOWS = Object.freeze([
  { id: 'web', name: '网站与接口检查', skill: 'cc-rs-pentest-tools' },
  { id: 'api', name: 'API 与身份权限', skill: 'cc-rs-api-security' },
  { id: 'chain', name: '渗透任务编排', skill: 'cc-rs-attack-chain' },
  { id: 'reverse', name: 'REA 逆向与样本分析', skill: 'cc-rs-reverse-engineering' },
  { id: 'audit', name: '源码审计', skill: 'cc-rs-code-audit' },
  { id: 'report', name: '证据整理与报告', skill: 'cc-rs-docs-generator' },
]);
const LIMIT = 48 * 1024;

function regular(file, maxBytes = 1024 * 1024) {
  try {
    const stat = fs.lstatSync(file);
    return stat.isFile() && !stat.isSymbolicLink() && stat.size <= maxBytes;
  } catch { return false; }
}
function readText(file, maxBytes) {
  return regular(file, maxBytes) ? fs.readFileSync(file, 'utf8') : '';
}
function readJson(file) {
  try { return JSON.parse(readText(file)); } catch { return null; }
}
function contextService(ctx, key) {
  try { return typeof ctx.get === 'function' ? ctx.get(key) : ctx[key]; } catch { return undefined; }
}
function equalToken(supplied, expected) {
  if (typeof supplied !== 'string') return false;
  const left = Buffer.from(supplied), right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
function localAddress(value = '') {
  return value === '127.0.0.1' || value.startsWith('127.') || value === '::1'
    || value === '::ffff:127.0.0.1' || value.startsWith('::ffff:127.');
}
function publicError(error) {
  // Status and errors must not disclose host paths, API credentials, or raw logs.
  return String(error?.message || '操作未完成')
    .replace(/(?:Bearer\s+|sk-)[A-Za-z0-9_./+-]+/gi, '[redacted]')
    .replace(/(?:[A-Za-z]:[\\/]|\/(?:Users|home|mnt|private|var|tmp)\/)[^\s"'<>]*/g, '[local-path]')
    .slice(0, 500);
}
function toolNames(ctx) {
  try {
    const tools = contextService(ctx, 'tools');
    return typeof tools?.schemas === 'function' ? tools.schemas().map(row => row.name).filter(Boolean) : [];
  } catch { return []; }
}
function installedSkills(home) {
  const root = path.join(home, 'skills');
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && !entry.isSymbolicLink() && regular(path.join(root, entry.name, 'SKILL.md')))
      .map(entry => entry.name).sort();
  } catch { return []; }
}
function textContent(event) {
  const blocks = event?.data?.message?.content || event?.data?.content || event?.message?.content || event?.content;
  if (typeof blocks === 'string') return blocks.slice(0, 2000);
  return Array.isArray(blocks) ? blocks.filter(block => block.type === 'text').map(block => block.text || '').join('\n').slice(0, 2000) : '';
}

/** Pure host adapter boundary, exported for bounded tests with synthetic homes. */
export function createPluginRuntime(ctx, config = {}) {
  const home = path.resolve(config.dshHome || config.home || path.join(here, '../..'));
  const upstream = path.resolve(config.upstreamRoot || path.join(home, '.coldcoffee-upstream'));
  const basePath = typeof config.basePath === 'string' && /^\/[a-zA-Z0-9_-]+$/.test(config.basePath) ? config.basePath : '/coldcoffee';
  const token = randomBytes(32).toString('hex');
  const settings = { animations: config.animations !== false };
  const tasks = [];
  const observations = [];
  let activated = false;
  let webServer;
  let disposed = false;
  let welcome = readText(path.join(here, 'welcome.md')) || readText(path.join(here, '../packs/activation-reply.md'));
  if (!welcome) welcome = `冷咖啡已激活\n\nQQ一群 ${COMMUNITY.qq[0]}\nQQ二群 ${COMMUNITY.qq[1]}\nQQ三群 ${COMMUNITY.qq[2]}\nTelegram 聊天群 ${COMMUNITY.chat}\nTelegram 频道 ${COMMUNITY.channel}`;

  function origin() {
    try {
      const value = webServer?.getOrigin();
      const parsed = new URL(value);
      return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && localAddress(parsed.hostname.replace(/^\[|\]$/g, '')) ? parsed.origin : null;
    } catch { return null; }
  }
  function runtimeStatus() {
    const names = installedSkills(home);
    const manifest = readJson(path.join(upstream, 'manifest.json'));
    let rea = { installed: false, ready: false, version: '', message: 'REA 尚未安装到本 Harness。' };
    const launcherPath = path.join(upstream, 'rea-launcher.cjs');
    if (regular(launcherPath, 2 * 1024 * 1024)) {
      try {
        const launcher = require(launcherPath);
        if (typeof launcher.statusOf === 'function') {
          const actual = launcher.statusOf(upstream);
          rea = { installed: !!actual.installed, ready: !!actual.ready, version: actual.version || '', message: publicError({ message: actual.message }) };
        }
      } catch { rea.message = 'REA 文件已找到，运行时状态检查未通过。'; }
    }
    const registered = toolNames(ctx).filter(tool => /^mcp__coldcoffee[-_]rea__/.test(tool));
    const succeeded = observations.some(item => item.ok && /^mcp__coldcoffee[-_]rea__/.test(item.name));
    return {
      ok: true,
      plugin: { loaded: true, name, version: VERSION },
      activated,
      settings: { ...settings },
      harness: { connected: true, sessionController: typeof contextService(ctx, 'sessionController')?.create === 'function', apiAvailable: !!origin() },
      skills: {
        installed: names.length > 0, total: names.length,
        rea: names.some(item => item.startsWith('cc-rea-')),
        reverse: names.includes('cc-rs-reverse-engineering'),
        pentest: names.includes('cc-rs-pentest-tools'),
        catalogVerified: false,
        catalogNote: '文件安装数；会话实际技能目录由 Harness 的 /skill 菜单和 skill 工具核验。',
        bundledTotal: Number(manifest?.skillCount) || 0,
      },
      rea: { ...rea, connected: succeeded, registered: registered.length > 0, tools: registered.length,
        status: succeeded ? 'verified' : registered.length ? 'registered' : rea.ready ? 'ready' : rea.installed ? 'needs-prepare' : 'missing' },
      community: COMMUNITY,
      workflows: WORKFLOWS.map(item => ({ ...item, available: names.includes(item.skill) })),
      tasks: tasks.slice(-30).map(item => ({ ...item, events: [...item.events] })),
      observations: observations.slice(-20),
    };
  }

  function observeTool(exec, result) {
    observations.push({ name: String(exec?.name || ''), ok: result?.isError === false, at: Date.now() });
    if (observations.length > 100) observations.shift();
    const task = tasks.find(item => item.sessionId === exec?.agent?.id);
    if (task) {
      task.events.push({ type: 'tool', name: String(exec.name), ok: result?.isError === false, at: Date.now() });
      if (task.events.length > 50) task.events.shift();
    }
  }
  function observeSession(session, event) {
    const task = tasks.find(item => item.sessionId === session?.id);
    if (!task) return;
    if (event?.type === 'turn/start') task.status = 'running';
    if (event?.type === 'turn/end') {
      const reason = event.data?.reason;
      task.status = reason?.kind === 'completed' ? 'completed' : reason?.kind === 'aborted' ? 'cancelled' : 'error';
      if (reason?.kind === 'error') task.error = publicError(reason.error);
    }
    if (event?.type === 'assistant/message') {
      const text = textContent(event);
      if (text) task.output = text;
    }
    task.updatedAt = Date.now();
  }

  async function dispatch(body) {
    if (!activated) return { status: 409, body: { ok: false, code: 'ACTIVATION_REQUIRED', message: '先输入「冷咖啡」激活插件。' } };
    const workflow = WORKFLOWS.find(item => item.id === body.workflow);
    if (!workflow || typeof body.input !== 'string' || !body.input.trim() || body.input.length > 20000) {
      return { status: 400, body: { ok: false, code: 'INVALID_TASK', message: '请选择工作流并填写任务（最多 20000 字）。' } };
    }
    if (!installedSkills(home).includes(workflow.skill)) return { status: 409, body: { ok: false, code: 'SKILL_MISSING', message: '该工作流尚未安装。请在冷咖啡工作台重新安装 DeepSeek 技能。' } };
    const controller = contextService(ctx, 'sessionController');
    if (typeof controller?.create !== 'function' || typeof controller?.prompt !== 'function') {
      return { status: 503, body: { ok: false, code: 'SESSION_API_MISSING', message: '当前 Harness 未加载会话接口；请使用官方 Web profile 启动。' } };
    }
    const task = { id: randomUUID(), workflow: workflow.id, input: body.input.trim(), status: 'creating', createdAt: Date.now(), events: [] };
    tasks.push(task);
    if (tasks.length > 100) tasks.shift();
    try {
      const session = await controller.create({});
      if (!session?.sessionId) throw new Error('Harness 未返回会话标识。');
      task.sessionId = session.sessionId;
      const requestId = randomUUID();
      const content = `/${workflow.skill}\n\n冷咖啡插件已激活。请调用当前会话中已安装的技能与工具处理以下任务；读取原始技能和相关参考，保留工具输出与证据。\n\n${task.input}`;
      const receipt = await controller.prompt({ sessionId: task.sessionId, requestId, mode: 'queue', content: [{ type: 'text', text: content }] }, AbortSignal.timeout(30000));
      if (receipt?.accepted !== true) throw new Error('Harness 未确认接收任务。');
      if (task.status === 'creating') task.status = 'accepted';
      task.accepted = true;
      task.updatedAt = Date.now();
      return { status: 202, body: { ok: true, task: { ...task } } };
    } catch (error) {
      task.status = 'error';
      task.error = publicError(error);
      return { status: 502, body: { ok: false, code: 'HARNESS_TASK_FAILED', message: task.error, task: { ...task } } };
    }
  }

  async function api(method, route, body = {}) {
    if (disposed) return { status: 503, body: { ok: false, message: '插件已卸载。' } };
    if (method === 'GET' && route === '/api/status') return { status: 200, body: runtimeStatus() };
    if (method === 'GET' && route === '/api/welcome') return { status: 200, body: { ok: true, text: welcome } };
    if (method === 'GET' && route === '/api/history') return { status: 200, body: { ok: true, tasks: tasks.map(task => ({ ...task, events: [...task.events] })) } };
    if (method === 'POST' && route === '/api/activate') {
      if (body.keyword !== '冷咖啡') return { status: 400, body: { ok: false, code: 'KEYWORD_MISMATCH', message: '启动词是「冷咖啡」。' } };
      activated = true;
      return { status: 200, body: { ...runtimeStatus(), text: welcome } };
    }
    if (method === 'POST' && route === '/api/settings') {
      if (typeof body.animations !== 'boolean') return { status: 400, body: { ok: false, message: 'animations 应为布尔值。' } };
      settings.animations = body.animations;
      return { status: 200, body: runtimeStatus() };
    }
    if (method === 'POST' && route === '/api/tasks') return dispatch(body);
    if (method === 'POST' && route === '/api/tasks/cancel') {
      const task = tasks.find(item => item.id === body.taskId);
      const controller = contextService(ctx, 'sessionController');
      if (!task?.sessionId || typeof controller?.cancel !== 'function') return { status: 404, body: { ok: false, message: '没有可停止的任务。' } };
      const receipt = await controller.cancel({ sessionId: task.sessionId });
      if (receipt?.accepted !== true) return { status: 502, body: { ok: false, message: 'Harness 尚未确认停止。' } };
      task.status = 'cancelled';
      return { status: 200, body: { ok: true, task: { ...task } } };
    }
    return { status: 404, body: { ok: false, message: '未找到插件接口。' } };
  }

  async function handler(req, res) {
    const expected = origin();
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    function respond(status, body) { res.writeHead(status, headers); res.end(JSON.stringify(body)); }
    const requestOrigin = req.headers.origin;
    if (!expected || !localAddress(req.socket?.remoteAddress || '') || req.headers.host !== new URL(expected).host
      || (requestOrigin && requestOrigin !== expected && requestOrigin !== 'null')) {
      respond(403, { ok: false, message: '插件接口仅接受本机 Harness 页面。' }); return;
    }
    if (requestOrigin === expected || requestOrigin === 'null') {
      headers['Access-Control-Allow-Origin'] = requestOrigin;
      headers.Vary = 'Origin';
    }
    if (req.method === 'OPTIONS') {
      headers['Access-Control-Allow-Headers'] = 'Content-Type, X-ColdCoffee-Session';
      headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
      res.writeHead(204, headers); res.end(); return;
    }
    if (!equalToken(req.headers['x-coldcoffee-session'], token)) { respond(403, { ok: false, code: 'SESSION_REQUIRED', message: '请从当前 Harness 页面打开冷咖啡插件。' }); return; }
    let target;
    try { target = new URL(req.url || '/', expected); } catch { respond(400, { ok: false }); return; }
    if (target.origin !== expected || !target.pathname.startsWith(`${basePath}/`)) { respond(404, { ok: false }); return; }
    let body = {};
    try {
      if (req.method === 'POST') {
        if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) { respond(415, { ok: false, message: '请求需要 JSON 正文。' }); return; }
        let size = 0;
        const chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > LIMIT) { respond(413, { ok: false, message: '任务正文超过长度限制。' }); return; }
          chunks.push(chunk);
        }
        body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (!body || typeof body !== 'object' || Array.isArray(body)) { respond(400, { ok: false }); return; }
      }
      const result = await api(req.method, target.pathname.slice(basePath.length), body);
      respond(result.status, result.body);
    } catch (error) { respond(error instanceof SyntaxError ? 400 : 500, { ok: false, message: publicError(error) }); }
  }

  function injections(table) {
    const panelStyle = readText(path.join(here, 'ui/panel.css'), 2 * 1024 * 1024);
    const themeStyle = readText(path.join(here, 'ui/theme.css'), 2 * 1024 * 1024);
    const hostStyle = readText(path.join(here, 'ui/host.css'), 2 * 1024 * 1024);
    const script = readText(path.join(here, 'ui/panel.js'), 2 * 1024 * 1024);
    const imageAsset = [
      ['ui/rem-blue.webp', 'image/webp'],
      ['ui/rem-blue.png', 'image/png'],
      ['ui/rem-blue.svg', 'image/svg+xml'],
    ].find(([relative]) => regular(path.join(here, relative), 8 * 1024 * 1024));
    const assetUrl = imageAsset ? `data:${imageAsset[1]};base64,${fs.readFileSync(path.join(here, imageAsset[0])).toString('base64')}` : '';
    const backgroundFile = path.join(here, 'ui/harness-background.png');
    const backgroundUrl = regular(backgroundFile, 8 * 1024 * 1024) ? `data:image/png;base64,${fs.readFileSync(backgroundFile).toString('base64')}` : assetUrl;
    const apiOrigin = origin();
    table.push({ kind: 'global', name: 'COLDCOFFEE_HARNESS', value: {
      basePath, apiBase: apiOrigin ? `${apiOrigin}${basePath}` : null, token,
      status: '/api/status', dispatch: '/api/tasks', welcome: '/api/welcome', history: '/api/history', settings: '/api/settings',
      version: VERSION, preview: config.preview === true, styleText: `${panelStyle}\n${themeStyle}`,
      assetUrl, backgroundUrl,
      initialStatus: runtimeStatus(),
    } });
    if (hostStyle) table.push({ kind: 'style', text: hostStyle });
    if (script) table.push({ kind: 'script', placement: 'body', text: script.replace(/<\/script/gi, '<\\/script') });
  }
  function mount(child) {
    webServer = contextService(child, 'webServer');
    if (!webServer || typeof webServer.register !== 'function') return;
    child.effect(() => webServer.register({ kind: 'prefix', path: basePath, handler }), 'coldcoffee: native local routes');
    child.on('webserver/index-inject', injections);
  }
  function dispose() { disposed = true; tasks.length = 0; observations.length = 0; }
  return { api, handler, injections, mount, observeTool, observeSession, status: runtimeStatus, dispose };
}

export function apply(ctx, config = {}) {
  const runtime = createPluginRuntime(ctx, config);
  ctx.inject(['webServer'], child => runtime.mount(child));
  ctx.on('tools/result', (exec, result) => { runtime.observeTool(exec, result); });
  ctx.on('session/event', (session, event) => { runtime.observeSession(session, event); });
  ctx.effect(() => () => runtime.dispose(), 'coldcoffee: runtime cleanup');
}
