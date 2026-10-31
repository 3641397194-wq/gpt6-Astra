# 冷咖啡 DeepSeek Harness 原生插件

插件复用现有 REA、reverse-skill 完整快照、适配入口和 REA MCP 配置。它通过官方 Cordis 扩展在 Harness Desktop / Web 的图形文档中注入全局冰蓝皮肤、开屏与侧面板，并通过官方会话服务提交任务。工作台 `3.2.0-preview.6` 内置插件 `0.1.1`；技能原文、已有欢迎词和客户的模型配置保持原样。

## 官方源代码核验

参考的两个上游版本：

- 既有兼容基线 `0.2.1-rc.2`：`687f282e8625c6b8d11ff58211a90524be2e4317`。
- 2026-10-30 获取的默认分支 `0.2.2-alpha.2`：`ce7073d51254c26cd63b22a60835b8f948deb447`。

本轮运行验收另外使用官方 nightly feed 的 Windows Desktop 成品 `0.2.1-rc.5`（构建 `d4db512a969fccf0c5cc7ec8fe38e9c1d27af916`）；源码核验与成品运行记录分别保留。

真实接口和来源：

| 接入点 | 官方合同 |
| --- | --- |
| `export function apply(ctx, config)`、`ctx.inject`、生命周期清理 | [官方插件教程](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/docs/user/develop/basic/index.md) |
| `webserver/index-inject` 以及 `style` / `html` / `script` / `global` 行 | [pinned WebServer](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/host/webserver/src/index.ts)、[当前结构化注入](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/host/webserver/src/injections.ts) |
| `webServer.register({kind:'prefix',path,handler})`、`getOrigin()` | [当前 WebServer](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/host/webserver/src/index.ts) |
| Desktop `dsh-app://app`、`protocol.handle` 与 `forwardWebRequest` | [pinned Desktop 主进程](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/apps/desktop/src/main.ts)、[pinned 协议转发](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/apps/desktop/src/web-document.ts)、[当前协议转发](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/apps/desktop/src/web-document.ts) |
| Desktop Host 的 profile 加载、index 注入与 ready | [Desktop Host](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/apps/desktop-host/src/index.ts)、[Web 页面入口](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/apps/web/src/main.ts) |
| `sessionController.create({})`、`prompt(request, signal)`、`cancel({sessionId})` | [pinned 会话服务](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/api/session-controller/src/index.ts)、[当前请求类型](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/api/session-controller/src/types.ts) |
| `tools/result(exec,result)` | [pinned tools](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/core/tools/src/index.ts)、[当前事件](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/core/tools/src/events.ts) |
| `session/event(session,event)`，包含 `turn/start` / `turn/end` / `assistant/message` | [会话服务](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/core/session/src/index.ts) |
| `/<skill-name>` 在 Host 的 pre-step 阶段加载技能 | [官方技能工具](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/skill/tool-skill/src/index.ts) |

这两个官方版本的 `SessionPromptRequest` 都接受 `{sessionId,requestId,mode:'queue',content:[{type:'text',text}]}`；成功回执为 `{accepted:true}`。插件只把这个回执称为“已接收”，完成状态来自实际会话事件。

## 安装与启动

由工作台安装到明确选定的 Harness 根目录：

```text
DSH_HOME/
  cordis.patch.yml
  skills/                         现有原包与适配技能
  .coldcoffee-upstream/
    manifest.json
    rea-launcher.cjs
    sources/                      现有固定来源树
    runtime/rea/                  现有 REA 运行时
    harness-plugin/
      index.mjs
      package.json
      welcome.md                  原欢迎词的原始字节
      ui/panel.js
      ui/panel.css
      ui/theme.css                冷咖啡面板与开屏的冰蓝样式
      ui/host.css                 官方 Harness Web 全局皮肤
      ui/rem-blue.png             随包安装的静态主视觉
      ui/harness-background.png   随包安装的日常工作空间壁纸
      ui/rem-blue.svg
```

Home patch 仅插入本插件自己的唯一 id，保留其他配置和原 REA MCP 入口：

```yaml
- insert:
    - id: coldcoffee-harness
      name: 'ABSOLUTE_PATH_TO_HARNESS_PLUGIN/index.mjs'
      config:
        dshHome: 'SELECTED_DSH_HOME'
        upstreamRoot: 'SELECTED_DSH_HOME/.coldcoffee-upstream'
        animations: true
```

官方启动方式：

```sh
dsh web --host 127.0.0.1 --port 3080 --no-open
```

在指定的 `DSH_HOME` 运行时自动读取上述 home patch。开发时可通过 `--patch ABSOLUTE_PATCH_FILE` 载入合成安装目录，使用明确的测试 `DSH_HOME`，不读取其他 AI 的配置、资料、历史或密钥。插件本身不依赖额外 npm 包，不另起 HTTP 服务，也不修改官方 Harness 代码。

官方 Desktop 使用 `dsh-app://app` 自定义协议页面。插件在该页面将 `/coldcoffee` 及后续接口保持为相对地址，经过官方客户端已有的协议代理转发给 Host；宿主认证 Cookie 由客户端添加。Web 端仍沿用当前本机 listener 的接口。插件共用同一份 Home patch、Cordis 注入和会话服务，新增适配集中于页面端请求路径；Headless / TUI 环境的 `webServer` 继续为可选服务。

Desktop 的 `profiles/desktop` 和 CLI 使用同一个 Home 根。工作台继续合并该 Home 的 `cordis.patch.yml`，保留 profile 内官方管理的配置。官方 Host 在加载 profile 后收集 index 注入，再通过 Desktop ready 事件让页面应用插件。

旧版从 Desktop 页面直接请求绝对 loopback URL 会跳过官方代理与认证路径。这次修复通过相对接口复用官方代理。官方 Windows `0.2.1-rc.5` bundle 的实际运行验收已完成：八项检查通过，包含原生会话对本机模型 fixture 完成任务；具体结果与观察入口范围见 [插件验收说明](DEEPSEEK-PLUGIN.md#已验证与待验收)。

## 内部 UI 接口

同页注入 `window.COLDCOFFEE_HARNESS`：`basePath` 默认 `/coldcoffee`，`apiBase` 为当前本机 listener 的 origin 加 basePath；包含 `token`、`styleText`、静态图片 data URI `assetUrl`、独立壁纸 `backgroundUrl`、`initialStatus`、`preview:false` 和相对接口地址。`panel.js` 在 `dsh-app://app` 上优先保留相对地址，通过官方协议代理发起请求，其余 Web 页面沿用 `apiBase`。`panel.css` 与 `theme.css` 合并后供冷咖啡侧面板的 Shadow DOM 使用；`host.css` 通过官方 `style` 注入覆盖整个 Harness 图形界面的官方设计变量、语义元素及菜单角色。

宿主样式均以 `html.coldcoffee-harness-skin` 为作用域，面板的「整个 Harness 冰蓝皮肤」开关只切换该标记，并在 `sessionStorage` 保存当前标签页的显示偏好。关闭皮肤时恢复官方页面外观；页面卸载时清理由插件添加的主题标记。插件没有重写宿主的聊天结构或任务逻辑。

主视觉在制作阶段生成后以 `ui/rem-blue.png` 随包安装，注入时读取本地图片并转成 data URI；同时保留原 SVG 资源。开屏的镜头、扫描光、HUD、环形标记及粒子采用 CSS 动画，遵循动画开关和系统减少动态效果设置。发行客户端不携带图像生成 API Key，也不在用户开窗时请求图像服务。

每个请求带 `X-ColdCoffee-Session: <本次运行的随机 capability>`，API 只接受本机 socket、准确的 Host，以及同源或受支持的 Desktop `Origin: null`。官方 Desktop 协议代理移除页面请求中的 `Host`、`Origin`、`Cookie` 与 `sec-fetch-site`，添加客户端持有的 Host 认证 Cookie，同时保留 `X-ColdCoffee-Session`。插件仍检查自己的随机 capability；两者各自保留原校验。这个随机值在内存生成，既不是模型 API Key，也不写入配置、源码或报告。

| 方法与路径 | 请求 / 响应 |
| --- | --- |
| `GET /api/status` | 插件、Harness 会话接口、文件安装数、REA 依赖就绪、已注册工具、成功调用证据分别展示 |
| `GET /api/welcome` | `{ok:true,text}`，全文来自原 `activation-reply.md` 的部署副本 |
| `POST /api/activate` | `{keyword:'冷咖啡'}`；完整匹配后允许面板发起任务并返回完整欢迎词 |
| `POST /api/tasks` | `{workflow,input}`；实际调用官方 `create` 和 `prompt`；HTTP 202 代表已接收，后续读取状态 |
| `GET /api/history` | 仅本次插件运行内创建的任务与实际事件，不读取其他会话 |
| `POST /api/tasks/cancel` | `{taskId}`，仅可停止本插件创建的会话任务 |
| `POST /api/settings` | `{animations:boolean}`，本次运行有效；界面可另保存个人显示偏好 |

工作流与实际复用的已有入口：`web → cc-rs-pentest-tools`，`api → cc-rs-api-security`，`chain → cc-rs-attack-chain`，`reverse → cc-rs-reverse-engineering`，`audit → cc-rs-code-audit`，`report → cc-rs-docs-generator`。安装状态以实际 `SKILL.md` 为准；提交的 prompt 以 `/<skill-name>` 开头，由 Harness 的官方技能机制加载正文。

“技能文件已安装”不标记成“会话目录已验证”。REA 的 `ready` 来自已有 launcher 的锁文件与依赖校验；`registered` 来自实际 tools schema；`connected` 只有收到真实 REA 工具的成功 `tools/result` 后才成立。模型调用失败或工具缺失保留原错误状态，不用演示数据填充成功状态。显示的任务历史为当前进程内存记录；Harness 自己仍负责实际会话的持久化。

## 验证边界

三类证据分别记录：

| 验证层次 | 结果与范围 |
| --- | --- |
| 单元与源码回归 | `harness-plugin-native.test.js` 验证激活门槛、原生会话请求形状、失败回执、事件状态转换、capability、Origin、输入限制与 headless 加载；完整检查为 185 项测试，184 通过、1 跳过、0 失败 |
| Electron 传输 fixture | `test-harness-desktop-transport.cjs` 的 14 项检查通过，覆盖 Desktop / Web / file 请求选择与错误处理；该层使用独立 fixture |
| 官方 Windows bundle | 官方 nightly `0.2.1-rc.5` 的八项实际运行检查通过，选择性安装 111 文件、六技能状态、完整欢迎词、原生会话 fixture 任务、外观、社群及全部 12 条协议请求分别核验 |

官方安装包的 SHA-512 与 nightly feed 一致，供应商签名为 `Valid`。原始 EXE 与 asar 保留不变；实际验收使用独立观察副本，副本新增观察入口并修改 `package.json.main`，随后导入逐字节一致的官方 `lib/main.js` 与 Host bundle。观察入口只控制用户数据隔离、默认协议注册、外链与窗口焦点等桌面行为。观察副本的 asar 具有自己的哈希，完整原包哈希与官方代码一致性分别核对。

| 原始成品证据 | SHA-256 |
| --- | --- |
| 原始 EXE（观察副本 EXE 相同） | `7ae939b5a82b220fbd8ad04dfbafaaedb5a49ab43dc884a5db6381f678dd0cc4` |
| 原始 `app.asar` | `e1b6f25fa937da98086c3e77af77aa14791105963c4d337a1c42179d232c6915` |
| 观察副本 `app.asar` | `b3fb12fd771c00f7cb1b39b8236208c61b7aa2778fe6ff7b143b9925b8345c39` |
| 原始及观察副本 `lib/main.js` | `9712da3c65d5d4262da7e6d41dad30586070c8eb47f078c62165de2bdba572c3` |

官方 `SessionController` 使用本机确定性 Messages fixture，收到实际完成事件并记录输出；付费 API 调用、真实研究成果和真实 REA 工具调用仍待实测。官方 Desktop 成品验收仅覆盖 Windows，macOS / Linux 当前属于本工作台安装包检查与传输回归范围。此前 `0.2.1-rc.2` Web 验收与 `.5` 的 11870 文件完整安装记录继续保留，本轮未重复该全量安装。
