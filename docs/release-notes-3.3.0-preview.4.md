# 冷咖啡 3.3.0-preview.4 · OpenCode 接入版

本版把 OpenCode 加入冷咖啡桌面工作台原有的一键安装网格与可视化中转接入流程。原 15 个模型/技能入口、破甲工作台、社区入口、付费中转与独立定制服务全部保留；OpenCode 是第 16 个安装入口，不替换原有席位，也不计作新的 AI 模型。

[本版发布页](https://github.com/3641397194-wq/gpt6-Astra/releases/tag/v3.3.0-preview.4) · [最新版下载页](https://github.com/3641397194-wq/gpt6-Astra/releases/latest) · [接入说明](https://github.com/3641397194-wq/gpt6-Astra/blob/v3.3.0-preview.4/docs/RELAY-API.md)

## 本轮重点

- **OpenCode 一键安装：**OpenCode 卡片与原 15 项同页排列；安装前显示目标目录与变更预览，写入前备份，核验与卸载沿用工作台事务流程。
- **OpenCode 中转接入：**在可视化工作台选择 OpenCode、中转和服务商返回的模型 ID；支持搜索模型、预览配置、确认写入与恢复。完整模型 ID 原样保留。
- **配置兼容：**优先使用现有 `opencode.jsonc`，其次使用 `opencode.json`，均不存在时创建 `opencode.jsonc`；保留已有 JSONC 注释与无关设置。配置只保存本机网关接入信息，上游 Key 仍由工作台管理。
- **首页同步：**三张软件实机界面图、16 项安装入口说明、下载表和 OpenCode 接入说明已统一更新；四个 QQ 群、Telegram 聊天群与频道继续保留。
- **既有功能保留：**GPT-6.2 Astra / Sol、DeepSeek v4.1 Flash、Grok、Gemini、GLM、豆包、WorkBuddy、Cursor、MiniMax、Kimi、Grok Bot、Claude Duet、ChatGPT Dot、Meta Muse 与 94 项技能资源继续包含在桌面工作台。

## 下载与发布核对

本页对应 `v3.3.0-preview.4`。发布页包含 Windows x64 EXE、macOS arm64/x64 DMG 与 ZIP、Linux x86_64 AppImage / amd64 DEB、Android APK、对应移动源码 ZIP、更新说明和统一 SHA256SUMS。

iOS 开发附件继续使用 `v3.3.0-preview.3` 的源码与无签名开发构建；它们需要开发者自行签名，不是可直接安装的 IPA。TestFlight / App Store 上架仍需 Apple 签名与审核。

## 接入与隐私

1. 在冷咖啡付费中转或其他 OpenAI 兼容服务商取得自己的 Key。
2. 在工作台读取当前 Key 的 `/v1/models`，选择服务商返回的准确模型 ID。
3. 选择 OpenCode 并预览配置；确认后再写入。需要撤销时从工作台恢复备份。
4. 保持工作台本机网关运行，再从 OpenCode 发起一次对话并核对服务商用量记录。

安装包不分发真实 Key。发布前会检查常见密钥、私钥、个人绝对路径、临时目录和内网地址；下载后可用 `SHA256SUMS.txt` 校验文件。

## 社群

QQ 一群 `1057540028`、二群 `1077074552`、三群 `618179023`、四群 `1131239659`；[Telegram 聊天群](https://t.me/coolcoffeeai) · [Telegram 频道](https://t.me/chachachalkf)。微信群和闭源定制咨询请进 QQ 群联系管理。
