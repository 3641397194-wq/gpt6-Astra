'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const { once } = require('node:events');

function baseUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('中转地址格式有误'); }
  if (url.username || url.password || url.search || url.hash) throw new Error('中转地址只填写主机与 API 路径');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw new Error('中转地址请使用 HTTPS');
  return url.href.replace(/\/+$/, '');
}
class CredentialBridge {
  constructor({ vault, providers, fetchImpl = fetch }) {
    this.vault = vault; this.providers = providers; this.fetchImpl = fetchImpl;
    this.token = crypto.randomBytes(32).toString('hex'); this.url = ''; this.server = null;
  }
  async start() {
    if (this.server) return;
    this.server = http.createServer((req, res) => this.handle(req, res).catch(() => {
      if (!res.headersSent) { res.writeHead(502, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: '中转连接中断，请检查网络和服务状态' } })); }
      else res.destroy();
    }));
    this.server.requestTimeout = 0;
    this.server.listen(0, '127.0.0.1'); await once(this.server, 'listening');
    this.url = `http://127.0.0.1:${this.server.address().port}`;
  }
  async handle(req, res) {
    const auth = req.headers.authorization || '';
    if (auth.length !== this.token.length + 7 || !crypto.timingSafeEqual(Buffer.from(auth), Buffer.from(`Bearer ${this.token}`))) { res.writeHead(401); res.end(); return; }
    const parsed = new URL(req.url, 'http://127.0.0.1');
    const match = parsed.pathname.match(/^\/([a-z][a-z0-9-]{0,63})\/v1\/(.+)$/);
    const provider = match && this.providers().find(p => p.id === match[1]);
    if (!provider) { res.writeHead(404); res.end(); return; }
    if (provider.demo) return this.demo(req, res, match[2]);
    const key = this.vault.get(provider.id);
    if (!key) { res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: '请在冷咖啡中重新填写 API Key' } })); return; }
    const base = baseUrl(provider.baseUrl);
    const target = new URL(match[2] + parsed.search, base + '/');
    if (target.origin !== new URL(base).origin || !target.pathname.startsWith(new URL(base).pathname.replace(/\/$/, '') + '/')) throw new Error('API 路径有误');
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 64 * 1024 * 1024) { res.writeHead(413); res.end(); return; } chunks.push(chunk); }
    const headers = { authorization: `Bearer ${key}`, 'x-api-key': key, 'content-type': req.headers['content-type'] || 'application/json' };
    for (const name of ['anthropic-version', 'anthropic-beta', 'openai-beta', 'accept', 'user-agent']) if (req.headers[name]) headers[name] = req.headers[name];
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15 * 60 * 1000);
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    try {
      const response = await this.fetchImpl(target.href, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks), redirect: 'error', signal: controller.signal });
      res.writeHead(response.status, { 'content-type': response.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' });
      if (response.body) for await (const chunk of response.body) { if (!res.write(Buffer.from(chunk))) await once(res, 'drain'); }
      res.end();
    } finally { clearTimeout(timeout); }
  }
  async demo(req, res, endpoint) {
    res.setHeader('content-type', 'application/json');
    if (endpoint === 'models') { res.end(JSON.stringify({ object: 'list', data: [{ id: 'visual-demo', object: 'model', context_length: 32768 }] })); return; }
    let raw = ''; for await (const chunk of req) raw += chunk.toString();
    const input = JSON.parse(raw || '{}');
    const answer = '冷咖啡可视化已就绪。\n这次请求真实经过本机网关和协议转发，使用本机演示模型，费用为零。\n连接你的中转后，同一张图会展示真实模型的请求。';
    if (input.stream) {
      res.setHeader('content-type', 'text/event-stream'); res.setHeader('cache-control', 'no-cache');
      for (const part of answer.match(/.{1,8}/gs)) {
        if (res.destroyed) return;
        res.write(`data: ${JSON.stringify({ id: 'coldcoffee-demo', object: 'chat.completion.chunk', model: 'visual-demo', choices: [{ index: 0, delta: { content: part }, finish_reason: null }] })}\n\n`);
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      res.end(`data: ${JSON.stringify({ id: 'coldcoffee-demo', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`);
    } else res.end(JSON.stringify({ id: 'coldcoffee-demo', object: 'chat.completion', model: 'visual-demo', choices: [{ index: 0, message: { role: 'assistant', content: answer }, finish_reason: 'stop' }] }));
  }
  async stop() { if (this.server) { this.server.closeAllConnections(); await new Promise(resolve => this.server.close(resolve)); this.server = null; } }
}
module.exports = { CredentialBridge, baseUrl };
