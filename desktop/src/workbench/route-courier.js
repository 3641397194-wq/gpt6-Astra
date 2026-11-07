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
  let route = null, evidence = window.ColdCoffeeRouting.courier(null), signature = '', started = performance.now(), replay = null, frame = 0, layoutFrame = 0, length = 0, travelMs = 3800, disposed = false;
  const restMs = 1000;
  const visible = () => !document.hidden && page.classList.contains('active') && flow.clientWidth > 0;
  const animated = () => enabled && !motion.matches;
  function targetNode(target) {
    if (!target) return null;
    const seat = [...flow.querySelectorAll('.vg-seat')].find(node => node.dataset.seat === target.id && (!target.model || node.dataset.model === target.model));
    return seat?.closest('.vg-branch')?.querySelector('.vg-branch-title') || null;
  }
  function view() {
    if (replay) return { phase: 'replay', target: route.tries[replay.index], label: `记录回放 · 第 ${replay.index + 1} / ${route.tries.length} 次实际尝试` };
    return evidence;
  }
  function status() {
    const state = view();
    flow.dataset.courier = state.phase; flow.dataset.courierRoute = route ? String(route.id) : '';
    actor.dataset.phase = state.phase; actor.dataset.seat = state.target?.id || '';
    actor.dataset.moving = String(animated() && ['running', 'replay'].includes(state.phase));
    label.textContent = state.label + (!enabled ? ' · 动效已暂停' : motion.matches ? ' · 系统静态显示' : '');
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
    path.setAttribute('d', stacked ? `M ${start.x} ${start.y} C ${start.x} ${start.y + 70}, ${finish.x - 16} ${finish.y - 70}, ${finish.x} ${finish.y}` : `M ${start.x} ${start.y} C ${start.x + bend} ${start.y}, ${finish.x - bend} ${finish.y}, ${finish.x} ${finish.y}`);
    path.dataset.phase = state.phase; path.style.opacity = node ? '1' : '0';
    length = path.getTotalLength();
    travelMs = Math.min(6400, Math.max(3800, length * 16));
    flow.dataset.courierDistance = String(Math.round(length)); actor.dataset.travelMs = String(Math.round(travelMs));
    position(progress(performance.now())); ensureFrame();
  }
  function schedule() { if (!disposed && !layoutFrame) layoutFrame = requestAnimationFrame(measure); }
  function progress(now) {
    if (!animated() || !['running', 'replay'].includes(view().phase)) return 1;
    return Math.min(1, ((now - (replay?.started || started)) % (travelMs + restMs)) / travelMs);
  }
  function position(amount) {
    if (!length) return;
    const distance = length * Math.min(1, Math.max(0, amount)), p = path.getPointAtLength(distance);
    const before = path.getPointAtLength(Math.max(0, distance - 2)), after = path.getPointAtLength(Math.min(length, distance + 2));
    actor.style.left = p.x + 'px'; actor.style.top = p.y + 'px';
    sprite.style.transform = after.x < before.x ? 'scaleX(-1)' : '';
    const movingPhase = ['running', 'replay'].includes(view().phase), elapsed = performance.now() - (replay?.started || started), cycle = elapsed % (travelMs + restMs);
    actor.dataset.moving = String(animated() && movingPhase && amount < 1);
    // A short rest and soft restart replace the old abrupt jump to the gateway.
    actor.style.opacity = animated() && movingPhase ? String(Math.min(1, cycle / 180, (travelMs + restMs - cycle) / 220)) : '1';
  }
  function tick(now) {
    frame = 0; if (disposed || !visible() || !animated()) return;
    if (replay && now - replay.started >= travelMs + restMs) {
      replay.index++; replay.started = now;
      if (replay.index >= route.tries.length) replay = null;
      status(); measure();
    }
    position(progress(now)); ensureFrame();
  }
  function ensureFrame() {
    if (!frame && visible() && animated() && ['running', 'replay'].includes(view().phase)) frame = requestAnimationFrame(tick);
  }
  function render(next) {
    const nextEvidence = window.ColdCoffeeRouting.courier(next);
    const nextSignature = JSON.stringify([next?.id, nextEvidence.phase, nextEvidence.target?.id, nextEvidence.target?.model, next?.tries?.length]);
    if (next?.id !== route?.id || !next?.done) replay = null;
    route = next; evidence = nextEvidence;
    if (signature !== nextSignature) { signature = nextSignature; started = performance.now(); }
    status(); schedule();
  }
  toggle.onclick = () => {
    enabled = !enabled; replay = null;
    try { localStorage.setItem('coldcoffee.courierMotion.v1', enabled ? 'on' : 'off'); } catch {}
    status(); schedule();
  };
  replayButton.onclick = () => {
    if (!route?.done || !route.tries?.length || !animated()) return;
    replay = replay ? null : { index: 0, started: performance.now() }; status(); schedule();
  };
  const visibility = () => { if (frame) { cancelAnimationFrame(frame); frame = 0; } status(); schedule(); };
  const resize = new ResizeObserver(schedule); resize.observe(flow); resize.observe($('vg-branches'));
  const pageObserver = new MutationObserver(visibility); pageObserver.observe(page, { attributes: true, attributeFilter: ['class'] });
  flow.addEventListener('toggle', schedule, true); document.addEventListener('visibilitychange', visibility); motion.addEventListener('change', visibility);
  const destroy = () => { disposed = true; cancelAnimationFrame(frame); cancelAnimationFrame(layoutFrame); resize.disconnect(); pageObserver.disconnect(); document.removeEventListener('visibilitychange', visibility); motion.removeEventListener('change', visibility); flow.removeEventListener('toggle', schedule, true); };
  window.addEventListener('beforeunload', destroy, { once: true }); render(null);
  return { render, destroy };
} });
