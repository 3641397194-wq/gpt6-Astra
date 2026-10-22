'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const netTools = require('./network');
const binary = require('./binary');
const { IdaConnection } = require('./ida');
const { TOOLS, validate } = require('./registry');
const { abort, digest, asUrl, redact } = require('./common');
const TERMINAL = new Set(['completed', 'partial', 'failed', 'cancelled']);
class ToolboxEngine {
  constructor({ workspace, emit = () => {} }) {
    this.workspace = path.resolve(workspace); fs.mkdirSync(this.workspace, { recursive: true });
    this.workspace = fs.realpathSync(this.workspace); this.emit = emit; this.tasks = new Map(); this.ida = new IdaConnection();
  }
  catalog() { return { version: '1.0.0', original: true, runtime: 'Node.js built-ins', workspace: this.workspace, tools: TOOLS }; }
  directory(relative) {
    const normalized = path.relative(this.workspace, path.resolve(this.workspace, relative));
    if (normalized === '..' || normalized.startsWith('..' + path.sep) || path.isAbsolute(normalized)) throw new Error('输出目录超出当前工作目录');
    let current = this.workspace;
    for (const part of normalized.split(path.sep).filter(Boolean)) {
      const next = path.join(current, part);
      try { fs.mkdirSync(next); } catch (error) { if (error.code !== 'EEXIST') throw error; }
      const real = fs.realpathSync(next), fromRoot = path.relative(this.workspace, real);
      if (fromRoot === '..' || fromRoot.startsWith('..' + path.sep) || path.isAbsolute(fromRoot) || !fs.statSync(real).isDirectory()) throw new Error('输出目录超出当前工作目录或不是目录');
      current = real;
    }
    return current;
  }
  file(value) {
    if (typeof value !== 'string' || !value) throw new Error('指定工作目录内的文件');
    const candidate = fs.realpathSync(path.resolve(this.workspace, value)); const relative = path.relative(this.workspace, candidate);
    if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('文件路径超出当前工作目录');
    const stat = fs.statSync(candidate); if (!stat.isFile() || stat.size > binary.MAX_FILE) throw new Error('选择 64 MiB 以内的普通文件');
    return candidate;
  }
  read(value) { return fs.readFileSync(this.file(value)); }
  importSample(source) {
    const stat = fs.statSync(source); if (!stat.isFile() || stat.size > binary.MAX_FILE) throw new Error('选择 64 MiB 以内的普通文件');
    const data = fs.readFileSync(source), sha256 = digest(data); const name = path.basename(source).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
    const relative = path.join('samples', `${sha256.slice(0, 16)}-${name}`); const dest = path.join(this.workspace, relative);
    this.directory('samples');
    if (!fs.existsSync(dest)) fs.writeFileSync(dest, data, { flag: 'wx' });
    else if (digest(this.read(relative)) !== sha256) throw new Error('已存在的样本内容与哈希不符');
    return { file: relative, name, bytes: data.length, sha256 };
  }
  async execute(name, args = {}, ctx = {}) {
    abort(ctx.signal); const tool = TOOLS.find(t => t.name === name);
    if (!tool) throw new Error(`未知原创工具 ${name}`); validate(args, tool.inputSchema);
    const handlers = { resolve_host: netTools.resolveHost, scan_ports: netTools.scanPorts, inspect_http: netTools.inspectHttp, crawl_site: netTools.crawlSite, find_paths: netTools.findPaths, fuzz_http: netTools.fuzzHttp, check_web: netTools.checkWeb };
    if (handlers[name]) return handlers[name](args, ctx);
    if (name === 'analyze_binary') return { file: args.file, ...binary.analyze(this.read(args.file), args) };
    if (name === 'search_bytes') return { file: args.file, ...binary.searchBytes(this.read(args.file), args.pattern) };
    if (name === 'diff_files') return binary.diffBytes(this.read(args.file), this.read(args.other));
    if (name === 'decode_text') return binary.decodeText(args);
    if (name === 'match_hash') return binary.matchHash(args);
    if (name === 'ida_connect') return this.ida.connect(args, ctx);
    if (name === 'ida_call') return this.ida.call(args, ctx);
    if (name === 'patch_bytes') {
      const { output, manifest } = binary.patchBytes(this.read(args.file), args.patches, args.expectedSha256);
      this.directory('patched');
      const relative = path.join('patched', `${crypto.randomUUID()}-${path.basename(args.file)}`);
      fs.writeFileSync(path.join(this.workspace, relative), output, { flag: 'wx' });
      const record = { ...manifest, source: args.file, file: relative, sourceUnchanged: true };
      fs.writeFileSync(path.join(this.workspace, relative + '.json'), JSON.stringify(record, null, 2), { flag: 'wx' });
      return record;
    }
    if (name === 'run_workflow') return this.workflow(args, ctx);
    throw new Error(`未实现工具 ${name}`);
  }
  async workflow(args, ctx = {}) {
    const stages = []; const run = async (name, input) => {
      ctx.emit?.({ kind: 'stage', name, state: 'running' });
      try { const result = await this.execute(name, input, ctx); stages.push({ tool: name, status: 'completed', result }); ctx.emit?.({ kind: 'stage', name, state: 'completed' }); return result; }
      catch (error) { abort(ctx.signal); stages.push({ tool: name, status: 'failed', error: error.message }); ctx.emit?.({ kind: 'stage', name, state: 'failed', error: error.message }); return null; }
    };
    if (args.mode === 'web') {
      const url = asUrl(args.url); const host = url.hostname.replace(/^\[|\]$/g, '');
      await run('resolve_host', { host });
      await run('scan_ports', { host, ports: args.ports || String(url.port || (url.protocol === 'https:' ? 443 : 80)), timeoutMs: args.timeoutMs || 800 });
      const shared = { url: url.href, ...(args.timeoutMs ? { timeoutMs: args.timeoutMs } : {}) };
      const site = await run('inspect_http', shared);
      if (site) { await run('crawl_site', { ...shared, maxPages: args.maxPages || 12 }); await run('find_paths', { ...shared, ...(args.paths ? { paths: args.paths } : {}) }); await run('check_web', { ...shared, ...(args.parameter ? { parameter: args.parameter } : {}) }); }
    } else {
      const sample = await run('analyze_binary', { file: args.file });
      if (sample && args.useIda) {
        const connection = await run('ida_connect', { ...(args.idaUrl ? { url: args.idaUrl } : {}) });
        if (connection) {
          const readTool = connection.tools.find(t => ['server_health', 'check_connection'].includes(t.name));
          if (readTool && !(readTool.inputSchema?.required || []).length) await run('ida_call', { url: connection.url, name: readTool.name, arguments: {} });
        }
      }
    }
    return { mode: args.mode, status: stages.every(s => s.status === 'completed') ? 'completed' : stages.some(s => s.status === 'completed') ? 'partial' : 'failed', stages };
  }
  start(name, args = {}, runner) {
    if ([...this.tasks.values()].filter(t => !TERMINAL.has(t.status)).length >= 4) throw new Error('已有四个任务，先等待或停止一个');
    if (!runner) { const tool = TOOLS.find(t => t.name === name); if (!tool) throw new Error('未知工具'); validate(args, tool.inputSchema); }
    while (this.tasks.size >= 100) { const oldest = [...this.tasks.values()].find(t => TERMINAL.has(t.status)); if (!oldest) break; this.tasks.delete(oldest.id); }
    const id = crypto.randomUUID(), controller = new AbortController();
    const task = { id, name, args: redact(args), status: 'queued', startedAt: new Date().toISOString(), events: [], controller, result: null };
    this.tasks.set(id, task);
    const event = entry => { const message = { taskId: id, at: new Date().toISOString(), ...redact(entry) }; task.events.push(message); if (task.events.length > 300) task.events.shift(); this.emit(message); };
    task.promise = Promise.resolve().then(async () => {
      task.status = 'running'; event({ kind: 'state', state: 'running' });
      try {
        const ctx = { signal: controller.signal, emit: event }; task.result = runner ? await runner(ctx) : await this.execute(name, args, ctx); abort(controller.signal);
        task.status = task.result?.status === 'partial' ? 'partial' : task.result?.status === 'failed' ? 'failed' : 'completed';
      } catch (error) { task.status = controller.signal.aborted ? 'cancelled' : 'failed'; task.error = error.message; }
      task.endedAt = new Date().toISOString();
      try { this.save(task); } catch (error) { task.status = 'failed'; task.error = `报告保存失败：${error.message}`; }
      event({ kind: 'state', state: task.status, error: task.error || null });
      return this.get(id);
    });
    return this.get(id);
  }
  get(id) { const task = this.tasks.get(id); if (!task) throw new Error('任务不存在'); const { controller, promise, ...view } = task; return structuredClone(view); }
  list() { return [...this.tasks.keys()].reverse().map(id => { const { result, events, ...summary } = this.get(id); return summary; }); }
  async wait(id) { const task = this.tasks.get(id); if (!task) throw new Error('任务不存在'); return task.promise; }
  cancel(id) { const task = this.tasks.get(id); if (!task) throw new Error('任务不存在'); if (!TERMINAL.has(task.status) && task.status !== 'partial') task.controller.abort(new Error('Task cancelled')); return this.get(id); }
  save(task) {
    const relative = path.join('runs', task.id); const directory = this.directory(relative);
    const { controller, promise, ...record } = task; const json = JSON.stringify(redact(record), null, 2);
    fs.writeFileSync(path.join(directory, 'result.json'), json, { flag: 'wx' });
    const markdown = `# 冷咖啡 · 原创工具运行报告\n\n- 工具：${task.name}\n- 状态：${task.status}\n- 开始：${task.startedAt}\n- 结束：${task.endedAt}\n- result.json SHA-256：${digest(json)}\n\n## 输入\n\n\`\`\`json\n${JSON.stringify(task.args, null, 2)}\n\`\`\`\n\n## 结果\n\n\`\`\`json\n${JSON.stringify(redact(task.result || { error: task.error }), null, 2)}\n\`\`\`\n`;
    fs.writeFileSync(path.join(directory, 'report.md'), markdown, { flag: 'wx' });
    task.report = { directory: relative, json: path.join(relative, 'result.json'), markdown: path.join(relative, 'report.md'), sha256: digest(json) };
  }
}
module.exports = { ToolboxEngine };
