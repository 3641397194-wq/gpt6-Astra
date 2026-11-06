# Grok Bot 记忆管理：来源与实现

上游：[Lniosy/souhun](https://github.com/Lniosy/souhun)

固定提交：`b8fb8ed08d0657cb07675f31d5110b2da4c8744b`

许可证：MIT，Copyright (c) 2026 lniosy。完整许可证见 `LICENSE.souhun.txt`。

`souhun-b8fb8ed-source.tar.gz` 完整保留此提交的全部 Git 跟踪文件，包括 Windows / macOS / Python 客户端、文档、图片和旧网页端。`source-manifest.json` 列出逐文件 SHA-256、大小以及原始源码归档的 SHA-256。归档供审计和研究，不参与应用启动，不执行其脚本。

冷咖啡实现位于 `desktop/src/lib/grok-memory/` 与 `desktop/src/workbench/grok-memory*`。界面、Electron 集成、操作预览、严格请求关联、证据阶段、取消与错误脱敏为冷咖啡独立编写；Grok Bot 的 RPC 方法、系统加密记录格式、checksum 变换与记忆操作流程参考了上述 MIT 上游。完整保留来源，不将上游作品称为冷咖啡原创。

本功能不包含 Grok Bot 程序或任何登录凭证。使用者主动连接自己的本机登录后，主进程向固定 Grok Bot 服务地址发起请求。服务变更、账号权限、模型记忆工具可用性会影响实际结果。

重建归档：检出固定提交后运行 `python tools/vendor_souhun.py --source <souhun-checkout>`。
