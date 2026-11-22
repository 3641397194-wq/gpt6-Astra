'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const local = require('../src/lib/local-agent-skills');
const core = require('../src/shared/workbench-core');

test('OpenCode appears among the original install cards with local workflow deploy and restore', t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'coldcoffee-opencode-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home'), env = { XDG_CONFIG_HOME: path.join(root, 'config') };
  const row = local.list({ env, home }).find(item => item.id === 'opencode');
  assert.equal(row.name, 'OpenCode');
  assert.equal(row.seat, 'opencode');
  const skillsRoot = path.join(env.XDG_CONFIG_HOME, 'opencode', 'skills');
  assert.equal(row.skillsRoot, skillsRoot);
  local.select('opencode', skillsRoot);
  const plan = local.preview('opencode');
  const file = path.join(skillsRoot, 'coldcoffee-opencode', 'SKILL.md');
  assert.equal(plan.installFile, file);
  assert.equal(fs.existsSync(file), false);
  const result = local.deploy('opencode', plan.id);
  assert.equal(result.ok, true);
  const body = fs.readFileSync(file, 'utf8');
  assert.match(body, /冷咖啡已激活/);
  assert.match(body, /1057540028/);
  assert.match(body, /t\.me\/coolcoffeeai/);
  assert.equal(local.verify('opencode').ok, true);
  local.restore('opencode', result.id);
  assert.equal(fs.existsSync(file), false);
  local.deploy('opencode', local.preview('opencode').id);
  const repeated = local.deploy('opencode', local.preview('opencode').id);
  assert.equal(repeated.changed, 0);
  assert.ok(repeated.id, 'no-op repeat retains a transaction for restoration');
});

test('OpenCode honors its own custom configuration directory', t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'coldcoffee-opencode-home-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const custom = path.join(root, 'custom');
  const row = local.list({ home: root, env: { OPENCODE_CONFIG_DIR: custom } }).find(item => item.id === 'opencode');
  assert.equal(row.skillsRoot, path.join(custom, 'skills'));
  assert.equal(local.suggestedSkillsRoot('opencode', { home: root, env: { OPENCODE_CONFIG_DIR: 'relative', XDG_CONFIG_HOME: 'also-relative' } }), path.join(root, '.config', 'opencode', 'skills'));
  assert.equal(core.LOCAL_AGENT_PROFILES.filter(item => item.id === 'opencode').length, 1);
  assert.equal(local.list({ home: root, env: { OPENCODE_CONFIG_DIR: custom } }).length, core.LOCAL_AGENT_PROFILES.length);
});

test('OpenCode keeps the selected skills directory and restores an existing file byte for byte', t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'coldcoffee-opencode-backup-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const selected = path.join(root, 'selected', 'skills');
  const original = Buffer.from('customer original\r\n', 'utf8');
  local.select('opencode', selected, { explicit: true });
  const file = local.preview('opencode').installFile;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, original);
  const plan = local.preview('opencode');
  const row = local.list({ home: path.join(root, 'ignored'), env: { OPENCODE_CONFIG_DIR: path.join(root, 'ignored-config') } })
    .find(item => item.id === 'opencode');
  assert.equal(row.skillsRoot, selected);
  assert.equal(row.exists, true);
  assert.equal(row.installed, false);
  const installed = local.deploy('opencode', plan.id);
  assert.equal(installed.changed, 1);
  assert.notEqual(fs.readFileSync(file, 'utf8'), original.toString('utf8'));
  const latest = local.history('opencode').find(item => item.status === 'applied');
  local.restore('opencode', latest.id);
  assert.deepEqual(fs.readFileSync(file), original);
  fs.writeFileSync(file, original);
  local.select('opencode', selected, { explicit: true });
  local.deploy('opencode', local.preview('opencode').id);
  const noChange = local.deploy('opencode', local.preview('opencode').id);
  assert.equal(noChange.changed, 0);
  assert.ok(noChange.id, 'a no-op install retains the transaction needed for undo');
  local.restore('opencode', noChange.id);
  assert.deepEqual(fs.readFileSync(file), original);
});
