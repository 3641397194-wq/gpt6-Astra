# [gpt6 Astra-claude全模型支持-grok4.7-DeepSeek v4.1 Flash 10.17版本-glm5.3全模型支持-gemini全模型支持破甲越狱](https://github.com/3641397194-wq/gpt6-Astra) Desktop

完整桌面工作台：启动页、指挥台、五档工作档位、五个 BREAK//OPEN 通道、15 个 AI 模型席位、明确目标输入、活动流、结果面板、隔离状态与社群入口。

15 个模型席位的「预览 / 运行 / 检查 / 恢复」都会写入该模型自己的本地指令层：Codex `model_instructions_file`、Claude `CLAUDE.md`、Grok `AGENTS.md` / skills、DeepSeek v4.1 Flash 10.17版本 官方 Harness `$DSH_HOME` / `~/.dsh` 的 `AGENTS.md` / skills、GLM `GLM.md`、Gemini `GEMINI.md`，以及豆包、WorkBuddy、Cursor、MiniMax 3.1 Flash、Kimi K3.1、Grok Bot、Claude Duet、ChatGPT Dot、Meta Muse 的各自用户目录。原稿备份在各自 `cha-backups\`。

## 启动

```powershell
npm install
npm start
```

打包 Windows 便携版：

```powershell
npm run pack:win
```

品牌启动词是 `冷咖啡`，控制词是 `BREAK//OPEN`，当前版本为 `3.2.0-preview.4`。桌面端一键安装页显示 15 个 AI 模型席位。DeepSeek 席位显示为 DeepSeek v4.1 Flash 10.17版本，在 Windows、macOS、Linux 三端对接 10.17 版官方 Harness `0.2.1-rc.2`；共享 `$DSH_AGENTS_HOME` / `~/.agents` 目录保留原样。详细安装合同见 [DeepSeek Harness 安装说明](../docs/SEAT-PACKS.md#deepseek-官方-harness-安装说明)。启动词 `冷咖啡` 会先打出三个 QQ 群号和 Telegram 聊天群/频道，再打出激活页。工单先口语归一再全自动打到 80 条小类三拍。

## 原创工具箱 1.0

左侧工具箱现已集成原创网络、网站、文件和文本程序，以及 AI 工具反馈循环与 MCP。使用和验收范围见 [原创工具箱说明](../docs/original-toolbox.md)。运行 `npm run test:toolbox` 验证工具，运行 `npm run test:toolbox:ui` 验证桌面界面。

## 三系统发布

GitHub Actions 在原生 Windows、macOS arm64 / x64、Linux x64 环境中执行检查、构建及打包版 UI 测试。日常提交会验证并上传各平台安装包到该次运行的 Artifacts，保留 14 天；发布新版时，先更新 `VERSION`、桌面端版本及对应发布说明，再在 `desktop-build` 的「Run workflow」中选择 `main` 并勾选 `publish_release`。安装包仅在全部平台通过后公开到 GitHub Releases，附带 SHA256SUMS.txt；已发布版本标签保留原提交，日常提交与文档更新不重复发布旧版本。macOS 包未做 Apple Developer 签名和公证，首次打开按系统提示确认。
