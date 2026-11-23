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
# iOS development attachments are published separately from the desktop/Android release.
IOS_DEVELOPMENT_VERSION = "3.3.0-preview.3"
IOS_DEVELOPMENT_ASSETS = (
    "ColdCoffee-iOS-Source-{version}.zip",
    "ColdCoffee-iOS-Unsigned-{version}.zip",
    "SHA256SUMS-iOS.txt",
)
CSS = '''
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;color:#efeaf0;background:radial-gradient(900px 500px at 14% -8%,rgba(255,59,92,.12),transparent 58%),radial-gradient(640px 420px at 88% 8%,rgba(240,190,91,.07),transparent 58%),#08080d;font:16px/1.8 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei","PingFang SC",sans-serif;-webkit-font-smoothing:antialiased}
a{color:#ff7b93;text-decoration:none;text-underline-offset:4px}a:hover{color:#ff9fb2;text-decoration:underline}
a:focus-visible,summary:focus-visible{outline:2px solid #ff3b5c;outline-offset:4px;border-radius:4px}
.appbar{background:rgba(12,11,18,.94);backdrop-filter:blur(12px);color:#f9f5f8;border-bottom:1px solid #2b2537;box-shadow:0 1px 0 rgba(255,59,92,.14);padding:16px max(24px,calc((100vw - 1440px)/2));display:flex;justify-content:space-between;align-items:center;gap:24px;position:sticky;top:0;z-index:20}
.repo-name{font-size:18px;font-weight:700;letter-spacing:.02em;display:flex;align-items:center;gap:12px}
.repo-name img{width:40px;height:40px;object-fit:cover;border-radius:11px;border:1px solid rgba(255,76,108,.55)}
.repo-name strong{color:#fff}
.repo-name .badge{font-size:11px;padding:3px 10px;border-radius:999px;background:rgba(255,59,92,.15);border:1px solid rgba(255,76,108,.4);color:#ffa4b6;font-weight:600}
.preview-label{font-size:13px;color:#b2a5b6}
.repo-tabs{background:#0e0d15;padding:0 max(24px,calc((100vw - 1440px)/2));display:flex;gap:28px;border-bottom:1px solid #252131;overflow-x:auto;white-space:nowrap}
.repo-tabs a{padding:14px 0;font-size:14px;color:#b4a9b8;font-weight:500}.repo-tabs a:hover{color:#fff;text-decoration:none}
.repo-tabs .selected{color:#ff728c;border-bottom:3px solid #ff3b5c;font-weight:700}
.container{max-width:1480px;padding:28px 32px 48px;margin:auto}
.notice{border:1px solid #7a5c28;border-left:4px solid #f0be5b;border-radius:16px;background:linear-gradient(105deg,#21180b 0%,#141118 72%);padding:18px 24px;margin-bottom:26px;display:flex;justify-content:space-between;align-items:center;gap:24px;font-size:15px;color:#e8d9bb;box-shadow:0 12px 32px rgba(0,0,0,.35)}
.notice strong{color:#ffe8ae}.notice code{background:rgba(255,255,255,.08);padding:2px 6px;border-radius:6px;color:#ffd280}
.notice-actions{display:flex;gap:10px;flex-shrink:0;flex-wrap:wrap}
.notice a{background:linear-gradient(135deg,#ec2f52,#c81d42);color:#fff;border-radius:10px;padding:10px 18px;white-space:nowrap;font-weight:700;font-size:14px;box-shadow:0 6px 20px rgba(236,47,82,.3)}
.notice a:hover{text-decoration:none;filter:brightness(1.08)}
.notice a.vip-cta{background:linear-gradient(135deg,#f0be5b,#d49c37);color:#1d1304;box-shadow:0 6px 20px rgba(240,190,91,.24)}
.repo-grid{display:grid;grid-template-columns:minmax(0,1110px) 280px;gap:28px;align-items:start}
.readme{border:1px solid #2b2638;border-radius:20px;background:linear-gradient(180deg,#13121b 0%,#0f0f17 100%);overflow:hidden;min-width:0;box-shadow:0 18px 56px rgba(0,0,0,.45)}
.readme-tab{font-size:13px;padding:14px 30px;border-bottom:1px solid #262233;font-weight:650;color:#b8abb9;background:#171622;letter-spacing:.4px}
.markdown-body{padding:36px;font-size:16px;overflow-wrap:anywhere;color:#e7e0e9}
.markdown-body img{max-width:100%;height:auto;vertical-align:middle;border-radius:12px;border:1px solid rgba(255,255,255,.08)}
.markdown-body>div[align="center"]>img:first-child{display:block;width:100%;border-radius:16px;border:1px solid rgba(255,76,108,.28);box-shadow:0 20px 56px rgba(0,0,0,.55)}
.markdown-body h1{font-size:clamp(28px,3.2vw,42px);line-height:1.3;letter-spacing:-.025em;padding-bottom:12px;margin:24px 0 16px;color:#faf6fa;font-weight:800}
.markdown-body h2{font-size:26px;line-height:1.4;border-bottom:1px solid #2b2638;padding-bottom:13px;margin:48px 0 20px;scroll-margin-top:92px;color:#faf6fa;font-weight:750}
.markdown-body h3{font-size:20px;line-height:1.5;margin-top:28px;color:#f3eaf2}
.markdown-body p{margin:14px 0 20px;color:#d6ced8}
.markdown-body strong{color:#faf5f9}
.markdown-body sub{color:#9f94a6;font-size:13px;line-height:1.7}
.markdown-body table{display:block;max-width:100%;width:100%;overflow-x:auto;border-collapse:collapse;font-size:15px;margin:22px 0;border-radius:12px}
.markdown-body td,.markdown-body th{border:1px solid #2d273b;padding:14px 16px;vertical-align:top;min-width:130px}
.markdown-body th{background:#1c1929;color:#f7eff6;font-weight:700}
.markdown-body td{background:#13121c;color:#dcd3df}
.markdown-body .model-spotlight{border:1px solid rgba(255,76,108,.48);box-shadow:0 14px 36px rgba(232,46,81,.14)}
.markdown-body .model-spotlight th{background:linear-gradient(135deg,#2a1622,#1c1627);color:#fff;border-color:#573145;font-size:18px}
.markdown-body .model-spotlight td{background:#16131f}
.markdown-body .model-spotlight td[colspan]{background:#1c1624}
.markdown-body blockquote{margin:24px 0;border-left:4px solid #ff3b5c;border-radius:0 12px 12px 0;background:rgba(255,59,92,.09);padding:15px 22px;color:#f2dde3}
.markdown-body blockquote p{margin:8px 0;color:#f2dde3}
.markdown-body pre{padding:18px 20px;border:1px solid #2e283b;border-radius:12px;background:#0c0b12;color:#e8dfec;overflow:auto;line-height:1.65}
.markdown-body code{font-family:Consolas,"SFMono-Regular",monospace;font-size:.9em;background:rgba(255,255,255,.07);color:#ffc0cd;padding:2px 6px;border-radius:6px}
.markdown-body pre code{background:transparent;color:inherit;padding:0}
.markdown-body details{border:1px solid #2d273b;padding:15px 20px;border-radius:12px;margin-top:22px;background:#14131e}
.markdown-body summary{cursor:pointer;font-weight:650;font-size:15px;color:#d6c7d7}
.markdown-body hr{border:0;border-top:1px solid #2b2638;margin-top:36px}
.about{padding:24px 20px;border:1px solid #2d273c;border-radius:18px;background:linear-gradient(180deg,#161522 0%,#101018 100%);position:sticky;top:90px;box-shadow:0 14px 40px rgba(0,0,0,.38)}
.about h3{font-size:16px;margin:0 0 12px;color:#faf5f9}
.about p{font-size:13.5px;color:#b7acb9;line-height:1.85}
.about .tag{display:inline-block;font-size:12px;background:rgba(255,59,92,.14);border:1px solid rgba(255,76,108,.36);color:#ff9fb2;border-radius:8px;padding:4px 9px;margin:0 5px 8px 0;font-weight:600}
.about .tag.gold{background:rgba(240,190,91,.14);border-color:rgba(240,190,91,.42);color:#fae0a2}
.about hr{border:0;border-top:1px solid #2b2638;margin:20px 0}
.about a{display:block;margin-top:11px;font-size:14px;color:#ff8ca2}
.about a:hover{color:#ffb8c7}
@media(max-width:1160px){.repo-grid{grid-template-columns:1fr}.about{display:none}.container{padding:20px}.markdown-body{padding:28px}.preview-label{display:none}}
@media(max-width:600px){.appbar{padding:14px 16px}.repo-name{font-size:15px}.repo-name .badge{display:none}.container{padding:12px}.readme{border-radius:14px}.readme-tab{padding:12px 16px}.markdown-body{padding:18px;font-size:15px}.markdown-body h1{font-size:24px}.markdown-body h2{font-size:22px;margin-top:34px}.markdown-body th,.markdown-body td{padding:11px;min-width:130px;font-size:14px}.notice{display:block;padding:16px;font-size:14px;margin-bottom:16px}.notice-actions{margin-top:12px}.repo-tabs{gap:20px;padding:0 16px}}
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
    expected.extend(
        f"{REPOSITORY}/releases/download/v{IOS_DEVELOPMENT_VERSION}/{name.format(version=IOS_DEVELOPMENT_VERSION)}"
        for name in IOS_DEVELOPMENT_ASSETS
    )

    parser = AnchorLinks()
    parser.feed(body)
    actual = [url for url in parser.hrefs if url.startswith(f"{REPOSITORY}/releases/download/")]
    if Counter(actual) != Counter(expected):
        missing = sorted((Counter(expected) - Counter(actual)).elements())
        unexpected = sorted((Counter(actual) - Counter(expected)).elements())
        raise ValueError(
            "README release asset links do not match VERSION, artifactName or iOS development release"
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
    aside_text = "打开新版桌面软件预览 ↗" if local_preview else "查看软件启动步骤 ↓"
    asset_prefix = f"{prefix}assets/"
    title = "冷咖啡 · GPT-6.2 Astra / Sol 官方中转与全模型破甲工作台"
    label = "2026 暗夜绯红 · 本地主页预览" if local_preview else "GPT-6.2 Astra / Sol · 官方中转 · 闭源与定制"
    return f'''<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="冷咖啡 GPT-6.2 Astra / Sol 官方付费中转与全模型破甲工作台：coldcoffeeai.com 买 Key 直连，支持收费闭源破甲与专属定制，同步 GLM-5.4、Claude Fable 5.2、Gemini 4、Kimi K3.1 Pro 与 MiniMax M3.1 Flash。">
<meta name="theme-color" content="#08080d">
<link rel="icon" type="image/png" href="{asset_prefix}coldcoffee-flagship-icon.png">
<title>{title}</title><style>{CSS}</style></head><body>
<header class="appbar"><div class="repo-name"><img src="{asset_prefix}coldcoffee-flagship-avatar.png" alt=""><strong>冷咖啡</strong> / GPT-6.2 Astra · Sol <span class="badge">2026 旗舰重设计</span></div><span class="preview-label">{label}</span></header>
<nav class="repo-tabs" aria-label="项目导航"><a class="selected" href="#模型焦点">GPT-6.2 核心</a><a href="#冷咖啡服务">中转与闭源定制</a><a href="#冷咖啡社群">四QQ群 & TG</a><a href="#软件界面">新版软件</a><a href="#一键安装目标">16 入口全模型</a><a href="#安卓手机端">Android / iOS</a><a href="#下载">下载安装</a></nav>
<div class="container"><div class="notice"><span><strong>{escape(version)} · 核心主推 GPT-6.2 Astra / Sol + 冷咖啡付费中转。</strong> 去 <code>coldcoffeeai.com</code> 买 Key 即可满血使用内置工作流；需要收费闭源破甲与定制，进四个 QQ 群或 Telegram 找管理。</span><div class="notice-actions"><a href="https://coldcoffeeai.com/">开通冷咖啡中转 ↗</a><a class="vip-cta" href="#冷咖啡社群">闭源 / 定制进群 ↓</a></div></div>
<div class="repo-grid"><article class="readme"><div class="readme-tab">README.md · 冷咖啡 GPT-6.2 Astra / Sol 官方主页（同步 GLM-5.4 / Claude Fable 5.2 / Gemini 4）</div><div class="markdown-body">{body}</div></article><aside class="about"><h3>冷咖啡核心服务</h3><p>主打 <strong>GPT-6.2 Astra / Sol</strong> 官方付费中转（内置工作流）及<strong>收费闭源/定制破甲</strong>；同步升级 GLM-5.4、Claude Fable 5.2、Gemini 4、Kimi K3.1 Pro、MiniMax M3.1 Flash 与豆包 2.1。</p><span class="tag">GPT-6.2 Astra</span><span class="tag">GPT-6.2 Sol</span><span class="tag gold">coldcoffeeai.com</span><span class="tag gold">闭源 / 定制破甲</span><span class="tag">GLM-5.4</span><span class="tag">Claude Fable 5.2</span><span class="tag">Gemini 4</span><hr><h3>官方社群与通道</h3><p>QQ 一群：<code>1057540028</code><br>QQ 二群：<code>1077074552</code><br>QQ 三群：<code>618179023</code><br>QQ 四群：<code>1131239659</code><br>TG 群：<a style="display:inline;margin:0" href="https://t.me/coolcoffeeai">t.me/coolcoffeeai</a><br>TG 频道：<a style="display:inline;margin:0" href="https://t.me/chachachalkf">t.me/chachachalkf</a></p><hr><h3>快速跳转</h3><a href="https://coldcoffeeai.com/">开通冷咖啡中转 ↗</a><a href="#冷咖啡服务">闭源与定制破甲说明 ↓</a><a href="#冷咖啡社群">查看四群二维码与 TG ↓</a><a href="#软件界面">新版暗夜绯红桌面界面 ↓</a><a href="#一键安装目标">16 个一键安装入口 ↓</a><a href="#安卓手机端">Android / iPhone 客户端 ↓</a><a href="#下载">全平台下载入口 ↓</a><a href="{workbench_href}">{aside_text}</a><hr><h3>当前预览</h3><p>桌面与 Android：{escape(version)}<br>iOS 开发附件：{escape(IOS_DEVELOPMENT_VERSION)}<br>官网：coldcoffeeai.com<br>顾客自填 Key，公开仓库零私密信息。</p></aside></div></div></body></html>'''

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
