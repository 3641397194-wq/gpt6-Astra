'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

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
  let preferenceError = '';
  const contents = window.webContents;
  const status = () => ({ zoom, percent: Math.round(zoom * 100), maximized: window.isMaximized(), min: zoom === ZOOM_STEPS[0], max: zoom === ZOOM_STEPS.at(-1), preferenceSaved: !preferenceError, preferenceError });
  const emit = () => { if (!window.isDestroyed() && !contents.isDestroyed()) contents.send('window:view-changed', status()); };
  function persist() {
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(temporary, JSON.stringify({ zoom }), { mode: 0o600, flag: 'wx' });
      fs.renameSync(temporary, file);
      preferenceError = '';
    } catch {
      // Display changes should still work on a read-only/full disk. Keep the
      // warning explicit and retry on the next control action, even at a limit.
      // Never forward a filesystem error containing a personal profile path.
      preferenceError = '缩放已生效，本次设置尚未保存。请检查磁盘空间或写入权限，再点缩放按钮重试。';
    } finally {
      try { fs.unlinkSync(temporary); } catch { /* Absent, renamed or inaccessible. */ }
    }
  }
  function execute(action = 'status') {
    if (action === 'status') return status();
    const index = ZOOM_STEPS.indexOf(zoom);
    const next = action === 'in' ? ZOOM_STEPS[Math.min(index + 1, ZOOM_STEPS.length - 1)]
      : action === 'out' ? ZOOM_STEPS[Math.max(index - 1, 0)] : action === 'reset' ? 1 : null;
    if (next === null) throw new Error('未知显示操作');
    const changed = next !== zoom;
    if (changed) { contents.setZoomFactor(next); zoom = next; }
    if (changed || preferenceError) persist();
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
