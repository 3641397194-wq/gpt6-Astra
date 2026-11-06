# 冷咖啡工作台 3.2.0-preview.8

Grok Bot 模型卡片新增冷咖啡原创记忆管理界面，完整接入读取、写入、忘掉与自检流程。

- 读取 Bot 列表与当前登录状态，支持重新检测、Bot 切换、原文搜索、主动 JSON 导出。
- 写入可选账号共用 / 仅此 Bot、指令 / 普通事实，完整正文预览后明确确认；忘掉也走预览确认。
- 冷咖啡完整原欢迎词可一键填入，保留四个 QQ 群、Telegram 聊天群与频道。填入不自动发送。
- Bot 回复确认、独立重新读取和新会话验证分别展示。列表只在真实读取返回后更新；未把回复确认显示成已持久保存。
- 增加固定服务白名单、严格 nonce / request ID 关联、响应限额、超时、停止等待、登录失效处理与主进程凭据隔离。
- souhun 固定提交的全部 36 个源文件、逐文件摘要和 MIT 许可证完整随包保存，作为可审计的第三方来源；冷咖啡界面与 Node / Electron 集成独立实现，不执行上游归档。
- 十五个模型席位、原词包、REA / reverse-skill、DeepSeek Harness 插件、中转和原有备份卸载流程保留。

使用：一键破甲 → Grok Bot → 管理 Bot 云端记忆 → 连接 → 选择 Bot → 读取或预览写入 → 确认 → 重新读取核对。之后在 Grok Bot 新开对话，单独发送 `冷咖啡` 检查实际效果。

记忆连接实现 Windows / macOS。其他工作台功能继续支持 Windows、macOS 与 Linux。此功能依赖目标服务当前协议、账号权限和记忆工具；云端操作可能产生上游用量。本版验收采用隔离资料目录和合成登录 / 服务夹具，真实 Bot 记忆与新会话效果由使用者实测。详见 [完整说明与来源](GROK-BOT-MEMORY.md)。

付费中转：[coldcoffeeai.com](https://coldcoffeeai.com/)；闭源工作流为收费本机安装与定制，进 QQ 群私聊管理。

QQ：`1057540028` · `1077074552` · `618179023` · `1131239659`

Telegram 群：[coolcoffeeai](https://t.me/coolcoffeeai) · 频道：[chachachalkf](https://t.me/chachachalkf)
