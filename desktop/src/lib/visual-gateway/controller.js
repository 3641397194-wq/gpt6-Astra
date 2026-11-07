'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { KeyVault } = require('./vault');
const { CredentialBridge, baseUrl } = require('./bridge');
const { MagpieEngine } = require('./engine');
const { ClientConnector } = require('./clients');
const { projector, totalsView, groupRevision } = require('./trace-view');
const PIN = require('./upstream.json');

class VisualGateway {
  constructor({ directory, resources, storage, fetchImpl = fetch, home, env, emit = () => {}, port }) {
    this.directory = directory; this.emit = emit; this.fetchImpl = fetchImpl; this.providers = []; this.busy = false;
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.configFile = path.join(directory, 'relays.json');
    if (fs.existsSync(this.configFile)) this.providers = JSON.parse(fs.readFileSync(this.configFile, 'utf8')).providers || [];
    this.vault = new KeyVault(path.join(directory, 'keys'), storage);
    this.bridge = new CredentialBridge({ vault: this.vault, providers: () => this.providers, fetchImpl });
    this.engine = new MagpieEngine({ directory, resources, port });
    this.clients = new ClientConnector({ directory: path.join(directory, 'backups'), engine: this.engine, home, env });
    this.traceSalt = require('node:crypto').randomBytes(32); this.catalog = null; this.catalogTime = 0;
  }
  async start() {
    if (this.starting) return this.starting;
    if (this.engine.status().running) return this.status();
    this.starting = (async () => {
      await this.bridge.start(); await this.engine.start();
      for (const provider of this.providers) if (provider.demo || this.vault.has(provider.id)) await this.syncProvider(provider);
      return this.status();
    })().catch(async error => { await this.engine.stop(); await this.bridge.stop(); throw error; }).finally(() => { this.starting = null; });
    return this.starting;
  }
  persist() { fs.writeFileSync(this.configFile + '.tmp', JSON.stringify({ version: 1, providers: this.providers.filter(p => !p.demo) }), { mode: 0o600 }); fs.renameSync(this.configFile + '.tmp', this.configFile); }
  status() {
    return { engine: this.engine.status(), encryption: this.vault.persistent(), busy: this.busy,
      providers: this.providers.filter(p => !p.demo).map(p => ({ id: p.id, name: p.name, baseUrl: p.baseUrl, wireApi: p.wireApi, models: p.models, hasKey: this.vault.has(p.id), remembered: p.remembered === true })),
      attribution: { name: PIN.name, version: PIN.version, license: PIN.license, source: PIN.source },
    };
  }
  async syncProvider(provider) {
    this.catalogTime = 0;
    const endpoint = `${this.bridge.url}/${provider.id}/v1`;
    const protocol = provider.wireApi || 'auto';
    return this.engine.api('provider/save', { id: provider.id, name: provider.name, key: this.bridge.token,
      chat: protocol === 'responses' ? '' : endpoint, responses: protocol === 'chat' ? '' : endpoint,
      baseAPI: protocol === 'responses' ? 'responses' : 'chat', models: provider.models, unlisted: provider.demo === true,
      ...(provider.demo ? { contexts: { 'visual-demo': 32768 } } : {}),
    });
  }
  async configure(input) {
    if (this.busy) throw new Error('请等待当前请求结束后再更新中转');
    const id = input.id || 'coldcoffee';
    this.vault.file(id);
    if (id === 'local-demo') throw new Error('该标识用于本机演示');
    const old = this.providers.find(p => p.id === id);
    const key = String(input.key || '') || this.vault.get(id);
    if (!key || /[\r\n]/.test(key)) throw new Error('请先填入自己的 API Key');
    const base = baseUrl(String(input.baseUrl || 'https://coldcoffeeai.com/v1'));
    let decodedBase = base;
    try { decodedBase = decodeURIComponent(base); } catch {}
    if (base.includes(key) || decodedBase.includes(key)) throw new Error('API Key 请填写在密钥栏，API 地址只保留服务路径');
    const response = await this.fetchImpl(`${base}/models`, { headers: { authorization: `Bearer ${key}` }, redirect: 'error', signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw new Error(`中转验证未通过（HTTP ${response.status}），请检查 Key、余额与 API 地址`);
    let data; try { data = await response.json(); } catch { throw new Error('模型接口返回格式有误，请核对 API 地址'); }
    const list = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : [];
    const models = [...new Set(list.map(m => typeof m === 'string' ? m : m?.id).filter(m => typeof m === 'string' && m.length < 300 && !/[\s\x00-\x1f]/.test(m)))];
    if (!models.length) throw new Error('接口尚未返回可用模型，请在中转站检查 Key 的模型权限');
    if (models.length > 5000) throw new Error('模型列表过大，请检查中转接口');
    const remember = input.remember === true;
    const provider = { id, name: id === 'coldcoffee' ? '冷咖啡中转' : String(input.name || '自定义中转').slice(0, 40), baseUrl: base, wireApi: ['chat', 'responses'].includes(input.wireApi) ? input.wireApi : 'auto', models, remembered: remember };
    const oldKey = this.vault.get(id);
    this.vault.put(id, key, remember);
    this.providers = this.providers.filter(p => p.id !== id).concat(provider);
    try { await this.start(); await this.syncProvider(provider); this.persist(); }
    catch (error) {
      this.providers = this.providers.filter(p => p.id !== id).concat(old ? [old] : []);
      if (oldKey) this.vault.put(id, oldKey, old?.remembered === true); else this.vault.remove(id);
      throw error;
    }
    return { ok: true, models: models.map(m => `${id}/${m}`), ...this.status() };
  }
  async snapshot() {
    if (!this.engine.status().running) return { ...this.status(), routes: [], seq: 0, totals: totalsView(), catalog: null, availableModels: [] };
    const [trace, catalog] = await Promise.all([this.engine.api('gateway/trace'), this.readCatalog()]);
    const view = this.view();
    return { ...this.status(), routes: (trace.routes || []).slice(-100).map(view.route),
      totals: totalsView(trace.totals), seq: trace.seq || 0, live: trace.mine === true, now: trace.now,
      catalog, availableModels: catalog.availableModels };
  }
  view() { return projector({ scrub: s => this.vault.scrub(s), salt: this.traceSalt, secrets: [this.bridge.token, this.engine.webKey] }); }
  async readCatalog(force = false) {
    if (!force && this.catalog && Date.now() - this.catalogTime < 2000) return this.catalog;
    const raw = await this.engine.api('groups');
    this.catalog = this.view().catalog(raw); this.catalogTime = Date.now();
    return this.catalog;
  }
  async saveGroup(input = {}) {
    await this.start();
    const raw = await this.engine.api('groups');
    const id = String(input.id || '');
    if (!/^[a-z0-9][a-z0-9.-]{0,63}$/.test(id)) throw new Error('路由组标识请使用小写字母、数字、点或短横线');
    const old = (raw.groups || []).find(g => g.id === id);
    if (input.create === true && old) throw new Error('该路由组标识已存在，请换一个');
    if (input.create !== true && !old) throw new Error('路由组已变化，请刷新后重试');
    if (old && groupRevision(old) !== input.revision) throw new Error('路由组已被其他窗口更新，请刷新目录后重新编辑');
    const name = String(input.name || '').trim();
    if (!name || name.length > 80) throw new Error('请填写 1–80 字的路由组名称');
    const members = Array.isArray(input.members) ? [...new Set(input.members)] : [];
    const available = new Set([...(raw.models || []).map(m => m.id), ...(raw.groups || []).filter(g => g.id !== id).map(g => g.ref || `group/${g.id}`), ...(old?.members || [])]);
    if (!members.length || members.length > 100 || members.some(m => typeof m !== 'string' || !available.has(m))) throw new Error('请从当前目录选择 1–100 个有效成员');
    if (!['', 'order', 'rotate', 'usage', 'pace', 'weight', 'free', 'fast', 'cheap', 'drain', 'expiring', 'manual'].includes(input.routing)) throw new Error('路由策略有误');
    if (!['', 'session', 'turn', 'off', 'strict'].includes(input.affinity)) throw new Error('会话保持策略有误');
    // Merge in the main process, preserving rules, nested members, patterns,
    // key restrictions and advanced settings not edited by this basic sheet.
    await this.engine.api('groups/save', { ...(old || {}), id, name, members, routing: input.routing, affinity: input.affinity });
    this.catalogTime = 0; return this.readCatalog(true);
  }
  async text(input) {
    if (!Number.isSafeInteger(input.id) || input.id <= 0 || !['system', 'tools', 'skills', 'memory', 'files', 'results', 'chat'].includes(input.kind)) throw new Error('请先选择一条请求和上下文分类');
    const item = Number.isSafeInteger(input.item) && input.item >= 0 ? `&item=${input.item}` : '';
    const result = await this.engine.api(`context/text?id=${input.id}&kind=${input.kind}${item}`);
    // No raw credentials cross IPC, even if a customer pasted their own key in a prompt.
    return JSON.parse(this.vault.scrub(JSON.stringify(result)));
  }
  models() { return this.catalog?.availableModels || this.providers.filter(p => !p.demo && this.vault.has(p.id)).flatMap(p => p.models.map(model => ({ id: `${p.id}/${model}`, name: model, provider: p.name }))); }
  async send(input = {}) {
    if (this.busy) throw new Error('当前请求仍在返回，请稍候');
    const demo = input.demo === true;
    const model = demo ? 'local-demo/visual-demo' : String(input.model || '');
    if (!demo) { await this.start(); await this.readCatalog(true); }
    if (!demo && !this.models().some(m => m.id === model)) throw new Error('请选择已验证中转的模型');
    const text = String(input.text || '只回答：冷咖啡连接成功。').slice(0, 16000);
    await this.start();
    if (demo && !this.providers.some(p => p.demo)) {
      const provider = { id: 'local-demo', name: '本机演示模型', demo: true, models: ['visual-demo'], wireApi: 'chat' };
      this.providers.push(provider); await this.syncProvider(provider);
    }
    this.busy = true;
    const controller = new AbortController(); this.abort = controller;
    this.emit({ type: 'begin', demo, model });
    const messages = demo ? [
      { role: 'system', content: '你是冷咖啡连接演示助手。以下内容只用于本机可视化展示。\n\n# 工作说明\n展示请求经过网关的过程，准确说明本机演示与实际中转的区别。\n'.repeat(12) },
      { role: 'user', content: '<environment_context>本机演示，费用为零。</environment_context>\n请检查连接。' },
      { role: 'assistant', content: '先查看本机连接状态。', tool_calls: [{ id: 'demo-check', type: 'function', function: { name: 'connection_status', arguments: '{}' } }] },
      { role: 'tool', tool_call_id: 'demo-check', content: JSON.stringify({ gateway: 'ready', relay: '本机演示', billed: false, steps: ['选择软件', '连接中转', '验证请求'] }, null, 2).repeat(12) },
      { role: 'user', content: '请给出结果，告诉我如何开始使用冷咖啡。' },
    ] : [{ role: 'user', content: text }];
    let output = '', emitted = 0;
    const secretTail = Math.max(32, ...[...this.vault.memory.values()].map(key => key.length));
    const emitSafe = final => {
      const end = final ? output.length : Math.max(0, output.length - secretTail);
      if (end <= emitted) return;
      // Keep a secret-sized tail until the next chunk: a split API key must
      // never briefly become visible in the renderer during streaming.
      let safeEnd = end;
      for (const key of this.vault.memory.values()) {
        const at = output.lastIndexOf(key, safeEnd - 1);
        if (at >= emitted && at < safeEnd && at + key.length > safeEnd) safeEnd = at;
      }
      if (safeEnd > emitted) { this.emit({ type: 'chunk', text: this.vault.scrub(output.slice(emitted, safeEnd)), demo }); emitted = safeEnd; }
    };
    try {
      const response = await fetch(`${this.engine.url}/v1/chat/completions`, {
        method: 'POST', headers: { authorization: 'Bearer coldcoffee-local', 'content-type': 'application/json', 'user-agent': 'ColdCoffee-Workbench/3.2', 'x-session-id': 'coldcoffee-visual-preview' },
        body: JSON.stringify({ model, messages, stream: true, max_tokens: demo ? 512 : 256, ...(demo ? { tools: [{ type: 'function', function: { name: 'connection_status', description: '读取本机演示连接状态；此工具仅为展示上下文结构', parameters: { type: 'object', properties: {} } } }] } : {}) }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`模型请求未完成（HTTP ${response.status}），请查看请求记录`);
      let buffer = '';
      const decoder = new TextDecoder();
      const line = value => {
        if (!value.startsWith('data:')) return;
        const data = value.slice(5).trim(); if (!data || data === '[DONE]') return;
        let part; try { part = JSON.parse(data); } catch { return; }
        if (part.error) throw new Error('模型流返回错误，请检查请求记录');
        const chunk = part.choices?.[0]?.delta?.content || '';
        if (typeof chunk === 'string' && chunk) { output += chunk; emitSafe(false); }
      };
      for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split(/\r?\n/); buffer = lines.pop(); for (const value of lines) line(value);
        if (output.length > 512000) throw new Error('响应内容达到本次预览上限');
      }
      if (buffer) line(buffer);
      emitSafe(true); this.emit({ type: 'end', demo }); return { ok: true, demo, text: this.vault.scrub(output) };
    } catch (error) { const message = controller.signal.aborted ? '请求已停止' : this.vault.scrub(error.message); this.emit({ type: 'error', message, demo }); throw new Error(message); }
    finally { this.busy = false; this.abort = null; }
  }
  async execute(action, input = {}) {
    try {
      if (action === 'status') return this.status();
      if (action === 'start') return await this.start();
      if (action === 'snapshot') return await this.snapshot();
      if (action === 'configure') return await this.configure(input);
      if (action === 'models') return this.models();
      if (action === 'groups') { await this.start(); return await this.readCatalog(true); }
      if (action === 'group-save') {
        if (this.groupBusy) throw new Error('另一个窗口正在更新路由组，请稍后重试');
        this.groupBusy = true;
        try { return await this.saveGroup(input); } finally { this.groupBusy = false; }
      }
      if (action === 'clients') return this.clients.list();
      if (action === 'plan') { await this.start(); await this.readCatalog(true); if (!this.models().some(m => m.id === input.model)) throw new Error('请选择中转提供的有效模型或路由组'); return await this.clients.plan(input.client, input.model); }
      if (action === 'connect') return this.clients.deploy(String(input.id || ''));
      if (action === 'restore') return this.clients.restore(input.client);
      if (action === 'send' || action === 'demo') return await this.send({ ...input, demo: action === 'demo' });
      if (action === 'cancel') { this.abort?.abort(); return { ok: true }; }
      if (action === 'context') return await this.text(input);
      if (action === 'licenses') {
        const legal = path.join(path.dirname(this.engine.resources), 'legal');
        return { text: fs.readFileSync(path.join(legal, 'THIRD_PARTY_NOTICES.md'), 'utf8'), notices: fs.readFileSync(path.join(legal, 'OPEN_SOURCE_NOTICES.txt'), 'utf8') };
      }
      throw new Error('未知可视化操作');
    } catch (error) { throw new Error(this.vault.scrub(error.message)); }
  }
  async stop() { this.abort?.abort(); await this.engine.stop(); await this.bridge.stop(); }
}
module.exports = { VisualGateway };
