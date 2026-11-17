# 冷咖啡 3.3.0-preview.3 · GPT-6.2 Astra / Sol

本轮将 GPT-6.2 Astra 与 GPT-6.2 Sol 放到冷咖啡桌面和手机端的模型选择焦点：名称更容易找到，接入和聊天路径更清晰。两者是**界面展示名称**；实际 API 请求只使用当前服务商 `GET /v1/models` 返回的完整模型 `id`，不会由客户端猜测或硬编码。列表显示、账号调用权限和余额是不同的状态，最终以对应生成请求及服务商记录为准。

[本版发布页](https://github.com/3641397194-wq/gpt6-Astra/releases/tag/v3.3.0-preview.3) · [最新版下载页](https://github.com/3641397194-wq/gpt6-Astra/releases/latest) · [接入说明](RELAY-API.md)

## 本轮重点

- **桌面：**中转目录优先呈现 Astra / Sol；连接、模型选择和实际配置沿用原有读取、预览与确认流程，已有路由可视化、备份恢复和其他模型席位保留。
- **Android：**在现有服务商接入、模型选择、流式聊天与会话管理上突出双模型名称；实际可选项受当前 Key 的模型列表约束。[安装说明](ANDROID.md)
- **iPhone：**SwiftUI 客户端沿用同一模型口径与 Keychain 存储；当前提供源码与构建准备，TestFlight / App Store 链接须待签名、上传及审核完成后再公布。[iOS 说明](IOS.md)
- **品牌页：**原创黑白绯红封面与品牌图标，仓库首页及网页预览统一展示。原有 QQ、Telegram、付费中转与独立定制服务入口保留。
- **接入稳定性：**iOS 切换 Key 后会忽略旧模型目录请求的迟到结果；桌面重启缩放检查会等待实际窗口就绪，再验证缩放保存与恢复。

## 下载与发布核对

本页对应 `v3.3.0-preview.3` 预览版本。请从发布页 Assets 下载并核对 SHA256SUMS：Windows x64 EXE、macOS arm64/x64 DMG 与 ZIP、Linux x86_64 AppImage / amd64 DEB、Android APK 及对应移动源码 ZIP。iOS 构建产物见同版本 Actions；App Store 上架仍需 Apple 签名与审核。

## 接入与隐私

1. 在冷咖啡付费中转或其他兼容服务商取得自己的 Key。
2. 读取当前 Key 的 `/v1/models`，选择服务商返回的准确 `id`；若 Astra / Sol 未列出，就按实际列表选择。
3. 发起一次对话，结合生成响应与服务商用量记录确认实际可用性。仅有模型列表响应不等于生成成功。

Key 不随安装包分发。Android 保存的 Key 由 KeyStore 保护，iOS 使用 Keychain；模型请求发送到顾客选择的服务商。模型 API 按服务商规则计费，收费的独立本机工作流和定制服务与 API 用量分别说明。

## 社群

QQ 一群 `1057540028`、二群 `1077074552`、三群 `618179023`、四群 `1131239659`；[Telegram 聊天群](https://t.me/coolcoffeeai) · [Telegram 频道](https://t.me/chachachalkf)。微信群和闭源定制咨询请进 QQ 群联系管理。
