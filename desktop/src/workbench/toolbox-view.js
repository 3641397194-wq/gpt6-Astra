'use strict';
(() => {
  const el = id => document.getElementById(id); if (!el('cc-toolbox')) return;
  const terminal = new Set(['completed', 'partial', 'failed', 'cancelled']);
  const labels = { queued: '等待执行', running: '正在执行', completed: '已完成', partial: '部分完成', failed: '失败', cancelled: '已停止' };
  const local = { sample: null, other: null, task: null, timer: null, logs: [], catalog: null, tasks: [] };
  const value = id => el(id).value.trim(); const number = id => Number(value(id));
  const call = async (action, payload = {}) => { if (!window.coldbrew?.originalToolbox) throw new Error('请在桌面版工作台执行工具'); return window.coldbrew.originalToolbox(action, payload); };
  const note = text => { el('cc-log').textContent = String(text); };
  function log(entry) { local.logs.push(entry); if (local.logs.length > 200) local.logs.shift(); el('cc-log').textContent = local.logs.join('\n'); el('cc-log').scrollTop = el('cc-log').scrollHeight; }
  function fail(error) { el('cc-task-state').textContent = '请检查输入'; note(error.message); }
  function summary(result) {
    if (!result) return '等待程序返回结果。';
    if (result.stages) {
      const done = result.stages.filter(s => s.status === 'completed').length;
      const messages = [`${done}/${result.stages.length} 个步骤已完成`];
      for (const stage of result.stages) {
        const r = stage.result;
        if (stage.status !== 'completed') { messages.push(`${local.catalog?.tools.find(t => t.name === stage.tool)?.title || stage.tool}失败`); continue; }
        if (stage.tool === 'scan_ports') messages.push(`开放端口 ${r.open.map(p => p.port).join(', ') || '无'}`);
        if (stage.tool === 'crawl_site') messages.push(`读取 ${r.pages.length} 个页面`);
        if (stage.tool === 'find_paths') messages.push(`命中 ${r.hits.length} 条目录`);
        if (stage.tool === 'check_web') messages.push(`${r.findings.length} 条配置或输入线索`);
        if (stage.tool === 'analyze_binary') messages.push(`${r.format} · ${r.bits || '-'} 位 · ${r.imports.length} 个导入`);
      }
      return messages.join(' · ');
    }
    if (result.summary) return result.summary;
    if (result.open) return `扫描 ${result.total} 个端口，开放：${result.open.map(p => p.port).join(', ') || '无'}。`;
    if (result.format) return `${result.format} · ${result.bits || '-'} 位 · ${result.bytes} 字节 · ${result.imports.length} 个导入 · ${result.strings.length} 条字符串。`;
    if (result.sourceUnchanged) return '补丁副本已生成，原文件保持原样。';
    if (result.findings) return `完成实际请求，记录 ${result.findings.length} 条线索；详细证据与确认程度见下方。`;
    if (result.pages) return `已读取 ${result.pages.length} 个页面，发现 ${result.endpoints.length} 个同源地址。`;
    if (result.hits) return `已检查 ${result.results.length} 条路径，命中 ${result.hits.length} 条。`;
    if (result.offsets) return `找到 ${result.count} 处字节匹配${result.limited ? '，结果已达到上限' : ''}。`;
    if (result.changed !== undefined) return `两个文件共 ${result.changed} 个字节不同。`;
    if (result.found !== undefined) return result.found ? `找到匹配原文，已测试 ${result.tried} 条候选。` : `已测试 ${result.tried} 条候选，尚未匹配。`;
    if (result.error) return result.error;
    if (result.status) return `HTTP ${result.status}${result.title ? ' · ' + result.title : ''} · ${result.bytes || 0} 字节。`;
    return '已获得实际结果，详细内容见下方。';
  }
  function tab(name) {
    document.querySelectorAll('[data-cc-pane]').forEach(p => { p.hidden = p.dataset.ccPane !== name; });
    document.querySelectorAll('[data-cc-tab]').forEach(b => { const selected = b.dataset.ccTab === name; b.classList.toggle('on', selected); b.setAttribute('aria-selected', String(selected)); });
    if (name === 'ai' && !value('cc-ai-target')) el('cc-ai-target').value = local.sample?.file || value('cc-url');
  }
  function picked() { if (!local.sample) throw new Error('先选一个样本'); return local.sample.file; }
  function argsFor(action) {
    const web = { url: value('cc-url') }; const paths = value('cc-paths'); const parameter = value('cc-parameter');
    if (action === 'web-all') return ['run_workflow', { mode: 'web', ...web, maxPages: number('cc-pages'), ...(paths ? { paths } : {}), ...(parameter ? { parameter } : {}) }];
    if (action === 'inspect') return ['inspect_http', web];
    if (action === 'crawl') return ['crawl_site', { ...web, maxPages: number('cc-pages') }];
    if (action === 'paths') return ['find_paths', { ...web, ...(paths ? { paths } : {}) }];
    if (action === 'check') return ['check_web', { ...web, ...(parameter ? { parameter } : {}) }];
    if (action === 'ports') return ['scan_ports', { host: value('cc-host'), ports: value('cc-ports'), concurrency: number('cc-concurrency'), timeoutMs: number('cc-timeout') }];
    if (action === 'dns') return ['resolve_host', { host: value('cc-host') }];
    if (['request', 'fuzz'].includes(action)) {
      const headers = JSON.parse(value('cc-headers') || '{}');
      const input = { url: value('cc-request-url'), method: value('cc-method'), headers, ...(value('cc-body') ? { body: el('cc-body').value } : {}) };
      return action === 'request' ? ['inspect_http', input] : ['fuzz_http', { ...input, payloads: el('cc-payloads').value.split(/\r?\n/), concurrency: number('cc-fuzz-concurrency') }];
    }
    if (action === 'analyze') return ['analyze_binary', { file: picked() }];
    if (action === 'reverse-all') return ['run_workflow', { mode: 'reverse', file: picked(), ...(el('cc-use-ida').checked ? { useIda: true, idaUrl: value('cc-ida-url') } : {}) }];
    if (action === 'search') return ['search_bytes', { file: picked(), pattern: value('cc-pattern') }];
    if (action === 'patch') return ['patch_bytes', { file: picked(), patches: [{ offset: number('cc-offset'), expected: value('cc-expected'), replace: value('cc-replace') }], ...(value('cc-expected-sha') ? { expectedSha256: value('cc-expected-sha') } : {}) }];
    if (action === 'diff') { if (!local.other) throw new Error('先选对照文件'); return ['diff_files', { file: picked(), other: local.other.file }]; }
    if (action === 'decode') return ['decode_text', { text: el('cc-text').value, mode: value('cc-decode-mode') }];
    if (action === 'hash') return ['match_hash', { hash: value('cc-hash'), algorithm: value('cc-hash-algorithm'), words: el('cc-words').value.split(/\r?\n/) }];
    if (action === 'ida') return ['ida_connect', { url: value('cc-ida-url') }];
    throw new Error('未知操作');
  }
  function render(task) {
    local.task = task; const busy = !terminal.has(task.status);
    el('cc-task-state').textContent = labels[task.status] || task.status; el('cc-task-state').dataset.state = task.status;
    el('cc-task-title').textContent = `${local.catalog?.tools.find(t => t.name === task.name)?.title || (task.name === 'ai_task' ? 'AI 自动任务' : task.name)} · ${task.id.slice(0, 8)}${task.report ? ' · 报告已保存' : ''}`;
    el('cc-cancel').disabled = !busy; el('cc-report').disabled = !task.report; el('cc-export').disabled = busy;
    document.querySelectorAll('[data-cc-run],#cc-agent').forEach(b => { b.disabled = busy; });
    const text = JSON.stringify(task.result || (task.error ? { error: task.error } : { status: task.status }), null, 2);
    el('cc-result').textContent = text.length > 24000 ? text.slice(0, 24000) + '\n\n界面摘要已截断，完整内容见导出结果或报告。' : text;
    el('cc-summary').textContent = task.error || summary(task.result);
  }
  async function poll(id) {
    clearTimeout(local.timer);
    try {
      const task = await call('status', { id }); render(task);
      if (!terminal.has(task.status)) local.timer = setTimeout(() => poll(id), 350);
      else {
        log(`${labels[task.status]}${task.error ? ' · ' + task.error : ''}`);
        local.tasks = await call('list'); el('cc-task-list').replaceChildren(...local.tasks.slice(0, 12).map(t => { const b = document.createElement('button'); b.type = 'button'; b.textContent = `${labels[t.status] || t.status} · ${local.catalog?.tools.find(tool => tool.name === t.name)?.title || t.name} · ${t.id.slice(0, 6)}`; b.addEventListener('click', () => { if (local.task && !terminal.has(local.task.status)) return; local.logs = []; poll(t.id); }); return b; }));
      }
    } catch (error) { fail(error); }
  }
  async function start(action) {
    if (local.task && !terminal.has(local.task.status)) return;
    try { const [name, args] = argsFor(action); local.logs = []; log(`启动 · ${name}`); const task = await call('start', { name, arguments: args }); render(task); poll(task.id); }
    catch (error) { fail(error); }
  }
  async function arm() {
    try { local.catalog = await call('catalog'); el('cc-ready').textContent = `已启用 · ${local.catalog.tools.length} 项原创工具`; el('cc-ready').classList.add('ready'); }
    catch (error) { el('cc-ready').textContent = error.message; }
  }
  document.querySelectorAll('[data-cc-tab]').forEach(b => b.addEventListener('click', () => tab(b.dataset.ccTab)));
  document.querySelectorAll('[data-cc-run]').forEach(b => b.addEventListener('click', () => start(b.dataset.ccRun)));
  for (const [id, key] of [['cc-pick', 'sample'], ['cc-pick-other', 'other']]) el(id).addEventListener('click', async () => {
    try { const sample = await call('import'); if (sample.canceled) return; local[key] = sample; if (key === 'sample') { el('cc-sample').textContent = `${sample.name} · ${sample.bytes} 字节 · 原件保持原样`; el('cc-ai-target').value = sample.file; } else log(`对照文件 · ${sample.name}`); }
    catch (error) { fail(error); }
  });
  el('cc-agent').addEventListener('click', async () => {
    if (local.task && !terminal.has(local.task.status)) return;
    try { local.logs = []; log('AI 自动任务 · 使用中转页当前模型'); const task = await call('agent', { goal: value('cc-goal'), target: value('cc-ai-target'), maxRounds: number('cc-rounds'), modelId: el('relay-provider')?.value || 'gpt-6-astra', ...(el('cc-use-ida').checked ? { idaUrl: value('cc-ida-url') } : {}) }); render(task); poll(task.id); } catch (error) { fail(error); }
  });
  el('cc-cancel').addEventListener('click', async () => { try { await call('cancel', { id: local.task.id }); log('停止请求已发送'); } catch (error) { fail(error); } });
  el('cc-report').addEventListener('click', () => call('report', { id: local.task.id }).catch(fail));
  el('cc-export').addEventListener('click', async () => { try { if (local.task) { const r = await call('export-task', { id: local.task.id }); if (!r.canceled) log(`结果已导出 · ${r.file}`); } } catch (error) { fail(error); } });
  el('cc-connection').addEventListener('click', async () => { try { const connection = await call('connection'); const text = JSON.stringify(connection, null, 2); el('cc-connection-out').hidden = false; el('cc-connection-out').textContent = text; await navigator.clipboard.writeText(text); log(connection.mcpServers['coldcoffee-toolbox'].command === 'node' ? 'MCP 连接已复制；便携版的外部 AI 接入需要 Node.js 22+，原创服务代码已导出到稳定工作目录。' : 'MCP 连接已复制；包含本机的程序路径与工具工作目录。'); } catch (error) { fail(error); } });
  el('cc-skill').addEventListener('click', async () => { try { const r = await call('export-skill'); if (!r.canceled) log(`skill 已导出 · ${r.file}`); } catch (error) { fail(error); } });
  window.coldbrew?.onOriginalToolbox?.(entry => {
    if (entry.taskId !== local.task?.id) return;
    const title = name => local.catalog?.tools.find(t => t.name === name)?.title || name;
    const checks = { reflection: '输入反射', sql_error: 'SQL 报错', redirect: '重定向' };
    const portState = { open: '开放', closed: '关闭', timeout: '超时', error: '错误', cancelled: '已停止' };
    let text = entry.kind === 'stage' ? `${title(entry.name)} · ${labels[entry.state] || entry.state}`
      : entry.kind === 'port' ? `端口 ${entry.port} · ${portState[entry.state] || entry.state}`
      : entry.kind === 'page' ? `读取页面 · HTTP ${entry.status} · ${entry.url}`
      : entry.kind === 'path' ? `检查目录 · ${entry.hit ? '有结果' : '未命中'} · ${entry.url}`
      : entry.kind === 'check' ? `${checks[entry.check] || entry.check}测试 · HTTP ${entry.status}`
      : entry.kind === 'agent' ? `AI 第 ${entry.round} 轮 · ${entry.state === 'calling' ? '调用 ' + title(entry.name) : '分析反馈'}`
      : entry.kind === 'state' ? labels[entry.state] || entry.state : `${entry.kind} · ${entry.status || ''}`;
    if (entry.error) text += ' · ' + entry.error;
    log(`${new Date(entry.at).toLocaleTimeString('zh-CN', { hour12: false })} ${text}`);
  });
  window.ColdCoffeeOriginalToolbox = { arm }; arm();
})();
