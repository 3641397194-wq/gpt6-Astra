# 冷咖啡 Android 3.3.0-preview.6 · 点击无响应修复

本次仅发布 Android；桌面与 iOS 版本、UI 配色、图片和主页排版保持原样。

## 修复

- 修复旧版 Android System WebView 无法解析新版 JavaScript，导致页面显示但按钮事件未绑定的问题。
- 补齐旧 WebView 缺少的浏览器接口；Markdown 不兼容时显示经过转义的纯文本，保留对话可用性。
- 修复缺少 TransformStream 时的流式结束处理，并保留系统主题变化的兼容监听。
- 按 Android API 版本配置原有导航栏属性，保留已有颜色和布局。

## 安装与升级

- 应用 ID：`com.coldcoffee.mobile`。
- versionName：`3.3.0-preview.6`；versionCode：`330006`。
- 沿用上一版正式发布证书，不使用调试签名；可覆盖升级，不需要先卸载旧版。
- 签名证书 SHA-256：`a5d756a285673e886f3f7e5f1a67d940ae32e9ba6b77cb8d11f9c185dc9ec21d`。
- 下载 APK 时请同时参考 `SHA256SUMS-Android.txt`；GPL 对应源码 ZIP 与安装包同页提供，保留原有版权和第三方许可。

## 验证

- 17 项移动逻辑单测与 14 项浏览器交互测试通过，覆盖旧版 WebView 能力缺失的情况。
- 签名 Release 构建、Android 原生单元测试、Release Lint 与 APK 内容审计通过。
- Android 10 / WebView 74：原版能够复现脚本解析错误；修复版本完成真实触屏与覆盖升级验证。
- 此独立发布不替换桌面默认 Latest，不发布或更改 iOS 附件。
