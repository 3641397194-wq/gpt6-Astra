"""Archive every tracked upstream byte for audit; never execute upstream code."""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile

COMMIT = "b8fb8ed08d0657cb07675f31d5110b2da4c8744b"
REPOSITORY = "https://github.com/Lniosy/souhun"
ROOT = Path(__file__).resolve().parents[1]


def git(source, *args):
    return subprocess.check_output(["git", "-C", str(source), *args])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True, help="Local souhun Git checkout")
    args = parser.parse_args()
    if git(args.source, "rev-parse", "HEAD").decode().strip() != COMMIT:
        parser.error("Source must be checked out at the pinned commit")
    output = ROOT / "desktop/resources/grok-memory"
    output.mkdir(parents=True, exist_ok=True)
    paths = git(args.source, "ls-tree", "-r", "--name-only", "-z", COMMIT).decode().split("\0")
    manifest = []
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w", format=tarfile.PAX_FORMAT) as archive:
        for name in sorted(filter(None, paths)):
            if name.startswith("/") or ".." in Path(name).parts:
                raise ValueError("Unexpected upstream path")
            content = git(args.source, "show", f"{COMMIT}:{name}")
            info = tarfile.TarInfo(name)
            info.size = len(content)
            info.mtime = 0
            info.mode = 0o644
            archive.addfile(info, io.BytesIO(content))
            manifest.append({"path": name, "bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()})
    compressed = gzip.compress(buffer.getvalue(), mtime=0)
    archive_name = "souhun-b8fb8ed-source.tar.gz"
    (output / archive_name).write_bytes(compressed)
    (output / "LICENSE.souhun.txt").write_bytes(git(args.source, "show", f"{COMMIT}:LICENSE"))
    catalog = {"repository": REPOSITORY, "commit": COMMIT, "license": "MIT",
               "archive": archive_name, "archiveSha256": hashlib.sha256(compressed).hexdigest(),
               "fileCount": len(manifest), "files": manifest}
    (output / "source-manifest.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf8", newline="\n")
    print(f"Archived {len(manifest)} original files, {len(compressed)} compressed bytes; no upstream code executed.")


if __name__ == "__main__":
    main()
