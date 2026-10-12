'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { ToolboxEngine } = require('./engine');
const { validate } = require('./registry');
const EXTRA = [
  { name: 'start_workflow', title: '启动自动任务', description: 'Start a workflow asynchronously; poll task_status for results and report paths.', inputSchema: { type: 'object', properties: { mode: { type: 'string', enum: ['web', 'reverse'] }, url: { type: 'string' }, file: { type: 'string' }, parameter: { type: 'string' }, maxPages: { type: 'integer' } }, required: ['mode'], additionalProperties: false } },
  { name: 'task_status', title: '查看任务', description: 'Return task state, actual results, events and persisted report paths.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } },
  { name: 'cancel_task', title: '停止任务', description: 'Cancel an active task; already captured evidence is retained.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false } },
];
function createServer({ workspace, input = process.stdin, output = process.stdout } = {}) {
  const engine = new ToolboxEngine({ workspace: workspace || process.cwd() }); const active = new Map(); let buffer = '';
  const send = message => output.write(JSON.stringify(message) + '\n');
  const error = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });
  const result = (id, value) => send({ jsonrpc: '2.0', id, result: value });
  const skill = () => fs.readFileSync(path.join(__dirname, 'SKILL.md'), 'utf8');
  async function handle(message) {
    const { id, method, params = {} } = message || {};
    if (message?.jsonrpc !== '2.0' || typeof method !== 'string') return error(id ?? null, -32600, 'Invalid Request');
    if (!Object.hasOwn(message, 'id')) { if (method === 'notifications/cancelled' && active.has(params.requestId)) engine.cancel(active.get(params.requestId)); return; }
    try {
      if (method === 'initialize') return result(id, { protocolVersion: ['2024-11-05', '2025-03-26', '2025-06-18'].includes(params.protocolVersion) ? params.protocolVersion : '2024-11-05', capabilities: { tools: {}, resources: {}, prompts: {} }, serverInfo: { name: 'coldcoffee-original-toolbox', version: '1.0.0' }, instructions: 'Use original tools, actual evidence and the explicit workspace. Read coldcoffee://skill for workflows.' });
      if (method === 'ping') return result(id, {});
      if (method === 'tools/list') return result(id, { tools: [...engine.catalog().tools, ...EXTRA] });
      if (method === 'resources/list') return result(id, { resources: [{ uri: 'coldcoffee://skill', name: '原创工具工作流', mimeType: 'text/markdown' }] });
      if (method === 'resources/read') { if (params.uri !== 'coldcoffee://skill') return error(id, -32602, 'Unknown resource'); return result(id, { contents: [{ uri: params.uri, mimeType: 'text/markdown', text: skill() }] }); }
      if (method === 'prompts/list') return result(id, { prompts: [{ name: 'coldcoffee', description: 'Original toolbox workflow', arguments: [{ name: 'task', description: 'Task with explicit target/sample', required: true }] }] });
      if (method === 'prompts/get') { if (params.name !== 'coldcoffee') return error(id, -32602, 'Unknown prompt'); return result(id, { messages: [{ role: 'user', content: { type: 'text', text: skill() + '\n\n任务：\n' + String(params.arguments?.task || '') } }] }); }
      if (method !== 'tools/call') return error(id, -32601, 'Method not found');
      const name = params.name, args = params.arguments || {}, tool = [...engine.catalog().tools, ...EXTRA].find(t => t.name === name);
      if (!tool) return error(id, -32602, 'Unknown tool'); validate(args, tool.inputSchema);
      let payload;
      if (name === 'start_workflow') payload = engine.start('run_workflow', args);
      else if (name === 'task_status') payload = engine.get(args.id);
      else if (name === 'cancel_task') payload = engine.cancel(args.id);
      else {
        const task = engine.start(name, args); active.set(id, task.id);
        const done = await engine.wait(task.id); active.delete(id);
        payload = { taskId: done.id, status: done.status, result: done.result, report: done.report, ...(done.error ? { error: done.error } : {}) };
      }
      return result(id, { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }], isError: payload.status === 'failed' || Boolean(payload.error) });
    } catch (e) { active.delete(id); return result(id, { content: [{ type: 'text', text: e.message }], isError: true }); }
  }
  input.setEncoding('utf8');
  input.on('data', chunk => {
    buffer += chunk;
    if (Buffer.byteLength(buffer) > 4 * 1024 * 1024) { error(null, -32700, 'Message exceeds 4 MiB'); buffer = ''; input.destroy(); return; }
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1); if (!line) continue;
      try { void handle(JSON.parse(line)); } catch { error(null, -32700, 'Parse error'); }
    }
  });
  return { engine, handle };
}
if (require.main === module) {
  const index = process.argv.indexOf('--workspace');
  createServer({ workspace: index < 0 ? process.cwd() : process.argv[index + 1] });
}
module.exports = { createServer };
