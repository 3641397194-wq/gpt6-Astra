'use strict';
(() => {
  const dialog = document.createElement('dialog');
  dialog.id = 'grok-memory';
  dialog.className = 'gm-dialog';
  dialog.setAttribute('aria-labelledby', 'gm-title');
  // Static UI only. All account/bot/memory data below is rendered with textContent.
  dialog.innerHTML = `
    <header class="gm-top"><div class="gm-brand"><img src="../../assets/brand-v6/avatar.webp" alt="冷咖啡"><div><strong>冷咖啡 · Grok Bot</strong><small>记忆管理 / 本机连接</small></div></div><div class="gm-top-actions"><span id="gm-connection" class="gm-pill">尚未连接</span><button id="gm-close" type="button" aria-label="关闭记忆管理">关闭 ×</button></div></header>
    <section class="gm-hero"><span class="gm-eyebrow">让偏好成为下次对话的起点</span><h2 id="gm-title">把你的习惯，<em>交给记忆。</em></h2><p>连接已登录的 Grok Bot，读取、搜索、写入或忘掉记忆。范围和正文先看清，再确认。冷咖啡原欢迎词可以一键填入，完整保留四个 QQ 群与 Telegram 入口。</p><div class="gm-steps"><span>01 连接本机登录</span><span>02 选择 Bot 与范围</span><span>03 预览 → 确认 → 读回</span></div></section>
    <div class="gm-toolbar"><button id="gm-connect" class="gm-primary" type="button">连接 / 重新检测</button><button id="gm-disconnect" type="button" disabled>断开连接</button><button id="gm-cancel" type="button" disabled>停止等待</button><p>连接仅检测登录和读取 Bot 列表。记忆操作会请求 Grok Bot 云端服务，可能产生服务端用量。</p></div>
    <div class="gm-grid">
      <aside class="gm-panel"><h3>我的 Bot <small id="gm-bot-count">0</small></h3><div id="gm-bots" class="gm-bots"></div><ul id="gm-checks" class="gm-checks" aria-label="连接自检"></ul><p class="gm-hint">登录材料只在主进程内存中使用，不发送给界面、不写入日志或项目。</p></aside>
      <section class="gm-panel"><h3>已读取的记忆 <small id="gm-count">0 条</small></h3><label for="gm-search" class="gm-hint">搜索原文</label><input id="gm-search" class="gm-search" type="search" placeholder="查找偏好、事实或指令"><div class="gm-composer-actions"><button id="gm-pull" type="button" disabled>重新读取 / 验证</button><button id="gm-export" type="button" disabled>导出 JSON</button></div><p id="gm-readline" class="gm-readline">尚未读取。连接后点击重新读取。</p><div id="gm-list" class="gm-list"></div></section>
      <section class="gm-panel gm-compose"><h3>写入新的记忆 <small id="gm-length">0 / 32768</small></h3><div class="gm-composer-actions"><button id="gm-preset" type="button">填入冷咖啡原欢迎词</button></div><label for="gm-text">要记住的完整原文</label><textarea id="gm-text" maxlength="32768" placeholder="例如：请用中文回答，先给结果，再说明依据。"></textarea><div class="gm-input-row"><div><label for="gm-scope">谁可以回忆</label><select id="gm-scope"><option value="user">账号共用</option><option value="agent">仅此 Bot</option></select></div><div><label for="gm-tier">记忆属性</label><select id="gm-tier"><option value="log">普通事实</option><option value="profile">指令 / 偏好</option></select></div></div><p class="gm-hint">正文会原样提交给选中的 Bot；指令是否被采用，以目标服务的实际表现为准。</p><button id="gm-prepare" class="gm-primary" type="button" disabled>预览写入</button>
        <section id="gm-confirm" class="gm-confirm" hidden><h4 id="gm-confirm-title">确认操作</h4><p id="gm-confirm-detail" class="gm-hint"></p><pre id="gm-preview-text"></pre><label><input id="gm-confirm-check" type="checkbox">我已核对原文、Bot 和范围，确认发送这次操作。</label><div class="gm-confirm-actions"><button id="gm-commit" class="gm-primary" type="button" disabled>确认发送</button><button id="gm-discard" type="button">返回编辑</button></div></section>
      </section>
    </div>
    <section class="gm-evidence"><h3>结果要分三步核对</h3><div class="gm-evidence-grid"><div><span>01 Bot 回复确认</span><strong id="gm-ack">尚未发送</strong></div><div><span>02 重新读取记忆</span><strong id="gm-readback">尚未验证</strong></div><div><span>03 新会话实际表现</span><strong>尚未验证 · 请到 Grok Bot 新开对话</strong></div></div><p class="gm-hint">Bot 对话导出仍是模型返回的内容；读到原文也不等于新会话已采用。打开目标软件新对话，单独发送「冷咖啡」再检查欢迎词与工作流表现。</p></section>
    <div id="gm-status" class="gm-status" role="status" aria-live="polite">准备就绪。先连接本机已登录的 Grok Bot。</div>
    <footer class="gm-footer"><div><p><strong>冷咖啡中转 · coldcoffeeai.com</strong>　付费 API 服务，官网查看套餐。</p><p>QQ：1057540028 · 1077074552 · 618179023 · 1131239659</p><p>Telegram 群：t.me/coolcoffeeai　频道：t.me/chachachalkf</p></div><div><button id="gm-site" type="button">前往冷咖啡中转 ↗</button> <button id="gm-community" type="button">社群与定制工作流</button></div></footer>
    <p class="gm-note">本机 Skills 安装与 Bot 云端记忆分别管理。关闭此面板会断开连接并清空内存列表；已发送的云端操作需重新读取核对。Windows / macOS 支持本机登录连接。</p>`;
  document.body.append(dialog);
  const $ = id => document.getElementById(id);
  const desktop = typeof window.coldbrew?.grokMemory === 'function';
  const scopeLabel = { user: '账号共用', agent: '仅此 Bot', team: '团队共享', unknown: '范围待确认' };
  const tierLabel = { profile: '指令 / 偏好', log: '普通事实', '': '属性待确认' };
  const phaseLabel = { connecting: '正在检测本机登录…', 'listing-bots': '正在读取 Bot 列表…',
    reading: '正在读取记忆…', 'reading-through-bot': '当前账号需通过 Bot 对话导出，正在等待…',
    writing: '正在提交写入请求…', forgetting: '正在提交忘掉请求…', waiting: '已发送，正在等待这次请求对应的 Bot 回复…' };
  let state = { bots: [], checks: [], items: [] }, locked = false, poll, listStamp = '', planId = '', presetOriginal = null;

  function message(text, error = false) { $('gm-status').textContent = text; $('gm-status').dataset.error = String(error); }

  function renderList(force = false) {
    const query = $('gm-search').value.trim().toLocaleLowerCase();
    const stamp = JSON.stringify([state.items, query, state.busy, locked, state.stale, state.preview?.id]);
    if (!force && stamp === listStamp) return;
    listStamp = stamp;
    const items = state.items.filter(item => item.text.toLocaleLowerCase().includes(query));
    $('gm-count').textContent = `${items.length} / ${state.items.length} 条`;
    const nodes = items.map(item => {
      const card = document.createElement('article'); card.className = 'gm-item';
      const header = document.createElement('header');
      for (const value of [scopeLabel[item.scope], tierLabel[item.tier], item.learnedAt].filter(Boolean)) {
        const label = document.createElement('span'); label.textContent = value; header.append(label);
      }
      const body = document.createElement('p'); body.textContent = item.text;
      const forget = document.createElement('button'); forget.type = 'button'; forget.textContent = '预览忘掉';
      forget.disabled = !!(state.busy || locked || state.stale || state.preview);
      forget.addEventListener('click', () => act('prepare-forget', { key: item.key }));
      card.append(header, body, forget); return card;
    });
    if (!nodes.length) {
      const empty = document.createElement('div'); empty.className = 'gm-empty';
      empty.textContent = query ? '没有匹配的原文。' : state.lastReadAt ? '这次读取返回 0 条记忆。' : '先选择 Bot，再读取它的记忆。';
      nodes.push(empty);
    }
    $('gm-list').replaceChildren(...nodes);
  }

  function render() {
    const busy = !!(state.busy || locked), preview = state.preview;
    $('gm-connection').textContent = state.connected ? '已连接 · 本机登录' : '尚未连接';
    $('gm-connection').dataset.connected = String(!!state.connected);
    $('gm-bot-count').textContent = String(state.bots.length);
    $('gm-bots').replaceChildren(...state.bots.map(bot => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = bot.label;
      button.setAttribute('aria-pressed', String(bot.id === state.selected)); button.disabled = busy;
      button.addEventListener('click', () => act('select', { bot: bot.id })); return button;
    }));
    if (!state.bots.length) {
      const empty = document.createElement('div'); empty.className = 'gm-empty';
      empty.textContent = state.connected ? '此账号暂时没有 Bot，请在 Grok Bot 创建后重新检测。' : '尚未加载 Bot 列表';
      $('gm-bots').append(empty);
    }
    $('gm-checks').replaceChildren(...state.checks.map(check => {
      const row = document.createElement('li'), mark = document.createElement('i'), text = document.createElement('span');
      mark.textContent = check.ok ? '✓' : '○'; text.textContent = `${check.title} · ${check.detail}`; row.append(mark, text); return row;
    }));
    $('gm-connect').disabled = busy || !desktop;
    $('gm-disconnect').disabled = !state.connected && !busy;
    $('gm-cancel').disabled = !busy;
    $('gm-pull').disabled = busy || !state.selected || !state.connected;
    $('gm-export').disabled = busy || !state.lastReadAt || !!state.stale;
    $('gm-preset').disabled = busy || !!preview || !desktop;
    for (const id of ['gm-text', 'gm-scope', 'gm-tier']) $(id).disabled = busy || !!preview;
    $('gm-length').textContent = `${$('gm-text').value.length} / 32768`;
    $('gm-prepare').disabled = busy || !!preview || !state.connected || !state.selected || !$('gm-text').value.trim();
    $('gm-confirm').hidden = !preview;
    if (preview) {
      if (planId !== preview.id) { $('gm-confirm-check').checked = false; planId = preview.id; }
      $('gm-confirm-title').textContent = preview.action === 'write' ? '写入前再核对一次' : '按原文请求 Bot 忘掉';
      $('gm-confirm-detail').textContent = `${preview.bot} · ${scopeLabel[preview.scope]} · ${tierLabel[preview.tier]}` + (preview.action === 'forget' ? '。按原文定位，实际删除情况需要重新读取核对。' : '。将发送这份完整原文。');
      $('gm-preview-text').textContent = preview.text;
    } else { planId = ''; $('gm-preview-text').textContent = ''; }
    $('gm-commit').disabled = busy || !preview || !$('gm-confirm-check').checked;
    $('gm-discard').disabled = busy;
    const source = state.source === 'direct' ? '服务端列表' : 'Bot 对话导出';
    $('gm-readline').textContent = state.lastReadAt
      ? `${source} · ${new Date(state.lastReadAt).toLocaleTimeString('zh-CN', { hour12: false })}${state.more ? ' · 本次可能未列全' : ''}${state.stale ? ' · 操作已发出，请重新读取' : ''}`
      : '尚未读取。连接后点击重新读取。';
    const evidence = state.evidence;
    $('gm-ack').textContent = evidence ? evidence.acknowledgement ? 'Bot 已回复确认' : '尚未得到确认 · 请读回核对' : '尚未发送';
    const readLabels = { 'not-checked': '尚未验证', found: '原文、范围与属性匹配', 'text-found': '找到原文 · 范围或属性待确认',
      partial: '导出未列全 · 继续核对', 'not-found': '本次读取未找到原文', 'still-present': '原文仍在本次读取中', absent: '本次读取未见原文' };
    $('gm-readback').textContent = readLabels[evidence?.readBack] || '尚未验证';
    renderList();
  }

  async function request(action, payload = {}) {
    if (!desktop) throw new Error('请使用桌面版连接 Grok Bot；网页预览仅展示界面。');
    const response = await window.coldbrew.grokMemory(action, payload);
    state = response.state;
    render();
    if (!response.ok) message(response.error.message, true);
    else if (state.busy) message(phaseLabel[state.phase] || '正在处理…');
    return response;
  }

  async function act(action, payload = {}) {
    if (locked && !['cancel', 'disconnect'].includes(action)) return;
    const foreground = !['cancel', 'disconnect'].includes(action);
    if (foreground) {
      locked = true; render();
      message(action === 'connect' ? '正在检测本机登录并连接服务…' : '正在处理这次操作…');
      poll = setInterval(() => request('status').catch(() => {}), 700);
    }
    try {
      const response = await request(action, payload);
      if (response.ok) {
        if (action === 'preset') { presetOriginal = response.text; $('gm-text').value = response.text; render(); message('完整原欢迎词已填入，尚未发送。请选择范围与属性后预览。'); }
        else if (action === 'commit') message('Bot 已回复确认。请点重新读取 / 验证，核对原文；新会话效果另行检查。');
        else if (action === 'pull') message(state.more ? '已读取这一批记忆；服务端提示可能未列全。' : '已更新本次读取列表，来源与验证阶段见上方。');
        else if (action === 'connect') message(state.bots.length ? '连接成功。请选择 Bot，再读取记忆或预览写入。' : '连接成功，但当前账号未返回 Bot。请到 Grok Bot 创建后重新检测。');
        else if (action === 'disconnect') message('已断开并清空本机内存列表。云端记忆保留原状。');
        else if (action === 'cancel') message('已请求停止等待。已发送操作仍可能执行，请重新读取核对。');
        else if (action.startsWith('prepare-')) message('预览已生成，核对后勾选确认再发送。');
        else message('已就绪。');
      }
    } catch { message('连接暂时中断，请重试或重新打开此面板。', true); }
    finally { if (foreground) { locked = false; clearInterval(poll); poll = null; render(); } }
  }

  $('gm-connect').addEventListener('click', () => act('connect'));
  $('gm-disconnect').addEventListener('click', () => act('disconnect'));
  $('gm-cancel').addEventListener('click', () => act('cancel'));
  $('gm-pull').addEventListener('click', () => act('pull'));
  $('gm-preset').addEventListener('click', () => act('preset'));
  $('gm-search').addEventListener('input', () => renderList(true));
  $('gm-text').addEventListener('input', () => { presetOriginal = null; render(); });
  $('gm-prepare').addEventListener('click', () => act('prepare-write', { text: presetOriginal ?? $('gm-text').value, scope: $('gm-scope').value, tier: $('gm-tier').value }));
  $('gm-confirm-check').addEventListener('change', render);
  $('gm-commit').addEventListener('click', () => act('commit', { planId: state.preview?.id, confirm: $('gm-confirm-check').checked }));
  $('gm-discard').addEventListener('click', () => act('discard-preview'));
  $('gm-export').addEventListener('click', () => {
    if (!state.lastReadAt || state.stale) return;
    const data = { format: 'coldcoffee-grok-memory-v1', bot: state.bots.find(bot => bot.id === state.selected)?.label,
      readAt: state.lastReadAt, source: state.source, partial: !!state.more,
      memories: state.items.map(({ text, scope, tier, learnedAt }) => ({ text, scope, tier, learnedAt })) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'coldcoffee-grok-memories.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    message('已导出本次读取的记忆原文。文件中可能含你保存的私人内容，请自行保管。');
  });
  $('gm-site').addEventListener('click', () => window.coldbrew?.openExternal?.('https://coldcoffeeai.com/'));
  $('gm-community').addEventListener('click', () => { dialog.close(); document.querySelector('.nav[data-page="community"]')?.click(); });
  $('gm-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    clearInterval(poll); poll = null;
    $('gm-text').value = ''; $('gm-search').value = ''; $('gm-confirm-check').checked = false;
    presetOriginal = null;
    if (desktop) act('disconnect');
  });
  window.ColdCoffeeGrokMemory = Object.freeze({ open: async () => {
    if (!dialog.open) dialog.showModal();
    if (desktop) { try { await request('status'); } catch { message('请重新打开桌面版后重试。', true); } }
    else { render(); message('网页预览只展示界面。请下载桌面版，连接已登录的 Grok Bot。'); }
  } });
  render();
})();
