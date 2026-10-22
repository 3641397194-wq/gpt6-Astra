'use strict';
// Explicit network smoke check, isolated under this checkout. Not part of npm test.
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { SeatTransactions } = require('../../desktop/src/lib/seat-transactions');
const upstream = require('../../desktop/src/lib/upstream-skills');
const { prepareRea, statusRea } = require('../../desktop/src/lib/upstream-rea-runtime');

const project = path.resolve(__dirname, '../..');
const root = path.join(project, '.coldbrew', 'upstream-runtime-smoke');
const reportFile = path.join(project, '.coldbrew', 'upstream-runtime-verification.json');

async function probeMcp() {
  const child = spawn(process.execPath, [path.join(root, '.coldcoffee-upstream', 'rea-launcher.cjs'), 'mcp'], {
    cwd: root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let diagnostic = '';
  child.stderr.on('data', (chunk) => { diagnostic = (diagnostic + chunk.toString()).slice(-4000); });
  child.stdin.on('error', () => {});
  const lines = readline.createInterface({ input: child.stdout });
  try {
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('REA MCP tools/list 超时；' + diagnostic)), 30000);
      const finish = (error, result) => { clearTimeout(timer); error ? reject(error) : resolve(result); };
      child.once('error', (error) => finish(error));
      child.once('exit', (code) => finish(new Error('REA MCP 提前退出：' + code + '；' + diagnostic)));
      const send = (value) => child.stdin.write(JSON.stringify(value) + '\n');
      lines.on('line', (line) => {
        let value;
        try { value = JSON.parse(line); } catch { return; }
        if (value.id === 1) {
          if (value.error) { finish(new Error(JSON.stringify(value.error))); return; }
          send({ jsonrpc: '2.0', method: 'notifications/initialized' });
          send({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
        }
        if (value.id === 2) {
          if (value.error || !Array.isArray(value.result?.tools) || !value.result.tools.length) {
            finish(new Error('REA MCP 未返回有效工具清单：' + JSON.stringify(value.error || value.result))); return;
          }
          finish(null, { ok: true, tools: value.result.tools.map((tool) => tool.name) });
        }
      });
      send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {
        protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'coldcoffee-isolated-smoke', version: '1.0.0' },
      } });
    });
  } finally {
    lines.close();
    const closed = once(child, 'close');
    child.kill();
    await Promise.race([closed, new Promise((resolve) => { const timer = setTimeout(resolve, 3000); timer.unref(); })]);
  }
}

(async () => {
  const report = { root, verifiedAt: new Date().toISOString(), scope: 'project-runtime-only-fixture' };
  try {
    const locked = upstream.readCatalog();
    const base = path.join(root, '.coldcoffee-upstream');
    const writes = upstream.bundleFiles(locked.runtime).map((file) => ({ kind: 'asset', file: path.join(base, 'runtime/rea', file.path), data: file.data, mode: file.mode }));
    writes.push({ kind: 'asset', file: path.join(base, 'rea-launcher.cjs'), data: fs.readFileSync(path.join(project, 'desktop/src/lib/upstream/rea-launcher.cjs')), mode: 0o755 });
    const tx = new SeatTransactions({ plan: () => ({ home: root, writes, pack: 'REA runtime-only smoke fixture\n' }) });
    tx.select(root);
    const plan = tx.preview('codex');
    console.log('REA runtime fixture: ' + plan.files.length + ' files, ' + plan.changes + ' changes');
    report.install = tx.deploy(plan.id);
    report.filesVerified = tx.verify('codex').ok;
    if (!report.filesVerified) throw new Error('REA 隔离运行时文件校验失败');
    console.log('Preparing pinned REA dependencies in project fixture…');
    report.prepare = await prepareRea(root, { nodeCommand: process.execPath, timeoutMs: 5 * 60000 });
    console.log(JSON.stringify(report.prepare));
    if (!report.prepare.ok) throw new Error(report.prepare.message);
    report.runtime = statusRea(root);
    report.mcp = await probeMcp();
    console.log('PASS: REA MCP tools/list returned ' + report.mcp.tools.length + ' tools');
    report.ok = true;
  } catch (error) {
    report.ok = false;
    report.error = error.message;
    process.exitCode = 1;
    console.error(error.message);
  } finally {
    fs.mkdirSync(path.dirname(reportFile), { recursive: true });
    fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
    console.log('Report: ' + reportFile);
  }
})();
