'use strict';

const crypto = require('node:crypto');
const { loadSession } = require('./session');
const { GrokMemoryClient, textInput, validId } = require('./protocol');
const { MemoryError, publicError } = require('./errors');

class GrokMemoryController {
  constructor({ loader = loadSession, client = new GrokMemoryClient(), preset = () => '', now = Date.now } = {}) {
    this.loader = loader; this.client = client; this.preset = preset; this.now = now;
    this.session = null; this.abort = null; this.epoch = 0; this.plan = null;
    this.reset();
  }

  reset() {
    this.value = { connected: false, busy: false, phase: 'idle', checks: [], bots: [], selected: '',
      items: [], source: '', more: false, stale: false, evidence: null, lastReadAt: '', error: null };
    this.plan = null;
  }

  snapshot() {
    // Explicit public projection; the session is never an IPC result.
    let json = JSON.stringify({ ...this.value, preview: this.plan ? {
      id: this.plan.id, action: this.plan.action, text: this.plan.text, scope: this.plan.scope,
      tier: this.plan.tier, bot: this.value.bots.find(bot => bot.id === this.plan.bot)?.label || '',
    } : null });
    for (const secret of [this.session?.token, this.session?.machine].filter(Boolean)) {
      // Escape first so backslashes/quotes in a machine identifier are redacted too.
      json = json.split(JSON.stringify(secret).slice(1, -1)).join('[已隐藏登录信息]');
    }
    return JSON.parse(json);
  }

  requireConnection() {
    if (!this.session || !this.value.connected) throw new MemoryError('NOT_CONNECTED');
  }

  requireBot() {
    this.requireConnection();
    if (!validId(this.value.selected) || !this.value.bots.some(bot => bot.id === this.value.selected)) throw new MemoryError('BOT');
    return this.value.selected;
  }

  ensureIdle() { if (this.value.busy) throw new MemoryError('BUSY'); }

  disconnect() {
    this.epoch++;
    this.abort?.abort(); this.abort = null; this.session = null;
    this.reset();
  }

  async run(phase, task) {
    this.ensureIdle();
    const epoch = this.epoch;
    const controller = new AbortController();
    this.abort = controller;
    this.value.busy = true; this.value.phase = phase; this.value.error = null;
    const progress = value => { if (epoch === this.epoch) this.value.phase = value; };
    try {
      await task(controller.signal, progress, () => {
        if (epoch !== this.epoch || controller.signal.aborted) throw new MemoryError('CANCELLED');
      });
    } finally {
      if (epoch === this.epoch) { this.value.busy = false; this.value.phase = 'idle'; this.abort = null; }
    }
  }

  async connect() {
    this.ensureIdle();
    await this.run('connecting', async (signal, progress, current) => {
      let loaded;
      try { loaded = await this.loader({ signal }); }
      catch (error) { current(); this.value.checks = error.checks || []; throw error; }
      current();
      this.session = loaded.session;
      this.value.checks = loaded.checks;
      progress('listing-bots');
      try {
        const bots = await this.client.listBots(this.session, signal);
        current();
        this.value.bots = bots;
        this.value.connected = true;
        this.value.selected = bots[0]?.id || '';
        this.value.checks.push({ id: 'api', title: 'Bot 服务连接', ok: true, detail: `已读取 ${bots.length} 个 Bot` });
      } catch (error) {
        current();
        this.value.checks.push({ id: 'api', title: 'Bot 服务连接', ok: false, detail: publicError(error).message });
        this.session = null;
        throw error;
      }
    });
  }

  select(bot) {
    this.ensureIdle(); this.requireConnection();
    if (!this.value.bots.some(row => row.id === bot)) throw new MemoryError('BOT');
    if (this.value.selected !== bot) {
      Object.assign(this.value, { selected: bot, items: [], source: '', more: false, stale: false,
        evidence: null, lastReadAt: '', error: null });
      this.plan = null;
    }
  }

  async pull() {
    const bot = this.requireBot();
    await this.run('reading', async (signal, progress, current) => {
      const result = await this.client.pull(this.session, bot, signal, progress);
      current();
      this.plan = null;
      Object.assign(this.value, result, { stale: false, lastReadAt: new Date(this.now()).toISOString() });
      const evidence = this.value.evidence;
      if (evidence && evidence.bot === bot) {
        const matches = result.items.filter(row => row.text === evidence.text);
        const exact = matches.some(row => row.scope === evidence.scope && row.tier === evidence.tier);
        evidence.readBack = evidence.action === 'write'
          ? (exact ? 'found' : matches.length ? 'text-found' : result.more ? 'partial' : 'not-found')
          : (matches.length ? 'still-present' : result.more ? 'partial' : 'absent');
        evidence.readAt = this.value.lastReadAt;
        evidence.readSource = result.source;
      }
    });
  }

  prepare(action, payload) {
    this.ensureIdle(); const bot = this.requireBot();
    let input;
    if (action === 'write') {
      if (!['user', 'agent'].includes(payload.scope) || !['profile', 'log'].includes(payload.tier)) throw new MemoryError('INPUT');
      input = { text: textInput(payload.text), scope: payload.scope, tier: payload.tier };
    } else {
      if (this.value.stale) throw new MemoryError('STALE');
      const item = this.value.items.find(row => row.key === payload.key);
      if (!item) throw new MemoryError('INPUT');
      input = { text: item.text, scope: item.scope, tier: item.tier };
    }
    this.plan = { ...input, action, bot, id: crypto.randomUUID(), expires: this.now() + 300000 };
  }

  async commit(payload) {
    this.ensureIdle(); const bot = this.requireBot();
    const plan = this.plan;
    if (!plan || plan.id !== payload.planId || plan.bot !== bot || plan.expires < this.now()) throw new MemoryError('STALE');
    if (payload.confirm !== true) throw new MemoryError('INPUT');
    this.plan = null; // One-use preview; repeating an IPC never repeats a write.
    this.value.evidence = { bot, action: plan.action, text: plan.text, scope: plan.scope, tier: plan.tier,
      acknowledgement: false, readBack: 'not-checked', newSession: 'unverified', sentAt: new Date(this.now()).toISOString() };
    this.value.stale = true;
    await this.run(plan.action === 'write' ? 'writing' : 'forgetting', async (signal, progress, current) => {
      if (plan.action === 'write') await this.client.write(this.session, bot, plan, signal, progress);
      else await this.client.forget(this.session, bot, plan.text, signal, progress);
      current();
      this.value.evidence.acknowledgement = true;
      // No optimistic insertion/removal: only another pull may change the list.
    });
  }

  async execute(action, payload = {}) {
    let epoch = this.epoch;
    try {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new MemoryError('INPUT');
      switch (action) {
        case 'status': break;
        case 'connect': this.ensureIdle(); this.disconnect(); epoch = this.epoch; await this.connect(); break;
        case 'disconnect': this.disconnect(); break;
        case 'cancel': this.abort?.abort(); break;
        case 'select': this.select(payload.bot); break;
        case 'pull': await this.pull(); break;
        case 'prepare-write': this.prepare('write', payload); break;
        case 'prepare-forget': this.prepare('forget', payload); break;
        case 'discard-preview': this.ensureIdle(); this.plan = null; break;
        case 'commit': await this.commit(payload); break;
        case 'preset': return { ok: true, text: this.preset(), state: this.snapshot() };
        default: throw new MemoryError('ACTION');
      }
      return { ok: true, state: this.snapshot() };
    } catch (error) {
      const failure = publicError(error);
      // A disconnected/changed session must not receive a late operation result.
      if (epoch === this.epoch) {
        this.value.error = failure;
        if (['AUTH', 'EXPIRED'].includes(failure.code)) {
          const checks = this.value.checks;
          this.disconnect(); this.value.checks = checks; this.value.error = failure;
        }
      }
      return { ok: false, error: failure, state: this.snapshot() };
    }
  }
}

module.exports = { GrokMemoryController };
