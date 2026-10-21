"""Verify published installers using anonymous HTTP requests, not GitHub credentials."""

import argparse
import concurrent.futures
import json
from pathlib import Path
import re
import time
import urllib.request


def asset_names(version):
    if not re.fullmatch(r"\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?", version):
        raise ValueError("Invalid release version")
    return [
        f"ColdCoffee-Workbench-Windows-{version}-x64.exe",
        f"ColdCoffee-Workbench-macOS-arm64-{version}.dmg",
        f"ColdCoffee-Workbench-macOS-arm64-{version}.zip",
        f"ColdCoffee-Workbench-macOS-x64-{version}.dmg",
        f"ColdCoffee-Workbench-macOS-x64-{version}.zip",
        f"ColdCoffee-Workbench-Linux-x86_64-{version}.AppImage",
        f"ColdCoffee-Workbench-Linux-amd64-{version}.deb",
    ]


def check_asset(url, opener=urllib.request.urlopen):
    request = urllib.request.Request(url, headers={
        "User-Agent": "ColdCoffee-public-download-check",
        "Range": "bytes=0-31",
        "Cache-Control": "no-cache",
    })
    # No cookies, Authorization header, credential helper, or environment token.
    with opener(request, timeout=35) as response:
        sample = response.read(32)
        if response.status not in (200, 206) or not sample:
            raise ValueError("Installer response is empty or unsuccessful")
        content_type = response.headers.get("Content-Type", "").lower()
        if "text/html" in content_type or sample.lstrip().lower().startswith((b"<!doctype", b"<html")):
            raise ValueError("Download returned an HTML page instead of an installer")
        expected = next((magic for suffix, magic in (
            (".exe", b"MZ"), (".zip", b"PK\x03\x04"),
            (".AppImage", b"\x7fELF"), (".deb", b"!<arch>\n"),
        ) if url.endswith(suffix)), None)
        if expected and not sample.startswith(expected):
            raise ValueError("Downloaded bytes do not match the installer format")
        content_range = response.headers.get("Content-Range", "")
        total = re.search(r"/(\d+)$", content_range)
        size = int(total.group(1)) if total else (
            int(response.headers["Content-Length"]) if response.status == 200 and response.headers.get("Content-Length") else None
        )
        if size is not None and size <= 32:
            raise ValueError("Installer response is unexpectedly small")
        return {"url": url, "status": response.status, "bytes_sampled": len(sample), "total_bytes": size}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", default="3641397194-wq/gpt6-Astra")
    parser.add_argument("--version", default=(Path(__file__).resolve().parents[1] / "VERSION").read_text().strip())
    parser.add_argument("--attempts", type=int, choices=range(1, 11), default=3)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", args.repo):
        parser.error("Expected OWNER/REPOSITORY")
    urls = [f"https://github.com/{args.repo}/releases/download/v{args.version}/{name}" for name in asset_names(args.version)]

    def probe(url):
        for attempt in range(args.attempts):
            try:
                return {"ok": True, **check_asset(url)}
            except Exception as error:
                failure = {"ok": False, "url": url, "error": str(error)}
                if attempt + 1 < args.attempts:
                    time.sleep(min(2 ** attempt, 8))
        return failure

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        checks = list(pool.map(probe, urls))
    report = {"version": args.version, "anonymous": True, "ok": all(item["ok"] for item in checks), "checks": checks}
    text = json.dumps(report, indent=2) + "\n"
    if args.output:
        args.output.write_text(text, encoding="utf-8")
    print(text, end="")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
