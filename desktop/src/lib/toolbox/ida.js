'use strict';
const { request } = require('./network');
const { validate } = require('./registry');
const VERSION = '2024-11-05';
class IdaConnection {
  constructor() { this.sessions = new Map(); }
  async rpc(url, method, params, signal, sessionId, notification = false) {
    const body = { jsonrpc: '2.0', ...(notification ? {} : { id: `${Date.now()}-${Math.random().toString(16).slice(2)}` }), method, params };
    const response = await request(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': VERSION, ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}) }, body: JSON.stringify(body), timeoutMs: 15000 }, signal);
    if (notification && response.status >= 200 && response.status < 300) return null;
    if (response.status < 200 || response.status >= 300) throw new Error(`IDA MCP HTTP ${response.status}`);
    let rpc;
    try { rpc = JSON.parse(response.body); } catch {
      const frames = response.body.split(/\r?\n/).filter(s => s.startsWith('data:')).map(s => { try { return JSON.parse(s.slice(5)); } catch { return null; } });
      rpc = frames.find(item => item && item.id === body.id);
    }
    if (!rpc || rpc.id !== body.id) throw new Error('IDA MCP response ID mismatch');
    if (rpc.error) throw new Error(rpc.error.message || 'IDA MCP protocol error');
    return { result: rpc.result, sessionId: response.headers['mcp-session-id'] || sessionId };
  }
  async connect({ url = 'http://127.0.0.1:13337/mcp' } = {}, ctx = {}) {
    const init = await this.rpc(url, 'initialize', { protocolVersion: VERSION, capabilities: {}, clientInfo: { name: 'coldcoffee-original-toolbox', version: '1.0.0' } }, ctx.signal);
    await this.rpc(url, 'notifications/initialized', {}, ctx.signal, init.sessionId, true);
    const list = await this.rpc(url, 'tools/list', {}, ctx.signal, init.sessionId);
    if (!Array.isArray(list.result?.tools)) throw new Error('IDA MCP did not return tool schemas');
    const state = { url, sessionId: init.sessionId, serverInfo: init.result?.serverInfo, tools: list.result.tools };
    this.sessions.set(url, state); return state;
  }
  async call({ url = 'http://127.0.0.1:13337/mcp', name, arguments: args = {} }, ctx = {}) {
    const state = this.sessions.get(url) || await this.connect({ url }, ctx);
    const schema = state.tools.find(t => t.name === name);
    if (!schema) throw new Error(`IDA 未公布工具 ${name}；先查看 ida_connect 返回的工具列表`);
    validate(args, schema.inputSchema || { type: 'object' });
    const response = await this.rpc(url, 'tools/call', { name, arguments: args }, ctx.signal, state.sessionId);
    if (response.result?.isError) throw new Error(JSON.stringify(response.result.content));
    return response.result;
  }
}
module.exports = { IdaConnection };
