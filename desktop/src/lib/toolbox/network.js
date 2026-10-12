'use strict';
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const dns = require('node:dns').promises;
const crypto = require('node:crypto');
const { integer, abort, digest, asUrl, pool, redact } = require('./common');

function request(value, options = {}, signal) {
  const url = asUrl(value);
  const maxBytes = integer(options.maxBytes, 1024 * 1024, 256, 4 * 1024 * 1024, 'maxBytes');
  const timeoutMs = integer(options.timeoutMs, 4000, 100, 60000, 'timeoutMs');
  abort(signal);
  return new Promise((resolve, reject) => {
    const started = Date.now(); let timer, done = false;
    const method = String(options.method || 'GET').toUpperCase();
    const finish = (error, result) => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', cancel); error ? reject(error) : resolve(result); };
    const req = (url.protocol === 'https:' ? https : http).request(url, {
      method, headers: { 'user-agent': 'ColdCoffee-OriginalToolbox/1.0', 'accept-encoding': 'identity', ...(options.headers || {}) },
      rejectUnauthorized: options.verifyTls !== false,
    }, res => {
      const chunks = []; let bytes = 0, truncated = false;
      const complete = () => {
        const captured = Buffer.concat(chunks), body = captured.toString('utf8');
        finish(null, { url: url.href, method, status: res.statusCode, headers: redact(res.headers), bytes, truncated, durationMs: Date.now() - started, sha256: digest(captured), hashScope: truncated ? 'captured-prefix' : 'response-body', body, location: res.headers.location || null });
      };
      res.on('data', chunk => {
        if (bytes + chunk.length > maxBytes) {
          chunks.push(chunk.subarray(0, Math.max(0, maxBytes - bytes))); bytes = maxBytes; truncated = true; complete(); res.destroy();
        } else { chunks.push(chunk); bytes += chunk.length; }
      });
      res.on('end', complete);
      res.on('error', error => finish(error));
    });
    const cancel = () => req.destroy(signal.reason || new Error('Task cancelled'));
    signal?.addEventListener('abort', cancel, { once: true });
    req.on('error', error => finish(error));
    timer = setTimeout(() => req.destroy(new Error(`HTTP timeout after ${timeoutMs}ms`)), timeoutMs);
    if (options.body !== undefined && !['GET', 'HEAD'].includes(method)) req.write(String(options.body));
    req.end();
  });
}
function portsOf(input = '80,443,8080,8443') {
  const list = Array.isArray(input) ? input : String(input).split(/[\s,;]+/).filter(Boolean);
  const ports = new Set();
  for (const item of list) {
    const parts = String(item).split('-');
    if (parts.length > 2) throw new Error('端口范围格式应为 1-100');
    const a = integer(parts[0], 0, 1, 65535, 'port');
    const b = parts.length === 2 ? integer(parts[1], 0, a, 65535, 'port') : a;
    if (b - a + 1 > 8192 || ports.size + b - a + 1 > 8192) throw new Error('单次扫描最多 8192 个端口');
    for (let p = a; p <= b; p++) ports.add(p);
  }
  if (!ports.size) throw new Error('至少填写一个端口');
  return [...ports].sort((a, b) => a - b);
}
async function resolveHost({ host }, ctx = {}) {
  const name = String(host || '').trim().replace(/^\[|\]$/g, '');
  if (!name || /[\s/\\@]/.test(name)) throw new Error('填写主机名或 IP，不带路径');
  abort(ctx.signal);
  const addresses = await dns.lookup(name, { all: true });
  abort(ctx.signal);
  return { host: name, addresses };
}
async function scanPorts(args, ctx = {}) {
  const host = String(args.host || '').replace(/^\[|\]$/g, '');
  const resolved = await resolveHost({ host }, ctx);
  const ports = portsOf(args.ports);
  const concurrency = integer(args.concurrency, 32, 1, 128, 'concurrency');
  const timeoutMs = integer(args.timeoutMs, 700, 100, 15000, 'timeoutMs');
  const address = resolved.addresses[0].address;
  const results = await pool(ports, concurrency, port => new Promise(resolve => {
    abort(ctx.signal); let ended = false;
    const started = Date.now(); const socket = new net.Socket();
    const complete = (state, error) => {
      if (ended) return; ended = true; socket.destroy(); ctx.signal?.removeEventListener('abort', cancel);
      const result = { port, state, durationMs: Date.now() - started, ...(error ? { error } : {}) };
      ctx.emit?.({ kind: 'port', port, state }); resolve(result);
    };
    const cancel = () => complete('cancelled');
    ctx.signal?.addEventListener('abort', cancel, { once: true });
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => complete('open'));
    socket.once('timeout', () => complete('timeout'));
    socket.once('error', error => complete(error.code === 'ECONNREFUSED' ? 'closed' : 'error', error.code));
    socket.connect(port, address);
  }), ctx.signal);
  return { ...resolved, scannedAddress: address, total: ports.length, open: results.filter(r => r.state === 'open'), results };
}
function compact(r, bodyLimit = 2000) { return { ...r, body: r.body.slice(0, bodyLimit), bodyOmitted: r.body.length > bodyLimit }; }
function titleOf(body) { return (body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim().slice(0, 200); }
async function inspectHttp(args, ctx = {}) {
  const result = await request(args.url, args, ctx.signal);
  const fingerprints = [];
  for (const [name, re] of [['WordPress', /wp-content|wp-includes/i], ['Next.js', /__NEXT_DATA__|\/_next\//], ['React', /react-root|data-reactroot/i], ['Django', /csrfmiddlewaretoken/], ['ASP.NET', /__VIEWSTATE|ASP\.NET/i]]) if (re.test(result.body)) fingerprints.push(name);
  return { ...compact(result), title: titleOf(result.body), fingerprints };
}
function linksOf(body, base) {
  const found = [];
  const regex = /\b(?:href|src|action)\s*=\s*["']([^"']+)["']/gi; let match;
  while ((match = regex.exec(body))) {
    try { const url = asUrl(new URL(match[1].replace(/&amp;/g, '&'), base).href); found.push(url.href); } catch {}
  }
  return [...new Set(found)];
}
async function crawlSite(args, ctx = {}) {
  const start = asUrl(args.url); const maxPages = integer(args.maxPages, 12, 1, 100, 'maxPages');
  const queue = [start.href], queued = new Set(queue), visited = new Set(), pages = [], endpoints = new Set();
  while (queue.length && pages.length < maxPages) {
    abort(ctx.signal); const url = queue.shift(); if (visited.has(url)) continue; visited.add(url);
    try {
      const r = await request(url, args, ctx.signal);
      const links = linksOf(r.body, url); let redirect = null;
      if (r.location) try { redirect = new URL(r.location, url).href; } catch {}
      for (const link of [...links, ...(redirect ? [redirect] : [])]) {
        const candidate = asUrl(link); if (candidate.origin !== start.origin) continue;
        endpoints.add(candidate.href);
        if (!queued.has(candidate.href) && queued.size < maxPages * 4 && !/\.(?:png|jpe?g|gif|svg|ico|woff2?|zip|exe|pdf)(?:$|\?)/i.test(candidate.pathname)) { queue.push(candidate.href); queued.add(candidate.href); }
      }
      const forms = [...r.body.matchAll(/<form\b[^>]*>/gi)].slice(0, 30).map(m => m[0].slice(0, 500));
      pages.push({ url, status: r.status, bytes: r.bytes, sha256: r.sha256, title: titleOf(r.body), forms, links });
      ctx.emit?.({ kind: 'page', url, status: r.status });
    } catch (error) { abort(ctx.signal); pages.push({ url, error: error.message }); }
  }
  return { origin: start.origin, pages, endpoints: [...endpoints], pending: queue.length, limitReached: queue.length > 0 };
}
async function findPaths(args, ctx = {}) {
  const base = asUrl(args.url);
  const paths = Array.isArray(args.paths) ? args.paths : String(args.paths || 'robots.txt\nsitemap.xml\nadmin\napi\napi/docs\nlogin\n.git/HEAD').split(/\r?\n/).filter(Boolean);
  if (paths.length > 500) throw new Error('单次最多检查 500 条路径');
  const missing = `__coldcoffee_missing_${crypto.randomBytes(8).toString('hex')}`;
  const baseline = await request(new URL(missing, base.href.endsWith('/') ? base : base.href + '/').href, args, ctx.signal);
  const normalize = (body, pathname) => body.replaceAll(pathname, '<path>').replace(/[0-9a-f]{16,}|\b\d{10,}\b/gi, '<dynamic>');
  const results = await pool(paths, integer(args.concurrency, 6, 1, 32, 'concurrency'), async item => {
    const url = asUrl(new URL(String(item).replace(/^\/+/, ''), base.href.endsWith('/') ? base : base.href + '/').href);
    if (url.origin !== base.origin) throw new Error('路径列表须保持同一网站');
    try {
      const r = await request(url.href, args, ctx.signal);
      const soft404 = r.status === baseline.status && normalize(r.body, url.pathname) === normalize(baseline.body, new URL(baseline.url).pathname);
      const hit = ![404, 410].includes(r.status) && !soft404;
      const row = { url: url.href, status: r.status, bytes: r.bytes, sha256: r.sha256, soft404, hit, location: r.location };
      ctx.emit?.({ kind: 'path', ...row }); return row;
    } catch (error) { abort(ctx.signal); return { url: url.href, error: error.message, hit: false }; }
  }, ctx.signal);
  return { baseline: compact(baseline, 300), hits: results.filter(r => r.hit), results };
}
async function fuzzHttp(args, ctx = {}) {
  if (!String(args.url || '').includes('FUZZ') && !String(args.body || '').includes('FUZZ')) throw new Error('地址或请求正文里填一个 FUZZ 占位符');
  const payloads = Array.isArray(args.payloads) ? args.payloads : String(args.payloads || '').split(/\r?\n/);
  if (!payloads.length || payloads.length > 500) throw new Error('填写 1..500 条测试输入');
  const make = value => ({ ...args, body: args.body === undefined ? undefined : String(args.body).replaceAll('FUZZ', value) });
  const baseline = await request(String(args.url).replaceAll('FUZZ', 'coldcoffee_baseline'), make('coldcoffee_baseline'), ctx.signal);
  const results = await pool(payloads, integer(args.concurrency, 4, 1, 32, 'concurrency'), async payload => {
    abort(ctx.signal);
    try {
      const r = await request(String(args.url).replaceAll('FUZZ', encodeURIComponent(payload)), make(payload), ctx.signal);
      const row = { payload, ...compact(r, 1200), statusChanged: r.status !== baseline.status, lengthDelta: r.bytes - baseline.bytes, reflected: Boolean(payload) && r.body.includes(payload) };
      ctx.emit?.({ kind: 'request', status: r.status, payload }); return row;
    } catch (error) { abort(ctx.signal); return { payload, error: error.message }; }
  }, ctx.signal);
  return { baseline: compact(baseline, 500), results };
}
async function checkWeb(args, ctx = {}) {
  const url = asUrl(args.url); const baseline = await request(url.href, args, ctx.signal); const findings = [];
  const add = (kind, evidence, confidence = 'observed') => findings.push({ kind, evidence, confidence });
  if (!baseline.headers['content-security-policy']) add('missing_csp', 'Response has no Content-Security-Policy header', 'configuration');
  if (!baseline.headers['x-content-type-options']) add('missing_nosniff', 'Response has no X-Content-Type-Options header', 'configuration');
  if (/Traceback \(most recent call last\)|Fatal error:|Exception in thread|SQLSTATE\[/i.test(baseline.body)) add('error_disclosure', baseline.body.slice(0, 800));
  const parameter = args.parameter || [...url.searchParams.keys()][0];
  const probes = [];
  if (parameter) {
    const marker = `CC_${crypto.randomBytes(6).toString('hex')}`;
    for (const [kind, payload] of [['reflection', `<${marker}>"'`], ['sql_error', "'\""], ['redirect', `https://example.invalid/${marker}`]]) {
      abort(ctx.signal); const test = new URL(url); test.searchParams.set(parameter, payload);
      const r = await request(test.href, args, ctx.signal); probes.push({ kind, ...compact(r, 1200) });
      if (kind === 'reflection' && r.body.includes(payload)) add('raw_input_reflection', { url: test.href, marker: payload, status: r.status }, 'candidate_not_execution');
      if (kind === 'sql_error' && /SQL syntax|SQLSTATE|sqlite.*error|unterminated quoted|mysql_fetch|ORA-\d{5}|PostgreSQL.*ERROR/i.test(r.body) && !/SQL syntax|SQLSTATE|sqlite.*error|unterminated quoted|mysql_fetch|ORA-\d{5}|PostgreSQL.*ERROR/i.test(baseline.body)) add('sql_error_on_input', { url: test.href, response: r.body.slice(0, 1000) }, 'candidate_not_exploitation');
      if (kind === 'redirect' && r.status >= 300 && r.status < 400 && r.location === payload) add('open_redirect', { url: test.href, location: r.location, status: r.status });
      ctx.emit?.({ kind: 'check', check: kind, status: r.status });
    }
  }
  return { baseline: compact(baseline, 1500), parameter: parameter || null, findings, probes };
}
module.exports = { request, portsOf, resolveHost, scanPorts, inspectHttp, crawlSite, findPaths, fuzzHttp, checkWeb, linksOf };
