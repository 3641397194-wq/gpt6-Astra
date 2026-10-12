'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), http = require('node:http'), path = require('node:path'), { spawn } = require('node:child_process');
const { IdaConnection } = require('../src/lib/toolbox/ida');
const { workspace, webFixture } = require('./toolbox-fixtures.cjs');
async function mcpClient(t, executable = process.execPath, extraEnv = {}) {
  const child = spawn(executable, [path.resolve(__dirname, '../src/lib/toolbox/mcp.js'), '--workspace', workspace()], { windowsHide: true, env: { ...process.env, ...extraEnv }, stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => { child.stdin.end(); child.kill(); }); let buffer = '', sequence = 0; const waiting = new Map();
  child.stdout.setEncoding('utf8'); child.stdout.on('data', chunk => { buffer += chunk; let end; while ((end = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, end); buffer = buffer.slice(end + 1); if (!line.trim()) continue; const m = JSON.parse(line); const call = waiting.get(m.id); if (call) { clearTimeout(call.timer); waiting.delete(m.id); call.resolve(m); } } });
  return { child, rpc(method, params = {}) { const id = ++sequence; return new Promise((resolve, reject) => { const timer = setTimeout(() => { waiting.delete(id); reject(new Error('MCP response timeout: ' + method)); }, 10000); waiting.set(id, { resolve, timer }); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); }); } };
}
test('MCP stdio 真进程：握手、工具、skill、调用、错误与异步流程', async t => {
  const c = await mcpClient(t); assert.equal((await c.rpc('initialize', { protocolVersion: '2025-03-26' })).result.protocolVersion, '2025-03-26');
  const tools = (await c.rpc('tools/list')).result.tools; assert.equal(tools.length, 19); assert.ok(tools.every(tool => tool.inputSchema));
  assert.match((await c.rpc('resources/read', { uri: 'coldcoffee://skill' })).result.contents[0].text, /原创工具工作流/);
  assert.equal((await c.rpc('tools/call', { name: 'unknown' })).error.code, -32602);
  const decoded = (await c.rpc('tools/call', { name: 'decode_text', arguments: { text: 'ZmxhZ3tmaXh0dXJlfQ==' } })).result; const payload = JSON.parse(decoded.content[0].text); assert.equal(payload.result.result, 'flag{fixture}'); assert.ok(payload.report.json);
  assert.equal((await c.rpc('tools/call', { name: 'scan_ports', arguments: {} })).result.isError, true);
  const f = await webFixture(); t.after(f.close); const started = JSON.parse((await c.rpc('tools/call', { name: 'start_workflow', arguments: { mode: 'web', url: f.url, maxPages: 2 } })).result.content[0].text);
  let state; for (let i = 0; i < 50; i++) { state = JSON.parse((await c.rpc('tools/call', { name: 'task_status', arguments: { id: started.id } })).result.content[0].text); if (state.status === 'completed') break; await new Promise(r => setTimeout(r, 20)); }
  assert.equal(state.status, 'completed'); assert.equal(state.result.stages.length, 6);
});
test('MCP 使用 Electron 的 Node 模式启动：发布连接所用运行方式', async t => {
  const electron = require('electron'); const c = await mcpClient(t, electron, { ELECTRON_RUN_AS_NODE: '1' }); const r = await c.rpc('initialize'); assert.equal(r.result.serverInfo.name, 'coldcoffee-original-toolbox'); assert.equal((await c.rpc('tools/list')).result.tools.length, 19);
});
test('IDA Streamable HTTP：会话、initialized、真实 schema 校验和调用', async t => {
  const calls = []; let initialized = false;
  const server = http.createServer((req, res) => { let raw = ''; req.on('data', c => { raw += c; }); req.on('end', () => {
    const rpc = JSON.parse(raw); calls.push(rpc.method);
    if (rpc.method === 'initialize') { res.setHeader('mcp-session-id', 'fixture-session'); return res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result: { serverInfo: { name: 'ida-fixture' } } })); }
    assert.equal(req.headers['mcp-session-id'], 'fixture-session');
    if (rpc.method === 'notifications/initialized') { initialized = true; res.statusCode = 202; return res.end(); }
    assert.equal(initialized, true); let result;
    if (rpc.method === 'tools/list') result = { tools: [{ name: 'fixture_decompile', inputSchema: { type: 'object', properties: { addr: { type: 'string' } }, required: ['addr'], additionalProperties: false } }] };
    else result = { content: [{ type: 'text', text: 'int CHECK_FN() { return 1; }' }] };
    if (rpc.method === 'tools/call') { res.setHeader('content-type', 'text/event-stream'); return res.end('data: ' + JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result }) + '\n\n'); }
    res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result }));
  }); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}/mcp`, ida = new IdaConnection(); const connected = await ida.connect({ url }); assert.equal(connected.tools[0].name, 'fixture_decompile');
  await assert.rejects(ida.call({ url, name: 'invented' }), /未公布/); await assert.rejects(ida.call({ url, name: 'fixture_decompile', arguments: {} }), /required/); await assert.rejects(ida.call({ url, name: 'fixture_decompile', arguments: { addr: 1 } }), /string/);
  const output = await ida.call({ url, name: 'fixture_decompile', arguments: { addr: '0x1000' } }); assert.match(output.content[0].text, /CHECK_FN/); assert.deepEqual(calls, ['initialize', 'notifications/initialized', 'tools/list', 'tools/call']);
});
