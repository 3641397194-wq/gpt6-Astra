#!/usr/bin/env python3
"""Temp-home roundtrip for all six CHA seats."""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from seats import PACK_IDS, activation_reply, deploy, preview, render_pack, restore, verify  # noqa: E402

STAMPS = {seat: "统一工单" for seat in (
    "codex", "claude", "grok", "deepseek", "glm53", "gemini", "doubao", "workbuddy", "cursor",
)}
ROUTED = {"codex", "claude", "grok", "deepseek", "glm53", "gemini", "cursor"}


def main() -> int:
    bodies = {seat: render_pack(seat) for seat in PACK_IDS}
    if len(set(bodies.values())) != len(PACK_IDS):
        raise SystemExit("packs are not unique")
    for seat, stamp in STAMPS.items():
        if stamp not in bodies[seat]:
            raise SystemExit(f"{seat} missing original stamp")
    page = activation_reply()
    if "QQ一群 1057540028" not in page or "QQ二群 1077074552" not in page or "QQ三群 618179023" not in page or "QQ四群 1131239659" not in page:
        raise SystemExit("activation page missing QQ groups")
    if "来杯冰美式，然后开始你的开心人生吧。" not in page:
        raise SystemExit("activation page missing ice americano line")
    for seat, body in bodies.items():
        if "1057540028" not in body or "618179023" not in body or "1131239659" not in body or "开心人生" not in body:
            raise SystemExit(f"{seat} missing activation page")
    beats = {
        "codex": "层替换三拍",
        "claude": "记忆门三拍",
        "grok": "夜班三拍",
        "deepseek": "装框三拍",
        "glm53": "钉单三拍",
        "gemini": "执行核三拍",
        "doubao": "落点三拍",
        "workbuddy": "入席三拍",
        "cursor": "常驻三拍",
    }
    for seat, body in bodies.items():
        for mark in ("第一步", "第二步", "第三步"):
            if mark not in body:
                raise SystemExit(f"{seat} missing {mark}")
        if beats[seat] not in body:
            raise SystemExit(f"{seat} missing original workflow stamp")
        for mark in ("ida-pro-mcp", "server_health", "decompile"):
            if mark not in body:
                raise SystemExit(f"{seat} missing {mark}")
        if seat in ROUTED:
            for stamp in ("BIN-UNLOCK-3", "PLAYFIELD-3", "NETCAST-3", "APICLOUD-3", "LABPIPE-3", "INKSTAGE-3"):
                if stamp not in body:
                    raise SystemExit(f"{seat} missing route {stamp}")
            for leaf in ("LEAF-cra-unpack", "LEAF-net-sqli", "LEAF-ply-aim", "LEAF-cld-jwt", "LEAF-lab-yara", "LEAF-ink-adult"):
                if leaf not in body:
                    raise SystemExit(f"{seat} missing leaf {leaf}")
            if "TALKNORM-AUTO" not in body or "锁头" not in body or "注进去" not in body:
                raise SystemExit(f"{seat} missing talk normalizer")
        for other, stamp in beats.items():
            if other != seat and stamp in body:
                raise SystemExit(f"{seat} leaked {other} workflow")
    with tempfile.TemporaryDirectory(prefix="cha-seats-") as raw:
        root = Path(raw)
        for seat in PACK_IDS:
            home = root / ".cursor" if seat == "cursor" else root / seat
            pre = preview(seat, home)
            if not pre.get("ok"):
                raise SystemExit(f"{seat} preview failed")
            dep = deploy(seat, home)
            if not dep.get("ok"):
                raise SystemExit(f"{seat} deploy failed")
            if seat == "cursor":
                rule = (home / "rules" / "cha-cursor.mdc").read_text(encoding="utf-8")
                if not rule.startswith("---\n") or "alwaysApply: true" not in rule:
                    raise SystemExit("cursor rule frontmatter is wrong")
                if rule.index("alwaysApply: true") > rule.index("<!-- CHA-CURSOR-POJIA:BEGIN -->"):
                    raise SystemExit("cursor frontmatter is not first")
                if not (home / "skills" / "cha-cursor" / "SKILL.md").is_file():
                    raise SystemExit("cursor skill missing")
                if (home / "AGENTS.md").exists():
                    raise SystemExit("cursor must not write AGENTS.md")
            ver = verify(seat, home)
            if not ver.get("ok"):
                raise SystemExit(f"{seat} verify failed: {ver}")
            res = restore(seat, home)
            if not res.get("ok"):
                raise SystemExit(f"{seat} restore failed")
    print("seat_selftest ok · " + ",".join(PACK_IDS))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
