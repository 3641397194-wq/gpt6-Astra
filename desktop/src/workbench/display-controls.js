'use strict';
(() => {
  const api = window.coldbrew;
  if (!api?.view) return;
  const controls = document.createElement('div');
  controls.className = 'display-controls';
  controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', '界面缩放');
  controls.innerHTML = '<button id="view-smaller" type="button" aria-label="缩小界面" title="缩小 · Ctrl + −">−</button><button id="view-reset" type="button" aria-label="恢复默认大小" title="恢复默认大小 · Ctrl + 0">100%</button><button id="view-larger" type="button" aria-label="放大界面" title="放大 · Ctrl + ＋">＋</button>';
  document.querySelector('.window-actions').before(controls);
  const maximize = document.getElementById('maximize');
  function render(state) {
    document.getElementById('view-reset').textContent = `${state.percent}%`;
    document.getElementById('view-smaller').disabled = state.min;
    document.getElementById('view-larger').disabled = state.max;
    maximize.textContent = state.maximized ? '❐' : '□';
    maximize.setAttribute('aria-label', state.maximized ? '还原窗口' : '最大化');
    maximize.title = state.maximized ? '还原窗口' : '最大化';
  }
  let pending = false;
  async function change(action) {
    if (pending) return;
    pending = true;
    try { render(await api.view(action)); }
    catch (error) { console.error('Display preference:', error.message); }
    finally { pending = false; }
  }
  for (const [id, action] of [['view-smaller', 'out'], ['view-reset', 'reset'], ['view-larger', 'in']]) document.getElementById(id).onclick = () => change(action);
  const unsubscribe = api.onView(render);
  let wheelTime = 0;
  document.addEventListener('wheel', event => {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    if (Math.abs(event.deltaY) < 1 || Date.now() - wheelTime < 130) return;
    wheelTime = Date.now(); change(event.deltaY < 0 ? 'in' : 'out');
  }, { passive: false });
  window.addEventListener('beforeunload', unsubscribe, { once: true });
  change('status');
})();
