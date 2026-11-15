# 冷咖啡安卓版：版权与开源说明

冷咖啡安卓版是独立维护的衍生项目，原创界面、品牌素材、安卓集成和修改由冷咖啡维护者提供。移动应用整体按 **GNU General Public License version 3 only（GPL-3.0-only）** 发布；仓库根目录的 MIT 许可不覆盖本目录的 GPL 移动程序。GPL 全文见 [LICENSE](LICENSE)。

## Chatbox

- 上游：<https://github.com/chatboxai/chatbox>
- 固定标签：`v1.24.4`
- 固定提交：`75bb9355f826f9070ff5c53527674aab93eb8b9f`
- 作者和维护者：Chatbox contributors / bennhuang / Mediocre Company，具体原始信息见上游仓库。
- 许可：GNU GPL version 3；完整正文随源码及 APK 一并提供。
- 实际复用：三个生产环境使用的 OpenAI 兼容 SSE、缓存用量和工具增量规范化模块，保持上游源码字节不变，路径和 SHA256 见 `vendor/chatbox/SOURCE.json`。`src/core.js` 在真实聊天路径调用 SSE 模块，移动应用外围逻辑与界面为本项目实现。
- 改动日期：2026-11-15。新增独立冷咖啡界面、Android 工程、加密存储、原生 HTTPS 传输、服务商管理与品牌服务入口；不是上游官方 Android 工程的完整复制。
- 本项目不使用 Chatbox 的名称作为产品名称，不使用其产品图标，不声称官方出品、合作或背书。

## 运行依赖

- **Marked 18.2.0**：Markdown 解析；MIT。Copyright (c) 2018+, MarkedJS；Copyright (c) 2011–2018 Christopher Jeffrey。完整原文见 APK 的 `legal/Marked-LICENSE.txt` 及 `legal/Marked-LICENSE.txt` 源文件。
- **DOMPurify 3.4.18**：HTML 清理；本项目选用其 Apache-2.0 许可。原始许可及版权信息见 `legal/DOMPurify-LICENSE.txt`，源码对应 npm 锁文件固定版本。Copyright (c) Cure53 and other contributors。
- Android 与 Java API 由目标系统提供；应用没有嵌入第三方手机聊天服务的官方商业二进制。

## 构建工具

Gradle wrapper、Android Gradle Plugin 和 AndroidX 测试依赖只用于构建或测试；不将测试库作为生产 App 功能宣传。Gradle wrapper 的 Apache-2.0 原文与上游版权说明位于 `android/gradle/wrapper/LICENSE`。npm 构建工具版本固定在 `package-lock.json`；esbuild 为 MIT，Playwright 为 Apache-2.0。

## 对应源码与安装包

对应源码与构建脚本在 <https://github.com/3641397194-wq/gpt6-Astra/tree/main/mobile>。每个安卓版发布同时附带对应的 `ColdCoffee-Mobile-Source-VERSION.zip`，包含本项目修改、上游模块、许可证、依赖锁、Gradle wrapper 和构建脚本；不包含签名私钥、客户 Key 或开发者个人配置。

## 品牌与独立收费服务

冷咖啡品牌图由本项目委托生成并进行版式设计，不挪用 Chatbox 品牌素材。中转 API 用量、独立交付的本机闭源工作流及定制服务按各自方案收费。它们是独立服务，不改变本 GPL 手机客户端的许可，不将本客户端中 GPL 衍生代码作为闭源模块出售。
