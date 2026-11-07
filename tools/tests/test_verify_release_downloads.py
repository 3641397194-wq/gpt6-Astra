import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location("verify_downloads", Path(__file__).resolve().parents[1] / "verify_release_downloads.py")
verify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify)


class Response:
    status = 206
    headers = {"Content-Type": "application/octet-stream", "Content-Range": "bytes 0-31/1048576"}

    def __init__(self, body=b"MZ" + b"\0" * 30):
        self.body = body

    def read(self, length):
        return self.body[:length]

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass


class DownloadChecks(unittest.TestCase):
    def test_seven_native_installer_names(self):
        names = verify.asset_names("3.2.0-preview.3")
        self.assertEqual(len(names), 7)
        self.assertEqual(len(set(names)), 7)
        self.assertTrue(all("3.2.0-preview.3" in name for name in names))
        with self.assertRaises(ValueError):
            verify.asset_names("../not-a-version")

    def test_probe_is_anonymous_and_reads_only_a_sample(self):
        def opener(request, timeout):
            headers = {key.lower(): value for key, value in request.header_items()}
            self.assertNotIn("authorization", headers)
            self.assertNotIn("cookie", headers)
            self.assertEqual(headers["range"], "bytes=0-31")
            return Response()
        result = verify.check_asset("https://github.com/TARGET/releases/download/v1.0.0/app.exe", opener)
        self.assertEqual((result["status"], result["bytes_sampled"], result["total_bytes"]), (206, 32, 1048576))

    def test_http_error_html_and_wrong_binary_are_failures(self):
        for body, status, content_type in [(b"error", 404, "text/plain"), (b"<!doctype html>", 200, "text/html"), (b"PK\x03\x04", 206, "application/zip")]:
            response = Response(body)
            response.status = status
            response.headers = {"Content-Type": content_type}
            with self.subTest(status=status, body=body), self.assertRaises(ValueError):
                verify.check_asset("https://github.com/TARGET/releases/download/v1.0.0/app.exe", lambda *a, **kw: response)

    def test_native_magic_for_zip_appimage_and_deb(self):
        for suffix, magic in [("zip", b"PK\x03\x04"), ("AppImage", b"\x7fELF"), ("deb", b"!<arch>\n")]:
            with self.subTest(suffix=suffix):
                verify.check_asset("https://github.com/TARGET/releases/download/v1.0.0/app." + suffix, lambda *a, **kw: Response(magic + b"\0" * 32))


class LatestChecks(unittest.TestCase):
    version = "3.2.0-preview.9"

    def release(self):
        return {"tag_name": "v" + self.version, "draft": False, "prerelease": False,
                "assets": [{"name": name} for name in verify.asset_names(self.version)]}

    def response(self, data):
        response = Response(json.dumps(data).encode())
        response.status = 200
        return response

    def test_latest_probe_is_anonymous_and_requires_current_complete_release(self):
        def opener(request, timeout):
            headers = {key.lower(): value for key, value in request.header_items()}
            self.assertNotIn("authorization", headers)
            self.assertNotIn("cookie", headers)
            self.assertEqual(request.full_url, "https://api.github.com/repos/TARGET/fixture/releases/latest")
            return self.response(self.release())
        result = verify.check_latest_release("TARGET/fixture", self.version, opener)
        self.assertEqual(result["tag"], "v" + self.version)
        self.assertEqual(result["installers"], 7)

    def test_old_latest_draft_prerelease_missing_asset_and_bad_json_fail(self):
        cases = [dict(self.release(), tag_name="v3.1.0-preview.1"), dict(self.release(), draft=True),
                 dict(self.release(), prerelease=True), dict(self.release(), assets=[]), []]
        for data in cases:
            with self.subTest(data=data), self.assertRaises(ValueError):
                verify.check_latest_release("TARGET/fixture", self.version, lambda *a, **kw: self.response(data))
        response = self.response(self.release())
        response.status = 404
        with self.assertRaises(ValueError):
            verify.check_latest_release("TARGET/fixture", self.version, lambda *a, **kw: response)

    def test_cli_checks_tag_and_latest_aliases_and_fails_if_either_breaks(self):
        for failure in [None, "metadata", "alias"]:
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as directory:
                output = Path(directory) / "report.json"
                def asset(url):
                    if failure == "alias" and "/latest/download/" in url:
                        raise ValueError("HTTP 404")
                    return {"url": url, "status": 206, "bytes_sampled": 32, "total_bytes": 1048576}
                latest = {"tag": "v" + self.version, "installers": 7}
                with patch.object(verify, "check_asset", side_effect=asset) as probe, \
                     patch.object(verify, "check_latest_release", return_value=latest,
                                  side_effect=ValueError("stale latest") if failure == "metadata" else None), \
                     patch("builtins.print"):
                    status = verify.main(["--repo", "TARGET/fixture", "--version", self.version,
                                          "--check-latest", "--attempts", "1", "--output", str(output)])
                report = json.loads(output.read_text())
                self.assertEqual(len(report["checks"]), 14)
                self.assertEqual(probe.call_count, 14)
                self.assertEqual(sum("/latest/download/" in c["url"] for c in report["checks"]), 7)
                self.assertEqual(status, 0 if failure is None else 1)
                self.assertEqual(report["ok"], failure is None)


if __name__ == "__main__":
    unittest.main()
