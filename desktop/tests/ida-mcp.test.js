"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const mcp = require("../src/lib/ida-mcp");

function fixture() {
  const home = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "ida-mcp-"));
  const env = { APPDATA: path.join(home, "AppData"), WORKBUDDY_HOME: path.join(home, ".workbuddy"), LOCALAPPDATA: path.join(home, "Local") };
  fs.mkdirSync(path.join(home, ".codex"), { recursive: true });
  fs.mkdirSync(path.join(home, ".grok"), { recursive: true });
  fs.mkdirSync(path.join(home, ".gemini"), { recursive: true });
  fs.mkdirSync(path.join(home, ".zcode", "cli"), { recursive: true });
  fs.mkdirSync(path.join(home, ".workbuddy"), { recursive: true });
  fs.mkdirSync(path.join(home, ".cursor"), { recursive: true });
  fs.writeFileSync(path.join(home, ".codex", "config.toml"), "[mcp_servers.node_repl]\ncommand = \"node\"\n");
  fs.writeFileSync(path.join(home, ".grok", "config.toml"), "model = \"grok\"\n\n[mcp_servers.awesun-mcp-server]\ncommand = \"awesun\"\n");
  fs.writeFileSync(path.join(home, ".claude.json"), `${JSON.stringify({ numStartups: 3, mcpServers: { other: { command: "keep" } } }, null, 2)}\n`);
  fs.writeFileSync(path.join(home, ".gemini", "settings.json"), `${JSON.stringify({ security: { auth: { selectedType: "oauth" } } })}\n`);
  fs.writeFileSync(path.join(home, ".zcode", "cli", "config.json"), `${JSON.stringify({ plugins: ["keep"] })}\n`);
  return { home, env, backupDir: path.join(home, "backups") };
}

test("写入各席位 MCP 且不覆盖已有项", () => {
  const fx = fixture();
  const first = mcp.installClients(fx);
  const byId = Object.fromEntries(first.clients.map((row) => [row.id, row]));
  assert.equal(byId.codex.installed, true);
  assert.equal(byId.claude.installed, true);
  assert.equal(byId.grok.installed, true);
  assert.equal(byId.gemini.installed, true);
  assert.equal(byId.glm53.installed, true);
  assert.equal(byId.workbuddy.installed, true);
  assert.equal(byId.cursor.installed, true);
  assert.equal(byId.doubao.kind, "manual");
  assert.equal(byId.deepseek.kind, "manual");
  assert.equal(byId.mimo.kind, "manual");
  assert.equal(byId.kimi.kind, "manual");
  assert.equal(fs.existsSync(path.join(fx.home, ".config", "mimocode", "mimocode.json")), false);
  assert.equal(fs.existsSync(path.join(fx.home, ".kimi-code", "config.toml")), false);
  assert.equal(fs.existsSync(path.join(fx.home, ".agents", "skills")), false);
  assert.equal(fs.existsSync(path.join(fx.home, ".doubao")), false);
  const codex = fs.readFileSync(path.join(fx.home, ".codex", "config.toml"), "utf8");
  assert.match(codex, /\[mcp_servers\.node_repl\]/);
  assert.match(codex, /\[mcp_servers\.ida-pro-mcp\]/);
  assert.match(codex, /http:\/\/127\.0\.0\.1:13337\/mcp/);
  assert.doesNotMatch(codex.split("[mcp_servers.ida-pro-mcp]")[1], /enabled = true/);
  const grok = fs.readFileSync(path.join(fx.home, ".grok", "config.toml"), "utf8");
  assert.match(grok, /model = "grok"/);
  assert.match(grok, /enabled = true/);
  const claude = JSON.parse(fs.readFileSync(path.join(fx.home, ".claude.json"), "utf8"));
  assert.equal(claude.numStartups, 3);
  assert.equal(claude.mcpServers.other.command, "keep");
  assert.equal(claude.mcpServers["ida-pro-mcp"].type, "http");
  const gemini = JSON.parse(fs.readFileSync(path.join(fx.home, ".gemini", "settings.json"), "utf8"));
  assert.equal(gemini.security.auth.selectedType, "oauth");
  assert.equal(gemini.mcpServers["ida-pro-mcp"].httpUrl, mcp.URL);
  const zcode = JSON.parse(fs.readFileSync(path.join(fx.home, ".zcode", "cli", "config.json"), "utf8"));
  assert.deepEqual(zcode.plugins, ["keep"]);
  assert.equal(zcode.mcp.servers["ida-pro-mcp"].url, mcp.URL);
  const buddy = JSON.parse(fs.readFileSync(path.join(fx.home, ".workbuddy", "mcp.json"), "utf8"));
  assert.equal(buddy.mcpServers["ida-pro-mcp"].type, "streamableHttp");
  const cursor = JSON.parse(fs.readFileSync(path.join(fx.home, ".cursor", "mcp.json"), "utf8"));
  assert.equal(cursor.mcpServers["ida-pro-mcp"].url, mcp.URL);
  assert.equal(fs.existsSync(path.join(fx.home, "AppData", "Cursor", "mcp.json")), false);
  const second = mcp.installClients(fx);
  assert.equal(second.rows.filter((row) => row.changed).length, 0);
});

test("WorkBuddy 目录联接解析后再写 mcp.json", () => {
  const fx = fixture();
  const real = path.join(fx.home, "wb-real");
  fs.mkdirSync(real);
  const link = path.join(fx.home, "wb-link");
  fs.symlinkSync(real, link, "junction");
  const result = mcp.installClients({ ...fx, env: { ...fx.env, WORKBUDDY_HOME: link } });
  const row = result.clients.find((item) => item.id === "workbuddy");
  assert.equal(row.file, path.join(real, "mcp.json"));
  assert.equal(row.installed, true);
  assert.equal(fs.existsSync(path.join(real, "mcp.json")), true);
});

test("插件只复制到 plugins 目录", () => {
  const fx = fixture();
  const source = path.join(fx.home, "src");
  const pkg = path.join(source, "ida_mcp");
  fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(path.join(source, "ida_mcp.py"), "print('mcp')\n");
  fs.writeFileSync(path.join(pkg, "__init__.py"), "");
  const target = path.join(fx.home, "Hex-Rays", "IDA Pro", "plugins");
  const result = mcp.installPlugin({ ...fx, pluginSource: source, target });
  assert.equal(result.plugin.ready, true);
  assert.equal(fs.readFileSync(path.join(target, "ida_mcp.py"), "utf8"), "print('mcp')\n");
  mcp.uninstallPlugin({ ...fx, target });
  assert.equal(fs.existsSync(path.join(target, "ida_mcp.py")), false);
  assert.equal(fs.existsSync(path.join(target, "ida_mcp")), false);
});

test("探测 MCP initialize/tools/list 并调用工具", async (t) => {
  const calls = [];
  const server = http.createServer((request, response) => {
    calls.push({ method: request.method, url: request.url });
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      response.setHeader("content-type", "application/json");
      if (request.method === "GET") {
        response.end(JSON.stringify({ serverInfo: { name: "fixture-ida", version: "1" } }));
        return;
      }
      const message = JSON.parse(body || "{}");
      if (message.method === "initialize") {
        response.setHeader("mcp-session-id", "fixture-session");
        response.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { serverInfo: { name: "fixture-ida", version: "1" }, capabilities: { tools: {} } } }));
        return;
      }
      if (message.method === "tools/list") {
        response.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { tools: [{ name: "get_functions", description: "fixture", inputSchema: { type: "object" } }] } }));
        return;
      }
      if (message.method === "tools/call") {
        response.end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result: { content: [{ type: "text", text: "ok" }] } }));
        return;
      }
      response.statusCode = 400;
      response.end(JSON.stringify({ error: { message: "unknown method" } }));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/mcp`;
  const status = await mcp.probeIdaMcp({ url, timeoutMs: 2000 });
  assert.equal(status.ok, true, JSON.stringify(status));
  assert.equal(status.serverInfo.name, "fixture-ida");
  assert.equal(status.tools[0].name, "get_functions");
  const result = await mcp.callIdaMcp("get_functions", { limit: 3 }, { url, timeoutMs: 2000, sessionId: status.sessionId });
  assert.equal(result.ok, true);
  assert.equal(result.result.content[0].text, "ok");
  assert.ok(calls.some((item) => item.method === "POST"));
});
