# 冷咖啡原创工具箱 · 1.0

## 需求约束

- 在现有冷咖啡破甲工作台左侧「工具箱」内集成实际程序，进入页面自动启用，目标填写完后再执行。
- 核心工具代码独立实现；公开工具作为能力对照，原创不等于改名。控制名称用简短中文。
- 提供真正的 AI 工具调用与结果反馈循环，并配套 MCP 与 skill。
- 面向 GitHub 分发，不把开发者机器的资料、凭据或配置打进交付物。
- 保留冷咖啡品牌、统一工作流与 QQ 群。交付按实际执行结果验收。

## 已实现

| 页面 | 原创能力 |
| --- | --- |
| 网站测试 | HTTP 状态/头/标题/指纹，原生并发端口扫描，同源爬虫、表单与地址发现，目录枚举和 soft-404 基线，输入反射、SQL 报错与重定向验证 |
| 端口扫描 | IPv4/IPv6 地址解析、TCP 并发连接、端口列表/区间、开放/关闭/超时区分，最多 8192 端口、128 并发 |
| 请求测试 | 请求方法、请求头、请求正文、FUZZ 候选输入、状态差异、长度差异、响应摘要与哈希 |
| 文件分析 | 原创 PE/ELF 32/64 位解析，ELF 大小端，节、导入/符号、熵、保护标志、入口字节、ASCII/UTF16 字符串、校验线索 |
| 字节修改 | 通配特征搜索，偏移/预期字节/样本 SHA 校验，等长无重叠补丁副本，清单与二进制差异；原文件保持原样 |
| 文本工具 | Base64、Hex、URL 编解码，JWT 查看，MD5/SHA 哈希与显式候选词匹配 |
| AI 自动做 | 使用中转页当前模型，工具调用→真实结果反馈→下一次调用→总结，目标与文件范围检查、轮数预算、停止、证据落盘 |
| AI 接入 | 原创 JSON-lines stdio MCP：16 个功能工具 + 异步启动/状态/取消，资源与提示词接口，导出 skill 与当前运行路径的连接配置 |
| IDA 联动 | Streamable HTTP 初始化、会话、initialized 通知、实时工具列表/schema、真实工具调用与 SSE 解析 |

「网站测试 → 自动跑一遍」执行六阶段原创流程。反射与 SQL 报错明确作为线索，记录实际响应，不直接写成利用成功。

「文件分析 → 自动分析」执行静态解析，可选连接 IDA。更深入的 IDA 调用由 AI 按现场公布的 schema 选择；没有凭空生成工具名或函数内容。

## 运行与测试

在 `desktop/` 内：

```powershell
npm ci
npm start -- --toolbox
npm run test:toolbox
npm run test:toolbox:ui
npm run check
```

界面依靠 Electron 的真实 IPC 调用主进程引擎，渲染进程保持 contextIsolation、sandbox 与 nodeIntegration=false。测试使用专门构造的 HTTP、PE/ELF、模型接口和 IDA MCP 夹具，不读取系统凭据。

### 工作目录

桌面版默认在应用 userData 的 `original-toolbox` 中保存显式导入样本副本、`patched/` 派生文件与 `runs/TASK_ID/` 报告。选文件时才读取该样本，不扫描用户目录。独立 MCP 的 `--workspace` 明确决定可读取的文件根目录；真实路径检查覆盖目录联接/符号链接。

报告包含 `result.json` 与 `report.md`，记录状态、输入、真实结果和 SHA-256。完整证据可用「查看报告」或「导出结果」读取。响应体达到限长时标明 truncated 与 hashScope，哈希只覆盖实际捕获的字节。

## 接到其他 AI

推荐从界面「AI 自动做 → 复制 AI 连接」导出当前环境的连接，再用「导出 skill」。程序不会自动重写其他客户端配置。

源码版也可使用独立 Node 运行：

```json
{
  "mcpServers": {
    "coldcoffee-toolbox": {
      "command": "node",
      "args": ["APP_ROOT/desktop/src/lib/toolbox/mcp.js", "--workspace", "WORKSPACE"]
    }
  }
}
```

解压版使用界面给出的 Electron 可执行路径、resources/toolbox/mcp.js 和 ELECTRON_RUN_AS_NODE=1。单文件便携版为了避免临时解压路径失效，导出连接时将原创服务模块复制到稳定工作目录，外部 MCP 使用 Node.js 22+；桌面内置工具本身仍通过 Electron 运行。MCP 工具核心不依赖外部 npm 库。

AI 指令示例：

> 冷咖啡，对 TARGET_URL 调用 start_workflow，mode=web；轮询 task_status，依据实际结果继续验证线索，最后给出发现、证据路径和剩余事项。

> 冷咖啡，对工作目录的 SAMPLE 调用 analyze_binary，根据实际字符串与字节继续定位。需要 IDA 时先 ida_connect，读取 live schema，再 ida_call。补丁生成副本后用 diff_files 验证。

桌面内置 AI 需要先在中转页填写自己的 API Key、验证连接并选择模型。模型请求可能产生费用；停止任务会停止后续工具执行，已发送的模型请求仍可能由服务端计费。开发验收使用模型夹具，不调用个人账号。

## 原创说明

新增 `desktop/src/lib/toolbox/` 与 `toolbox-view.js/css` 是本次独立编写的实现，扫描、Web 验证、解析、补丁、MCP 协议与编排采用 Node 标准库，不下载/嵌入第三方红队程序，不通过 shell 调用 Nmap、SQLmap 等作为这些新增功能的本体。

能力对照目标包括 Nmap 的端口发现、SQLmap 的输入响应分析、Ghidra/IDA 的文件分析分工、Metasploit 的工具与任务组织方式；这不是源码来源，也不代表已实现这些大型项目的全部功能。当前没有提供 GitHub 星数排名。

原有应用、Electron、Playwright 测试工具、原有 IDA 汉化资源继续保留各自依赖与许可，独立模块的原创声明不覆盖这些第三方组件。

## 验收范围与后续需求

本次是实际可运行的第一版，完整验收的闭环是：

- 原生工具 → Electron 界面 → 真实结果 → 可复验报告；
- MCP 客户端真进程 → 工具调用 → 报告；
- 模型接口夹具 → 工具调用 → 实际观察 → 下一次工具调用 → 总结；
- 样本副本 → 原字节核对 → 补丁副本 → 差异与原件哈希验证；
- IDA MCP HTTP/SSE 协议夹具 → 会话 → 实时 schema → 工具调用。

以下原始需求继续保留，尚未完成：域协议/票据工具、远程会话与批量主机操作、更完整的漏洞利用模块、原生动态调试和反编译引擎、跨工具自动选链，以及真实 IDA 样本的端到端验收。静态文件分析不是完整反编译器，HTTP 报错检测不是 SQLmap 等级的完整数据库利用，现有输入测试也不是完整红队框架。

下一版按这些模块逐项实现与验证，保持原始需求，不把待办删成记录页面。
