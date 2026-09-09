const ui = {
  clock: document.getElementById("clock"),
  profileBar: document.getElementById("profileBar"),
  profileSummary: document.getElementById("profileSummary"),
  channelBar: document.getElementById("channelBar"),
  channelHint: document.getElementById("channelHint"),
  target: document.getElementById("targetInput"),
  seatGrid: document.getElementById("seatGrid"),
  readyCount: document.getElementById("readyCount"),
  runtimeGrid: document.getElementById("runtimeGrid"),
  activity: document.getElementById("activityLog"),
  output: document.getElementById("resultOutput"),
  heroDetail: document.getElementById("heroDetail"),
  toast: document.getElementById("toast"),
};

let meta = { profiles: [], seats: [], channels: [], community: { qq: [] } };
let profile = "max";
let channel = "ALL";
let toastTimer;

function now() { return new Date().toTimeString().slice(0, 8); }
function toast(message) { ui.toast.textContent = message; ui.toast.classList.add("show"); clearTimeout(toastTimer); toastTimer = setTimeout(() => ui.toast.classList.remove("show"), 2300); }
function log(message, kind = "") { const line = document.createElement("div"); line.className = `log-line ${kind}`; line.textContent = `[${now()}] ${message}`; ui.activity.appendChild(line); ui.activity.scrollTop = ui.activity.scrollHeight; }
function selectedProfile() { return meta.profiles.find((item) => item.id === profile) || meta.profiles[0]; }
function selectedChannel() { return meta.channels.find((item) => item.id === channel); }

function renderProfiles() {
  ui.profileBar.replaceChildren();
  meta.profiles.forEach((item) => {
    const button = document.createElement("button");
    button.className = `segment${item.id === profile ? " is-on" : ""}`;
    button.textContent = item.label;
    button.title = item.tone;
    button.addEventListener("click", () => { profile = item.id; renderProfiles(); ui.profileSummary.textContent = item.tone; log(`档位 ${item.label} 已启用`, "ok"); });
    ui.profileBar.appendChild(button);
  });
  ui.profileSummary.textContent = selectedProfile()?.tone || "当前档位已准备";
}

function renderChannels() {
  ui.channelBar.replaceChildren();
  const all = { id: "ALL", label: "全开", hint: "自动选择 · 按当前目标组织工作链", color: "#d42b31" };
  [all, ...meta.channels].forEach((item) => {
    const button = document.createElement("button");
    button.className = `channel-tab${item.id === channel ? " is-on" : ""}`;
    button.textContent = item.label;
    button.title = item.hint;
    button.addEventListener("click", () => { channel = item.id; renderChannels(); ui.channelHint.textContent = item.hint; log(`工作通道 ${item.label} 已选择`, "ok"); });
    ui.channelBar.appendChild(button);
  });
  ui.channelHint.textContent = (selectedChannel() || all).hint;
}

function renderSeats() {
  ui.seatGrid.replaceChildren();
  meta.seats.forEach((seat) => {
    const card = document.createElement("article"); card.className = "seat-card"; card.style.setProperty("--seat-accent", seat.accent);
    card.innerHTML = `<div class="seat-top"><span class="seat-index">${seat.mark} / SEAT</span><span class="seat-status">READY</span></div><h3>${seat.tag}</h3><p>${seat.short}</p><div class="seat-actions"></div>`;
    const actions = card.querySelector(".seat-actions");
    [["预览", "preview"], ["运行", "run"], ["检查", "check"], ["恢复", "restore"]].forEach(([label, verb]) => { const button = document.createElement("button"); button.textContent = label; button.addEventListener("click", () => runSeat(seat, verb)); actions.appendChild(button); });
    ui.seatGrid.appendChild(card);
  });
  ui.readyCount.innerHTML = `${meta.seats.length} / ${meta.seats.length} <small>READY</small>`;
}

function renderRuntime(value) {
  ui.runtimeGrid.replaceChildren();
  const rows = [["MODE", value.mode, "运行模式"], ["FILES READ", String(value.filesRead), "本次会话"], ["LOCAL CONFIG", value.localConfig, "配置访问"], ["CLIPBOARD", value.clipboard, "剪贴板访问"], ["ENVIRONMENT", value.environment, "环境变量"], ["HISTORY", value.history, "历史记录"]];
  rows.forEach(([label, text, detail]) => { const item = document.createElement("div"); item.className = "runtime-item"; item.innerHTML = `<b>${label}</b><span>${text}</span><small>${detail}</small>`; ui.runtimeGrid.appendChild(item); });
}

function renderCommunity() {
  const root = document.getElementById("communityGrid"); root.replaceChildren();
  (meta.community.qq || []).map((item) => ({ type: "QQ", ...item })).forEach((item) => {
    const card = document.createElement("article"); card.className = "community-card"; card.innerHTML = `<b>${item.type} ${item.name}</b><span>${item.value}</span><small>点击复制或打开入口</small>`;
    const button = document.createElement("button"); button.textContent = item.url ? "打开并复制" : "复制群号"; button.addEventListener("click", async () => { await navigator.clipboard?.writeText(item.value); if (item.url) await window.coldbrew.openExternal(item.url); log(`社群入口 ${item.value} 已处理`, "ok"); toast("社群入口已复制"); }); card.appendChild(button); root.appendChild(card);
  });
}

async function runSeat(seat, verb) {
  log(`${seat.tag} / ${verb.toUpperCase()} 开始`);
  const result = await window.coldbrew.seat(seat.id, verb);
  ui.output.textContent = result?.text ? result.text : JSON.stringify(result, null, 2);
  const ok = result?.ok !== false;
  log(`${seat.tag} / ${verb.toUpperCase()} ${ok ? "完成" : "未完成"}`, ok ? "ok" : "error");
  toast(ok ? `${seat.tag} ${verb} 完成` : `${seat.tag} 席位需要检查`);
  if (verb === "run" || verb === "check" || verb === "restore") await inspect();
}

async function runMax() {
  const prompt = ui.target.value.trim();
  if (!prompt) { ui.target.focus(); toast("请先输入明确目标"); log("MAX 等待目标输入", "warn"); return; }
  log(`MAX / ${meta.activation} / ${meta.control} 开始`);
  const result = await window.coldbrew.activate({ word: meta.activation, profile, channel, prompt });
  ui.output.textContent = result?.ok ? result.text : (result?.error || "启动失败");
  log(result?.ok ? "MAX 工作链完成" : "MAX 工作链未完成", result?.ok ? "ok" : "error");
  ui.heroDetail.textContent = result?.ok ? `${result.stages.join(" → ")} · 结果已写入活动流。` : "请检查启动词和当前输入。";
  toast(result?.ok ? "MAX 已启动" : "需要检查输入");
}

async function inspect() { const result = await window.coldbrew.inspect(); renderRuntime(result); log("运行环境检查完成", "ok"); toast("隔离状态已确认"); }
async function checkWorkspace() { const result = await window.coldbrew.inspect(); ui.output.textContent = JSON.stringify(result, null, 2); renderRuntime(result); log("当前工作区验收完成 · 隔离输入模式", "ok"); toast("验收完成"); }

async function boot() {
  meta = await window.coldbrew.meta();
  renderProfiles(); renderChannels(); renderSeats(); renderCommunity();
  await inspect();
  log(`${meta.activation} 已识别 · ${meta.control} 已加载`, "ok");
}

document.getElementById("runMaxBtn").addEventListener("click", runMax);
document.getElementById("checkBtn").addEventListener("click", checkWorkspace);
document.getElementById("inspectBtn").addEventListener("click", inspect);
document.getElementById("clearTarget").addEventListener("click", () => { ui.target.value = ""; ui.target.focus(); toast("输入已清空"); });
document.getElementById("clearLog").addEventListener("click", () => { ui.activity.replaceChildren(); log("活动流已清空"); });
document.getElementById("docsBtn").addEventListener("click", () => window.coldbrew.openDocs());
document.getElementById("communityBtn").addEventListener("click", () => document.getElementById("community").scrollIntoView({ behavior: "smooth" }));
document.getElementById("minBtn").addEventListener("click", () => window.coldbrew.minimize());
document.getElementById("maxBtn").addEventListener("click", () => window.coldbrew.maximize());
document.getElementById("closeBtn").addEventListener("click", () => window.coldbrew.close());
document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => { document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("is-on", item === button)); document.getElementById(button.dataset.jump)?.scrollIntoView({ behavior: "smooth", block: "start" }); }));
document.addEventListener("keydown", (event) => { if (!(event.ctrlKey || event.metaKey)) return; const index = Number(event.key); if (index >= 1 && index <= 5) { event.preventDefault(); document.querySelector(`.nav-item:nth-child(${index})`)?.click(); } });
setInterval(() => { ui.clock.textContent = now(); }, 1000);
boot();
