'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
const read = file => fs.existsSync(file) ? fs.readFileSync(file) : null;
const digest = data => data === null ? null : hash(data);

function filesUnder(root, id) {
  const names = id === 'codex' ? ['config.toml'] : id === 'claude' ? ['settings.json'] : ['config.yaml', 'cordis.patch.yml', '.env', '.credentials.yaml'];
  if (id === 'deepseek' && fs.existsSync(path.join(root, 'profiles'))) {
    for (const dir of fs.readdirSync(path.join(root, 'profiles'), { withFileTypes: true })) {
      if (dir.isDirectory() && !dir.isSymbolicLink() && /^[\w.-]+$/.test(dir.name)) names.push(`profiles/${dir.name}/cordis.patch.yml`);
    }
  }
  return names;
}
function ensureFile(file) {
  if (fs.existsSync(file)) { const st = fs.lstatSync(file); if (!st.isFile() || st.isSymbolicLink() || st.size > 4 * 1024 * 1024) throw new Error('配置文件类型或大小有误，请检查目标软件配置'); }
}
class ClientConnector {
  constructor({ directory, engine, home = os.homedir(), env = process.env }) {
    this.directory = directory; this.engine = engine; this.plans = new Map();
    const scratch = path.join(engine.directory, 'engine-home');
    this.clients = [
      { id: 'codex', engineId: 'codex', name: 'Codex', root: env.CODEX_HOME || path.join(home, '.codex'), scratch: path.join(scratch, '.codex'), restart: '在 Codex 中新建会话；桌面端请重新打开。' },
      { id: 'claude', engineId: 'claude', name: 'Claude Code', root: env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'), scratch: path.join(scratch, '.claude'), restart: '重新打开 Claude Code，再新建会话。' },
      { id: 'deepseek', engineId: 'dsh', name: 'DeepSeek Harness', root: env.DSH_HOME || path.join(home, '.dsh'), scratch: path.join(scratch, '.dsh'), restart: '重新打开 Harness，在新会话中选择冷咖啡网关模型。' },
    ];
  }
  client(id) { const client = this.clients.find(c => c.id === id); if (!client) throw new Error('请先选择支持自动接入的软件'); return client; }
  list() { return this.clients.map(({ id, name, root, restart }) => {
    const latest = this.latest(id);
    return { id, name, detected: fs.existsSync(root), restart, connected: latest?.status === 'applied', model: latest?.status === 'applied' ? latest.model : '', needsReconnect: latest?.status === 'applied' && latest.port !== this.engine.port };
  }); }
  latest(id) {
    if (!fs.existsSync(this.directory)) return null;
    return fs.readdirSync(this.directory).filter(n => /^[a-f0-9-]{36}$/.test(n)).map(n => {
      try { return JSON.parse(fs.readFileSync(path.join(this.directory, n, 'manifest.json'), 'utf8')); } catch { return null; }
    }).filter(m => m?.client === id).sort((a, b) => b.time.localeCompare(a.time))[0] || null;
  }
  async plan(id, model) {
    const client = this.client(id);
    if (!/^[a-z][a-z0-9-]*\/.+/.test(model) || model.startsWith('local-demo/')) throw new Error('请选择已验证中转的真实模型');
    // Reuse the complete upstream native configuration adapter in its isolated
    // home. Only a reviewed, hash-checked transaction reaches the real client.
    const seeded = new Set([...filesUnder(client.scratch, id), ...filesUnder(client.root, id)]);
    for (const relative of seeded) {
      const original = path.join(client.root, relative), target = path.join(client.scratch, relative);
      ensureFile(original); ensureFile(target);
      const before = read(original);
      if (before) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, before, { mode: 0o600 }); }
      else if (fs.existsSync(target)) fs.unlinkSync(target);
    }
    fs.mkdirSync(client.scratch, { recursive: true });
    await this.engine.api('agents/rescan', {});
    await this.engine.api('set', { Agent: client.engineId, Field: 'model', Value: model });
    const names = new Set([...seeded, ...filesUnder(client.scratch, id)]);
    const writes = [];
    for (const relative of names) {
      const source = path.join(client.scratch, relative), file = path.join(client.root, relative);
      ensureFile(source); ensureFile(file);
      const before = read(file), after = read(source);
      if (after !== null && digest(before) !== digest(after)) writes.push({ relative, file, before, after });
    }
    if (!writes.length) return { unchanged: true, client: id, name: client.name, files: [], message: '当前配置已经接入这个模型' };
    const plan = { id: crypto.randomUUID(), client: id, model, time: Date.now(), writes, restart: client.restart };
    this.plans.clear(); this.plans.set(plan.id, plan);
    return { id: plan.id, client: id, name: client.name, model, files: writes.map(w => ({ name: w.relative, action: w.before === null ? '新建' : '备份并更新' })), restart: client.restart };
  }
  deploy(planId) {
    const plan = this.plans.get(planId);
    if (!plan || Date.now() - plan.time > 5 * 60 * 1000) throw new Error('接入预览已过期，请重新检查');
    for (const w of plan.writes) { ensureFile(w.file); if (digest(read(w.file)) !== digest(w.before)) throw new Error('目标软件刚刚更新了配置，请重新预览后连接'); }
    const folder = path.join(this.directory, plan.id); fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
    const manifest = { id: plan.id, client: plan.client, model: plan.model, port: this.engine.port, time: new Date().toISOString(), status: 'preparing', writes: [] };
    for (const [index, w] of plan.writes.entries()) {
      if (w.before !== null) fs.writeFileSync(path.join(folder, `${index}.backup`), w.before, { mode: 0o600 });
      manifest.writes.push({ relative: w.relative, file: w.file, before: digest(w.before), after: digest(w.after), backup: w.before === null ? null : `${index}.backup` });
    }
    const record = () => fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify(manifest), { mode: 0o600 }); record();
    let done = 0;
    try {
      for (const w of plan.writes) { fs.mkdirSync(path.dirname(w.file), { recursive: true }); fs.writeFileSync(w.file + '.coldcoffee-tmp', w.after, { mode: 0o600 }); fs.renameSync(w.file + '.coldcoffee-tmp', w.file); done++; }
      manifest.status = 'applied'; record(); this.plans.delete(plan.id);
      return { ok: true, client: plan.client, model: plan.model, files: plan.writes.map(w => w.relative), restart: plan.restart, backup: plan.id };
    } catch (error) {
      for (const w of plan.writes.slice(0, done)) { if (w.before === null) fs.unlinkSync(w.file); else fs.writeFileSync(w.file, w.before, { mode: 0o600 }); }
      manifest.status = 'rolled-back'; record(); throw error;
    }
  }
  restore(id) {
    const client = this.client(id); const manifest = this.latest(id);
    if (manifest?.status !== 'applied') throw new Error('这个软件尚无接入备份');
    const folder = path.join(this.directory, manifest.id);
    for (const w of manifest.writes) {
      const expected = path.resolve(client.root, w.relative);
      const root = path.resolve(client.root) + path.sep;
      if (!expected.startsWith(root) || path.resolve(w.file) !== expected || (w.backup !== null && !/^\d+\.backup$/.test(w.backup))) throw new Error('备份记录的目标路径有误');
      ensureFile(w.file); if (digest(read(w.file)) !== w.after) throw new Error('接入后配置又发生了变化，请先在目标软件中检查，备份已保留');
      if (w.backup !== null && digest(fs.readFileSync(path.join(folder, w.backup))) !== w.before) throw new Error('备份校验未通过');
    }
    for (const w of manifest.writes) {
      if (w.backup === null) fs.unlinkSync(w.file);
      else { const before = fs.readFileSync(path.join(folder, w.backup)); if (digest(before) !== w.before) throw new Error('备份校验未通过'); fs.writeFileSync(w.file, before, { mode: 0o600 }); }
    }
    manifest.status = 'restored'; fs.writeFileSync(path.join(folder, 'manifest.json'), JSON.stringify(manifest), { mode: 0o600 });
    return { ok: true, client: id };
  }
}
module.exports = { ClientConnector, filesUnder };
