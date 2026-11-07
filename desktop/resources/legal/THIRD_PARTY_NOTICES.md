# 开源许可与第三方声明

冷咖啡原创的桌面界面、交互、客户端适配、事务式安装与恢复等代码按根目录 [MIT 许可证](LICENSE) 分发。独立组件、源代码快照、运行时、词典和第三方资料分别保留自己的许可证；根目录 MIT 许可证不覆盖这些作品。

完整版权、许可和 NOTICE 原文汇编在 [随包开源声明](desktop/resources/legal/OPEN_SOURCE_NOTICES.txt)。软件中的「关于与开源许可」提供相同内容。这些文件是归属和许可记录，不表示上游作者为冷咖啡或收费服务背书。

| 组件 | 固定版本与来源 | 随包记录与修改说明 |
| --- | --- | --- |
| 网关核心 | [yetone/magpie](https://github.com/yetone/magpie)，0.1.3186，提交 `f9a88c4fbeec771f71f2d05fbb77ce1a6239d035`，MIT，Copyright (c) 2026 yetone | 上游二进制未修改，构建时按 SHA-256 验证；[LICENSE](desktop/resources/magpie/LICENSE)、[THIRD_PARTY_NOTICES](desktop/resources/magpie/THIRD_PARTY_NOTICES) 原样保留。冷咖啡主界面及集成为独立实现，接入范围见 [集成说明](docs/MAGPIE-INTEGRATION.md)。 |
| REA 源码和运行资源 | [morluto/rea](https://github.com/morluto/rea)，源码提交 `833136507dd79d959340b09862a53af344e4f1b3`，运行资源 `rea-agents@6.7.0`，主体 MIT | [固定来源清单](desktop/resources/upstream-skills/catalog.json) 记录逐包摘要；完整源码、MIT、第三方 NOTICE、`licenses/` 和子项目许可保留在对应 `.bundle.json.gz`，安装时完整还原。REA 内的第三方作品按原许可分发。 |
| reverse-skill | [zhaoxuya520/reverse-skill](https://github.com/zhaoxuya520/reverse-skill)，准确提交与摘要见固定来源清单，主体 MIT | 完整源码和许可证保留在 `reverse-skill.bundle.json.gz`。其中 `CTF-Sandbox-Orchestrator/` 是独立 GPL-3.0 子项目，GPL 全文与对应源码完整随包分发；`skills/pentest-tools/src-hunter/` 保留 MyuriKanao 的 MIT 声明。各自归属保持独立。 |
| Grok Bot 协议参考与源码快照 | [Lniosy/souhun](https://github.com/Lniosy/souhun)，提交 `b8fb8ed08d0657cb07675f31d5110b2da4c8744b`，MIT，Copyright (c) 2026 lniosy | [说明](desktop/resources/grok-memory/NOTICE.md)、[MIT 原文](desktop/resources/grok-memory/LICENSE.souhun.txt)、完整源码归档与逐文件清单随包保留。冷咖啡界面与 Node/Electron 集成独立编写，不执行归档里的脚本。 |
| IDA 中文词典及插件 | `tools/ida-zh-cn`；词典参考 0x-focus/IDA-Pro-9.0-Chinese-Translation 与 tuxi/ida-i18n，MIT | 原始版权与 MIT 原文见 [NOTICE](tools/ida-zh-cn/NOTICE.md) 与 [LICENSE](tools/ida-zh-cn/LICENSE)。插件本体和整合文档独立实现；本项目不分发 IDA 主程序。 |
| 桌面运行依赖 | `jsonc-parser@3.3.1`（MIT）、`smol-toml@1.9.0`（BSD-3-Clause）、`yaml@2.9.0`（ISC） | 精确锁定版本、版权与许可全文纳入随包开源声明；依赖图见 `desktop/package-lock.json`。 |
| 桌面运行框架 | Electron 及其 Chromium/Node 组件 | 对应运行时的 `LICENSE.electron.txt` 与 `LICENSES.chromium.html` 随平台安装包分发，保留其原始第三方声明；不以本项目许可证替代。 |

REA 保留了上游记录的许可信息缺口和补充说明；`burp-mcp-full/` 在固定来源中没有独立许可证文件，保持来源根许可证与原记录，不虚构额外授权。第三方工具名称用于说明兼容和集成，实际下载或执行的外部工具仍适用各自条款。

完整技能来源快照以 gzip 压缩 JSON 保存；每个条目包含相对路径、原始字节的 Base64、大小和 SHA-256。还原方法及可复现工具见 [技能说明](docs/UPSTREAM-SKILLS.md) 和 `tools/vendor_upstream_skills.py`。GPL 子项目的对应源码与许可证就在同一分发物中，不依赖未来提供源码的承诺。

原画、图标与布偶猫路由角色为冷咖啡生成的原创视觉，来源参数和摘要见 `desktop/assets/brand-v6/provenance.json` 与 `desktop/assets/route-ragdoll/provenance.json`。产品名称和商标属于各自权利人；本项目与上述第三方无隶属或官方背书关系。付费 API 中转、闭源工作流和定制服务的收费说明，不改变已开源部分及第三方组件的许可权利。
