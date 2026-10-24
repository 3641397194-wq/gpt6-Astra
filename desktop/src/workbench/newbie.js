'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const stage = $('newbie');
  if (!stage) return;
  const board = $('newbie-cards');
  const status = $('newbie-status');
  const finale = $('newbie-finale');
  const go = $('newbie-go');
  let rows = [];
  let busy = false;
  const desktop = !!window.coldbrew?.beginner;
  const DEMO = [
    ['codex', 'Codex', 'GPT'], ['claude', 'Claude', 'Code'], ['grok', 'Grok', '4.7'], ['deepseek', window.ColdCoffeeCore.DEEPSEEK_LABEL, 'Harness'],
    ['glm53', 'GLM', '5.3'], ['gemini', 'Gemini', '全模型'], ['doubao', '豆包', '技能'], ['workbuddy', 'WorkBuddy', '搭档'],
    ['cursor', 'Cursor', '.cursor'], ['mimo', 'MiMo-V2.6-Pro', '.config'], ['kimi', 'Kimi K3.1', '.kimi-code'],
  ];

  function toast(text) {
    const el = $('toast');
    if (!el) return;
    el.textContent = text;
    el.classList.add('visible');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('visible'), 2200);
  }

  function setStep(n) {
    document.querySelectorAll('.newbie-steps button').forEach((button) => {
      button.classList.toggle('on', button.dataset.step === String(n));
    });
  }

  function shortPath(value) {
    if (!value) return '';
    return value.length > 42 ? '…' + value.slice(-40) : value;
  }

  function paint() {
    const picked = rows.filter((row) => row.picked).length;
    const undo = $('newbie-undo');
    go.textContent = busy ? '正在写入…' : `一键破甲 · ${picked}`;
    go.disabled = busy || !picked;
    if (undo) {
      undo.textContent = busy ? '请稍等…' : `一键卸载 · ${picked}`;
      undo.disabled = busy || !picked;
    }
    const cards = [];
    for (const row of rows) {
      const card = document.createElement('div');
      card.className = 'newbie-card' + (row.state ? ' is-' + row.state : '');
      card.setAttribute('role', 'button');
      card.tabIndex = busy ? -1 : 0;
      card.setAttribute('aria-pressed', row.picked ? 'true' : 'false');
      if (row.kind === 'local-skill') card.dataset.skillId = row.skillId;
      const tick = document.createElement('i');
      tick.className = 'tick';
      const mark = document.createElement('span');
      mark.className = 'mark';
      mark.textContent = row.line || 'SEAT';
      const name = document.createElement('strong');
      name.textContent = row.name;
      const state = document.createElement('span');
      state.className = 'state';
      state.textContent = row.stateText;
      card.append(tick, mark, name, state);
      if (row.root) {
        const code = document.createElement('code');
        code.textContent = shortPath(row.root);
        code.title = row.root;
        card.append(code);
      }
      if (row.kind === 'local-skill' && row.manualRoot) {
        const box = document.createElement('div');
        box.className = 'newbie-open';
        const choose = document.createElement('button');
        choose.type = 'button';
        choose.textContent = row.skillsRoot ? '更换 Skills 目录' : '选择 Skills 目录';
        choose.addEventListener('click', async (event) => {
          event.stopPropagation();
          try { await chooseSkillDirectory(row); }
          catch (error) { status.textContent = error.message; }
        });
        box.append(choose);
        card.append(box);
      }
      if (row.launchers?.length) {
        const box = document.createElement('div');
        box.className = 'newbie-open';
        for (const launcher of row.launchers.slice(0, 2)) {
          const open = document.createElement('button');
          open.type = 'button';
          open.textContent = '打开 ' + launcher.name;
          open.addEventListener('click', async (event) => {
            event.stopPropagation();
            if (!desktop) { toast('这是样子。用桌面上的冷咖啡破甲工作台打开，才能真正启动。'); return; }
            try {
              const opened = await window.coldbrew.beginner('open', { seat: row.seat, path: launcher.path });
              toast(opened.toolbox === 'ida' ? '已打开，工具箱已接入' : '已打开 ' + launcher.name);
            } catch (error) { toast(error.message); }
          });
          box.append(open);
        }
        card.append(box);
      }
      const toggle = () => {
        if (busy || !row.ok) return;
        row.picked = !row.picked;
        paint();
      };
      card.addEventListener('click', (event) => {
        if (event.target.closest('.newbie-open')) return;
        toggle();
      });
      card.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        toggle();
      });
      card.addEventListener('pointermove', (event) => {
        const rect = card.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - 0.5;
        const y = (event.clientY - rect.top) / rect.height - 0.5;
        card.style.transform = `rotateX(${(-y * 8).toFixed(2)}deg) rotateY(${(x * 10).toFixed(2)}deg)`;
      });
      card.addEventListener('pointerleave', () => { card.style.transform = ''; });
      cards.push(card);
    }
    board.replaceChildren(...cards);
  }

  function skillRows(list) {
    const marks = { 'grok-bot': 'GROK / SKILL', 'claude-duet': 'CLAUDE / SKILL', 'chatgpt-dot': 'CODEX / SKILL', 'meta-muse': 'LOCAL / SKILL' };
    return list.map((profile) => ({
      kind: 'local-skill', skillId: profile.id, manualRoot: !!profile.manualRoot,
      name: profile.name, line: marks[profile.id] || 'LOCAL / SKILL',
      ok: true, exists: !!profile.exists, installed: !!profile.installed,
      skillsRoot: profile.skillsRoot || '', root: profile.installFile || profile.suggestedSkillsRoot || '',
      state: '', picked: false,
      stateText: profile.installed ? '已安装 · 勾选后可恢复' : profile.exists ? '已有同名文件 · 安装时会备份' : profile.manualRoot ? '选择实际 Skills 目录' : '本地技能 · 尚未安装',
    }));
  }

  function fromScan(list, skills = []) {
    const seats = list.map((row) => ({
      ...row,
      picked: !!(row.ok && row.exists),
      state: '',
      stateText: !row.ok ? row.error : row.exists ? '发现了，已经替你勾上' : '这台电脑还没有，点一下也能装',
      launchers: row.launchers || [],
    }));
    rows = [...seats, ...skillRows(skills)];
    if (!seats.some((row) => row.picked)) seats.forEach((row) => { if (row.ok) row.picked = true; });
    status.textContent = desktop ? '点卡片可以去掉不想动的。只会改勾上的软件，原来的文件先备份。' : '现在看的是样子。用桌面上的冷咖啡破甲工作台打开，才会真的写入。';
    setStep(1);
    paint();
  }

  async function load() {
    if (!desktop) {
      let skills = [];
      try { skills = await localSkillCall('list'); }
      catch { skills = window.ColdCoffeeCore.LOCAL_AGENT_PROFILES.map(profile => ({ id: profile.id, name: profile.name, manualRoot: profile.manualRoot, suggestedSkillsRoot: profile.root, exists: false, installed: false })); }
      fromScan(DEMO.map(([seat, name, line]) => ({ ok: true, seat, name, line, exists: seat === 'codex' || seat === 'claude' || seat === 'grok', root: seat === 'codex' ? '预览 · 不会写入' : '', launchers: seat === 'codex' ? [{ name: 'Codex', path: '' }] : [] })), skills);
      return;
    }
    status.textContent = '正在认你电脑上的软件…';
    try {
      const [scan, skills] = await Promise.all([window.coldbrew.beginner('scan'), window.coldbrew.localSkills('list')]);
      fromScan(scan, skills);
    } catch (error) {
      status.textContent = error.message;
    }
  }

  async function chooseSkillDirectory(row) {
    if (!desktop && !window.coldbrew?.localSkills && !window.fetch) throw new Error('请在桌面版选择 Skills 目录');
    const selected = await localSkillCall('choose', { id: row.skillId });
    if (selected?.canceled) return;
    row.skillsRoot = selected.root;
    row.root = selected.installFile;
    const checked = await localSkillCall('verify', { id: row.skillId });
    row.exists = checked.checks.some((item) => item.exists);
    row.installed = checked.ok;
    row.stateText = checked.ok ? '已安装 · 勾选后可恢复' : row.exists ? '已有同名文件 · 安装时会备份' : '目录已选 · 可纳入一键破甲';
    paint();
  }

  async function prepareSkillInstall(row) {
    if (row.manualRoot) {
      if (!row.skillsRoot) {
        const selected = await localSkillCall('choose', { id: row.skillId });
        if (selected?.canceled) return null;
        row.skillsRoot = selected.root;
        row.root = selected.installFile;
      }
    } else {
      const selected = await localSkillCall('select-default', { id: row.skillId });
      row.skillsRoot = selected.root;
      row.root = selected.installFile;
    }
    const plan = await localSkillCall('preview', { id: row.skillId });
    const result = await localSkillCall('install', { id: row.skillId, planId: plan.id, confirm: true });
    return result?.canceled ? null : result;
  }

  async function restoreSkill(row) {
    if (row.manualRoot) {
      if (!row.skillsRoot) {
        const selected = await localSkillCall('choose', { id: row.skillId });
        if (selected?.canceled) return null;
        row.skillsRoot = selected.root;
        row.root = selected.installFile;
      }
    } else {
      const selected = await localSkillCall('select-default', { id: row.skillId });
      row.skillsRoot = selected.root;
      row.root = selected.installFile;
    }
    const history = await localSkillCall('history', { id: row.skillId });
    const latest = history.find((item) => item.status === 'applied');
    if (!latest) throw new Error(`${row.name} · 没有可恢复的安装记录`);
    return localSkillCall('restore', { id: row.skillId, transactionId: latest.id, confirm: true });
  }

  async function install() {
    const picked = rows.filter((row) => row.picked && row.ok);
    if (!picked.length || busy) return;
    if (!desktop) {
      setStep(2);
      status.textContent = '预览不会写文件。从桌面「冷咖啡破甲工作台」打开后再点这一下。';
      finale.hidden = false;
      setStep(3);
      toast('先用桌面版');
      return;
    }
    busy = true;
    finale.hidden = true;
    setStep(2);
    paint();
    let done = 0;
    for (const row of picked) {
      row.state = 'run';
      row.stateText = '正在备份并写入…';
      status.textContent = `正在处理 ${row.name}`;
      paint();
      try {
        if (row.kind === 'local-skill') {
          const result = await prepareSkillInstall(row);
          if (!result) { row.state = ''; row.stateText = '已取消'; paint(); continue; }
          row.state = 'ok'; row.exists = true; row.installed = true; row.stateText = result.changed ? `已安装 · ${result.installFile}` : '已经是最新版本';
          row.root = result.installFile; row.result = result; done += 1; paint(); continue;
        }
        const result = await window.coldbrew.beginner('install', { seat: row.seat, confirm: true });
        if (result.ok !== true || result.verified !== true) throw new Error('安装后的文件校验未通过。' + (result.message || '请查看技能检查结果。'));
        row.state = 'ok';
        const hook = result.toolbox === 'ida' ? ' · 工具箱已接入' : result.toolbox === 'manual' ? ' · 这个软件要手填工具箱地址' : '';
        const upstream = result.upstream;
        const skills = upstream ? ` · 附带 ${upstream.skillCount} 项完整技能` : '';
        row.stateText = (result.changed ? `写好了 · ${result.changed} 个文件` : '本来就是最新，没有重复写') + hook + skills;
        row.result = result;
        if (upstream) window.dispatchEvent(new CustomEvent('coldcoffee:upstream-install', { detail: { seat: row.seat, upstream } }));
        done += 1;
      } catch (error) {
        row.state = 'bad';
        row.stateText = error.message;
      }
    }
    busy = false;
    setStep(3);
    status.textContent = done ? `${done} 项写好了。重启目标软件；Agent 技能按客户端刷新方式加载。` : '一个都没写成，看红字。';
    finale.hidden = !done;
    paint();
  }

  stage.addEventListener('pointermove', (event) => {
    const rect = stage.getBoundingClientRect();
    stage.style.setProperty('--mx', ((event.clientX - rect.left) / rect.width * 100).toFixed(1) + '%');
    stage.style.setProperty('--my', ((event.clientY - rect.top) / rect.height * 100).toFixed(1) + '%');
  });
  async function uninstall() {
    const picked = rows.filter((row) => row.picked && row.ok);
    if (!picked.length || busy) return;
    if (!desktop) {
      status.textContent = '预览不会删文件。从桌面「冷咖啡破甲工作台」打开后再卸。';
      toast('先用桌面版');
      return;
    }
    const names = picked.map((row) => row.name).join('、');
    const yes = await ask('卸掉勾上的软件', `会把 ${names} 里写入的破甲按备份撤回。你后来自己改过的同一份文件会停住，不会盖掉。`);
    if (!yes) {
      status.textContent = '没卸。';
      return;
    }
    busy = true;
    finale.hidden = true;
    paint();
    let done = 0;
    for (const row of picked) {
      row.state = 'run';
      row.stateText = '正在撤回…';
      status.textContent = `正在撤回 ${row.name}`;
      paint();
      try {
        if (row.kind === 'local-skill') {
          const result = await restoreSkill(row);
          if (!result) { row.state = ''; row.stateText = '已取消'; paint(); continue; }
          row.state = 'ok'; row.exists = false; row.installed = false; row.stateText = '已恢复写入前状态'; row.result = null; done += 1; paint(); continue;
        }
        const result = await window.coldbrew.beginner('uninstall', { seat: row.seat, confirm: true });
        row.state = result.ok ? 'ok' : 'bad';
        row.stateText = result.message;
        if (result.ok) {
          done += 1;
          row.result = null;
          window.dispatchEvent(new CustomEvent('coldcoffee:upstream-invalidate', { detail: { seat: row.seat, message: result.message } }));
        }
      } catch (error) {
        row.state = 'bad';
        row.stateText = error.message;
      }
    }
    busy = false;
    status.textContent = done ? `${done} 个已撤回。重新打开软件就回到原来。` : '没有卸成，看红字。';
    paint();
  }

  function ask(title, text) {
    const dialog = $('pack-confirm');
    const ok = $('pack-confirm-ok');
    if (!dialog || !dialog.showModal || !ok) return Promise.resolve(false);
    const previous = ok.textContent;
    $('pack-confirm-title').textContent = title;
    $('pack-confirm-body').textContent = text;
    ok.textContent = '确认卸载';
    return new Promise((resolve) => {
      let yes = false;
      const finish = () => {
        ok.textContent = previous;
        resolve(yes);
      };
      ok.onclick = () => { yes = true; dialog.close(); };
      $('pack-cancel').onclick = () => dialog.close();
      dialog.addEventListener('close', finish, { once: true });
      dialog.showModal();
    });
  }

  go.addEventListener('click', install);
  $('newbie-undo').addEventListener('click', uninstall);
  $('newbie-found').addEventListener('click', () => {
    rows.forEach((row) => { row.picked = !!(row.ok && row.exists); });
    if (!rows.some((row) => row.picked)) toast('还没发现现成目录');
    paint();
  });
  $('newbie-all').addEventListener('click', () => {
    rows.forEach((row) => { if (row.ok) row.picked = true; });
    paint();
  });
  $('newbie-step-1').addEventListener('click', () => { setStep(1); board.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
  $('newbie-step-2').addEventListener('click', install);
  $('newbie-step-3').addEventListener('click', () => { finale.hidden = false; setStep(3); copyWord(); });
  $('newbie-advanced-jump').addEventListener('click', () => {
    const fold = $('advanced-fold');
    fold.open = true;
    fold.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('newbie-copy').addEventListener('click', copyWord);
  const openRelay = () => { if (typeof page === 'function') page('relay'); };
  $('newbie-relay').addEventListener('click', openRelay);
  $('newbie-finale-relay').addEventListener('click', openRelay);
  $('newbie-groups').addEventListener('click', () => { if (typeof page === 'function') page('community'); });
  $('newbie-open-site').addEventListener('click', async () => {
    const url = 'https://coldcoffeeai.com/';
    if (window.coldbrew?.openExternal) {
      try { await window.coldbrew.openExternal(url); return; } catch (error) { toast(error.message); return; }
    }
    openRelay();
  });
  stage.querySelectorAll('[data-qq]').forEach((button) => {
    button.addEventListener('click', () => {
      if (typeof copy === 'function') copy(button.dataset.qq);
      else toast(button.dataset.qq);
    });
  });

  async function copyWord() {
    try { await navigator.clipboard.writeText('冷咖啡'); toast('已复制：冷咖啡'); }
    catch { toast('复制失败，手打这两个字后面的：冷咖啡'); }
  }

  load();
})();
