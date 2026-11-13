# 桌面发布维护

1. 修改 `VERSION`、`desktop/package.json`、锁文件和界面版本；更新 README 与对应 `docs/release-notes-<VERSION>.md`，运行 `python tools/build_readme.py`。
2. 本地通过 `cd desktop && npm ci && npm run check`，再运行相关 UI、网关和打包检查。所有验收使用独立资料目录，不携带个人密钥。
3. 将待发布提交推到 `codex/release-*` 分支，在该分支手动运行 `desktop-build`，勾选 `publish_release`。
4. 工作流先运行源码和四个平台构建检查，再发布七个安装包及校验值。已发布版本号属于另一提交时会直接停止，必须升版本，避免覆盖旧版本。
5. 发布完成后运行 `python tools/verify_release_downloads.py --repo 3641397194-wq/gpt6-Astra --check-latest`。确认固定版本与 Latest 的十四个安装包入口均可匿名下载，再把发布提交快进合并到 `main`。
6. `main` 下载链接统一指向已验证的固定版本，统一下载页使用 `/releases/latest`。更换文件名或版本时一并更新文档，避免 README 先于资产上线而出现 404。

Windows/macOS/Linux 的正式产物由对应原生运行器构建。预览构建仍在版本号和发布说明标识 `preview`，但 GitHub release 元数据使用可参与 Latest 的发布类型。
