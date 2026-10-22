'use strict';
const crypto = require('node:crypto');
function integer(value, fallback, min, max, label = 'number') {
  const n = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`${label}: expected integer ${min}..${max}`);
  return n;
}
function abort(signal) { if (signal?.aborted) throw signal.reason || new Error('Task cancelled'); }
function cancellable(promise, signal) {
  abort(signal);
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const cancel = () => reject(signal.reason || new Error('Task cancelled'));
    signal.addEventListener('abort', cancel, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel));
  });
}
function digest(data, algorithm = 'sha256') { return crypto.createHash(algorithm).update(data).digest('hex'); }
function asUrl(value) {
  let url;
  try { url = new URL(String(value)); } catch { throw new Error('请输入完整的 http:// 或 https:// 地址'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('地址须为 HTTP(S)，登录信息请单独填写');
  url.hash = '';
  return url;
}
async function pool(items, concurrency, fn, signal) {
  const result = new Array(items.length); let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) { abort(signal); const i = cursor++; result[i] = await fn(items[i], i); }
  }));
  abort(signal); return result;
}
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, /^(authorization|proxy-authorization|cookie|set-cookie|api[_-]?key|token|password|authToken)$/i.test(k) ? '[redacted]' : redact(v)]));
  return value;
}
module.exports = { integer, abort, cancellable, digest, asUrl, pool, redact };
