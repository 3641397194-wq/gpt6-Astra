# 冷咖啡工作台 3.2.0-preview.6

本版为官方 DeepSeek Harness Desktop 补齐插件协议接入，内置冷咖啡原生插件 `0.1.1`。Desktop 复用官方客户端的自定义协议、Host 认证和会话服务，Web 保留既有接入方式；安装位置、技能原文与完整欢迎词继续沿用。

## 更新

- 修复官方 Desktop 页面能显示冷咖啡皮肤、却连不上插件接口的问题。识别 `dsh-app://app` 后，状态、激活、任务、记录和设置请求通过相对 `/coldcoffee` 路径交给官方客户端协议代理，Host 认证由客户端处理。
- Web 端沿用原本的本机接口；Desktop / Web 共用安装位置、Home patch、六个既有工作流与官方会话服务，沿用顾客自己的模型配置和工具权限。
- 桌面连接成功时，助手显示「已连接 Harness 桌面端」。保留冰晶开屏、全局冰蓝皮肤、月夜工作空间、社群入口和可调整的外观。
- 原启动词、完整欢迎词、十五个 AI 模型席位、现有 REA 与 reverse-skill 资源继续保留。
- 同步主页、插件指南、接口契约和版本下载入口，新增官方 Windows Desktop 实际运行双图。既有工作台截图仍注明来自 `3.2.0-preview.5`；此前三张 Harness 图仍注明为 `0.2.1-rc.2` Web。

## 验证范围

- 官方 Windows Desktop `0.2.1-rc.5` 安装包与 nightly feed 的 SHA-512 一致，供应商签名为 `Valid`。原始 EXE / asar 保留不变；在独立观察副本中增加入口、调整 `package.json.main` 后加载原文保留的官方 main 与 Host bundle，隔离用户数据、抑制默认协议注册、外链及窗口抢焦点。截图来自此实际运行副本。
- 八项官方 Windows bundle 运行验收通过：干净 Home 选择性安装、官方 Cordis 注入、代理状态与六技能可用、精确激活与全文欢迎词、官方会话任务完成、图片/Blob 壁纸/皮肤与动画、全部社群与面板切换、所有插件请求走自定义协议。
- 本轮选择性安装核验 111 文件，包含原词包、六个既有技能及其原文档和原生插件。此前 `.5` 的 11870 文件完整安装与随后参考资料缺失的复查记录继续保留，本轮未重新执行该全量安装。
- 官方 `SessionController` 对本机确定性 Messages fixture 创建并完成任务，实际输出进入记录；12 条插件请求均走 `dsh-app://app`，页面运行错误为 0。付费 API、真实研究成果和真实 REA 工具调用仍待实测，本轮未使用个人模型凭证。
- 独立 Electron transport fixture 的 14 项检查通过；完整源码检查共 185 项测试，184 通过、1 项 Windows POSIX 权限语义测试跳过、0 失败。传输 fixture 与官方 bundle 运行验收分开记录。
- 本工作台 `.6` Windows 成品检查通过：460 个归档成员未发现私人路径或真实 Key，9 个插件源码文件与包内内容逐字节一致。
- 此前官方 `0.2.1-rc.2` Web 界面、技能映射、原生会话创建与接收、缺少模型凭证时的真实错误回显，保留原验收记录。
- 官方 Harness Desktop 成品本轮仅在 Windows 实测；macOS / Linux 范围为本工作台安装包构建检查及传输回归。七个发行安装包由 GitHub Actions 在对应平台执行检查、构建与打包版 UI 测试后发布，附带 SHA-256 校验值。

## 使用

1. 在冷咖啡工作台点击「安装到 DeepSeek」，选中官方 Desktop 实际使用的 Harness 数据根（默认 `~/.dsh`，自定义时为 `$DSH_HOME`）。
2. 安装并核验后，完整退出并重新打开官方 Harness Desktop。Web 用户重启原 Harness Web 服务。
3. 点击右下角「冷咖啡」，单独输入 `冷咖啡`。连接成功后选择工作流并提交任务，实际进度与错误在「记录」中查看。

完整说明和验收范围见 [DeepSeek Harness 插件说明](DEEPSEEK-PLUGIN.md)，接口来源与请求路径见 [插件接口契约](HARNESS-PLUGIN-CONTRACT.md)。

## 中转与社群

[冷咖啡付费 API 中转](https://coldcoffeeai.com/)按站内方案计费。闭源工作流提供收费的本机安装与定制，可使用现有订阅或其他中转；进 QQ 群私聊管理沟通需求与费用。

- QQ 一群：`1057540028`
- QQ 二群：`1077074552`
- QQ 三群：`618179023`
- Telegram 交流群：[t.me/coolcoffeeai](https://t.me/coolcoffeeai)
- Telegram 频道：[t.me/chachachalkf](https://t.me/chachachalkf)
