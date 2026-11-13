'use strict';
// Original Ragdoll courier. Movement follows projected real attempts;
// completed history only moves when the user explicitly requests a replay.
window.ColdCoffeeCourier = Object.freeze({ create({ $, page }) {
  const flow = $('vg-flow'), label = $('vg-courier-status'), toggle = $('vg-courier-toggle'), replayButton = $('vg-courier-replay');
  const svgNS = 'http://www.w3.org/2000/svg';
  const layer = document.createElement('div'); layer.className = 'vg-courier-layer'; layer.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS(svgNS, 'svg'); svg.classList.add('vg-courier-trail');
  const path = document.createElementNS(svgNS, 'path'); path.setAttribute('fill', 'none'); svg.append(path);
  const actor = document.createElement('div'); actor.className = 'vg-courier';
  const sprite = document.createElement('div'); sprite.className = 'vg-courier-sprite'; actor.append(sprite); layer.append(svg, actor); flow.append(layer);
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let enabled = true; try { enabled = (localStorage.getItem('coldcoffee.courierMotion.v1') ?? localStorage.getItem('coldcoffee.collieMotion.v1')) !== 'off'; } catch {}
  let route = null, evidence = window.ColdCoffeeRouting.courier(null), replay = null, frame = 0, layoutFrame = 0, length = 0, travelMs = 3800, disposed = false;
  let amount = 0, direction = 1, lastTick = 0, restUntil = 0, settling = false, point = null, retarget = null, pathSignature = '', samples = [];
  const turnPauseMs = 150;
  actor.style.opacity = '1';
  const visible = () => !document.hidden && page.classList.contains('active') && flow.clientWidth > 0;
  const animated = () => enabled && !motion.matches;
  const walking = () => animated() && (evidence.phase === 'running' || !!replay || settling);
  function targetNode(target) {
    if (!target) return null;
    const seat = [...flow.querySelectorAll('.vg-seat')].find(node => node.dataset.seat === target.id && (!target.model || node.dataset.model === target.model));
    return seat?.closest('.vg-branch')?.querySelector('.vg-branch-title') || null;
  }
  function view() {
    if (replay) return { phase: 'replay', target: route.tries[replay.index], label: `记录回放 · 往返巡线 · 第 ${replay.index + 1} / ${route.tries.length} 次实际尝试` };
    return evidence;
  }
  function status() {
    const state = view();
    flow.dataset.courier = state.phase; flow.dataset.courierRoute = route ? String(route.id) : '';
    actor.dataset.phase = state.phase; actor.dataset.seat = state.target?.id || '';
    actor.dataset.moving = String(walking());
    const caption = (settling && state.phase === 'failed' ? '请求异常 · 布偶猫回程中' : state.label + (settling ? ' · 布偶猫完成往返中' : '')) + (!enabled ? ' · 动效已暂停' : motion.matches ? ' · 系统静态显示' : '');
    if (label.textContent !== caption) label.textContent = caption;
    toggle.textContent = enabled ? '布偶猫动效 · 开' : '布偶猫动效 · 关'; toggle.setAttribute('aria-pressed', String(enabled));
    replayButton.disabled = !route?.done || !route?.tries?.length || !animated();
    replayButton.textContent = replay ? '停止记录回放' : '回放所选路径';
  }
  function measure() {
    layoutFrame = 0; if (disposed || !visible()) { layer.hidden = true; return; }
    layer.hidden = false;
    const bounds = flow.getBoundingClientRect(), sx = bounds.width / flow.clientWidth || 1, sy = bounds.height / flow.clientHeight || 1;
    const hub = $('vg-hub-node').querySelector('.vg-node-icon').getBoundingClientRect();
    const origins = flow.querySelector('.vg-origins').getBoundingClientRect(), branches = $('vg-branches');
    const state = view(), node = targetNode(state.target), end = node?.getBoundingClientRect();
    let rootBranch = node;
    while (rootBranch && rootBranch.parentElement !== branches) rootBranch = rootBranch.parentElement;
    const boundary = rootBranch?.getBoundingClientRect();
    const stacked = getComputedStyle(flow).gridTemplateColumns.split(' ').length === 1;
    const clearance = actor.offsetWidth / 2 + 16;
    const start = stacked ? { x: (hub.left + hub.width / 2 - bounds.left) / sx, y: (origins.bottom - bounds.top) / sy + 42 } : { x: (hub.right - bounds.left) / sx + clearance, y: (hub.top + hub.height / 2 - bounds.top) / sy + 9 };
    const finish = end ? { x: (boundary.left - bounds.left) / sx - clearance, y: (end.top + end.height / 2 - bounds.top) / sy + 9 } : { x: start.x + 1, y: start.y };
    svg.setAttribute('viewBox', `0 0 ${flow.clientWidth} ${flow.clientHeight}`);
    const bend = Math.max(30, Math.abs(finish.x - start.x) * .45);
    const geometry = stacked ? `M ${start.x} ${start.y} C ${start.x} ${start.y + 70}, ${finish.x - 16} ${finish.y - 70}, ${finish.x} ${finish.y}` : `M ${start.x} ${start.y} C ${start.x + bend} ${start.y}, ${finish.x - bend} ${finish.y}, ${finish.x} ${finish.y}`;
    if (geometry !== pathSignature) {
      pathSignature = geometry; path.setAttribute('d', geometry);
      length = path.getTotalLength();
      // SVG geometry is measured only on a layout/path change, not 3 times per
      // animation frame. Interpolation keeps the travel speed uniform on curves.
      const count = Math.max(24, Math.ceil(length / 5));
      samples = Array.from({ length: count + 1 }, (_, i) => { const p = path.getPointAtLength(length * i / count); return { x: p.x, y: p.y }; });
      if (point && animated()) {
        const next = sample(amount);
        retarget = { from: point, started: performance.now(), duration: Math.min(1400, Math.max(500, Math.hypot(point.x - next.x, point.y - next.y) * 4)) };
      }
    }
    path.dataset.phase = state.phase; path.style.opacity = node ? '1' : '0';
    travelMs = Math.max(3800, length * 16);
    flow.dataset.courierDistance = String(Math.round(length)); actor.dataset.travelMs = String(Math.round(travelMs));
    position(performance.now()); ensureFrame();
  }
  function schedule() { if (!disposed && !layoutFrame) layoutFrame = requestAnimationFrame(measure); }
  function sample(progress) {
    if (!samples.length) return { x: 0, y: 0 };
    const value = Math.min(1, Math.max(0, progress)) * (samples.length - 1), index = Math.floor(value), t = value - index;
    const a = samples[index], b = samples[Math.min(index + 1, samples.length - 1)];
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  function position(now) {
    if (!length) return;
    const p = sample(amount), before = sample(amount - .005), after = sample(amount + .005);
    let x = p.x, y = p.y;
    if (retarget && animated()) {
      const t = Math.min(1, Math.max(0, (now - retarget.started) / retarget.duration)), eased = t * t * (3 - 2 * t);
      x = retarget.from.x + (x - retarget.from.x) * eased; y = retarget.from.y + (y - retarget.from.y) * eased;
      if (t === 1) retarget = null;
    } else retarget = null;
    point = { x, y }; actor.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -85%)`;
    actor.dataset.x = String(x); actor.dataset.y = String(y);
    const backwards = (after.x - before.x) * direction < 0;
    sprite.style.transform = backwards ? 'scaleX(-1)' : '';
    actor.dataset.direction = direction < 0 ? 'backward' : 'forward';
    actor.dataset.progress = String(amount); actor.dataset.moving = String(walking() && now >= restUntil);
  }
  function tick(now) {
    frame = 0; if (disposed || !visible() || !animated()) { lastTick = 0; return; }
    const elapsed = lastTick ? Math.min(80, Math.max(0, now - lastTick)) : 0; lastTick = now;
    if (walking() && now >= restUntil) {
      amount = Math.min(1, Math.max(0, amount + direction * elapsed / travelMs));
      if (amount === 1 && direction > 0) { direction = -1; restUntil = now + turnPauseMs; }
      else if (amount === 0 && direction < 0) {
        direction = 1; restUntil = now + turnPauseMs;
        // Route changes happen at the shared gateway, never by teleporting the cat.
        if (replay) { replay.index = (replay.index + 1) % route.tries.length; status(); measure(); }
        else if (settling) { settling = false; status(); }
      }
    }
    position(now); ensureFrame();
  }
  function ensureFrame() {
    if (!frame && visible() && animated() && (walking() || retarget)) frame = requestAnimationFrame(tick);
  }
  function render(next) {
    const nextEvidence = window.ColdCoffeeRouting.courier(next);
    if (next?.id !== route?.id) {
      // Following a new streaming request must not send the courier back to x=0.
      // Keep the current leg and turn naturally; geometry changes ease in place.
      replay = null; settling = false;
      if (!next || !route) { amount = 0; direction = 1; lastTick = 0; restUntil = 0; }
    } else if (!next?.done) { replay = null; settling = false; }
    else if (!route?.done && nextEvidence.target) settling = animated();
    route = next; evidence = nextEvidence;
    status(); schedule();
  }
  toggle.onclick = () => {
    enabled = !enabled; replay = null; lastTick = 0;
    try { localStorage.setItem('coldcoffee.courierMotion.v1', enabled ? 'on' : 'off'); } catch {}
    status(); schedule();
  };
  replayButton.onclick = () => {
    if (!route?.done || !route.tries?.length || !animated()) return;
    replay = replay ? null : { index: 0 }; settling = false; lastTick = 0; restUntil = 0; status(); schedule();
  };
  const visibility = () => { if (frame) { cancelAnimationFrame(frame); frame = 0; } lastTick = 0; status(); schedule(); };
  const resize = new ResizeObserver(schedule); resize.observe(flow); resize.observe($('vg-branches'));
  const pageObserver = new MutationObserver(visibility); pageObserver.observe(page, { attributes: true, attributeFilter: ['class'] });
  flow.addEventListener('toggle', schedule, true); document.addEventListener('visibilitychange', visibility); motion.addEventListener('change', visibility);
  const destroy = () => { disposed = true; cancelAnimationFrame(frame); cancelAnimationFrame(layoutFrame); resize.disconnect(); pageObserver.disconnect(); document.removeEventListener('visibilitychange', visibility); motion.removeEventListener('change', visibility); flow.removeEventListener('toggle', schedule, true); };
  window.addEventListener('beforeunload', destroy, { once: true }); render(null);
  return { render, destroy };
} });
