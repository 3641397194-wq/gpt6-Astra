'use strict';
const crypto = require('node:crypto');

// Deliberate IPC projection, not a copy of the engine response. Account names,
// key fingerprints, session IDs, folder names and control credentials stay in
// the main process. Opaque seat aliases still join order/left/tries reliably.
const list = value => Array.isArray(value) ? value : [];
const count = value => Number.isFinite(value) && value >= 0 ? value : 0;
const pick = (source, keys, clean) => Object.fromEntries(keys.filter(k => typeof source?.[k] === 'string').map(k => [k, clean(source[k])]));
const nums = (source, keys) => Object.fromEntries(keys.filter(k => Number.isFinite(source?.[k])).map(k => [k, count(source[k])]));
const bools = (source, keys) => Object.fromEntries(keys.filter(k => typeof source?.[k] === 'boolean').map(k => [k, source[k]]));
function groupRevision(group) {
  const derived = new Set(['ready', 'memberInfo', 'holds', 'offers', 'shared', 'picked', 'patterns', 'decides', 'ref', 'classifierFailed', 'matched']);
  return crypto.createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(group).filter(([k]) => !derived.has(k)).sort(([a], [b]) => a.localeCompare(b))))).digest('hex');
}

function projector({ scrub = s => s, salt = 'trace-view', secrets = [] } = {}) {
  const clean = value => {
    let text = scrub(String(value ?? ''));
    for (const secret of secrets) if (secret) text = text.split(secret).join('[本机凭据已隐藏]');
    return text.replace(/\b(?:sk|ghp|github_pat|xoxb)[-_][A-Za-z0-9_-]{8,}/g, '[凭据已隐藏]')
      .replace(/([?&](?:key|token|api_key|secret)=)[^\s&#"<>]+/gi, '$1[已隐藏]')
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[账号已隐藏]')
      .replace(/(?:[A-Za-z]:[\\/]|\/(?:Users|home)\/)[^\s"<>]+/g, '[本机路径已隐藏]')
      .slice(0, 4000);
  };
  const alias = id => id ? 'seat-' + crypto.createHmac('sha256', salt).update(String(id)).digest('hex').slice(0, 20) : '';
  const strings = values => list(values).filter(v => typeof v === 'string').map(clean);
  const rest = source => source ? { ...pick(source, ['why', 'by', 'until', 'model', 'error'], clean), ...nums(source, ['status', 'failures']), ...bools(source, ['rate', 'probed']) } : null;
  function seat(source) {
    return {
      id: alias(source.id),
      ...pick(source, ['provider', 'name', 'kind', 'agent', 'model', 'fixed', 'routing', 'unit', 'due', 'expires', 'capBack', 'unread', 'noURL', 'speaks'], clean),
      ...nums(source, ['used', 'amount', 'limit', 'balance', 'pace', 'tokens', 'lateTtft', 'lateTps', 'fit', 'window', 'capped', 'busy', 'rank', 'reserve']),
      ...bools(source, ['fast', 'fallback', 'shared', 'known', 'learns', 'free', 'turn', 'unlisted', 'barred', 'held', 'noCredits', 'credits', 'creditsLast', 'creditsFirst', 'aside', 'weekLow']),
      via: strings(source.via), rest: rest(source.rest),
      label: source.kind === 'account' ? '订阅账号' : source.kind === 'key' ? 'API Key' : '供应商连接',
    };
  }
  function group(source) {
    if (!source) return null;
    return {
      ...pick(source, ['id', 'ref', 'name', 'routing', 'affinity'], clean),
      ...bools(source, ['auto', 'sink']), members: strings(source.members), via: strings(source.via), fast: strings(source.fast),
      subs: list(source.subs).map(s => ({ ...pick(s, ['id', 'ref', 'name', 'routing', 'in'], clean), ...nums(s, ['rules']) })),
      paused: list(source.paused).map(s => ({ ...pick(s, ['id', 'model', 'why'], clean) })),
    };
  }
  function rule(source) {
    if (!source) return null;
    return {
      ...nums(source, ['n', 'turn', 'tokens']),
      ...pick(source, ['use', 'instead', 'effort', 'pick', 'wanted', 'useEffort'], clean),
      ...bools(source, ['held', 'waits', 'grown', 'images', 'unready', 'compact', 'bare']),
      when: strings(source.when), more: strings(source.more), then: strings(source.then), small: strings(source.small),
    };
  }
  function route(source) {
    const candidates = [...list(source.order), ...list(source.left)];
    const tries = list(source.tries).map(t => {
      const candidate = candidates.find(s => s.id === t.id && (!t.model || s.model === t.model)) || candidates.find(s => s.id === t.id);
      return {
        id: alias(t.id),
        ...pick(t, ['model', 'effort', 'fixed', 'ruleEffort', 'start', 'served', 'upstream', 'tier', 'tierServed', 'fail', 'error', 'sentBy'], clean),
        ...nums(t, ['status', 'ms', 'ttft', 'firstText', 'flow', 'queued', 'again', 'replan', 'patience']),
        ...bools(t, ['done', 'picked', 'fast', 'swapped', 'routed', 'kept', 'gone', 'earlier', 'reasoningHidden']),
        provider: clean(candidate?.provider || ''), name: clean(candidate?.name || ''), rest: rest(t.rest),
        net: t.net ? { ...nums(t.net, ['own', 'asks', 'connect', 'dns', 'tls', 'wait', 'head']), ...bools(t.net, ['reused']) } : null,
      };
    });
    const answered = [...tries].reverse().find(t => !source.done && !t.done || t.done && t.status >= 200 && t.status < 400 && !t.error);
    const prompt = source.prompt ? {
      ...nums(source.prompt, ['window', 'tokens', 'turns']), ...bools(source.prompt, ['counted', 'held']),
      parts: list(source.prompt.parts).filter(p => ['system', 'tools', 'skills', 'memory', 'files', 'results', 'chat'].includes(p.kind)).map(p => ({
        kind: p.kind, tokens: count(p.tokens),
        items: list(p.items).map((item, index) => ({ index, ...pick(item, ['name', 'tag'], clean), ...nums(item, ['n', 'tokens']) })),
      })),
    } : null;
    return {
      ...nums(source, ['id', 'seq', 'status', 'ms', 'tokens', 'out', 'reasoning', 'ttft', 'firstText', 'flow', 'sent', 'own', 'retried', 'queued', 'bytes', 'contentAt', 'estTok', 'cost', 'unpriced']),
      ...pick(source, ['time', 'agent', 'model', 'provider', 'effort', 'tier', 'error', 'fail', 'served', 'upstream', 'phase'], clean),
      ...bools(source, ['done', 'swapped', 'routed', 'reasoningHidden', 'priced']),
      output: count(source.out),
      demo: source.provider === 'local-demo' || String(source.model || '').startsWith('local-demo/'),
      group: group(source.group), rule: rule(source.rule),
      nested: list(source.nested).map(s => ({ ...pick(s, ['group', 'name'], clean), rule: rule(s.rule) })),
      affinity: source.affinity ? {
        ...pick(source.affinity, ['mode', 'why'], clean),
        ...nums(source.affinity, ['turn', 'lastTurn', 'cacheRead', 'cacheWrite']),
        ...bools(source.affinity, ['within', 'kept']), last: alias(source.affinity.last),
      } : null,
      moved: source.moved ? { ...pick(source.moved, ['asked', 'to', 'why'], clean) } : null,
      order: list(source.order).map(seat), left: list(source.left).map(seat), tries, attempts: tries,
      actualProvider: answered?.provider || '', actualName: answered?.name || '',
      actualModel: answered ? clean(source.served || answered.served || answered.model || '') : '',
      usage: list(source.usage).map(u => ({
        ...pick(u, ['provider', 'model'], clean), ...nums(u, ['in', 'out', 'cache_read', 'cache_write', 'reasoning', 'credits']),
        ...bools(u, ['cache_unknown']),
      })), prompt,
    };
  }
  function catalog(source) {
    const models = list(source.models).map(m => ({
      ...pick(m, ['id', 'name', 'provider', 'providerName'], clean), ...nums(m, ['context']),
      efforts: strings(m.efforts), ...bools(m, ['images', 'imagesUnknown', 'canFast', 'free']),
    }));
    const groups = list(source.groups).map(g => ({
      ...pick(g, ['id', 'name', 'ref', 'routing', 'affinity', 'picked'], clean),
      ...nums(g, ['context', 'firstToken', 'patience']),
      ...bools(g, ['ready', 'auto', 'sink', 'disabled', 'unlists']),
      members: strings(g.members), matched: strings(g.matched), offMembers: strings(g.off), revision: groupRevision(g),
      rules: list(g.rules).length, patterns: list(g.match).length,
      memberInfo: list(g.memberInfo).map(m => ({
        ...pick(m, ['id', 'provider', 'name', 'model', 'of', 'effort'], clean),
        ...nums(m, ['on', 'context']), ...bools(m, ['ready', 'group', 'providerOff', 'fast', 'images', 'imagesUnknown']),
      })),
    }));
    return {
      models, groups,
      pools: list(source.pools).map(p => ({
        ...pick(p, ['provider', 'name', 'routing', 'affinity', 'kind', 'protocol'], clean), on: list(p.who).length,
      })),
      found: source.found === true,
      availableModels: [
        ...models.map(m => ({ id: m.id, name: m.name, provider: m.providerName || m.provider, context: m.context || 0, group: false })),
        ...groups.filter(g => g.ready).map(g => ({ id: g.ref || `group/${g.id}`, name: g.name, provider: '路由组', context: g.context || 0, group: true })),
      ].filter(m => !m.id?.startsWith('local-demo/')),
    };
  }
  return { route, catalog, clean };
}

function totalsView(source = {}) {
  return { requests: count(source.requests), rerouted: count(source.rerouted), errors: count(source.errors) };
}

module.exports = { projector, totalsView, groupRevision };
