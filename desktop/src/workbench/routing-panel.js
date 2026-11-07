'use strict';
// ColdCoffee's native routing view. Only projected engine evidence enters this
// module; it never guesses which provider the gateway should have selected.
window.ColdCoffeeRoutingPanel = Object.freeze({ create({ $, state, call, number, detailRoute, detailContext, changed }) {
  const R = window.ColdCoffeeRouting;
  const kinds = { system: ['系统提示', '#e4576b'], tools: ['工具说明', '#be596b'], skills: ['技能', '#cda78c'], memory: ['工作说明', '#b5b8bf'], files: ['文件内容', '#78998e'], results: ['工具结果', '#a17d78'], chat: ['会话内容', '#939ba8'], remaining: ['剩余空间', '#64676f'], other: ['未分项内容', '#8c8491'] };
  const el = (tag, className, text) => Object.assign(document.createElement(tag), { className: className || '', ...(text === undefined ? {} : { textContent: text }) });
  const button = (text, onClick, className = '') => { const b = el('button', className, text); b.type = 'button'; b.onclick = onClick; return b; };
  const option = (value, text) => Object.assign(document.createElement('option'), { value, textContent: text });
  const current = () => state.snapshot?.routes?.find(r => r.id === state.routeId) || state.snapshot?.routes?.at(-1);
  const second = ms => `${((ms || 0) / 1000).toFixed(2)} 秒`;
  let graphSignature = '', selectSignature = '', contextSignature = '', groupsSignature = '', mode = 'window', contextKind = 'all', edit = null, editingMembers = [], saving = false;
  const openBranches = new Set();

  function decisionList(route) {
    return R.story(route).map(step => {
      const li = el('li', 'vg-decision-step'); li.dataset.state = step.tone;
      li.append(el('strong', '', step.title), el('p', '', step.detail)); return li;
    });
  }
  function branchGroup(route, path, host, containers) {
    if (!path?.length) return host;
    let parent = host, key = '';
    for (const id of path) {
      key += '>' + id;
      if (!containers.has(key)) {
        const group = route.group?.subs?.find(g => g.id === id || g.ref === id);
        const section = el('section', 'vg-nested-group'); section.dataset.group = id;
        const title = el('div', 'vg-nested-title'); title.append(el('strong', '', group?.name || id), el('span', '', R.policy(group?.routing)));
        const children = el('div', 'vg-nested-children'); section.append(title, children); parent.append(section); containers.set(key, children);
      }
      parent = containers.get(key);
    }
    return parent;
  }
  function render(route) {
    const totals = state.snapshot?.totals || {};
    for (const [suffix, name] of [['requests', 'requests'], ['rerouted', 'rerouted'], ['errors', 'errors']]) $(`vg-total-${suffix}`).textContent = number(totals[name]);
    const routes = state.snapshot?.routes || [];
    const ss = JSON.stringify([routes.map(r => [r.id, r.done, r.status, r.model]), route?.id, state.routeId]);
    if (ss !== selectSignature) {
      selectSignature = ss;
      $('vg-route-select').replaceChildren(option('', routes.length ? '跟随最新请求' : '等待请求'), ...routes.slice().reverse().map(r => option(String(r.id), `#${r.id} · ${r.group?.name || r.model} · ${r.done ? `HTTP ${r.status || '—'}` : '响应中'}${r.demo ? ' · 本机演示' : ''}`)));
      $('vg-route-select').value = state.routeId === null ? '' : String(route?.id || '');
    }
    $('vg-route-name').textContent = route ? route.group ? `${route.group.name} · 路由组` : route.model : '等待网关记录';
    const seats = R.candidates(route);
    $('vg-route-policy').textContent = route ? `${route.group ? R.policy(route.group.routing) + ' · ' + R.affinity(route.group.affinity) + ' · ' : ''}${seats.filter(s => !s.excluded).length} 条候选连接 · ${(route.tries || []).length} 次实际尝试${route.actualName ? ` · 实际命中：${route.actualName} / ${route.actualModel || '未上报模型名'}` : ''}` : '候选顺序、成员状态和决策说明，全部来自网关记录。';
    $('vg-request-id').textContent = route ? `#${route.id} · ${route.time ? new Date(route.time).toLocaleTimeString('zh-CN', { hour12: false }) : ''}` : '';
    const signature = JSON.stringify([route, state.private]);
    if (signature !== graphSignature) {
      graphSignature = signature;
      const host = $('vg-branches'); host.replaceChildren();
      const containers = new Map(), grouped = new Map();
      for (const s of seats) {
        const key = JSON.stringify([s.via || [], s.provider, s.model, s.excluded]);
        if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(s);
      }
      for (const [key, members] of grouped) {
        const head = members[0];
        const parent = branchGroup(route, head.via, host, containers);
        const branch = el('details', 'vg-branch'); branch.dataset.branch = key;
        const status = ['running', 'hit', 'failed', 'pending', 'standby', 'excluded'].find(s => members.some(m => m.status === s));
        branch.dataset.state = status; branch.open = !openBranches.has('closed:' + key);
        branch.addEventListener('toggle', () => { if (branch.open) openBranches.delete('closed:' + key); else openBranches.add('closed:' + key); });
        const title = el('summary', 'vg-branch-title');
        const labels = el('div'); labels.append(el('strong', '', head.name || head.provider || '引擎成员'), el('code', '', head.model || '模型未记录'));
        title.append(el('span', 'vg-branch-dot'), labels, el('span', 'vg-branch-policy', `${R.policy(head.routing)} · ${members.length} 条连接`));
        const body = el('div', 'vg-branch-seats');
        for (const s of members) {
          const seat = button('', () => detailRoute(route), 'vg-seat'); seat.dataset.state = s.status; seat.dataset.provider = s.provider || ''; seat.dataset.seat = s.id; seat.dataset.model = s.model || '';
          const text = el('div', 'vg-seat-copy');
          text.append(el('strong', '', `${s.label || '连接'} ${members.indexOf(s) + 1}`), el('span', '', s.note));
          const info = [];
          if (s.known) info.push(`额度已用 ${Math.round((s.used || 0) * 100)}%`);
          if (s.window) info.push(`窗口 ${number(s.window)}`);
          if (s.fast) info.push('快速模式');
          if (s.fixed) info.push(`固定推理 ${s.fixed}`);
          if (s.fallback) info.push('后备连接');
          if (s.reserve) info.push(`保留序位 ${s.reserve}`);
          if (s.attempts.length) info.push(s.attempts.map(t => `尝试 ${t.step} · ${!t.done ? '响应中' : 'HTTP ' + (t.status || '—')} · ${second(t.ms)}`).join(' / '));
          if (info.length) text.append(el('small', '', info.join(' · ')));
          seat.append(el('i'), text, el('b', '', { hit: '已命中', running: '响应中', failed: '异常', standby: '备用', pending: '等待', excluded: '未入选' }[s.status])); body.append(seat);
        }
        branch.append(title, body); parent.append(branch);
      }
      if (!seats.length) host.append(el('div', 'vg-routing-empty', route ? route.error || '网关正在准备候选，尚未上报尝试。' : '接入中转后，多模型、多连接与嵌套路由会在这里展开。点击「体验可视化」先看一条真实本机请求。'));
      $('vg-route-story').replaceChildren(...decisionList(route));
      if (!route) $('vg-route-story').append(el('li', 'vg-no-requests', '等待第一条真实网关记录。'));
    }
    if ($('vg-groups-dialog').open && !saving) renderGroups();
  }
  function itemName(item) {
    const kind = kinds[item.kind]?.[0] || item.kind;
    if (item.kind === 'remaining' || item.kind === 'other') return kind;
    if (state.private && ['system', 'memory', 'files', 'chat'].includes(item.kind)) return item.kind === 'chat' && item.tag === 'turn' ? `第 ${item.name} 轮` : kind + (item.index !== null ? ` · 项目 ${item.index + 1}` : '');
    return item.tag === 'turn' ? `第 ${item.name} 轮` : item.name || kind;
  }
  function renderContext(route) {
    const signature = JSON.stringify([route?.id, route?.prompt, route?.usage, route?.actualProvider, route?.actualModel, state.private, mode, contextKind]);
    if (signature === contextSignature) return; contextSignature = signature;
    const prompt = route?.prompt;
    const hasWindow = prompt?.window > 0, tokens = prompt?.tokens || 0, fill = hasWindow ? tokens / prompt.window : 0;
    $('vg-used').replaceChildren(document.createTextNode(prompt ? number(tokens) : '—'), el('small', '', '词元已用'));
    $('vg-free').textContent = hasWindow ? `${number(Math.max(0, prompt.window - tokens))} / ${number(prompt.window)}` : prompt ? '模型未提供窗口上限' : '等待请求';
    $('vg-fill').textContent = hasWindow ? `${Math.round(fill * 100)}%` : '—';
    $('vg-capacity-fill').style.width = `${Math.min(100, fill * 100)}%`;
    $('vg-capacity-fill').dataset.over = String(fill > 1);
    $('vg-context-basis').textContent = prompt ? prompt.counted ? '总量：供应商计数' : '总量：请求测量估算' : '仅观测经过网关的请求';
    $('vg-turns').textContent = prompt?.turns ? `${number(prompt.turns)} 轮会话` : '';
    const cache = R.cache(route);
    $('vg-cache').textContent = cache ? `缓存命中 ${Math.round(cache.ratio * 100)}% · 读取 ${number(cache.read)}${cache.write ? ` · 写入 ${number(cache.write)}` : ''} 词元` : '缓存命中：供应商未提供计数';
    $('vg-context-foot').textContent = prompt ? `${route.demo ? '本机演示 · ' : ''}${prompt.counted ? '总量采用供应商计数，内容分项按请求测量后校准。' : '总量与内容分项为请求测量估算。'}${fill > 1 ? '当前记录超过已知窗口上限。' : !hasWindow ? '窗口上限未知，仅显示已用内容。' : mode === 'window' && contextKind === 'all' ? '斜纹表示剩余空间；小色块可通过明细列表查看。' : '当前放大已用内容，色块占比以所显示内容为分母。'}原文仅在点击后读取；未返回缓存计数时不显示虚构命中率。` : '点击「体验可视化」，或接入软件开始聊天。';
    const filter = $('vg-context-filter');
    const selected = contextKind;
    filter.replaceChildren(option('all', '全部分类'), ...(prompt?.parts || []).map(p => option(p.kind, kinds[p.kind]?.[0] || p.kind)));
    if (![...filter.options].some(o => o.value === selected)) contextKind = 'all'; filter.value = contextKind;
    for (const b of document.querySelectorAll('[data-context-mode]')) b.setAttribute('aria-pressed', String(b.dataset.contextMode === mode));
    $('vg-treemap').replaceChildren(); $('vg-context-items').replaceChildren(); $('vg-legend').replaceChildren();
    if (!prompt) { $('vg-treemap').append(el('div', 'vg-empty-context', '上下文窗口将在请求经过网关后展开。')); return; }
    const entries = R.contextEntries(prompt, { mode, kind: contextKind });
    const denominator = entries.reduce((n, e) => n + e.tokens, 0);
    for (const rect of R.treemap(entries)) {
      const label = itemName(rect) + (rect.n > 1 ? ` ×${rect.n}` : '');
      const tile = button('', () => { if (kinds[rect.kind] && !['remaining', 'other'].includes(rect.kind)) detailContext(route, rect.kind, rect.index); }, 'vg-tile');
      tile.dataset.kind = rect.kind; tile.dataset.item = String(rect.index);
      Object.assign(tile.style, { left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.w}%`, height: `${rect.h}%` }); tile.style.setProperty('--tile', kinds[rect.kind]?.[1] || '#8c8491');
      tile.append(el('strong', '', label), el('span', '', `${number(rect.tokens)} 词元`), el('small', '', `${(rect.tokens / Math.max(1, denominator) * 100).toFixed(1)}%${rect.kind === 'remaining' ? ' · 未使用' : ''}`));
      tile.title = `${label} · ${number(rect.tokens)} 词元${rect.kind === 'remaining' ? ' · 剩余空间' : ' · 点击查看明细'}`; tile.setAttribute('aria-label', tile.title);
      if (['remaining', 'other'].includes(rect.kind)) tile.disabled = true;
      $('vg-treemap').append(tile);
    }
    for (const part of prompt.parts || []) {
      const b = button(`${kinds[part.kind]?.[0] || part.kind} ${number(part.tokens)}`, () => { contextKind = contextKind === part.kind ? 'all' : part.kind; mode = contextKind === 'all' ? mode : 'content'; renderContext(current()); });
      b.setAttribute('aria-pressed', String(contextKind === part.kind)); b.style.setProperty('--tile', kinds[part.kind]?.[1]); $('vg-legend').append(b);
    }
    if (hasWindow && prompt.window > tokens) { const note = el('span', 'vg-remaining-key', `剩余空间 ${number(prompt.window - tokens)}`); $('vg-legend').append(note); }
    const items = R.contextEntries(prompt, { mode: 'content', kind: contextKind }).filter(e => e.kind !== 'remaining');
    for (const item of items) {
      const b = button('', () => detailContext(route, item.kind, item.index), 'vg-content-row'); b.dataset.kind = item.kind; b.dataset.item = String(item.index);
      b.style.setProperty('--tile', kinds[item.kind]?.[1] || '#8c8491');
      const copy = el('span', 'vg-content-copy'); copy.append(el('strong', '', itemName(item)), el('small', '', `${kinds[item.kind]?.[0] || item.kind}${item.n > 1 ? ` · ×${item.n}` : ''}${item.tag ? ' · ' + item.tag : ''}`));
      const bar = el('span', 'vg-content-bar'); const value = el('i'); value.style.width = `${item.tokens / Math.max(1, items[0]?.tokens || 0) * 100}%`; bar.append(value);
      b.append(copy, bar, el('span', 'vg-content-tokens', number(item.tokens)), el('span', 'vg-content-open', '查看 ↗')); b.disabled = item.kind === 'other'; $('vg-context-items').append(b);
    }
    if (!items.length) $('vg-context-items').append(el('p', 'vg-small-note', '这个分类没有内容分项。'));
  }
  function renderGroups() {
    const catalog = state.snapshot?.catalog || { groups: [], models: [] };
    const signature = JSON.stringify(catalog); if (signature === groupsSignature) return; groupsSignature = signature;
    $('vg-group-cards').replaceChildren();
    for (const group of catalog.groups) {
      const card = el('article', 'vg-group-card');
      const title = el('div', 'vg-group-card-title'); title.append(el('strong', '', group.name), el('span', '', group.ready ? '可接入' : '尚未就绪'));
      card.append(title, el('code', '', group.ref || `group/${group.id}`), el('p', '', `${R.policy(group.routing)} · ${R.affinity(group.affinity)} · ${group.members?.length || 0} 个成员${group.rules ? ` · ${group.rules} 条规则` : ''}${group.patterns ? ` · ${group.patterns} 个匹配模式` : ''}`));
      for (const member of group.memberInfo || []) card.append(el('div', 'vg-group-member-note', `${member.ready ? '●' : '○'} ${member.name || member.provider || '嵌套组'} / ${member.model || member.id} · ${member.on || 0} 个启用连接`));
      const actions = el('div', 'vg-group-card-actions');
      const use = button('选择此组用于接入', () => { state.selected = group.ref || `group/${group.id}`; changed(); $('vg-group-status').textContent = `已选择 ${group.name}。关闭后点击「一键接入 AI」保存到目标软件；现有客户端配置保持原样。`; }); use.disabled = !group.ready;
      actions.append(use, button('编辑成员 / 策略', () => editGroup(group))); card.append(actions); $('vg-group-cards').append(card);
    }
    if (!catalog.groups.length) $('vg-group-cards').append(el('p', 'vg-small-note', '还没有路由组。先验证中转获取模型，再创建主备或轮询组合。'));
  }
  function editGroup(group) {
    edit = group || null; editingMembers = [...(group?.members || [])];
    $('vg-group-form').hidden = false; $('vg-group-form-title').textContent = group ? `编辑：${group.name}` : '新建路由组';
    $('vg-group-id').value = group?.id || ''; $('vg-group-id').disabled = !!group; $('vg-group-name').value = group?.name || '';
    $('vg-group-routing').replaceChildren(...Object.entries(R.policies).map(([v, t]) => option(v, t))); $('vg-group-routing').value = group?.routing || (group ? '' : 'order');
    $('vg-group-affinity').replaceChildren(...Object.entries(R.affinities).map(([v, t]) => option(v, t))); $('vg-group-affinity').value = group?.affinity || '';
    $('vg-group-edit-note').textContent = group ? '仅更新名称、成员顺序、路由策略与会话保持。已有规则、嵌套组、模式与高级设置保留；循环嵌套由引擎校验。' : '按顺序：主线路异常后再试后备。手动指定：只使用第一位或已指定的成员。复杂条件、权重和单 Key 管理仍在「完整引擎」。';
    renderMembers();
  }
  function renderMembers() {
    $('vg-group-members').replaceChildren(...editingMembers.map((m, i) => {
      const row = el('div', 'vg-group-member'); row.append(el('b', '', String(i + 1)), el('code', '', m));
      for (const [text, delta] of [['↑', -1], ['↓', 1]]) { const b = button(text, () => { const j = i + delta; [editingMembers[i], editingMembers[j]] = [editingMembers[j], editingMembers[i]]; renderMembers(); }); b.disabled = i + delta < 0 || i + delta >= editingMembers.length; b.setAttribute('aria-label', text === '↑' ? '上移成员' : '下移成员'); row.append(b); }
      row.append(button('移除', () => { editingMembers.splice(i, 1); renderMembers(); })); return row;
    }));
    const catalog = state.snapshot?.catalog;
    const choices = [...(catalog?.models || []).map(m => ({ id: m.id, label: `${m.providerName || m.provider} / ${m.name}` })), ...(catalog?.groups || []).filter(g => g.id !== edit?.id).map(g => ({ id: g.ref || `group/${g.id}`, label: `嵌套组 / ${g.name}` }))].filter(m => !editingMembers.includes(m.id) && !m.id.startsWith('local-demo/'));
    $('vg-group-add').replaceChildren(...(choices.length ? choices.map(m => option(m.id, m.label)) : [option('', '没有更多可选成员，请先连接中转')]));
    $('vg-group-add-button').disabled = !choices.length;
  }
  $('vg-route-select').onchange = () => { state.routeId = Number($('vg-route-select').value) || null; changed(); };
  $('vg-context-filter').onchange = () => { contextKind = $('vg-context-filter').value; renderContext(current()); };
  for (const b of document.querySelectorAll('[data-context-mode]')) b.onclick = () => { mode = b.dataset.contextMode; if (mode === 'window') contextKind = 'all'; renderContext(current()); };
  $('vg-groups-open').onclick = async () => {
    $('vg-groups-dialog').showModal(); $('vg-group-status').textContent = '正在读取网关目录…';
    try { const catalog = await call('groups'); if (state.snapshot) { state.snapshot.catalog = catalog; state.snapshot.availableModels = catalog.availableModels; } groupsSignature = ''; renderGroups(); $('vg-group-status').textContent = '当前目录已从网关同步。'; changed(); }
    catch (error) { $('vg-group-status').textContent = error.message; }
  };
  $('vg-group-new').onclick = () => editGroup(null);
  $('vg-group-abandon').onclick = () => { if (!saving) $('vg-group-form').hidden = true; };
  $('vg-group-add-button').onclick = () => { const id = $('vg-group-add').value; if (id && !editingMembers.includes(id)) { editingMembers.push(id); renderMembers(); } };
  $('vg-group-form').onsubmit = async event => {
    event.preventDefault(); if (saving) return; saving = true;
    const form = $('vg-group-form');
    const disabled = [...form.elements].map(control => [control, control.disabled]); for (const [c] of disabled) c.disabled = true;
    $('vg-group-status').textContent = '正在保存到真实网关…';
    try {
      const catalog = await call('group-save', { create: !edit, id: $('vg-group-id').value, name: $('vg-group-name').value, revision: edit?.revision, members: editingMembers, routing: $('vg-group-routing').value, affinity: $('vg-group-affinity').value });
      state.snapshot.catalog = catalog; state.snapshot.availableModels = catalog.availableModels; groupsSignature = ''; renderGroups(); changed(); form.hidden = true;
      $('vg-group-status').textContent = '已保存。选择此组用于接入后，客户端的新请求才会采用这个入口；此操作只保存配置，模型请求需另外发起。';
    } catch (error) { $('vg-group-status').textContent = error.message; }
    finally { for (const [c, was] of disabled) c.disabled = was; saving = false; }
  };
  return { render, renderContext, decisionList };
} });
