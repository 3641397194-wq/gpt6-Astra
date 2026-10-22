'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { _electron: electron } = require('playwright');
const { workspace, peFixture, webFixture } = require('../tests/toolbox-fixtures.cjs');
const { digest } = require('../src/lib/toolbox/common');
(async () => {
  const root = path.resolve(__dirname, '..'), data = workspace(), source = path.join(workspace(), 'original-fixture.exe'); fs.writeFileSync(source, peFixture()); const originalSha = digest(fs.readFileSync(source));
  const out = path.resolve(process.env.COLDCOFFEE_UI_OUTPUT || path.join(root, 'work/toolbox-ui')); fs.mkdirSync(out, { recursive: true });
  const web = await webFixture(), env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const packaged = process.env.COLDCOFFEE_APP_EXECUTABLE;
  if (packaged && process.env.COLDCOFFEE_SIMULATE_PORTABLE === '1') env.PORTABLE_EXECUTABLE_FILE = packaged;
  let app, modelServer;
  try {
    const loader = path.join(path.dirname(require.resolve('playwright-core/package.json')), 'lib/server/electron/loader.js');
    app = await electron.launch({ executablePath: packaged || require('electron'), args: ['-r', loader, '--enable-logging=stderr', ...(process.env.COLDCOFFEE_UI_NO_SANDBOX === '1' ? ['--no-sandbox'] : []), ...(packaged ? [] : [root]), '--toolbox', '--toolbox-workspace=' + data], env, timeout: 60000 });
    let launchLog = ''; app.process().stderr?.on('data', data => { launchLog = (launchLog + data.toString()).slice(-6000); });
    let page; for (let i = 0; i < 600 && !page; i++) { page = app.windows().find(p => p.url().includes('/workbench/index.html')); if (!page) await new Promise(r => setTimeout(r, 100)); }
    if (!page) {
      const state = await app.evaluate(({ app, BrowserWindow }) => ({ ready: app.isReady(), appPath: app.getAppPath(), argv: process.argv, windows: BrowserWindow.getAllWindows().map(w => ({ url: w.webContents.getURL(), loading: w.webContents.isLoading(), crashed: w.webContents.isCrashed() })) }));
      throw new Error('Workbench window missing: ' + JSON.stringify(state) + '\n' + launchLog);
    }
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.waitForSelector('#cc-ready.ready'); await page.waitForSelector('#page-toolbox.active'); assert.match(await page.locator('#cc-ready').textContent(), /16 项原创工具/);
    async function run(action, expected = 'completed') {
      const previous = await page.locator('#cc-task-title').textContent(); await page.locator(`[data-cc-run="${action}"]`).click();
      await page.waitForFunction(before => document.getElementById('cc-task-title').textContent !== before, previous);
      await page.waitForFunction(() => ['completed','partial','failed','cancelled'].includes(document.getElementById('cc-task-state').dataset.state));
      assert.equal(await page.locator('#cc-task-state').getAttribute('data-state'), expected); return JSON.parse(await page.locator('#cc-result').textContent());
    }
    await page.locator('[data-cc-tab="net"]').click(); await page.locator('#cc-host').fill('127.0.0.1'); await page.locator('#cc-ports').fill(String(web.port)); assert.equal((await run('ports')).open[0].port, web.port);
    await page.locator('[data-cc-tab="web"]').click(); await page.locator('#cc-url').fill(web.url); await page.locator('#cc-parameter').fill('q'); await page.locator('#cc-pages').fill('3'); await page.locator('[data-cc-pane="web"] summary').click(); await page.locator('#cc-paths').fill('admin\nmissing'); await page.locator('[data-cc-pane="web"] summary').click();
    const webResult = await run('web-all'); assert.equal(webResult.stages.length, 6); await page.evaluate(() => { window.scrollTo(0,0); document.querySelector('main').scrollTop = 0; }); await page.screenshot({ path: path.join(out, '原创工具箱-网站.png') });
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, source);
    await page.locator('[data-cc-tab="binary"]').click(); await page.locator('#cc-pick').click(); await page.waitForFunction(() => document.getElementById('cc-sample').textContent.includes('original-fixture.exe'));
    const binary = await run('analyze'); assert.equal(binary.format, 'PE'); assert.equal(binary.imports[0].name, 'CHECK_FN'); await page.evaluate(() => { window.scrollTo(0,0); document.querySelector('main').scrollTop = 0; }); await page.screenshot({ path: path.join(out, '原创工具箱-文件.png') });
    await page.locator('[data-cc-pane="binary"] summary').click(); await page.locator('#cc-offset').fill('0x400'); await page.locator('#cc-expected').fill('74 05'); await page.locator('#cc-replace').fill('90 90');
    const patched = await run('patch'); assert.equal(patched.sourceUnchanged, true); assert.equal(digest(fs.readFileSync(source)), originalSha);
    await page.locator('#cc-expected').fill('75 05'); assert.match((await run('patch', 'failed')).error, /原字节/);
    await page.locator('[data-cc-tab="text"]').click(); await page.locator('#cc-text').fill('ZmxhZ3tmaXh0dXJlfQ=='); assert.equal((await run('decode')).result, 'flag{fixture}');
    await page.locator('[data-cc-tab="ai"]').click(); const connection = await page.evaluate(() => window.coldbrew.originalToolbox('connection')); const bridge = connection.mcpServers['coldcoffee-toolbox'];
    if (bridge.command === 'node') { assert.ok(bridge.args[0].startsWith(data)); assert.ok(fs.existsSync(bridge.args[0])); } else assert.equal(bridge.env.ELECTRON_RUN_AS_NODE, '1');
    await app.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }); }, path.join(out, 'coldcoffee-toolbox-SKILL.md'));
    await page.locator('#cc-skill').click(); await page.waitForFunction(() => document.getElementById('cc-log').textContent.includes('skill 已导出') || document.getElementById('cc-task-state').textContent === '请检查输入'); assert.match(await page.locator('#cc-log').textContent(), /skill 已导出/); assert.match(fs.readFileSync(path.join(out, 'coldcoffee-toolbox-SKILL.md'), 'utf8'), /run_workflow/);
    let round = 0; const replies = [{ tool: 'inspect_http', arguments: { url: web.url } }, { tool: 'check_web', arguments: { url: web.url, parameter: 'q' } }, { done: true, summary: '已依据实际 HTTP 调用完成夹具检查。' }];
    modelServer = http.createServer((req, res) => { res.setHeader('content-type', 'application/json'); if (req.method === 'GET') return res.end(JSON.stringify({ data: [{ id: 'gpt-6.1-sol' }] })); let body = ''; req.on('data', c => { body += c; }); req.on('end', () => { assert.ok(JSON.parse(body).input.includes('observations')); res.end(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify(replies[round++]) }] }] })); }); });
    await new Promise(r => modelServer.listen(0, '127.0.0.1', r));
    await page.evaluate(config => window.coldbrew.relay('configure', config), { mode: 'openai', baseUrl: `http://127.0.0.1:${modelServer.address().port}/v1`, authToken: 'fixture-only', wireApi: 'responses' });
    await page.locator('#cc-ai-target').fill(web.url); await page.locator('#cc-goal').fill('在当前夹具上调用工具，读取反馈并总结。');
    await page.evaluate(() => { const select = document.getElementById('relay-provider'); const option = document.createElement('option'); option.value = 'gpt-6.1-sol'; option.textContent = 'gpt-6.1-sol'; select.append(option); select.value = option.value; });
    const previous = await page.locator('#cc-task-title').textContent(); await page.locator('#cc-agent').click(); await page.waitForFunction(before => document.getElementById('cc-task-title').textContent !== before, previous); await page.waitForFunction(() => document.getElementById('cc-task-state').dataset.state === 'completed');
    const agent = JSON.parse(await page.locator('#cc-result').textContent()); assert.equal(agent.calls.length, 2); assert.equal(agent.rounds, 3);
    await app.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }); }, path.join(out, '夹具-AI运行结果.json'));
    await page.locator('#cc-export').click(); await page.waitForFunction(() => document.getElementById('cc-log').textContent.includes('结果已导出')); assert.equal(JSON.parse(fs.readFileSync(path.join(out, '夹具-AI运行结果.json'), 'utf8')).result.calls.length, 2);
    await page.evaluate(() => { window.scrollTo(0,0); document.querySelector('main').scrollTop = 0; }); await page.screenshot({ path: path.join(out, '原创工具箱-AI.png') });
    assert.deepEqual(errors, []); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    fs.writeFileSync(path.join(out, 'ui-verification.json'), JSON.stringify({ ok: true, packaged: Boolean(packaged), portableBridge: bridge.command === 'node', checks: ['Electron IPC', 'toolbox auto enabled', 'TCP scanner', 'six-stage web workflow', 'PE imports', 'patch copy and original unchanged', 'expected-byte mismatch', 'decoder', 'MCP configuration', 'skill export', 'result export', 'AI remote-fixture feedback loop', 'no renderer errors', 'no horizontal overflow'], sourceSha256: originalSha, workspace: data }, null, 2));
    console.log('PASS: Electron UI, real IPC, original tools, AI fixture loop, report export, source unchanged.');
  } finally { if (app) await app.close(); await web.close(); if (modelServer) { modelServer.closeAllConnections(); await new Promise(r => modelServer.close(r)); } }
})().catch(error => { console.error(error); process.exitCode = 1; });
