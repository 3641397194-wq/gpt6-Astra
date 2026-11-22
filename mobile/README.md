# 冷咖啡 · 随行（Android）

原创冷咖啡界面、公开 Chatbox 兼容模块与原生 Android 集成。支持 HTTPS OpenAI 兼容中转，提供 Chat Completions / Responses 两种协议、模型读取与手动选择、流式聊天、停止、重新生成、图片提问、本机会话、移动研究工作台、字号和主题。

## 移动研究工作台

手机端不只聊天。接入中转并选择模型后，打开底部的「工作台」，可以选择：

- REA 逆向分析
- 红队渗透
- API 审计
- 游戏客户端研究
- 样本与取证
- 证据报告

每个入口都有对应的结构化字段。填写 `TARGET`、`HOST`、接口、进程或模块、样本说明、日志和希望得到的输出，客户端会把任务通过当前服务商流式提交，支持停止、复制、分享和本机记录。Android 工作台可读取文本日志或配置片段；大体积二进制、本机设备和实际工具链仍交给桌面工作台处理。

优先推荐冷咖啡付费 API 中转 <https://coldcoffeeai.com/>，也能接入其他服务商。客户填写自己的 Key；模型和价格以所选服务商为准。独立收费闭源工作流提供本机安装与定制，可使用现有订阅或其他中转，进 QQ 群私聊管理了解方案。

## 安装和接入

从本仓库对应 Release 下载签名的 `ColdCoffee-Mobile-Android-3.3.0-preview.4.apk`；Android 8.0 及以上并保持 Android System WebView 为近期版本。在“接入”页选择冷咖啡或其他服务商，填写自己的 Key，读取模型列表后开始聊天或打开工作台提交任务。模型选择器优先显示 GPT-6.2 Astra / Sol；只有服务商模型目录返回的对应 ID 才能直接选择，未列出时仍可手动填写实际模型 ID，原有选择不会被自动覆盖。

## 从源码构建

要求 Node.js 22、Python 3、JDK 17、Android SDK 35 / build-tools 35.0.0。源码包包含固定 Gradle 8.9 wrapper，依赖与构建脚本保持公开。

克隆完整仓库后先进入 `mobile`；下载独立对应源码 ZIP 后，先解压并进入 `coldcoffee-mobile`。以下命令从包含 `package.json` 和 `android` 的移动端源码目录执行：

```sh
npm ci
npm test
npx playwright install chromium
npm run test:ui
npm run audit:source
cd android
./gradlew --no-daemon :app:assembleRelease :app:testDebugUnitTest
```

Windows 使用 `gradlew.bat`。构建会在当前移动端源码目录生成 `www/`，Gradle 把它放入 APK。首次运行 Gradle 会下载已固定的 Gradle / Android 构建依赖。

发行签名通过环境变量配置：`COLDCOFFEE_ANDROID_KEYSTORE`、`COLDCOFFEE_ANDROID_STORE_PASSWORD`、`COLDCOFFEE_ANDROID_KEY_ALIAS`、`COLDCOFFEE_ANDROID_KEY_PASSWORD`。不要把这些值、KeyStore 文件或本地 SDK 路径写入源码。没有签名配置时只生成标记 `-unsigned` 的产物，它不是客户安装包；不采用 debug 签名冒充发行签名。

在 API35 模拟器运行真实原生桥测试：

```sh
./gradlew --no-daemon :app:connectedDebugAndroidTest
```

测试使用合成的 loopback HTTP fixture。发行版仅允许 HTTPS，原生请求不忽略 TLS 证书错误，不自动把 Bearer Key 转发给重定向目标。

## 隐私和许可

服务商 Key 与会话由 Android Keystore 支持的 AES-GCM 本机存储保存，网页层不读回原始 Key；系统备份和设备迁移关闭。聊天、工作台文本和主动选择的图片发送给当前服务商。配置分享不带 Key、工作台记录或聊天记录，应用不内置统计追踪。

**GPL-3.0-only**。本目录的许可独立于桌面程序的 MIT 许可。详见 [LICENSE](LICENSE)、[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 与 `vendor/chatbox/SOURCE.json`。不是 Chatbox 官方 Android 客户端；每次发布同时提供对应修改源码 ZIP。
