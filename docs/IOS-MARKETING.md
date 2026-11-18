# 冷咖啡 iOS：构建、发布与宣传说明

`mobile-ios/` 是冷咖啡的 iPhone 客户端源码目录。它和 Android 客户端使用相同的产品逻辑：选择冷咖啡付费 API 中转或其他 OpenAI 兼容服务，填写顾客自己的 Key，读取模型后开始流式对话。3.3.0-preview.3 宣传重点是 **GPT-6.2 Astra / Sol** 双模型焦点与清晰的手机聊天体验；模型 API ID 取自当前 Key 的 `/v1/models` 响应，展示名称不承诺账号权益。工作台页仍提供既有六类任务入口，让手机端提交任务并查看流式结果。

当前仓库状态分成两部分：

- **源码与界面：**已纳入仓库，包含 SwiftUI 原生界面、HTTPS API、Keychain 保存、模型读取、流式消息、会话和社群页面。
- **模型口径：**只把 GPT-6.2 Astra / Sol 作为客户端展示重点；上架文案、截图和实际请求均不得把展示标签当作固定 ID，或把列表显示当成付费权限验证。
- **TestFlight / App Store：**发布工程和检查清单已准备。真正的签名、上传和审核必须使用发布者自己的 Apple Developer Team、证书、Provisioning Profile 和 App Store Connect 权限；仓库当前不包含这些凭据，也不把“准备发布”写成“已上架”。

## 本地构建

在 macOS 上安装与项目兼容的 Xcode 后，打开 `mobile-ios/ColdCoffeeIOS.xcodeproj`，选择 iPhone Simulator 运行。命令行构建可以使用：

```bash
xcodebuild \
  -project mobile-ios/ColdCoffeeIOS.xcodeproj \
  -scheme ColdCoffeeIOS \
  -sdk iphonesimulator \
  -configuration Debug \
  CODE_SIGNING_ALLOWED=NO \
  build
```

如果 Xcode 显示的 Scheme 名称与本机工程设置不同，以工程内实际 Scheme 为准。模拟器构建不需要 Apple 签名；真机运行、Archive、TestFlight 和 App Store 分发都需要签名身份。

## 发布流程

1. 在 Apple Developer 创建自己的 Bundle ID、App ID 和分发证书；不要把证书、私钥、Provisioning Profile 或 App Store Connect API Key 写入仓库。
2. 在 App Store Connect 创建应用，填写应用名称、分类、年龄分级、支持网址、隐私政策网址、图标、iPhone 截图和版本说明。
3. 在 Xcode 的 Signing & Capabilities 中选择自己的 Team 和 Bundle Identifier。确认 Release 构建没有测试地址、测试 Key、调试日志或本机路径。
4. 先执行 `Product → Archive`，在 Organizer 中 Validate App，再上传到 App Store Connect。
5. 先发 Internal Testing；确认冷咖啡中转、其他兼容中转、模型读取、流式回答、停止、重试和社区链接都能工作后，再按需要创建 External Testing。
6. 按 App Store Connect 的隐私问卷如实填写：应用保存用户输入的 API Key 到 Keychain，并把用户主动发送的请求传给用户选择的服务商；应用不内置作者个人 Key，也不应把聊天内容上传到冷咖啡公开仓库。
7. 审核通过后再把真实 App Store 链接和版本号补入 `README.md`。在此之前主页只展示源码和签名/上架准备状态。

## 隐私与安全检查

- API Key 只由用户在设备上填写，保存位置为 iOS Keychain。
- 公开源码和宣传截图经过凭据与个人资料检查；截图展示未填写 Key 的初始状态。CI 在 runner 临时目录中构建和截图，构建日志会包含模拟器标识与 runner 路径。
- 冷咖啡 API 地址是 `https://coldcoffeeai.com/v1`；用户也可以添加自己的兼容服务商。
- 发布前应在干净的 macOS 检查 `Info.plist`、构建设置、Release 日志、归档产物和上传包，确认没有测试凭据。
- 社区页面展示的是公开群号和公开 Telegram 链接；微信入口通过 QQ 群联系管理获取，不在仓库放未经确认的二维码。

## 版权与开源范围

iOS 客户端按 `mobile-ios/LICENSE` 中的 GPL-3.0-only 发布。冷咖啡原创界面、品牌排版和客户端集成由本项目维护；第三方组件和上游代码按各自许可证保留归属。收费 API 中转、闭源本机工作流和收费定制服务是独立服务，不改变移动端 GPL 代码的许可范围。

发布前应把 `mobile-ios/` 的源码、许可证、第三方声明和构建说明与对应版本一起保留。App Store 商店页的描述应准确区分：

- “ColdCoffee iOS source and build preparation”——源码和构建准备；
- “Available on the App Store”——只有真实审核通过并拿到 App Store 链接后才能使用。

## iOS 宣传入口

冷咖啡付费 API 中转：<https://coldcoffeeai.com/>

QQ 群：

- 一群：`1057540028`
- 二群：`1077074552`
- 三群：`618179023`
- 四群：`1131239659`

Telegram：

- 聊天群：<https://t.me/coolcoffeeai>
- 频道：<https://t.me/chachachalkf>

闭源本机工作流和定制工作流按需求收费，进 QQ 群私聊管理沟通方案、报价和交付范围。iOS 页面与公开 README 只宣传冷咖啡自有服务，不把第三方仓库当作广告入口。

## 截图说明

`docs/assets/coldcoffee-ios-home.png`、`coldcoffee-ios-chat.png`、`coldcoffee-ios-work.png` 和 `coldcoffee-ios-community.png` 来自同一 iPhone Simulator 上运行的 3.3.0-preview.3 Debug 客户端，分别展示首页、对话、工作台和社区。截图由 `tools/ios_capture_screenshots.sh` 在模拟器测试通过后逐页冷启动采集，未填写 Key，也未添加真实账户或会话资料。

这些图片展示真实客户端的初始界面；付费模型调用仍须用顾客自己的 Key 验证，截图不代表 iPhone 实机性能测量。
