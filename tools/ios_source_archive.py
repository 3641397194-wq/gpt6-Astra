#!/usr/bin/env python3
"""Create a reproducible source archive for the ColdCoffee iOS client."""
from __future__ import annotations

import hashlib
import json
import pathlib
import sys
import zipfile


def main() -> int:
    root = pathlib.Path(__file__).resolve().parents[1]
    version = (root / "VERSION").read_text(encoding="utf-8").strip()
    source = root / "mobile-ios"
    if not source.is_dir():
        raise SystemExit("mobile-ios source directory is missing")
    output = source / "dist" / f"ColdCoffee-iOS-Source-{version}.zip"
    output.parent.mkdir(parents=True, exist_ok=True)
    excluded_dirs = {
        ".git",
        ".build",
        "build",
        "DerivedData",
        "dist",
        "xcuserdata",
        "Pods",
        "Carthage",
    }
    forbidden_suffixes = {
        ".p12",
        ".pfx",
        ".pem",
        ".key",
        ".mobileprovision",
        ".provisionprofile",
        ".cer",
        ".log",
        ".dmp",
    }
    files: list[tuple[pathlib.Path, pathlib.PurePosixPath]] = []
    for path in sorted(source.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(source)
        if any(part in excluded_dirs for part in relative.parts):
            continue
        if path.is_symlink():
            raise SystemExit(f"symlink refused: {relative}")
        if path.suffix.lower() in forbidden_suffixes:
            raise SystemExit(f"private/generated file refused: {relative}")
        if path.name.startswith(".env") or path.name in {
            "ExportOptions.plist",
            "AuthKey.p8",
            "credentials.json",
        }:
            raise SystemExit(f"private/generated file refused: {relative}")
        files.append((path, pathlib.PurePosixPath(relative.as_posix())))

    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path, relative in files:
            info = zipfile.ZipInfo(
                f"coldcoffee-ios/{relative.as_posix()}",
                (2026, 11, 15, 0, 0, 0),
            )
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, path.read_bytes())
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    print(
        json.dumps(
            {
                "archive": output.name,
                "files": len(files),
                "sha256": digest,
                "privateSigningMaterial": False,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
