// SPDX-License-Identifier: GPL-3.0-only
// All inputs are synthetic. No test sends a model/API request.
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundled = await build({
  entryPoints: [fileURLToPath(new URL('../src/core.js', import.meta.url))],
  bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent',
});
const core = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const encoder = new TextEncoder();
const event = value => `data: ${JSON.stringify(value)}\n\n`;
const delta = text => event({ choices: [{ index: 0, delta: { content: text } }] });
const finish = event({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });

function streamOf(text, { bytewise = false, keepOpen = false } = {}) {
  const bytes = encoder.encode(text);
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      if (bytewise) for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      else controller.enqueue(bytes);
      if (!keepOpen) controller.close();
    },
    cancel() { cancelled = true; },
  });
  return { stream, wasCancelled: () => cancelled };
}

async function bounded(promise, milliseconds = 2000) {
  let timeout;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('A complete stream left generation active')), milliseconds);
    })]);
  } finally { clearTimeout(timeout); }
}

test('exact DONE ends the Chatbox-compatible stream even if HTTP stays open', async () => {
  const fixture = streamOf(delta('冷咖啡') + 'data: [DONE]\n\n', { keepOpen: true });
  let text = '', ends = 0;
  await bounded(core.consumeChatStream(fixture.stream, { onText: part => { text += part; }, onEnd: () => { ends++; } }));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(text, '冷咖啡');
  assert.equal(ends, 1);
  assert.equal(fixture.wasCancelled(), true);
});

test('Chinese and emoji survive byte-by-byte chunks and CRLF SSE frames', async () => {
  const wire = (delta('你好，') + delta('冷咖啡 ☕ 😺') + finish + 'data: [DONE]\n\n').replace(/\n/g, '\r\n');
  const fixture = streamOf(wire, { bytewise: true });
  let text = '';
  await bounded(core.consumeChatStream(fixture.stream, { onText: part => { text += part; } }));
  assert.equal(text, '你好，冷咖啡 ☕ 😺');
});

test('DONE-like text inside content does not terminate generation', async () => {
  const fixture = streamOf(delta('[DONE] 是正文') + delta('，仍然继续。') + finish + 'data: [DONE]\n\n');
  let text = '';
  await core.consumeChatStream(fixture.stream, { onText: part => { text += part; } });
  assert.equal(text, '[DONE] 是正文，仍然继续。');
});

test('Chatbox normalization preserves compatible relay cache usage', async () => {
  const fixture = streamOf(delta('完成') + event({
    choices: [], usage: { prompt_tokens: 20, completion_tokens: 2, prompt_cache_hit_tokens: 7 },
  }) + finish + 'data: [DONE]\n\n');
  let usage;
  await core.consumeChatStream(fixture.stream, { onUsage: value => { usage = value; } });
  assert.equal(usage.prompt_tokens_details.cached_tokens, 7);
  assert.equal(usage.prompt_tokens, 20);
});

test('reasoning deltas stay separate from the visible answer', async () => {
  const fixture = streamOf(event({ choices: [{ delta: { reasoning_content: '正在整理' } }] }) + delta('答案') + finish + 'data: [DONE]\n\n');
  let answer = '', reasoning = '';
  await core.consumeChatStream(fixture.stream, { onText: part => { answer += part; }, onReasoning: part => { reasoning += part; } });
  assert.equal(answer, '答案');
  assert.equal(reasoning, '正在整理');
});

test('Responses completion ends a still-open stream and preserves text', async () => {
  const fixture = streamOf(event({ type: 'response.output_text.delta', delta: '回答你好 👋' }) +
    event({ type: 'response.completed', response: { usage: { input_tokens: 3, output_tokens: 4 } } }), { keepOpen: true, bytewise: true });
  let text = '', usage;
  await bounded(core.consumeChatStream(fixture.stream, {
    protocol: 'responses', onText: part => { text += part; }, onUsage: value => { usage = value; },
  }));
  assert.equal(text, '回答你好 👋');
  assert.deepEqual(usage, { input_tokens: 3, output_tokens: 4 });
  assert.equal(fixture.wasCancelled(), true);
});

test('premature transport close reports an error and retains received text', async () => {
  let text = '';
  await assert.rejects(core.consumeChatStream(streamOf(delta('部分回复')).stream, {
    onText: part => { text += part; },
  }), /连接提前结束/);
  assert.equal(text, '部分回复');
});

test('empty and malformed streams fail instead of claiming success', async () => {
  await assert.rejects(core.consumeChatStream(streamOf('data: [DONE]\n\n').stream), /没有返回可显示/);
  await assert.rejects(core.consumeChatStream(streamOf('data: {broken}\n\n').stream), /无法解析/);
});

test('provider and Responses error events surface useful failures', async () => {
  await assert.rejects(core.consumeChatStream(streamOf(event({ error: { message: '额度不足' } })).stream), /额度不足/);
  await assert.rejects(core.consumeChatStream(streamOf(event({ type: 'response.failed', response: { error: { message: '模型不可用' } } })).stream, {
    protocol: 'responses',
  }), /模型不可用/);
  await assert.rejects(core.consumeChatStream(streamOf(event({ type: 'response.incomplete' })).stream, {
    protocol: 'responses',
  }), /输出未完成/);
});

test('normalizes root, full endpoint, uppercase scheme and custom base paths', () => {
  for (const input of ['https://relay.example', 'relay.example/', 'HTTPS://relay.example/v1/', 'https://relay.example/v1/chat/completions']) {
    const value = core.normalizeProvider({ name: '测试中转', baseUrl: input, apiKey: ' test-only ' });
    assert.equal(value.baseUrl, 'https://relay.example/v1');
    assert.equal(value.apiKey, 'test-only');
    assert.equal(value.protocol, 'chat');
  }
  assert.equal(core.normalizeProvider({ name: '其他', baseUrl: 'https://relay.example/api/custom/responses', protocol: 'responses' }).baseUrl, 'https://relay.example/api/custom');
});

test('rejects non-HTTPS addresses and secrets/query/fragment in URLs', () => {
  for (const baseUrl of [
    'http://relay.example/v1',
    'https://user:fake@relay.example/v1',
    'https://relay.example/v1?api_key=test',
    'https://relay.example/v1#private',
  ]) assert.throws(() => core.normalizeProvider({ name: '测试', baseUrl }));
  assert.throws(() => core.normalizeProvider({ name: '', baseUrl: 'https://relay.example' }), /名称/);
});

test('reads model IDs, filters empty values and deduplicates', () => {
  assert.deepEqual(core.readModels({ data: [{ id: ' beta ' }, { id: '' }, null, { id: 'alpha' }, 'alpha', 123] }), ['alpha', 'beta']);
  assert.deepEqual(core.readModels({ models: [{ name: 'vision-test' }] }), ['vision-test']);
  assert.deepEqual(core.readModels({ data: 'bad' }), []);
});

test('featured model labels rank only provider-returned IDs without rewriting request IDs', () => {
  const ids = core.readModels({ data: [
    { id: 'legacy-chat' }, { id: 'auto/gpt-6.2-sol' },
    { id: 'relay/gpt-6.2-astra' }, { id: 'z-other' },
  ] });
  assert.deepEqual(ids, ['relay/gpt-6.2-astra', 'auto/gpt-6.2-sol', 'legacy-chat', 'z-other']);
  assert.equal(core.modelFamily(ids[0]), 'GPT-6.2 Astra');
  assert.equal(core.modelFamily(ids[1]), 'GPT-6.2 Sol');
  assert.equal(core.modelFamily('gpt-6-Astra'), '');
  assert.equal(core.requestBody({ model: ids[0], protocol: 'chat', messages: [] }).model, ids[0]);
});

test('chat and Responses requests preserve images with their own protocol types', () => {
  const messages = [{ role: 'user', content: [{ type: 'text', text: '看图' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,fixture' } }] }];
  const chat = core.requestBody({ model: 'test-model', protocol: 'chat', messages, system: ' 简洁回答 ' });
  assert.equal(chat.messages[0].role, 'system');
  assert.equal(chat.messages[1].content[1].type, 'image_url');
  const responses = core.requestBody({ model: 'test-model', protocol: 'responses', messages, system: ' 简洁回答 ' });
  assert.equal(responses.instructions, '简洁回答');
  assert.deepEqual(responses.input[0].content[0], { type: 'input_text', text: '看图' });
  assert.deepEqual(responses.input[0].content[1], { type: 'input_image', image_url: 'data:image/png;base64,fixture' });
  assert.throws(() => core.requestBody({ model: '', messages: [] }), /模型 ID/);
});

test('non-streaming JSON supports both protocols and API error bodies', () => {
  assert.equal(core.extractResponse({ choices: [{ message: { content: '聊天回复' } }] }), '聊天回复');
  assert.equal(core.extractResponse({ output: [{ content: [{ type: 'output_text', text: '响应回复' }] }] }, 'responses'), '响应回复');
  assert.throws(() => core.extractResponse({ error: { message: '接口错误' } }), /接口错误/);
});

test('public configuration sharing excludes secrets and conversation records', () => {
  const exported = core.exportPublicState({
    fontSize: 19, conversations: [{ text: 'PRIVATE_CHAT_SENTINEL' }], apiKey: 'PRIVATE_KEY_SENTINEL',
  }, [{
    id: 'fixture', name: '测试中转', baseUrl: 'https://relay.example/v1', protocol: 'chat',
    apiKey: 'PRIVATE_KEY_SENTINEL', hasKey: true, credentials: 'PRIVATE_CREDENTIAL_SENTINEL',
  }]);
  const text = JSON.stringify(exported);
  assert.doesNotMatch(text, /PRIVATE_|apiKey|conversations|credentials|hasKey/);
  assert.equal(exported.providers[0].baseUrl, 'https://relay.example/v1');
  assert.equal(exported.settings.fontSize, 19);
});

test('error redaction removes bearer values, common token patterns and URLs', () => {
  const fake = ['sk', 'abcdef1234567890abcdef1234'].join('-');
  const text = core.redactError(`Bearer test-only-value ${fake} https://relay.example/private?token=fixture`);
  assert.doesNotMatch(text, /test-only-value|abcdef123|relay\.example/);
  assert.match(text, /隐藏/);
});
