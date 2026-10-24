# 冷咖啡工作台 3.2.0-preview.1

本版记录的是当时原有的 11 个模型席位与 IDA 汉化/接入能力；当前 3.2.0-preview.3 已扩展为 15 个目标，并加入原创工具箱 1.0。

## DeepSeek 10.17 兼容更新

- 软件内和仓库主页统一显示 `DeepSeek v4.1 Flash 10.17版本`，冷咖啡品牌与其他席位保持原样。
- 对齐 DeepSeek Harness `0.2.1-rc.2` 的配置根解析及技能加载约定；Windows、macOS、Linux 共用同一适配逻辑。
- 保持专用 `DSH_HOME` / `~/.dsh` 的短入口与技能目录安装，保留共享 `.agents`、profile、凭据和会话原样。
- 增加路径、安装/恢复、显示名与响应式页面回归测试；三个系统的安装包均经过原生流水线验证后发布。

## 下载选择

- Windows 64 位：Windows-x64.exe，双击运行，无需安装。
- macOS Apple 芯片：macOS-arm64.dmg 或 .zip。
- macOS Intel：macOS-x64.dmg 或 .zip。
- Linux 64 位：Linux-x64.AppImage 或 .deb。AppImage 先执行 chmod +x；缺少 FUSE 时可设置 APPIMAGE_EXTRACT_AND_RUN=1 运行。

macOS 未做 Apple Developer 签名和公证。首次打开若提示拦截，按系统设置 → 隐私与安全性中的“仍要打开”确认。

## 新增原创功能

- 原生 DNS / TCP 扫描、HTTP 请求、同源爬虫、目录发现与输入响应测试。
- PE / ELF 分析、字符串、哈希、字节搜索、补丁副本和文件差异；原件保持原样。
- Base64 / Hex / URL / JWT 文本工具及显式候选词哈希匹配。
- AI 工具调用 → 实际观察 → 继续调用 → 总结的反馈循环。
- 16 项功能工具、19 项 MCP 工具、skill 导出和 IDA 实时工具 schema 联动。

这是实际可运行的第一版，不代表完整实现大型扫描、数据库利用、反编译、域票据或远程会话框架。完整能力范围见附件 Original-Toolbox.md。

## 验证与隐私

发布流水线在各原生系统执行源码检查、构建、打包资源排除检查和真实 Electron GUI / IPC 验证；四个平台构建项全部通过后才公开 Release。

附件 SHA256SUMS.txt 包含安装包和公开说明的校验值。发布附件不包含开发者的聊天记录、本机用户配置、测试运行目录、API Key、调试日志或备份。

AI 自动做会将主动填写的任务、目标及工具观察发送到选择的模型接口，其中可能包含样本路径、字符串或响应片段。桌面内置工具无需个人 API Key；AI 自动做需自行配置模型。
