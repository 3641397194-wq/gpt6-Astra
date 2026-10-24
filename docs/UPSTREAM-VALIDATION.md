# 技能整合验证记录

验证日期：2026-10-20。仅使用项目资源与合成安装目录；没有从客户机的 AI 配置、浏览器或个人文档提取资料。

## 已验证

| 项目 | 结果 | 验证方式 |
|---|---|---|
| 两套固定来源与官方 REA 运行资源 | 11,671 个文件、94 个技能，逐文件 SHA-256 通过 | `python tools/vendor_upstream_skills.py --verify-only`；`desktop/tests/upstream-integrity.test.js` |
| 15 个 AI 模型入口的安装计划 | 11 个模型席位加 4 个本地 Agent 工作流；每个安装根保留完整来源、94 个独立技能入口、来源及许可证 | 只生成合成目录的计划并核对全部资源；没有向个人目录安装 |
| 原有词包与欢迎词 | 原文件未修改；11 个模型席位和 4 个本地 Agent 工作流回归通过 | `desktop/src/lib/seat-selftest.js`；`tools/seat_selftest.py` |
| 安装、重复安装、撤回与中断恢复 | 合成配置及二进制资源测试通过 | 单文件合并、去重、冲突保护、路径检查、多目录补偿、写后校验 |
| REA 官方运行时 | 6.7.0 的锁定依赖真实准备通过 | 在项目 `.coldbrew/upstream-runtime-smoke` 中经事务部署 1,777 个运行文件，再执行隔离的 `npm ci` |
| REA MCP | `initialize` 与 `tools/list` 实际成功，返回 207 个工具 | `node tools/preview/verify-upstream-runtime.cjs`；没有执行分析任务 |
| 桌面 IPC 与界面 | 目录、搜索、简洁来源卡、依赖确认、状态显示与错误处理通过 | 合成 IPC 测试及无头 Edge；真实本地预览服务联调。来源卡无版本与许可详情展开；版本、完整提交及许可详情保留在来源清单、源码与文档 |
| 社群与启动说明 | 三个 QQ 群、单独发送「冷咖啡」及主页现有飞机群/频道链接均保留 | 真实页面检查 |

统一检查入口：在 `desktop` 目录运行 `npm run check`。Windows 会跳过一项仅适用于 POSIX 权限位的测试；运行时与全部测试使用合成配置。真实联网运行时检查单独执行，不夹在普通单元测试中。

## 尚未通过的整机验证

两次完整来源落盘测试在以下上游文件遇到读写异常：

```text
sources/reverse-skill/skills/attack-chain/references/evasion-cheatsheet.md
```

一次写入后再次核对时文件缺失；另一次读取时报 `EPERM: operation not permitted, open`。发生在合成安装目录，原因尚未确证。原始文件字节仍保存在通过哈希验证的固定来源 bundle 内，没有为绕过错误删减来源。

安装器已补齐整批写入后的真实状态核验：发现文件缺失、内容变化或读写失败时，报告错误并尝试按备份补偿；有冲突则保留文件及备份。因此，本环境中的**完整来源安装 → 重复安装 → 完整撤回**仍是未通过的验证项，不能用小型事务测试或资源包哈希代替。

207 个 MCP 工具的列出只证明服务能够启动并提供工具清单。IDA、Ghidra、JDK、Frida 等外部依赖、具体工具执行和模型效果另按任务核验。

以上为本地验证记录；源码推送和各平台安装包发布状态，以 GitHub 提交、Actions 与 Release 记录为准。
