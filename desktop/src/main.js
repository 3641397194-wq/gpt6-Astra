const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { ACTIVATION_WORD, CONTROL_WORD, APP_TITLE, PROFILES, SEATS, CHANNELS, activate } = require("./lib/prompt-engine");
const workbenchCore = require("./shared/workbench-core");
const geminiSeat = require("./lib/gemini-seat");
const seatRuntime = require("./lib/seat-runtime");
const { SeatTransactions } = require("./lib/seat-transactions");
const seatTransactions = new SeatTransactions();
const { ActivationGate } = require("./lib/activation-gate");
const activationGate = new ActivationGate();
const { detectDirectory } = require("./lib/detect-directory");
const beginner = require("./lib/beginner-install");
const idaToolbox = require("./lib/ida-toolbox");
const idaMcp = require("./lib/ida-mcp");
const { WorkflowEngine, planWorkflow, healthCheckTools } = require("./lib/workflow");
const { RelayAdapter } = require("./lib/relay-adapter");
const relayAdapter = new RelayAdapter();
const { assertTrustedSender, protectWindow } = require("./lib/window-security");
const WORKBENCH_ENTRY = path.join(__dirname, "workbench", "index.html");
const { ToolboxEngine } = require("./lib/toolbox/engine");
const { runAgent } = require("./lib/toolbox/agent");
let originalToolbox;
function getOriginalToolbox() {
  const workspaceArg = process.argv.find(value => value.startsWith("--toolbox-workspace="));
  if (!originalToolbox) originalToolbox = new ToolboxEngine({
    workspace: workspaceArg ? workspaceArg.slice("--toolbox-workspace=".length) : path.join(app.getPath("userData"), "original-toolbox"),
    emit: entry => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("coldbrew:original-toolbox-event", entry);
    },
  });
  return originalToolbox;
}

const COMMUNITY = {
  qq: [
    { name: "一群", value: "1057540028" },
    { name: "二群", value: "1077074552" },
    { name: "三群", value: "618179023" },
  ],
};

let splashWindow;
let mainWindow;

function emitWorkflow(event) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("coldbrew:workflow-event", event);
  }
}

const workflowEngine = new WorkflowEngine({ emit: emitWorkflow });

function handleTrusted(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedSender(event, mainWindow, WORKBENCH_ENTRY);
    return handler(event, ...args);
  });
}

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 920,
    height: 560,
    frame: false,
    resizable: false,
    show: false,
    backgroundColor: "#090707",
    title: "冷咖啡中转",
    icon: path.join(__dirname, "..", "assets", "icon-v4.png"),
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  protectWindow(splashWindow);
  splashWindow.loadFile(path.join(__dirname, "splash", "index.html"));
  splashWindow.once("ready-to-show", () => splashWindow.show());
}

function createMain() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1080,
    minHeight: 700,
    frame: false,
    show: false,
    backgroundColor: "#080707",
    title: "冷咖啡中转",
    icon: path.join(__dirname, "..", "assets", "icon-v4.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  protectWindow(mainWindow);
  const seatArg = process.argv.find((item) => item.startsWith("--seat="));
  const hash = process.argv.includes("--toolbox") ? "toolbox" : process.argv.includes("--relay") ? "relay" : process.argv.includes("--workflow") ? "workflow" : (seatArg ? seatArg.slice("--seat=".length) : "");
  mainWindow.loadFile(WORKBENCH_ENTRY, hash ? { hash } : {});
}

handleTrusted("coldbrew:meta", () => ({
  activation: ACTIVATION_WORD,
  control: CONTROL_WORD,
  title: APP_TITLE,
  profiles: PROFILES,
  seats: SEATS,
  channels: CHANNELS,
  community: COMMUNITY,
  version: workbenchCore.VERSION,
}));

handleTrusted("coldbrew:activate", (_event, payload = {}) => activate({
  word: payload.word,
  profile: payload.profile,
  channel: payload.channel,
  prompt: payload.prompt,
}));

handleTrusted("coldbrew:transaction", async (_event, action, payload = {}) => {
  if(action === "gate-create") return activationGate.create(payload.seat);
  if(action === "gate-input") return activationGate.input(payload.id, payload.text);
  if(action === "gate-reset") { activationGate.reset(payload.id); return {ok:true}; }
  if(action === "auto-select") {
    const found = detectDirectory(payload.seat);
    seatTransactions.select(found.root, {layout:found.layout});
    return found;
  }
  if(action === "select") {
    const result = await dialog.showOpenDialog(mainWindow, { title: "选择当前模型的配置目录（仅操作预览列出的文件）", properties: ["openDirectory", "createDirectory"] });
    return result.canceled ? {canceled:true} : seatTransactions.select(result.filePaths[0], {layout: payload.seat === "deepseek" ? "deepseek-harness" : payload.seat === "glm53" && path.basename(result.filePaths[0]).toLowerCase() === ".zcode" ? "zcode" : "default"});
  }
  if(action === "preview") return seatTransactions.preview(payload.seat);
  if(action === "file") return seatTransactions.file(payload.id, payload.index);
  if(action === "verify") return seatTransactions.verify(payload.seat);
  if(action === "history") return seatTransactions.history();
  if(action === "deploy" || action === "restore") {
    if(payload.confirm !== true) throw new Error("请先确认文件操作");
    const confirm = await dialog.showMessageBox(mainWindow, {type:"warning",title:"冷咖啡 · 确认文件操作",message:action === "deploy" ? "将按预览写入席位包并保存原文件备份" : "将恢复此版本备份；冲突文件会中止操作", detail:seatTransactions.requireRoot(),buttons:["取消", "确认执行"],defaultId:0,cancelId:0});
    if(confirm.response !== 1) return {canceled:true};
    return action === "deploy" ? seatTransactions.deploy(payload.id) : seatTransactions.restore(payload.id);
  }
  throw new Error("未知文件操作");
});

// The relay adapter starts in deterministic preview mode. The API-first screen
// explicitly switches it to OpenAI-compatible mode after the customer enters
// a base URL and API key; no credential is bundled in the release.
handleTrusted("coldbrew:relay", async (_event, action, payload = {}) => {
  if (action === "status") return relayAdapter.status();
  if (action === "providers") return relayAdapter.providerPresets();
  if (action === "models") return relayAdapter.models();
  if (action === "test") return relayAdapter.testConnection();
  if (action === "catalog") return relayAdapter.catalog();
  if (action === "entitlement") return relayAdapter.entitlement(payload);
  if (action === "usage") return relayAdapter.usage(payload);
  if (action === "preflight") return relayAdapter.preflight(payload);
  if (action === "submit") return relayAdapter.submit(payload);
  if (action === "configure") {
    // Configuration is held in the main process only. The API key is never
    // written to the repository or returned by status().
    return relayAdapter.reconfigure(payload);
  }
  throw new Error("未知中转操作");
});

handleTrusted("coldbrew:tools-health", (_event, payload = {}) => healthCheckTools(payload?.ids));
handleTrusted("coldbrew:workflow-templates", () => workflowEngine.templates());
handleTrusted("coldbrew:workflows", () => workflowEngine.templates());
handleTrusted("coldbrew:workflow-plan", (_event, payload = {}) => planWorkflow(payload));
handleTrusted("coldbrew:workflow-start", (_event, payload = {}) => workflowEngine.start(payload));
handleTrusted("coldbrew:workflow-status", (_event, taskId) => workflowEngine.get(taskId));
handleTrusted("coldbrew:workflow-list", () => workflowEngine.list());
handleTrusted("coldbrew:workflow-pause", (_event, taskId) => workflowEngine.pause(taskId));
handleTrusted("coldbrew:workflow-resume", (_event, payload = {}) => {
  const id = payload?.id || payload?.taskId || payload;
  return workflowEngine.resume(id, payload?.input || {});
});
handleTrusted("coldbrew:workflow-cancel", (_event, taskId) => workflowEngine.cancel(taskId));
handleTrusted("coldbrew:workflow-clear", (_event, taskId) => workflowEngine.clear(taskId));
handleTrusted("coldbrew:ida-status", (_event, payload = {}) => idaMcp.probeIdaMcp(payload));
handleTrusted("coldbrew:ida-call", (_event, payload = {}) => {
  const tool = payload?.tool || payload?.name;
  if (!tool) throw new Error("IDA MCP 工具名不能为空。");
  return idaMcp.callIdaMcp(tool, payload.args || payload.arguments || {}, payload);
});

handleTrusted("coldbrew:compose", (_event, payload) => workbenchCore.compose(payload));
handleTrusted("coldbrew:evaluate", (_event, answer, options) => workbenchCore.evaluate(answer, options));

handleTrusted("coldbrew:inspect", () => seatRuntime.inspectAll());

handleTrusted("coldbrew:gemini", (_event, verb, payload = {}) => geminiSeat.run(verb, payload.home));
handleTrusted("coldbrew:seat", (_event, seatId, verb, payload = {}) => seatRuntime.run(String(seatId || ""), verb, payload.home));

handleTrusted("coldbrew:toolbox", async (_event, payload = {}) => {
  const action = String(payload.action || "status");
  if (action === "status") return idaToolbox.status();
  if (action === "install" || action === "uninstall") {
    const current = idaToolbox.status();
    const confirm = await dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "冷咖啡 · IDA 汉化",
      message: action === "install" ? "把中文放进 IDA 的插件文件夹" : "卸掉中文。你的 zh_cn_user.json 留着。",
      detail: current.target,
      buttons: ["取消", "就这么做"],
      defaultId: 0,
      cancelId: 0,
    });
    if (confirm.response !== 1) return { canceled: true, ...current };
    return action === "install" ? idaToolbox.install() : idaToolbox.uninstall();
  }
  if (action === "reveal") {
    const current = idaToolbox.status();
    if (!current.targetExists) throw new Error("还没有插件文件夹，先装一次中文");
    const opened = await shell.openPath(current.target);
    if (opened) throw new Error(opened);
    return current;
  }
  if (action === "mcp-status") return idaMcp.status();
  if (action === "mcp-install" || action === "mcp-uninstall") {
    const current = idaMcp.status();
    const confirm = await dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "冷咖啡 · IDA MCP",
      message: action === "mcp-install" ? "把 IDA 的连接写进你正在用的软件" : "从这些软件里去掉 IDA 的连接",
      detail: `${current.url}\n只改这一项连接。豆包要自己在连接器里填。`,
      buttons: ["取消", "就这么做"],
      defaultId: 0,
      cancelId: 0,
    });
    if (confirm.response !== 1) return { canceled: true, ...current };
    return action === "mcp-install" ? idaMcp.installClients() : idaMcp.uninstallClients();
  }
  if (action === "mcp-plugin" || action === "mcp-plugin-uninstall") {
    const current = idaMcp.status();
    const confirm = await dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "冷咖啡 · IDA MCP 插件",
      message: action === "mcp-plugin" ? "把连接插件放进 IDA 的插件文件夹" : "从插件文件夹里拿掉连接插件",
      detail: current.plugin.target,
      buttons: ["取消", "就这么做"],
      defaultId: 0,
      cancelId: 0,
    });
    if (confirm.response !== 1) return { canceled: true, ...current };
    if (action === "mcp-plugin-uninstall") return idaMcp.uninstallPlugin();
    const source = await idaMcp.installPackage();
    return idaMcp.installPlugin({ pluginSource: source });
  }
  throw new Error("未知工具箱操作");
});

handleTrusted("coldbrew:original-toolbox", async (_event, action, payload = {}) => {
  const engine = getOriginalToolbox();
  if (action === "catalog") return engine.catalog();
  if (action === "start") return engine.start(payload.name, payload.arguments || {});
  if (action === "status") return engine.get(payload.id);
  if (action === "list") return engine.list();
  if (action === "cancel") return engine.cancel(payload.id);
  if (action === "import") {
    const picked = await dialog.showOpenDialog(mainWindow, { title: "选择要分析的样本（保留原件，复制到工具箱工作目录）", properties: ["openFile"] });
    return picked.canceled ? { canceled: true } : engine.importSample(picked.filePaths[0]);
  }
  if (action === "agent") {
    const input = { goal: String(payload.goal || "").slice(0, 8000), target: String(payload.target || ""), modelId: String(payload.modelId || ""), maxRounds: payload.maxRounds || 8, idaUrl: payload.idaUrl ? String(payload.idaUrl) : undefined };
    if (!input.target) throw new Error("先填写目标或选一个样本");
    if (relayAdapter.status().mode === "preview") throw new Error("先到中转页填写 API Key 并验证模型");
    return engine.start("ai_task", input, ctx => runAgent(engine, relayAdapter, input, ctx));
  }
  if (action === "connection") {
    if (process.env.PORTABLE_EXECUTABLE_FILE) {
      // A portable launcher's extraction directory is temporary. Export only
      // our own small server modules to a stable workspace instead.
      const target = engine.directory(path.join("mcp-runtime", require("node:crypto").randomUUID()));
      const source = path.join(process.resourcesPath, "toolbox");
      for (const name of fs.readdirSync(source).filter(name => name.endsWith(".js") || name === "SKILL.md")) fs.writeFileSync(path.join(target, name), fs.readFileSync(path.join(source, name)), { flag: "wx" });
      return { mcpServers: { "coldcoffee-toolbox": { command: "node", args: [path.join(target, "mcp.js"), "--workspace", engine.workspace] } } };
    }
    return { mcpServers: { "coldcoffee-toolbox": {
      command: process.execPath,
      args: [app.isPackaged ? path.join(process.resourcesPath, "toolbox", "mcp.js") : path.join(__dirname, "lib", "toolbox", "mcp.js"), "--workspace", engine.workspace],
      env: { ELECTRON_RUN_AS_NODE: "1" },
    } } };
  }
  if (action === "skill") return fs.readFileSync(path.join(__dirname, "lib", "toolbox", "SKILL.md"), "utf8");
  if (action === "export-skill" || action === "export-task") {
    const task = action === "export-task" ? engine.get(payload.id) : null;
    const fileName = task ? `coldcoffee-${task.id}.json` : "coldcoffee-toolbox-SKILL.md";
    const result = await dialog.showSaveDialog(mainWindow, { title: task ? "导出实际运行结果" : "导出原创工具 skill", defaultPath: path.join(engine.workspace, fileName) });
    if (result.canceled || !result.filePath) return { canceled: true };
    const text = task ? JSON.stringify(task, null, 2) : fs.readFileSync(path.join(__dirname, "lib", "toolbox", "SKILL.md"), "utf8");
    fs.writeFileSync(result.filePath, text, "utf8");
    return { file: result.filePath };
  }
  if (action === "report") {
    const task = engine.get(payload.id);
    if (!task.report) throw new Error("报告尚未生成");
    const target = path.join(engine.workspace, task.report.directory);
    const error = await shell.openPath(target); if (error) throw new Error(error);
    return { directory: target };
  }
  throw new Error("未知原创工具箱操作");
});

handleTrusted("coldbrew:beginner", async (_event, action, payload = {}) => {
  if (action === "scan") {
    const links = beginner.collectShortcuts();
    return beginner.scanAll().map((row) => ({ ...row, launchers: row.ok ? beginner.launchersFrom(row.seat, links) : [] }));
  }
  if (action === "install") return beginner.installOne(String(payload.seat || ""), { confirm: payload.confirm === true });
  if (action === "uninstall") return beginner.uninstallOne(String(payload.seat || ""), { confirm: payload.confirm === true });
  if (action === "open") {
    const seat = String(payload.seat || "");
    const hit = beginner.matchLauncher(seat, payload.path);
    let toolbox = { code: "skip" };
    try {
      const { detectDirectory } = require("./lib/detect-directory");
      const found = detectDirectory(seat);
      toolbox = require("./lib/ida-mcp").attachSeat(seat, { root: found.root, layout: found.layout || "default" });
    } catch (error) {
      toolbox = { code: "skip", skipped: error.message };
    }
    const opened = await shell.openPath(hit.path);
    if (opened) throw new Error(opened);
    return { ok: true, name: hit.name, toolbox: toolbox.code || "skip" };
  }
  throw new Error("未知小白操作");
});

handleTrusted("coldbrew:open-docs", async () => {
  const packagedDocs = path.join(process.resourcesPath, "public", "docs", "index.html");
  const localDocs = path.resolve(__dirname, "..", "..", "docs", "index.html");
  const target = app.isPackaged && fs.existsSync(packagedDocs) ? packagedDocs : localDocs;
  if (fs.existsSync(target)) {
    await shell.openPath(target);
    return target;
  }
  await shell.openExternal("https://github.com/3641397194-wq/gpt6-Astra");
  return "https://github.com/3641397194-wq/gpt6-Astra";
});

handleTrusted("coldbrew:open-external", async (_event, value) => {
  const url = String(value || "").trim();
  if (!/^https:\/\/(?:github\.com|(?:www\.)?coldcoffeeai\.com)(\/|$)/i.test(url)) throw new Error("这个链接打不开");
  await shell.openExternal(url);
  return url;
});

handleTrusted("window:minimize", () => mainWindow?.minimize());
handleTrusted("window:maximize", () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize();
  return mainWindow.isMaximized();
});
handleTrusted("window:close", () => mainWindow?.close());

app.whenReady().then(() => {
  createSplash();
  createMain();
  setTimeout(() => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
    if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); mainWindow.focus(); }
  }, 1800);
});

app.on("window-all-closed", () => app.quit());
