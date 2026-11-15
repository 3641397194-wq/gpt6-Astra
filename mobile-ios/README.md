# 冷咖啡 iOS 客户端

这是冷咖啡的 SwiftUI iPhone/iPad 客户端，按 GPL-3.0-only 发布。它支持冷咖啡付费 API 中转，也允许用户填写其他 OpenAI 兼容服务商：

- HTTPS Base URL 校验与模型列表读取；
- Chat Completions / Responses 流式输出、停止和重试；
- Keychain 保存用户自己填写的 API Key；
- 会话记录、图片选择、字号与主题入口；
- 冷咖啡中转、四个 QQ 群、Telegram 群与频道、闭源工作流和定制服务入口。

在 macOS + Xcode 中打开 `ColdCoffeeIOS.xcodeproj`，选择 iPhone Simulator 运行。签名、TestFlight 和 App Store 发布流程见仓库的 [iOS 发布说明](../docs/IOS-MARKETING.md)。

公开源码包不包含 Apple 证书、Provisioning Profile、App Store Connect 私钥、顾客 Key、聊天记录或本机路径。
