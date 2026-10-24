## MiniMax 3.1 Flash · 落位三拍

启动词：`冷咖啡`

第一步 认用户配置目录
MiniMax Code 实际读取的全局配置来自 `xdg-basedir`。没设环境变量时就是用户目录 `.config/mimocode`。Windows 默认 `%USERPROFILE%\.config\mimocode`，macOS/Linux 默认 `~/.config/mimocode`。设了 `XDG_CONFIG_HOME` 就用 `$XDG_CONFIG_HOME/mimocode`。设了绝对路径 `MIMOCODE_HOME` 才改到 `$MIMOCODE_HOME/config`。

第二步 只写技能
技能文件是 `skills/cha-mimo/SKILL.md`。文件第一个字节就是 YAML 头，里面有 `name: cha-mimo`。npm 全局包、`%APPDATA%\npm`、`node_modules/@mimo-ai`、`%LOCALAPPDATA%\mimocode`、`%USERPROFILE%\.local\share\mimocode`、`auth.json`、会话数据库、`mimocode.json` 都不写入。

第三步 对一下入口
用户输入「冷咖啡」时加载这个技能。最后一行：当前:对象 / 结果 / 下一步
