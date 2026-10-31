# 冷咖啡 · DeepSeek Harness 插件

冷咖啡工作台为整个 DeepSeek Harness Desktop / Web 图形界面增加冰蓝皮肤，并提供冰晶看板娘开屏、技能状态、工作流入口和任务记录。插件复用软件已经附带的 REA 与 reverse-skill，没有另建一套重复技能包；原启动词、完整欢迎词、三个 QQ 群和 Telegram 入口继续保留。

当前为 **3.2.0-preview.6**，内置插件版本 **0.1.1**，发布准备中。本版修复官方 Desktop 的协议请求路径；Windows 官方成品的八项运行验收已通过，README 中的七个下载入口预留给本版本 Release。

<p align="center"><a href="assets/deepseek-harness-opening.png"><img src="assets/deepseek-harness-opening.png" width="100%" alt="冷咖啡插件冰晶开屏，包含中转、社群与工作空间入口" /></a></p>

<table>
<tr><td width="50%"><a href="assets/deepseek-harness-workspace.png"><img src="assets/deepseek-harness-workspace.png" width="100%" alt="官方 Harness Web 的冷咖啡冰蓝工作空间" /></a></td><td width="50%"><a href="assets/deepseek-harness-community.png"><img src="assets/deepseek-harness-community.png" width="100%" alt="冷咖啡助手的社群与服务面板" /></a></td></tr>
<tr><td align="center"><sub>整个 Harness 的皮肤与独立壁纸</sub></td><td align="center"><sub>全部社群与收费定制入口</sub></td></tr>
</table>

截图来自独立预览目录内运行的官方 `0.2.1-rc.2` Web 界面，未使用个人浏览器资料或模型凭证。它们展示实际 UI；模型研究任务与工具执行的验收情况见下文。

<table>
<tr><td width="50%"><a href="assets/deepseek-harness-desktop-workspace.png"><img src="assets/deepseek-harness-desktop-workspace.png" width="100%" alt="官方 Windows Harness Desktop 0.2.1-rc.5 观察副本中的冷咖啡工作流面板" /></a></td><td width="50%"><a href="assets/deepseek-harness-desktop-community.png"><img src="assets/deepseek-harness-desktop-community.png" width="100%" alt="官方 Windows Harness Desktop 0.2.1-rc.5 观察副本中的冷咖啡社群面板" /></a></td></tr>
<tr><td align="center"><sub>Windows Desktop · 六个既有工作流</sub></td><td align="center"><sub>Windows Desktop · 社群与中转</sub></td></tr>
</table>

上面两张为本轮官方 Windows Desktop `0.2.1-rc.5` bundle 的独立观察副本截图，使用隔离资料目录。观察入口与模型 fixture 的范围在验收记录中分别说明。

## 使用

1. 在冷咖啡桌面软件的「一键破甲」页面点击「安装到 DeepSeek」，或勾选 DeepSeek 后执行原来的一键安装。安装前备份，资源和配置一起校验。
2. 确认选中的是官方 Harness Desktop 实际使用的数据根：默认 `~/.dsh`，自定义时为 `$DSH_HOME`。完整退出并重新打开官方 Desktop；使用 Web 时重启 `dsh web --host 127.0.0.1 --no-open`，然后打开它打印的本机地址。终端 TUI 保留自己的界面。
3. 开屏可以跳过。进入后点击右下角的「冷咖啡」，在启动框准确输入 `冷咖啡`。
4. 选择工作流、写下任务，再点击开始。任务在官方 Harness 中创建会话，沿用它自己的模型配置和工具权限。
5. 在「记录」查看接收、运行、完成或错误状态；「社群」集中展示三个 QQ 群与 Telegram 群/频道，「外观」管理整个 Harness 的皮肤、背景强度与开屏动画。

模型 API 仍由使用者在 Harness 中配置。插件随包携带的是界面、技能和工具适配，发行文件中没有客户 API Key。

### 官方 Desktop 的接入方式

官方 Harness Desktop 使用 `dsh-app://app` 页面。插件识别该协议后，将状态、激活、任务、记录与外观请求发到相对 `/coldcoffee` 路径；官方客户端把这些请求转交给已有 Host，并管理宿主认证。Web 端继续使用原来的本机 HTTP 接口。

Desktop 和命令行共用 Harness Home。插件安装器继续合并这个 Home 的 `cordis.patch.yml`，保留 `profiles/desktop` 中由官方管理的配置；切换客户端时只需确认两边实际使用的数据根一致。

此前直接从桌面页面请求绝对 loopback 地址会绕开宿主的协议代理，导致界面存在而接口连接失败。`0.1.1` 修正该路径，沿用已有安装位置和官方会话服务，无需另外安装桌面专属词包。界面连接成功时显示「已连接 Harness 桌面端」。开屏、皮肤、社群及六个工作流共用同一套资源；具体实测范围见下方验收表。

## 现有研究工作流

六个入口直接映射到既有技能。下表说明各入口的研究范围；具体发现、复现条件和结论由模型与工具的实际运行结果支撑。

| 面板入口 | 已有技能 | 研究范围 |
| --- | --- | --- |
| 网站与接口检查 | `cc-rs-pentest-tools` | 梳理 Web 与接口入口，检查请求、响应及配置，记录发现与验证证据 |
| API 与身份权限 | `cc-rs-api-security` | 审计会话、认证、身份权限与对象访问控制 |
| 渗透任务编排 | `cc-rs-attack-chain` | 分阶段整理研究目标、前置条件、检查步骤与观察结果 |
| REA 逆向与样本分析 | `cc-rs-reverse-engineering` | 使用既有 REA 分析发行样本、功能逻辑和运行证据 |
| 源码审计 | `cc-rs-code-audit` | 复核源码数据流、依赖与风险点，保留代码位置和判断依据 |
| 证据整理与报告 | `cc-rs-docs-generator` | 汇总证据、复现条件、结论与报告，区分事实和待验证假设 |

入口只调用当前已安装的对应技能。插件负责提交任务和展示状态，工具实际返回以后才记录工具结果；模型配置、工具可用性和任务内容共同决定最终产物。

## 整个 Harness 的冰蓝皮肤

皮肤统一覆盖官方 Desktop / Web 图形界面的侧栏、聊天区、输入框、插件页面、代码区和弹出菜单，并补齐按钮悬停、按下、键盘焦点、选中和禁用反馈。配色沿用官方设计变量，由页面上的冷咖啡主题标记启用；冷咖啡侧面板仍在独立的 Shadow DOM 中。进入「外观」关闭「整个 Harness 冰蓝皮肤」即可恢复宿主的官方外观；背景支持沉浸、均衡、专注三个强度，显示偏好在当前窗口中保留。

日常背景使用独立的 `ui/harness-background.png` 月夜咖啡空间插画，开屏保留冰晶主视觉。图片通过页面私有的 Blob URL 用于壁纸，页面卸载时释放，避免大尺寸 data URI 超出 CSS 变量限制。顶部常驻品牌入口、开屏及助手总览都提供冷咖啡付费中转与全部社群入口。闭源工作流按本机安装的收费定制服务介绍，由顾客进 QQ 群私聊管理，可使用其现有订阅或其他中转。

开屏使用包内的 `ui/rem-blue.png` 冰晶主视觉，结合 CSS 镜头推进、扫描光、环形标记、HUD 和粒子等效果。图片在制作阶段生成后作为静态文件随软件安装，用户打开窗口时直接加载本地图像；客户端没有生图密钥，也没有开窗生图请求或相关费用。动画可单独关闭，并遵循系统的减少动态效果设置。

## 状态含义

| 显示 | 依据 |
| --- | --- |
| 插件已接入 | 代码正在官方 Harness 插件宿主内运行 |
| 已连接 Harness 桌面端 | 页面为官方 `dsh-app://app`，通过客户端协议代理实际取得插件状态 |
| 技能数量 | 当前专用 Harness 目录下实际存在的 `SKILL.md` 数量 |
| REA 已安装 / 依赖已就绪 | 原有 REA 运行时的文件及依赖检查结果 |
| REA 已连接 | 本次运行实际收到成功的 REA 工具结果 |
| 已交给 Harness | 官方会话接口返回 `accepted: true` |
| 已完成 / 错误 | 对应官方会话的实际结束事件 |

技能文件数量和本次会话实际可调用的技能目录分别展示。面板中的任务记录保留于当前进程；输出显示最后一条助手消息的前 2000 字，完整对话留在官方 Harness 会话中。

## 已验证与待验收

本轮取得官方 nightly feed 的 Windows Desktop `0.2.1-rc.5` 安装包，官方 SHA-512 匹配，签名状态为 `Valid`。保留原始 EXE 与 `app.asar`，在独立观察副本中加载官方 bundle：副本新增观察入口并调整 `package.json.main`，再导入保持原文的官方 `main.js` 与 Host bundle。观察入口隔离用户数据、抑制默认协议注册、外链跳转和窗口抢焦点；原始 EXE / asar 的哈希保持不变，观察副本的 asar 单独记录。

Windows 官方 Desktop 的八项实际运行验收全部通过：

| 项目 | 当前证据与范围 |
| --- | --- |
| 干净 Home 安装 | 在新目录选择性安装原词包、六个既有技能及其原始文档和插件，111 个文件核验通过；此次范围未包含完整上游来源树 |
| 官方 Cordis 注入 | 官方 bundle 加载冷咖啡插件，真实 Desktop 页面显示注入的开屏与助手 |
| Host 状态与技能 | 状态请求经 `dsh-app://app` 官方代理取得结果，六项既有技能均可用 |
| 激活与欢迎词 | 精确输入 `冷咖啡` 后激活，原欢迎词全文校验通过 |
| 官方会话任务 | 真实 `SessionController` 对本机确定性 Messages fixture 创建会话并完成任务，状态为 `completed`，输出进入记录 |
| 图像与外观 | 角色图、Blob 壁纸、皮肤切换与还原、动画设置通过实际界面检查 |
| 社群与面板 | 三个 QQ 群、Telegram 群/频道、中转入口完整；切换面板后桌面连接状态保持准确 |
| 协议请求路径 | 观测的 12 条插件请求全部经过 `dsh-app://app`，没有页面运行错误 |

任务使用本机确定性 Messages fixture，记录到 2 次本机模型请求。它验证官方会话通道和结果记录；付费 API、真实研究成果及真实 REA 工具成功调用仍待实测，未读取个人模型凭证。

其他验收记录保留各自范围：

- **此前 Web：**官方 `0.2.1-rc.2` 的 Cordis 注入、开屏、助手、皮肤、壁纸、动画与窄屏布局已通过界面检查。原生会话曾收到 `accepted: true`，随后因未配置模型 Key 显示真实错误；该轮 REA 为工具已注册、`connected: false`。
- **此前完整安装：**`3.2.0-preview.5` 首次完整安装逐项核验 11870 文件通过，随后复查出现部分参考资料缺失并如实报告失败，见下文。本轮 `.6` 保留该历史记录，未重新执行 11870 文件的完整安装。
- **Transport 与源码：**独立 Electron fixture 的 14 项 Desktop / Web / file 传输检查通过；完整源码检查 185 项测试中 184 通过、1 项 Windows 上的 POSIX 权限语义测试跳过、0 失败。传输 fixture 与上述官方成品八项验收分别记录。
- **本工作台 Windows 包：**`.6` / 插件 `0.1.1` 成品检查通过，460 个归档成员未发现私人路径或真实 Key，9 个插件源码文件与包内内容逐字节一致。
- **平台：**官方 Harness Desktop 成品本轮仅在 Windows 实测。macOS / Linux 的范围为本工作台安装包的构建检查与传输回归，官方 Harness 对应平台的成品运行另行验收。

缺少本机接口的载体会显示说明并停用执行按钮。`accepted: true` 只说明 Harness 已接收任务；“已完成”取自对应会话的实际结束事件。

## 安装与恢复

插件放入明确选中的 `$DSH_HOME/.coldcoffee-upstream/harness-plugin`；全局 `cordis.patch.yml` 只合并属于冷咖啡的插件行，REA 连接和其他插件继续保留。图形界面依赖采用可选注入，终端启动链无需图形服务。

工作台的「一键卸载」使用同一事务恢复安装前内容。安装后被用户编辑过的文件会先报告冲突，保留编辑内容。

### 文件占用、权限与安装后的缺失

文件检查逐项显示相对路径、读取状态与错误码。文件缺失、内容不一致、访问受限或被占用时，整次核验都保持失败状态，其余可读文件继续检查。部署时仍严格执行写后哈希校验；写入失败会按事务尝试恢复并保留冲突记录，不会把缺少参考资料的安装标成完整成功。

此前 `3.2.0-preview.5` Windows 复测中，至少两份上游 Markdown 参考资料在写入后消失，读取先出现 `EPERM`，随后为 `ENOENT`。当时本机文件保护软件在运行，但详细处理原因尚未取得，未把现象直接归因于某一产品。插件本体与原词包的 99 项文件检查通过。出现类似情况时，先根据软件列出的文件与系统记录确认权限、占用或外部处理原因，再重新安装和核验；重新核验通过前保留失败状态。

原始上游文本、许可证和固定版本资源继续由既有技能包提供；本插件只负责冷咖啡的原创角色、界面和 Harness 适配。原生接口和来源证据见 [插件接口契约](HARNESS-PLUGIN-CONTRACT.md)。

## 中转、社群与本机定制

[冷咖啡付费 API 中转](https://coldcoffeeai.com/)按站内方案计费。闭源工作流提供收费的本机安装与定制，可使用顾客已有订阅或其他中转；需求和费用由顾客进 QQ 群私聊管理沟通。

| 入口 | 地址或群号 |
| --- | --- |
| QQ 一群 | `1057540028` |
| QQ 二群 | `1077074552` |
| QQ 三群 | `618179023` |
| Telegram 交流群 | [t.me/coolcoffeeai](https://t.me/coolcoffeeai) |
| Telegram 频道 | [t.me/chachachalkf](https://t.me/chachachalkf) |

## 开发预览

预览使用项目自己的 `desktop/work/deepseek-plugin-preview`，独立 Harness Home、工作目录和浏览器资料目录。它不复用个人 Harness 配置或浏览器登录态，也不继承模型凭证环境变量。

准备一个独立目录，安装官方 `@deepseek-ai/dsh@0.2.1-rc.2` 和 `node@24.14.1`，然后执行：

```text
node tools/preview/deepseek-plugin-preview.cjs --runtime=ABSOLUTE_RUNTIME_DIRECTORY --port=8784
```

脚本先安装并核验资源，再启动真正的官方 Harness，最后打开独立 Electron 预览窗口。`--no-window` 只启动服务，用于后台 UI 检查。`--plugin-only` 仅核验原词包和新原生插件，保留预览目录已有扩展；此模式不代表完整上游来源树已通过安装核验。

测试用的临时本机会话只保存在已忽略的 `desktop/work/` 下，日志遮盖地址中的会话参数。不要将此目录作为发行资源。
