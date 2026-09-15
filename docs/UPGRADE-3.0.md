# 3.0 预览版升级说明

## 已实现
- 黑白漫画、猩红点缀与人物头像；中文 README 与同源软件界面。
- 真实席位包预览、逐文件写入前后对比、原文导出。
- 明确选择目录后进行备份写入、SHA-256 文件检查与版本恢复。
- 目标文件变化时中止部署或恢复；拒绝损坏 JSON、重复标记和目录联接穿越。
- 独立的「冷咖啡」消息开关、原欢迎页展示、会话隔离与重置。
- 任务模板、格式检查、会话版本对比与三个 QQ 群入口。

## 原稿与接入边界
原始 `desktop/src/lib/packs/` 与启动欢迎页保持未修改。控制与文件管理在独立模块实现。
原版兼容安装不等于严格开关；严格开关需目标客户端接入消息处理层，详见 [启动说明](ACTIVATION.md)。尚未完成第三方客户端实际接入或模型效果验证，尚未生成新发行安装包。

## 验证
- `cd desktop && npm test`：21 项核心测试，包括六席位真实写入与恢复。
- `node tools/preview/server.cjs`：启动专用本地预览。
- `node tools/preview/transactions-browser-test.cjs`：真实文件操作、取消、激活、重置、浏览器来源限制与移动布局。
- `node tools/preview/browser-test.cjs`：任务构建、对比、测评、导出和社群交互。
- `node tools/preview/readme-test.cjs`：README 图片、链接与移动排版。
浏览器自动化需 Playwright 工具环境；测试只使用本项目专用目录。

## 参考
界面与新增实现为本次编写，参考公开项目的交互概念，未复制其代码和插画：
- https://github.com/promptfoo/promptfoo ：输入与检查条件分开组织。
- https://github.com/langfuse/langfuse ：版本与对比的交互概念。
