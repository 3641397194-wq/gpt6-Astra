'use strict';
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ColdCoffeeRouting = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const policies = { '': '智能选择', order: '按顺序', rotate: '轮流分配', usage: '低用量优先', pace: '到期前使用', weight: '按权重', free: '免费优先', fast: '速度优先', cheap: '低价格优先', drain: '用尽再切换', expiring: '免费额度到期优先', manual: '手动指定' };
  const affinities = { '': '自动保持', session: '整段会话保持', turn: '本轮保持', off: '每次重新选择', strict: '严格固定' };
  const reasons = { quota: '额度用尽', credit: '余额不足', rate: '频率受限', other: '上游异常', restricted: '服务受限', verify: '需要验证', model: '模型不可用', context: '上下文超限' };
  const policy = name => policies[name || ''] || `引擎策略：${name}`;
  const affinity = name => affinities[name || ''] || name;
  const good = t => t.done && t.status >= 200 && t.status < 400 && !t.error;
  const failed = t => t.done && !good(t);
  function candidates(route) {
    if (!route) return [];
    const result = [...(route.order || []).map(s => ({ ...s, excluded: false })), ...(route.left || []).map(s => ({ ...s, excluded: true }))];
    for (const t of route.tries || []) if (!result.some(s => s.id === t.id && s.model === t.model)) result.push({ id: t.id, model: t.model, name: t.name || t.provider || '引擎成员', provider: t.provider, routing: '', label: '连接成员', via: [], excluded: false });
    return result.map((s, index) => {
      const attempts = (route.tries || []).map((t, i) => ({ ...t, step: i + 1 })).filter(t => t.id === s.id && (!t.model || t.model === s.model));
      const last = attempts.at(-1);
      const status = last ? !last.done ? 'running' : good(last) ? 'hit' : 'failed' : s.excluded ? 'excluded' : route.done ? 'standby' : 'pending';
      let note = { running: '正在响应', hit: '实际命中', failed: '尝试未完成', excluded: '未参与本次候选', standby: '备用 · 本次未尝试', pending: '候选 · 尚未尝试' }[status];
      if (last && failed(last)) note = `HTTP ${last.status || '—'} · ${reasons[last.fail] || last.fail || '请求异常'}`;
      if (!last && s.rest) note = `休息中 · ${reasons[s.rest.why] || s.rest.why || '暂不可用'}`;
      else if (!last && s.window) note = '该成员窗口小于本次上下文';
      else if (!last && s.barred) note = '模型未在该连接中启用';
      else if (!last && s.held) note = '受当前路由范围约束';
      else if (!last && s.capped) note = `达到用量上限 ${s.capped}%`;
      return { ...s, position: index + 1, attempts, status, note };
    });
  }
  function story(route) {
    if (!route) return [];
    const steps = [{ tone: 'neutral', title: `请求 ${route.group?.name || route.model}`, detail: `请求模型：${route.model || '未记录'}${route.effort ? ` · 推理强度：${route.effort}` : ''}` }];
    if (route.group) steps.push({ tone: 'neutral', title: `路由组 · ${policy(route.group.routing)}`, detail: `${route.group.members?.length || 0} 个模型成员 · ${affinity(route.group.affinity)}。候选顺序来自网关，不等于每个成员都被调用。` });
    if (route.rule) steps.push({ tone: 'neutral', title: route.rule.n ? `命中规则 ${route.rule.n}` : '本次未命中路由规则', detail: route.rule.use ? `优先成员：${route.rule.instead || route.rule.use}${route.rule.unready ? ' · 原规则成员未就绪' : ''}${route.rule.held ? ' · 沿用本轮决定' : ''}` : route.rule.waits ? '规则将在下一轮重新评估。' : '继续采用路由组的基础策略。' });
    for (const n of route.nested || []) steps.push({ tone: 'neutral', title: `嵌套组 ${n.name || n.id}`, detail: n.rule?.use ? `组内规则选择：${n.rule.use}` : '沿用该组的实际候选顺序。' });
    if (route.affinity?.kept) steps.push({ tone: 'neutral', title: '保持上一次连接', detail: `网关保持原因：${{ session: '会话保持', turn: '同一轮工具往返', cache: '沿用供应商缓存', strict: '严格固定' }[route.affinity.why] || route.affinity.why}` });
    if (route.moved) steps.push({ tone: 'neutral', title: '引擎记录了模型替代', detail: `${route.moved.asked || route.model} → ${route.moved.to || '未记录'} · ${route.moved.why || '未记录原因'}` });
    for (const [i, t] of (route.tries || []).entries()) {
      const next = route.tries[i + 1], ok = good(t);
      steps.push({ tone: !t.done ? 'running' : ok ? 'hit' : 'failed', title: `尝试 ${i + 1} · ${t.name || t.provider || '连接成员'} / ${t.model || '未记录'}`, detail: [!t.done ? '正在返回' : `HTTP ${t.status || '—'} · ${t.ms || 0} ms`, t.effort ? `推理 ${t.effort}` : '', t.served ? `回答模型 ${t.served}` : '', t.error || (t.fail ? reasons[t.fail] || t.fail : ''), t.rest ? `休息至 ${t.rest.until || '引擎决定'}（${t.rest.by || t.rest.why}）` : '', next ? `下一次实际尝试：${next.name || next.provider || '连接成员'} / ${next.model || ''}` : !ok && t.done ? '没有后续尝试记录' : ''].filter(Boolean).join(' · ') });
    }
    if (!(route.tries || []).length) steps.push({ tone: route.done ? 'failed' : 'running', title: route.done ? '本次没有连接尝试记录' : '网关正在选择连接', detail: route.error || route.fail || '等待核心上报下一次变化。' });
    return steps;
  }
  function contextEntries(prompt, { mode = 'window', kind = 'all' } = {}) {
    const entries = [];
    for (const part of prompt?.parts || []) {
      if (kind !== 'all' && part.kind !== kind) continue;
      if (part.items?.length) for (const [i, item] of part.items.entries()) {
        if (item.tokens > 0) entries.push({ ...item, kind: part.kind, index: item.index ?? i });
      }
      else if (part.tokens > 0) entries.push({ kind: part.kind, name: part.kind, tokens: part.tokens, index: null });
    }
    const represented = entries.reduce((n, p) => n + p.tokens, 0);
    if (kind === 'all' && prompt?.tokens > represented) entries.push({ kind: 'other', name: '未分项内容', tokens: prompt.tokens - represented, index: null });
    if (kind === 'all' && mode === 'window' && prompt?.window > prompt.tokens) entries.push({ kind: 'remaining', name: '剩余空间', tokens: prompt.window - prompt.tokens, index: null });
    return entries.sort((a, b) => b.tokens - a.tokens);
  }
  function treemap(entries, x = 0, y = 0, w = 100, h = 100) {
    entries = entries.filter(e => Number.isFinite(e.tokens) && e.tokens > 0);
    if (!entries.length) return [];
    if (entries.length === 1) return [{ ...entries[0], x, y, w, h }];
    const sum = entries.reduce((a, e) => a + e.tokens, 0); let split = 1, acc = entries[0].tokens;
    while (split < entries.length - 1 && Math.abs(acc + entries[split].tokens - sum / 2) < Math.abs(acc - sum / 2)) acc += entries[split++].tokens;
    const ratio = acc / sum;
    return w >= h ? [...treemap(entries.slice(0, split), x, y, w * ratio, h), ...treemap(entries.slice(split), x + w * ratio, y, w * (1 - ratio), h)] : [...treemap(entries.slice(0, split), x, y, w, h * ratio), ...treemap(entries.slice(split), x, y + h * ratio, w, h * (1 - ratio))];
  }
  function cache(route) {
    // Only the responding attempt's usage describes this context. Earlier
    // billable failed attempts are not additional cache hits for the reply.
    const u = [...(route?.usage || [])].reverse().find(u => (!route.actualProvider || u.provider === route.actualProvider) && (!route.actualModel || u.model === route.actualModel)) || route?.usage?.at(-1);
    if (!u || u.cache_unknown) return null;
    const read = u.cache_read || 0, write = u.cache_write || 0, input = (u.in || 0) + read + write;
    return { read, write, input, ratio: input > 0 ? read / input : 0 };
  }
  function courier(route) {
    const attempts = route?.tries || [];
    if (!route) return { phase: 'idle', target: null, label: '布偶猫待命 · 等待请求' };
    const active = attempts.filter(t => !t.done).at(-1);
    if (!route.done && active) return { phase: 'running', target: active, label: '布偶猫传输中 · 跟随当前实际线路' };
    if (!route.done) return { phase: 'waiting', target: attempts.at(-1) || null, label: attempts.length ? '布偶猫等待中 · 等待引擎下一步' : '布偶猫待命 · 正在准备线路' };
    const answer = attempts.filter(good).at(-1);
    const success = route.status >= 200 && route.status < 400 && !route.error && answer;
    return success ? { phase: 'arrived', target: answer, label: '布偶猫已送达 · 回答完成' } : { phase: 'failed', target: attempts.at(-1) || null, label: '布偶猫已停下 · 查看本次错误' };
  }
  return { policies, affinities, policy, affinity, candidates, story, contextEntries, treemap, cache, good, courier };
});
