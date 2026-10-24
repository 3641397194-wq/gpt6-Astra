'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SeatTransactions } = require('./seat-transactions');
const { LOCAL_AGENT_PROFILES } = require('../shared/workbench-core');

const profileById = (id) => {
  const profile = LOCAL_AGENT_PROFILES.find((item) => item.id === id);
  if (!profile) throw new Error('未知本地 Agent 技能包');
  return profile;
};

const states = new Map();

function suggestedSkillsRoot(id, { env = process.env, home = os.homedir() } = {}) {
  const profile = profileById(id);
  if (profile.manualRoot) return '';
  const custom = profile.seat === 'codex' ? env.CODEX_HOME || env.CODEX_DIR
    : profile.seat === 'claude' ? env.CLAUDE_CONFIG_DIR || env.CLAUDE_HOME
      : env.GROK_HOME || env.GROK_DIR;
  const configRoot = custom && path.isAbsolute(String(custom).trim())
    ? path.resolve(String(custom).trim())
    : path.join(home, profile.root.split('/')[0]);
  return path.join(configRoot, 'skills');
}

function createState(id, skillsRoot) {
  const profile = profileById(id);
  if (typeof skillsRoot !== 'string' || !path.isAbsolute(skillsRoot)) throw new Error('请选择 Agent 实际加载的绝对 Skills 目录');
  const root = path.join(path.resolve(skillsRoot), profile.skill);
  const body = fs.readFileSync(path.join(__dirname, 'packs', 'local-agent-skills', `${id}.md`), 'utf8');
  const tx = new SeatTransactions({
    plan: (_seat, overrideHome) => ({
      home: overrideHome,
      pack: body,
      writes: [{ kind: 'skill', file: path.join(overrideHome, 'SKILL.md'), body }],
    }),
  });
  tx.select(root);
  const state = { tx, root, skillsRoot: path.resolve(skillsRoot), seat: profile.seat };
  states.set(id, state);
  return state;
}

function stateFor(id) {
  const state = states.get(id);
  if (!state) throw new Error('先选择本地 Skills 目录并生成预览');
  return state;
}

function list({ env, home } = {}) {
  return LOCAL_AGENT_PROFILES.map((profile) => {
    const active = states.get(profile.id);
    const root = active?.skillsRoot || suggestedSkillsRoot(profile.id, { env, home });
    if (!root) return { ...profile, suggestedSkillsRoot: '', skillsRoot: '', installFile: '', exists: false, installed: false };
    try {
      const state = active || createState(profile.id, root);
      const verification = state.tx.verify(state.seat);
      return {
        ...profile,
        suggestedSkillsRoot: suggestedSkillsRoot(profile.id, { env, home }),
        skillsRoot: state.skillsRoot,
        installFile: path.join(state.root, 'SKILL.md'),
        exists: verification.checks.some((item) => item.exists),
        installed: verification.ok,
      };
    } catch (error) {
      return { ...profile, suggestedSkillsRoot: suggestedSkillsRoot(profile.id, { env, home }), skillsRoot: root, installFile: path.join(root, profile.skill, 'SKILL.md'), exists: false, installed: false, error: error.message };
    }
  });
}

function select(id, skillsRoot) {
  const profile = profileById(id);
  const state = createState(id, skillsRoot);
  return { ok: true, id, root: state.skillsRoot, installFile: path.join(state.root, 'SKILL.md'), agent: profile.agent };
}

function preview(id) {
  const profile = profileById(id);
  const state = stateFor(id);
  const plan = state.tx.preview(state.seat);
  return { ...plan, profileId: id, profile: profile.name, agent: profile.agent, skillsRoot: state.skillsRoot, installFile: path.join(state.root, 'SKILL.md') };
}

function deploy(id, transactionId) {
  const profile = profileById(id);
  const state = stateFor(id);
  const result = state.tx.deploy(transactionId);
  return { ...result, profileId: id, profile: profile.name, agent: profile.agent, installFile: path.join(state.root, 'SKILL.md') };
}

function installInfo(id, transactionId) {
  const profile = profileById(id);
  const state = stateFor(id);
  state.tx.getPlan(transactionId);
  return { profile: profile.name, agent: profile.agent, installFile: path.join(state.root, 'SKILL.md') };
}

function verify(id) {
  const profile = profileById(id);
  const state = stateFor(id);
  return { ...state.tx.verify(state.seat), profileId: id, profile: profile.name, agent: profile.agent, installFile: path.join(state.root, 'SKILL.md') };
}

function history(id) {
  return stateFor(id).tx.history();
}

function restore(id, transactionId) {
  return stateFor(id).tx.restore(transactionId);
}

module.exports = { list, select, preview, deploy, installInfo, verify, history, restore, suggestedSkillsRoot };
