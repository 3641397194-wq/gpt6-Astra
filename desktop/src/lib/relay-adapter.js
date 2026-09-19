'use strict';

/**
 * First-party relay contract used by the desktop client.
 *
 * The adapter deliberately does not invent private server routes. `preview`
 * is deterministic and performs no I/O; `openai` uses the public-compatible
 * `/models` and `/responses` paths; `remote` requires four explicit paths.
 */

const ENDPOINT_KEYS = Object.freeze(['catalog', 'entitlement', 'usage', 'submit']);
const REMOTE_MODE = 'remote';
const OPENAI_MODE = 'openai';
const PREVIEW_MODE = 'preview';

// Public, serialisable contract metadata for settings UIs and future adapters.
// The endpoint values intentionally have no defaults: each deployment chooses
// its own paths and can keep them behind a gateway or versioned prefix.
const RELAY_CONFIG_SCHEMA = Object.freeze({
  type: 'object',
  properties: Object.freeze({
    mode: Object.freeze({ type: 'string', enum: Object.freeze(['preview', 'openai', 'remote']), default: 'preview' }),
    baseUrl: Object.freeze({ type: 'string', format: 'uri', requiredWhen: 'mode=openai|remote' }),
    wireApi: Object.freeze({ type: 'string', enum: Object.freeze(['auto', 'responses', 'chat']), default: 'auto' }),
    modelsPath: Object.freeze({ type: 'string', default: 'models' }),
    responsesPath: Object.freeze({ type: 'string', default: 'responses' }),
    chatCompletionsPath: Object.freeze({ type: 'string', default: 'chat/completions' }),
    workflowPath: Object.freeze({ type: 'string', requiredWhen: 'optional' }),
    usagePath: Object.freeze({ type: 'string', requiredWhen: 'optional' }),
    entitlementPath: Object.freeze({ type: 'string', requiredWhen: 'optional' }),
    endpoints: Object.freeze({
      type: 'object',
      requiredWhen: 'mode=remote',
      required: ENDPOINT_KEYS
    }),
    authToken: Object.freeze({ type: 'string', secret: true }),
    headers: Object.freeze({ type: 'object' })
  })
});

const RELAY_CONTRACT = Object.freeze({
  catalog: Object.freeze({ method: 'GET', endpoint: 'catalog', returns: 'workflow catalog' }),
  entitlement: Object.freeze({ method: 'GET', endpoint: 'entitlement', returns: 'account permissions' }),
  usage: Object.freeze({ method: 'GET', endpoint: 'usage', returns: 'balance and usage' }),
  submit: Object.freeze({ method: 'POST', endpoint: 'submit', returns: 'task receipt' })
});

const PROVIDER_PRESETS = Object.freeze({
  'gpt-6-astra': Object.freeze({
    id: 'gpt-6-astra',
    label: 'GPT-6 Astra',
    model: 'gpt-6-astra',
    preset: 'coldcoffee-full',
    access: 'full',
    accessLevel: 'full',
    reasoning: 'xhigh',
    context: 'max',
    tools: true,
    streaming: false,
    description: '冷咖啡满配 · 完整访问'
  }),
  'gpt-5.6-sol': Object.freeze({
    id: 'gpt-5.6-sol',
    label: 'GPT-5.6 Sol',
    model: 'gpt-5.6-sol',
    preset: 'coldcoffee-full',
    access: 'full',
    accessLevel: 'full',
    reasoning: 'xhigh',
    context: 'max',
    tools: true,
    streaming: false,
    description: '冷咖啡满配 · 完整访问'
  })
});

const PROVIDER_ALIASES = Object.freeze({
  'gpt6-astra': 'gpt-6-astra',
  'gpt-6-asrra': 'gpt-6-astra',
  'gpt6-asrra': 'gpt-6-astra',
  'gpt5.6-sol': 'gpt-5.6-sol',
  'gpt-5-6-sol': 'gpt-5.6-sol',
  'gpt56-sol': 'gpt-5.6-sol'
});

const MOCK_CATALOG = Object.freeze({
  version: 'preview.1',
  workflows: Object.freeze([
    Object.freeze({
      id: 'coldcoffee-default',
      name: '冷咖啡在线工作流',
      visibility: 'member',
      version: 'preview.1',
      providers: Object.freeze(['gpt-6-astra', 'gpt-5.6-sol']),
      status: 'available',
      unitCost: 1
    })
  ]),
  source: 'preview'
});

const MOCK_ENTITLEMENT = Object.freeze({
  accountId: 'preview-account',
  active: true,
  accessFull: true,
  providers: Object.freeze({ 'gpt-6-astra': true, 'gpt-5.6-sol': true }),
  workflows: Object.freeze({ 'coldcoffee-default': true }),
  source: 'preview'
});

const MOCK_USAGE = Object.freeze({
  balance: 999,
  remaining: 999,
  used: 0,
  unit: 'preview',
  source: 'preview'
});

function clone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeProviderId(value) {
  const id = text(value).toLowerCase();
  return PROVIDER_PRESETS[id] ? id : (PROVIDER_ALIASES[id] || id);
}

function numberOrNull(value) {
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveProviderId(value) {
  const id = normalizeProviderId(value);
  if (!PROVIDER_PRESETS[id]) throw new RelayConfigError(`未知模型席位：${value || '(空)'}`, { providerId: value });
  return id;
}

function normalizeConfig(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RelayConfigError('中转配置必须是对象');
  }
  const mode = text(input.mode).toLowerCase() || PREVIEW_MODE;
  if (mode !== PREVIEW_MODE && mode !== REMOTE_MODE && mode !== OPENAI_MODE) {
    throw new RelayConfigError('未知中转模式');
  }
  const endpointsInput = input.endpoints && typeof input.endpoints === 'object'
    ? input.endpoints
    : {};
  const endpoints = {};
  for (const key of ENDPOINT_KEYS) {
    const value = text(endpointsInput[key]);
    if (value) endpoints[key] = value;
  }
  const baseUrl = text(input.baseUrl).replace(/\/+$/, '');
  const headers = input.headers && typeof input.headers === 'object' && !Array.isArray(input.headers)
    ? { ...input.headers }
    : {};
  // Keep credentials opaque.  The object is held in memory only and never
  // included in status(), errors, or preview payloads.
  const authToken = typeof input.authToken === 'string' ? input.authToken : '';
  if (baseUrl) validateApiUrl(baseUrl, { authToken });
  const transport = typeof input.transport === 'function' ? input.transport : null;
  const wireApi = ['auto', 'responses', 'chat'].includes(text(input.wireApi).toLowerCase())
    ? text(input.wireApi).toLowerCase() : 'auto';
  const path = (value, fallback) => text(value).replace(/^\/+/, '') || fallback;
  return Object.freeze({
    mode, baseUrl, endpoints: Object.freeze(endpoints), headers, authToken, transport, wireApi,
    modelsPath: path(input.modelsPath, 'models'),
    responsesPath: path(input.responsesPath, 'responses'),
    chatCompletionsPath: path(input.chatCompletionsPath, 'chat/completions'),
    workflowPath: path(input.workflowPath, ''),
    usagePath: path(input.usagePath, 'usage'),
    entitlementPath: path(input.entitlementPath, ''),
    timeoutMs: Number.isFinite(Number(input.timeoutMs)) ? Math.max(1000, Number(input.timeoutMs)) : 45000
  });
}

function missingConfig(config) {
  const missing = [];
  if (config.mode === PREVIEW_MODE) return missing;
  if (!config.baseUrl) missing.push('baseUrl');
  if (config.mode === OPENAI_MODE) {
    if (!config.authToken) missing.push('authToken');
    return missing;
  }
  for (const key of ENDPOINT_KEYS) if (!config.endpoints[key]) missing.push(`endpoints.${key}`);
  return missing;
}

function validateApiUrl(value, config = {}) {
  let parsed;
  try { parsed = new URL(value); }
  catch { throw new RelayConfigError('API 地址格式无效'); }
  // Keep credentials out of URLs, history, copied config and diagnostic output.
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new RelayConfigError('API 地址仅填写协议、主机与路径；凭据请填写在 API Key 字段');
  }
  const secrets = config.authToken ? [config.authToken, encodeURIComponent(config.authToken)] : [];
  if (secrets.some(secret => value.includes(secret))) throw new RelayConfigError('API 地址中包含凭据，请将凭据移至 API Key 字段');
  const exactLoopback = /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?(?:\/|$)/i.test(value);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && exactLoopback)) {
    throw new RelayConfigError('API 地址须使用 HTTPS；HTTP 仅供本机回环测试');
  }
  return parsed;
}

function endpointUrl(config, key) {
  const endpoint = config.endpoints[key];
  if (!endpoint) throw new RelayConfigError(`未配置中转接口：endpoints.${key}`, { endpoint: key });
  try {
    const base = validateApiUrl(config.baseUrl, config);
    const url = validateApiUrl(new URL(endpoint, `${config.baseUrl}/`).toString(), config);
    if (url.origin !== base.origin) throw new RelayConfigError('中转接口须与 Base URL 同源');
    return url.toString();
  } catch {
    throw new RelayConfigError('中转接口须使用同源且不含凭据的 HTTPS 地址或本机回环地址', { endpoint: key });
  }
}

function openaiEndpointUrl(config, path) {
  const value = text(path);
  if (!value) throw new RelayConfigError('未配置 OpenAI 兼容接口路径');
  try {
    const base = validateApiUrl(config.baseUrl, config);
    const url = validateApiUrl(new URL(value.replace(/^\/+/, ''), `${config.baseUrl.replace(/\/+$/, '')}/`).toString(), config);
    if (url.origin !== base.origin) throw new RelayConfigError('模型 API 路径须与 Base URL 同源');
    return url.toString();
  } catch { throw new RelayConfigError('模型 API 路径须使用同源且不含凭据的 HTTPS 地址或本机回环地址'); }
}

class RelayError extends Error {
  constructor(message, code = 'RELAY_ERROR', details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
  }
}

class RelayConfigError extends RelayError {
  constructor(message, details = {}) { super(message, 'RELAY_CONFIG_MISSING', details); }
}

class RelayRequestError extends RelayError {
  constructor(message, details = {}) { super(message, 'RELAY_REQUEST_FAILED', details); }
}

class RelayPermissionError extends RelayError {
  constructor(message, details = {}) { super(message, 'RELAY_PERMISSION_DENIED', details); }
}

function unwrap(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  if (payload.data && typeof payload.data === 'object') return payload.data;
  return payload;
}

function normalizeCatalog(payload) {
  const raw = unwrap(payload) || {};
  const workflows = Array.isArray(raw) ? raw : (Array.isArray(raw.workflows) ? raw.workflows : []);
  const normalized = workflows.map(item => {
    if (!item || typeof item !== 'object') return item;
    const result = { ...item };
    if (Array.isArray(result.providers)) result.providers = result.providers.map(normalizeProviderId);
    return result;
  });
  return { version: raw.version || '', workflows: clone(normalized), source: 'remote', raw: clone(payload) };
}

function normalizeEntitlement(payload) {
  const raw = unwrap(payload) || {};
  const providerSource = raw.providers || raw.models || {};
  const providers = Array.isArray(providerSource)
    ? providerSource.map(normalizeProviderId)
    : Object.fromEntries(Object.entries(providerSource).map(([key, value]) => [normalizeProviderId(key), value]));
  const workflows = raw.workflows || raw.workflowPermissions || {};
  return {
    accountId: raw.accountId || raw.account || '',
    active: raw.active !== false && raw.enabled !== false,
    accessFull: raw.accessFull === true || raw.fullAccess === true || raw.access === 'full',
    providers: clone(providers),
    workflows: clone(workflows),
    source: 'remote',
    raw: clone(payload)
  };
}

function normalizeUsage(payload) {
  const raw = unwrap(payload) || {};
  const quota = raw.quota && typeof raw.quota === 'object' ? raw.quota : {};
  const balance = numberOrNull(raw.balance ?? quota.balance);
  const remainingValue = numberOrNull(raw.remaining ?? quota.remaining);
  const remaining = remainingValue !== null
    ? remainingValue
    : (balance !== null ? balance : null);
  const used = numberOrNull(raw.used ?? quota.used);
  const active = raw.is_active ?? raw.active ?? quota.is_active ?? quota.active;
  return { balance, remaining, used, active: typeof active === 'boolean' ? active : null, unit: raw.unit || quota.unit || 'USD', source: 'remote', raw: clone(payload) };
}

function hasPermission(container, id) {
  if (Array.isArray(container)) return container.includes(id);
  if (container && typeof container === 'object') return container[id] === true || container[id]?.enabled === true;
  return false;
}

class RelayAdapter {
  constructor(config = {}) {
    this.config = normalizeConfig(config);
    this._sequence = 0;
  }

  reconfigure(config = {}) {
    this.config = normalizeConfig(config);
    return this.status();
  }

  status() {
    const missing = missingConfig(this.config);
    const preview = this.config.mode === PREVIEW_MODE;
    return {
      mode: this.config.mode,
      preview,
      configured: preview || missing.length === 0,
      ready: preview || missing.length === 0,
      reason: preview ? 'preview' : (missing.length ? '缺少显式中转配置' : 'ready'),
      missing,
      baseUrl: this._redact(this.config.baseUrl),
      endpoints: Object.fromEntries(Object.entries(this.config.endpoints).map(([key, value]) => [key, this._publicEndpoint(value)])),
      wireApi: this.config.wireApi,
      openaiCompatible: this.config.mode === OPENAI_MODE,
      providers: Object.keys(PROVIDER_PRESETS),
      streaming: false
    };
  }

  providerPresets() { return clone(Object.values(PROVIDER_PRESETS)); }

  providers() { return this.providerPresets(); }

  getProviderPreset(providerId) {
    const id = resolveProviderId(providerId);
    return clone(PROVIDER_PRESETS[id]);
  }

  async catalog() {
    if (this.config.mode === PREVIEW_MODE) return clone(MOCK_CATALOG);
    if (this.config.mode === OPENAI_MODE) {
      if (this.config.workflowPath) return this._normalizeOpenCatalog(await this._requestOpenAI(this.config.workflowPath));
      const models = await this.models();
      return this._catalogFromModels(models);
    }
    return normalizeCatalog(await this._request('catalog', { method: 'GET' }));
  }

  async getCatalog() { return this.catalog(); }

  async entitlement(options = {}) {
    if (this.config.mode === PREVIEW_MODE) return clone(MOCK_ENTITLEMENT);
    if (this.config.mode === OPENAI_MODE) {
      if (this.config.entitlementPath) return normalizeEntitlement(await this._requestOpenAI(this.config.entitlementPath));
      const models = await this.models();
      const providers = Object.fromEntries(this._modelIds(models).map(id => [id, true]));
      return { accountId: '', active: null, accessFull: null, providers, workflows: {}, source: 'models', models: clone(models) };
    }
    return normalizeEntitlement(await this._request('entitlement', { method: 'GET', accountId: options.accountId }));
  }

  async getEntitlement(options = {}) { return this.entitlement(options); }

  async usage(options = {}) {
    if (this.config.mode === PREVIEW_MODE) return clone(MOCK_USAGE);
    if (this.config.mode === OPENAI_MODE) {
      if (this.config.usagePath) return { ...normalizeUsage(await this._requestOpenAI(this.config.usagePath)), source: 'openai' };
      return { balance: null, remaining: null, used: null, active: null, unit: 'service', source: 'openai' };
    }
    return normalizeUsage(await this._request('usage', { method: 'GET', accountId: options.accountId }));
  }

  async getUsage(options = {}) { return this.usage(options); }

  async preflight({ providerId, modelId, model, workflowId = 'coldcoffee-default', estimatedUnits = 1, requireFullAccess = true } = {}) {
    if (this.config.mode === OPENAI_MODE) return this._preflightOpenAI({ providerId, modelId: modelId ?? model, workflowId, estimatedUnits, requireFullAccess });
    const errors = [];
    const warnings = [];
    let provider;
    try { provider = this.getProviderPreset(providerId); } catch (error) {
      errors.push({ code: error.code || 'UNKNOWN_PROVIDER', message: error.message });
    }
    if (!Number.isFinite(Number(estimatedUnits)) || Number(estimatedUnits) <= 0) {
      errors.push({ code: 'INVALID_ESTIMATE', message: '预计消耗必须是正数' });
    }
    if (this.config.mode === REMOTE_MODE && missingConfig(this.config).length) {
      return { ok: false, errors: [{ code: 'RELAY_CONFIG_MISSING', message: '请先配置冷咖啡中转地址和四个接口路径' }], warnings, provider, workflowId, estimatedUnits };
    }
    if (errors.length) return { ok: false, errors, warnings, provider, workflowId, estimatedUnits };
    const [catalog, entitlement, usage] = await Promise.all([this.catalog(), this.entitlement(), this.usage()]);
    const workflow = (catalog.workflows || []).find(item => item && item.id === workflowId);
    if (!workflow) errors.push({ code: 'WORKFLOW_NOT_FOUND', message: `工作流不可用：${workflowId}` });
    if (entitlement.active === false) errors.push({ code: 'ACCOUNT_INACTIVE', message: '中转账号未启用' });
    if (requireFullAccess && entitlement.accessFull !== true) errors.push({ code: 'FULL_ACCESS_REQUIRED', message: '当前账号未开通完整访问权限' });
    if (provider && workflow && Array.isArray(workflow.providers) && !workflow.providers.includes(provider.id)) {
      errors.push({ code: 'PROVIDER_UNSUPPORTED', message: `${provider.label} 不支持此工作流` });
    }
    if (provider && entitlement.providers && !hasPermission(entitlement.providers, provider.id)) {
      errors.push({ code: 'PROVIDER_NOT_ENTITLED', message: `当前账号未开通 ${provider.label}` });
    }
    if (entitlement.workflows && !hasPermission(entitlement.workflows, workflowId)) {
      errors.push({ code: 'WORKFLOW_NOT_ENTITLED', message: '当前账号未开通此工作流' });
    }
    this._checkUsage(usage, errors, warnings);
    return { ok: errors.length === 0, errors, warnings, provider, workflow, entitlement, usage, workflowId, estimatedUnits: Number(estimatedUnits) };
  }

  async checkPermission(options = {}) { return this.preflight(options); }

  async submit(task = {}) {
    if (this.config.mode === OPENAI_MODE) return this._submitOpenAI(task);
    const input = task && typeof task === 'object' ? task : {};
    const preflight = await this.preflight(input);
    if (!preflight.ok) throw new RelayPermissionError(preflight.errors.map(item => item.message).join('；'), { preflight });
    const body = {
      workflowId: preflight.workflowId,
      providerId: preflight.provider.id,
      preset: clone(preflight.provider),
      goal: typeof input.goal === 'string' ? input.goal : '',
      context: typeof input.context === 'string' ? input.context : '',
      constraints: typeof input.constraints === 'string' ? input.constraints : '',
      outputFormat: input.outputFormat || 'markdown',
      estimatedUnits: preflight.estimatedUnits
    };
    if (this.config.mode === PREVIEW_MODE) {
      this._sequence += 1;
      return { taskId: `preview-${String(this._sequence).padStart(4, '0')}`, status: 'queued', mode: 'preview', workflowId: body.workflowId, providerId: body.providerId, preset: body.preset, request: body };
    }
    return this._request('submit', { method: 'POST', body });
  }

  async run(task = {}) { return this.submit(task); }

  async models() {
    if (this.config.mode === PREVIEW_MODE) return clone({ object: 'list', data: Object.values(PROVIDER_PRESETS).map(item => ({ id: item.model, object: 'model' })), source: 'preview' });
    if (this.config.mode !== OPENAI_MODE) throw new RelayConfigError('models() 只适用于 OpenAI 兼容模式');
    const payload = await this._requestOpenAI(this.config.modelsPath, { method: 'GET' });
    this._modelIds(payload);
    return payload;
  }

  async testConnection() {
    if (this.config.mode === PREVIEW_MODE) return { ok: true, preview: true, models: await this.models() };
    if (this.config.mode !== OPENAI_MODE) throw new RelayConfigError('连接测试需要 OpenAI 兼容模式');
    const models = await this.models();
    return { ok: true, preview: false, models: clone(models), baseUrl: this.config.baseUrl };
  }

  _modelIds(models) {
    const data = Array.isArray(models) ? models : models?.data;
    if (!Array.isArray(data) || !data.length || data.some(item => {
      const id = typeof item === 'string' ? item : item?.id;
      return typeof id !== 'string' || !id.trim() || id !== id.trim();
    })) {
      throw new RelayRequestError('模型接口未返回有效的非空模型列表', { path: this.config.modelsPath, reason: 'INVALID_MODEL_LIST' });
    }
    return [...new Set(data.map(item => typeof item === 'string' ? item : item.id))];
  }

  _modelListHasProvider(models, providerId) {
    return this._modelIds(models).includes(PROVIDER_PRESETS[providerId]?.model || providerId);
  }

  _modelIdForProvider(models, providerId) {
    const id = PROVIDER_PRESETS[providerId]?.model || providerId;
    return this._modelIds(models).includes(id) ? id : null;
  }

  _catalogFromModels(models) {
    const available = this._modelIds(models);
    // The models API verifies model IDs only. These workflow details are local
    // product copy, not a catalog or entitlement returned by that endpoint.
    const workflows = [{
      id: 'coldcoffee-default', name: '冷咖啡内置工作流介绍', visibility: 'product', version: '',
      providers: available, availableProviders: available, status: 'unverified',
      serverManaged: null, unitCost: null,
      description: '工作流由中转服务配置；模型列表接口未返回工作流目录或启用状态。'
    }];
    return { version: '', workflows, source: 'product', serverManaged: null, verified: false, models: clone(models) };
  }

  _normalizeOpenCatalog(payload) {
    const result = normalizeCatalog(payload);
    return { ...result, source: 'remote', verified: true };
  }

  _checkUsage(usage, errors, warnings) {
    if (usage.active === false) errors.push({ code: 'ACCOUNT_INACTIVE', message: '当前 API Key 未处于可用状态' });
    const remaining = numberOrNull(usage.remaining);
    if (remaining !== null && remaining <= 0) {
      errors.push({ code: 'INSUFFICIENT_BALANCE', message: '服务端返回可用余额已耗尽' });
    } else if (remaining === null) {
      warnings.push({ code: 'USAGE_UNAVAILABLE', message: '服务端未返回可用余额，费用和余额以实际请求及中转站记录为准' });
    }
  }

  async _preflightOpenAI({ providerId, modelId, workflowId = 'coldcoffee-default', estimatedUnits = 1, requireFullAccess = true } = {}) {
    const errors = [], warnings = [];
    // Explicit model IDs are case-sensitive server values. Only legacy preset
    // selections receive alias normalization; never infer entitlement by substring.
    const selectedModel = text(modelId) || normalizeProviderId(providerId || 'gpt-6-astra');
    const known = Object.values(PROVIDER_PRESETS).find(item => item.model === selectedModel);
    const provider = known ? clone(known) : {
      id: selectedModel, model: selectedModel, label: selectedModel,
      preset: 'server-default', reasoning: null, streaming: false
    };
    if (!Number.isFinite(Number(estimatedUnits)) || Number(estimatedUnits) <= 0) errors.push({ code: 'INVALID_ESTIMATE', message: '预计消耗必须是正数' });
    const missing = missingConfig(this.config);
    if (missing.length) return { ok: false, errors: [{ code: 'RELAY_CONFIG_MISSING', message: `请填写冷咖啡 API 地址和 API Key（缺少：${missing.join('、')}）` }], warnings, provider, workflowId, estimatedUnits };
    let models;
    try { models = await this.models(); }
    catch (error) { return { ok: false, errors: [{ code: error.code || 'RELAY_REQUEST_FAILED', message: this._redact(error.message) }], warnings, provider, workflowId, estimatedUnits }; }
    if (!this._modelIds(models).includes(selectedModel)) errors.push({ code: 'PROVIDER_NOT_ENTITLED', message: `API 模型列表未包含 ${selectedModel}，请从服务端列表选择模型` });
    if (requireFullAccess) warnings.push({ code: 'FULL_ACCESS_UNVERIFIED', message: '模型列表未确认工作流和工具权限；Codex 完全访问在客户端设置，模型请求以服务端响应为准' });
    let usage = { remaining: null, used: null, unit: 'USD', active: null, source: 'openai' };
    try { usage = await this.usage(); }
    catch (error) { warnings.push({ code: 'USAGE_REQUEST_FAILED', message: this._redact(error.message) }); }
    this._checkUsage(usage, errors, warnings);
    const catalog = this._catalogFromModels(models);
    const workflow = catalog.workflows[0];
    if (workflowId !== workflow.id && !this.config.workflowPath) errors.push({ code: 'WORKFLOW_UNVERIFIED', message: '当前仅配置了模型 API，请使用中转默认工作流' });
    return { ok: errors.length === 0, errors, warnings, provider, workflow, entitlement: { active: null, accessFull: null, source: 'models' }, usage, workflowId, estimatedUnits: Number(estimatedUnits), models: clone(models) };
  }

  async _submitOpenAI(task = {}) {
    const input = task && typeof task === 'object' ? task : {};
    if (input.stream === true) throw new RelayConfigError('当前客户端使用完整响应模式，请设置 stream: false', { streaming: false });
    const preflight = await this._preflightOpenAI({ providerId: input.providerId, modelId: input.modelId ?? input.model, workflowId: input.workflowId || 'coldcoffee-default', estimatedUnits: input.estimatedUnits ?? 1, requireFullAccess: input.requireFullAccess !== false });
    if (!preflight.ok) throw new RelayPermissionError(preflight.errors.map(item => item.message).join('；'), { preflight });
    const formatHints = { markdown: '使用 Markdown 输出。', json: '仅输出有效 JSON。', code: '以带语言标识的代码围栏输出代码，并附运行说明。' };
    const prompt = [input.goal, input.context && `背景：${input.context}`, input.constraints && `约束与验收：${input.constraints}`, formatHints[input.outputFormat]].filter(Boolean).join('\n\n');
    const body = { model: preflight.provider.model, input: prompt || '请按冷咖啡中转内置工作流处理当前任务。', stream: false, metadata: { workflow: preflight.workflowId, preset: preflight.provider.preset } };
    if (preflight.provider.reasoning) body.reasoning = { effort: preflight.provider.reasoning };
    const chatBody = { model: body.model, messages: [{ role: 'user', content: body.input }], stream: false, metadata: body.metadata };
    let response, responseApi = this.config.wireApi === 'chat' ? 'chat' : 'responses';
    if (responseApi === 'chat') response = await this._requestOpenAI(this.config.chatCompletionsPath, { method: 'POST', body: chatBody });
    else if (this.config.wireApi === 'responses') response = await this._requestOpenAI(this.config.responsesPath, { method: 'POST', body });
    else {
      try { response = await this._requestOpenAI(this.config.responsesPath, { method: 'POST', body }); }
      catch (error) {
        if (![404, 405].includes(error.details?.status)) throw error;
        responseApi = 'chat';
        response = await this._requestOpenAI(this.config.chatCompletionsPath, { method: 'POST', body: chatBody });
      }
    }
    if (response?.error) {
      throw new RelayRequestError(`模型返回错误：${this._redact(response.error.message || response.error.code || '未提供错误说明')}`, { status: response.status || 'failed' });
    }
    if (responseApi === 'responses') {
      if (response?.status !== 'completed') {
        const status = typeof response?.status === 'string' ? response.status : 'unknown';
        const reason = response?.incomplete_details?.reason;
        throw new RelayRequestError(`模型响应未完成：${this._redact(status)}${reason ? `（${this._redact(reason)}）` : ''}`, { status: this._redact(status), reason: this._redact(reason || '') });
      }
      if (!Array.isArray(response.output)) throw new RelayRequestError('模型响应缺少有效的 output 数组', { status: 'invalid_response' });
    } else {
      const choice = response?.choices?.[0];
      if (!choice || !['stop', 'tool_calls', 'function_call'].includes(choice.finish_reason)) {
        throw new RelayRequestError(`模型响应未完成：${this._redact(choice?.finish_reason || 'unknown')}`, { status: 'incomplete' });
      }
    }
    return { mode: 'openai', status: 'completed', providerId: preflight.provider.id, workflowId: preflight.workflowId, response, preset: clone(preflight.provider) };
  }

  _redact(value) {
    let message = typeof value === 'string' ? value : String(value ?? '');
    if (this.config.authToken) {
      for (const secret of new Set([this.config.authToken, encodeURIComponent(this.config.authToken)])) {
        message = message.split(secret).join('[REDACTED]');
      }
    }
    return message;
  }

  _publicEndpoint(value) {
    try {
      const url = validateApiUrl(new URL(value, `${this.config.baseUrl}/`).toString(), this.config);
      if (url.origin !== new URL(this.config.baseUrl).origin) return '[INVALID_ENDPOINT]';
      return this._redact(value);
    } catch { return '[INVALID_ENDPOINT]'; }
  }

  _redactPayload(value) {
    // A server can echo a submitted credential even in a successful JSON body.
    // Redact before crossing IPC or populating result/history/export controls.
    if (typeof value === 'string') return this._redact(value);
    if (Array.isArray(value)) return value.map(item => this._redactPayload(item));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [this._redact(key), this._redactPayload(item)]));
    return value;
  }

  async _request(endpoint, { method = 'GET', body, accountId } = {}) {
    if (this.config.mode !== REMOTE_MODE) throw new RelayConfigError('预览模式不发起真实中转请求');
    const missing = missingConfig(this.config);
    if (missing.length) throw new RelayConfigError(`缺少显式中转配置：${missing.join(', ')}`, { missing });
    let url = endpointUrl(this.config, endpoint);
    if (accountId) {
      const parsed = new URL(url);
      parsed.searchParams.set('accountId', String(accountId));
      url = parsed.toString();
    }
    const headers = { Accept: 'application/json', ...this.config.headers };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.config.authToken) headers.Authorization = `Bearer ${this.config.authToken}`;
    const transport = this.config.transport || globalThis.fetch;
    if (typeof transport !== 'function') throw new RelayConfigError('未提供中转 transport/fetch');
    let response;
    try {
      response = await transport(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error' });
    } catch (error) {
      throw new RelayRequestError(`中转请求失败：${this._redact(error.message)}`, { endpoint });
    }
    if (response?.redirected || (response?.status >= 300 && response?.status < 400)) {
      throw new RelayRequestError('中转接口返回重定向，请填写最终接口地址', { endpoint, status: response.status });
    }
    if (response && response.ok === false) {
      throw new RelayRequestError(`中转返回 HTTP ${response.status || '错误'}`, { endpoint, status: response.status });
    }
    try {
      if (response && typeof response.json === 'function') return this._redactPayload(await response.json());
      return this._redactPayload(response);
    } catch (error) {
      throw new RelayRequestError(`中转响应不是有效 JSON：${this._redact(error.message)}`, { endpoint });
    }
  }

  async _requestOpenAI(path, { method = 'GET', body } = {}) {
    if (this.config.mode !== OPENAI_MODE) throw new RelayConfigError('当前不是 OpenAI 兼容模式');
    const missing = missingConfig(this.config);
    if (missing.length) throw new RelayConfigError(`缺少冷咖啡 API 配置：${missing.join(', ')}`, { missing });
    const url = openaiEndpointUrl(this.config, path);
    const safePath = this._redact(path);
    const headers = { Accept: 'application/json', ...this.config.headers, Authorization: `Bearer ${this.config.authToken}` };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const transport = this.config.transport || globalThis.fetch;
    if (typeof transport !== 'function') throw new RelayConfigError('未提供中转 transport/fetch');
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new RelayRequestError('冷咖啡 API 请求超时', { path: safePath, timeout: true }));
      }, this.config.timeoutMs);
    });
    try {
      return await Promise.race([timeout, (async () => {
        const response = await transport(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal, redirect: 'error' });
        if (response?.redirected || (response?.status >= 300 && response?.status < 400)) throw new RelayRequestError('API 返回重定向，请填写最终 API 地址', { path: safePath, status: response.status });
        let payload;
        try { payload = response && typeof response.json === 'function' ? await response.json() : response; }
        catch (error) {
          if (response?.ok === false) throw new RelayRequestError(`冷咖啡 API 返回 HTTP ${response.status || '错误'}`, { path: safePath, status: response.status });
          throw new RelayRequestError(`冷咖啡 API 响应不是有效 JSON：${this._redact(error.message)}`, { path: safePath });
        }
        if (response?.ok === false) {
          const detail = this._redact(payload?.error?.message || payload?.message || '');
          throw new RelayRequestError(`冷咖啡 API 返回 HTTP ${response.status || '错误'}${detail ? `：${detail}` : ''}`, { path: safePath, status: response.status });
        }
        if (payload?.error) throw new RelayRequestError(`冷咖啡 API 返回错误：${this._redact(payload.error.message || payload.error.code || '未知错误')}`, { path: safePath });
        return this._redactPayload(payload);
      })()]);
    } catch (error) {
      if (error instanceof RelayError) throw error;
      throw new RelayRequestError(`冷咖啡 API 请求失败：${error.name === 'AbortError' ? '请求超时' : this._redact(error.message)}`, { path: safePath });
    } finally { clearTimeout(timer); }
  }

}

module.exports = {
  ENDPOINT_KEYS,
  OPENAI_MODE,
  RELAY_CONFIG_SCHEMA,
  RELAY_CONTRACT,
  PROVIDER_PRESETS,
  PROVIDER_ALIASES,
  MOCK_CATALOG,
  MOCK_ENTITLEMENT,
  MOCK_USAGE,
  RelayAdapter,
  RelayError,
  RelayConfigError,
  RelayRequestError,
  RelayPermissionError,
  normalizeConfig,
  resolveProviderId
};
