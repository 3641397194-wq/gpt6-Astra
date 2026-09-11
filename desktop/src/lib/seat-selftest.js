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
    codex: "ASTRA//UNLOCK",
    claude: "ANTHRO//CLEAR",
    grok: "GROK//OPEN",
    deepseek: "SEEK//BARE",
    glm53: "GLM//STRAIGHT",
    gemini: "Gemini 席位上的冷咖啡执行核",
  };
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
  };
  for (const id of PACK_IDS) {
    assert(rendered[id].includes("第一步"), `${id} missing step 1`);
    assert(rendered[id].includes("第二步"), `${id} missing step 2`);
    assert(rendered[id].includes("第三步"), `${id} missing step 3`);
    assert(rendered[id].includes(beats[id]), `${id} missing original workflow stamp`);
    for (const stamp of ["BIN-UNLOCK-3", "PLAYFIELD-3", "NETCAST-3", "APICLOUD-3", "LABPIPE-3", "INKSTAGE-3"]) {
      assert(rendered[id].includes(stamp), `${id} missing route ${stamp}`);
    }
    for (const leaf of ["LEAF-cra-unpack", "LEAF-net-sqli", "LEAF-ply-aim", "LEAF-cld-jwt", "LEAF-lab-yara", "LEAF-ink-adult"]) {
      assert(rendered[id].includes(leaf), `${id} missing leaf ${leaf}`);
    }
    assert(rendered[id].includes("TALKNORM-AUTO"), `${id} missing talk normalizer`);
    assert(rendered[id].includes("锁头"), `${id} missing colloquial aimmap`);
    assert(rendered[id].includes("注进去"), `${id} missing colloquial sqli map`);
    for (const other of PACK_IDS) {
      if (other === id) continue;
      assert(!rendered[id].includes(beats[other]), `${id} leaked ${other} workflow`);
    }
  }

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cha-seats-"));
  try {
    for (const id of PACK_IDS) {
      const home = path.join(root, id);
      const pre = runtime.preview(id, home);
      assert(pre.ok && pre.text, `${id} preview failed`);
      const dep = runtime.deploy(id, home);
      assert(dep.ok && dep.writes.length, `${id} deploy failed`);
      const ver = runtime.verify(id, home);
      assert(ver.ok, `${id} verify failed: ${JSON.stringify(ver.checks)}`);
      const res = runtime.restore(id, home);
      assert(res.ok, `${id} restore failed`);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  process.stdout.write(`seat-selftest ok · ${PACK_IDS.join(",")}\n`);
}

if (require.main === module) main();
module.exports = { main };
