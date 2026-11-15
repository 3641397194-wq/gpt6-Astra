// SPDX-License-Identifier: GPL-3.0-only
const active = new Map();
let installed = false;
const native = () => window.ColdCoffeeNative;
export const isNative = () => Boolean(native());
const parse = result => {
  try { return typeof result === 'string' ? JSON.parse(result) : result; }
  catch { throw new Error('本机存储返回格式异常'); }
};

export function listProviders() { return native() ? parse(native().getProviders()) : []; }
export function loadState() { return native() ? parse(native().getState()) : {}; }
export function persistState(value) {
  if (!native()) return;
  const result = parse(native().saveState(JSON.stringify(value)));
  if (result?.ok === false) throw new Error(result.error || '保存失败，请检查设备存储空间');
}
export function saveProvider(value) {
  if (!native()) throw new Error('当前是浏览器预览，请安装安卓版后接入 API');
  const result = parse(native().saveProvider(JSON.stringify(value)));
  if (result?.ok === false) throw new Error(result.error || '保存服务商失败');
  return result.provider || result;
}
export function deleteProvider(id) {
  const result = parse(native().deleteProvider(id));
  if (result?.ok === false) throw new Error(result.error || '删除失败');
}
export function copyText(text) {
  if (native()) native().copyText(String(text));
  else return navigator.clipboard.writeText(String(text));
}
export function openExternal(url) {
  if (native()) native().openExternal(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}
export function shareText(text) {
  if (native()?.shareText) native().shareText(String(text));
  else return copyText(text);
}
export function nativeRequest({ providerId, path, method = 'GET', body }) {
  if (!native()) throw new Error('请在安卓版中接入服务商；浏览器展示不发送模型请求');
  if (!installed) {
    window.addEventListener('coldcoffee:native', ({ detail }) => active.get(detail.id)?.event(detail));
    installed = true;
  }
  const id = `r_${crypto.randomUUID()}`;
  let controller, status = 0, headers = {}, closed = false, cancelSent = false;
  let resolveHeaders, rejectHeaders;
  const ready = new Promise((resolve, reject) => { resolveHeaders = resolve; rejectHeaders = reject; });
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(value) { controller = value; },
    cancel() { cancel(false); },
  });
  function cancel(close = true) {
    if (!cancelSent) { cancelSent = true; native().cancelRequest(id); }
    if (!closed) {
      closed = true;
      if (close) { try { controller.close(); } catch { /* Consumer cancellation already closes the stream. */ } }
    }
    active.delete(id);
    rejectHeaders(new DOMException('已停止', 'AbortError'));
  }
  active.set(id, {
    event(event) {
      if (closed) return;
      if (event.type === 'headers') {
        status = event.status;
        headers = event.headers || {};
        resolveHeaders({ status, headers });
      } else if (event.type === 'chunk') {
        controller.enqueue(encoder.encode(event.text || ''));
      } else if (event.type === 'done') {
        closed = true; controller.close(); active.delete(id);
      } else if (event.type === 'cancelled') {
        closed = true; controller.error(new DOMException('已停止', 'AbortError')); active.delete(id);
        rejectHeaders(new DOMException('已停止', 'AbortError'));
      } else if (event.type === 'error') {
        closed = true;
        const error = new Error(event.message || '连接失败，请检查接口地址与网络');
        controller.error(error); rejectHeaders(error); active.delete(id);
      }
    },
  });
  try { native().startRequest(JSON.stringify({ id, providerId, path, method, ...(body ? { body } : {}) })); }
  catch (error) { active.delete(id); closed = true; controller.error(error); rejectHeaders(error); }
  return {
    id, stream, ready, cancel,
    async text() {
      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let text = '';
      try {
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          text += decoder.decode(result.value, { stream: true });
          if (text.length > 4 * 1024 * 1024) throw new Error('响应过大');
        }
        return text + decoder.decode();
      } finally { reader.releaseLock(); }
    },
  };
}
