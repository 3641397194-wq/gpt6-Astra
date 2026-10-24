'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const panel = $('upstream-skills');
  if (!panel) return;
  const desktop = typeof window.coldbrew?.beginner === 'function';
  const state = { catalog: null, nonce: null, busy: false, results: new Map(), generation: 0 };
  const seats = [
    ['codex', 'Codex'], ['claude', 'Claude Code'], ['grok', 'Grok'], ['deepseek', window.ColdCoffeeCore?.DEEPSEEK_LABEL || 'DeepSeek Harness'],
    ['glm53', 'GLM / ZCode'], ['gemini', 'Gemini'], ['doubao', '豆包'], ['workbuddy', 'WorkBuddy'],
    ['cursor', 'Cursor'], ['mimo', 'MiniMax 3.1 Flash'], ['kimi', 'Kimi Code'],
  ];
  const number = (value) => Number.isFinite(Number(value)) ? Number(value).toLocaleString('zh-CN') : '—';
  const text = (tag, className, value) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = String(value ?? '');
    return element;
  };
  const bytes = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    if (n >= 1024 * 1024) return (n / 1024 / 1024).toLocaleString('zh-CN', { maximumFractionDigits: 1 }) + ' MB';
    if (n >= 1024) return (n / 1024).toLocaleString('zh-CN', { maximumFractionDigits: 1 }) + ' KB';
    return number(n) + ' 字节';
  };

  async function api(action, payload = {}) {
    if (desktop) return window.coldbrew.beginner(action, payload);
    if (action === 'upstream-prepare') throw new Error('隔离预览只展示界面，请在桌面版准备依赖。');
    if (!state.nonce) {
      const response = await fetch('/api/session', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('请通过项目交互预览服务打开此页面。');
      state.nonce = (await response.json()).nonce;
      if (!state.nonce) throw new Error('预览会话尚未准备好，请刷新重试。');
    }
    const response = await fetch('/api/command', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-ColdCoffee-Token': state.nonce },
      body: JSON.stringify({ action: action === 'catalog' ? 'upstream-catalog' : action, payload }),
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) state.nonce = null;
      throw new Error(data.error || '技能信息读取失败，请重试。');
    }
    return data.result;
  }

  function setBusy(busy) {
    state.busy = busy;
    panel.setAttribute('aria-busy', String(busy));
    $('upstream-refresh').disabled = busy;
    $('upstream-status-check').disabled = busy || !state.catalog;
    $('upstream-prepare').disabled = busy || !state.catalog || !desktop;
    $('upstream-seat').disabled = busy;
  }

  function renderSources(catalog) {
    $('upstream-sources').replaceChildren(...catalog.sources.map((source, index) => {
      const card = document.createElement('article');
      card.className = 'upstream-source';
      const head = document.createElement('div');
      head.className = 'upstream-source-head';
      const title = document.createElement('div');
      title.append(text('span', 'upstream-source-number', '来源 0' + (index + 1)), text('h3', '', source.name || source.id));
      const count = document.createElement('div');
      count.className = 'upstream-source-count';
      count.append(text('b', '', number(source.skillCount)), text('span', '', '项技能'));
      head.append(title, count);
      card.append(head, text('p', 'upstream-source-brief', source.id === 'rea'
        ? '逆向分析框架与执行资源。完整源码随包保留，使用独立适配入口。'
        : '技能路由、专项工作流与完整参考库。保留 CTF 子项目和内部引用。'));
      const meta = document.createElement('div');
      meta.className = 'upstream-source-meta';
      meta.append(text('span', '', number(source.fileCount) + ' 个文件'), text('span', '', bytes(source.bytes)), text('span', '', source.license || '见来源许可证'));
      card.append(meta);
      return card;
    }));
  }

  function renderSkills() {
    if (!state.catalog) return;
    const query = $('upstream-search').value.trim().toLocaleLowerCase();
    const all = state.catalog.sources.flatMap((source) => (source.skills || []).map((skill) => ({ source, skill })));
    const matches = all.filter(({ source, skill }) => [source.name, source.id, skill.name, skill.path, skill.description].some((value) => String(value || '').toLocaleLowerCase().includes(query)));
    $('upstream-skill-count').textContent = number(matches.length) + ' / ' + number(all.length) + ' 项';
    if (!all.length) {
      $('upstream-skill-list').replaceChildren(text('p', 'upstream-empty', '当前目录没有返回逐项技能信息，请刷新目录重试。'));
      return;
    }
    if (!matches.length) {
      $('upstream-skill-list').replaceChildren(text('p', 'upstream-empty', '没有匹配项，换个关键词再试试。'));
      return;
    }
    $('upstream-skill-list').replaceChildren(...matches.map(({ source, skill }) => {
      const item = document.createElement('li');
      const head = document.createElement('div');
      head.className = 'upstream-skill-head';
      head.append(text('span', 'upstream-skill-source', source.name || source.id), text('span', '', skill.name || skill.path));
      item.append(head, text('code', '', skill.path || ''));
      if (skill.description) item.append(text('p', '', skill.description));
      return item;
    }));
  }

  function resetResult(message) {
    $('upstream-install-state').textContent = '等待检查';
    $('upstream-install-state').dataset.state = 'idle';
    $('upstream-file-state').textContent = '点击「检查已安装技能」，再核对这个软件。';
    $('upstream-rea-state').textContent = '等待检查连接配置';
    $('upstream-rea-state').dataset.state = 'idle';
    $('upstream-runtime-state').textContent = '仅在你点击时检查依赖';
    $('upstream-runtime-state').dataset.state = 'idle';
    $('upstream-result-note').textContent = message || (desktop
      ? '只检查上面选中的软件；目录与依赖状态按实际结果显示。'
      : '隔离预览只检查专用合成目录，不读取个人目录。');
  }

  function renderResult(result) {
    const upstream = result?.upstream;
    if (!upstream) throw new Error('安装结果缺少技能信息，请刷新后重新检查。');
    const seat = result.seat || $('upstream-seat').value;
    state.results.set(seat, result);
    if (seats.some(([id]) => id === seat)) $('upstream-seat').value = seat;
    const verified = upstream.verified === true;
    $('upstream-install-state').textContent = verified ? '文件已核验' : '等待安装或核对';
    $('upstream-install-state').dataset.state = verified ? 'ready' : 'pending';
    $('upstream-file-state').textContent = number(upstream.skillCount) + ' 项技能 · ' + number(upstream.fileCount) + ' 个文件 · ' + (verified ? '内容校验通过' : '尚未完成内容校验');
    const mcp = upstream.mcp || {};
    $('upstream-rea-state').textContent = mcp.message || (mcp.configured ? '连接配置已写入；重启目标客户端后加载。' : '这个客户端需要手动接入 REA。');
    const runtime = upstream.runtime || {};
    const runtimeReady = runtime.ready === true || (runtime.ready === undefined && runtime.ok === true);
    $('upstream-runtime-state').textContent = runtime.message || (runtimeReady ? 'REA 运行依赖已就绪。' : 'REA 依赖待准备，按上面的按钮继续。');
    $('upstream-rea-state').dataset.state = mcp.configured ? 'ready' : 'pending';
    $('upstream-runtime-state').dataset.state = runtimeReady ? 'ready' : 'pending';
    $('upstream-result-note').textContent = verified
      ? '文件已写入并核对，不等于客户端已加载。重启目标软件，再单独发送「冷咖啡」。'
      : (upstream.message || result.message || '如果尚未安装，先在上方勾选这个软件，点击「一键破甲」。');
  }

  async function loadCatalog() {
    if (state.busy) return;
    const generation = state.generation;
    setBusy(true);
    $('upstream-notice').textContent = '正在核对内置快照与技能目录…';
    try {
      const catalog = await api('catalog');
      if (!catalog || !Array.isArray(catalog.sources)) throw new Error('目录数据格式不完整，请刷新重试。');
      state.catalog = catalog;
      panel.dataset.state = 'ready';
      $('upstream-total-skills').textContent = number(catalog.skillCount);
      $('upstream-total-files').textContent = number(catalog.fileCount);
      $('upstream-total-bytes').textContent = bytes(catalog.bytes);
      $('upstream-runtime-range').textContent = catalog.runtime?.nodeRange || '以锁定运行时为准';
      $('upstream-runtime-version').textContent = catalog.runtime?.version ? 'REA 运行时 ' + catalog.runtime.version : 'REA 独立运行时';
      $('upstream-all-label').textContent = '查看全部 ' + number(catalog.skillCount) + ' 项技能';
      renderSources(catalog);
      renderSkills();
      $('upstream-notice').textContent = '随一键破甲自动附带；原词包和欢迎词保留，来源正文原样保存。';
      if (generation === state.generation && catalog.installed?.upstream) renderResult(catalog.installed);
    } catch (error) {
      $('upstream-notice').textContent = error.message || '技能目录读取失败，请重试。';
      panel.dataset.state = 'error';
    } finally { setBusy(false); }
  }

  async function inspect() {
    if (state.busy) return;
    const seat = $('upstream-seat').value;
    const generation = state.generation;
    setBusy(true);
    $('upstream-result-note').textContent = '正在检查所选软件的技能、REA 配置与运行依赖…';
    try {
      const result = await api('upstream-status', { seat });
      if (generation === state.generation) renderResult(result);
    }
    catch (error) { if (generation === state.generation) $('upstream-result-note').textContent = error.message || '状态读取失败，请重试。'; }
    finally { setBusy(false); }
  }

  async function prepare() {
    if (state.busy || !desktop) return;
    const seat = $('upstream-seat').value;
    const generation = state.generation;
    const name = seats.find(([id]) => id === seat)?.[1] || seat;
    const dialog = $('upstream-confirm');
    $('upstream-confirm-body').textContent = '为 ' + name + ' 已安装的 REA 准备运行依赖。此操作可能联网下载锁定依赖，并写入所选软件的 .coldcoffee-upstream 目录；不执行分析任务。未安装时请先用上方「一键破甲」。';
    const confirmed = await new Promise((resolve) => {
      let yes = false;
      $('upstream-confirm-ok').onclick = () => { yes = true; dialog.close(); };
      $('upstream-confirm-cancel').onclick = () => dialog.close();
      dialog.addEventListener('close', () => resolve(yes), { once: true });
      dialog.showModal();
    });
    if (!confirmed || state.busy || generation !== state.generation) return;
    setBusy(true);
    $('upstream-result-note').textContent = '正在准备 REA 依赖，请保留窗口；完成后以返回结果为准。';
    try {
      const result = await api('upstream-prepare', { seat, confirm: true });
      if (generation === state.generation) renderResult(result);
    }
    catch (error) { if (generation === state.generation) $('upstream-result-note').textContent = error.message || '依赖准备失败，请重试。'; }
    finally { setBusy(false); }
  }

  $('upstream-seat').replaceChildren(...seats.map(([id, name]) => {
    const option = text('option', '', name);
    option.value = id;
    return option;
  }));
  $('upstream-context').textContent = desktop ? '桌面版 · 只处理选中的软件' : '隔离预览 · 不读取个人目录';
  $('upstream-prepare').title = desktop ? '仅在点击并确认后准备依赖' : '隔离预览不准备用户依赖，请在桌面版操作';
  $('upstream-refresh').addEventListener('click', loadCatalog);
  $('upstream-search').addEventListener('input', renderSkills);
  $('upstream-seat').addEventListener('change', () => {
    const previous = state.results.get($('upstream-seat').value);
    if (previous) renderResult(previous);
    else resetResult();
  });
  $('upstream-status-check').addEventListener('click', inspect);
  $('upstream-prepare').addEventListener('click', prepare);
  $('upstream-copy-word').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText('冷咖啡'); $('upstream-copy-word').textContent = '已复制「冷咖啡」'; }
    catch { $('upstream-copy-word').textContent = '请手动发送：冷咖啡'; }
  });
  window.addEventListener('coldcoffee:upstream-install', (event) => {
    try { state.generation += 1; renderResult(event.detail); }
    catch (error) { $('upstream-result-note').textContent = error.message; }
  });
  window.addEventListener('coldcoffee:upstream-invalidate', (event) => {
    const seat = event.detail?.seat;
    if (!seats.some(([id]) => id === seat)) return;
    state.generation += 1;
    state.results.delete(seat);
    if ($('upstream-seat').value === seat) resetResult((event.detail.message || '本次安装已撤回。') + ' 请重新检查实际状态。');
  });
  resetResult();
  loadCatalog();
})();
