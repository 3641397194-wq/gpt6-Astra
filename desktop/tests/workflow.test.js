"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { WorkflowEngine, healthCheckTools, planWorkflow } = require("../src/lib/workflow");

test("逆向计划包含 IDA MCP 阶段", () => {
  const plan = planWorkflow({ mode: "reverse", target: "SAMPLE" });
  assert.equal(plan.id, "reverse");
  assert.equal(plan.ida, true);
  assert.ok(plan.stages.some((stage) => stage.kind === "ida-health"));
  assert.ok(plan.stages.some((stage) => stage.kind === "ida-call"));
});

test("工具健康检查返回结构化状态", () => {
  const result = healthCheckTools(["node"]);
  assert.equal(result.total, 1);
  assert.equal(result.tools[0].id, "node");
  assert.equal(typeof result.tools[0].ok, "boolean");
});

test("工作流实际执行命令并写入证据报告", async () => {
  const artifactDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "coldcoffee-workflow-"));
  const events = [];
  const engine = new WorkflowEngine({ emit: (event) => events.push(event) });
  const task = engine.start({
    mode: "custom",
    target: "SAMPLE",
    artifactDir,
    steps: [
      { id: "node", label: "Node smoke", kind: "command", tool: "node", args: ["-e", "console.log('workflow-ok')"] },
      { id: "evidence", label: "写入报告", kind: "evidence" },
    ],
  });
  await new Promise((resolve) => {
    const timer = setInterval(() => {
      const current = engine.get(task.id);
      if (["completed", "failed", "cancelled"].includes(current.status)) {
        clearInterval(timer);
        resolve();
      }
    }, 20);
  });
  const result = engine.get(task.id);
  assert.equal(result.status, "completed");
  assert.equal(result.completed, 2);
  assert.ok(events.some((event) => event.type === "tool:output"));
  const report = result.stages.at(-1).result.reportPath;
  assert.equal(fs.existsSync(report), true);
});

test("缺少目标时进入 needs-input 状态", async () => {
  const engine = new WorkflowEngine();
  const task = engine.start({ mode: "reverse" });
  await new Promise((resolve) => setTimeout(resolve, 30));
  const result = engine.get(task.id);
  assert.equal(result.status, "needs-input");
  assert.equal(result.needsInput.field, "target");
});
