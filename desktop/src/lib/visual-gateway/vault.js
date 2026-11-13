'use strict';
const fs = require('node:fs');
const path = require('node:path');

// The renderer can ask whether a key exists, never ask to retrieve it.
class KeyVault {
  constructor(directory, storage) { this.directory = directory; this.storage = storage; this.memory = new Map(); }
  file(id) {
    if (!/^[a-z][a-z0-9-]{0,63}$/.test(id)) throw new Error('中转标识格式有误');
    return path.join(this.directory, `${id}.secret`);
  }
  persistent() {
    try { return !!this.storage?.isEncryptionAvailable() && this.storage?.getSelectedStorageBackend?.() !== 'basic_text'; }
    catch { return false; }
  }
  put(id, key, remember) {
    this.file(id);
    if (!key || key.length > 16000 || /[\r\n]/.test(key)) throw new Error('请填写有效的 API Key');
    if (remember && !this.persistent()) throw new Error('系统加密存储尚未就绪，请取消记住 Key 后连接');
    if (remember) {
      fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      const file = this.file(id);
      try {
        fs.writeFileSync(file + '.tmp', this.storage.encryptString(key), { mode: 0o600 });
        fs.renameSync(file + '.tmp', file);
      } finally { try { fs.unlinkSync(file + '.tmp'); } catch {} }
    } else if (fs.existsSync(this.file(id))) fs.unlinkSync(this.file(id));
    this.memory.set(id, key);
  }
  get(id) {
    if (this.memory.has(id)) return this.memory.get(id);
    const file = this.file(id);
    if (!fs.existsSync(file) || !this.persistent()) return '';
    try { const key = this.storage.decryptString(fs.readFileSync(file)); this.memory.set(id, key); return key; }
    catch { return ''; }
  }
  has(id) { return !!this.get(id); }
  remove(id) { const file = this.file(id); if (fs.existsSync(file)) fs.unlinkSync(file); this.memory.delete(id); }
  scrub(value) {
    let text = String(value || '');
    for (const key of this.memory.values()) if (key) {
      text = text.split(key).join('[API Key 已隐藏]');
      text = text.split(JSON.stringify(key).slice(1, -1)).join('[API Key 已隐藏]');
    }
    return text.replace(/Bearer\s+[^\s"<>]+/gi, 'Bearer [已隐藏]');
  }
}
module.exports = { KeyVault };
