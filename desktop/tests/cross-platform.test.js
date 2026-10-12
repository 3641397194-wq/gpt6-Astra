"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { detectDirectory, platformDataHome: detectDataHome } = require("../src/lib/detect-directory");
const idaToolbox = require("../src/lib/ida-toolbox");
const idaMcp = require("../src/lib/ida-mcp");
const seatRuntime = require("../src/lib/seat-runtime");

test("macOS and Linux use native data directories for directory detection", () => {
  const home = path.join(fs.realpathSync(os.tmpdir()), "coldbrew-cross-platform-home");
  assert.equal(detectDataHome({ home, env: {}, platform: "darwin" }), path.join(home, "Library", "Application Support"));
  assert.equal(detectDataHome({ home, env: {}, platform: "linux" }), path.join(home, ".local", "share"));
  assert.equal(detectDataHome({ home, env: { XDG_DATA_HOME: "/xdg-data" }, platform: "linux" }), "/xdg-data");

  const mac = detectDirectory("doubao", { home, env: {}, platform: "darwin" });
  assert.equal(mac.root, path.join(home, "Library", "Application Support", "Doubao", "User Data", "Default", ".doubao", "agent_mode", "workspace", ".user_skills"));
  const linux = detectDirectory("doubao", { home, env: { XDG_DATA_HOME: "/xdg-data" }, platform: "linux" });
  assert.match(linux.root, /xdg-data[\\/]Doubao[\\/]User Data[\\/]Default[\\/]\.doubao[\\/]agent_mode[\\/]workspace[\\/]\.user_skills$/);
});

test("IDA plugin target follows the host platform", () => {
  const home = path.join(fs.realpathSync(os.tmpdir()), "coldbrew-ida-home");
  const mac = idaToolbox.resolveTarget({ home, env: {}, platform: "darwin" });
  assert.equal(mac.target, path.join(home, "Library", "Application Support", "Hex-Rays", "IDA Pro", "plugins"));
  assert.equal(mac.targetSource, "macOS 用户目录");
  const linux = idaToolbox.resolveTarget({ home, env: {}, platform: "linux" });
  assert.equal(linux.target, path.join(home, ".idapro", "plugins"));
  assert.equal(linux.targetSource, "Linux 用户目录");
  const windows = idaToolbox.resolveTarget({ home, env: {}, platform: "win32" });
  assert.equal(windows.target, path.join(home, "AppData", "Roaming", "Hex-Rays", "IDA Pro", "plugins"));
  assert.equal(windows.targetSource, "APPDATA");
});

test("IDAUSR path lists and MCP package paths work on Unix", () => {
  const home = path.join(fs.realpathSync(os.tmpdir()), "coldbrew-idausr-home");
  const mac = idaToolbox.resolveTarget({ home, env: { IDAUSR: "/Users/fixture/ida-one:/Users/fixture/ida-two" }, platform: "darwin" });
  assert.match(mac.target, /ida-one[\\/]plugins$/);
  const tilde = idaToolbox.resolveTarget({ home, env: { IDAUSR: "~/ida-user" }, platform: "darwin" });
  assert.equal(tilde.target, path.join(home, "ida-user", "plugins"));
  assert.equal(idaMcp.findPython({ platform: "darwin" }), "python3");
  assert.equal(idaMcp.findPython({ platform: "linux" }), "python3");
  assert.equal(idaMcp.platformDataHome({}, home, "darwin"), path.join(home, "Library", "Application Support"));
  assert.equal(idaMcp.platformDataHome({ XDG_DATA_HOME: "/xdg-data" }, home, "linux"), "/xdg-data");
  assert.equal(seatRuntime.doubaoSkillsHome({ env: {}, home, platform: "darwin" }), path.join(home, "Library", "Application Support", "Doubao", "User Data", "Default", ".doubao", "agent_mode", "workspace", ".user_skills"));
});

test("IDA MCP package installation keeps platform-specific package root", () => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "coldbrew-mcp-package-"));
  const packageDir = path.join(root, "Library", "Application Support", "gpt6-Astra", "ida-pro-mcp");
  const source = path.join(packageDir, "ida_pro_mcp");
  fs.mkdirSync(path.join(source, "ida_mcp"), { recursive: true });
  fs.writeFileSync(path.join(source, "ida_mcp.py"), "# fixture\n");
  assert.equal(idaMcp.installPackage({ packageDir, platform: "darwin" }), source);
  fs.rmSync(root, { recursive: true, force: true });
});
