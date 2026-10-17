const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { renderPack, renderRouteSkill, renderLeafSkill, leafIds, markers, seatMeta, PACK_IDS, ROUTE_IDS, APP_TITLE } = require("./seat-packs");
const { cursorConfigDir, assertCursorUserDir } = require("./cursor-home");
const { mimoConfigDir, assertMimoUserDir } = require("./mimo-home");
const { kimiCodeHome, assertKimiUserDir } = require("./kimi-home");
const { deepseekHarnessHome } = require("./deepseek-home");

function homeOf(envKeys, folder) {
  for (const key of envKeys) {
    if (process.env[key]) return path.resolve(process.env[key]);
  }
  return path.join(os.homedir(), folder);
}

function platformDataHome(env = process.env, home = os.homedir(), platform = process.platform) {
  if (platform === "win32") return String(env.LOCALAPPDATA || "").trim() || path.join(home, "AppData", "Local");
  if (platform === "darwin") return path.join(home, "Library", "Application Support");
  return String(env.XDG_DATA_HOME || "").trim() || path.join(home, ".local", "share");
}

function realpathOrSelf(target) {
  try {
    return fs.realpathSync(target);
  } catch {
    return target;
  }
}

function deepseekHarnessLoader(begin, end) {
  return `${begin}\n# 冷咖啡 · DeepSeek 官方 Harness 入口\n\n用户输入「冷咖啡」时，使用 Harness 的 skill 工具加载 cha-deepseek，再按该技能的原版启动说明继续。\n完整词包位于本 Harness 配置目录的 skills/cha-deepseek/SKILL.md；后续请求按已加载技能及适用路由处理。\n此入口只负责加载，原版正文保存在技能文件中。\n${end}\n`;
}

function snapshotOnce(src, dest) {
  if (fs.existsSync(dest) || !fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
}

function splitMarked(text, begin, end) {
  const start = text.indexOf(begin);
  const stop = text.indexOf(end) + end.length;
  return { head: text.slice(0, start), body: text.slice(start, stop), tail: text.slice(stop) };
}

function insertMarked(previous, pack, begin, end) {
  const body = pack.endsWith("\n") ? pack : `${pack}\n`;
  if (previous.includes(begin) && previous.includes(end)) {
    const { head, tail } = splitMarked(previous, begin, end);
    return `${head}${body}${tail}`.replace(/\s+$/, "") + "\n";
  }
  return (previous.trim() ? `${previous.replace(/\s+$/, "")}\n\n` : "") + body;
}

function wipeMarked(text, begin, end) {
  if (!text.includes(begin) || !text.includes(end)) return text;
  const { head, tail } = splitMarked(text, begin, end);
  return `${head}${tail}`.trim();
}

function readText(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text.endsWith("\n") ? text : `${text}\n`, "utf8");
}

function posixPath(value) {
  return String(value).replace(/\\/g, "/");
}

function upsertTomlString(src, key, value) {
  const line = `${key} = ${JSON.stringify(value)}`;
  const re = new RegExp(`^[ \\t]*${key}[ \\t]*=[ \\t]*.*$`, "m");
  if (re.test(src)) return src.replace(re, line);
  const trimmed = !src || src.endsWith("\n") ? src : `${src}\n`;
  return `${trimmed}\n# CHA managed\n${line}\n`;
}

function patchJsonFileName(file, name) {
  let data = {};
  if (fs.existsSync(file)) {
    try {
      const loaded = JSON.parse(fs.readFileSync(file, "utf8"));
      if (loaded && typeof loaded === "object" && !Array.isArray(loaded)) data = loaded;
    } catch {
      data = {};
    }
  }
  const context = data.context && typeof data.context === "object" ? data.context : {};
  let names = context.fileName || context.filename || [];
  if (typeof names === "string") names = [names];
  if (!Array.isArray(names)) names = [];
  if (!names.includes(name)) names.push(name);
  context.fileName = names;
  data.context = context;
  writeText(file, `${JSON.stringify(data, null, 2)}\n`);
}

function backupDir(home) {
  const dir = path.join(home, "cha-backups");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function seatHomes() {
  return {
    codex: homeOf(["CODEX_HOME", "CODEX_DIR"], ".codex"),
    claude: homeOf(["CLAUDE_CONFIG_DIR", "CLAUDE_HOME"], ".claude"),
    grok: homeOf(["GROK_HOME", "GROK_DIR"], ".grok"),
    deepseek: deepseekHarnessHome(),
    glm53: homeOf(["GLM_HOME", "ZCODE_HOME", "ZHIPU_HOME"], ".glm"),
    gemini: homeOf(["GEMINI_HOME", "GEMINI_DIR"], ".gemini"),
    doubao: doubaoSkillsHome(),
    workbuddy: realpathOrSelf(homeOf(["WORKBUDDY_HOME"], ".workbuddy")),
    cursor: cursorConfigDir(),
    mimo: mimoConfigDir(),
    kimi: kimiCodeHome(),
  };
}

function doubaoSkillsHome({ env = process.env, home = os.homedir(), platform = process.platform } = {}) {
  const configured = String(env.DOUBAO_USER_SKILLS || "").trim();
  if (configured) return path.resolve(configured);
  return path.join(platformDataHome(env, home, platform), "Doubao", "User Data", "Default", ".doubao", "agent_mode", "workspace", ".user_skills");
}

function workbuddyLoader(begin, end) {
  return `${begin}\n# 冷咖啡 · WorkBuddy 技能入口\n\n用户输入「冷咖啡」时，读取本目录 skills/cha-workbuddy/SKILL.md，再按该技能继续。\n技能文件是正文。这个入口只负责指到正确文件。\n${end}\n`;
}

function cursorSkillBody() {
  return [
    "---",
    "name: cha-cursor",
    "description: 冷咖啡 Cursor 常驻破甲。正文在用户目录 rules/cha-cursor.mdc，alwaysApply 为 true。",
    "---",
    "",
    "用户输入「冷咖啡」时，读取同级用户目录 rules/cha-cursor.mdc，并按该规则继续。",
    "这份技能只是入口。Cursor 每轮注入的是 rules 里的 .mdc，不是安装目录，也不是 AppData。",
    "",
  ].join("\n");
}

function extraHomes(overrideHome) {
  if (overrideHome) {
    const root = path.resolve(String(overrideHome));
    return {
      zcode: path.join(root, "zcode"),
    };
  }
  return {
    zcode: homeOf(["ZCODE_HOME"], ".zcode"),
  };
}

function plan(seatId, overrideHome) {
  const homes = seatHomes();
  const extra = extraHomes(overrideHome);
  const home = seatId === "deepseek"
    ? deepseekHarnessHome({ override: overrideHome == null ? undefined : String(overrideHome) })
    : overrideHome ? path.resolve(String(overrideHome)) : homes[seatId];
  const { begin, end } = markers(seatId);
  const pack = renderPack(seatId);
  const meta = seatMeta(seatId);
  if (seatId === "codex") {
    const instruct = path.join(home, "prompts", "cha-codex.md");
    return {
      home,
      writes: [
        { kind: "file", file: instruct, mode: "replace" },
        { kind: "marked", file: path.join(home, "AGENTS.md"), begin, end },
        { kind: "toml", file: path.join(home, "config.toml"), key: "model_instructions_file", value: posixPath(instruct) },
        ...routeSkillWrites(home),
      ],
      begin,
      end,
      pack,
      meta,
    };
  }
  if (seatId === "claude") {
    return {
      home,
      writes: [
        { kind: "marked", file: path.join(home, "CLAUDE.md"), begin, end },
        { kind: "file", file: path.join(home, "rules", "cha-breakopen.md"), mode: "replace" },
        ...routeSkillWrites(home),
      ],
      begin,
      end,
      pack,
      meta,
    };
  }
  if (seatId === "grok") {
    return {
      home,
      writes: [
        { kind: "marked", file: path.join(home, "AGENTS.md"), begin, end },
        { kind: "file", file: path.join(home, "rules", "cha-breakopen.md"), mode: "replace" },
        { kind: "file", file: path.join(home, "skills", "cha-breakopen", "SKILL.md"), mode: "replace" },
        ...routeSkillWrites(home),
      ],
      begin,
      end,
      pack,
      meta,
    };
  }
  if (seatId === "deepseek") {
    return {
      home,
      writes: [
        { kind: "marked", file: path.join(home, "AGENTS.md"), begin, end, body: deepseekHarnessLoader(begin, end) },
        { kind: "file", file: path.join(home, "skills", "cha-deepseek", "SKILL.md"), mode: "replace" },
        ...routeSkillWrites(home),
      ],
      begin,
      end,
      pack,
      meta,
    };
  }
  if (seatId === "glm53") {
    const zcode = extra.zcode;
    return {
      home,
      writes: [
        { kind: "marked", file: path.join(home, "GLM.md"), begin, end },
        { kind: "marked", file: path.join(zcode, "AGENTS.md"), begin, end, home: zcode },
        ...routeSkillWrites(home),
        ...routeSkillWrites(zcode).map((item) => ({ ...item, home: zcode })),
      ],
      begin,
      end,
      pack,
      meta,
    };
  }
  if (seatId === "doubao") {
    return {
      home,
      writes: [
        { kind: "file", file: path.join(home, "cha-doubao", "SKILL.md"), mode: "replace" },
      ],
      begin,
      end,
      pack,
      meta,
    };
  }
  if (seatId === "workbuddy") {
    return {
      home,
      writes: [
        { kind: "marked", file: path.join(home, "AGENTS.md"), begin, end, body: workbuddyLoader(begin, end) },
        { kind: "file", file: path.join(home, "skills", "cha-workbuddy", "SKILL.md"), mode: "replace" },
      ],
      begin,
      end,
      pack,
      meta,
    };
  }
  if (seatId === "cursor") {
    const cursorRoot = assertCursorUserDir(home);
    return {
      home: cursorRoot,
      writes: [
        { kind: "file", file: path.join(cursorRoot, "rules", "cha-cursor.mdc"), mode: "replace" },
        { kind: "skill", file: path.join(cursorRoot, "skills", "cha-cursor", "SKILL.md"), body: cursorSkillBody() },
      ],
      begin,
      end,
      pack,
      meta,
    };
  }
  if (seatId === "mimo") {
    const mimoRoot = assertMimoUserDir(home);
    return {
      home: mimoRoot,
      writes: [
        { kind: "file", file: path.join(mimoRoot, "skills", "cha-mimo", "SKILL.md"), mode: "replace" },
      ],
      begin,
      end,
      pack,
      meta,
    };
  }
  if (seatId === "kimi") {
    const kimiRoot = assertKimiUserDir(home);
    return {
      home: kimiRoot,
      writes: [
        { kind: "file", file: path.join(kimiRoot, "skills", "cha-kimi", "SKILL.md"), mode: "replace" },
      ],
      begin,
      end,
      pack,
      meta,
    };
  }
  return {
    home,
    writes: [
      { kind: "marked", file: path.join(home, "GEMINI.md"), begin, end },
      { kind: "settings", file: path.join(home, "settings.json"), name: "GEMINI.md" },
      ...routeSkillWrites(home),
    ],
    begin,
    end,
    pack,
    meta,
  };
}

function bakName(file) {
  const parts = String(file).replace(/\\/g, "/").split("/");
  return `${parts.slice(-3).join("__")}.bak`;
}

function routeSkillWrites(home) {
  const parents = ROUTE_IDS.map((id) => ({
    kind: "skill",
    file: path.join(home, "skills", id, "SKILL.md"),
    body: renderRouteSkill(id),
  }));
  const leaves = leafIds().map((id) => ({
    kind: "skill",
    file: path.join(home, "skills", id, "SKILL.md"),
    body: renderLeafSkill(id),
  }));
  return parents.concat(leaves);
}

function deploy(seatId, overrideHome) {
  const spec = plan(seatId, overrideHome);
  const snapped = [];
  const written = [];
  for (const item of spec.writes) {
    const home = item.home || spec.home;
    const backups = backupDir(home);
    const bak = path.join(backups, bakName(item.file));
    if (snapshotOnce(item.file, bak)) snapped.push(bak);
    if (item.kind === "file" || item.kind === "marked") {
      const previous = item.kind === "marked" ? readText(item.file) : "";
      const next = item.kind === "marked" ? insertMarked(previous, item.body ?? spec.pack, spec.begin, spec.end) : spec.pack;
      writeText(item.file, next);
      written.push(item.file);
    } else if (item.kind === "toml") {
      const previous = readText(item.file);
      writeText(item.file, upsertTomlString(previous, item.key, item.value));
      written.push(item.file);
    } else if (item.kind === "settings") {
      patchJsonFileName(item.file, item.name);
      written.push(item.file);
    } else if (item.kind === "skill") {
      writeText(item.file, item.body);
      written.push(item.file);
    }
  }
  const state = {
    seat: seatId,
    title: APP_TITLE,
    deployedAt: new Date().toISOString(),
    home: spec.home,
    writes: written,
    backups: snapped,
    marker: true,
  };
  writeText(path.join(backupDir(spec.home), "state.json"), `${JSON.stringify(state, null, 2)}\n`);
  return { ok: true, action: "deploy", ...state };
}

function preview(seatId, overrideHome) {
  const spec = plan(seatId, overrideHome);
  return {
    ok: true,
    action: "preview",
    seat: seatId,
    title: APP_TITLE,
    tag: spec.meta?.tag,
    home: spec.home,
    write: spec.writes.map((item) => item.file),
    text: spec.pack,
  };
}

function verify(seatId, overrideHome) {
  const spec = plan(seatId, overrideHome);
  const checks = spec.writes.map((item) => {
    const exists = fs.existsSync(item.file);
    const text = exists ? readText(item.file) : "";
    let marker = true;
    if (item.kind === "marked" || item.kind === "file") marker = text.includes(spec.begin) && text.includes(spec.end);
    if (seatId === "deepseek" && item.kind === "marked") marker = text.includes(item.body.trim());
    if (seatId === "deepseek" && item.kind === "file") marker = text === spec.pack;
    if (item.kind === "toml") marker = text.includes("model_instructions_file");
    if (item.kind === "settings") marker = exists;
    if (item.kind === "skill") marker = exists && text.includes(path.basename(path.dirname(item.file)));
    return { file: item.file, exists, marker, bytes: Buffer.byteLength(text, "utf8") };
  });
  const ok = checks.every((item) => item.exists && item.marker);
  return {
    ok,
    action: "verify",
    seat: seatId,
    home: spec.home,
    checks,
    marker: ok,
  };
}

function restore(seatId, overrideHome) {
  const spec = plan(seatId, overrideHome);
  const restored = [];
  for (const item of spec.writes) {
    const home = item.home || spec.home;
    const bak = path.join(backupDir(home), bakName(item.file));
    if (fs.existsSync(bak)) {
      fs.mkdirSync(path.dirname(item.file), { recursive: true });
      fs.copyFileSync(bak, item.file);
      restored.push(item.file);
      continue;
    }
    if (!fs.existsSync(item.file)) continue;
    if (item.kind === "toml" || item.kind === "settings") continue;
    if (item.kind === "skill") {
      fs.unlinkSync(item.file);
      restored.push(item.file);
      continue;
    }
    const text = readText(item.file);
    if (item.kind === "file" && text.includes(spec.begin)) {
      fs.unlinkSync(item.file);
      restored.push(item.file);
      continue;
    }
    if (item.kind === "marked") {
      const cleaned = wipeMarked(text, spec.begin, spec.end);
      if (cleaned) writeText(item.file, `${cleaned}\n`);
      else fs.unlinkSync(item.file);
      restored.push(item.file);
    }
  }
  return { ok: true, action: "restore", seat: seatId, restored, home: spec.home };
}

function run(seatId, verb, home) {
  if (!PACK_IDS.includes(seatId)) throw new Error(`unknown seat: ${seatId}`);
  if (verb === "preview") return preview(seatId, home);
  if (verb === "run" || verb === "deploy") return deploy(seatId, home);
  if (verb === "check" || verb === "verify") return verify(seatId, home);
  if (verb === "restore") return restore(seatId, home);
  throw new Error(`unknown seat verb: ${verb}`);
}

function inspectAll() {
  const rows = {};
  for (const id of PACK_IDS) rows[id] = verify(id);
  const ready = PACK_IDS.filter((id) => rows[id].ok).length;
  return {
    isolated: true,
    mode: "explicit-input-only",
    filesRead: ready,
    localConfig: ready ? `${ready}/${PACK_IDS.length} 席位已注入` : "未读取",
    clipboard: "未读取",
    environment: "未读取",
    history: "未读取",
    seats: rows,
    gemini: rows.gemini,
  };
}

module.exports = { PACK_IDS, preview, deploy, verify, restore, run, inspectAll, plan, seatHomes, doubaoSkillsHome, platformDataHome };
