'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  RelayAdapter,
  RelayPermissionError,
  PROVIDER_PRESETS,
  resolveProviderId
} = require('./relay-adapter');

test('默认是 preview/mock，目录、权限和额度都可查看且不发网络请求', async () => {
  let requests = 0;
  const relay = new RelayAdapter({ transport: async () => { requests += 1; } });
  assert.deepEqual(relay.status().mode, 'preview');
  assert.equal(relay.status().ready, true);
  const [catalog, entitlement, usage] = await Promise.all([
    relay.catalog(), relay.entitlement(), relay.usage()
  ]);
  assert.equal(catalog.workflows[0].id, 'coldcoffee-default');
  assert.equal(entitlement.accessFull, true);
  assert.equal(usage.remaining, 999);
  assert.equal(requests, 0);
});

test('GPT-6 Astra 与 GPT-5.6 Sol 都有冷咖啡满配预设，并兼容常见席位别名', () => {
  for (const id of ['gpt-6-astra', 'gpt-5.6-sol']) {
    const preset = new RelayAdapter().getProviderPreset(id);
    assert.equal(preset.accessLevel, 'full');
    assert.equal(preset.reasoning, 'xhigh');
    assert.equal(preset.context, 'max');
    assert.equal(preset.tools, true);
    assert.equal(preset.streaming, false);
    assert.equal(preset.preset, 'coldcoffee-full');
    assert.deepEqual(PROVIDER_PRESETS[id].id, id);
  }
  assert.equal(resolveProviderId('gpt6-astra'), 'gpt-6-astra');
  assert.equal(resolveProviderId('gpt56-sol'), 'gpt-5.6-sol');
});

test('remote 模式缺少地址或接口时只返回缺配置状态，不猜路径也不发请求', async () => {
  let requests = 0;
  const relay = new RelayAdapter({ mode: 'remote', transport: async () => { requests += 1; } });
  const state = relay.status();
  assert.equal(state.mode, 'remote');
  assert.equal(state.ready, false);
  assert.ok(state.missing.includes('baseUrl'));
  assert.ok(state.missing.includes('endpoints.catalog'));
  const result = await relay.preflight({ providerId: 'gpt6-astra' });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, 'RELAY_CONFIG_MISSING');
  assert.equal(requests, 0);
});

function remoteFixture({ accessFull = true, remaining = 10 } = {}) {
  const calls = [];
  const transport = async (url, init) => {
    calls.push({ url, init });
    const route = new URL(url).pathname;
    const payload = route.endsWith('/catalog')
      ? { version: '2026.09', workflows: [{ id: 'wf-code', name: '代码工作流', providers: ['gpt-6-astra'], version: '1.2.0' }] }
      : route.endsWith('/entitlements')
        ? { accountId: 'acct-1', active: true, accessFull, providers: { 'gpt-6-astra': true }, workflows: { 'wf-code': true } }
        : route.endsWith('/usage')
          ? { balance: remaining, remaining, used: 2, unit: 'credits' }
          : { taskId: 'task-remote-1', status: 'queued' };
    return { ok: true, status: 200, json: async () => payload };
  };
  return { calls, transport };
}

function remoteConfig(transport) {
  return {
    mode: 'remote',
    baseUrl: 'https://relay.example.test/api',
    endpoints: { catalog: 'catalog', entitlement: 'entitlements', usage: 'usage', submit: 'tasks' },
    authToken: 'TOKEN_FIXTURE',
    transport
  };
}

test('显式远程接口配置后，预检查会验证完整访问、席位和额度', async () => {
  const fixture = remoteFixture({ accessFull: true, remaining: 8 });
  const relay = new RelayAdapter(remoteConfig(fixture.transport));
  const result = await relay.preflight({ providerId: 'gpt-6-astra', workflowId: 'wf-code', estimatedUnits: 3 });
  assert.equal(result.ok, true);
  assert.equal(result.provider.id, 'gpt-6-astra');
  assert.equal(result.usage.remaining, 8);
  assert.equal(fixture.calls.length, 3);
  assert.ok(fixture.calls.every(call => call.init.headers.Authorization === 'Bearer TOKEN_FIXTURE'));
});

test('权限不足时预检查给出可读错误，提交不会发起任务写入', async () => {
  const fixture = remoteFixture({ accessFull: false, remaining: 8 });
  const relay = new RelayAdapter(remoteConfig(fixture.transport));
  const result = await relay.preflight({ providerId: 'gpt-6-astra', workflowId: 'wf-code', estimatedUnits: 1 });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.code === 'FULL_ACCESS_REQUIRED'));
  await assert.rejects(
    () => relay.submit({ providerId: 'gpt-6-astra', workflowId: 'wf-code', goal: 'fixture' }),
    error => error instanceof RelayPermissionError && error.details.preflight.ok === false
  );
  assert.equal(fixture.calls.length, 6, 'submit 只重复预检，不应调用 tasks 接口');
  assert.equal(fixture.calls.some(call => new URL(call.url).pathname.endsWith('/tasks')), false);
});

test('远程成功提交沿用满配预设，并只请求显式 submit 路径', async () => {
  const fixture = remoteFixture({ accessFull: true, remaining: 8 });
  const relay = new RelayAdapter(remoteConfig(fixture.transport));
  const result = await relay.submit({ providerId: 'gpt6-astra', workflowId: 'wf-code', goal: '写一个小工具' });
  assert.equal(result.taskId, 'task-remote-1');
  const taskCall = fixture.calls.find(call => new URL(call.url).pathname.endsWith('/tasks'));
  assert.ok(taskCall);
  const body = JSON.parse(taskCall.init.body);
  assert.equal(body.providerId, 'gpt-6-astra');
  assert.equal(body.preset.accessLevel, 'full');
  assert.equal(body.goal, '写一个小工具');
});

test('OpenAI 兼容模式使用冷咖啡 /models，并携带 Bearer API Key', async () => {
  const calls = [];
  const transport = async (url, init) => {
    calls.push({ url, init });
    assert.equal(new URL(url).pathname, '/v1/models');
    assert.equal(init.headers.Authorization, 'Bearer KEY_FIXTURE');
    return { ok: true, status: 200, json: async () => ({ object: 'list', data: [{ id: 'gpt-6-astra' }, { id: 'gpt-5.6-sol' }] }) };
  };
  const relay = new RelayAdapter({ mode: 'openai', baseUrl: 'https://coldcoffeeai.com/v1', authToken: 'KEY_FIXTURE', transport });
  const result = await relay.testConnection();
  assert.equal(result.ok, true);
  assert.equal(result.models.data.length, 2);
  assert.equal(calls.length, 1);
});

test('OpenAI 兼容模式提交 Responses 请求并保留服务端工作流元数据', async () => {
  const calls = [];
  const transport = async (url, init) => {
    calls.push({ url, init });
    const path = new URL(url).pathname;
    if (path.endsWith('/models')) return { ok: true, status: 200, json: async () => ({ data: [{ id: 'gpt-6-astra' }] }) };
    if (path.endsWith('/usage')) return { ok: true, status: 200, json: async () => ({ remaining: 12, used: 1, unit: 'USD', is_active: true }) };
    assert.equal(path, '/v1/responses');
    const body = JSON.parse(init.body);
    assert.equal(body.model, 'gpt-6-astra');
    assert.equal(body.reasoning.effort, 'xhigh');
    assert.equal(body.metadata.workflow, 'coldcoffee-default');
    return { ok: true, status: 200, json: async () => ({ id: 'resp_fixture', status: 'completed', output: [] }) };
  };
  const relay = new RelayAdapter({ mode: 'openai', baseUrl: 'https://coldcoffeeai.com/v1', authToken: 'KEY_FIXTURE', transport });
  const result = await relay.submit({ providerId: 'gpt-6-astra', goal: 'fixture task' });
  assert.equal(result.status, 'completed');
  assert.equal(result.response.id, 'resp_fixture');
  assert.equal(calls.filter(item => new URL(item.url).pathname.endsWith('/models')).length, 1);
  assert.equal(calls.filter(item => new URL(item.url).pathname.endsWith('/usage')).length, 1);
});

test('用户显式选择服务端的版本化模型 ID 才提交该模型', async () => {
  const calls = [];
  const transport = async (url, init) => {
    calls.push({ url, init });
    const path = new URL(url).pathname;
    if (path.endsWith('/models')) return { ok: true, status: 200, json: async () => ({ data: [{ id: 'gpt-6-astra-2026-09-01' }] }) };
    if (path.endsWith('/usage')) return { ok: true, status: 200, json: async () => ({ quota: { remaining: 5, unit: 'USD' }, is_active: true }) };
    const body = JSON.parse(init.body);
    assert.equal(path, '/v1/responses');
    assert.equal(body.model, 'gpt-6-astra-2026-09-01');
    return { ok: true, status: 200, json: async () => ({ id: 'resp_versioned', status: 'completed', output: [] }) };
  };
  const relay = new RelayAdapter({ mode: 'openai', baseUrl: 'https://coldcoffeeai.com/v1', authToken: 'KEY_FIXTURE', transport });
  const result = await relay.submit({ modelId: 'gpt-6-astra-2026-09-01', goal: 'fixture task' });
  assert.equal(result.response.id, 'resp_versioned');
});

test('OpenAI 兼容模式的鉴权错误不会回显 API Key', async () => {
  const secret = 'FIXTURE_ONLY_NOT_A_REAL_KEY_123'; // gitleaks:allow — synthetic test key
  const transport = async () => ({
    ok: false,
    status: 401,
    json: async () => ({ code: 'INVALID_API_KEY', message: `Invalid API key ${secret}` })
  });
  const relay = new RelayAdapter({ mode: 'openai', baseUrl: 'https://coldcoffeeai.com/v1', authToken: secret, transport });
  await assert.rejects(() => relay.testConnection(), error => {
    assert.equal(error.code, 'RELAY_REQUEST_FAILED');
    assert.match(error.message, /HTTP 401/);
    assert.doesNotMatch(error.message, new RegExp(secret));
    return true;
  });
});


function openaiFixture({ models = { data: [{ id: 'gpt-6-astra' }] }, usage = {}, response, failUsage = false } = {}) {
  const calls = [];
  const transport = async (url, init) => {
    calls.push({ url, init });
    const path = new URL(url).pathname;
    if (path.endsWith('/models')) return { ok: true, status: 200, json: async () => models };
    if (path.endsWith('/usage')) {
      if (failUsage) throw new Error('usage unavailable');
      return { ok: true, status: 200, json: async () => usage };
    }
    return { ok: true, status: 200, json: async () => response || { id: 'resp_test', status: 'completed', output: [] } };
  };
  return { calls, relay: new RelayAdapter({ mode: 'openai', baseUrl: 'https://relay.example.test/v1', authToken: 'TOKEN_FIXTURE', transport }) };
}

test('空模型列表、非模型 JSON 与无效条目均不算连接成功', async () => {
  for (const models of [{}, { data: [] }, { data: [{ name: 'gpt-6-astra' }] }, { data: [{ id: 'gpt-6-astra' }, null] }]) {
    const { relay } = openaiFixture({ models });
    await assert.rejects(() => relay.testConnection(), error => error.details.reason === 'INVALID_MODEL_LIST');
  }
});

test('预检采用 exact ID，不把相似模型名视为推荐模型权限', async () => {
  for (const id of ['gpt-6-astra-2026-09-01', 'fake-6-astra-model', 'GPT-6-Astra']) {
    const { relay, calls } = openaiFixture({ models: { data: [{ id }] } });
    await assert.rejects(() => relay.submit({ providerId: 'gpt-6-astra' }), error => error.details.preflight.errors.some(item => item.code === 'PROVIDER_NOT_ENTITLED'));
    assert.equal(calls.some(call => new URL(call.url).pathname.endsWith('/responses')), false);
  }
});

test('显式 exact 自定义模型保持大小写并沿用服务端参数', async () => {
  const { relay, calls } = openaiFixture({ models: { data: [{ id: 'Customer/Model-V2' }] } });
  const result = await relay.submit({ modelId: 'Customer/Model-V2', goal: 'fixture' });
  assert.equal(result.providerId, 'Customer/Model-V2');
  const body = JSON.parse(calls.find(call => call.init.method === 'POST').init.body);
  assert.equal(body.model, 'Customer/Model-V2');
  assert.equal(body.reasoning, undefined);
  assert.equal(body.stream, false);
});

test('缺失、空值和不可用用量只产生警告，小额美元余额不与任务数比较', async () => {
  for (const usage of [{}, { remaining: null }, { remaining: '' }, { remaining: false }, { remaining: 'bad' }, { remaining: 0.02, unit: 'USD' }]) {
    const { relay } = openaiFixture({ usage });
    const result = await relay.preflight({ providerId: 'gpt-6-astra', estimatedUnits: 20 });
    assert.equal(result.ok, true, JSON.stringify(usage));
    if (usage.remaining !== 0.02) assert.ok(result.warnings.some(item => item.code === 'USAGE_UNAVAILABLE'));
  }
  const { relay } = openaiFixture({ failUsage: true });
  assert.equal((await relay.preflight({ providerId: 'gpt-6-astra' })).ok, true);
});

test('明确余额耗尽或 API Key 停用会阻止提交', async () => {
  for (const usage of [{ remaining: 0 }, { balance: -0.01 }, { is_active: false, remaining: 50 }]) {
    const { relay, calls } = openaiFixture({ usage });
    await assert.rejects(() => relay.submit({ providerId: 'gpt-6-astra' }), error => error instanceof RelayPermissionError);
    assert.equal(calls.some(call => call.init.method === 'POST'), false);
  }
});

test('自定义 remote 模式也不把 null 用量当成零', async () => {
  const fixture = remoteFixture({ remaining: null });
  const result = await new RelayAdapter(remoteConfig(fixture.transport)).preflight({ providerId: 'gpt-6-astra', workflowId: 'wf-code' });
  assert.equal(result.ok, true);
  assert.equal(result.usage.remaining, null);
  assert.ok(result.warnings.some(item => item.code === 'USAGE_UNAVAILABLE'));
});

test('默认工作流目录标注产品介绍且模型列表不授予完全访问和工作流权限', async () => {
  const { relay } = openaiFixture();
  const catalog = await relay.catalog();
  assert.equal(catalog.source, 'product');
  assert.equal(catalog.verified, false);
  assert.equal(catalog.workflows[0].status, 'unverified');
  assert.equal(catalog.workflows[0].serverManaged, null);
  const entitlement = await relay.entitlement();
  assert.equal(entitlement.accessFull, null);
  assert.equal(entitlement.active, null);
  assert.deepEqual(entitlement.workflows, {});
});

test('Responses 的失败、未完成、排队及缺失状态均不返回 completed', async () => {
  for (const response of [
    { status: 'failed', error: { message: 'provider failed' } },
    { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [] },
    { status: 'queued', output: [] }, { id: 'no_status', output: [] },
    { status: 'completed' }
  ]) {
    const { relay } = openaiFixture({ response });
    await assert.rejects(() => relay.submit({ providerId: 'gpt-6-astra' }), error => error.code === 'RELAY_REQUEST_FAILED');
  }
});

test('stream:true 在网络请求前明确报错，状态声明非流式支持', async () => {
  const { relay, calls } = openaiFixture();
  assert.equal(relay.status().streaming, false);
  await assert.rejects(() => relay.submit({ providerId: 'gpt-6-astra', stream: true }), error => error.details.streaming === false);
  assert.equal(calls.length, 0);
});

test('超时覆盖读取响应体，包括忽略 AbortSignal 的 transport', async () => {
  let signal;
  const relay = new RelayAdapter({
    mode: 'openai', baseUrl: 'https://relay.example.test/v1', authToken: 'TOKEN_FIXTURE', timeoutMs: 1000,
    transport: async (_, init) => {
      signal = init.signal;
      return { ok: true, status: 200, json: () => new Promise(() => {}) };
    }
  });
  await assert.rejects(() => relay.testConnection(), error => error.details.timeout === true);
  assert.equal(signal.aborted, true);
});

test('鉴权请求禁止自动重定向与跨域 API 路径', async () => {
  let calls = 0;
  const transport = async (_, init) => {
    calls += 1;
    assert.equal(init.redirect, 'error');
    return { ok: false, status: 302, json: async () => ({}) };
  };
  const relay = new RelayAdapter({ mode: 'openai', baseUrl: 'https://relay.example.test/v1', authToken: 'TOKEN_FIXTURE', transport });
  await assert.rejects(() => relay.testConnection(), error => error.details.status === 302);
  relay.reconfigure({ mode: 'openai', baseUrl: 'https://relay.example.test/v1', modelsPath: 'https://other.example.test/models', authToken: 'TOKEN_FIXTURE', transport });
  await assert.rejects(() => relay.testConnection(), error => error.code === 'RELAY_CONFIG_MISSING');
  assert.equal(calls, 1);
});

test('网络异常与服务端 200 错误消息中的 Key 都会脱敏', async () => {
  const secret = 'TOKEN_FIXTURE_PRIVATE';
  for (const transport of [
    async () => { throw new Error(`Network failure for Bearer ${secret}`); },
    async () => ({ ok: true, status: 200, json: async () => ({ error: { message: `Bad key ${secret}` } }) })
  ]) {
    const relay = new RelayAdapter({ mode: 'openai', baseUrl: 'https://relay.example.test/v1', authToken: secret, transport });
    await assert.rejects(() => relay.testConnection(), error => {
      assert.equal(JSON.stringify({ message: error.message, details: error.details }).includes(secret), false);
      assert.match(error.message, /REDACTED/);
      return true;
    });
  }
});

test('远程和兼容模式均拒绝公网明文及 URL 内凭据，且不回显输入值', () => {
  const secret = 'FIXTURE_NOT_A_REAL_KEY_42';
  for (const mode of ['remote', 'openai']) {
    for (const baseUrl of [
      'http://relay.example.test/v1', 'http://localhost.example.test/v1',
      'http://127.1/v1', 'http://2130706433/v1', 'http://127.0.0.1./v1',
      'ftp://relay.example.test/v1',
      `https://${secret}@relay.example.test/v1`,
      `https://relay.example.test/v1?key=${secret}`, `https://relay.example.test/v1#${secret}`,
      `https://relay.example.test/${secret}/v1`, `invalid ${secret}`
    ]) {
      assert.throws(() => new RelayAdapter({ mode, baseUrl, authToken: secret }), error => {
        assert.equal(error.code, 'RELAY_CONFIG_MISSING');
        assert.equal(JSON.stringify({ message: error.message, details: error.details }).includes(secret), false);
        return true;
      });
    }
  }
  for (const baseUrl of ['https://relay.example.test/v1', 'http://localhost:8080/v1', 'http://127.0.0.1:8080/v1', 'http://[::1]:8080/v1']) {
    assert.equal(new RelayAdapter({ mode: 'openai', baseUrl, authToken: secret }).status().ready, true);
  }
});

test('remote 端点禁止跨源、降级、userinfo、查询与片段凭据', async () => {
  const secret = 'FIXTURE_NOT_A_REAL_KEY_42';
  let calls = 0;
  const transport = async () => { calls++; return {}; };
  for (const endpoint of [
    'https://other.example.test/catalog', '//other.example.test/catalog',
    'http://relay.example.test/catalog', `https://${secret}@relay.example.test/catalog`,
    `catalog?key=${secret}`, `catalog#${secret}`, `catalog/${secret}`
  ]) {
    const config = remoteConfig(transport);
    config.authToken = secret;
    config.endpoints.catalog = endpoint;
    const relay = new RelayAdapter(config);
    assert.equal(JSON.stringify(relay.status()).includes(secret), false);
    await assert.rejects(() => relay.catalog(), error => {
      assert.equal(error.code, 'RELAY_CONFIG_MISSING');
      assert.equal(JSON.stringify({ message: error.message, details: error.details }).includes(secret), false);
      return true;
    });
  }
  assert.equal(calls, 0);
});

test('模型接口路径拒绝凭据与跨源，失败发生在网络请求之前', async () => {
  const secret = 'FIXTURE_NOT_A_REAL_KEY_42';
  let calls = 0;
  for (const modelsPath of [`models?key=${secret}`, `models#${secret}`, `models/${secret}`, `https://${secret}@relay.example.test/models`, 'https://other.example.test/models']) {
    const relay = new RelayAdapter({ mode: 'openai', baseUrl: 'https://relay.example.test/v1', modelsPath, authToken: secret, transport: async () => { calls++; } });
    await assert.rejects(() => relay.models(), error => {
      assert.equal(error.code, 'RELAY_CONFIG_MISSING');
      assert.equal(JSON.stringify({ message: error.message, details: error.details }).includes(secret), false);
      return true;
    });
  }
  assert.equal(calls, 0);
});

test('成功响应中回显的 Key 在 IPC、历史和导出前递归脱敏', async () => {
  const secret = 'FIXTURE_NOT_A_REAL_KEY_42';
  for (const mode of ['remote', 'openai']) {
    const payload = { remaining: 10, detail: `Bearer ${secret}`, nested: [{ [secret]: secret }] };
    const transport = async () => ({ ok: true, status: 200, json: async () => payload });
    const config = mode === 'remote' ? remoteConfig(transport) : { mode, baseUrl: 'https://relay.example.test/v1', transport };
    config.authToken = secret;
    const usage = await new RelayAdapter(config).usage();
    assert.equal(JSON.stringify(usage).includes(secret), false);
    assert.match(JSON.stringify(usage), /REDACTED/);
    assert.equal(payload.detail.includes(secret), true, '脱敏不修改 transport 原始对象');
  }
});
