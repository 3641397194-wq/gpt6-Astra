'use strict';
const { GrokMemoryClient } = require('../src/lib/grok-memory/protocol');
const { GrokMemoryController } = require('../src/lib/grok-memory/controller');
const { MemoryError } = require('../src/lib/grok-memory/errors');
const { activationReply } = require('../src/lib/seat-packs');

function fixture(options = {}) {
  const session = { token: 'fixture-session-material', machine: 'fixture-machine-material',
    version: '0.9.0', platform: 'win32' };
  const calls = [], sent = [], entries = new Map();
  let memories = [{ text: '回答先给结果，再说明依据。', scope: 'user', tier: 'log' },
    { text: '<img src=x onerror="window.injected=true">按原文显示', scope: 'agent', tier: 'profile' }];
  let seq = 9007199254740995n;
  let time = Date.now();
  const body = object => Buffer.from(JSON.stringify(object)).toString('base64');
  const rpc = async (credentials, method, payload, signal) => {
    if (signal?.aborted) throw new MemoryError('CANCELLED');
    calls.push(method);
    if (options.networkFailure) throw new MemoryError('NETWORK');
    if (method === 'ListGrokBotAgents') return { agents: [
      { agentId: 'fixture-bot-one', name: '冷咖啡助手' }, { id: 'fixture-bot-two', name: '项目搭档' },
    ] };
    if (method === 'ListGrokBotUserBotMemories') {
      if (!options.direct) throw new MemoryError('PERMISSION');
      return { memories, more: options.more === true };
    }
    if (method === 'SendGrokBotUserMessage') {
      sent.push(payload);
      const [, action, requestId] = payload.text.match(/\[冷咖啡记忆 (WRITE|READ|FORGET) ([\w-]+)\]/);
      const text = payload.text.match(/\n<<<\n([\s\S]*)\n>>>\n/)?.[1];
      if (action === 'WRITE' && !options.ignoreMutation) memories.push({ text,
        scope: payload.text.match(/^scope: (\w+)$/m)[1], tier: payload.text.match(/^tier: (\w+)$/m)[1] });
      if (action === 'FORGET' && !options.ignoreMutation) memories = memories.filter(item => item.text !== text);
      const object = action === 'READ' ? { id: requestId, memories, more: options.more === true }
        : { id: requestId, ok: options.negative !== true };
      if (options.wrongId) object.id = 'unrelated-request';
      const current = entries.get(payload.agentId) || [];
      const userSeq = ++seq;
      current.push({ seq: userSeq.toString(), body: body({ kind: 'user-message', clientNonce: payload.messageId }) });
      current.push({ seq: (++seq).toString(), body: body({ kind: 'send-message', message: { content: '```json\n' + JSON.stringify(object) + '\n```' } }) });
      entries.set(payload.agentId, current);
      return { dispatched: !options.notDispatched };
    }
    if (method === 'ListGrokBotTranscriptEntries') return { entries: entries.get(payload.agentId) || [] };
    throw new Error('Unexpected fixture method');
  };
  const client = new GrokMemoryClient({ rpc, timeoutMs: 50, pollMs: 10,
    now: () => time, pause: async () => { time += 10; } });
  const controller = new GrokMemoryController({ client, preset: activationReply,
    loader: async () => ({ session, checks: [
      { id: 'app', title: '桌面客户端', ok: true, detail: '隔离测试 · Grok Bot 0.9.0' },
      { id: 'login', title: '登录记录', ok: true, detail: '独立夹具，不读取个人目录' },
    ] }) });
  return { controller, client, session, calls, sent, rpc, memories: () => memories };
}
module.exports = { fixture };
