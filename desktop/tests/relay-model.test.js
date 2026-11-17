"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { RelayAdapter, resolveProviderId } = require("../src/lib/relay-adapter");
const core = require("../src/shared/workbench-core");
const relayModels = require("../src/shared/relay-models");

test("Codex 显示 GPT-6.2 两款推荐型号", () => {
  assert.equal(core.SEATS.find((seat) => seat.id === "codex").tag, "GPT-6.2 Astra / Sol");
});

test("GPT-6.1 Sol 是中转预览的主模型", async () => {
  const adapter = new RelayAdapter();
  const models = await adapter.models();
  assert.deepEqual(models.data.map((item) => item.id), ["gpt-6-astra", "gpt-6.1-sol"]);
  assert.equal(adapter.getProviderPreset("gpt-6.1-sol").label, "GPT-6.1 Sol");
});

test("旧 Sol 配置别名归一化到 GPT-6.1 Sol", async () => {
  assert.equal(resolveProviderId("gpt-5.6-sol"), "gpt-6.1-sol");
  assert.equal(resolveProviderId("gpt6.1sol"), "gpt-6.1-sol");
  const result = await new RelayAdapter().preflight({ providerId: "gpt-5.6-sol" });
  assert.equal(result.ok, true);
  assert.equal(result.provider.model, "gpt-6.1-sol");
});

test("GPT-6.2 展示名和回退顺序依据目录，已有选择及路由组保持原值", () => {
  const custom = { id: "other/Namespace/Model-V7", name: "原服务商的模型名字" };
  const sol = { id: "other/GPT6.2-Sol", name: "GPT6.2-Sol" };
  const astra = { id: "coldcoffee/gpt-6-2-Astra", name: "gpt-6-2-Astra" };
  const group = { id: "group/gpt-6.2-sol", name: "内部测试路由", group: true };
  const directory = [custom, sol, astra, group];
  assert.equal(relayModels.label(astra), "GPT-6.2 Astra");
  assert.equal(relayModels.label(sol), "GPT-6.2 Sol");
  assert.equal(relayModels.label(custom), custom.name);
  assert.equal(relayModels.label(group), group.name);
  assert.equal(relayModels.label("gpt-6.2-sol-engine"), "gpt-6.2-sol-engine");
  assert.equal(relayModels.prefer(directory).id, astra.id);
  assert.equal(relayModels.prefer(directory, custom.id).id, custom.id);
  assert.equal(relayModels.prefer(directory, group.id).id, group.id);
  assert.equal(relayModels.prefer(directory.filter(model => model !== astra)).id, sol.id);
  assert.equal(relayModels.prefer([]), undefined);
});

test("带服务商前缀的推荐型号只调整展示和排序，保留完整 ID", () => {
  const astra = "Vendor/GPT-6.2-Astra";
  const sol = "Vendor/GPT6.2-Sol";
  const gatewayEntry = { id: `coldcoffee/${astra}`, name: astra };
  assert.equal(relayModels.label(astra), "GPT-6.2 Astra");
  assert.equal(relayModels.label(gatewayEntry), "GPT-6.2 Astra");
  assert.equal(relayModels.label(sol), "GPT-6.2 Sol");
  assert.equal(relayModels.prefer(["Vendor/Custom", sol, astra]), astra);
  assert.equal(relayModels.prefer([gatewayEntry]), gatewayEntry);
  assert.equal(gatewayEntry.id, `coldcoffee/${astra}`);
});

test("实际响应体保留 Astra、Sol 和旧模型目录里的原始拼写", async () => {
  const ids = ["Vendor/Exact-Model", "gpt6.2-sol", "GPT-6.2-Astra", "GPT-6-Astra", "gpt-6.1-sol", "Vendor/GPT-6.2-Astra"];
  const sent = [];
  const relay = new RelayAdapter({
    mode: "openai",
    baseUrl: "https://relay.example.test/v1",
    authToken: "relay-fixture-test-key",
    wireApi: "responses",
    transport: async (requestUrl, request) => {
      if (new URL(requestUrl).pathname.endsWith("/models")) return { data: ids.map(id => ({ id })) };
      assert.equal(request.method, "POST");
      sent.push(JSON.parse(request.body));
      return { status: "completed", output: [] };
    }
  });
  assert.equal((await relay.testConnection()).models.data[2].id, ids[2]);
  assert.equal((await relay.preflight()).provider.model, ids[2]);
  for (const modelId of ids) await relay.submit({ modelId, goal: "测试模型选择" });
  assert.deepEqual(sent.map(request => request.model), ids);
  await assert.rejects(relay.submit({ modelId: "gpt-6.2-astra" }), /API 模型列表未包含/);
  assert.equal(sent.length, ids.length);
  const legacy = await relay.preflight({ providerId: "gpt-5.6-sol" });
  assert.equal(legacy.provider.model, "gpt-6.1-sol");
});
