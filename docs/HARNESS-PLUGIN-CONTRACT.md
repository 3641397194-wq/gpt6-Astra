# 冷咖啡 DeepSeek Harness 原生插件

插件复用现有 REA、reverse-skill 完整快照、适配入口和 REA MCP 配置。它通过官方 Cordis 扩展在 Harness 自己的 Web 文档中注入全局冰蓝皮肤、开屏与侧面板，并通过官方会话服务提交任务。技能原文、已有欢迎词和客户的模型配置保持原样。

## 官方源代码核验

参考的两个上游版本：

- 既有兼容基线 `0.2.1-rc.2`：`687f282e8625c6b8d11ff58211a90524be2e4317`。
- 2026-10-30 获取的默认分支 `0.2.2-alpha.2`：`ce7073d51254c26cd63b22a60835b8f948deb447`。

真实接口和来源：

| 接入点 | 官方合同 |
| --- | --- |
| `export function apply(ctx, config)`、`ctx.inject`、生命周期清理 | [官方插件教程](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/docs/user/develop/basic/index.md) |
| `webserver/index-inject` 以及 `style` / `html` / `script` / `global` 行 | [pinned WebServer](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/host/webserver/src/index.ts)、[当前结构化注入](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/host/webserver/src/injections.ts) |
| `webServer.register({kind:'prefix',path,handler})`、`getOrigin()` | [当前 WebServer](https://github.com/deepseek-ai/deepseek-harness/blob/ce7073d51254c26cd63b22a60835b8f948deb447/packages/host/webserver/src/index.ts) |
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

本轮主验证面是官方 Web profile。独立窗口可以打开真实的 Harness 本机 Web 地址。官方 Electron 的 `file://` 文档可接收相同的 index 注入；如果该载体没有 HTTP listener，插件将 `apiBase` 设为 `null`、`apiAvailable` 设为 `false`，界面明示当前载体的接口状态。仅支持空 Origin 的跨源请求，并不等于已经验证官方 Desktop 的完整功能。Headless / TUI 环境的 `webServer` 为可选服务，继续使用已有技能而不挂载图形界面。

## 内部 UI 接口

同页注入 `window.COLDCOFFEE_HARNESS`：`basePath` 默认 `/coldcoffee`，`apiBase` 为当前本机 listener 的 origin 加 basePath；包含 `token`、`styleText`、静态图片 data URI `assetUrl`、独立壁纸 `backgroundUrl`、`initialStatus`、`preview:false` 和相对接口地址。`panel.css` 与 `theme.css` 合并后供冷咖啡侧面板的 Shadow DOM 使用；`host.css` 通过官方 `style` 注入覆盖整个 Harness Web 界面的官方设计变量、语义元素及菜单角色。

宿主样式均以 `html.coldcoffee-harness-skin` 为作用域，面板的「整个 Harness 冰蓝皮肤」开关只切换该标记，并在 `sessionStorage` 保存当前标签页的显示偏好。关闭皮肤时恢复官方页面外观；页面卸载时清理由插件添加的主题标记。插件没有重写宿主的聊天结构或任务逻辑。

主视觉在制作阶段生成后以 `ui/rem-blue.png` 随包安装，注入时读取本地图片并转成 data URI；同时保留原 SVG 资源。开屏的镜头、扫描光、HUD、环形标记及粒子采用 CSS 动画，遵循动画开关和系统减少动态效果设置。发行客户端不携带图像生成 API Key，也不在用户开窗时请求图像服务。

每个请求带 `X-ColdCoffee-Session: <本次运行的随机 capability>`，API 只接受本机 socket、准确的 Host，以及同源或受支持的 Desktop `Origin: null`。这个随机值在内存生成，既不是模型 API Key，也不写入配置、源码或报告。

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

`desktop/tests/harness-plugin-native.test.js` 在合成目录验证激活门槛、原生会话调用形状、失败回执、真实事件状态转换、能力值鉴权、外部 Origin 阻断、输入大小限制和 headless 加载。这里的 synthetic context 用于单元回归，不能替代官方 Harness 的实际启动验证。原生界面、启动事件和工具/模型是否可用，必须用对应官方 runtime 的运行结果另行确认。
