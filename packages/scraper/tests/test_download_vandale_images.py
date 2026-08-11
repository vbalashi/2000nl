import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess
import sys
from threading import Thread


SCRAPER_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = SCRAPER_ROOT / "download_vandale_images.py"


def _write_card(path: Path, entries: list[dict]) -> None:
    path.write_text(json.dumps(entries), encoding="utf-8")


def test_dry_run_discovers_and_deduplicates_saved_image_urls(tmp_path: Path) -> None:
    input_dir = tmp_path / "words_content"
    input_dir.mkdir()
    _write_card(
        input_dir / "aalbes.json",
        [
            {
                "headword": "aalbes",
                "images": [
                    "https://assets.vandale.nl/images/pnt2/aalbes1.png",
                    "https://assets.vandale.nl/images/pnt2/aalbes1.png",
                ],
            }
        ],
    )
    _write_card(
        input_dir / "slang.json",
        [
            {
                "headword": "slang",
                "images": [
                    "https://assets.vandale.nl/images/pnt2/slang1.png"
                ],
            }
        ],
    )
    (input_dir / "_manifest.summary.json").write_text(
        json.dumps({"artifact_count": 2}), encoding="utf-8"
    )
    output_dir = tmp_path / "images"

    result = subprocess.run(
        [
            sys.executable,
            str(SCRIPT),
            "--input-dir",
            str(input_dir),
            "--output-dir",
            str(output_dir),
            "--dry-run",
        ],
        check=False,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, result.stderr
    assert "2 unique image URLs" in result.stdout
    assert "aalbes1.png" in result.stdout
    assert "slang1.png" in result.stdout
    assert not output_dir.exists()


def test_download_writes_manifest_and_resumes_existing_files(tmp_path: Path) -> None:
    png_bytes = b"\x89PNG\r\n\x1a\n" + b"test-image-body"

    class ImageHandler(BaseHTTPRequestHandler):
        request_count = 0

        def do_GET(self) -> None:  # noqa: N802 - stdlib handler API
            type(self).request_count += 1
            self.send_response(200)
            self.send_header("Content-Type", "image/png")
            self.send_header("Content-Length", str(len(png_bytes)))
            self.end_headers()
            self.wfile.write(png_bytes)

        def log_message(self, format: str, *args: object) -> None:
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), ImageHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        port = server.server_address[1]
        input_dir = tmp_path / "words_content"
        input_dir.mkdir()
        image_url = f"http://127.0.0.1:{port}/images/pnt2/aalbes1.png"
        _write_card(
            input_dir / "aalbes.json",
            [{"headword": "aalbes", "images": [image_url]}],
        )
        output_dir = tmp_path / "images"
        command = [
            sys.executable,
            str(SCRIPT),
            "--input-dir",
            str(input_dir),
            "--output-dir",
            str(output_dir),
            "--allow-host",
            "127.0.0.1",
            "--workers",
            "2",
        ]

        first = subprocess.run(command, check=False, capture_output=True, text=True)

        assert first.returncode == 0, first.stderr
        assert (output_dir / "aalbes1.png").read_bytes() == png_bytes
        manifest = json.loads((output_dir / "manifest.json").read_text())
        assert manifest["schema_version"] == 1
        assert manifest["images"] == [
            {
                "bytes": len(png_bytes),
                "content_type": "image/png",
                "filename": "aalbes1.png",
                "headwords": ["aalbes"],
                "sha256": "ac2fcdd1296951ef6b1b2967b70472ffc0a9a7291e897c89e8c77821dfdadb62",
                "source_files": ["aalbes.json"],
                "status": "downloaded",
                "url": image_url,
            }
        ]
        assert ImageHandler.request_count == 1

        second = subprocess.run(command, check=False, capture_output=True, text=True)

        assert second.returncode == 0, second.stderr
        resumed_manifest = json.loads((output_dir / "manifest.json").read_text())
        assert resumed_manifest["images"][0]["status"] == "existing"
        assert ImageHandler.request_count == 1
        assert not list(output_dir.glob("*.part"))
    finally:
        server.shutdown()
        thread.join(timeout=5)
        server.server_close()


def test_failed_download_is_recorded_in_manifest(tmp_path: Path) -> None:
    class MissingImageHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802 - stdlib handler API
            self.send_error(404)

        def log_message(self, format: str, *args: object) -> None:
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), MissingImageHandler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        port = server.server_address[1]
        input_dir = tmp_path / "words_content"
        input_dir.mkdir()
        image_url = f"http://127.0.0.1:{port}/images/pnt2/missing.png"
        _write_card(
            input_dir / "missing.json",
            [{"headword": "missing", "images": [image_url]}],
        )
        output_dir = tmp_path / "images"

        result = subprocess.run(
            [
                sys.executable,
                str(SCRIPT),
                "--input-dir",
                str(input_dir),
                "--output-dir",
                str(output_dir),
                "--allow-host",
                "127.0.0.1",
            ],
            check=False,
            capture_output=True,
            text=True,
        )

        assert result.returncode == 1
        manifest = json.loads((output_dir / "manifest.json").read_text())
        assert manifest["images"][0]["filename"] == "missing.png"
        assert manifest["images"][0]["status"] == "failed"
        assert "404" in manifest["images"][0]["error"]
    finally:
        server.shutdown()
        thread.join(timeout=5)
        server.server_close()
