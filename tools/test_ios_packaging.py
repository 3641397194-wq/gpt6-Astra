"""Regression checks for iOS source packaging and audit output isolation."""

from contextlib import redirect_stdout
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile

import ios_privacy_audit
import ios_source_archive


class IOSPackagingTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="coldcoffee-ios-packaging-")
        self.root = Path(self.temp.name).resolve()
        self.assertTrue(self.root.is_relative_to(Path(tempfile.gettempdir()).resolve()))
        (self.root / "VERSION").write_text("3.3.0-preview.3\n", encoding="utf-8")
        files = {
            "LICENSE": "GPL-3.0-only\n",
            "Info.plist": "<plist/>\n",
            "Sources/ColdCoffeeIOS/App.swift": "import SwiftUI\n",
            "work/privacy-audit.json": "sk-" + "A" * 30,
            "work/download/nested.txt": "private runner artifact\n",
            "DerivedData/build.log": "private build log\n",
            "build/cache.txt": "private build cache\n",
            "dist/old.zip": "old archive\n",
        }
        for name, content in files.items():
            path = self.root / "mobile-ios" / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
        subprocess.run(["git", "init", "-q"], cwd=self.root, check=True)
        subprocess.run(["git", "add", "--", "mobile-ios"], cwd=self.root, check=True)
        (self.root / "mobile-ios" / "Loose.txt").write_text("untracked local note\n", encoding="utf-8")

    def tearDown(self):
        self.temp.cleanup()

    def test_archive_contains_only_tracked_publishable_source(self):
        with redirect_stdout(io.StringIO()):
            self.assertEqual(ios_source_archive.main(self.root), 0)
        archive_path = self.root / "mobile-ios/dist/ColdCoffee-iOS-Source-3.3.0-preview.3.zip"
        with zipfile.ZipFile(archive_path) as archive:
            self.assertEqual(set(archive.namelist()), {
                "coldcoffee-ios/LICENSE",
                "coldcoffee-ios/Info.plist",
                "coldcoffee-ios/Sources/ColdCoffeeIOS/App.swift",
            })
            self.assertEqual(
                archive.read("coldcoffee-ios/LICENSE").replace(b"\r\n", b"\n"),
                b"GPL-3.0-only\n",
            )
        first = archive_path.read_bytes()
        with redirect_stdout(io.StringIO()):
            self.assertEqual(ios_source_archive.main(self.root), 0)
        self.assertEqual(archive_path.read_bytes(), first)

    def test_audit_skips_work_and_its_own_report_but_scans_source(self):
        report_path = self.root / "mobile-ios/work/privacy-audit.json"
        for _ in range(2):
            with redirect_stdout(io.StringIO()):
                self.assertEqual(ios_privacy_audit.main(self.root), 0)
            report = json.loads(report_path.read_text(encoding="utf-8"))
            self.assertTrue(report["ok"])
            self.assertEqual(report["files"], 4)
            self.assertEqual(report["findings"], [])
        source = self.root / "mobile-ios/Sources/ColdCoffeeIOS/App.swift"
        source.write_text("let token = \"sk-" + "B" * 30 + "\"\n", encoding="utf-8")
        with redirect_stdout(io.StringIO()):
            self.assertEqual(ios_privacy_audit.main(self.root), 1)
        report = json.loads(report_path.read_text(encoding="utf-8"))
        self.assertIn(
            {"file": "mobile-ios/Sources/ColdCoffeeIOS/App.swift", "rule": "provider-key"},
            report["findings"],
        )

    def test_ios_version_is_independent_of_desktop(self):
        (self.root / "mobile-ios/VERSION").write_text("3.3.0-preview.6\n", encoding="utf-8")
        subprocess.run(["git", "add", "--", "mobile-ios/VERSION"], cwd=self.root, check=True)
        with redirect_stdout(io.StringIO()):
            self.assertEqual(ios_source_archive.main(self.root), 0)
        archive = self.root / "mobile-ios/dist/ColdCoffee-iOS-Source-3.3.0-preview.6.zip"
        self.assertTrue(archive.is_file())
        with zipfile.ZipFile(archive) as source:
            self.assertIn("coldcoffee-ios/VERSION", source.namelist())

    def test_tracked_apple_p8_is_rejected_by_archive_and_audit(self):
        key = self.root / "mobile-ios/Signing/AuthKey_FIXTURE.p8"
        key.parent.mkdir(parents=True, exist_ok=True)
        key.write_text("synthetic fixture, no private key\n", encoding="utf-8")
        subprocess.run(["git", "add", "--", "mobile-ios/Signing/AuthKey_FIXTURE.p8"], cwd=self.root, check=True)
        with self.assertRaisesRegex(SystemExit, "private/generated file refused: Signing"):
            ios_source_archive.main(self.root)
        with redirect_stdout(io.StringIO()):
            self.assertEqual(ios_privacy_audit.main(self.root), 1)
        report = json.loads((self.root / "mobile-ios/work/privacy-audit.json").read_text(encoding="utf-8"))
        self.assertIn(
            {"file": "mobile-ios/Signing/AuthKey_FIXTURE.p8", "rule": "private-file"},
            report["findings"],
        )


if __name__ == "__main__":
    unittest.main()
