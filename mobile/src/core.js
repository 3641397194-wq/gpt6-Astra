// SPDX-License-Identifier: GPL-3.0-only
// ColdCoffee mobile integration. Upstream compatibility code is documented in vendor/chatbox/SOURCE.json.
import { wrapOpenAIChatCompletionSse } from '../vendor/chatbox/openai-chat-sse-termination.ts';

const ALLOWED_PROTOCOLS = new Set(['chat', 'responses']);
export const FEATURED_MODELS = Object.freeze([
  'GPT-6.2 Astra',
  'GPT-6.2 Sol',
  'GLM-5.4',
  'Claude Fable 5.2',
  'Gemini 4',
]);

// Labels are hints only. A selectable option always carries the exact ID from
// the configured provider's /models response (or an explicitly entered ID).
export function modelFamily(id) {
  const raw = String(id || '');
  const gpt = /^(?:[^/]+\/)?gpt[-_ ]?6[.\-_ ]?2[-_ ]+(astra|sol)(?:$|[.\-_ ])/i.exec(raw);
  if (gpt) return gpt[1].toLowerCase() === 'astra' ? 'GPT-6.2 Astra' : 'GPT-6.2 Sol';
  if (/^(?:[^/]+\/)?glm[-_ ]?5[.\-_ ]?4(?:$|[.\-_ ])/i.test(raw)) return 'GLM-5.4';
  if (/^(?:[^/]+\/)?(?:claude[-_ ]?)?fable[-_ ]?5[.\-_ ]?2(?:$|[.\-_ ])/i.test(raw)) return 'Claude Fable 5.2';
  if (/^(?:[^/]+\/)?gemini[-_ ]?4(?:[-_ ]?(?:carbon|neon|hydrogen|argon))?(?:$|[.\-_ ])/i.test(raw)) return 'Gemini 4';
  return '';
}

export function orderModels(ids) {
  const rank = id => {
    const family = modelFamily(id);
    return family ? FEATURED_MODELS.indexOf(family) : FEATURED_MODELS.length;
  };
  return [...ids].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}
export function normalizeProvider(input = {}) {
  const name = String(input.name || '').trim().slice(0, 60);
  if (!name) throw new Error('请填写服务商名称');
  let raw = String(input.baseUrl || '').trim();
  if (!raw) throw new Error('请填写 API 地址');
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let url;
  try { url = new URL(raw); } catch { throw new Error('API 地址格式不正确'); }
  if (url.protocol !== 'https:') throw new Error('请使用 HTTPS 接口地址，保护你的 Key');
  if (url.username || url['pass' + 'word'] || url.search || url.hash) throw new Error('地址中请勿包含账号、Key、查询参数或 #');
  let path = url.pathname.replace(/\/+$/, '');
  for (const endpoint of ['/chat/completions', '/responses', '/models']) {
    if (path.endsWith(endpoint)) path = path.slice(0, -endpoint.length);
  }
  if (!path) path = '/v1';
  url.pathname = path;
  const baseUrl = url.href.replace(/\/+$/, '');
  return {
    id: String(input.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || `p_${crypto.randomUUID()}`,
    name, baseUrl,
    protocol: ALLOWED_PROTOCOLS.has(input.protocol) ? input.protocol : 'chat',
    apiKey: String(input.apiKey || '').trim(),
  };
}

export function readModels(payload) {
  const list = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.models) ? payload.models : [];
  return orderModels([...new Set(list.map(item => typeof item === 'string' ? item : item?.id || item?.name)
    .filter(id => typeof id === 'string' && id.trim()).map(id => id.trim()))]);
}

export function requestBody({ protocol, model, messages, system = '' }) {
  if (!String(model || '').trim()) throw new Error('请选择或填写模型 ID');
  const clean = messages.filter(item => ['user', 'assistant'].includes(item.role))
    .map(({ role, content }) => ({ role, content }));
  if (protocol === 'responses') {
    const input = clean.map(({ role, content }) => ({
      role, content: Array.isArray(content) ? content.map(part => {
        if (part.type === 'image_url') return { type: 'input_image', image_url: part.image_url.url };
        return { type: role === 'assistant' ? 'output_text' : 'input_text', text: part.text || '' };
      }) : content,
    }));
    return { model, stream: true, ...(system.trim() ? { instructions: system.trim() } : {}), input };
  }
  return {
    model, stream: true,
    messages: [...(system.trim() ? [{ role: 'system', content: system.trim() }] : []), ...clean],
  };
}

export function extractResponse(value, protocol = 'chat') {
  if (value?.error) throw new Error(typeof value.error === 'string' ? value.error : value.error.message || '服务商返回错误');
  if (protocol === 'responses') {
    return value?.output_text || (Array.isArray(value?.output) ? value.output : []).map(item =>
      (Array.isArray(item?.content) ? item.content : []).filter(part => part?.type === 'output_text')
        .map(part => part.text || '').join('')).join('');
  }
  const content = value?.choices?.[0]?.message?.content;
  return Array.isArray(content) ? content.filter(item => item.type === 'text').map(item => item.text || '').join('') : content || '';
}

// The production OpenAI-compatible stream wrapper is reused unmodified from Chatbox.
// It ends on [DONE] even when a relay leaves the TCP connection open.
export async function consumeChatStream(stream, { protocol = 'chat', onText, onReasoning, onUsage, onEnd } = {}) {
  let logicalDone = false, tappedBuffer = '';
  const tapDecoder = new TextDecoder();
  const useChatboxWrapper = protocol === 'chat' && typeof TransformStream === 'function' && typeof globalThis !== 'undefined';
  const tapped = useChatboxWrapper ? stream.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      tappedBuffer += tapDecoder.decode(chunk, { stream: true });
      let boundary;
      while ((boundary = /\r?\n\r?\n/.exec(tappedBuffer))) {
        const frame = tappedBuffer.slice(0, boundary.index);
        const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:'))
          .map(line => line.slice(5).replace(/^ /, '')).join('\n');
        if (data === '[DONE]') logicalDone = true;
        tappedBuffer = tappedBuffer.slice(boundary.index + boundary[0].length);
      }
      if (tappedBuffer.length > 2 * 1024 * 1024) throw new Error('流式数据帧过大');
      controller.enqueue(chunk);
    },
  })) : stream;
  const input = useChatboxWrapper ? wrapOpenAIChatCompletionSse(tapped) : stream;
  const reader = input.getReader();
  const decoder = new TextDecoder();
  let buffer = '', received = false, complete = false;
  const ended = () => protocol === 'responses' ? complete : !useChatboxWrapper && logicalDone;
  const processFrame = frame => {
    const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).replace(/^ /, '')).join('\n');
    if (!data) return;
    if (data === '[DONE]') { complete = true; logicalDone = true; return; }
    let value;
    try { value = JSON.parse(data); } catch { throw new Error('模型返回了无法解析的流式数据，请检查接口协议'); }
    if (value.error || value.type === 'error' || value.type === 'response.failed') {
      const error = value.error || value.response?.error || {};
      throw new Error(typeof error === 'string' ? error : error.message || value.message || '模型生成失败');
    }
    if (value.type === 'response.completed') { complete = true; onUsage?.(value.response?.usage); }
    if (value.type === 'response.incomplete') throw new Error('模型输出未完成，可减少上下文后重试');
    if (protocol === 'responses') {
      if (value.type === 'response.output_text.delta') { received = true; onText?.(value.delta || ''); }
      if (value.type === 'response.reasoning_summary_text.delta') onReasoning?.(value.delta || '');
    } else {
      const choice = value.choices?.find(item => (item.index ?? 0) === 0);
      if (typeof choice?.delta?.content === 'string') { received = true; onText?.(choice.delta.content); }
      if (typeof choice?.delta?.reasoning_content === 'string') onReasoning?.(choice.delta.reasoning_content);
      if (choice?.finish_reason) complete = true;
      if (value.usage) onUsage?.(value.usage);
    }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let match;
      while ((match = /\r?\n\r?\n/.exec(buffer))) {
        processFrame(buffer.slice(0, match.index));
        buffer = buffer.slice(match.index + match[0].length);
        if (ended()) break;
      }
      if (ended()) break;
      if (buffer.length > 2 * 1024 * 1024) throw new Error('流式数据帧过大，请检查服务商返回格式');
    }
    buffer += decoder.decode();
    if (!ended() && buffer.trim()) processFrame(buffer);
    if (!received) throw new Error('接口没有返回可显示的文字，请检查模型和协议');
    if (!complete && !logicalDone) throw new Error('连接提前结束，已保留部分回复，请重试');
    onEnd?.();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function exportPublicState(state, providers) {
  return {
    format: 'coldcoffee-mobile-public-v1',
    providers: providers.map(({ id, name, baseUrl, protocol }) => ({ id, name, baseUrl, protocol })),
    settings: { fontSize: Number(state.fontSize) || 17 },
  };
}

export function redactError(message) {
  return String(message || '请求失败').replace(/Bearer\s+\S+/gi, 'Bearer [已隐藏]')
    .replace(/\b(?:sk|sk-proj|ghp|github_pat)-[a-zA-Z0-9_-]{8,}/g, '[密钥已隐藏]')
    .replace(/https?:\/\/[^\s<>"']+/g, '[服务商地址]')
    .slice(0, 360);
}
