'use strict';
// A selected-directory transaction, shared by beginner, advanced and CLI installs.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { TextDecoder } = require('node:util');
const runtime = require('./seat-runtime');
const hash = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const MAX_FILE = 64 * 1024 * 1024;

function guardPath(file) {
  // One native realpath check validates the whole existing ancestor chain.
  // Unlike a cached "safe directory" bit this still detects a junction swap
  // between sibling writes, without 10+ lstat calls for each 11k-file snapshot.
  const normalize = (value) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  for (let part = path.resolve(file); ; part = path.dirname(part)) {
    let stat;
    try { stat = fs.lstatSync(part); } catch (error) { if (error.code === 'ENOENT' && path.dirname(part) !== part) continue; throw error; }
    if (stat.isSymbolicLink()) throw new Error('目标路径包含符号链接或目录联接，请选择普通目录');
    if (stat.isFile() && stat.nlink > 1) throw new Error('目标文件包含硬链接，请先使用独立副本');
    if (normalize(fs.realpathSync.native(part)) !== normalize(part)) throw new Error('目标路径包含符号链接或目录联接，请选择普通目录');
    return;
  }
}

function within(root, relative) {
  const file = path.resolve(root, relative);
  const rel = path.relative(root, file);
  if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) throw new Error('目标超出已选目录');
  guardPath(file);
  return file;
}

function read(file, limit = MAX_FILE) {
  guardPath(file);
  if (!fs.existsSync(file)) return null;
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > limit) throw new Error(`目标不是普通文件或超过 ${Math.round(limit / 1024 / 1024)} MB`);
  return fs.readFileSync(file);
}

function decode(buffer) {
  if (!buffer) return '';
  new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  return buffer.toString('utf8');
}

function display(buffer) {
  if (!buffer) return '';
  try {
    const text = decode(buffer);
    if (text.includes('\0')) throw new Error('binary');
    return text.length > 500000 ? text.slice(0, 500000) + '\n（预览截断；实际写入和备份保留完整文件）' : text;
  } catch { return `（二进制资源 · ${buffer.length} 字节 · SHA-256 ${hash(buffer)}；按原始字节安装与恢复）`; }
}

function atomic(file, buffer, mode = 0o600) {
  if (!Number.isInteger(mode) || mode < 0 || mode > 0o777) throw new Error('文件权限模式无效');
  guardPath(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  guardPath(path.dirname(file));
  const temp = file + '.' + crypto.randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temp, buffer, { flag: 'wx', mode });
    // writeFile's mode is masked by the process umask on POSIX; preserve the
    // original permission bits exactly for both deployment and restoration.
    if (process.platform !== 'win32') fs.chmodSync(temp, mode);
    guardPath(file);
    fs.renameSync(temp, file);
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}

function marked(previous, pack, begin, end) {
  const n1 = previous.split(begin).length - 1;
  const n2 = previous.split(end).length - 1;
  if (!n1 && !n2) return previous + (previous && !previous.endsWith('\n') ? '\n' : '') + (previous ? '\n' : '') + pack;
  if (n1 !== 1 || n2 !== 1 || previous.indexOf(end) < previous.indexOf(begin)) throw new Error('检测到损坏或重复的席位标记，请先检查原文件');
  const stop = previous.indexOf(end) + end.length;
  const body = pack.slice(pack.indexOf(begin), pack.indexOf(end) + end.length);
  return previous.slice(0, previous.indexOf(begin)) + body + previous.slice(stop);
}

function nextText(item, previous, spec) {
  if (item.kind === 'skill') return item.body.endsWith('\n') ? item.body : item.body + '\n';
  if (item.kind === 'file') return item.body ?? spec.pack;
  if (item.kind === 'marked') return marked(previous, item.body ?? spec.pack, item.begin ?? spec.begin, item.end ?? spec.end);
  if (item.kind === 'upstream-mcp') return require('./upstream-config').patchMcp(previous, item);
  if (item.kind === 'ida-mcp') return require('./ida-mcp').patchSeatConnection(previous, item);
  if (item.kind === 'toml') {
    const line = `${item.key} = ${JSON.stringify(item.value)}`;
    const table = previous.search(/^\s*\[/m);
    const split = table < 0 ? previous.length : table;
    const head = previous.slice(0, split), tail = previous.slice(split);
    const pattern = new RegExp(`^[ \\t]*${item.key}[ \\t]*=.*$`, 'gm');
    const found = [...head.matchAll(pattern)];
    if (found.length > 1) throw new Error('配置包含重复顶层字段，请先整理');
    if (found.length) return head.replace(pattern, () => line) + tail;
    return head + (head && !head.endsWith('\n') ? '\n' : '') + line + '\n' + tail;
  }
  if (item.kind === 'settings') {
    const JSONC = require('jsonc-parser');
    const errors = [], clean = previous.replace(/^\uFEFF/, '');
    const tree = clean.trim() ? JSONC.parseTree(clean, errors, { allowTrailingComma: true }) : null;
    if (errors.length || (tree && tree.type !== 'object')) throw new Error('settings.json 顶层应为有效对象');
    const unique = (node) => {
      if (node?.type === 'object') {
        const keys = new Set();
        for (const entry of node.children || []) {
          const key = entry.children[0].value;
          if (keys.has(key)) throw new Error('settings.json 包含重复字段，请先整理');
          keys.add(key);
        }
      }
      for (const child of node?.children || []) unique(child);
    };
    unique(tree);
    const data = tree ? JSONC.getNodeValue(tree) : {};
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('settings.json 顶层应为对象');
    if (data.context != null && (typeof data.context !== 'object' || Array.isArray(data.context))) throw new Error('context 字段应为对象');
    const context = data.context || {};
    let names = context.fileName ?? context.filename ?? [];
    if (typeof names === 'string') names = [names];
    if (!Array.isArray(names) || names.some((n) => typeof n !== 'string')) throw new Error('context.fileName 格式错误');
    const fileNames = [...new Set([...names, item.name])];
    if (Array.isArray(context.fileName) && JSON.stringify(context.fileName) === JSON.stringify(fileNames)) return previous;
    const input = tree ? clean : '{}\n';
    const updated = JSONC.applyEdits(input, JSONC.modify(input, ['context', 'fileName'], fileNames,
      { formattingOptions: { insertSpaces: true, tabSize: 2, eol: previous.includes('\r\n') ? '\r\n' : '\n' } }));
    return (previous.startsWith('\uFEFF') ? '\uFEFF' : '') + updated;
  }
  throw new Error('未知写入类型');
}

function nextBuffer(item, previous, spec) {
  if (item.kind === 'asset') {
    if (!Buffer.isBuffer(item.data)) throw new Error('上游资源不是原始字节');
    if (![0o644, 0o755].includes(item.mode) || item.data.length > MAX_FILE) throw new Error('上游资源权限模式或文件大小无效');
    return Buffer.from(item.data);
  }
  if (previous && previous.length > 5 * 1024 * 1024) throw new Error('用户文本配置超过 5 MB，请先检查');
  return Buffer.from(nextText(item, decode(previous), spec));
}

class SeatTransactions {
  constructor({ plan = runtime.plan, now = Date.now, write = atomic } = {}) {
    this.root = null;
    this.pending = new Map();
    this.buildPlan = plan;
    this.now = now;
    this.write = write;
  }

  select(root, { layout = 'default' } = {}) {
    if (!['default', 'deepseek-harness', 'zcode'].includes(layout)) throw new Error('目录布局错误');
    if (typeof root !== 'string' || !path.isAbsolute(root)) throw new Error('请明确选择绝对目录');
    const resolved = path.resolve(root);
    if (path.parse(resolved).root === resolved) throw new Error('请选择专用目录，不要选择磁盘根目录');
    guardPath(resolved);
    if (fs.existsSync(resolved) && !fs.statSync(resolved).isDirectory()) throw new Error('所选路径不是目录');
    this.root = resolved;
    this.layout = layout;
    this.pending.clear();
    return { root: this.root };
  }

  requireRoot() {
    if (!this.root) throw new Error('先选择目标目录；尚未读取任何用户配置');
    guardPath(this.root);
    return this.root;
  }

  preview(seat) {
    const root = this.requireRoot();
    if (!runtime.PACK_IDS.includes(seat)) throw new Error('未知模型席位');
    const original = this.buildPlan(seat, root, { layout: this.layout });
    const spec = { ...original, writes: [...original.writes] };
    if (this.layout === 'deepseek-harness' && seat !== 'deepseek') throw new Error('席位与目录布局不匹配');
    if (this.layout === 'zcode') {
      if (seat !== 'glm53') throw new Error('席位与目录布局不匹配');
    }
    // Compose multiple edits before hashing: one physical file, one write.
    const grouped = new Map();
    for (const item of spec.writes) {
      const rel = path.relative(root, item.file);
      const file = within(root, rel);
      const key = process.platform === 'win32' ? file.toLowerCase() : file;
      let row = grouped.get(key);
      if (!row) {
        const before = read(file, item.kind === 'asset' ? MAX_FILE : 5 * 1024 * 1024);
        const beforeMode = before !== null ? fs.statSync(file).mode & 0o777 : null;
        row = { path: rel.replace(/\\/g, '/'), kind: item.kind, kinds: [], sources: [], before, after: before, beforeMode, afterMode: beforeMode ?? 0o600,
          assetHash: null, assetMode: null };
        grouped.set(key, row);
      }
      if (item.source && typeof item.source === 'string' && !row.sources.includes(item.source)) row.sources.push(item.source);
      if (item.kind === 'asset') {
        if (row.kinds.some((kind) => kind !== 'asset')) throw new Error(`上游资源与配置写入目标冲突：${row.path}`);
        if (!Buffer.isBuffer(item.data) || ![0o644, 0o755].includes(item.mode) || item.data.length > MAX_FILE) throw new Error('上游资源字节、权限模式或文件大小无效');
        const assetHash = hash(item.data);
        if (row.assetHash && (row.assetHash !== assetHash || row.assetMode !== item.mode)) throw new Error(`不同上游资源映射到同一文件：${row.path}`);
        const duplicate = row.assetHash !== null;
        row.assetHash = assetHash;
        row.assetMode = item.mode;
        if (!duplicate) row.after = nextBuffer(item, row.after, spec);
        row.afterMode = item.mode;
      } else {
        if (row.kinds.includes('asset')) throw new Error(`上游资源与配置写入目标冲突：${row.path}`);
        row.after = nextBuffer(item, row.after, spec);
      }
      if (!row.kinds.includes(item.kind)) row.kinds.push(item.kind);
    }
    const files = [...grouped.values()].map((file) => ({
      ...file, beforeHash: file.before !== null ? hash(file.before) : null, afterHash: hash(file.after),
      changed: file.before === null || !file.before.equals(file.after) || (process.platform !== 'win32' && file.beforeMode !== file.afterMode),
    }));
    const id = crypto.randomUUID();
    const plan = { id, seat, root, created: this.now(), files, pack: spec.pack, upstream: spec.upstream };
    this.pending.clear();
    this.pending.set(id, plan);
    return {
      id, seat, root, pack: spec.pack, packHash: hash(spec.pack), changes: files.filter((file) => file.changed).length, upstream: spec.upstream,
      files: files.map(({ path, kind, kinds, sources, beforeHash, afterHash, beforeMode, afterMode, changed, before, after }) => ({
        path, kind, kinds, sources, beforeHash, afterHash, beforeMode, afterMode, changed, exists: before !== null, bytes: after.length,
      })),
      modelStatus: '未验证：仅处理配置文件、完整技能资源和连接声明',
    };
  }

  getPlan(id) {
    const plan = this.pending.get(id);
    if (!plan || plan.root !== this.requireRoot() || this.now() - plan.created > 15 * 60 * 1000) throw new Error('预览已过期，请重新预览');
    return plan;
  }

  file(id, index) {
    const plan = this.getPlan(id);
    const file = plan.files[index];
    if (!Number.isInteger(index) || !file) throw new Error('文件序号错误');
    return { path: file.path, kind: file.kind, kinds: file.kinds, sources: file.sources, beforeHash: file.beforeHash,
      afterHash: file.afterHash, beforeMode: file.beforeMode, afterMode: file.afterMode,
      before: display(file.before), after: display(file.after) };
  }

  journal(id) {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('版本编号错误');
    return within(this.requireRoot(), `.coldcoffee-history/${id}.json`);
  }

  save(snapshot) { atomic(this.journal(snapshot.id), Buffer.from(JSON.stringify(snapshot, null, 2))); }

  blob(digest) {
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error('备份资源编号错误');
    return within(this.requireRoot(), `.coldcoffee-history/blobs/${digest}`);
  }

  retain(buffer, digest) {
    if (hash(buffer) !== digest) throw new Error('备份前资源校验失败');
    const file = this.blob(digest);
    const existing = read(file);
    if (existing && hash(existing) !== digest) throw new Error('历史资源备份损坏；请保留目录检查');
    if (!existing) atomic(file, buffer);
    return 'blob:' + digest;
  }

  content(value, digest) {
    if (value === null) { if (digest !== null) throw new Error('备份空文件标记错误'); return null; }
    if (typeof value !== 'string') throw new Error('备份文件编码错误');
    const buffer = value.startsWith('blob:') ? read(this.blob(value.slice(5))) : Buffer.from(value, 'base64');
    if (!buffer || hash(buffer) !== digest) throw new Error('备份完整性检查失败');
    return buffer;
  }

  validateCurrent(files, expected) {
    for (const file of files) {
      const target = within(this.root, file.path);
      const value = read(target);
      const digest = value !== null ? hash(value) : null;
      const modeKey = expected === 'beforeHash' ? 'beforeMode' : expected === 'afterHash' ? 'afterMode' : null;
      const expectedMode = modeKey && file[modeKey];
      const modeMatches = process.platform === 'win32' || expectedMode == null || value === null || (fs.statSync(target).mode & 0o777) === expectedMode;
      if (digest !== file[expected] || !modeMatches) throw new Error(`文件已被其他操作修改：${file.path}；请重新预览或保留修改后处理`);
    }
  }

  restoreState(file, { allowBefore = true } = {}) {
    const target = within(this.root, file.path);
    const value = read(target);
    const currentHash = value === null ? null : hash(value);
    const currentMode = process.platform === 'win32' || value === null ? null : fs.statSync(target).mode & 0o777;
    const matches = (side) => {
      const expectedHash = file[side + 'Hash'];
      const expectedMode = file[side + 'Mode'];
      return currentHash === expectedHash && (process.platform === 'win32' || expectedMode == null || currentMode === expectedMode);
    };
    const isBefore = matches('before'), isAfter = matches('after');
    if (!isAfter && (!allowBefore || !isBefore)) throw new Error(`文件已被其他操作修改：${file.path}；请保留当前版本后再恢复`);
    return { file, isBefore, isAfter };
  }

  validateRestore(id) {
    const snapshot = this.snapshot(id);
    if (!['applied', 'preparing', 'restoring', 'partial'].includes(snapshot.status)) throw new Error('此版本没有可恢复的事务状态');
    return snapshot.files.map((file) => this.restoreState(file, { allowBefore: snapshot.status !== 'applied' }));
  }

  deploy(id) {
    const plan = this.getPlan(id);
    this.validateCurrent(plan.files, 'beforeHash');
    const changes = plan.files.filter((file) => file.changed);
    if (!changes.length) { this.pending.clear(); return { ok: true, changed: 0, upstream: plan.upstream, message: '配置和完整技能均已一致，没有重复写入' }; }
    const retained = changes.map((file) => ({
      path: file.path, kind: file.kind, kinds: file.kinds, sources: file.sources, changed: true, beforeHash: file.beforeHash, afterHash: file.afterHash,
      beforeMode: file.beforeMode, afterMode: file.afterMode,
      before: file.before !== null ? this.retain(file.before, file.beforeHash) : null,
      after: this.retain(file.after, file.afterHash),
    }));
    const snapshot = { schemaVersion: 2, id: crypto.randomUUID(), seat: plan.seat, root: plan.root, at: new Date(this.now()).toISOString(), status: 'preparing', files: retained };
    this.save(snapshot);
    const written = [];
    try {
      for (const file of changes) {
        this.validateCurrent([file], 'beforeHash');
        // Register before calling an injected writer: it may commit the
        // atomic rename and then report a failure. The rollback below checks
        // both recorded states rather than assuming a throw wrote nothing.
        written.push(file);
        this.write(within(this.root, file.path), file.after, file.afterMode);
      }
      // A successful atomic rename is not a completed installation: another
      // process can remove an earlier resource while later files are written.
      // Re-read the full plan, including unchanged files, before reporting it
      // as applied. The journal remains recoverable if this check fails.
      this.validateCurrent(plan.files, 'afterHash');
      snapshot.status = 'applied';
      this.save(snapshot);
    } catch (error) {
      const conflicts = [];
      for (const file of written.reverse()) {
        try {
          const state = this.restoreState(file);
          if (state.isBefore) continue;
          const target = within(this.root, file.path);
          if (file.before === null) fs.unlinkSync(target);
          else atomic(target, file.before, file.beforeMode);
          this.validateCurrent([file], 'beforeHash');
        } catch { conflicts.push(file.path); }
      }
      snapshot.status = conflicts.length ? 'partial' : 'rolled-back';
      snapshot.conflicts = conflicts;
      this.save(snapshot);
      this.pending.clear();
      throw new Error(`写入失败：${error.message}；${conflicts.length ? '部分文件需人工检查' : '本次已写文件已回滚'}`);
    }
    this.pending.clear();
    return { ok: true, id: snapshot.id, changed: changes.length, root: this.root, upstream: plan.upstream, backup: this.journal(snapshot.id), message: '原词包与完整技能已写入，去重备份已保存；客户端加载与模型效果需另行验证' };
  }

  history() {
    this.requireRoot();
    const dir = within(this.root, '.coldcoffee-history');
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((name) => /^[a-f0-9-]{36}\.json$/.test(name))
      .map((name) => JSON.parse(decode(read(within(this.root, '.coldcoffee-history/' + name)))))
      .sort((a, b) => b.at.localeCompare(a.at))
      .map((snapshot) => ({ id: snapshot.id, seat: snapshot.seat, at: snapshot.at, status: snapshot.status, files: snapshot.files.length }));
  }

  snapshot(id) {
    const snapshot = JSON.parse(decode(read(this.journal(id))));
    if (snapshot.root !== this.root || snapshot.id !== id || !Array.isArray(snapshot.files)) throw new Error('备份与目标目录不匹配');
    const seen = new Set();
    for (const file of snapshot.files) {
      const target = within(this.root, file.path);
      const key = process.platform === 'win32' ? target.toLowerCase() : target;
      if (seen.has(key)) throw new Error('备份包含重复目标文件');
      seen.add(key);
      this.content(file.after, file.afterHash);
      this.content(file.before, file.beforeHash);
    }
    return snapshot;
  }

  verify(seat) {
    const plan = this.preview(seat);
    return { ok: plan.changes === 0, root: plan.root, seat, upstream: plan.upstream, checks: plan.files.map((file) => ({ path: file.path, ok: !file.changed, exists: file.exists })), modelStatus: '文件匹配不代表客户端已连接或模型效果已验证' };
  }

  restore(id) {
    this.requireRoot();
    const snapshot = this.snapshot(id);
    if (!['applied', 'preparing', 'restoring', 'partial'].includes(snapshot.status)) throw new Error('此版本没有可恢复的事务状态');
    // Recover crash-interrupted transactions only when every file is exactly
    // one of the recorded before/after states. Arbitrary user edits block the
    // entire operation before any file is changed.
    const allowBefore = snapshot.status !== 'applied';
    const states = snapshot.files.map((file) => this.restoreState(file, { allowBefore }));
    snapshot.status = 'restoring';
    this.save(snapshot);
    const restored = [];
    try {
      for (const { file } of states) {
        const state = this.restoreState(file, { allowBefore });
        if (state.isBefore) continue;
        const target = within(this.root, file.path);
        if (file.before === null) fs.unlinkSync(target);
        else atomic(target, this.content(file.before, file.beforeHash), file.beforeMode ?? 0o600);
        restored.push(file);
      }
      this.validateCurrent(snapshot.files, 'beforeHash');
      snapshot.status = 'restored';
      this.save(snapshot);
    } catch (error) {
      snapshot.status = 'partial';
      snapshot.restoredPaths = restored.map((file) => file.path);
      this.save(snapshot);
      throw new Error(`恢复中断：${error.message}；备份保留，请检查目录`);
    }
    this.pending.clear();
    return { ok: true, restored: restored.length, message: '原文件已按字节恢复；本次新增文件已移除，空目录、备份及派生依赖缓存保留' };
  }
}

module.exports = { SeatTransactions, guardPath, within, nextText, nextBuffer, atomic };
