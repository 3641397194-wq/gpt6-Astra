import importlib.util
from pathlib import Path
import unittest


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
        names = verify.asset_names("3.2.0-preview.2")
        self.assertEqual(len(names), 7)
        self.assertEqual(len(set(names)), 7)
        self.assertTrue(all("3.2.0-preview.2" in name for name in names))
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


if __name__ == "__main__":
    unittest.main()
