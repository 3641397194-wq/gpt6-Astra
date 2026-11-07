'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ZOOM_STEPS = Object.freeze([0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]);
function readZoom(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8')).zoom;
    return ZOOM_STEPS.includes(value) ? value : 1;
  } catch { return 1; }
}

// One native zoom owner avoids Chromium shortcuts, wheel events and toolbar
// buttons each applying a different scale to the same document.
function attachWindowView(window, file) {
  let zoom = readZoom(file);
  const contents = window.webContents;
  const status = () => ({ zoom, percent: Math.round(zoom * 100), maximized: window.isMaximized(), min: zoom === ZOOM_STEPS[0], max: zoom === ZOOM_STEPS.at(-1) });
  const emit = () => { if (!window.isDestroyed() && !contents.isDestroyed()) contents.send('window:view-changed', status()); };
  function execute(action = 'status') {
    if (action === 'status') return status();
    const index = ZOOM_STEPS.indexOf(zoom);
    const next = action === 'in' ? ZOOM_STEPS[Math.min(index + 1, ZOOM_STEPS.length - 1)]
      : action === 'out' ? ZOOM_STEPS[Math.max(index - 1, 0)] : action === 'reset' ? 1 : null;
    if (next === null) throw new Error('未知显示操作');
    if (next !== zoom) {
      zoom = next; contents.setZoomFactor(zoom);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file + '.tmp', JSON.stringify({ zoom }), { mode: 0o600 });
      fs.renameSync(file + '.tmp', file);
    }
    emit(); return status();
  }
  contents.on('did-finish-load', () => {
    contents.setZoomFactor(zoom);
    contents.setVisualZoomLevelLimits(1, 1).catch(() => {});
    emit();
  });
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !(input.control || input.meta) || input.alt) return;
    const action = ['+', '=', 'Add'].includes(input.key) ? 'in' : ['-', '_', 'Subtract'].includes(input.key) ? 'out' : input.key === '0' ? 'reset' : '';
    if (action) { event.preventDefault(); execute(action); }
  });
  window.on('maximize', emit); window.on('unmaximize', emit);
  return { execute, status };
}
module.exports = { attachWindowView, readZoom, ZOOM_STEPS };
