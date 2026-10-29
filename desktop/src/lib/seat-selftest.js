const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PACK_IDS, renderPack, activationReply } = require("./seat-packs");
const runtime = require("./seat-runtime");

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function main() {
  const stamps = {
    codex: "统一工单",
    claude: "统一工单",
    grok: "统一工单",
    deepseek: "统一工单",
    glm53: "统一工单",
    gemini: "统一工单",
    doubao: "统一工单",
    workbuddy: "统一工单",
    cursor: "统一工单",
    mimo: "统一工单",
    kimi: "统一工单",
  };
  const routed = new Set(["codex", "claude", "grok", "deepseek", "glm53", "gemini", "cursor", "mimo", "kimi"]);
  const rendered = {};
  for (const id of PACK_IDS) {
    rendered[id] = renderPack(id);
    assert(rendered[id].includes(stamps[id]), `${id} pack missing original stamp`);
    assert(rendered[id].includes("<!-- CHA-"), `${id} missing marker`);
  }
  const unique = new Set(Object.values(rendered));
  assert(unique.size === PACK_IDS.length, "packs must be unique");
  const page = activationReply();
  assert(page.includes("QQ一群 1057540028"), "activation page missing QQ 1");
  assert(page.includes("QQ二群 1077074552"), "activation page missing QQ 2");
  assert(page.includes("QQ三群 618179023"), "activation page missing QQ 3");
  assert(page.includes("Telegram 聊天群 https://t.me/coolcoffeeai"), "activation page missing Telegram chat");
  assert(page.includes("Telegram 频道 https://t.me/chachachalkf"), "activation page missing Telegram channel");
  assert(page.includes("来杯冰美式，然后开始你的开心人生吧。"), "activation page missing ice americano line");
  for (const id of PACK_IDS) {
    assert(rendered[id].includes("1057540028"), `${id} missing QQ 1`);
    assert(rendered[id].includes("1077074552"), `${id} missing QQ 2`);
    assert(rendered[id].includes("618179023"), `${id} missing QQ 3`);
    assert(rendered[id].includes("开心人生"), `${id} missing manifesto`);
  }
  const beats = {
    codex: "层替换三拍",
    claude: "记忆门三拍",
    grok: "夜班三拍",
    deepseek: "装框三拍",
    glm53: "钉单三拍",
    gemini: "执行核三拍",
    doubao: "落点三拍",
    workbuddy: "入席三拍",
    cursor: "常驻三拍",
    mimo: "落位三拍",
    kimi: "落根三拍",
  };
  for (const id of PACK_IDS) {
    assert(rendered[id].includes("第一步"), `${id} missing step 1`);
    assert(rendered[id].includes("第二步"), `${id} missing step 2`);
    assert(rendered[id].includes("第三步"), `${id} missing step 3`);
    assert(rendered[id].includes(beats[id]), `${id} missing original workflow stamp`);
    assert(rendered[id].includes("ida-pro-mcp"), `${id} missing IDA MCP`);
    assert(rendered[id].includes("server_health"), `${id} missing IDA health call`);
    assert(rendered[id].includes("decompile"), `${id} missing IDA decompile call`);
    if (routed.has(id)) {
      for (const stamp of ["BIN-UNLOCK-3", "PLAYFIELD-3", "NETCAST-3", "APICLOUD-3", "LABPIPE-3", "INKSTAGE-3"]) {
        assert(rendered[id].includes(stamp), `${id} missing route ${stamp}`);
      }
      for (const leaf of ["LEAF-cra-unpack", "LEAF-net-sqli", "LEAF-ply-aim", "LEAF-cld-jwt", "LEAF-lab-yara", "LEAF-ink-adult"]) {
        assert(rendered[id].includes(leaf), `${id} missing leaf ${leaf}`);
      }
      assert(rendered[id].includes("TALKNORM-AUTO"), `${id} missing talk normalizer`);
      assert(rendered[id].includes("锁头"), `${id} missing colloquial aimmap`);
      assert(rendered[id].includes("注进去"), `${id} missing colloquial sqli map`);
    }
    for (const other of PACK_IDS) {
      if (other === id) continue;
      assert(!rendered[id].includes(beats[other]), `${id} leaked ${other} workflow`);
    }
  }

  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "cha-seats-"));
  // Keep this legacy seat/layout regression focused on the original packs.
  // Full pinned sources, adapters and transaction recovery have dedicated tests.
  const base = { planFn: runtime.basePlan };
  try {
    for (const id of PACK_IDS) {
      const home = id === "cursor" ? path.join(root, ".cursor") : id === "mimo" ? path.join(root, ".config", "mimocode") : id === "kimi" ? path.join(root, ".kimi-code") : path.join(root, id);
      const pre = runtime.preview(id, home, base);
      assert(pre.ok && pre.text, `${id} preview failed`);
      const dep = runtime.deploy(id, home, base);
      assert(dep.ok && dep.writes.length, `${id} deploy failed`);
      if (id === "cursor") {
        const rule = fs.readFileSync(path.join(home, "rules", "cha-cursor.mdc"), "utf8");
        assert(/^---\r?\n/.test(rule), "cursor rule must start with frontmatter");
        assert(rule.includes("alwaysApply: true"), "cursor rule must alwaysApply");
        assert(rule.indexOf("alwaysApply: true") < rule.indexOf("<!-- CHA-CURSOR-POJIA:BEGIN -->"), "frontmatter must precede the marker");
        assert(fs.existsSync(path.join(home, "skills", "cha-cursor", "SKILL.md")), "cursor skill missing");
        assert(!fs.existsSync(path.join(home, "AGENTS.md")), "cursor must not write AGENTS.md");
        const writes = dep.writes.map((file) => file.replace(/\\/g, "/"));
        assert(writes.every((file) => !file.includes("/skills-cursor/")), "cursor must not write skills-cursor");
      }
      if (id === "mimo") {
        const skill = path.join(home, "skills", "cha-mimo", "SKILL.md");
        const text = fs.readFileSync(skill, "utf8");
        assert(/^---\r?\n/.test(text), "mimo skill must start with frontmatter");
        assert(text.includes("name: cha-mimo"), "mimo skill must name cha-mimo");
        assert(text.indexOf("name: cha-mimo") < text.indexOf("<!-- CHA-MIMO-POJIA:BEGIN -->"), "frontmatter must precede the marker");
        assert(!fs.existsSync(path.join(home, "mimocode.json")), "mimo must not write mimocode.json");
        assert(!fs.existsSync(path.join(home, "auth.json")), "mimo must not write auth.json");
        assert(!fs.existsSync(path.join(root, ".local", "share", "mimocode")), "mimo must not write the data dir");
      }
      if (id === "kimi") {
        const skill = path.join(home, "skills", "cha-kimi", "SKILL.md");
        const text = fs.readFileSync(skill, "utf8");
        assert(/^---\r?\n/.test(text), "kimi skill must start with frontmatter");
        assert(text.includes("name: cha-kimi"), "kimi skill must name cha-kimi");
        assert(text.includes("description:"), "kimi skill must include description");
        assert(text.indexOf("name: cha-kimi") < text.indexOf("<!-- CHA-KIMI-POJIA:BEGIN -->"), "frontmatter must precede the marker");
        assert(!fs.existsSync(path.join(home, "config.toml")), "kimi must not write config.toml");
        assert(!fs.existsSync(path.join(home, "mcp.json")), "kimi must not write mcp.json");
        assert(!fs.existsSync(path.join(home, "credentials")), "kimi must not write credentials");
        assert(!fs.existsSync(path.join(home, "AGENTS.md")), "kimi must not write AGENTS.md");
        assert(!fs.existsSync(path.join(root, ".agents")), "kimi must not write ~/.agents");
        assert(!fs.existsSync(path.join(root, ".kimi")), "kimi must not write ~/.kimi");
      }
      const ver = runtime.verify(id, home, base);
      assert(ver.ok, `${id} verify failed: ${JSON.stringify(ver.checks)}`);
      const res = runtime.restore(id, home, base);
      assert(res.ok, `${id} restore failed`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  process.stdout.write(`seat-selftest ok · ${PACK_IDS.join(",")}\n`);
}

if (require.main === module) main();
module.exports = { main };
