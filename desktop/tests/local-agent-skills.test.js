'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { LOCAL_AGENT_PROFILES } = require('../src/shared/workbench-core');
const localSkills = require('../src/lib/local-agent-skills');
// macOS aliases /var to /private/var; fixtures must use a canonical root.
const tempRoot = fs.realpathSync.native(os.tmpdir());

function fixture(t) {
  const base = fs.mkdtempSync(path.join(tempRoot, 'coldcoffee-local-skills-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
  return path.join(base, 'agent-skills');
}

test('four local Agent profiles stay independent from relay models and expose truthful target rules', () => {
  assert.deepEqual(LOCAL_AGENT_PROFILES.map(item => item.id), ['grok-bot', 'claude-duet', 'chatgpt-dot', 'meta-muse']);
  const home = path.join(tempRoot, 'coldcoffee-fixture-home');
  assert.equal(localSkills.suggestedSkillsRoot('grok-bot', { home, env: {} }), path.join(home, '.grok', 'skills'));
  assert.equal(localSkills.suggestedSkillsRoot('claude-duet', { home, env: {} }), path.join(home, '.claude', 'skills'));
  assert.equal(localSkills.suggestedSkillsRoot('chatgpt-dot', { home, env: {} }), path.join(home, '.codex', 'skills'));
  assert.equal(localSkills.suggestedSkillsRoot('meta-muse', { home, env: {} }), '');
  assert.throws(() => localSkills.preview('meta-muse'), /先选择本地 Skills 目录/);
});

test('one-click card discovery checks default skill files without creating Agent directories', (t) => {
  const base = fs.mkdtempSync(path.join(tempRoot, 'coldcoffee-local-skill-scan-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
  const env = {
    GROK_HOME: path.join(base, 'grok-home'),
    CLAUDE_CONFIG_DIR: path.join(base, 'claude-home'),
    CODEX_HOME: path.join(base, 'codex-home'),
  };
  const rows = localSkills.list({ home: base, env });
  assert.deepEqual(rows.map((item) => item.id), ['grok-bot', 'claude-duet', 'chatgpt-dot', 'meta-muse']);
  assert.ok(rows.slice(0, 3).every((item) => item.exists === false && item.installed === false && item.installFile.endsWith('SKILL.md')));
  assert.equal(rows[3].manualRoot, true);
  assert.equal(rows[3].installFile, '');
  assert.equal(fs.existsSync(env.GROK_HOME), false);
  assert.equal(fs.existsSync(env.CLAUDE_CONFIG_DIR), false);
  assert.equal(fs.existsSync(env.CODEX_HOME), false);
});

test('preview is read-only; install is backed up, hash-verified, and restorable', (t) => {
  const skillsRoot = fixture(t);
  localSkills.select('claude-duet', skillsRoot);
  const plan = localSkills.preview('claude-duet');
  assert.equal(plan.changes, 1);
  assert.equal(fs.existsSync(plan.installFile), false);
  assert.match(plan.pack, /输入“冷咖啡”/);
  const deployed = localSkills.deploy('claude-duet', plan.id);
  assert.equal(deployed.changed, 1);
  assert.equal(fs.readFileSync(plan.installFile, 'utf8'), plan.pack);
  assert.equal(localSkills.verify('claude-duet').ok, true);
  const isolatedList = { home: path.join(path.dirname(skillsRoot), 'unused-home'), env: {} };
  assert.equal(localSkills.list(isolatedList).find((item) => item.id === 'claude-duet').installed, true);
  assert.equal(localSkills.history('claude-duet')[0].status, 'applied');
  const restored = localSkills.restore('claude-duet', localSkills.history('claude-duet')[0].id);
  assert.equal(restored.restored, 1);
  assert.equal(fs.existsSync(plan.installFile), false);
  assert.equal(localSkills.list(isolatedList).find((item) => item.id === 'claude-duet').exists, false);
});

test('restore stops on a user-edited skill file and leaves the changed content intact', (t) => {
  const skillsRoot = fixture(t);
  localSkills.select('grok-bot', skillsRoot);
  const plan = localSkills.preview('grok-bot');
  localSkills.deploy('grok-bot', plan.id);
  fs.appendFileSync(plan.installFile, '\nuser edit\n');
  const entry = localSkills.history('grok-bot')[0];
  assert.throws(() => localSkills.restore('grok-bot', entry.id), /文件已被其他操作修改/);
  assert.match(fs.readFileSync(plan.installFile, 'utf8'), /user edit/);
});
