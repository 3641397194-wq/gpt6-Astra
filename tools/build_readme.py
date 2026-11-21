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
IOS_DEVELOPMENT_ASSETS = (
    "ColdCoffee-iOS-Source-{version}.zip",
    "ColdCoffee-iOS-Unsigned-{version}.zip",
    "SHA256SUMS-iOS.txt",
)
CSS = '''
:root {
  color-scheme: dark;
  --background: #120f12;
  --panel: #1d171b;
  --ink: #f7efec;
  --muted: #c2b5b8;
  --line: #41333a;
  --accent: #f4a2aa;
  --action: #a52d43;
  --page-width: 82rem;
  --gutter: clamp(1rem, 4vw, 4rem);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei UI", "PingFang SC", sans-serif;
  font-size: 100%;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: var(--background); color: var(--ink); line-height: 1.65; }
a { color: var(--accent); text-underline-offset: .28em; }
a:hover { color: #ffe4e5; }
a:focus-visible, summary:focus-visible, [tabindex]:focus-visible {
  outline: 3px solid #ffaeb5;
  outline-offset: 4px;
  border-radius: .25rem;
}
img { max-width: 100%; height: auto; vertical-align: middle; }
h1, h2, h3 { margin: 0; line-height: 1.25; color: var(--ink); }
p { margin: 0 0 1rem; }
p:last-child { margin-bottom: 0; }
code { font: .925em Consolas, ui-monospace, monospace; }
[id] { scroll-margin-top: 1.5rem; }
.skip-link {
  position: absolute;
  z-index: 3;
  top: .5rem;
  left: 1rem;
  padding: .5rem .75rem;
  background: var(--ink);
  color: var(--background);
  transform: translateY(-160%);
}
.skip-link:focus { transform: none; color: var(--background); }
.appbar {
  max-width: calc(var(--page-width) + 2 * var(--gutter));
  margin: auto;
  padding: 1.15rem var(--gutter);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem 2rem;
}
.repo-name {
  display: inline-flex;
  align-items: center;
  gap: .75rem;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--ink);
  white-space: nowrap;
  text-decoration: none;
}
.repo-name img { width: 2.4rem; height: 2.4rem; border-radius: 50%; border: 1px solid var(--line); }
.repo-tabs { display: flex; flex-wrap: wrap; gap: .35rem 1.4rem; }
.repo-tabs a { padding: .25rem 0; font-size: .9375rem; text-decoration: none; color: var(--muted); }
.repo-tabs a:is(:hover, :focus-visible) { color: var(--ink); text-decoration: underline; }
.repo-tabs .open-workbench { color: var(--accent); font-weight: 650; }
.container {
  max-width: calc(var(--page-width) + 2 * var(--gutter));
  margin: auto;
  padding: 0 var(--gutter) 2rem;
}
.landing-hero {
  position: relative;
  isolation: isolate;
  min-height: 32rem;
  aspect-ratio: 1672 / 941;
  display: grid;
  align-items: center;
  padding: clamp(2.5rem, 6vw, 5.35rem);
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: .85rem;
  background: #132331;
  text-align: left;
}
.hero-cover {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: right center;
  z-index: -2;
}
.landing-hero::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  background: linear-gradient(90deg, #0e1c2cf5, #0e1c2ceb 27%, #0e1c2cc9 41%, #0e1c2c55 52%, transparent 64%);
}
.hero-copy { max-width: min(35rem, 54%); }
.hero-copy h1 {
  font-family: "Songti SC", "Noto Serif CJK SC", SimSun, serif;
  font-size: clamp(3.1rem, 6.35vw, 6.25rem);
  font-weight: 700;
  letter-spacing: -.065em;
  line-height: 1.12;
  margin: 0 0 1.15rem;
}
.hero-lead { font-size: clamp(1.25rem, 2.2vw, 1.85rem); font-weight: 650; line-height: 1.45; }
.hero-description { max-width: 29rem; color: #e0d2d4; font-size: clamp(1rem, 1.2vw, 1.125rem); }
.hero-actions { display: flex; gap: .7rem; flex-wrap: wrap; margin: 1.65rem 0 .95rem; }
.button {
  display: inline-flex;
  min-height: 2.8rem;
  align-items: center;
  justify-content: center;
  padding: .55rem 1.1rem;
  border: 1px solid transparent;
  border-radius: .3rem;
  font-weight: 700;
  text-decoration: none;
  color: #fff6f6;
}
.button.primary { background: var(--action); border-color: #ba4253; }
.button.primary:hover { background: #bb3b50; color: white; }
.button.secondary { background: #160f14a8; border-color: #8c666f; }
.button.secondary:hover { background: #39252c; color: white; }
.hero-release, .caption, .release-note { color: var(--muted); font-size: .875rem; }
.hero-release { margin-bottom: 0; }
.content-section { padding: clamp(2.75rem, 6.25vw, 5.75rem) 0; }
.content-section + .content-section { border-top: 1px solid var(--line); }
.section-heading { max-width: 47rem; margin-bottom: 1.8rem; }
.section-heading h2, .legal-section h2 { font-size: clamp(2rem, 4vw, 3.2rem); letter-spacing: -.045em; }
.section-heading p { margin: .8rem 0 0; color: var(--muted); }
.feature-grid { display: grid; grid-template-columns: minmax(16rem, .78fr) minmax(0, 1.62fr); gap: 1.3rem clamp(1.75rem, 4.8vw, 5rem); align-items: center; }
.feature-copy { min-width: 0; }
.setup-steps { display: grid; gap: 1.15rem; margin: 0 0 1.45rem; padding-left: 1.55rem; }
.setup-steps li { padding-left: .35rem; color: var(--muted); }
.setup-steps li strong { color: var(--ink); }
.setup-steps li::marker { color: var(--accent); font-weight: 700; }
.release-note { padding: .75rem 0 .75rem 1rem; border-left: 2px solid #89626b; }
.screen-frame { min-width: 0; }
.screen-frame > a { display: block; border: 1px solid var(--line); border-radius: .65rem; overflow: hidden; background: #1a1419; }
.screen-frame img { display: block; width: 100%; }
.screen-frame .caption { margin-top: .52rem; }
.wide-screen { max-width: 59rem; }
.inline-links { color: var(--muted); }
.screen-frame + .inline-links { margin-top: 1.25rem; }
.platform-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: clamp(1.4rem, 4vw, 3rem); }
.platform-panel { min-width: 0; }
.platform-panel h3, .service-panel h3 { font-size: clamp(1.25rem, 2.3vw, 1.55rem); margin-bottom: .5rem; }
.platform-panel p { color: var(--muted); }
.phone-gallery { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; padding: .75rem 0 1rem; max-width: 26rem; }
.phone-gallery img { display: block; width: 100%; aspect-ratio: 390 / 844; border: 1px solid var(--line); border-radius: .65rem; }
.platform-grid + .caption { margin-top: 1.4rem; }
.table-scroll { width: 100%; overflow: auto; margin-bottom: 1rem; border: 1px solid var(--line); border-radius: .55rem; }
.table-scroll table { width: 100%; border-collapse: collapse; text-align: left; }
.table-scroll th, .table-scroll td { padding: .7rem 1rem; vertical-align: top; }
.table-scroll th { background: #271e24; }
.table-scroll tr + tr { border-top: 1px solid var(--line); }
.table-scroll code { white-space: nowrap; }
.downloads td:first-child { min-width: 8.5rem; }
.downloads a { display: inline-block; padding: .18rem 0; }
.service-grid { display: grid; grid-template-columns: 1.15fr 1fr 1fr; gap: clamp(1.25rem, 4vw, 3rem); }
.service-panel { border-top: 2px solid var(--line); padding-top: 1rem; }
.service-panel:first-child { border-top-color: #b44a60; }
.service-panel p { color: var(--muted); }
.community-intro { display: grid; grid-template-columns: 1fr 1fr; align-items: center; gap: 1rem 3rem; margin-bottom: 1.4rem; }
.community-intro .section-heading { margin: 0; }
.community-intro .inline-links { margin-top: .85rem; }
.community-art { display: block; width: 100%; aspect-ratio: 3 / 2; border-radius: .65rem; border: 1px solid var(--line); }
.group-list {
  list-style: none;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: .75rem;
  padding: 0;
  margin: 0 0 1rem;
}
.group-list li { padding: .6rem .85rem; border: 1px solid var(--line); border-radius: .38rem; color: var(--muted); }
.group-list code { display: block; margin-top: .1rem; font-size: 1.05rem; color: var(--ink); }
.qr-gallery { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .75rem; text-align: center; }
.qr-gallery img { aspect-ratio: 1284 / 2280; border-radius: .45rem; background: white; }
.qr-gallery p { color: var(--muted); margin-top: .4rem; }
details { background: var(--panel); border: 1px solid var(--line); border-radius: .55rem; padding: .85rem 1rem; }
summary { cursor: pointer; font-weight: 700; }
details[open] > summary { margin-bottom: .7rem; }
pre { background: var(--background); border: 1px solid var(--line); border-radius: .35rem; padding: .8rem 1rem; overflow: auto; }
.legal-section { padding-bottom: 2rem; }
.legal-section h2 { margin-bottom: .8rem; font-size: clamp(1.6rem, 3vw, 2.2rem); }
.legal-section p { color: var(--muted); }
.about { border-top: 1px solid var(--line); padding: 1.25rem 0 .5rem; color: var(--muted); font-size: .875rem; }
.about h3 { font-size: 1rem; margin-bottom: .3rem; }
.about p { margin: 0; }
@media (max-width: 54rem) {
  .appbar { align-items: flex-start; flex-direction: column; gap: .6rem; }
  .repo-tabs { gap: .25rem 1rem; }
  .feature-grid { grid-template-columns: 1fr; }
  .feature-copy { max-width: 40rem; }
  .landing-hero { display: block; min-height: 0; aspect-ratio: auto; padding: 0; }
  .hero-cover { position: static; width: 100%; height: auto; aspect-ratio: 7 / 5; object-position: right center; }
  .landing-hero::after { display: none; }
  .hero-copy { max-width: none; padding: 1.35rem 1.15rem 1.5rem; }
}
@media (max-width: 44rem) {
  .hero-copy h1 { font-family: inherit; font-size: clamp(2.1rem, 9vw, 3.8rem); margin-bottom: .55rem; letter-spacing: -.045em; }
  .hero-lead { margin-bottom: .65rem; }
  .hero-actions { margin-top: 1.2rem; }
  .platform-grid, .service-grid, .community-intro { grid-template-columns: minmax(0, 1fr); }
  .group-list, .qr-gallery { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .table-scroll th, .table-scroll td { padding: .65rem .55rem; }
  .community-art { max-width: 31rem; }
}
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
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
        for name in (*MOBILE_ASSETS, *IOS_DEVELOPMENT_ASSETS)
    )

    parser = AnchorLinks()
    parser.feed(body)
    actual = [url for url in parser.hrefs if url.startswith(f"{REPOSITORY}/releases/download/")]
    if Counter(actual) != Counter(expected):
        missing = sorted((Counter(expected) - Counter(actual)).elements())
        unexpected = sorted((Counter(actual) - Counter(expected)).elements())
        raise ValueError(
            "README release asset links do not match VERSION and artifactName"
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
    avatar = f"{prefix}assets/coldcoffee-avatar.webp"
    workbench_link = (
        '<a class="open-workbench" href="/workbench/">打开软件交互预览</a>'
        if local_preview else '<a href="#上手使用">从源码启动</a>'
    )
    return f'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="冷咖啡工作台支持 OpenCode 与兼容中转接入、路由可视化、Android 与 iPhone 流式对话。">
<meta name="theme-color" content="#120f12">
<link rel="icon" type="image/webp" href="{avatar}">
<title>冷咖啡工作台 · OpenCode 与中转接入</title>
<style>{CSS}</style>
</head>
<body>
<a class="skip-link" href="#内容">跳到正文</a>
<header class="appbar">
  <a class="repo-name" href="#内容"><img src="{avatar}" width="38" height="38" alt="">冷咖啡工作台</a>
  <nav class="repo-tabs" aria-label="项目导航">
    <a href="#opencode">OpenCode</a><a href="#手机端">手机端</a><a href="#下载">下载</a><a href="#冷咖啡服务">服务</a><a href="#冷咖啡社群">社群</a>{workbench_link}
  </nav>
</header>
<main class="container" id="内容">
<article><div class="markdown-body">{body}</div></article><aside class="about"><h3>当前预览</h3><p>{escape(version)}<br>Windows / macOS / Linux / Android / iOS</p></aside>
</main>
</body>
</html>
'''


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
