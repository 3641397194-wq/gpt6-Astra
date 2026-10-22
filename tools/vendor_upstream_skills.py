#!/usr/bin/env python3
"""Reproduce the pinned, byte-preserving upstream skill/source bundles.

Only Git's object database and the integrity-pinned official npm archive are
read. No upstream setup, install, build, hook, or package lifecycle is run.

    python tools/vendor_upstream_skills.py
    python tools/vendor_upstream_skills.py --verify-only

Existing audit clones may be reused with --rea-repo and --reverse-repo; the
working tree is ignored. npm's tarball may be reused with --npm-tgz. Otherwise
public Git objects/downloads are cached under the system temporary directory.
"""

from __future__ import annotations

import argparse
import base64
import configparser
import gzip
import hashlib
import hmac
import io
import json
import os
import re
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any, Iterator


ROOT = Path(__file__).resolve().parents[1]
RESOURCE_DIR = ROOT / "desktop" / "resources" / "upstream-skills"
SCHEMA_VERSION = 1
REGULAR_MODES = frozenset(("100644", "100755"))
NPM_VERSION = "6.7.0"
NPM_TARBALL = "https://registry.npmjs.org/rea-agents/-/rea-agents-6.7.0.tgz"
NPM_INTEGRITY = (
    "sha512-yhIx2ioJYYT1C/tONfYeitC6LhnKmCh+ZwRUOgYuhSc733lGhkkt73zhug9WmLg"
    "xoMdKuqIYGCoBfD4fXkOhFw=="
)
NPM_NODE_RANGE = "^22.19.0 || ^24.11.0 || >=26.0.0"
MAX_SUBMODULE_BYTES = 150 * 1024 * 1024
SOURCE_PINS = (
    {
        "id": "rea",
        "name": "REA · Reverse Engineer Anything",
        "repository": "https://github.com/morluto/rea",
        "commit": "833136507dd79d959340b09862a53af344e4f1b3",
        "version": "6.7.0",
        "license": "MIT",
        "author": "morluto",
    },
    {
        "id": "reverse-skill",
        "name": "Reverse Skill",
        "repository": "https://github.com/zhaoxuya520/reverse-skill",
        "commit": "cab634bd855fc287f6e420c1f36fd1a6b9245960",
        "version": "1.0.1",
        "license": "MIT",
        "author": "zhaoxuya520",
    },
)


class VendorError(RuntimeError):
    """A source, integrity, inventory, or reproducibility check failed."""


@dataclass(frozen=True)
class TreeEntry:
    path: str
    mode: str
    kind: str
    oid: str
    size: int


def canonical_json(value: Any) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")


def sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def safe_path(value: str) -> str:
    path = PurePosixPath(value)
    if (
        not value
        or value != path.as_posix()
        or path.is_absolute()
        or any(part in ("", ".", "..") for part in path.parts)
        or "\\" in value
        or "\x00" in value
        or re.match(r"^[A-Za-z]:", value)
    ):
        raise VendorError(f"Non-relative or non-canonical archive path: {value!r}")
    return value


def git(repo: Path, *args: str) -> bytes:
    # Disable local/global hooks for the read-only object commands as well as
    # fetch; configuration is never imported from an upstream working tree.
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0", GIT_OPTIONAL_LOCKS="0")
    result = subprocess.run(
        ["git", "-c", "core.hooksPath=", "-C", str(repo), *args],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
        check=False,
    )
    if result.returncode:
        raise VendorError(
            f"Git failed ({result.returncode}) in {repo}: {' '.join(args)}\n"
            + result.stderr.decode("utf-8", errors="replace").strip()
        )
    return result.stdout


def ensure_repo(
    repository: str, commit: str, cache: Path, override: Path | None = None
) -> Path:
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise VendorError(f"Expected a fixed 40-hex commit, got {commit!r}")
    if override is not None:
        repo = override.resolve()
        actual = git(repo, "rev-parse", "--verify", f"{commit}^{{commit}}")
        if actual.decode("ascii").strip() != commit:
            raise VendorError(f"Audit clone does not contain pinned commit {commit}")
        return repo
    if not repository.startswith("https://github.com/"):
        raise VendorError(f"Expected a public GitHub HTTPS source: {repository}")
    repo = cache
    if not (repo / "HEAD").is_file():
        repo.mkdir(parents=True, exist_ok=True)
        git(repo, "init", "--bare", "--quiet")
    try:
        git(repo, "cat-file", "-e", f"{commit}^{{commit}}")
    except VendorError:
        print(f"Fetching fixed Git source: {repository}@{commit}", flush=True)
        git(
            repo,
            "fetch",
            "--quiet",
            "--depth=1",
            "--no-tags",
            "--recurse-submodules=no",
            repository,
            commit,
        )
    actual = git(repo, "rev-parse", "--verify", f"{commit}^{{commit}}")
    if actual.decode("ascii").strip() != commit:
        raise VendorError(f"Fetched source does not resolve to {commit}")
    return repo


def tree_entries(repo: Path, commit: str) -> list[TreeEntry]:
    rows = git(repo, "ls-tree", "--full-tree", "-r", "-z", "--long", commit)
    entries = []
    for row in rows.split(b"\0"):
        if not row:
            continue
        info, path_bytes = row.split(b"\t", 1)
        mode, kind, oid, size = info.split()
        path = safe_path(path_bytes.decode("utf-8"))
        entries.append(
            TreeEntry(
                path, mode.decode("ascii"), kind.decode("ascii"),
                oid.decode("ascii"), 0 if size == b"-" else int(size),
            )
        )
    entries.sort(key=lambda entry: entry.path)
    return entries


def blob_stream(repo: Path, entries: list[TreeEntry]) -> Iterator[tuple[TreeEntry, bytes]]:
    """Read raw Git bytes, bypassing checkout filters, EOL rules, and symlinks."""
    blobs = [entry for entry in entries if entry.kind == "blob"]
    # A real stdin file avoids the pipe deadlock possible when thousands of
    # object IDs are written before a large cat-file stdout has been consumed.
    with tempfile.TemporaryFile() as requests, tempfile.TemporaryFile() as errors:
        for entry in blobs:
            requests.write(entry.oid.encode("ascii") + b"\n")
        requests.seek(0)
        process = subprocess.Popen(
            ["git", "-c", "core.hooksPath=", "-C", str(repo), "cat-file", "--batch"],
            stdin=requests,
            stdout=subprocess.PIPE,
            stderr=errors,
            env=dict(os.environ, GIT_TERMINAL_PROMPT="0", GIT_OPTIONAL_LOCKS="0"),
        )
        try:
            assert process.stdout is not None
            for entry in blobs:
                header = process.stdout.readline().rstrip(b"\n").split()
                if len(header) != 3 or header[0].decode("ascii") != entry.oid:
                    raise VendorError(f"Unexpected Git blob header for {entry.path}: {header!r}")
                if header[1] != b"blob" or int(header[2]) != entry.size:
                    raise VendorError(f"Git blob identity/size mismatch for {entry.path}")
                raw = process.stdout.read(entry.size)
                if len(raw) != entry.size or process.stdout.read(1) != b"\n":
                    raise VendorError(f"Truncated Git object for {entry.path}")
                object_hash = hashlib.sha1(
                    b"blob " + str(len(raw)).encode("ascii") + b"\0" + raw
                ).hexdigest()
                if object_hash != entry.oid:
                    raise VendorError(f"Git object digest mismatch for {entry.path}")
                yield entry, raw
            if process.stdout.read(1):
                raise VendorError("Unexpected trailing Git cat-file output")
            if process.wait() != 0:
                errors.seek(0)
                raise VendorError(errors.read().decode("utf-8", errors="replace"))
        finally:
            if process.poll() is None:
                process.kill()
            process.wait()
            if process.stdout is not None:
                process.stdout.close()


def file_record(path: str, mode: str, raw: bytes) -> dict[str, Any]:
    if mode not in REGULAR_MODES:
        raise VendorError(f"Not an ordinary tracked file: {path} ({mode})")
    return {
        "path": safe_path(path), "mode": mode, "sha256": sha256(raw),
        "bytes": len(raw), "content": base64.b64encode(raw).decode("ascii"),
    }


def decode_record(record: dict[str, Any]) -> bytes:
    return base64.b64decode(record["content"], validate=True)


def export_tree(
    repo: Path, entries: list[TreeEntry], prefix: str = ""
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    files, links = [], []
    for entry, raw in blob_stream(repo, entries):
        path = f"{prefix}/{entry.path}" if prefix else entry.path
        if entry.mode in REGULAR_MODES:
            files.append(file_record(path, entry.mode, raw))
        elif entry.mode == "120000":
            # Preserve fixture link bytes as metadata; never materialize links
            # to absolute host paths from untrusted test fixtures.
            links.append({
                "path": safe_path(path), "mode": entry.mode,
                "sha256": sha256(raw), "bytes": len(raw),
                "targetBase64": base64.b64encode(raw).decode("ascii"),
            })
        else:
            raise VendorError(f"Unhandled Git mode {entry.mode}: {path}")
    return files, links


def gitlinks(repo: Path, commit: str, entries: list[TreeEntry]) -> list[dict[str, str]]:
    links = [entry for entry in entries if entry.mode == "160000"]
    if not links:
        return []
    parser = configparser.ConfigParser(interpolation=None)
    parser.read_string(git(repo, "show", f"{commit}:.gitmodules").decode("utf-8"))
    urls = {
        parser[section]["path"]: parser[section]["url"]
        for section in parser.sections()
        if section.startswith('submodule "')
    }
    output = []
    for entry in links:
        if entry.path not in urls:
            raise VendorError(f"Missing URL for pinned submodule {entry.path}")
        output.append({"path": entry.path, "url": urls[entry.path], "commit": entry.oid})
    return output


def yaml_scalar(text: str) -> str:
    text = text.strip()
    if text.startswith('"') and text.endswith('"'):
        try:
            return str(json.loads(text))
        except json.JSONDecodeError:
            return text[1:-1]
    if text.startswith("'") and text.endswith("'"):
        return text[1:-1].replace("''", "'")
    return text


def skill_metadata(files: list[dict[str, Any]]) -> list[dict[str, str]]:
    skills = []
    for record in files:
        if PurePosixPath(record["path"]).name != "SKILL.md":
            continue
        text = decode_record(record).decode("utf-8-sig").replace("\r\n", "\n")
        header = text.split("\n---", 1)[0] if text.startswith("---\n") else ""
        name = description = ""
        lines = header.splitlines()[1:]
        for index, line in enumerate(lines):
            match = re.match(r"^(name|description):\s*(.*)$", line)
            if not match:
                continue
            key, value = match.groups()
            if value in ("|", ">", "|-", ">-", "|+", ">+"):
                continuation = []
                for following in lines[index + 1:]:
                    if following and not following[0].isspace():
                        break
                    continuation.append(following.strip())
                value = ("\n" if value.startswith("|") else " ").join(continuation).strip()
            else:
                value = yaml_scalar(value)
            if key == "name":
                name = value
            else:
                description = value
        if not name:
            raise VendorError(f"SKILL.md has no top-level name: {record['path']}")
        if not description:
            raise VendorError(f"SKILL.md has no top-level description: {record['path']}")
        skills.append({"path": record["path"], "name": name, "description": description})
    return sorted(skills, key=lambda skill: skill["path"])


def windows_path_issues(files: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Flag upstream fixture names that require archive-only retention on Windows.

    These records never rename or omit an upstream file in the source bundle.
    Consumers can retain the complete bundle without materializing Unix-only
    test fixture names in a Windows directory.
    """
    reserved = {"con", "prn", "aux", "nul"} | {
        f"{prefix}{index}" for prefix in ("com", "lpt") for index in range(1, 10)
    }
    known: dict[str, str] = {}
    issues = []
    for record in sorted(files, key=lambda item: item["path"]):
        path = record["path"]
        reasons = set()
        for part in path.split("/"):
            if re.search(r'[<>:"|?*\x00-\x1f]', part):
                reasons.add("invalid-character")
            if part.endswith((" ", ".")):
                reasons.add("trailing-dot-or-space")
            if part.split(".")[0].casefold() in reserved:
                reasons.add("reserved-name")
        collision = known.get(path.casefold())
        if collision is not None:
            reasons.add("case-collision")
        known[path.casefold()] = path
        if reasons:
            issue: dict[str, Any] = {"path": path, "reasons": sorted(reasons)}
            if collision is not None:
                issue["collidesWith"] = collision
            issues.append(issue)
    return issues


def write_if_changed(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_file() and path.read_bytes() == content:
        return
    with tempfile.NamedTemporaryFile(
        dir=path.parent, prefix=f".{path.name}.", suffix=".tmp", delete=False
    ) as temporary:
        temporary.write(content)
        pending = Path(temporary.name)
    try:
        os.replace(pending, path)
    finally:
        pending.unlink(missing_ok=True)


def bundle(output: Path, source_id: str, files: list[dict[str, Any]]) -> dict[str, Any]:
    files.sort(key=lambda record: record["path"])
    if len(files) != len({record["path"] for record in files}):
        raise VendorError(f"Duplicate ordinary file paths in {source_id}")
    payload = canonical_json({"schemaVersion": SCHEMA_VERSION, "id": source_id, "files": files})
    stream = io.BytesIO()
    # GzipFile rather than gzip.compress also fixes the platform OS header to
    # 255 across Windows/Linux and avoids filenames and wall-clock timestamps.
    with gzip.GzipFile(filename="", mode="wb", fileobj=stream, mtime=0, compresslevel=9) as zipper:
        zipper.write(payload)
    compressed = stream.getvalue()
    filename = f"{source_id}.bundle.json.gz"
    write_if_changed(output / filename, compressed)
    return {
        "fileCount": len(files), "bytes": sum(record["bytes"] for record in files),
        "bundle": filename, "sha256": sha256(compressed),
    }


def source_bundle(
    pin: dict[str, str], repo: Path, cache: Path, output: Path,
    max_submodule_bytes: int,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    entries = tree_entries(repo, pin["commit"])
    files, symlinks = export_tree(repo, entries)
    source_files = list(files)
    submodules = gitlinks(repo, pin["commit"], entries)

    def prepare_submodule(module: dict[str, Any]) -> tuple[Path, list[TreeEntry]]:
        cache_name = PurePosixPath(module["path"]).name + ".git"
        subrepo = ensure_repo(module["url"], module["commit"], cache / cache_name)
        return subrepo, tree_entries(subrepo, module["commit"])

    with ThreadPoolExecutor(max_workers=5) as executor:
        prepared = list(executor.map(prepare_submodule, submodules))
    ordinary_bytes = sum(
        entry.size for _, subentries in prepared for entry in subentries
        if entry.mode in REGULAR_MODES
    )
    include_submodules = ordinary_bytes <= max_submodule_bytes
    for module, (subrepo, subentries) in zip(submodules, prepared):
        regular = [entry for entry in subentries if entry.mode in REGULAR_MODES]
        module.update({
            "fileCount": len(regular), "bytes": sum(entry.size for entry in regular),
            "included": include_submodules,
            "nestedSubmodules": gitlinks(subrepo, module["commit"], subentries),
        })
        subfiles, sublinks = export_tree(subrepo, subentries, prefix=module["path"])
        module["symlinks"] = sublinks
        module["skills"] = skill_metadata(subfiles)
        if include_submodules:
            files.extend(subfiles)
        else:
            module["omissionReason"] = (
                f"Combined ordinary submodule source bytes {ordinary_bytes} exceed "
                f"the configured {max_submodule_bytes}-byte limit; fixed Git identities retained."
            )
    skills = skill_metadata(source_files)
    metadata = {
        **pin, **bundle(output, pin["id"], files), "skills": skills,
        "skillCount": len(skills), "originalFileCount": len(source_files),
        "gitTreeEntryCount": len(entries), "symlinks": symlinks,
        "submodules": submodules,
        "windowsPathIssues": windows_path_issues(files),
        "licenseFiles": sorted(
            record["path"] for record in source_files
            if PurePosixPath(record["path"]).name.upper().startswith(("LICENSE", "COPYING", "NOTICE"))
            or PurePosixPath(record["path"]).name == "THIRD_PARTY_NOTICES.md"
        ),
    }
    print(
        f"Bundled {pin['id']}: {metadata['fileCount']} files, {metadata['bytes']} raw bytes, "
        f"{len(skills)} repository skills; {len(submodules)} pinned submodules",
        flush=True,
    )
    return metadata, source_files


def download(url: str, destination: Path) -> bytes:
    if destination.is_file():
        return destination.read_bytes()
    failure: Exception | None = None
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "coldcoffee-upstream-vendor/1"})
            with urllib.request.urlopen(request, timeout=60) as response:
                data = response.read(64 * 1024 * 1024 + 1)
            if len(data) > 64 * 1024 * 1024:
                raise VendorError(f"Download exceeds the 64 MiB cap: {url}")
            write_if_changed(destination, data)
            return data
        except (OSError, VendorError) as error:
            failure = error
            if attempt < 2:
                time.sleep(attempt + 1)
    raise VendorError(f"Download failed after 3 attempts: {url}: {failure}")


def runtime_bundle(
    source_files: list[dict[str, Any]], cache: Path, output: Path, npm_tgz: Path | None
) -> dict[str, Any]:
    archive = npm_tgz.read_bytes() if npm_tgz else download(NPM_TARBALL, cache / "rea-agents-6.7.0.tgz")
    integrity = "sha512-" + base64.b64encode(hashlib.sha512(archive).digest()).decode("ascii")
    if not hmac.compare_digest(integrity, NPM_INTEGRITY):
        raise VendorError(f"Official npm tarball integrity mismatch: {integrity}")
    files = []
    with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as tar:
        for member in tar.getmembers():
            if member.isdir():
                continue
            if not member.isfile() or not member.name.startswith("package/"):
                raise VendorError(f"Unexpected npm archive member: {member.name!r}")
            path = safe_path(member.name.removeprefix("package/"))
            handle = tar.extractfile(member)
            if handle is None:
                raise VendorError(f"Missing npm archive contents: {member.name}")
            raw = handle.read()
            if len(raw) != member.size:
                raise VendorError(f"Truncated npm archive member: {member.name}")
            files.append(file_record(path, "100755" if member.mode & 0o111 else "100644", raw))
    if len({record["path"] for record in files}) != len(files):
        raise VendorError("Duplicate npm archive members")
    by_path = {record["path"]: record for record in source_files}
    runtime_paths = {record["path"]: record for record in files}
    published = json.loads(decode_record(runtime_paths["package.json"]))
    source = json.loads(decode_record(by_path["package.json"]))
    lock_record = by_path["package-lock.json"]
    lock = json.loads(decode_record(lock_record))
    lock_root = lock.get("packages", {}).get("")
    if lock_root is None:
        raise VendorError("Expected npm lockfile v3 root package entry")
    for field in ("name", "version", "dependencies", "optionalDependencies", "devDependencies"):
        if published.get(field) != source.get(field):
            raise VendorError(f"Published npm package and source differ in {field}")
        if source.get(field) != lock_root.get(field):
            raise VendorError(f"Source package and added npm lockfile differ in {field}")
    if published["name"] != "rea-agents" or published["version"] != NPM_VERSION:
        raise VendorError("Unexpected published npm package identity")
    if published.get("engines", {}).get("node") != NPM_NODE_RANGE:
        raise VendorError("Unexpected published Node version range")
    if "package-lock.json" in runtime_paths:
        raise VendorError("Official npm archive unexpectedly already contains a lockfile")
    files.append(lock_record)
    metadata = {
        "id": "rea-runtime", "package": published["name"],
        "version": NPM_VERSION, "repository": SOURCE_PINS[0]["repository"],
        "tarball": NPM_TARBALL, "integrity": NPM_INTEGRITY,
        "tarballSha256": sha256(archive), "publishedFileCount": len(files) - 1,
        "entry": "scripts/rea.mjs", "nodeRange": NPM_NODE_RANGE, "license": "MIT",
        "sourceLock": {
            "repository": SOURCE_PINS[0]["repository"], "commit": SOURCE_PINS[0]["commit"],
            "path": "package-lock.json", "sha256": lock_record["sha256"],
            "directDependencyFieldsVerified": ["dependencies", "optionalDependencies", "devDependencies"],
        },
        "installArgs": ["ci", "--omit=dev", "--omit=optional", "--ignore-scripts", "--no-audit", "--no-fund"],
        **bundle(output, "rea-runtime", files),
    }
    print(
        f"Bundled rea-runtime: {metadata['fileCount']} files, {metadata['bytes']} raw bytes; "
        "official npm SHA-512 and added source lock verified", flush=True,
    )
    return metadata


def verify_output(output: Path) -> dict[str, Any]:
    catalog = json.loads((output / "catalog.json").read_bytes())
    if catalog.get("schemaVersion") != SCHEMA_VERSION:
        raise VendorError("Unexpected catalog schema version")
    identities = catalog["sources"] + [catalog["runtime"]]
    summaries = []
    for metadata in identities:
        packed = (output / safe_path(metadata["bundle"])).read_bytes()
        if sha256(packed) != metadata["sha256"]:
            raise VendorError(f"Compressed bundle digest mismatch: {metadata['id']}")
        if (
            packed[:4] != b"\x1f\x8b\x08\x00"
            or packed[4:8] != b"\0\0\0\0"
            or packed[9] != 255
        ):
            raise VendorError(f"Gzip must omit filenames and have mtime=0: {metadata['id']}")
        payload = json.loads(gzip.decompress(packed))
        if payload.get("schemaVersion") != SCHEMA_VERSION or payload.get("id") != metadata["id"]:
            raise VendorError(f"Bundle schema/id mismatch: {metadata['id']}")
        files = payload["files"]
        paths = [record["path"] for record in files]
        if paths != sorted(set(paths)):
            raise VendorError(f"Non-sorted or duplicate file inventory: {metadata['id']}")
        byte_count = 0
        for record in files:
            safe_path(record["path"])
            if record["mode"] not in REGULAR_MODES:
                raise VendorError(f"Invalid file mode: {record['path']}")
            raw = decode_record(record)
            if len(raw) != record["bytes"] or sha256(raw) != record["sha256"]:
                raise VendorError(f"File byte length/hash mismatch: {record['path']}")
            byte_count += len(raw)
        if len(files) != metadata["fileCount"] or byte_count != metadata["bytes"]:
            raise VendorError(f"Catalog file/byte count mismatch: {metadata['id']}")
        if "skills" in metadata:
            if windows_path_issues(files) != metadata["windowsPathIssues"]:
                raise VendorError(f"Windows path metadata mismatch: {metadata['id']}")
            module_prefixes = [module["path"] + "/" for module in metadata["submodules"]]
            originals = [
                record for record in files
                if not any(record["path"].startswith(prefix) for prefix in module_prefixes)
            ]
            if len(originals) != metadata["originalFileCount"]:
                raise VendorError(f"Original repository inventory mismatch: {metadata['id']}")
            if skill_metadata(originals) != metadata["skills"]:
                raise VendorError(f"Catalog skill metadata mismatch: {metadata['id']}")
            if len(metadata["skills"]) != metadata["skillCount"]:
                raise VendorError(f"Catalog skill count mismatch: {metadata['id']}")
            all_links = list(metadata["symlinks"])
            for module in metadata["submodules"]:
                module_files = [record for record in files if record["path"].startswith(module["path"] + "/")]
                if module["included"] and (
                    len(module_files) != module["fileCount"]
                    or sum(record["bytes"] for record in module_files) != module["bytes"]
                ):
                    raise VendorError(f"Submodule inventory mismatch: {module['path']}")
                if module["included"] and skill_metadata(module_files) != module["skills"]:
                    raise VendorError(f"Submodule skill inventory mismatch: {module['path']}")
                all_links.extend(module["symlinks"])
            for link in all_links:
                safe_path(link["path"])
                raw_target = base64.b64decode(link["targetBase64"], validate=True)
                if (
                    link["mode"] != "120000" or link["path"] in paths
                    or len(raw_target) != link["bytes"] or sha256(raw_target) != link["sha256"]
                ):
                    raise VendorError(f"Preserved symlink metadata mismatch: {link['path']}")
        summaries.append({
            "id": metadata["id"], "files": len(files), "bytes": byte_count,
            "skills": metadata.get("skillCount"), "sha256": metadata["sha256"],
        })
    return {"ok": True, "schemaVersion": SCHEMA_VERSION, "bundles": summaries}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=RESOURCE_DIR)
    parser.add_argument("--cache-dir", type=Path, default=Path(tempfile.gettempdir()) / "coldcoffee-upstream-vendor-cache")
    parser.add_argument("--rea-repo", type=Path)
    parser.add_argument("--reverse-repo", type=Path)
    parser.add_argument("--npm-tgz", type=Path)
    parser.add_argument("--max-submodule-bytes", type=int, default=MAX_SUBMODULE_BYTES)
    parser.add_argument("--verify-only", action="store_true", help="Verify all bundled bytes locally without using Git/network")
    args = parser.parse_args(argv)
    try:
        output = args.output_dir.resolve()
        if not args.verify_only:
            if args.max_submodule_bytes < 0:
                raise VendorError("--max-submodule-bytes must be nonnegative")
            cache = args.cache_dir.resolve()
            cache.mkdir(parents=True, exist_ok=True)
            overrides = {"rea": args.rea_repo, "reverse-skill": args.reverse_repo}
            sources = []
            rea_files = []
            for pin in SOURCE_PINS:
                repo = ensure_repo(pin["repository"] + ".git", pin["commit"], cache / (pin["id"] + ".git"), overrides[pin["id"]])
                metadata, original_files = source_bundle(pin, repo, cache, output, args.max_submodule_bytes)
                sources.append(metadata)
                if pin["id"] == "rea":
                    rea_files = original_files
            runtime = runtime_bundle(rea_files, cache, output, args.npm_tgz)
            catalog = {"schemaVersion": SCHEMA_VERSION, "sources": sources, "runtime": runtime}
            write_if_changed(output / "catalog.json", json.dumps(catalog, ensure_ascii=False, sort_keys=True, indent=2).encode("utf-8") + b"\n")
        print(json.dumps(verify_output(output), ensure_ascii=False, indent=2))
    except (OSError, ValueError, KeyError, VendorError, tarfile.TarError) as error:
        print(f"Upstream bundle error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
