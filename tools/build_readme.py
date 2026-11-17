"""Render both repository previews from README.md, leaving the source untouched."""

import argparse
from collections import Counter
from html import escape
from html.parser import HTMLParser
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
REPOSITORY = "https://github.com/3641397194-wq/gpt6-Astra"
# electron-builder expands Linux x64 to x86_64 for AppImage and amd64 for DEB.
INSTALLERS = (
    ("win", "x64", "exe"),
    ("mac", "arm64", "dmg"),
    ("mac", "arm64", "zip"),
    ("mac", "x64", "dmg"),
    ("mac", "x64", "zip"),
    ("linux", "x86_64", "AppImage"),
    ("linux", "amd64", "deb"),
)
MOBILE_ASSETS = (
    "ColdCoffee-Mobile-Android-{version}.apk",
    "ColdCoffee-Mobile-Source-{version}.zip",
)
CSS = '''
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;color:#242329;background:#eeeae7;font:16px/1.8 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}
a{color:#ad203b;text-decoration:none;text-underline-offset:4px}a:hover{text-decoration:underline}a:focus-visible,summary:focus-visible{outline:3px solid #c0324a;outline-offset:5px;border-radius:3px}
.appbar{background:#19181c;color:#f9f5ef;border-bottom:3px solid #bc3049;padding:18px max(24px,calc((100vw - 1420px)/2));display:flex;justify-content:space-between;align-items:center;gap:24px}.repo-name{font-size:18px;font-weight:600;letter-spacing:.03em;display:flex;align-items:center;gap:12px}.repo-name img{width:38px;height:38px;object-fit:cover;border-radius:9px}.repo-name strong{color:#fff}.preview-label{font-size:14px;color:#c6bdbe}
.repo-tabs{background:#fffdf9;padding:0 max(24px,calc((100vw - 1420px)/2));display:flex;gap:30px;border-bottom:1px solid #e5deda;overflow-x:auto;white-space:nowrap}.repo-tabs a{padding:14px 0;font-size:15px;color:#5c5456}.repo-tabs .selected{color:#ad203b;border-bottom:3px solid #ad203b;font-weight:700}
.container{max-width:1480px;padding:32px;margin:auto}.notice{border:1px solid #dfd4cf;border-radius:16px;background:#fffaf5;padding:19px 24px;margin-bottom:28px;display:flex;justify-content:space-between;align-items:center;gap:24px;font-size:15px}.notice strong{color:#8f2136}.notice a{background:#a8223b;color:#fff;border-radius:10px;padding:12px 18px;white-space:nowrap;font-weight:700}
.repo-grid{display:grid;grid-template-columns:minmax(0,1090px) 260px;gap:30px;align-items:start}.readme{border:1px solid #e2d9d4;border-radius:18px;background:#fffdfb;overflow:hidden;min-width:0;box-shadow:0 12px 44px #33222707}.readme-tab{font-size:14px;padding:15px 30px;border-bottom:1px solid #e9e0dc;font-weight:600;color:#716568;background:#fcf9f6}
.markdown-body{padding:36px;font-size:16px;overflow-wrap:anywhere}.markdown-body img{max-width:100%;height:auto;vertical-align:middle;border-radius:10px}.markdown-body>div[align="center"]>img:first-child{display:block;width:100%;border-radius:16px;box-shadow:0 18px 45px #2110181f}.markdown-body h1{font-size:clamp(28px,3.3vw,42px);line-height:1.32;letter-spacing:-.035em;padding-bottom:14px;margin:28px 0 18px;color:#17151a}.markdown-body h2{font-size:28px;line-height:1.4;border-bottom:1px solid #e6dcd6;padding-bottom:15px;margin:52px 0 22px;scroll-margin-top:24px;letter-spacing:-.02em}.markdown-body h3{font-size:21px;line-height:1.5;margin-top:30px}.markdown-body p{margin:15px 0 21px}.markdown-body sub{color:#75686c;font-size:14px;line-height:1.7}.markdown-body table{display:block;max-width:100%;width:100%;overflow-x:auto;border-collapse:collapse;font-size:15px;margin:24px 0;border-radius:10px}.markdown-body td,.markdown-body th{border:1px solid #e5dcd7;padding:16px;vertical-align:top;min-width:138px}.markdown-body th{background:#f5efeb;color:#3d3337;font-weight:700}.markdown-body td{background:#fffdfb}.markdown-body .model-spotlight{border:1px solid #b78995;box-shadow:0 12px 28px #4b182217}.markdown-body .model-spotlight th{background:#282126;color:#fff;border-color:#594049;font-size:18px}.markdown-body .model-spotlight td{background:#fff7f5}.markdown-body .model-spotlight td[colspan]{background:#f9ecea}.markdown-body blockquote{margin:28px 0;border-left:4px solid #b12740;border-radius:0 12px 12px 0;background:#faf0ee;padding:15px 22px;color:#593a43}.markdown-body blockquote p{margin:8px 0}.markdown-body pre{padding:20px;border:1px solid #e6dcd6;border-radius:12px;background:#f6f1ed;overflow:auto;line-height:1.65}.markdown-body code{font-family:Consolas,"SFMono-Regular",monospace;font-size:.91em}.markdown-body details{border:1px solid #e2d7d2;padding:17px 21px;border-radius:12px;margin-top:24px;background:#fcf9f7}.markdown-body summary{cursor:pointer;font-weight:600;font-size:15px;color:#76646a}.markdown-body hr{border:0;border-top:1px solid #e6dcd6;margin-top:38px}
.about{padding:24px 20px;border:1px solid #e2d9d4;border-radius:16px;background:#fffdf9}.about h3{font-size:17px;margin:0 0 14px;color:#252026}.about p{font-size:14px;color:#76686d;line-height:1.9}.about .tag{display:inline-block;font-size:12px;background:#f7e7e7;color:#9e2940;border-radius:7px;padding:4px 9px;margin:0 3px 9px 0}.about hr{border:0;border-top:1px solid #e5dbd5;margin:25px 0}.about a{display:block;margin-top:14px;font-size:14px}
@media(max-width:1100px){.repo-grid{grid-template-columns:1fr}.about{display:none}.container{padding:22px}.markdown-body{padding:30px}.preview-label{display:none}}
@media(max-width:600px){.appbar{padding:18px}.repo-name{font-size:16px}.container{padding:12px}.readme{border-radius:12px}.readme-tab{padding:13px 18px}.markdown-body{padding:18px;font-size:16px}.markdown-body h1{font-size:25px}.markdown-body h2{font-size:25px;margin-top:38px}.markdown-body th,.markdown-body td{padding:12px;min-width:145px;font-size:15px}.markdown-body sub{font-size:13px}.notice{display:block;padding:17px;font-size:15px;margin-bottom:16px}.notice a{display:inline-block;margin-top:14px}.repo-tabs{gap:23px;padding:0 18px}.repo-tabs a{font-size:14px}.markdown-body blockquote{padding:12px 17px}.markdown-body details{padding:14px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
'''


class AnchorLinks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hrefs = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self.hrefs.extend(value for key, value in attrs if key == "href" and value)


def validate_downloads(root, body):
    version = (root / "VERSION").read_text(encoding="utf-8-sig").strip()
    if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?", version):
        raise ValueError("VERSION must contain a release version")
    package = json.loads((root / "desktop/package.json").read_text(encoding="utf-8-sig"))
    if package["version"] != version:
        raise ValueError("VERSION and desktop/package.json version disagree")

    expected = []
    for platform, arch, ext in INSTALLERS:
        name = package["build"][platform]["artifactName"]
        for key, value in (("version", version), ("arch", arch), ("ext", ext)):
            name = name.replace("${" + key + "}", value)
        if "${" in name or "/" in name or "\\" in name:
            raise ValueError(f"Unsupported installer artifactName: {name}")
        expected.append(f"{REPOSITORY}/releases/download/v{version}/{name}")
    expected.extend(
        f"{REPOSITORY}/releases/download/v{version}/{name.format(version=version)}"
        for name in MOBILE_ASSETS
    )

    parser = AnchorLinks()
    parser.feed(body)
    actual = [url for url in parser.hrefs if url.startswith(f"{REPOSITORY}/releases/download/")]
    if Counter(actual) != Counter(expected):
        missing = sorted((Counter(expected) - Counter(actual)).elements())
        unexpected = sorted((Counter(actual) - Counter(expected)).elements())
        raise ValueError(
            "README installer links do not match VERSION and artifactName"
            f"; missing={missing}; unexpected={unexpected}"
        )
    return version


def rebase_docs_paths(body, prefix):
    return re.sub(
        r"""(\b(?:src|href)\s*=\s*)(["'])docs/""",
        lambda match: match[1] + match[2] + prefix,
        body,
    )


def render_page(body, version, local_preview):
    prefix = "/docs/" if local_preview else ""
    body = rebase_docs_paths(body, prefix)
    workbench_href = "/workbench/" if local_preview else "#上手使用"
    aside_text = "操作新版软件 ↗" if local_preview else "查看软件启动步骤 ↓"
    asset_prefix = f"{prefix}assets/"
    title = "冷咖啡 · GPT-6.2 Astra / Sol 双模型焦点"
    label = "本地仓库主页预览" if local_preview else "Astra / Sol · 电脑、安卓与 iPhone"
    return f'''<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="冷咖啡 GPT-6.2 Astra 与 Sol 模型焦点：连接自己的中转，读取实际模型 ID，在电脑、Android 和 iPhone 上流式对话。">
<meta name="theme-color" content="#19181c">
<link rel="icon" type="image/png" href="{asset_prefix}coldcoffee-noir-icon-62.png">
<title>{title}</title><style>{CSS}</style></head><body>
<header class="appbar"><div class="repo-name"><img src="{asset_prefix}coldcoffee-noir-avatar-62.png" alt=""><strong>冷咖啡</strong> / GPT-6.2</div><span class="preview-label">{label}</span></header>
<nav class="repo-tabs" aria-label="项目导航"><a class="selected" href="#模型焦点">GPT-6.2 双模型</a><a href="#安卓手机端">Android 手机端</a><a href="#ios手机端">iPhone / iOS</a><a href="#软件界面">电脑工作台</a><a href="#下载">下载安装</a><a href="#冷咖啡服务">中转与定制</a><a href="#冷咖啡社群">冷咖啡社区</a></nav>
<div class="container"><div class="notice"><span><strong>{escape(version)} · GPT-6.2 Astra / Sol。</strong> 连接后从 <code>/v1/models</code> 选准确 ID；账号权限以服务商为准。下载前请核对 GitHub Assets 与校验文件。</span><a href="#下载">选择你的设备 ↓</a></div>
<div class="repo-grid"><article class="readme"><div class="readme-tab">冷咖啡 · Astra / Sol 产品预览与使用说明</div><div class="markdown-body">{body}</div></article><aside class="about"><h3>一杯冷咖啡，两种新焦点</h3><p>GPT-6.2 Astra 与 Sol 在模型目录中优先展示。准确 ID 从服务商返回列表中选择；电脑、Android 和 iPhone 共享清晰的接入与对话体验。</p><span class="tag">GPT-6.2 Astra</span><span class="tag">GPT-6.2 Sol</span><span class="tag">电脑＋手机</span><span class="tag">冷咖啡中转</span><span class="tag">独立闭源定制</span><hr><h3>当前预览</h3><p>{escape(version)}<br>预览版<br>Windows / macOS / Linux / Android / iOS<br>官网：coldcoffeeai.com<br>接口：coldcoffeeai.com/v1</p><a href="#安卓手机端">安卓界面与接入 ↓</a><a href="#软件界面">电脑端界面 ↓</a><a href="{prefix}ANDROID.md">安卓安装教程 ↗</a><a href="{prefix}IOS-MARKETING.md">iOS 构建与上架 ↗</a><a href="{prefix}MOBILE-PRIVACY.md">手机端数据与隐私 ↗</a><a href="{prefix}release-notes-{escape(version)}.md">本版更新说明 ↗</a><a href="{workbench_href}">{aside_text}</a><a href="#下载">统一下载入口 ↓</a><a href="#冷咖啡服务">付费中转与本机定制 ↓</a><a href="#冷咖啡社群">QQ / 微信咨询 / Telegram ↓</a><hr><p>顾客填写自己的 Key；公开发布内容不内置个人密钥。</p></aside></div></div></body></html>'''

def generate(root, check=False):
    root = root.resolve()
    body = (root / "README.md").read_text(encoding="utf-8")
    version = validate_downloads(root, body)
    pages = {
        root / "docs/readme-preview.html": render_page(body, version, True),
        root / "docs/index.html": render_page(body, version, False),
    }
    if check:
        stale = [
            str(path.relative_to(root))
            for path, content in pages.items()
            if not path.exists() or path.read_text(encoding="utf-8") != content
        ]
        if stale:
            raise ValueError("Preview pages need regeneration: " + ", ".join(stale))
        return
    (root / "docs").mkdir(parents=True, exist_ok=True)
    for path, content in pages.items():
        path.write_text(content, encoding="utf-8", newline="\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT, help="Repository root (supports isolated fixtures)")
    parser.add_argument("--check", action="store_true", help="Validate links and preview freshness without writing")
    args = parser.parse_args()
    try:
        generate(args.root, check=args.check)
    except (OSError, ValueError, KeyError) as error:
        parser.exit(1, f"README preview generation failed: {error}\n")
    print("README previews verified" if args.check else "README previews generated; README.md preserved")


if __name__ == "__main__":
    main()
