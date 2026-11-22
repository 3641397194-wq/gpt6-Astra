'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

test('public pages and the software hero distinguish source install entries from model count', () => {
  for (const relative of ['README.md', 'docs/index.html', 'docs/readme-preview.html', 'desktop/src/workbench/index.html']) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    assert.match(source, /16 个(?:一键)?安装入口/, `${relative}: missing source install entry count`);
    assert.doesNotMatch(source, /十五个 AI 模型|16 个 AI 模型|11 个模型席位.*4 个本地 Agent 工作流/, `${relative}: stale or misleading model count`);
  }
  const visual = fs.readFileSync(path.join(root, 'desktop/src/workbench/visual-gateway.js'), 'utf8');
  assert.match(visual, /原 15 个入口，并新增 OpenCode 客户端/);
  assert.doesNotMatch(
    fs.readFileSync(path.join(root, 'desktop/src/workbench/index.html'), 'utf8'),
    /九模型席位/,
    'software hero still contains the stale nine-seat label',
  );
});
