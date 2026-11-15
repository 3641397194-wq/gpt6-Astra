#!/usr/bin/env python3
"""Audit iOS source and build inputs for credentials and local-only data."""
from __future__ import annotations

import hashlib
import json
import pathlib
import re
import sys


RULES = [
    ("private-key", re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
    ("github-token", re.compile(rb"\b(?:gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{25,})")),
    ("provider-key", re.compile(rb"\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}")),
    ("personal-path", re.compile(rb"[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][^\s\"<>]+", re.I)),
    ("private-ip", re.compile(rb"\b(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b")),
    ("credential-url", re.compile(rb"https?://[^/\s:@]+:[^/\s@]+@")),
]
EXCLUDED_SUFFIXES = {".png", ".jpg", ".jpeg", ".heic", ".gif", ".ico", ".car", ".app"}
EXCLUDED_DIRS = {".build", "build", "DerivedData", "dist", "xcuserdata", ".git", "Pods", "Carthage"}


def main() -> int:
    root = pathlib.Path(__file__).resolve().parents[1]
    source = root / "mobile-ios"
    findings: list[dict[str, str]] = []
    checked: list[dict[str, str]] = []
    if not source.is_dir():
        findings.append({"file": "mobile-ios", "rule": "source-missing"})
    else:
        for path in sorted(source.rglob("*")):
            if not path.is_file() or any(part in EXCLUDED_DIRS for part in path.relative_to(source).parts):
                continue
            relative = path.relative_to(root).as_posix()
            if path.suffix.lower() in {".p12", ".pfx", ".pem", ".key", ".mobileprovision", ".provisionprofile"}:
                findings.append({"file": relative, "rule": "private-file"})
                continue
            data = path.read_bytes()
            checked.append(
                {
                    "file": relative,
                    "sha256": hashlib.sha256(data).hexdigest(),
                }
            )
            if path.suffix.lower() in EXCLUDED_SUFFIXES:
                continue
            for rule, pattern in RULES:
                if pattern.search(data):
                    findings.append({"file": relative, "rule": rule})
    report = {
        "ok": not findings,
        "files": len(checked),
        "findings": findings,
        "scope": "mobile-ios source and assets; synthetic fixtures are not exempted",
    }
    output = root / "mobile-ios" / "work" / "privacy-audit.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
    return 0 if not findings else 1


if __name__ == "__main__":
    raise SystemExit(main())
