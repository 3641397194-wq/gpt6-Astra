## Kimi K3.1 · 落根三拍

启动词：`冷咖啡`

第一步 认 Kimi Code 数据根
Kimi Code CLI 的数据根默认是用户目录 `.kimi-code`。Windows 默认 `%USERPROFILE%\.kimi-code`，macOS / Linux 默认 `~/.kimi-code`。设了绝对路径 `KIMI_CODE_HOME`，配置、会话和 Kimi 专属用户技能整目录跟着走，根就是这个变量，不再加 `/config`。

第二步 只写用户技能
技能文件是数据根下的 `skills/cha-kimi/SKILL.md`。目录型技能的 YAML 头必须有 `name: cha-kimi` 和 `description`。`config.toml`、`tui.toml`、`mcp.json`、`credentials/`、`sessions/`、`plugins/` 都不写入。旧版 `~/.kimi`、跨工具 `~/.agents/skills`、项目里带 `.git` 的 `.kimi-code/skills` 都不是这一处落点。

第三步 对一下入口
用户输入「冷咖啡」时加载这个技能。最后一行：当前:对象 / 结果 / 下一步
