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
const { RelayAdapter } = require("./lib/relay-adapter");
const relayAdapter = new RelayAdapter();
const { assertTrustedSender, protectWindow } = require("./lib/window-security");
const WORKBENCH_ENTRY = path.join(__dirname, "workbench", "index.html");

const COMMUNITY = {
  qq: [
    { name: "交流群", value: "1057540028" },
    { name: "专题群", value: "1077074552" },
    { name: "Cool coffeeAI交流", value: "618179023" },
  ],
};

let splashWindow;
let mainWindow;

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
    title: APP_TITLE,
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
    title: APP_TITLE,
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
  mainWindow.loadFile(WORKBENCH_ENTRY, process.argv.includes("--relay") ? { hash: "relay" } : {});
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

handleTrusted("coldbrew:compose", (_event, payload) => workbenchCore.compose(payload));
handleTrusted("coldbrew:evaluate", (_event, answer, options) => workbenchCore.evaluate(answer, options));

handleTrusted("coldbrew:inspect", () => seatRuntime.inspectAll());

handleTrusted("coldbrew:gemini", (_event, verb, payload = {}) => geminiSeat.run(verb, payload.home));
handleTrusted("coldbrew:seat", (_event, seatId, verb, payload = {}) => seatRuntime.run(String(seatId || ""), verb, payload.home));

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
  if (!/^https:\/\/(?:github\.com|(?:www\.)?coldcoffeeai\.com)(\/|$)/i.test(url)) throw new Error("只允许打开仓库或冷咖啡中转链接");
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
