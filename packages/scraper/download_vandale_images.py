#!/usr/bin/env python3
"""Download image assets referenced by saved Van Dale NT2 card artifacts."""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlparse
from urllib.request import Request, urlopen


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_INPUT_DIR = REPO_ROOT / "db" / "data" / "words_content"
DEFAULT_OUTPUT_DIR = REPO_ROOT / "db" / "data" / "vandale_images"
DEFAULT_ALLOWED_HOST = "assets.vandale.nl"
VANDALE_IMAGE_PREFIX = "/images/pnt2/"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
USER_AGENT = "2000nl-vandale-image-downloader/1.0"


def _filename_for_url(url: str, allowed_hosts: set[str]) -> str:
    parsed = urlparse(url)
    if parsed.hostname not in allowed_hosts or parsed.scheme not in {"http", "https"}:
        raise ValueError(
            f"unsupported image URL {url!r}; expected an allowed host: "
            f"{', '.join(sorted(allowed_hosts))}"
        )
    if parsed.hostname == DEFAULT_ALLOWED_HOST and parsed.scheme != "https":
        raise ValueError(f"Van Dale assets must use HTTPS: {url!r}")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError(f"unsupported image URL components in {url!r}")
    if parsed.hostname == DEFAULT_ALLOWED_HOST and not parsed.path.startswith(
        VANDALE_IMAGE_PREFIX
    ):
        raise ValueError(
            f"unsupported Van Dale asset path {parsed.path!r}; expected "
            f"{VANDALE_IMAGE_PREFIX}"
        )
    encoded_filename = Path(parsed.path).name
    filename = unquote(encoded_filename)
    if (
        not filename
        or filename in {".", ".."}
        or Path(filename).name != filename
        or Path(filename).suffix.lower() != ".png"
    ):
        raise ValueError(f"unsupported image filename in URL {url!r}")
    return filename


def discover_images(input_dir: Path, allowed_hosts: set[str]) -> dict[str, dict]:
    discovered: dict[str, dict] = {}
    filename_owners: dict[str, str] = {}
    for artifact_path in sorted(input_dir.glob("*.json")):
        try:
            payload = json.loads(artifact_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise ValueError(f"cannot read {artifact_path}: {error}") from error
        if not isinstance(payload, list):
            continue
        for entry in payload:
            if not isinstance(entry, dict):
                continue
            headword = entry.get("headword")
            images = entry.get("images", [])
            if not isinstance(images, list):
                raise ValueError(f"images must be a list in {artifact_path}")
            for url in images:
                if not isinstance(url, str):
                    raise ValueError(f"image URL must be a string in {artifact_path}")
                filename = _filename_for_url(url, allowed_hosts)
                owner = filename_owners.setdefault(filename, url)
                if owner != url:
                    raise ValueError(
                        f"two URLs resolve to the same filename {filename!r}: "
                        f"{owner!r} and {url!r}"
                    )
                record = discovered.setdefault(
                    url,
                    {
                        "url": url,
                        "filename": filename,
                        "source_files": set(),
                        "headwords": set(),
                    },
                )
                record["source_files"].add(artifact_path.name)
                if isinstance(headword, str) and headword:
                    record["headwords"].add(headword)
    return discovered


def _inspect_png(path: Path) -> tuple[int, str]:
    digest = hashlib.sha256()
    size = 0
    signature = b""
    with path.open("rb") as image_file:
        while chunk := image_file.read(64 * 1024):
            if not signature:
                signature = chunk[: len(PNG_SIGNATURE)]
            digest.update(chunk)
            size += len(chunk)
    if signature != PNG_SIGNATURE:
        raise ValueError(f"file is not a PNG: {path}")
    return size, digest.hexdigest()


def _download_image(
    record: dict[str, Any],
    output_dir: Path,
    *,
    overwrite: bool,
    timeout: float,
) -> dict[str, Any]:
    destination = output_dir / record["filename"]
    status = "downloaded"
    content_type = "image/png"
    if destination.exists() and not overwrite:
        size, sha256 = _inspect_png(destination)
        status = "existing"
    else:
        temporary = destination.with_name(f".{destination.name}.{os.getpid()}.part")
        try:
            request = Request(record["url"], headers={"User-Agent": USER_AGENT})
            with urlopen(request, timeout=timeout) as response, temporary.open("wb") as output:
                content_type = response.headers.get_content_type()
                if content_type != "image/png":
                    raise ValueError(
                        f"unexpected Content-Type {content_type!r} for {record['url']}"
                    )
                shutil.copyfileobj(response, output, length=64 * 1024)
            size, sha256 = _inspect_png(temporary)
            temporary.replace(destination)
        finally:
            temporary.unlink(missing_ok=True)

    return {
        "url": record["url"],
        "filename": record["filename"],
        "source_files": sorted(record["source_files"]),
        "headwords": sorted(record["headwords"]),
        "status": status,
        "content_type": content_type,
        "bytes": size,
        "sha256": sha256,
    }


def _write_manifest(output_dir: Path, input_dir: Path, images: list[dict]) -> None:
    manifest = {
        "schema_version": 1,
        "source_directory": str(input_dir.resolve()),
        "images": sorted(images, key=lambda item: item["filename"]),
    }
    destination = output_dir / "manifest.json"
    temporary = output_dir / ".manifest.json.part"
    try:
        temporary.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, default=DEFAULT_INPUT_DIR)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument(
        "--allow-host",
        action="append",
        default=[],
        help="Additional host allowed for a trusted mirror or local test (repeatable).",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=4,
        help="Concurrent downloads (default: 4).",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=30.0,
        help="Per-request timeout in seconds (default: 30).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="Process only the first N images, useful for a trial run.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Download assets again even when the destination file exists.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List discovered images without creating files or downloading.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    if args.workers < 1 or args.timeout <= 0 or (args.limit is not None and args.limit < 1):
        print("Error: --workers, --timeout, and --limit must be positive", file=sys.stderr)
        return 2
    if not args.input_dir.is_dir():
        print(f"Input directory does not exist: {args.input_dir}", file=sys.stderr)
        return 2
    allowed_hosts = {DEFAULT_ALLOWED_HOST, *args.allow_host}
    try:
        discovered = discover_images(args.input_dir, allowed_hosts)
    except ValueError as error:
        print(f"Error: {error}", file=sys.stderr)
        return 2

    print(f"Found {len(discovered)} unique image URLs in {args.input_dir}")
    selected = sorted(discovered.values(), key=lambda item: item["filename"])
    if args.limit is not None:
        selected = selected[: args.limit]
        print(f"Selected {len(selected)} image URLs because --limit is set")
    if args.dry_run:
        for record in selected:
            print(f"{record['filename']}\t{record['url']}")
        return 0

    args.output_dir.mkdir(parents=True, exist_ok=True)
    completed: list[dict] = []
    failures: list[dict] = []
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        future_records = {
            executor.submit(
                _download_image,
                record,
                args.output_dir,
                overwrite=args.overwrite,
                timeout=args.timeout,
            ): record
            for record in selected
        }
        for future in as_completed(future_records):
            record = future_records[future]
            try:
                completed.append(future.result())
            except (HTTPError, URLError, OSError, ValueError) as error:
                failures.append(
                    {
                        "url": record["url"],
                        "filename": record["filename"],
                        "source_files": sorted(record["source_files"]),
                        "headwords": sorted(record["headwords"]),
                        "status": "failed",
                        "error": str(error),
                    }
                )

    _write_manifest(args.output_dir, args.input_dir, [*completed, *failures])
    downloaded = sum(item["status"] == "downloaded" for item in completed)
    existing = sum(item["status"] == "existing" for item in completed)
    print(
        f"Complete: {downloaded} downloaded, {existing} existing, "
        f"{len(failures)} failed. Manifest: {args.output_dir / 'manifest.json'}"
    )
    for record in sorted(failures, key=lambda item: item["filename"]):
        print(f"Failed {record['url']}: {record['error']}", file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
