from __future__ import annotations

import argparse
import gzip
import hashlib
import importlib.util
import io
import json
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


def _load_dictionary_parser():
    parser_path = (
        Path(__file__).resolve().parents[1]
        / "src/importer/dictionary_entry_parser.py"
    )
    spec = importlib.util.spec_from_file_location(
        "dictionary_identity_wave0_parser",
        parser_path,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load dictionary parser from {parser_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module.parse_dictionary_file


parse_dictionary_file = _load_dictionary_parser()


GENERATOR_VERSION = "dictionary-identity-wave0-audit-v0.1"
CONTENT_FINGERPRINT_VERSION = "parser-sanitized-json-v0.1"
MANIFEST_NAME = "manifest-v0.1.jsonl.gz"
SUMMARY_NAME = "audit-v0.1.json"
COLLISIONS_NAME = "collision-groups-v0.1.json"
KNOWN_FILENAME_POS_TOKENS = {
    "afk",
    "bn",
    "bw",
    "lidw",
    "tw",
    "vnw",
    "vv",
    "vvs",
    "vw",
    "vz",
    "ww",
    "zn",
    "znw",
}


@dataclass(frozen=True)
class AuditResult:
    manifest_bytes: bytes
    summary: dict[str, Any]
    collision_groups: list[dict[str, Any]]


def _sha256(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _canonical_json_bytes(value: Any) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def _filename_pos_token(path: Path) -> str | None:
    parts = path.stem.rsplit("_", 2)
    if len(parts) != 3 or not parts[2].isdigit():
        return None
    token = parts[1].strip().lower()
    return token if token in KNOWN_FILENAME_POS_TOKENS else None


def _manifest_line(record: dict[str, Any]) -> bytes:
    return _canonical_json_bytes(record) + b"\n"


def _relative_json_paths(source_dir: Path) -> Iterable[Path]:
    return sorted(
        (path for path in source_dir.rglob("*.json") if path.is_file()),
        key=lambda path: path.relative_to(source_dir).as_posix(),
    )


def _stable_parse_error(error: Exception, source_dir: Path, path: Path) -> str:
    relative_path = path.relative_to(source_dir).as_posix()
    message = str(error).replace(str(path), relative_path)
    return message.replace(str(source_dir), ".")


def build_audit(source_dir: Path) -> AuditResult:
    source_dir = source_dir.resolve()
    if not source_dir.is_dir():
        raise ValueError(f"Dictionary source directory does not exist: {source_dir}")

    records: list[dict[str, Any]] = []
    current_groups: dict[tuple[str, int], list[dict[str, Any]]] = defaultdict(list)
    tree_hash = hashlib.sha256()
    rejected_count = 0

    for path in _relative_json_paths(source_dir):
        relative_path = path.relative_to(source_dir).as_posix()
        artifact_bytes = path.read_bytes()
        artifact_sha = _sha256(artifact_bytes)
        tree_hash.update(relative_path.encode("utf-8"))
        tree_hash.update(b"\0")
        tree_hash.update(artifact_sha.encode("ascii"))
        tree_hash.update(b"\n")

        try:
            entry = parse_dictionary_file(path)
        except (OSError, ValueError, json.JSONDecodeError) as error:
            rejected_count += 1
            records.append(
                {
                    "artifactPath": relative_path,
                    "artifactSha256": artifact_sha,
                    "error": _stable_parse_error(error, source_dir, path),
                    "errorCode": f"parse:{type(error).__name__}",
                    "status": "rejected",
                }
            )
            continue

        content_bytes = _canonical_json_bytes(entry.raw)
        record = {
            "artifactPath": relative_path,
            "artifactSha256": artifact_sha,
            "contentFingerprint": _sha256(content_bytes),
            "contentFingerprintVersion": CONTENT_FINGERPRINT_VERSION,
            "filenamePosToken": _filename_pos_token(path),
            "headword": entry.headword,
            "meaningId": entry.meaning_id,
            "metadataIndex": entry.vandale_id,
            "payloadPos": entry.part_of_speech,
            "status": "accepted",
        }
        records.append(record)
        current_groups[(entry.headword, entry.meaning_id)].append(record)

    manifest_bytes = b"".join(_manifest_line(record) for record in records)
    collision_groups = []
    for (headword, meaning_id), group_records in sorted(current_groups.items()):
        positions = sorted(
            {
                record["payloadPos"]
                if record["payloadPos"] is not None
                else "unresolved"
                for record in group_records
            }
        )
        if len(positions) <= 1:
            continue
        collision_groups.append(
            {
                "artifacts": sorted(
                    record["artifactPath"] for record in group_records
                ),
                "headword": headword,
                "meaningId": meaning_id,
                "payloadPositions": positions,
            }
        )

    accepted_count = len(records) - rejected_count
    summary = {
        "acceptedArtifactCount": accepted_count,
        "artifactCount": len(records),
        "contentFingerprintVersion": CONTENT_FINGERPRINT_VERSION,
        "currentKeyCount": len(current_groups),
        "generatorVersion": GENERATOR_VERSION,
        "manifestSha256": _sha256(manifest_bytes),
        "minimumOverwrittenVariantCount": accepted_count - len(current_groups),
        "multiPayloadPosCurrentKeyGroupCount": len(collision_groups),
        "rejectedArtifactCount": rejected_count,
        "sourceTreeSha256": tree_hash.hexdigest(),
    }
    return AuditResult(
        manifest_bytes=manifest_bytes,
        summary=summary,
        collision_groups=collision_groups,
    )


def _gzip_manifest(manifest_bytes: bytes) -> bytes:
    buffer = io.BytesIO()
    with gzip.GzipFile(
        filename="",
        mode="wb",
        fileobj=buffer,
        mtime=0,
    ) as compressed:
        compressed.write(manifest_bytes)
    return buffer.getvalue()


def render_artifacts(audit: AuditResult) -> dict[str, bytes]:
    compressed_manifest = _gzip_manifest(audit.manifest_bytes)
    summary = {
        **audit.summary,
        "manifestGzipSha256": _sha256(compressed_manifest),
    }
    return {
        "manifest": compressed_manifest,
        "summary": json.dumps(
            summary,
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        ).encode("utf-8")
        + b"\n",
        "collisions": json.dumps(
            audit.collision_groups,
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
        ).encode("utf-8")
        + b"\n",
    }


def write_artifacts(audit: AuditResult, output_dir: Path) -> dict[str, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    paths = {
        "manifest": output_dir / MANIFEST_NAME,
        "summary": output_dir / SUMMARY_NAME,
        "collisions": output_dir / COLLISIONS_NAME,
    }
    for name, payload in render_artifacts(audit).items():
        paths[name].write_bytes(payload)
    return paths


def check_artifacts(audit: AuditResult, output_dir: Path) -> list[str]:
    paths = {
        "manifest": output_dir / MANIFEST_NAME,
        "summary": output_dir / SUMMARY_NAME,
        "collisions": output_dir / COLLISIONS_NAME,
    }
    expected = render_artifacts(audit)
    mismatches = []
    for name, path in paths.items():
        if not path.is_file():
            mismatches.append(f"missing {path}")
        elif path.read_bytes() != expected[name]:
            mismatches.append(f"out of date {path}")
    return mismatches


def _default_paths() -> tuple[Path, Path]:
    repo_root = Path(__file__).resolve().parents[3]
    return (
        repo_root / "db/data/words_content",
        repo_root / "docs/architecture/evidence/dictionary-identity-wave0",
    )


def main() -> int:
    default_source, default_output = _default_paths()
    parser = argparse.ArgumentParser(
        description="Build the deterministic Wave 0 dictionary identity audit.",
    )
    parser.add_argument("--source", type=Path, default=default_source)
    parser.add_argument("--output", type=Path, default=default_output)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Verify the tracked artifacts instead of rewriting them.",
    )
    args = parser.parse_args()

    audit = build_audit(args.source)
    if args.check:
        mismatches = check_artifacts(audit, args.output)
        if mismatches:
            for mismatch in mismatches:
                print(mismatch)
            return 1
        print(
            f"verified {audit.summary['artifactCount']} artifacts; "
            f"manifest {audit.summary['manifestSha256']}"
        )
        return 0

    paths = write_artifacts(audit, args.output)
    print(
        f"wrote {audit.summary['artifactCount']} artifacts; "
        f"manifest {audit.summary['manifestSha256']}"
    )
    for path in paths.values():
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
