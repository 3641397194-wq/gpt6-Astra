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
CSS = '''*{box-sizing:border-box}body{margin:0;color:#1f2328;background:#fff;font:14px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}a{color:#0969da;text-decoration:none}a:hover{text-decoration:underline}.appbar{background:#f6f8fa;border-bottom:1px solid #d1d9e0;padding:18px 30px;display:flex;justify-content:space-between;align-items:center;gap:20px}.repo-name{font-size:14px;font-weight:600}.preview-label{font-size:12px;color:#656d76}.repo-tabs{background:#f6f8fa;padding:0 30px;display:flex;gap:25px;border-bottom:1px solid #d1d9e0}.repo-tabs span{padding:12px 0;font-size:13px}.repo-tabs .selected{border-bottom:2px solid #f78166}.container{max-width:1200px;padding:28px;margin:auto}.notice{border:1px solid #d1d9e0;border-radius:7px;background:#f6f8fa;padding:14px 18px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:center;gap:20px}.notice a{background:#1f2328;color:#fff;border-radius:6px;padding:8px 14px;white-space:nowrap}.repo-grid{display:grid;grid-template-columns:minmax(0,880px) 220px;gap:25px}.readme{border:1px solid #d1d9e0;border-radius:7px;overflow:hidden;min-width:0}.readme-tab{font-size:12px;padding:12px 18px;border-bottom:1px solid #d1d9e0;font-weight:600}.markdown-body{padding:30px;font-size:14px}.markdown-body img{max-width:100%;height:auto}.markdown-body h1{font-size:30px;border-bottom:1px solid #d1d9e0;padding-bottom:12px;margin:22px 0 16px}.markdown-body h2{font-size:22px;border-bottom:1px solid #d1d9e0;padding-bottom:9px;margin:34px 0 16px;scroll-margin-top:20px}.markdown-body p{margin:12px 0 18px}.markdown-body sub{color:#656d76;font-size:11px}.markdown-body table{width:100%;border-collapse:collapse;font-size:12px;margin:20px 0}.markdown-body td,.markdown-body th{border:1px solid #d1d9e0;padding:12px}.markdown-body th{background:#f6f8fa}.markdown-body blockquote{margin:24px 0;border-left:4px solid #c92537;background:#fff7f7;padding:10px 18px;color:#4f353a}.markdown-body blockquote p{margin:7px 0}.markdown-body pre{padding:16px;border-radius:7px;background:#f6f8fa;overflow:auto}.markdown-body code{font-family:Consolas,monospace;font-size:12px}.markdown-body details{border:1px solid #d1d9e0;padding:14px;border-radius:7px;margin-top:20px}.markdown-body summary{cursor:pointer;font-weight:600}.markdown-body hr{border:0;border-top:1px solid #d1d9e0;margin-top:30px}.about h3{font-size:15px;margin:0 0 14px}.about p{font-size:13px;color:#656d76}.about .tag{display:inline-block;font-size:11px;background:#ddf4ff;color:#0969da;border-radius:14px;padding:3px 9px;margin:0 3px 7px 0}.about hr{border:0;border-top:1px solid #d1d9e0;margin:22px 0}.about a{display:block;margin-top:12px;font-size:12px}@media(max-width:900px){.repo-grid{grid-template-columns:1fr}.about{display:none}.container{padding:16px}.markdown-body{padding:20px}.appbar{padding:15px}.preview-label{display:none}}@media(max-width:520px){.markdown-body{padding:12px;font-size:12px}.markdown-body h1{font-size:23px}.markdown-body th,.markdown-body td{padding:5px;font-size:10px}.notice{display:block;font-size:12px}.notice a{display:inline-block;margin-top:10px}.repo-tabs{gap:14px;padding:0 16px}.repo-tabs span{font-size:11px}}'''


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
    notice_text = "打开软件交互预览 ↗" if local_preview else "启动软件：查看步骤 ↓"
    aside_text = "操作新版软件 ↗" if local_preview else "查看软件启动步骤 ↓"
    return f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>冷咖啡 · 仓库主页新版预览</title><style>{CSS}</style></head><body><header class="appbar"><div class="repo-name">3641397194-wq / <strong>gpt6-Astra</strong></div><span class="preview-label">仓库主页排版预览 · 非 GitHub 在线页面</span></header><nav class="repo-tabs"><span class="selected">代码与说明</span><span>问题讨论</span><span>变更记录</span><span>项目文档</span></nav><div class="container"><div class="notice"><span><strong>十五个本地目标。</strong> Windows、macOS、Linux 都是这一版。闭源破甲和定制破甲进 QQ 群找管理。仓库里不放 Key。</span><a href="{workbench_href}">{notice_text}</a></div><div class="repo-grid"><article class="readme"><div class="readme-tab">README.md · 项目主页</div><div class="markdown-body">{body}</div></article><aside class="about"><h3>关于冷咖啡</h3><p>破甲工作台<br>十五个本地目标、一键备份安装、一键卸载。Windows、macOS、Linux 都是这一版。</p><span class="tag">冷咖啡</span><span class="tag">Windows</span><span class="tag">十五个目标</span><hr><h3>当前预览</h3><p>{escape(version)}<br>官网：coldcoffeeai.com<br>接口：coldcoffeeai.com/v1</p><a href="{workbench_href}">{aside_text}</a><a href="#下载">下载三个系统 ↓</a><a href="#一键安装目标">十五个一键目标 ↓</a><a href="#冷咖啡社群">QQ + Telegram 社群 ↓</a><hr><p>Key 只留在这台电脑上。</p></aside></div></div></body></html>'''


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
