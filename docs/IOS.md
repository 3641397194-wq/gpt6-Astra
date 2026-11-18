# 冷咖啡 iOS 端

冷咖啡 iOS 端与安卓端使用同一套品牌和接入逻辑：默认推荐冷咖啡付费 API 中转，也支持其他 OpenAI 兼容服务商。3.3.0-preview.3 将 **GPT-6.2 Astra** 与 **GPT-6.2 Sol** 作为模型目录的重点名称；手机保存顾客自己的 Key，读取 `/v1/models` 后使用返回的准确 `id` 聊天。界面展示不等于服务商为当前账号开通了对应模型。

客户端包含冷咖啡首页、服务商接入、Chat Completions / Responses、模型选择、流式回答、停止与重试、会话记录、图片提问、字号与主题、四个 QQ 群、Telegram 群和频道，以及付费中转、收费闭源工作流和定制服务入口。工作台页还提供 REA 逆向、红队渗透、API 审计、游戏客户端研究、样本取证和证据报告入口；手机负责提交和整理任务，桌面端负责本机工具与文件落地。

## 从源码构建

要求 macOS、Xcode、iOS 16 SDK。完整仓库中的工程位于 `mobile-ios/ColdCoffeeIOS.xcodeproj`，目标与 scheme 为 `ColdCoffeeIOS`。

```sh
python3 tools/ios_privacy_audit.py
python3 tools/ios_source_archive.py
xcodebuild -project mobile-ios/ColdCoffeeIOS.xcodeproj \
  -scheme ColdCoffeeIOS \
  -sdk iphonesimulator \
  -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO \
  build
```

运行单元测试时选择一个可用的 iPhone Simulator：

```sh
device_id="$(xcrun simctl list devices available | awk -F '[()]' '/iPhone/{print $2; exit}')"
xcodebuild -project mobile-ios/ColdCoffeeIOS.xcodeproj \
  -scheme ColdCoffeeIOS \
  -destination "platform=iOS Simulator,id=${device_id}" \
  test
```

独立源码包解压后的目录名为 `coldcoffee-ios`。源码包不包含 Apple 证书、Provisioning Profile、App Store Connect 私钥、顾客 Key、本机路径或构建缓存。

## 本版开发附件

`3.3.0-preview.3` 已通过 macOS CI 的五项模拟器测试、四页界面截图与无签名设备构建：

- [对应源码 ZIP](https://github.com/3641397194-wq/gpt6-Astra/releases/download/v3.3.0-preview.3/ColdCoffee-iOS-Source-3.3.0-preview.3.zip)：含 Xcode 工程、源码、素材、许可与第三方声明；仅收录 Git 跟踪的文件，排除临时工作、签名和构建目录。
- [无签名设备 .app ZIP](https://github.com/3641397194-wq/gpt6-Astra/releases/download/v3.3.0-preview.3/ColdCoffee-iOS-Unsigned-3.3.0-preview.3.zip)：macOS CI 的 Release 开发构建，供开发者签名使用，并非可直接安装的 IPA。
- [iOS SHA-256 清单](https://github.com/3641397194-wq/gpt6-Astra/releases/download/v3.3.0-preview.3/SHA256SUMS-iOS.txt)：用于校验上述两个附件。

未配置 Apple 签名资料时，可先在 Xcode 中运行 iPhone Simulator；TestFlight 与 App Store 尚未上架。

## TestFlight / App Store 发布

提交 App Store 需要 Apple Developer Program 团队、Bundle ID、Distribution 证书、App Store Connect API Key 和相应权限。仓库工作流默认只执行无签名构建和模拟器测试；只有手动触发并且签名资料已经配置到 GitHub Actions Secrets 时才会导出 IPA 和上传 TestFlight。

需要配置的 Secrets：

| Secret | 用途 |
| --- | --- |
| `APPLE_TEAM_ID` | Apple Developer Team ID |
| `APPLE_KEY_ID` | App Store Connect API Key ID |
| `APPLE_ISSUER_ID` | App Store Connect API Issuer ID |
| `APPLE_API_PRIVATE_KEY` | App Store Connect `.p8` 私钥文本 |
| `IOS_DISTRIBUTION_CERTIFICATE_P12_BASE64` | Distribution `.p12` 的 Base64 |
| `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD` | `.p12` 口令 |
| `IOS_PROVISIONING_PROFILE_BASE64` | App Store provisioning profile 的 Base64 |
| `IOS_PROVISIONING_PROFILE_NAME` | Provisioning profile 名称 |

证书、私钥、Profile 和 API Key 只作为 Actions Secret 使用，禁止写进仓库、源码包、截图或 App。上传前工作流会执行来源和隐私审计。

## 版权和隐私

iOS 端是冷咖啡原创 SwiftUI 界面和网络/Keychain 集成，按 `GPL-3.0-only` 发布。移动端对应源码、许可证和第三方声明随源码包提供。聊天内容会发送到顾客选择的服务商；Key 只保存在本机 Keychain。分享配置不包含 Key 或会话记录。

冷咖啡 API 中转、收费本机闭源工作流和定制服务分别计费。闭源服务不改变 iOS 开源客户端的 GPL 许可范围。
