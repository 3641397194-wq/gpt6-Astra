/* Cold Coffee's native Harness companion. Everything stays inside its shadow root. */
(function coldCoffeeHarnessPanel() {
  'use strict';

  if (document.getElementById('coldcoffee-harness-companion')) return;
  const config = window.COLDCOFFEE_HARNESS || {};
  // The page-level Ice Noir skin is opt-in and reversible.  The panel itself
  // remains fully isolated inside the ShadowRoot below.
  const hostDocument = document.documentElement;
  const hadHostSkin = hostDocument.classList.contains('coldcoffee-harness-skin');
  const previousHostArtwork = hostDocument.style.getPropertyValue('--cc-host-artwork');
  const previousBackdropOpacity = hostDocument.style.getPropertyValue('--cc-host-artwork-opacity');
  const rasterArtwork = typeof config.assetUrl === 'string' && /^data:image\/(?:png|webp);base64,[A-Za-z0-9+/=]+$/i.test(config.assetUrl);
  const backgroundAsset = typeof config.backgroundUrl === 'string' && /^data:image\/(?:png|webp);base64,[A-Za-z0-9+/=]+$/i.test(config.backgroundUrl) ? config.backgroundUrl : config.assetUrl;
  const backdropModes = { immersive: { value: '.34', label: '沉浸' }, balanced: { value: '.20', label: '均衡' }, focus: { value: '.08', label: '专注' } };
  let backdropMode = 'balanced';
  try { const saved = sessionStorage.getItem('coldcoffee-backdrop-mode'); if (backdropModes[saved]) backdropMode = saved; } catch (_) { /* Optional display preference. */ }
  hostDocument.style.setProperty('--cc-host-artwork-opacity', backdropModes[backdropMode].value);
  let hostArtworkObjectUrl = '';
  if (rasterArtwork) {
    try {
      // Full-resolution data URLs exceed Chromium's CSS custom-property limit.
      // A page-owned Blob keeps the original image local and the CSS value short.
      const separator = backgroundAsset.indexOf(',');
      const bytes = Uint8Array.from(atob(backgroundAsset.slice(separator + 1)), letter => letter.charCodeAt(0));
      const type = backgroundAsset.slice(5, backgroundAsset.indexOf(';'));
      hostArtworkObjectUrl = URL.createObjectURL(new Blob([bytes], { type }));
      hostDocument.style.setProperty('--cc-host-artwork', `url("${hostArtworkObjectUrl}")`);
    } catch (_) { /* The base Harness skin and panel image remain available. */ }
  }
  let hostSkinEnabled = true;
  try { hostSkinEnabled = sessionStorage.getItem('coldcoffee-harness-skin') !== 'off'; } catch (_) { /* Optional display preference. */ }
  hostDocument.classList.toggle('coldcoffee-harness-skin', hostSkinEnabled);
  const icons = {
    coffee: '<path d="M4 8h12v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8Zm12 1h2a3 3 0 0 1 0 6h-2M8 3v2m4-3v3M3 23h15"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Zm7-1 .8 2.2L22 5l-2.2.8L19 8l-.8-2.2L16 5l2.2-.8L19 2Z"/>',
    report: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Zm0 0v6h6M8 13h8m-8 4h5"/>',
    settings: '<path d="m9 3-.7 2.4-2.4 1L3.7 5.2l-2 3.5 1.8 1.8-.3 2.7L1 14.5 3 18l2.7-.5 2.1 1.6L8 22h4l.9-2.7 2.5-1 2.3 1.4 2-3.5-1.8-1.9.2-2.7 2.3-1.5-2-3.4-2.8.4-2-1.7L13 3H9Z" transform="translate(1 -1) scale(.95)"/><circle cx="11" cy="11" r="3"/>',
    x: '<path d="m6 6 12 12M18 6 6 18"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    external: '<path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
    refresh: '<path d="M20 7a9 9 0 1 0 1 8M20 3v5h-5"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    link: '<path d="m10 14 4-4m-6 7-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m4-2 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 0)"/>',
    stack: '<path d="m12 3 10 5-10 5L2 8l10-5Zm10 10-10 5L2 13m20 5-10 5-10-5"/>',
    pulse: '<path d="M2 12h5l3-8 4 16 3-8h5"/>',
    reverse: '<path d="m7 7-5 5 5 5m10-10 5 5-5 5m-3-14-4 18"/>',
    web: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18m-16-5h14M5 17h14"/>',
    api: '<path d="M12 3v5m0 8v5M3 12h5m8 0h5M5.5 5.5 9 9m6 6 3.5 3.5m0-13L15 9m-6 6-3.5 3.5"/><rect x="8" y="8" width="8" height="8" rx="2"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
    play: '<path d="m8 4 13 8L8 20V4Z"/>',
    chat: '<path d="M21 12a9 9 0 0 1-9 9 10 10 0 0 1-4-1l-5 1 1-5a9 9 0 1 1 17-4Z"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>',
    plane: '<path d="m22 2-7 20-4-9-9-4L22 2Zm0 0L11 13"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    minimize: '<path d="M5 12h14"/>',
    copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  };
  const icon = (name) => `<svg class="cc-icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.spark}</svg>`;
  const escape = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const state = { data: null, online: false, view: 'overview', open: false, pending: false, activated: false, keywordDraft: '', welcome: '', welcomeOpen: false, history: [], workflow: '', afterActivation: '', input: '', error: '', notice: '', refreshing: false, animations: !window.matchMedia('(prefers-reduced-motion: reduce)').matches };
  let introTimer;
  let pollTimer;
  let toastTimer;
  let destroyed = false;
  let lastFocused;
  let staticAsset;
  let renderedView = '';
  let renderedOverviewMarkup = '';
  const host = document.createElement('div');
  host.id = 'coldcoffee-harness-companion';
  const shadow = host.attachShadow({ mode: 'open' });
  const css = document.createElement('style');
  css.textContent = config.styleText || config.cssText || ':host{position:fixed;z-index:2147483590;right:24px;bottom:24px}';
  shadow.appendChild(css);
  const root = document.createElement('div');
  root.className = `cc-root${rasterArtwork ? ' cc-raster-art' : ''}`;
  shadow.appendChild(root);
  document.documentElement.appendChild(host);

  function artwork() {
    const original = typeof config.assetUrl === 'string' && /^data:image\/(?:svg\+xml|png|webp);/i.test(config.assetUrl) ? config.assetUrl : '';
    if (state.animations || !original.startsWith('data:image/svg+xml')) return original;
    if (staticAsset) return staticAsset;
    try {
      const separator = original.indexOf(',');
      const source = original.slice(0, separator).includes(';base64')
        ? new TextDecoder().decode(Uint8Array.from(atob(original.slice(separator + 1)), (letter) => letter.charCodeAt(0)))
        : decodeURIComponent(original.slice(separator + 1));
      const xml = new DOMParser().parseFromString(source, 'image/svg+xml');
      xml.querySelectorAll('style, animate, animateTransform, animateMotion, set').forEach((element) => element.remove());
      staticAsset = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(xml))}`;
      return staticAsset;
    } catch (_) { return original; }
  }

  function workflowKind(workflow) {
    if (workflow.id === 'web' || workflow.id === 'chain') return 'web';
    if (workflow.id === 'api') return 'api';
    if (workflow.id === 'reverse' || workflow.id === 'audit') return 'reverse';
    if (workflow.id === 'report') return 'report';
    if (/report|报告/i.test(`${workflow.id} ${workflow.name}`)) return 'report';
    if (/api|interface|接口/i.test(`${workflow.id} ${workflow.name}`)) return 'api';
    if (/web|pentest|penetrat|chain|渗透/i.test(`${workflow.id} ${workflow.name}`)) return 'web';
    return 'reverse';
  }

  function workflows() {
    return state.data && Array.isArray(state.data.workflows) ? state.data.workflows.filter((item) => item && typeof item.id === 'string') : [];
  }

  function workflowName(workflow) {
    if (workflow && /[\u3400-\u9fff]/.test(workflow.name || '')) return workflow.name;
    return { reverse: 'REA 逆向分析', web: 'Web 渗透工作流', api: 'API 接口审计', report: '证据整理与报告' }[workflowKind(workflow || {})];
  }

  function workflowDescription(workflow) {
    if (workflow.id === 'audit') return '沿用代码审计技能与项目上下文';
    if (workflow.id === 'chain') return '串联现有渗透技能与执行证据';
    return { reverse: '复用 REA 工具与逆向技能', web: '复用现有渗透技能与任务上下文', api: '接口、鉴权与业务逻辑分析', report: '汇总分析证据，整理可追溯报告' }[workflowKind(workflow)];
  }

  function canInteract() {
    return state.online && !(state.data && state.data.harness && state.data.harness.apiAvailable === false);
  }

  function endpoint(name) {
    const suffix = config[name] || ({ status: '/api/status', welcome: '/api/welcome', history: '/api/history', activate: '/api/activate', dispatch: '/api/tasks', settings: '/api/settings', cancel: '/api/tasks/cancel' })[name];
    const base = String(config.apiBase || config.basePath || '/coldcoffee').replace(/\/$/, '');
    return `${base}/${String(suffix).replace(/^\//, '')}`;
  }

  async function api(name, body) {
    if (config.apiBase === null && config.initialStatus && config.initialStatus.harness && config.initialStatus.harness.apiAvailable === false) throw new Error('当前桌面载体未提供本机接口，请在官方 Web 版打开冷咖啡面板。');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(endpoint(name), {
        method: body === undefined ? 'GET' : 'POST',
        cache: 'no-store', credentials: 'omit', signal: controller.signal,
        headers: { 'X-ColdCoffee-Session': String(config.token || ''), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      let result;
      try { result = await response.json(); } catch (_) { throw new Error('插件服务尚未就绪，请稍后刷新。'); }
      if (!response.ok || result.ok === false) {
        const message = typeof result.error === 'string' ? result.error : (result.error && result.error.message) || result.message;
        throw new Error(message || '这次操作未完成，请稍后重试。');
      }
      return result;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('连接等待较久，请确认 DeepSeek Harness 已启动。');
      if (error instanceof TypeError) throw new Error('暂未连接到插件服务，请打开 DeepSeek Harness 后刷新。');
      throw error;
    } finally { clearTimeout(timeout); }
  }

  function applyData(result) {
    const data = result.status && typeof result.status === 'object' ? result.status : result;
    if (data.plugin || data.skills || data.harness) state.data = { ...(state.data || {}), ...data };
    if (typeof data.activated === 'boolean') state.activated = data.activated;
    if (typeof data.text === 'string') state.welcome = data.text;
    if (data.settings && typeof data.settings.animations === 'boolean') state.animations = data.settings.animations && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (Array.isArray(data.tasks)) state.history = data.tasks;
    if (!workflows().some((workflow) => workflow.id === state.workflow && workflow.available !== false)) state.workflow = (workflows().find((workflow) => workflow.available !== false) || {}).id || '';
    root.classList.toggle('cc-no-motion', !state.animations);
  }

  async function refresh(silent) {
    if (state.refreshing || destroyed) return;
    if (config.apiBase === null && config.initialStatus && config.initialStatus.harness && config.initialStatus.harness.apiAvailable === false) {
      state.online = true;
      state.error = '当前桌面载体未提供本机接口，请在官方 Web 版打开冷咖啡面板。';
      renderOverview(); renderTaskState(); renderFooter();
      return;
    }
    state.refreshing = true;
    updateRefresh();
    try {
      const result = await api('status');
      state.online = true;
      applyData(result);
      if (!silent) { state.error = ''; render(); }
      else { renderOverview(); renderTaskState(); renderFooter(); }
    } catch (error) {
      state.online = false;
      if (!silent) state.error = error.message;
      renderOverview(); renderTaskState(); renderFooter();
    } finally { state.refreshing = false; updateRefresh(); }
  }

  function updateRefresh() {
    shadow.querySelectorAll('[data-action="refresh"]').forEach((button) => { button.setAttribute('aria-busy', String(state.refreshing)); button.disabled = state.refreshing; });
  }

  function community() {
    const data = state.data && state.data.community || {};
    return { qq: Array.isArray(data.qq) && data.qq.length === 3 ? data.qq.map(String) : ['1057540028', '1077074552', '618179023'], chat: 'https://t.me/coolcoffeeai', channel: 'https://t.me/chachachalkf' };
  }

  function relayPromoHTML() {
    return `<section class="cc-promo" aria-label="冷咖啡付费中转"><span class="cc-promo-kicker">冷咖啡生态 · 付费服务</span><h2>好工作流，接入就能用。</h2><p>冷咖啡中转已内置工作流体验。接入 API 后使用，套餐与计费以站内说明为准。</p><div class="cc-promo-actions"><a class="cc-primary" href="https://coldcoffeeai.com/" target="_blank" rel="noopener noreferrer">进入冷咖啡中转${icon('external')}</a><button class="cc-secondary" data-action="open-community">全部社群${icon('chat')}</button></div><small>闭源工作流收费定制 · 进 QQ 群私聊管理</small></section>`;
  }

  function brandBarHTML() {
    return `<aside class="cc-brand-bar" aria-label="冷咖啡品牌入口"><div class="cc-brand-mark">${icon('coffee')}<span><strong>冷咖啡</strong><small>付费中转 · 内置工作流</small></span></div><a class="cc-brand-primary" href="https://coldcoffeeai.com/" target="_blank" rel="noopener noreferrer">中转站官网${icon('external')}</a><button class="cc-brand-community" data-action="open-community">全部社群${icon('chat')}</button><button class="cc-brand-tool" data-action="open-settings" aria-label="外观设置" title="外观设置">${icon('settings')}</button></aside>`;
  }

  function communityHTML() {
    const links = community();
    return `${relayPromoHTML()}<section class="cc-community cc-community-hub" aria-label="冷咖啡全部社群"><div class="cc-section-top"><h2 class="cc-section-title">和冷咖啡，一起交流</h2><span class="cc-hub-count">5 个入口</span></div><p class="cc-community-sub">软件使用、版本消息、工作流交流。点群号复制，在 QQ 中搜索加入。</p><div class="cc-qq-grid">${links.qq.map((id, index) => `<button class="cc-qq" data-action="copy-qq" data-value="${escape(id)}" aria-label="复制 QQ ${['一', '二', '三'][index]}群群号 ${escape(id)}"><span class="cc-qq-label">QQ ${['一', '二', '三'][index]}群</span><span class="cc-qq-id">${escape(id)}</span><span class="cc-qq-hint">${icon('copy')}复制群号</span></button>`).join('')}</div><div class="cc-community-links"><a class="cc-community-link" href="${links.chat}" target="_blank" rel="noopener noreferrer">${icon('plane')}Telegram 交流群${icon('external')}</a><a class="cc-community-link" href="${links.channel}" target="_blank" rel="noopener noreferrer">${icon('plane')}Telegram 频道${icon('external')}</a></div></section><section class="cc-custom-service"><span class="cc-promo-kicker">闭源工作流 · 收费定制</span><h3>装在你的电脑，按你的需求定制。</h3><p>支持使用你自己的订阅或其他中转。进上方任一 QQ 群，私聊管理沟通方案与价格。</p><div class="cc-service-facts"><span>本机安装</span><span>私聊沟通</span><span>按需定制</span></div></section>`;
  }

  function overviewHTML() {
    const data = state.data || {};
    const skills = data.skills || {};
    const rea = data.rea || {};
    const harness = data.harness || {};
    const pluginReady = state.online && data.plugin && data.plugin.loaded;
    const skillTotal = Number.isInteger(skills.total) ? skills.total : null;
    const stats = [
      { icon: 'link', value: pluginReady ? '已接入' : '等待连接', label: 'Harness 插件', detail: harness.sessionController ? '会话通道就绪' : '等待会话通道', good: Boolean(pluginReady && harness.sessionController) },
      { icon: 'stack', value: skills.installed ? (skillTotal === null ? '已安装' : `${skillTotal} 项技能`) : '待安装', label: '已有技能包', detail: skills.catalogVerified ? '目录已核验' : (skills.installed ? '已发现技能文件' : '等待安装结果'), good: Boolean(skills.installed) },
      { icon: 'pulse', value: rea.connected ? '已连接' : rea.installed ? '待连接' : '待准备', label: 'REA 工具', detail: rea.connected ? '已收到工具响应' : rea.installed ? '尚未收到工具响应' : '等待运行环境', good: Boolean(rea.connected) },
    ];
    return `${relayPromoHTML()}<div class="cc-section-top"><h2 class="cc-section-title">你的冰蓝工作空间</h2><button class="cc-light-link" data-action="refresh" aria-busy="false">${icon('refresh')}刷新状态</button></div>
      <div class="cc-status-grid">${stats.map((stat) => `<div class="cc-stat"><div class="cc-stat-icon">${icon(stat.icon)}</div><div class="cc-stat-value">${escape(stat.value)}</div><div class="cc-stat-label">${escape(stat.label)}</div><div class="cc-status-line"><span class="cc-dot ${stat.good ? 'good' : ''}"></span>${escape(stat.detail)}</div></div>`).join('')}</div>
      <section class="cc-activation" aria-label="冷咖啡激活">${state.activated ? `<div class="cc-activation-ready"><span class="cc-check-circle">${icon('check')}</span>冷咖啡已激活</div><p class="cc-activation-desc">来杯冰美式，然后开始你的开心人生吧。</p>` : `<div class="cc-activation-title">${icon('spark')}从一句「冷咖啡」开始</div><p class="cc-activation-desc">输入启动词，开启当前 Harness 会话的冷咖啡工作流。</p><form class="cc-activation-form" data-form="activate"><label class="cc-sr" for="cc-activation-keyword">启动词</label><input class="cc-input" id="cc-activation-keyword" name="keyword" autocomplete="off" placeholder="在这里输入 冷咖啡" maxlength="80" ${state.pending ? 'disabled' : ''}><button class="cc-primary" type="submit" ${state.pending || !canInteract() ? 'disabled' : ''}>${state.pending ? '正在启动' : '启动'}${icon('arrow')}</button></form>`}
      <button class="cc-welcome-toggle" data-action="welcome" aria-expanded="${state.welcomeOpen}"><span>查看完整激活欢迎词</span>${icon('down')}</button>${state.welcomeOpen ? `<pre class="cc-welcome">${escape(state.welcome || '欢迎词加载中…')}</pre>` : ''}</section>
      ${state.error ? `<div class="cc-inline-alert" role="status">${escape(state.error)}</div>` : ''}
      <div class="cc-quick-title"><h3>把技能用起来</h3><span>已有技能 · 原生会话</span></div>
      <div class="cc-workflows">${workflows().length ? workflows().map((workflow) => `<button class="cc-workflow" data-action="choose-workflow" data-workflow="${escape(workflow.id)}" ${workflow.available === false ? 'disabled title="请先安装对应技能"' : ''}><span class="cc-workflow-art">${icon(workflowKind(workflow))}</span><span class="cc-workflow-text"><span class="cc-workflow-name">${escape(workflowName(workflow))}</span><span class="cc-workflow-desc" style="display:block">${escape(workflow.available === false ? '对应技能尚未安装' : workflowDescription(workflow))}</span></span>${icon('chevron')}</button>`).join('') : `<div class="cc-empty" style="padding:20px"><div class="cc-empty-icon">${icon('stack')}</div><h3>等待技能目录</h3><p>连接后会显示这次安装中真实可用的工作流。</p></div>`}</div>
      <p class="cc-micro-note">执行交给 Harness，工具、技能与当前会话一起工作。</p>`;
  }

  function tasksHTML() {
    return `<div class="cc-task-lead"><div class="cc-task-lead-title">先选工作流，再交给 Harness</div><p>沿用已安装技能，结果回到实际任务会话。</p></div>
      <form data-form="task"><div class="cc-label">选择工作流<span>复用现有技能包</span></div><div class="cc-workflow-options">${workflows().map((workflow) => `<button type="button" class="cc-choice" data-action="select-workflow" data-workflow="${escape(workflow.id)}" aria-pressed="${workflow.id === state.workflow}" ${workflow.available === false ? 'disabled title="请先安装对应技能"' : ''}>${icon(workflowKind(workflow))}<span>${escape(workflowName(workflow))}</span></button>`).join('')}</div>
      <label class="cc-label" for="cc-task-input">这次想分析什么？<span>写清目标和期望结果</span></label><textarea class="cc-input cc-textarea" id="cc-task-input" name="input" maxlength="12000" placeholder="例如：分析这个样本的主要功能，结合 REA 结果给出证据。\n\n也可以填写目标网址、接口或项目目录，以及你想核查的问题。">${escape(state.input)}</textarea>
      <button type="submit" class="cc-primary cc-task-submit" aria-busy="${state.pending}" ${!state.activated || state.pending || !canInteract() || !state.workflow ? 'disabled' : ''}>${icon('play')}<span data-task-submit-label>${state.pending ? '正在交给 Harness…' : '开始任务'}</span></button></form>
      ${!state.activated ? `<div class="cc-lock-note"><span>${icon('lock')}输入冷咖啡后启动</span><button data-action="activate-focus">前往激活</button></div>` : ''}
      <div data-task-state></div>`;
  }

  function taskStatus(task) {
    const value = String(task.status || 'unknown').toLowerCase();
    const map = { creating: ['正在创建会话', 'active'], accepted: ['已交给 Harness', 'active'], queued: ['等待执行', 'active'], pending: ['等待执行', 'active'], running: ['执行中', 'active'], completed: ['已完成', 'done'], complete: ['已完成', 'done'], done: ['已完成', 'done'], success: ['已完成', 'done'], failed: ['执行失败', 'error'], error: ['执行失败', 'error'], cancelled: ['已取消', ''], canceled: ['已取消', ''], stopped: ['已停止', ''] };
    return map[value] || ['状态待确认', ''];
  }

  function taskDate(task) {
    const raw = task.updatedAt || task.createdAt || task.timestamp;
    if (!raw) return '时间未记录';
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return '时间未记录';
    return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function taskCard(task) {
    const status = taskStatus(task);
    const workflow = workflows().find((item) => item.id === task.workflow) || { id: task.workflow, name: task.workflowName };
    const result = task.output || task.result || task.report || task.error;
    const resultText = typeof result === 'string' ? result : result && (result.text || result.message || result.summary) || '';
    const toolEvents = Array.isArray(task.events) ? task.events.filter((item) => item.type === 'tool') : [];
    return `<article class="cc-task-card ${status[1] === 'active' ? 'running' : ''}"><div class="cc-task-card-head"><h3 class="cc-task-name">${escape(workflowName(workflow))}</h3><span class="cc-task-badge ${status[1]}">${status[0]}</span></div><p class="cc-task-input">${escape(task.input || task.prompt || '任务已创建')}</p>${task.status === 'accepted' ? `<p class="cc-session-note">${icon('chat')}实际执行与工具输出请查看 Harness 会话。</p>` : ''}${toolEvents.length ? `<p class="cc-session-note">${icon('pulse')}已记录 ${toolEvents.length} 次工具调用${toolEvents.some((item) => item.ok === false) ? ' · 含需检查的结果' : ''}</p>` : ''}${resultText ? `<div class="cc-task-result">${escape(resultText)}</div>` : ''}<div class="cc-task-card-foot"><time>${escape(taskDate(task))}</time><div class="cc-task-actions">${task.sessionId ? `<button data-action="copy-session" data-task="${escape(task.id)}" title="复制会话编号">复制会话编号</button>` : ''}${['accepted', 'queued', 'pending', 'running'].includes(task.status) ? `<button data-action="cancel-task" data-task="${escape(task.id)}">停止任务</button>` : ''}</div></div></article>`;
  }

  function historyHTML() {
    const tasks = state.history;
    return `<div class="cc-section-top"><h2 class="cc-section-title">任务与报告</h2><button class="cc-light-link" data-action="refresh-history">${icon('refresh')}刷新记录</button></div><p class="cc-history-tip">这里只展示插件真实记录的任务状态。完整过程保留在对应的 Harness 会话中。</p>${tasks.length ? tasks.slice().reverse().map(taskCard).join('') : `<div class="cc-empty"><div class="cc-empty-icon">${icon('report')}</div><h3>第一份记录，从这里开始</h3><p>发起一个任务后，这里会留下任务状态、会话编号与已返回的结果。</p><button class="cc-primary" data-action="go-tasks">创建任务${icon('arrow')}</button></div>`}`;
  }

  function settingsHTML() {
    return `<div class="cc-section-top"><h2 class="cc-section-title">按你的习惯来</h2><span class="cc-section-kicker">轻一点，也好看一点</span></div>
      <div class="cc-settings-row"><div><div class="cc-settings-label">整个 Harness 冰蓝皮肤</div><div class="cc-settings-detail">侧栏、聊天、输入框、插件页与菜单统一换肤；关闭即可恢复官方外观。</div></div><button class="cc-toggle" role="switch" aria-label="整个 Harness 冰蓝皮肤" aria-checked="${hostSkinEnabled}" data-action="toggle-skin"></button></div>
      <section class="cc-backdrop-settings"><div class="cc-settings-label">背景氛围</div><p class="cc-settings-detail">沉浸看风景，均衡适合日常，专注适合长文阅读。</p><div class="cc-backdrop-choices" aria-label="背景强度">${Object.entries(backdropModes).map(([id, mode]) => `<button data-action="set-backdrop" data-mode="${id}" aria-pressed="${id === backdropMode}">${mode.label}</button>`).join('')}</div></section>
      <div class="cc-settings-row"><div><div class="cc-settings-label">开屏与氛围动效</div><div class="cc-settings-detail">镜头缓移、冰晶轨道、扫描光与星尘；跟随系统减少动态设置。</div></div><button class="cc-toggle" role="switch" aria-label="开屏与氛围动效" aria-checked="${state.animations}" data-action="toggle-animation"></button></div>
       <div class="cc-settings-row"><div><div class="cc-settings-label">再看一次开屏</div><div class="cc-settings-detail">一杯冰美式，开启新的分析任务。</div></div><button class="cc-light-link" data-action="replay-intro">播放${icon('play')}</button></div>
      <div class="cc-settings-row"><div><div class="cc-settings-label">插件版本</div><div class="cc-settings-detail">DeepSeek Harness · 冷咖啡</div></div><span class="cc-setting-version">${escape(config.version || state.data && state.data.plugin && state.data.plugin.version || '待连接')}</span></div>
      <button class="cc-secondary cc-settings-community" data-action="open-community">${icon('chat')}查看全部社群与收费定制${icon('arrow')}</button><div class="cc-settings-foot">一杯冷咖啡 · 一次认真完成的任务</div>`;
  }

  function render() {
    const intro = root.querySelector('.cc-intro');
    const toastElement = root.querySelector('.cc-toast');
    const active = shadow.activeElement;
    const activeId = active && active.id;
    const selection = active && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
    const scrollTop = renderedView === state.view ? (shadow.querySelector('.cc-body')?.scrollTop || 0) : 0;
    renderedView = state.view;
    const asset = artwork();
    const overviewMarkup = state.view === 'overview' ? overviewHTML() : '';
    root.innerHTML = `${brandBarHTML()}<button class="cc-launcher" data-action="toggle" aria-expanded="${state.open}" aria-controls="cc-harness-panel" aria-label="${state.open ? '收起' : '打开'}冷咖啡助手"><span class="cc-launcher-avatar">${asset ? `<img src="${escape(asset)}" alt="" draggable="false">` : icon('coffee')}</span><span><span class="cc-launcher-name">冷咖啡助手</span><span class="cc-launcher-sub"><i class="cc-dot ${state.online ? 'good' : ''}"></i>${state.activated ? '已激活 · 随时开始' : '输入冷咖啡 · 启动工作流'}</span></span>${icon(state.open ? 'down' : 'spark')}</button>
      <section class="cc-panel" id="cc-harness-panel" role="dialog" aria-label="冷咖啡 DeepSeek Harness 工作台" ${state.open ? '' : 'hidden'}><header class="cc-panel-head"><div class="cc-head-grain"></div><div class="cc-head-ring"></div>${asset ? `<img class="cc-head-art" src="${escape(asset)}" alt="蓝发冷咖啡看板娘" draggable="false">` : ''}<div class="cc-head-overline">${icon('coffee')}DEEPSEEK HARNESS</div><h1 class="cc-head-title">冷咖啡</h1><p class="cc-head-caption">来杯冰美式，开始你的开心人生。</p><div class="cc-window-actions"><button class="cc-icon-button" data-action="close" aria-label="收起助手" title="收起助手，继续使用 Harness">${icon('x')}</button></div>${config.preview ? '<span class="cc-preview-tag">本地预览</span>' : ''}</header>
      <nav class="cc-nav" role="tablist" aria-label="助手页面">${[['overview', 'grid', '总览'], ['tasks', 'spark', '工作流'], ['history', 'report', '记录'], ['community', 'chat', '社群'], ['settings', 'settings', '外观']].map(([id, glyph, name]) => `<button class="cc-tab" id="cc-tab-${id}" role="tab" aria-selected="${state.view === id}" aria-controls="cc-view-${id}" tabindex="${state.view === id ? 0 : -1}" data-action="view" data-view="${id}">${icon(glyph)}${name}</button>`).join('')}</nav>
      <main class="cc-body"><div class="cc-view" id="cc-view-${state.view}" role="tabpanel" aria-labelledby="cc-tab-${state.view}">${state.view === 'overview' ? overviewMarkup : state.view === 'tasks' ? tasksHTML() : state.view === 'history' ? historyHTML() : state.view === 'community' ? communityHTML() : settingsHTML()}</div></main><footer class="cc-footer"><span class="cc-footer-state"><i class="cc-dot ${state.online ? 'good' : ''}"></i><span data-footer-state>${state.online ? (config.preview ? '预览服务已连接' : '已连接 Harness 插件') : '等待 Harness 插件'}</span></span><a href="https://coldcoffeeai.com/" target="_blank" rel="noopener noreferrer">中转站官网${icon('external')}</a><button data-action="open-community">全部社群</button></footer></section>`;
    renderedOverviewMarkup = overviewMarkup;
    if (intro) root.appendChild(intro);
    if (toastElement) root.appendChild(toastElement);
    root.classList.toggle('cc-no-motion', !state.animations);
    shadow.querySelector('.cc-body').scrollTop = scrollTop;
    const keywordField = shadow.getElementById('cc-activation-keyword');
    if (keywordField) keywordField.value = state.keywordDraft;
    if (activeId) {
      const replacement = shadow.getElementById(activeId);
      if (replacement) { replacement.focus({ preventScroll: true }); if (selection && typeof replacement.setSelectionRange === 'function') replacement.setSelectionRange(...selection); }
    }
    renderTaskState();
    updateRefresh();
  }

  function renderOverview() {
    if (state.view !== 'overview') return;
    const target = shadow.getElementById('cc-view-overview');
    if (!target) return;
    const markup = overviewHTML();
    if (markup === renderedOverviewMarkup) return;
    const input = shadow.getElementById('cc-activation-keyword');
    const value = input && input.value;
    const focused = input && shadow.activeElement === input;
    const selection = focused ? [input.selectionStart, input.selectionEnd] : null;
    target.innerHTML = markup;
    renderedOverviewMarkup = markup;
    const replacement = shadow.getElementById('cc-activation-keyword');
    if (replacement && value) replacement.value = value;
    if (replacement && focused) { replacement.focus({ preventScroll: true }); if (selection) replacement.setSelectionRange(...selection); }
    updateRefresh();
  }

  function updateTaskControls() {
    const submit = shadow.querySelector('[data-form="task"] .cc-task-submit');
    if (!submit) return;
    submit.disabled = !state.activated || state.pending || !canInteract() || !state.workflow;
    submit.setAttribute('aria-busy', String(state.pending));
    const label = submit.querySelector('[data-task-submit-label]');
    if (label) label.textContent = state.pending ? '正在交给 Harness…' : '开始任务';
  }

  function renderTaskState() {
    updateTaskControls();
    const target = shadow.querySelector('[data-task-state]');
    if (target) {
      const latest = state.history.slice(-2).reverse();
      target.innerHTML = `${state.error ? `<div class="cc-inline-alert" role="status">${escape(state.error)}</div>` : ''}${state.notice ? `<div class="cc-inline-alert good" role="status">${escape(state.notice)}</div>` : ''}${latest.length ? `<section class="cc-task-active"><div class="cc-section-top"><h3 class="cc-section-title">最近任务</h3><button class="cc-light-link" data-action="go-history">全部记录${icon('chevron')}</button></div>${latest.map(taskCard).join('')}</section>` : '<p class="cc-micro-note">提交后将创建真实的 Harness 会话；这里仅在收到结果时显示完成。</p>'}`;
    }
    if (state.view === 'history') {
      const history = shadow.getElementById('cc-view-history');
      if (history) history.innerHTML = historyHTML();
    }
  }

  function renderFooter() {
    const footer = shadow.querySelector('[data-footer-state]');
    if (footer) footer.textContent = state.online ? (canInteract() ? (config.preview ? '预览服务已连接' : '已连接 Harness 插件') : '插件已加载 · 请使用 Web 界面执行') : '等待 Harness 插件';
    shadow.querySelectorAll('.cc-footer-state .cc-dot,.cc-launcher-sub .cc-dot').forEach((dot) => dot.classList.toggle('good', state.online));
  }

  function openPanel(focusKeyword) {
    const focused = document.activeElement;
    lastFocused = focused && focused !== host && focused !== document.body && focused !== document.documentElement && typeof focused.focus === 'function' ? focused : null;
    state.open = true;
    render();
    clearInterval(pollTimer);
    pollTimer = setInterval(() => { if (state.open && !state.pending) refresh(true); }, 5000);
    refresh(true);
    const focus = focusKeyword ? shadow.getElementById('cc-activation-keyword') : shadow.getElementById(`cc-tab-${state.view}`);
    if (focus) focus.focus({ preventScroll: true });
  }

  function closePanel() {
    state.open = false;
    clearInterval(pollTimer);
    render();
    if (lastFocused && lastFocused.isConnected && typeof lastFocused.focus === 'function') {
      lastFocused.focus({ preventScroll: true });
      if (document.activeElement === lastFocused) return;
    }
    shadow.querySelector('.cc-launcher').focus({ preventScroll: true });
  }

  function chooseView(view, focusTab) {
    if (!['overview', 'tasks', 'history', 'community', 'settings'].includes(view)) return;
    state.view = view;
    state.error = '';
    state.notice = '';
    render();
    if (focusTab) shadow.getElementById(`cc-tab-${view}`).focus({ preventScroll: true });
    if (view === 'history') loadHistory();
  }

  async function loadHistory() {
    try {
      const response = await api('history');
      state.history = Array.isArray(response.tasks) ? response.tasks : [];
      renderTaskState();
    } catch (error) { toast(error.message); }
  }

  async function loadWelcome() {
    if (state.welcome) return;
    try { const result = await api('welcome'); state.welcome = typeof result.text === 'string' ? result.text : ''; }
    catch (_) { state.welcome = '欢迎词暂未加载，请连接插件服务后重试。'; }
    renderOverview();
  }

  function toast(message) {
    clearTimeout(toastTimer);
    const previous = root.querySelector('.cc-toast');
    if (previous) previous.remove();
    const item = document.createElement('div');
    item.className = 'cc-toast';
    item.setAttribute('role', 'status');
    item.textContent = message;
    root.appendChild(item);
    toastTimer = setTimeout(() => item.remove(), 4200);
  }

  async function copy(text, success) {
    try { await navigator.clipboard.writeText(text); toast(success); }
    catch (_) { toast(`请手动复制：${text}`); }
  }

  function dismissIntro(open) {
    clearTimeout(introTimer);
    const element = root.querySelector('.cc-intro');
    if (element) element.remove();
    try { sessionStorage.setItem('coldcoffee-harness-intro-seen', String(config.version || '1')); } catch (_) { /* Optional visual preference. */ }
    if (open) openPanel(false);
  }

  function showIntro(replay) {
    if (!replay && !state.animations) return;
    clearTimeout(introTimer);
    const previous = root.querySelector('.cc-intro');
    if (previous) previous.remove();
    const intro = document.createElement('section');
    intro.className = 'cc-intro';
    intro.setAttribute('aria-label', '冷咖啡冰蓝开屏');
    const links = community();
    intro.innerHTML = `<div class="cc-intro-card">
      ${artwork() ? `<img class="cc-intro-art" src="${escape(artwork())}" alt="冷咖啡原创冰蓝主视觉：蓝发少女、冰晶与冰咖啡" draggable="false">` : ''}
      <div class="cc-intro-shade"></div><div class="cc-intro-pattern"></div><div class="cc-intro-aura"></div><div class="cc-intro-scan"></div><div class="cc-intro-orbit"></div>
      <div class="cc-intro-sigil" aria-hidden="true"><span>✦</span><i></i><b></b></div>
      <div class="cc-intro-hud"><span class="cc-hud-dot"></span><span>冷咖啡 · 工作流生态</span><strong>付费 API 服务</strong></div>
      <div class="cc-intro-shards" aria-hidden="true">${Array.from({ length: 8 }, (_, index) => `<i class="cc-shard cc-shard-${index}"></i>`).join('')}</div>
      <i class="cc-flower"></i><i class="cc-flower"></i><i class="cc-flower"></i>
      <div class="cc-intro-content">
        <div class="cc-intro-eyebrow">DEEPSEEK HARNESS · ${config.preview ? '本地预览' : '冷咖啡插件'}</div>
        <h2 class="cc-intro-title">冷咖啡<small>中转 · 工作流 · 同好会</small></h2><div class="cc-intro-rule"></div>
        <p class="cc-intro-quote">来杯冰美式，<br>然后开始你的开心人生吧。</p>
        <p class="cc-intro-caption">付费中转已内置工作流体验。<br>闭源工作流收费定制，进 QQ 群私聊管理。</p>
        <div class="cc-intro-promos"><a href="https://coldcoffeeai.com/" target="_blank" rel="noopener noreferrer">进入冷咖啡中转${icon('external')}</a><button data-action="open-community">全部社群${icon('chat')}</button></div>
        <div class="cc-intro-communities"><div>${links.qq.map((id, index) => `<button data-action="copy-qq" data-value="${escape(id)}" title="复制群号">QQ ${['一', '二', '三'][index]}群 ${escape(id)}</button>`).join('')}</div><div><a href="${links.chat}" target="_blank" rel="noopener noreferrer">Telegram 交流群${icon('external')}</a><a href="${links.channel}" target="_blank" rel="noopener noreferrer">Telegram 频道${icon('external')}</a></div></div>
        <div class="cc-intro-bottom"><button class="cc-primary cc-intro-enter" data-action="intro-enter">进入工作空间${icon('arrow')}</button><span class="cc-intro-note">右下角助手<br>输入「冷咖啡」启动</span></div>
      </div>
      <div class="cc-intro-rail" aria-hidden="true"><span></span><span></span><span></span></div><button class="cc-intro-skip" data-action="intro-skip">跳过开屏${icon('x')}</button><span class="cc-intro-signature">冰蓝 · 冷咖啡</span>
    </div>`;
    root.appendChild(intro);
    if (!config.preview) introTimer = setTimeout(() => dismissIntro(false), 7800);
  }

  shadow.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (action === 'toggle') { if (state.open) closePanel(); else openPanel(false); }
    else if (action === 'close') closePanel();
    else if (action === 'open-community' || action === 'open-settings') {
      dismissIntro(false);
      if (!state.open) openPanel(false);
      chooseView(action === 'open-community' ? 'community' : 'settings', true);
    }
    else if (action === 'view') chooseView(button.dataset.view, true);
    else if (action === 'refresh') refresh(false);
    else if (action === 'refresh-history') loadHistory();
    else if (action === 'welcome') { state.welcomeOpen = !state.welcomeOpen; renderOverview(); if (state.welcomeOpen) loadWelcome(); }
    else if (action === 'choose-workflow' || action === 'select-workflow') {
      state.workflow = button.dataset.workflow;
      if (action === 'choose-workflow') {
        if (state.activated) chooseView('tasks', false);
        else {
          state.afterActivation = 'tasks';
          chooseView('overview', false);
          const field = shadow.getElementById('cc-activation-keyword');
          if (field) { field.focus({ preventScroll: true }); field.scrollIntoView({ block: 'center', behavior: state.animations ? 'smooth' : 'instant' }); }
          toast('已记住你选择的工作流，输入「冷咖啡」后继续填写任务。');
        }
      } else render();
    } else if (action === 'activate-focus') { state.afterActivation = 'tasks'; chooseView('overview', false); const field = shadow.getElementById('cc-activation-keyword'); if (field) { field.focus({ preventScroll: true }); field.scrollIntoView({ block: 'center' }); } }
    else if (action === 'go-tasks') chooseView('tasks', true);
    else if (action === 'go-history') chooseView('history', true);
    else if (action === 'intro-enter') dismissIntro(false);
    else if (action === 'intro-skip') dismissIntro(false);
    else if (action === 'replay-intro') showIntro(true);
    else if (action === 'copy-qq') copy(button.dataset.value, 'QQ 群号已复制，在 QQ 中搜索即可。');
    else if (action === 'set-backdrop' && backdropModes[button.dataset.mode]) {
      backdropMode = button.dataset.mode;
      hostDocument.style.setProperty('--cc-host-artwork-opacity', backdropModes[backdropMode].value);
      try { sessionStorage.setItem('coldcoffee-backdrop-mode', backdropMode); } catch (_) { /* Optional display preference. */ }
      render();
      toast(`已切换为${backdropModes[backdropMode].label}背景。`);
    }
    else if (action === 'toggle-skin') {
      hostSkinEnabled = !hostSkinEnabled;
      hostDocument.classList.toggle('coldcoffee-harness-skin', hostSkinEnabled);
      try { sessionStorage.setItem('coldcoffee-harness-skin', hostSkinEnabled ? 'on' : 'off'); } catch (_) { /* Optional display preference. */ }
      render();
      toast(hostSkinEnabled ? '整个 Harness 已切换为冰蓝皮肤。' : '已恢复 Harness 的官方外观。');
    }
    else if (action === 'copy-session') { const task = state.history.find((item) => item.id === button.dataset.task); if (task && task.sessionId) copy(String(task.sessionId), 'Harness 会话编号已复制。'); }
    else if (action === 'toggle-animation') {
      button.disabled = true;
      try { const response = await api('settings', { animations: !state.animations }); applyData(response); render(); toast(state.animations ? '冰蓝微动已开启。' : '已切换为安静的静态模式。'); }
      catch (error) { toast(error.message); button.disabled = false; }
    } else if (action === 'cancel-task') {
      button.disabled = true;
      try { await api('cancel', { taskId: button.dataset.task }); await loadHistory(); toast('已向 Harness 提交停止请求。'); }
      catch (error) { toast(error.message); button.disabled = false; }
    }
  });

  shadow.addEventListener('input', (event) => {
    if (event.target.id === 'cc-task-input') state.input = event.target.value;
    if (event.target.id === 'cc-activation-keyword') state.keywordDraft = event.target.value;
  });
  shadow.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    if (state.pending || !canInteract()) return;
    if (form.dataset.form === 'activate') {
      const value = form.elements.keyword.value.trim();
      if (value !== '冷咖啡') { state.error = '启动词是「冷咖啡」，请输入这三个字。'; renderOverview(); return; }
      state.pending = true; state.error = ''; renderOverview();
      try {
        const response = await api('activate', { keyword: value });
        applyData(response);
        if (!state.activated) await refresh(true);
        if (state.activated) { toast('冷咖啡已激活，选一个工作流开始吧。'); loadWelcome(); }
        else state.error = '已提交启动词，等待 Harness 确认激活。';
      } catch (error) { state.error = error.message; }
      finally {
        state.pending = false;
        renderOverview();
        if (state.activated && state.afterActivation === 'tasks') {
          state.afterActivation = '';
          chooseView('tasks', false);
          shadow.getElementById('cc-task-input')?.focus({ preventScroll: true });
        }
      }
    } else if (form.dataset.form === 'task') {
      const input = state.input.trim();
      if (!input) { state.error = '先写下目标与任务要求，再点击开始。'; renderTaskState(); shadow.getElementById('cc-task-input').focus(); return; }
      if (!state.activated) { state.error = '请先输入「冷咖啡」启动工作流。'; renderTaskState(); return; }
      state.pending = true; state.error = ''; state.notice = ''; render();
      try {
        const response = await api('dispatch', { workflow: state.workflow, input });
        if (response.task) state.history = [...state.history.filter((item) => item.id !== response.task.id), response.task];
        state.notice = '任务已交给 Harness。请在对应会话中查看实际执行过程。';
        state.input = '';
      } catch (error) { state.error = error.message; }
      finally { state.pending = false; render(); }
    }
  });

  shadow.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { if (root.querySelector('.cc-intro')) dismissIntro(false); else if (state.open) closePanel(); event.stopPropagation(); return; }
    if (event.target.getAttribute('role') === 'tab' && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      const tabs = ['overview', 'tasks', 'history', 'community', 'settings'];
      const current = tabs.indexOf(state.view);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      event.preventDefault(); chooseView(tabs[next], true);
    }
  });

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  reducedMotion.addEventListener('change', (event) => { if (event.matches) { state.animations = false; root.classList.add('cc-no-motion'); render(); dismissIntro(false); } });
  window.addEventListener('pagehide', () => {
    destroyed = true;
    clearTimeout(introTimer);
    clearTimeout(toastTimer);
    clearInterval(pollTimer);
    if (!hadHostSkin) hostDocument.classList.remove('coldcoffee-harness-skin');
    if (previousHostArtwork) hostDocument.style.setProperty('--cc-host-artwork', previousHostArtwork);
    else hostDocument.style.removeProperty('--cc-host-artwork');
    if (previousBackdropOpacity) hostDocument.style.setProperty('--cc-host-artwork-opacity', previousBackdropOpacity);
    else hostDocument.style.removeProperty('--cc-host-artwork-opacity');
    if (hostArtworkObjectUrl) URL.revokeObjectURL(hostArtworkObjectUrl);
  }, { once: true });
  if (config.initialStatus && typeof config.initialStatus === 'object') {
    applyData(config.initialStatus);
    state.online = Boolean(config.initialStatus.plugin && config.initialStatus.plugin.loaded);
  }
  render();
  refresh(true).finally(() => {
    let seen = false;
    try { seen = sessionStorage.getItem('coldcoffee-harness-intro-seen') === String(config.version || '1'); } catch (_) { /* No storage required for operation. */ }
    if (config.preview || !seen) showIntro(false);
  });
}());
