'use strict';
(() => {
  const icons = {
    visual: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    packs: '<path d="M12 3 4 7v6c0 4 8 8 8 8s8-4 8-8V7z"/><path d="m9 12 2 2 4-4"/>',
    relay: '<path d="M7 7h10l-3-3m3 13H7l3 3M4 9v6m16-6v6"/><circle cx="4" cy="7" r="2"/><circle cx="20" cy="17" r="2"/>',
    community: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m1 3a5 5 0 0 1 3 5v2"/>',
    toolbox: '<rect x="3" y="7" width="18" height="14" rx="3"/><path d="M8 7V4h8v3M3 12h18m-11 0v3h4v-3"/>',
    terminal: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m7 9 3 3-3 3m6 0h4"/>',
    cloud: '<path d="M7 18a5 5 0 1 1 .3-10A6 6 0 0 1 19 10a4 4 0 0 1-1 8z"/>',
    model: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z"/>',
  };
  const icon = name => `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.visual}</svg>`;
  for (const href of ['visual-gateway.css', 'brand-refresh.css', 'routing-panel.css', 'route-courier.css']) {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = href; document.head.append(css);
  }
  const nav = document.createElement('button'); nav.className = 'nav'; nav.dataset.page = 'visual';
  nav.innerHTML = `<span class="vg-nav-icon" aria-hidden="true">${icon('visual')}</span><span>可视化工作台</span><kbd>首页</kbd>`;
  document.querySelector('.sidebar nav').prepend(nav);
  document.querySelectorAll('.sidebar .nav:not([data-page="visual"])').forEach(button => {
    for (const node of [...button.childNodes]) if (node.nodeType === Node.TEXT_NODE) node.remove();
    const mark = document.createElement('span'); mark.className = 'shell-nav-icon'; mark.setAttribute('aria-hidden', 'true'); mark.innerHTML = icon(button.dataset.page); button.prepend(mark);
  });
  const version = document.querySelector('.topbar .version');
  if (version) version.textContent = '可视化融合 · 路由增强预览';
  const subtitle = document.querySelector('.brand strong span'); if (subtitle) subtitle.textContent = '可视化工作台';
  const oldRelayLabel = document.querySelector('.nav[data-page="relay"] span:not(.shell-nav-icon)'); if (oldRelayLabel) oldRelayLabel.textContent = '高级接入';
  const page = document.createElement('section'); page.id = 'page-visual'; page.className = 'page vg';
  page.innerHTML = `
    <header class="vg-heading"><img class="vg-hero-art" src="../../assets/brand-v6/hero.webp" alt="冷咖啡原创白发女生与咖啡主视觉"><div class="vg-hero-copy"><div class="vg-hero-eyebrow"><span class="vg-kicker">冷咖啡 · 可视化工作台</span><span id="vg-engine" class="vg-pill">网关准备中</span></div><h1>连接你的 AI<span>，</span><br>掌控每一步<span>。</span></h1><p>中转、模型、工作流与每次请求，都在这里。</p><div class="vg-heading-actions"><button id="vg-setup" class="vg-primary">一键接入 AI <span>→</span></button><button id="vg-demo" class="vg-secondary">体验可视化 ↗</button><span class="vg-hero-note">备份后接入 · 随时可撤回</span></div></div><span class="vg-hero-sign">一杯冷咖啡，一起开工。</span></header>
    <div id="vg-banner" class="vg-banner" role="status" hidden></div>
    <div class="vg-stats"><div><span>最近请求</span><strong id="vg-count">0</strong><small>经过本机网关</small></div><div><span>成功响应</span><strong id="vg-success">—</strong><small id="vg-success-note">等待第一条请求</small></div><div><span>平均耗时</span><strong id="vg-latency">—</strong><small>已完成请求</small></div><div><span>当前模型</span><strong id="vg-model-stat" class="vg-stat-model">等待连接</strong><small id="vg-model-note">以中转实际列表为准</small></div></div>
    <div class="vg-grid">
      <section class="vg-card vg-flow-card"><div class="vg-card-head"><div><span class="vg-live-dot"></span><h2>实时路由</h2><span class="vg-subtle" id="vg-flow-label">等待第一条请求</span></div><button id="vg-groups-open" class="vg-secondary">管理路由组</button></div>
        <div class="vg-route-heading"><div><strong id="vg-route-name">等待网关记录</strong><p id="vg-route-policy">每条候选、每次尝试，以网关实际记录为准。</p></div><label>查看请求<select id="vg-route-select" aria-label="查看路由请求"><option>等待请求</option></select></label></div>
        <div class="vg-flow vg-routing" id="vg-flow" data-flow="idle">
          <div class="vg-origins">
          <button class="vg-node" id="vg-client-node"><span class="vg-node-icon vg-client-icon">${icon('terminal')}</span><strong id="vg-client-name">你的 AI 软件</strong><small id="vg-client-status">点击选择软件</small></button>
          <button class="vg-node vg-hub" id="vg-hub-node"><span class="vg-node-icon"><img src="../../assets/brand-v6/avatar.webp" alt="冷咖啡"></span><strong>冷咖啡网关</strong><small id="vg-port">本机处理</small></button>
          </div><div id="vg-branches" class="vg-branches" aria-label="网关记录的候选分支"></div>
        </div><div class="vg-flow-bottom"><span id="vg-flow-status">一键接入后，请求会在这里实时显示。</span><div><button id="vg-relay-node" class="vg-text-button">连接 / 添加中转</button><button id="vg-model-node" class="vg-text-button">选择接入模型</button><button id="vg-flow-detail" class="vg-text-button" type="button">查看全部细节 ↗</button></div></div>
        <div class="vg-courier-controls"><span id="vg-courier-status" role="status">布偶猫待命 · 等待请求</span><button id="vg-courier-toggle" type="button" aria-pressed="true">布偶猫动效 · 开</button><button id="vg-courier-replay" type="button" disabled>回放所选路径</button></div>
        <div class="vg-route-totals"><span>本次引擎运行累计 · 包含本机演示</span><div><strong id="vg-total-requests">0</strong> 请求 <strong id="vg-total-rerouted">0</strong> 改道 <strong id="vg-total-errors">0</strong> 客户端收到错误</div></div>
        <div class="vg-decision"><div class="vg-decision-heading"><h3>这条请求是怎样路由的</h3><span id="vg-request-id"></span></div><ol id="vg-route-story"></ol></div>
      </section>
      <section class="vg-card vg-context-card"><div class="vg-card-head"><div><h2>上下文分布</h2><span class="vg-subtle" id="vg-context-basis">点击色块查看内容</span></div><button id="vg-privacy" class="vg-text-button" aria-pressed="true">◉ 内容已隐藏</button></div>
        <div class="vg-context-summary"><strong id="vg-used">—<small>词元已用</small></strong><div class="vg-capacity"><div><span id="vg-window-label">窗口余量</span><b id="vg-free">等待请求</b></div><div class="vg-capacity-track"><i id="vg-capacity-fill"></i></div></div><span id="vg-fill" class="vg-fill">—</span></div>
        <div class="vg-context-tools"><div id="vg-context-modes" class="vg-segment" role="group" aria-label="上下文显示方式"><button data-context-mode="window" aria-pressed="true">总窗口</button><button data-context-mode="content" aria-pressed="false">放大已用内容</button></div><span id="vg-cache">缓存命中：等待用量</span><span id="vg-turns"></span></div>
        <div id="vg-treemap" class="vg-treemap" aria-label="上下文分类面积图"><div class="vg-empty-context"><span>▦</span><strong>让每一次上下文都看得见</strong><p>点击上方「体验可视化」，从一次本机演示开始。</p></div></div>
        <div id="vg-legend" class="vg-legend"></div><p class="vg-context-foot" id="vg-context-foot">只观测经过本机网关的请求；分类面积依据请求内容测量。</p><div class="vg-context-list-head"><strong>内容明细</strong><select id="vg-context-filter" aria-label="筛选上下文分类"><option value="all">全部分类</option></select></div><div id="vg-context-items" class="vg-context-items"></div>
      </section>
    </div><div class="vg-service-grid">
      <section class="vg-card vg-quick"><div class="vg-card-head"><h2>现在就开始</h2><span class="vg-mini-number">01—03</span></div><ol class="vg-onboarding"><li id="vg-step-client"><b>1</b><div><strong>选择你的软件</strong><span>Codex · Claude · DeepSeek</span></div></li><li id="vg-step-relay"><b>2</b><div><strong>连接冷咖啡中转</strong><span>填自己的 Key，自动读模型</span></div></li><li id="vg-step-connect"><b>3</b><div><strong>备份并接入</strong><span>打开目标软件，输入「冷咖啡」</span></div></li></ol><button id="vg-quick-start" class="vg-primary vg-wide">开始接入 <span>→</span></button><div class="vg-model-picker"><label for="vg-model-select">下一次接入选用的模型</label><select id="vg-model-select"><option value="">先连接中转</option></select></div><button id="vg-install" class="vg-secondary vg-wide">安装 / 更新工作流</button><p class="vg-small-note">原来的十五个模型席位与技能包，仍在「一键破甲」里。</p></section>
      <section class="vg-card vg-service"><span class="vg-kicker">冷咖啡付费中转</span><h3>少折腾，直接开工。</h3><p>内置工作流体验，接入 API 即可使用。按站内方案计费。</p><button id="vg-site" class="vg-site-button">coldcoffeeai.com <span>↗</span></button><div class="vg-service-links"><button id="vg-community">四个 QQ 群 / Telegram</button><button id="vg-custom">闭源工作流定制 ↗</button></div></section>
    </div>
    <section class="vg-card vg-history"><div class="vg-card-head"><div><h2>最近请求</h2><span id="vg-history-note" class="vg-subtle">点击一条，查看链路与上下文</span></div><div class="vg-history-actions"><select id="vg-filter" aria-label="筛选请求"><option value="all">全部请求</option><option value="real">真实中转</option><option value="demo">本机演示</option><option value="error">异常请求</option></select><button id="vg-refresh" class="vg-text-button">刷新</button></div></div><div id="vg-requests" class="vg-requests"><p class="vg-no-requests">还没有请求。接入软件后开始聊天，或先体验一次可视化。</p></div></section>
    <details class="vg-test-box"><summary>发一条测试消息 <span>真实模型请求会产生中转用量</span></summary><form id="vg-test-form"><label for="vg-test-input">测试内容</label><div><input id="vg-test-input" maxlength="16000" value="只回答：冷咖啡连接成功。"><button class="vg-primary" type="submit" id="vg-send">发送测试</button><button type="button" id="vg-cancel">停止</button></div></form><pre id="vg-response" aria-live="polite">在这里查看流式返回。</pre></details>
    <details class="vg-test-box"><summary>本机连接信息与恢复 <span>其他客户端也可以接入这个网关</span></summary><p id="vg-endpoint" class="vg-small-note">网关准备中</p><div class="vg-utility-actions"><button id="vg-copy-connection" type="button">复制连接信息</button><button id="vg-restore" type="button" disabled>恢复接入前配置</button></div><p id="vg-restore-note" class="vg-small-note">备份保存在本机，恢复前核对文件是否又被修改。</p></details>
    <div class="vg-bottom-note"><span>冷咖啡原创界面 · 本机网关实时观测</span><div><button id="vg-console" class="vg-console-button">完整引擎 / 高级功能 ↗</button><button id="vg-about">关于与开源许可</button></div></div>
    <dialog id="vg-setup-dialog" class="vg-dialog"><div class="vg-dialog-head"><div><span class="vg-kicker">冷咖啡 · 快速接入</span><h2>三步，接好你的 AI。</h2></div><button data-vg-close="vg-setup-dialog" aria-label="关闭接入窗口">×</button></div><div class="vg-dialog-progress"><button data-vg-stage="1" class="on"><b>1</b>选软件</button><span></span><button data-vg-stage="2"><b>2</b>连中转</button><span></span><button data-vg-stage="3"><b>3</b>接好就用</button></div>
      <section class="vg-stage" data-vg-section="1"><h3>你准备用哪个软件？</h3><p>按软件自己的配置格式接入，原配置先备份。</p><div id="vg-clients" class="vg-client-choices"></div><div class="vg-dialog-actions"><span>其他客户端也可使用本机 API 地址。</span><button id="vg-next-relay" class="vg-primary">下一步：连接中转 →</button></div></section>
      <section class="vg-stage" data-vg-section="2" hidden><form id="vg-relay-form"><div class="vg-field-row"><label>选择中转<select id="vg-provider-select"><option value="coldcoffee">冷咖啡中转</option><option value="new">＋ 添加其他中转</option></select></label><button id="vg-buy" type="button" class="vg-text-button">购买 / 充值 ↗</button></div><div id="vg-other-provider" hidden><label>中转名称<input id="vg-provider-name" maxlength="40" placeholder="给这个中转取个名字"></label><label>API 地址<input id="vg-base" value="https://coldcoffeeai.com/v1" type="url" autocomplete="off"></label></div><label for="vg-key">填入你自己的 API Key</label><div class="vg-secret-field"><input id="vg-key" type="password" autocomplete="off" spellcheck="false" placeholder="填一次，接入你的软件"><button id="vg-key-toggle" type="button">显示</button></div><label class="vg-checkbox"><input id="vg-remember" type="checkbox">在这台电脑上加密记住 Key</label><p id="vg-key-note" class="vg-small-note">Key 由本机处理，连接信息中仅使用本机网关凭据。</p><details class="vg-protocol"><summary>接口协议与高级设置</summary><label>中转协议<select id="vg-protocol"><option value="auto">自动适配（Chat / Responses）</option><option value="responses">仅 OpenAI Responses</option><option value="chat">仅 OpenAI Chat</option></select></label></details><div class="vg-dialog-actions"><button type="button" data-vg-back="1">上一步</button><button id="vg-verify" class="vg-primary" type="submit">验证 Key，读取模型 →</button></div></form></section>
      <section class="vg-stage" data-vg-section="3" hidden><div class="vg-connect-summary"><span>✦</span><div><h3 id="vg-ready-title">准备接入</h3><p id="vg-ready-text">先验证中转，再选模型。</p></div></div><label for="vg-setup-model">选择模型<select id="vg-setup-model"></select></label><label class="vg-checkbox"><input type="checkbox" id="vg-with-skills">接入后，一并安装冷咖啡工作流与技能包</label><p class="vg-small-note">这会使用原有一键安装器，备份并写入所选软件的技能文件。</p><div id="vg-plan" class="vg-plan" hidden></div><div class="vg-dialog-actions"><button type="button" data-vg-back="2">上一步</button><button id="vg-connect" class="vg-primary">检查配置变更 →</button></div><div id="vg-connected" class="vg-connected" hidden><strong>✓ 接入配置已写入</strong><p id="vg-restart-note"></p><div><span>在目标软件的对话框发送</span><button id="vg-copy-word">冷咖啡 ⧉</button></div><p>开始聊天后，回到连接图查看真实请求。</p><button id="vg-finish" class="vg-primary">回到可视化工作台 →</button></div></section><p id="vg-setup-status" class="vg-dialog-status" role="status" aria-live="polite"></p>
    </dialog>
    <dialog id="vg-detail-dialog" class="vg-dialog vg-detail-dialog"><div class="vg-dialog-head"><h2 id="vg-detail-title">请求详情</h2><button data-vg-close="vg-detail-dialog" aria-label="关闭详情">×</button></div><div id="vg-detail-meta"></div><div id="vg-detail-content"></div></dialog>
    <dialog id="vg-groups-dialog" class="vg-dialog vg-groups-dialog"><div class="vg-dialog-head"><div><span class="vg-kicker">多模型 · 多中转 · 自动切换</span><h2>路由组</h2></div><button data-vg-close="vg-groups-dialog" aria-label="关闭路由组">×</button></div><p class="vg-small-note">把多个模型或其他路由组组合成一个入口，再把这个入口接到你的 AI 软件。图中的历史请求保持原样，新策略只影响后续请求。</p><div id="vg-group-cards"></div><button id="vg-group-new" class="vg-secondary vg-wide">＋ 新建路由组</button><form id="vg-group-form" hidden><h3 id="vg-group-form-title">新建路由组</h3><div class="vg-field-row"><label>组名称<input id="vg-group-name" maxlength="80" required placeholder="例如：冷咖啡编程主备"></label><label>英文标识<input id="vg-group-id" maxlength="64" pattern="[a-z0-9][a-z0-9.\u002d]*" required placeholder="例如：coding-failover"></label></div><div class="vg-field-row"><label>路由策略<select id="vg-group-routing"></select></label><label>会话保持<select id="vg-group-affinity"></select></label></div><p class="vg-small-note" id="vg-group-edit-note">成员顺序决定「按顺序」策略的优先级。</p><div id="vg-group-members" class="vg-group-members"></div><div class="vg-field-row"><select id="vg-group-add" aria-label="选择路由组成员"></select><button id="vg-group-add-button" type="button">添加成员</button></div><div class="vg-dialog-actions"><button type="button" id="vg-group-abandon">取消编辑</button><button id="vg-group-save" type="submit" class="vg-primary">保存到网关</button></div></form><p id="vg-group-status" role="status" class="vg-dialog-status"></p></dialog>
  `;
  document.querySelector('main').prepend(page);
  const $ = id => document.getElementById(id);
  const state = { snapshot: null, clients: [], models: [], client: 'codex', selected: '', routeId: null, private: true, stage: 1, plan: null, polling: false, sending: false, formBusy: false, stream: '', historySignature: '', legacySignature: '', restoreConfirm: false };
  const panel = window.ColdCoffeeRoutingPanel.create({ $, state, call: (action, input) => call(action, input), number: value => number(value), detailRoute: route => detailRoute(route), detailContext: (route, kind, index) => detailContext(route, kind, index), changed: () => render() });
  const courier = window.ColdCoffeeCourier.create({ $, page });
  const parts = { system: ['系统提示', '#e4576b'], tools: ['工具说明', '#be596b'], skills: ['技能', '#cda78c'], memory: ['工作说明', '#b5b8bf'], files: ['文件内容', '#78998e'], results: ['工具结果', '#a17d78'], chat: ['会话内容', '#939ba8'] };
  const number = value => new Intl.NumberFormat('zh-CN').format(Math.max(0, Number(value) || 0));
  const shortModel = value => (value || '').replace(/^[^/]+\//, '');
  const call = (action, payload) => window.coldbrew?.gateway ? window.coldbrew.gateway(action, payload) : Promise.reject(new Error('请在冷咖啡桌面软件中使用网关'));
  const tell = message => { $('vg-banner').hidden = !message; $('vg-banner').textContent = message || ''; };
  const status = message => { $('vg-setup-status').textContent = message || ''; };
  function show() {
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p === page));
    document.querySelectorAll('.nav').forEach(n => n.classList.toggle('active', n === nav));
    document.body.dataset.page = 'visual';
  }
  nav.addEventListener('click', show);
  const observer = new MutationObserver(() => { document.body.dataset.page = page.classList.contains('active') ? 'visual' : 'other'; });
  document.querySelectorAll('.page').forEach(p => observer.observe(p, { attributes: true, attributeFilter: ['class'] }));
  function go(name) { const link = document.querySelector(`.nav[data-page="${name}"]`); if (link) link.click(); }
  function external(url) { window.coldbrew?.openExternal(url).catch(error => tell(error.message)); }
  function stage(value) {
    state.stage = value; status('');
    document.querySelectorAll('[data-vg-section]').forEach(s => { s.hidden = Number(s.dataset.vgSection) !== value; });
    document.querySelectorAll('[data-vg-stage]').forEach(b => { b.classList.toggle('on', Number(b.dataset.vgStage) === value); });
    if (value === 3) {
      state.plan = null; $('vg-plan').hidden = true; $('vg-connect').hidden = false; $('vg-connect').textContent = '检查配置变更 →';
      const client = state.clients.find(c => c.id === state.client);
      $('vg-ready-title').textContent = `接到 ${client?.name || '所选软件'}`;
      $('vg-ready-text').textContent = `中转已验证 · ${state.models.length} 个可用模型 · 接入前保存备份`;
      $('vg-connected').hidden = true;
    }
  }
  async function openSetup(value = 1) {
    $('vg-setup-dialog').showModal(); stage(value);
    try { state.clients = await call('clients'); renderClients(); } catch (error) { status(error.message); }
  }
  function renderClients() {
    $('vg-clients').replaceChildren(...state.clients.map(client => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'vg-client-choice'; button.dataset.client = client.id; button.setAttribute('aria-pressed', String(client.id === state.client));
      const mark = document.createElement('b'); mark.textContent = client.id === 'codex' ? '⌘' : client.id === 'claude' ? '✳' : '≈';
      const name = document.createElement('strong'); name.textContent = client.name;
      const note = document.createElement('span'); note.textContent = client.connected ? '已写入接入配置' : client.detected ? '发现配置目录' : '连接时创建配置';
      button.append(mark, name, note); button.addEventListener('click', () => { state.client = client.id; state.plan = null; renderClients(); render(); }); return button;
    }));
  }
  function syncModels() {
    const models = state.snapshot?.availableModels || (state.snapshot?.providers || []).filter(p => p.hasKey).flatMap(p => p.models.map(m => ({ id: `${p.id}/${m}`, name: m, provider: p.name })));
    const signature = JSON.stringify(models);
    if (signature === JSON.stringify(state.models)) {
      for (const id of ['vg-model-select', 'vg-setup-model']) $(id).value = state.selected;
      return;
    }
    state.models = models;
    if (!models.some(m => m.id === state.selected)) state.selected = models.find(m => /gpt-6-astra|gpt-6\.1-sol|deepseek-flash/.test(m.id))?.id || models[0]?.id || '';
    for (const id of ['vg-model-select', 'vg-setup-model']) {
      const options = models.length ? models.map(model => { const option = document.createElement('option'); option.value = model.id; option.textContent = `${model.name} · ${model.provider}`; return option; }) : [Object.assign(document.createElement('option'), { value: '', textContent: '先连接中转' })];
      $(id).replaceChildren(...options); $(id).value = state.selected;
    }
    const selectedProvider = $('vg-provider-select').value;
    $('vg-provider-select').replaceChildren(...[...new Map([{ id: 'coldcoffee', name: '冷咖啡中转' }, ...(state.snapshot?.providers || []), { id: 'new', name: '＋ 添加其他中转' }].map(p => [p.id, p])).values()].map(p => Object.assign(document.createElement('option'), { value: p.id, textContent: p.name })));
    if ([...$('vg-provider-select').options].some(o => o.value === selectedProvider)) $('vg-provider-select').value = selectedProvider;
  }
  function currentRoute() {
    const rows = state.snapshot?.routes || [];
    return rows.find(r => r.id === state.routeId) || rows.at(-1);
  }
  function render() {
    if (!state.snapshot) return;
    syncModels();
    const s = state.snapshot, routes = s.routes || [], route = currentRoute(), engine = s.engine;
    const client = state.clients.find(c => c.id === state.client);
    $('vg-engine').textContent = engine.running ? '● 网关已就绪' : '○ 网关未启动'; $('vg-engine').dataset.ready = String(engine.running);
    $('vg-port').textContent = engine.running ? `本机 :${engine.port}` : '点击重新启动';
    const agentNames = { codex: 'Codex', claude: 'Claude Code', 'claude-code': 'Claude Code', dsh: 'DeepSeek Harness', 'ColdCoffee-Workbench': '冷咖啡工作台' };
    $('vg-client-name').textContent = route?.demo ? '冷咖啡演示' : route ? agentNames[route.agent] || route.agent || 'AI 客户端' : client?.name || '你的 AI 软件';
    $('vg-client-status').textContent = route?.demo ? '来自软件内体验请求' : route ? '网关实际观测到的来源' : client?.connected ? '接入配置已写入' : '点击选择软件';
    if (client?.needsReconnect) $('vg-client-status').textContent = '端口已调整，请重新接入';
    $('vg-endpoint').textContent = engine.running ? `API 地址：${engine.url}/v1 · 本机凭据：coldcoffee-local · 所选模型：${state.selected || '先验证中转'}` : '网关尚未启动，点击连接图里的网关节点重新启动。';
    $('vg-restore').disabled = !client?.connected;
    $('vg-restore-note').textContent = `当前选择：${client?.name || 'Codex'}。恢复前核对配置与备份，保留接入后的其他修改。`;
    const completed = routes.filter(r => r.done), successful = completed.filter(r => r.status >= 200 && r.status < 300 && !r.error);
    $('vg-count').textContent = number(routes.length); $('vg-success').textContent = completed.length ? `${Math.round(successful.length / completed.length * 100)}%` : '—';
    $('vg-success-note').textContent = completed.length ? `${successful.length} / ${completed.length} 条完成` : '等待第一条请求';
    $('vg-latency').textContent = completed.length ? `${(completed.reduce((n, r) => n + r.ms, 0) / completed.length / 1000).toFixed(2)} 秒` : '—';
    const observedModel = route ? route.actualModel || shortModel(route.model) : shortModel(state.selected);
    $('vg-model-stat').textContent = route?.demo ? '本机演示' : observedModel || '等待连接'; $('vg-model-stat').title = route?.model || state.selected;
    $('vg-model-note').textContent = route?.demo ? '真实本机请求 · 零费用演示' : route ? '最近观测到的模型' : '以中转实际列表为准';
    const running = route ? !route.done : false;
    $('vg-flow').dataset.flow = running ? 'running' : route && (route.status >= 400 || route.error || route.status < 200) ? 'error' : route ? 'done' : 'idle';
    $('vg-flow-label').textContent = running ? '所选请求正在响应 · 实时观测' : route ? route.demo ? '本机演示 · 实际经过网关' : '网关记录 · 所选请求' : '准备好，开始第一条请求';
    $('vg-flow-status').textContent = running ? `请求 #${route.id} · 正在响应 · ${number(route.bytes)} 字节` : route ? `${route.status >= 400 || route.error ? '请求异常' : '已完成'} · HTTP ${route.status || '—'} · ${((route.ms || 0) / 1000).toFixed(2)} 秒${route.demo ? ' · 本机演示' : ''}` : '一键接入后，请求会在这里实时显示。';
    $('vg-step-client').classList.toggle('done', !!client); $('vg-step-relay').classList.toggle('done', state.models.length > 0); $('vg-step-connect').classList.toggle('done', client?.connected === true);
    $('vg-send').disabled = state.sending || !state.selected; $('vg-demo').disabled = state.sending;
    $('vg-remember').disabled = !s.encryption;
    $('vg-key-note').textContent = s.encryption ? 'Key 使用系统加密保存；截图和连接配置中隐藏真实 Key。' : '当前系统加密存储尚未就绪，Key 仅用于本次运行。';
    if (engine.running && state.selected) {
      const signature = engine.url + '|' + state.selected;
      if (signature !== state.legacySignature) {
        state.legacySignature = signature;
        window.dispatchEvent(new CustomEvent('coldcoffee:gateway-ready', { detail: { baseUrl: engine.url + '/v1', model: state.selected } }));
      }
    }
    panel.render(route); courier.render(route); renderContext(route); renderHistory();
  }
  function renderContext(route) {
    panel.renderContext(route);
  }
  function renderHistory() {
    const filter = $('vg-filter').value;
    const rows = (state.snapshot?.routes || []).filter(r => filter === 'real' ? !r.demo : filter === 'demo' ? r.demo : filter === 'error' ? r.done && (r.status >= 400 || r.error || r.status < 200) : true).slice().reverse().slice(0, 12);
    const signature = JSON.stringify([filter, rows.map(r => [r.id, r.done, r.status, r.ms]), state.routeId]); if (signature === state.historySignature) return; state.historySignature = signature;
    $('vg-requests').replaceChildren(...rows.map(route => {
      const row = document.createElement('button'); row.className = 'vg-request'; row.dataset.id = String(route.id); row.classList.toggle('selected', route.id === currentRoute()?.id);
      const dot = document.createElement('i'); dot.dataset.state = !route.done ? 'running' : route.status >= 400 || route.error || route.status < 200 ? 'error' : 'done';
      const model = document.createElement('strong'); model.textContent = shortModel(route.model);
      const type = document.createElement('span'); type.className = 'vg-request-type'; type.textContent = route.demo ? '本机演示' : route.agent || '客户端';
      const response = document.createElement('span'); response.textContent = route.done ? `HTTP ${route.status}` : '处理中';
      const time = document.createElement('span'); time.textContent = route.done ? `${(route.ms / 1000).toFixed(2)} 秒` : '流式返回';
      const open = document.createElement('b'); open.textContent = '↗'; row.append(dot, model, type, response, time, open);
      row.addEventListener('click', () => { state.routeId = route.id; render(); });
      row.addEventListener('dblclick', () => detailRoute(route)); return row;
    }));
    if (!rows.length) $('vg-requests').append(Object.assign(document.createElement('p'), { className: 'vg-no-requests', textContent: '这个分类里还没有请求。可以先体验可视化，或接入你的软件。' }));
  }
  function detailRoute(route) {
    $('vg-detail-title').textContent = '这条请求的完整路由记录';
    $('vg-detail-meta').textContent = `${route.demo ? '本机演示' : '网关实际记录'} · 请求 ${route.model} · 回答 ${route.actualModel || '尚未记录'} · HTTP ${route.status || '—'} · ${((route.ms || 0) / 1000).toFixed(2)} 秒`;
    const steps = document.createElement('ol'); steps.className = 'vg-detail-story'; steps.append(...panel.decisionList(route));
    $('vg-detail-content').replaceChildren(steps);
    if (route.error) $('vg-detail-content').append(Object.assign(document.createElement('pre'), { textContent: route.error }));
    $('vg-detail-dialog').showModal();
  }
  async function detailContext(route, kind, selectedItem = null) {
    $('vg-detail-title').textContent = `${parts[kind]?.[0] || kind} · 上下文明细`; $('vg-detail-meta').textContent = `${shortModel(route.model)} · ${route.prompt.counted ? '总量采用供应商计数，分区为测量值' : '按请求内容估算'}`;
    const content = $('vg-detail-content'); content.textContent = '正在读取本机网关记录…'; $('vg-detail-dialog').showModal();
    try {
      const data = await call('context', { id: route.id, kind }); content.replaceChildren();
      for (const [index, item] of (data.items || []).entries()) {
        if (selectedItem !== null && index !== selectedItem) continue;
        const article = document.createElement('article'); article.className = 'vg-context-item';
        const name = document.createElement('strong'); name.textContent = state.private ? `${parts[kind]?.[0]} · 项目 ${index + 1}` : item.name;
        const count = document.createElement('span'); count.textContent = `${number(item.tokens)} 词元`;
        const button = document.createElement('button'); button.textContent = state.private ? '显示本项内容' : '查看原文';
        button.addEventListener('click', async () => {
          button.disabled = true;
          try { const detail = await call('context', { id: route.id, kind, item: index }); const pre = document.createElement('pre'); pre.textContent = (detail.items?.[index]?.pieces || []).map(p => p.text || p.content || '').join('\n') || '这项原文已离开网关内存。'; article.append(pre); }
          catch (error) { article.append(Object.assign(document.createElement('p'), { textContent: error.message })); }
        });
        article.append(name, count, button); content.append(article);
      }
      if (!data.items?.length) content.textContent = '此分类未保留逐项内容。';
    } catch (error) { content.textContent = error.message; }
  }
  async function refresh() {
    if (state.polling) return; state.polling = true;
    try { state.snapshot = await call('snapshot'); render(); } catch (error) { tell(error.message); } finally { state.polling = false; }
  }
  async function send(demo, text) {
    if (state.sending) return; state.sending = true; state.stream = ''; $('vg-response').textContent = '';
    tell(demo ? '本机演示：请求实际经过本机网关，使用本机演示服务，费用为零。' : '正在请求你选择的真实中转模型，此操作会产生中转用量。'); render();
    try { const result = await call(demo ? 'demo' : 'send', { model: state.selected, text }); $('vg-response').textContent = result.text; if (!demo) tell('模型已返回，点击请求记录与上下文色块查看详情。'); state.routeId = null; }
    catch (error) { tell(error.message); } finally { state.sending = false; await refresh(); }
  }
  $('vg-setup').onclick = () => openSetup(); $('vg-quick-start').onclick = () => openSetup(); $('vg-client-node').onclick = () => openSetup(1); $('vg-relay-node').onclick = () => openSetup(2); $('vg-model-node').onclick = () => openSetup(state.models.length ? 3 : 2);
  $('vg-hub-node').onclick = async () => { if (!state.snapshot?.engine.running) { try { await call('start'); await refresh(); } catch (error) { tell(error.message); } } else { tell('冷咖啡网关在本机运行，点击「完整引擎」使用高级功能；组件信息见「关于与开源许可」。'); } };
  $('vg-next-relay').onclick = () => stage(2);
  document.querySelectorAll('[data-vg-close]').forEach(b => b.onclick = () => $(b.dataset.vgClose).close());
  document.querySelectorAll('[data-vg-back]').forEach(b => b.onclick = () => { if (!state.formBusy) stage(Number(b.dataset.vgBack)); });
  document.querySelectorAll('[data-vg-stage]').forEach(b => b.onclick = () => { const value = Number(b.dataset.vgStage); if (!state.formBusy && (value < 3 || state.models.length)) stage(value); });
  $('vg-key-toggle').onclick = () => { const input = $('vg-key'); input.type = input.type === 'password' ? 'text' : 'password'; $('vg-key-toggle').textContent = input.type === 'password' ? '显示' : '隐藏'; };
  $('vg-provider-select').onchange = () => { const id = $('vg-provider-select').value, provider = state.snapshot?.providers.find(p => p.id === id); $('vg-other-provider').hidden = id === 'coldcoffee'; $('vg-base').value = provider?.baseUrl || (id === 'coldcoffee' ? 'https://coldcoffeeai.com/v1' : ''); $('vg-provider-name').value = provider?.name || ''; $('vg-key').value = ''; $('vg-key').placeholder = provider?.hasKey ? '已保存 · 留空使用现有 Key' : '填入这个中转的 API Key'; $('vg-protocol').value = provider?.wireApi || 'auto'; };
  $('vg-relay-form').onsubmit = async event => {
    event.preventDefault(); if (state.formBusy) return; state.formBusy = true; $('vg-verify').disabled = true; status('正在验证 Key 并获取真实模型列表…');
    const selected = $('vg-provider-select').value;
    const id = selected === 'new' ? `relay-${Date.now().toString(36)}` : selected;
    try {
      await call('configure', { id, name: $('vg-provider-name').value, baseUrl: selected === 'coldcoffee' ? 'https://coldcoffeeai.com/v1' : $('vg-base').value, key: $('vg-key').value, remember: $('vg-remember').checked, wireApi: $('vg-protocol').value });
      $('vg-key').value = ''; await refresh(); stage(3); status(`验证通过，读取到 ${state.models.length} 个可用模型。`);
    } catch (error) { status(error.message); } finally { state.formBusy = false; $('vg-verify').disabled = false; }
  };
  for (const id of ['vg-model-select', 'vg-setup-model']) $(id).onchange = () => { state.selected = $(id).value; state.plan = null; $('vg-connect').textContent = '检查配置变更 →'; $('vg-plan').hidden = true; $('vg-model-select').value = state.selected; $('vg-setup-model').value = state.selected; render(); };
  $('vg-connect').onclick = async () => {
    if (state.formBusy) return; state.formBusy = true; $('vg-connect').disabled = true;
    try {
      if (!state.plan) {
        status('正在按目标软件的原生配置格式检查变更…');
        const plan = await call('plan', { client: state.client, model: state.selected });
        if (plan.unchanged) { status(plan.message); return; }
        state.plan = plan; const list = document.createElement('ul');
        for (const file of plan.files) list.append(Object.assign(document.createElement('li'), { textContent: `${file.action} · ${file.name}` }));
        $('vg-plan').replaceChildren(Object.assign(document.createElement('strong'), { textContent: '将更新以下配置，原文件先备份：' }), list); $('vg-plan').hidden = false;
        $('vg-connect').textContent = '备份并一键接入'; status('检查清楚后，点「备份并一键接入」完成。');
      } else {
        status('正在保存备份并写入配置…');
        const result = await call('connect', { id: state.plan.id }); state.plan = null;
        if ($('vg-with-skills').checked) {
          status('接入配置已写入，正在安装工作流与技能包…');
          try { await window.coldbrew.beginner('install', { seat: state.client, confirm: true }); }
          catch (error) { tell(`中转已接入；技能安装需继续处理：${error.message}。可到「一键破甲」重试。`); }
        }
        state.clients = await call('clients'); renderClients(); $('vg-plan').hidden = true;
        $('vg-connected').hidden = false; $('vg-restart-note').textContent = result.restart; $('vg-connect').hidden = true;
        status('配置已写入；真实调用状态将在请求经过网关后更新。'); await refresh();
      }
    } catch (error) { state.plan = null; $('vg-connect').textContent = '重新检查配置 →'; status(error.message); }
    finally { state.formBusy = false; $('vg-connect').disabled = false; }
  };
  $('vg-setup-dialog').addEventListener('close', () => { $('vg-key').value = ''; $('vg-key').type = 'password'; $('vg-connect').hidden = false; $('vg-connect').textContent = '检查配置变更 →'; $('vg-plan').hidden = true; state.plan = null; });
  $('vg-copy-word').onclick = () => navigator.clipboard.writeText('冷咖啡').then(() => status('已复制「冷咖啡」，到目标软件发送。')).catch(() => status('启动口令：冷咖啡'));
  $('vg-finish').onclick = () => { $('vg-setup-dialog').close(); show(); };
  $('vg-install').onclick = () => go('packs'); $('vg-site').onclick = () => external('https://coldcoffeeai.com/'); $('vg-buy').onclick = () => external('https://coldcoffeeai.com/'); $('vg-community').onclick = () => go('community'); $('vg-custom').onclick = () => go('community');
  $('vg-demo').onclick = () => send(true); $('vg-test-form').onsubmit = event => { event.preventDefault(); send(false, $('vg-test-input').value); };
  $('vg-flow-detail').onclick = () => { const route = currentRoute(); if (route) detailRoute(route); else tell('先体验可视化或发送一条真实请求，再查看详情。'); };
  $('vg-cancel').onclick = () => call('cancel').catch(error => tell(error.message));
  $('vg-copy-connection').onclick = () => navigator.clipboard.writeText(`API Base URL: ${state.snapshot?.engine.url}/v1\nAPI Key: coldcoffee-local\nModel: ${state.selected || '先连接中转再选择模型'}`).then(() => tell('已复制本机连接信息，其中包含的是本机凭据。')).catch(() => tell('请从连接信息区域手动复制本机地址。'));
  $('vg-restore').onclick = async () => {
    if (!state.restoreConfirm) { state.restoreConfirm = true; $('vg-restore').textContent = '确认恢复所选软件'; tell('再次点击确认恢复；接入后又发生变化的配置会保留，并提示你检查。'); return; }
    state.restoreConfirm = false; $('vg-restore').textContent = '恢复接入前配置';
    try { await call('restore', { client: state.client }); state.clients = await call('clients'); await refresh(); tell('已恢复到接入前的配置，请重新打开目标软件。'); } catch (error) { tell(error.message); }
  };
  $('vg-refresh').onclick = refresh; $('vg-filter').onchange = renderHistory;
  $('vg-privacy').onclick = () => { state.private = !state.private; $('vg-privacy').textContent = state.private ? '◉ 内容已隐藏' : '◎ 点击明细显示内容'; $('vg-privacy').setAttribute('aria-pressed', String(state.private)); render(); };
  $('vg-console').onclick = () => call('console').catch(error => tell(error.message));
  $('vg-about').onclick = async () => {
    $('vg-detail-title').textContent = '关于与开源许可'; $('vg-detail-meta').textContent = '冷咖啡原创界面与集成；第三方组件保留各自版权、许可证及必要来源。'; $('vg-detail-content').textContent = '正在读取许可…'; $('vg-detail-dialog').showModal();
    try { const data = await call('licenses'); $('vg-detail-content').replaceChildren(Object.assign(document.createElement('pre'), { textContent: data.text })); const details = document.createElement('details'); details.append(Object.assign(document.createElement('summary'), { textContent: '展开完整版权与许可证原文' }), Object.assign(document.createElement('pre'), { textContent: data.notices })); $('vg-detail-content').append(details); } catch (error) { $('vg-detail-content').textContent = error.message; }
  };
  const unsubscribe = window.coldbrew?.onGateway?.(event => {
    if (event.type === 'chunk') { state.stream += event.text; $('vg-response').textContent = state.stream; }
    if (event.type === 'begin') refresh();
  });
  const timer = setInterval(() => { if (!document.hidden && page.classList.contains('active')) refresh(); }, 1000);
  window.addEventListener('beforeunload', () => { clearInterval(timer); observer.disconnect(); unsubscribe?.(); });
  const hash = location.hash.slice(1);
  if (!hash || hash === 'visual') show(); else if (['packs', 'relay', 'community', 'toolbox'].includes(hash)) go(hash);
  window.ColdCoffeeVisual = Object.freeze({ show, refresh });
  (async () => {
    try {
      state.snapshot = await call('status'); state.clients = await call('clients'); render();
      if (!state.snapshot.engine.running) await call('start');
      state.clients = await call('clients'); await refresh();
    } catch (error) { tell(error.message); if (state.snapshot) render(); }
  })();
})();
