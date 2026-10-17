"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { resolveTarget } = require("./ida-toolbox");
const { DEEPSEEK_LABEL } = require("../shared/workbench-core");

const SERVER = "ida-pro-mcp";
const URL = "http://127.0.0.1:13337/mcp";
const PROTOCOL_VERSION = "2024-11-05";
const BEGIN = "# CHA-IDA-MCP:BEGIN";
const END = "# CHA-IDA-MCP:END";

function configuredUrl(options = {}) {
  const explicit = String(options.url || "").trim();
  return explicit || process.env.IDA_MCP_URL || URL;
}

function trimBody(value, max = 16000) {
  return String(value || "").slice(0, max);
}

function parseResponse(text, contentType = "") {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // Streamable HTTP/SSE responses may contain one or more data frames.
    const frames = raw
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);
    for (let index = frames.length - 1; index >= 0; index -= 1) {
      try {
        return JSON.parse(frames[index]);
      } catch {
        // Continue until a valid JSON frame is found.
      }
    }
    return { raw: trimBody(raw), contentType };
  }
}

async function request(url, options = {}) {
  const timeoutMs = Math.min(Math.max(Number(options.timeoutMs || 5000), 250), 120000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: {
        accept: "application/json, text/event-stream",
        ...(options.body ? { "content-type": "application/json" } : {}),
        ...(options.protocolVersion ? { "MCP-Protocol-Version": options.protocolVersion } : {}),
        ...(options.headers || {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      latencyMs: Date.now() - started,
      contentType,
      sessionId: response.headers.get("mcp-session-id") || null,
      body: parseResponse(text, contentType),
      raw: trimBody(text),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      latencyMs: Date.now() - started,
      error: error?.name === "AbortError" ? `timeout after ${timeoutMs}ms` : error.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

function rpcResult(response) {
  return response?.body?.result || response?.body || null;
}

/**
 * Probe the configured IDA MCP endpoint. The endpoint may expose a simple
 * HTTP JSON response or streamable HTTP/SSE. We attempt GET first so a running
 * plugin can report immediately, then use the MCP initialize/tools/list flow.
 */
async function probeIdaMcp(options = {}) {
  const url = configuredUrl(options);
  const checkedAt = new Date().toISOString();
  const timeoutMs = options.timeoutMs;
  const get = await request(url, { timeoutMs });
  let initialize = null;
  const getBody = rpcResult(get);
  const needsHandshake = !get.ok || get.status === 404 || get.status === 405 || !getBody?.serverInfo;
  if (needsHandshake) {
    initialize = await request(url, {
      method: "POST",
      timeoutMs,
      protocolVersion: PROTOCOL_VERSION,
      body: {
        jsonrpc: "2.0",
        id: `coldbrew-init-${Date.now()}`,
        method: "initialize",
        params: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: "coldbrew-atelier", version: "3.1.0" },
        },
      },
    });
  }
  const handshake = initialize || get;
  const sessionId = options.sessionId || handshake.sessionId || get.sessionId || null;
  let listed = null;
  if (handshake.ok || get.ok) {
    listed = await request(url, {
      method: "POST",
      timeoutMs,
      protocolVersion: PROTOCOL_VERSION,
      headers: sessionId ? { "mcp-session-id": sessionId } : undefined,
      body: {
        jsonrpc: "2.0",
        id: `coldbrew-tools-${Date.now()}`,
        method: "tools/list",
        params: {},
      },
    });
  }
  const payload = rpcResult(listed) || rpcResult(handshake) || rpcResult(get);
  const tools = Array.isArray(payload?.tools)
    ? payload.tools.map((item) => ({
      name: item?.name,
      description: item?.description || "",
      inputSchema: item?.inputSchema || null,
    })).filter((item) => item.name)
    : [];
  const serverInfo = rpcResult(handshake)?.serverInfo || rpcResult(get)?.serverInfo || null;
  const capabilities = rpcResult(handshake)?.capabilities || rpcResult(get)?.capabilities || null;
  const ok = Boolean((handshake.ok || get.ok) && !handshake.body?.error);
  const error = ok ? null : (handshake.body?.error?.message || handshake.error || get.error || `HTTP ${handshake.status || get.status || 0}`);
  return {
    id: SERVER,
    kind: "mcp",
    url,
    ok,
    reachable: Boolean(handshake.ok || get.ok),
    status: handshake.status || get.status || 0,
    latencyMs: handshake.latencyMs ?? get.latencyMs ?? null,
    checkedAt,
    serverInfo,
    capabilities,
    tools,
    error,
    transport: (handshake.contentType || get.contentType || "").includes("event-stream") ? "sse" : "http",
    sessionId,
    detail: {
      get: { ok: get.ok, status: get.status, latencyMs: get.latencyMs, error: get.error || null },
      initialize: initialize ? { ok: initialize.ok, status: initialize.status, error: initialize.error || null } : null,
      list: listed ? { ok: listed.ok, status: listed.status, error: listed.error || null } : null,
    },
  };
}

async function callIdaMcp(tool, args = {}, options = {}) {
  if (!tool || typeof tool !== "string") throw new Error("IDA MCP 工具名不能为空。");
  const url = configuredUrl(options);
  const id = options.requestId || `coldbrew-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const response = await request(url, {
    method: "POST",
    timeoutMs: options.timeoutMs,
    protocolVersion: PROTOCOL_VERSION,
    headers: options.sessionId ? { "mcp-session-id": options.sessionId } : undefined,
    body: {
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name: tool, arguments: args || {} },
    },
  });
  const body = response.body;
  const error = body?.error || (!response.ok ? { code: response.status, message: response.error || response.statusText || `HTTP ${response.status}` } : null);
  return {
    ok: Boolean(response.ok && !error),
    id,
    tool,
    url,
    status: response.status,
    latencyMs: response.latencyMs,
    sessionId: response.sessionId || options.sessionId || null,
    result: body?.result || null,
    error,
    raw: response.raw,
    transport: (response.contentType || "").includes("event-stream") ? "sse" : "http",
  };
}

function workbuddyHome(env, home) {
  let target = String(env.WORKBUDDY_HOME || "").trim() || path.join(home, ".workbuddy");
  if (target === "~") target = home;
  if (target.startsWith("~/") || target.startsWith("~\\")) target = path.join(home, target.slice(2));
  target = path.resolve(target);
  try {
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) target = fs.realpathSync(target);
  } catch {
    /* 保持原路径，交给后面的存在性判断 */
  }
  return target;
}

function platformDataHome(env = process.env, home = os.homedir(), platform = process.platform) {
  if (platform === "win32") return String(env.LOCALAPPDATA || "").trim() || path.join(home, "AppData", "Local");
  if (platform === "darwin") return path.join(home, "Library", "Application Support");
  return String(env.XDG_DATA_HOME || "").trim() || path.join(home, ".local", "share");
}

function clients(options = {}) {
  const env = options.env || process.env;
  const home = options.home || os.homedir();
  const buddy = workbuddyHome(env, home);
  return [
    { id: "codex", label: "Codex", kind: "toml", file: path.join(home, ".codex", "config.toml"), enabled: false },
    { id: "claude", label: "Claude Code", kind: "json", file: path.join(home, ".claude.json"), keys: ["mcpServers", SERVER], entry: { type: "http", url: URL } },
    { id: "grok", label: "Grok", kind: "toml", file: path.join(home, ".grok", "config.toml"), enabled: true },
    { id: "deepseek", label: DEEPSEEK_LABEL, kind: "manual", note: "在 Harness 当前 profile 中配置 MCP；这里保留手动接入" },
    { id: "glm53", label: "GLM / ZCode", kind: "json", file: path.join(home, ".zcode", "cli", "config.json"), keys: ["mcp", "servers", SERVER], entry: { type: "http", url: URL, enabled: true } },
    { id: "gemini", label: "Gemini", kind: "json", file: path.join(home, ".gemini", "settings.json"), keys: ["mcpServers", SERVER], entry: { httpUrl: URL } },
    { id: "doubao", label: "豆包", kind: "manual", note: "豆包没有 mcp.json。连接器里选 HTTP，地址用下面这一条" },
    { id: "workbuddy", label: "WorkBuddy", kind: "json", file: path.join(buddy, "mcp.json"), keys: ["mcpServers", SERVER], entry: { type: "streamableHttp", url: URL, timeout: 30000 }, create: true },
    { id: "cursor", label: "Cursor", kind: "json", file: path.join(home, ".cursor", "mcp.json"), keys: ["mcpServers", SERVER], entry: { url: URL }, create: true },
    { id: "mimo", label: "MiMo-V2.6-Pro", kind: "manual", note: "技能写在用户配置目录 skills/cha-mimo/SKILL.md。不改 mimocode.json，避免动到模型和 Key" },
    { id: "kimi", label: "Kimi K3", kind: "manual", note: "技能写在 Kimi Code 数据根 skills/cha-kimi/SKILL.md。不改 config.toml，不写 ~/.agents/skills" },
  ];
}

function mcpFileForSeat(seat, root, layout) {
  if (seat === "claude") return path.join(path.dirname(root), ".claude.json");
  if (seat === "glm53") {
    if (layout === "zcode") return path.join(root, "cli", "config.json");
    return path.join(path.dirname(root), ".zcode", "cli", "config.json");
  }
  if (seat === "codex" || seat === "grok") return path.join(root, "config.toml");
  if (seat === "gemini") return path.join(root, "settings.json");
  return path.join(root, "mcp.json");
}

function seatClient(seat, options, create) {
  const client = clients(options).find((item) => item.id === seat);
  if (!client) return { code: "unknown" };
  if (client.kind === "manual") return { code: "manual", client };
  const copy = { ...client, create: !!create };
  if (options.root) {
    const root = path.resolve(String(options.root));
    if (seat === "cursor") {
      if (path.basename(root) !== ".cursor") return { code: "location", skipped: "只写用户目录 .cursor", client: copy };
      if (fs.existsSync(path.join(root, "Cursor.exe")) || fs.existsSync(path.join(root, "resources", "app"))) {
        return { code: "location", skipped: "这是 Cursor 程序目录", client: copy };
      }
    }
    copy.file = mcpFileForSeat(seat, root, options.layout);
    if (create) fs.mkdirSync(path.dirname(copy.file), { recursive: true });
  }
  return { code: "ready", client: copy };
}

function blankMcpFile(file) {
  if (!file || !fs.existsSync(file)) return;
  const text = fs.readFileSync(file, "utf8");
  if (!text.trim()) {
    fs.unlinkSync(file);
    return;
  }
  if (!file.endsWith(".json")) return;
  let data;
  try { data = JSON.parse(text); } catch { return; }
  const prune = (node) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return false;
    for (const key of Object.keys(node)) {
      if (prune(node[key])) delete node[key];
    }
    return Object.keys(node).length === 0;
  };
  if (prune(data)) fs.unlinkSync(file);
}

function attachSeat(seat, options = {}) {
  const picked = seatClient(seat, options, true);
  if (picked.code === "unknown") return { ok: false, seat, code: "unknown" };
  if (picked.code === "manual") return { ok: true, seat, code: "manual" };
  if (picked.code === "location") return { ok: false, seat, code: "location", skipped: picked.skipped };
  const row = applyClient(picked.client, options, false);
  return { ok: row.installed === true, seat, code: row.installed ? "ida" : "skip", file: picked.client.file, skipped: row.skipped || "" };
}

function detachSeat(seat, options = {}) {
  const picked = seatClient(seat, options, false);
  if (picked.code === "unknown") return { ok: false, seat, code: "unknown" };
  if (picked.code === "manual") return { ok: true, seat, code: "manual" };
  if (picked.code === "location") return { ok: false, seat, code: "location", skipped: picked.skipped };
  const row = applyClient(picked.client, options, true);
  if (row.skipped) return { ok: true, seat, code: "off", file: picked.client.file, skipped: row.skipped };
  blankMcpFile(picked.client.file);
  const after = describe(picked.client);
  return { ok: after.installed !== true, seat, code: after.installed ? "skip" : "off", file: picked.client.file, skipped: row.skipped || "" };
}

function tomlBlock(enabled) {
  const lines = [BEGIN, `[mcp_servers.${SERVER}]`, `url = "${URL}"`];
  if (enabled) lines.push("enabled = true");
  lines.push(END);
  return `${lines.join("\n")}\n`;
}

function tomlInstalled(text) {
  if (!text) return false;
  const marked = text.includes(BEGIN) && text.includes(END) && text.slice(text.indexOf(BEGIN), text.indexOf(END)).includes(URL);
  if (marked) return true;
  const header = `[mcp_servers.${SERVER}]`;
  const at = text.indexOf(header);
  if (at < 0) return false;
  return text.slice(at, at + 400).includes(URL);
}

function upsertToml(text, enabled) {
  const block = tomlBlock(enabled);
  const start = text.indexOf(BEGIN);
  const stop = text.indexOf(END);
  if (start >= 0 && stop > start) return `${text.slice(0, start)}${block}${text.slice(stop + END.length).replace(/^\r?\n/, "")}`;
  if (text.includes(`[mcp_servers.${SERVER}]`)) return text;
  const base = text.length === 0 || text.endsWith("\n") ? text : `${text}\n`;
  return `${base}${base.endsWith("\n\n") || base.length === 0 ? "" : "\n"}${block}`;
}

function stripToml(text) {
  const start = text.indexOf(BEGIN);
  const stop = text.indexOf(END);
  if (start < 0 || stop < start) return text;
  const tail = text.slice(stop + END.length).replace(/^\r?\n/, "");
  let head = text.slice(0, start);
  if (!tail.trim()) head = head.replace(/\n\n$/, "\n");
  return `${head}${tail}`.replace(/\n{3,}/g, "\n\n");
}

function readJson(file) {
  const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const data = text.trim() ? JSON.parse(text) : {};
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("JSON 顶层不是对象");
  return data;
}

function getAt(root, keys) {
  let at = root;
  for (const key of keys) {
    if (!at || typeof at !== "object" || Array.isArray(at)) return undefined;
    at = at[key];
  }
  return at;
}

function assign(root, keys, value) {
  let at = root;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i];
    if (!at[key] || typeof at[key] !== "object" || Array.isArray(at[key])) at[key] = {};
    at = at[key];
  }
  at[keys[keys.length - 1]] = value;
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function backupFile(file, options) {
  if (!fs.existsSync(file)) return null;
  const dir = options.backupDir || path.join(options.home || os.homedir(), ".coldcoffee-history", "ida-mcp");
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `${Date.now()}-${path.basename(file)}`);
  fs.copyFileSync(file, dest);
  return dest;
}

function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp-ida-mcp`;
  fs.writeFileSync(temp, text, "utf8");
  fs.renameSync(temp, file);
}

function describe(client) {
  const row = { id: client.id, label: client.label, kind: client.kind, file: client.file || "", note: client.note || "", installed: false, exists: false };
  if (client.kind === "manual") return row;
  row.exists = fs.existsSync(client.file);
  if (!row.exists) return row;
  try {
    if (client.kind === "toml") row.installed = tomlInstalled(fs.readFileSync(client.file, "utf8"));
    else row.installed = sameJson(getAt(readJson(client.file), client.keys), client.entry);
  } catch (error) {
    row.note = error.message;
  }
  return row;
}

function pluginStatus(options = {}) {
  const where = resolveTarget(options);
  const loader = path.join(where.target, "ida_mcp.py");
  const pkg = path.join(where.target, "ida_mcp");
  const loaderReady = fs.existsSync(loader) && fs.statSync(loader).isFile();
  const packageReady = fs.existsSync(pkg) && fs.statSync(pkg).isDirectory();
  return { ...where, targetExists: fs.existsSync(where.target), loader: loaderReady, package: packageReady, ready: loaderReady && packageReady };
}

function status(options = {}) {
  return {
    ok: true,
    action: "mcp-status",
    server: SERVER,
    url: configuredUrl(options),
    plugin: pluginStatus(options),
    clients: clients(options).map(describe),
  };
}

function applyClient(client, options, remove) {
  const row = describe(client);
  if (client.kind === "manual") return { ...row, skipped: "manual" };
  const parent = path.dirname(client.file);
  if (!fs.existsSync(parent)) return { ...row, skipped: "目录不存在" };
  if (!row.exists && !client.create) return { ...row, skipped: "配置文件不存在" };
  if (!row.exists && remove) return { ...row, skipped: "配置文件不存在" };
  if (client.kind === "toml") {
    const text = row.exists ? fs.readFileSync(client.file, "utf8") : "";
    const next = remove ? stripToml(text) : upsertToml(text, client.enabled);
    if (next === text) return { ...describe(client), unchanged: true };
    const backup = backupFile(client.file, options);
    writeText(client.file, next);
    return { ...describe(client), backup, changed: true };
  }
  let data = {};
  if (row.exists) {
    try {
      data = readJson(client.file);
    } catch (error) {
      return { ...row, skipped: error.message };
    }
    if (!remove && sameJson(getAt(data, client.keys), client.entry)) return { ...describe(client), unchanged: true };
  }
  if (remove) {
    const parentNode = getAt(data, client.keys.slice(0, -1));
    if (parentNode && Object.prototype.hasOwnProperty.call(parentNode, client.keys.at(-1))) delete parentNode[client.keys.at(-1)];
  } else {
    assign(data, client.keys, client.entry);
  }
  const backup = backupFile(client.file, options);
  writeText(client.file, `${JSON.stringify(data, null, 2)}\n`);
  return { ...describe(client), backup, changed: true };
}

function installClients(options = {}) {
  const rows = clients(options).map((client) => applyClient(client, options, false));
  return { ...status(options), action: "mcp-install", rows };
}

function uninstallClients(options = {}) {
  const rows = clients(options).map((client) => applyClient(client, options, true));
  return { ...status(options), action: "mcp-uninstall", rows };
}

function findPython(options = {}) {
  const explicit = options.python && String(options.python).trim();
  if (explicit) return explicit;
  const env = options.env || process.env;
  const home = options.home || os.homedir();
  const platform = options.platform || process.platform;
  if (platform === "win32") {
    const local = env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Programs", "Python", "Python312", "python.exe");
    if (local && fs.existsSync(local)) return local;
    return "python";
  }
  // macOS/Linux distributions conventionally expose Python 3 as python3.
  // The caller can still override this with { python } for a virtualenv.
  return "python3";
}

function packageSource(packageDir) {
  const source = path.join(packageDir, "ida_pro_mcp");
  return fs.existsSync(path.join(source, "ida_mcp.py")) && fs.existsSync(path.join(source, "ida_mcp")) ? source : "";
}

function installPackage(options = {}) {
  const env = options.env || process.env;
  const home = options.home || os.homedir();
  const platform = options.platform || process.platform;
  const packageDir = options.packageDir || path.join(platformDataHome(env, home, platform), "gpt6-Astra", "ida-pro-mcp");
  const existing = packageSource(packageDir);
  if (existing && !options.forcePackage) return existing;
  fs.mkdirSync(packageDir, { recursive: true });
  const result = spawnSync(findPython(options), ["-m", "pip", "install", "--upgrade", "--target", packageDir, "https://github.com/mrexodia/ida-pro-mcp/archive/refs/heads/main.zip"], {
    encoding: "utf8",
    timeout: options.timeoutMs || 180000,
    windowsHide: true,
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    const detail = `${result.stderr || ""}\n${result.stdout || ""}`.trim().slice(-700);
    throw new Error(detail || "pip 安装 ida-pro-mcp 失败");
  }
  const source = packageSource(packageDir);
  if (!source) throw new Error("ida-pro-mcp 已下载，但找不到 ida_mcp.py");
  return source;
}

function installPlugin(options = {}) {
  const source = options.pluginSource || packageSource(options.packageDir || "");
  if (!source) throw new Error("找不到 ida-pro-mcp 插件源");
  const loader = path.join(source, "ida_mcp.py");
  const pkg = path.join(source, "ida_mcp");
  if (!fs.existsSync(loader) || !fs.statSync(pkg).isDirectory()) throw new Error("插件源不完整");
  const where = resolveTarget(options);
  fs.mkdirSync(where.target, { recursive: true });
  const old = path.join(where.target, "mcp-plugin.py");
  if (fs.existsSync(old)) fs.unlinkSync(old);
  fs.copyFileSync(loader, path.join(where.target, "ida_mcp.py"));
  fs.cpSync(pkg, path.join(where.target, "ida_mcp"), { recursive: true, force: true });
  return { ...status(options), action: "mcp-plugin" };
}

function uninstallPlugin(options = {}) {
  const where = resolveTarget(options);
  for (const name of ["ida_mcp.py", "mcp-plugin.py"]) {
    const file = path.join(where.target, name);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) fs.unlinkSync(file);
  }
  const pkg = path.join(where.target, "ida_mcp");
  if (fs.existsSync(pkg)) fs.rmSync(pkg, { recursive: true, force: true });
  return { ...status(options), action: "mcp-plugin-uninstall" };
}

module.exports = {
  SERVER,
  URL,
  PROTOCOL_VERSION,
  configuredUrl,
  clients,
  status,
  attachSeat,
  detachSeat,
  installClients,
  uninstallClients,
  installPackage,
  installPlugin,
  uninstallPlugin,
  findPython,
  platformDataHome,
  parseResponse,
  probeIdaMcp,
  callIdaMcp,
};
