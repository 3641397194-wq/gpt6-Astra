# 冷咖啡 iOS 3.3.0-preview.6 · 交互修复开发版

本次只更新 iOS；Android、桌面安装包以及现有 UI 配色、图片、布局保持不变。

## 修复

- 缺少 Key 或模型时，保留已输入的草稿，并显示对应操作提示。
- 停止请求时清理空回复；已取消请求及旧模型目录请求不会覆盖新状态。
- API Key 按规范化的 HTTPS 中转地址分别保存在本机 Keychain，切换地址不再携带其他中转的 Key。
- 错误的中转地址不会关闭设置页或清除原来的连接，错误信息在当前设置页显示。
- 新增真实 XCUITest 触屏验收，覆盖设置、导航、错误提示与草稿保留；保留原有单元测试。

## 旧版本升级提醒

旧版保存的全局 Key 没有可信的中转地址绑定。本版保留它在本机 Keychain，但不会自动向当前中转发送。请在接入设置里重新填写并保存一次，后续切换中转按地址读取各自的 Key。

## 构建与分发状态

- iPhone Simulator 上 11 项单元测试与 4 项真实 XCUITest 点按测试通过，包括真实 Keychain 读写和中转 Key 隔离。
- 测试使用隔离的合成数据，不使用顾客的真实 Key，不宣称验证真实服务商的收费权益。
- 模拟器采用本地临时签名保留 Keychain 权限；这不等于 Apple 设备分发签名。
- [查看本次模拟器测试和设备构建记录](https://github.com/3641397194-wq/gpt6-Astra/actions/runs/46109338570)。

- Bundle ID：`com.coldcoffee.mobile.ios`；系统版本号 `3.3.0`；构建号 `6`。
- 本页提供完整 GPL 对应源码、无签名设备 `.app` 开发构建和 `SHA256SUMS-iOS.txt`。
- 无签名 `.app` **不是可直接安装到顾客 iPhone 的 IPA**；仍需发布者的 Apple 开发者签名。
- 仓库目前未配置 Apple Team、分发证书、Profile 与 App Store Connect API 凭据，因此没有上传 TestFlight，也没有上架 App Store。
- Apple 签名准备清单见仓库 `docs/IOS.md`；私钥和证书只应存入受保护的 Actions Secrets，不要放入源码或公开附件。
