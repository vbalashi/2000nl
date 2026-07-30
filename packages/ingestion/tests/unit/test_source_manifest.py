from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys

import pytest


INGESTION_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(INGESTION_ROOT / "src"))

from importer.source_manifest import (  # noqa: E402
    ARTIFACT_FINGERPRINT_VERSION,
    load_source_manifest,
    platform_v2_content_node_inputs,
)


def _write_manifest(root: Path) -> Path:
    root.mkdir(exist_ok=True)
    artifact_name = "000042_a123_voorbeeld_zn_1.json"
    payload = {
        "headword": "voorbeeld",
        "part_of_speech": "zn",
        "meanings": [{"definition": "een illustratie"}],
        "meaning_id": 1,
        "_source": {
            "identity_scheme_version": "vandale-provider-article-v1",
            "identity_evidence": {
                "dictionary_id": "fnt",
                "headword_raw": "voorbeeld",
                "provider_article_id": "a123",
            },
            "provider_article_id": "a123",
            "normalized_pos_status": "known",
            "pos_evidence": {
                "normalized_pos_status": "known",
                "source": "headword_html",
                "raw_value": "zn",
            },
            "source_group_key": "fnt:vandale-provider-article-v1:opaque",
            "source_entry_key": "fnt:vandale-provider-article-v1:opaque:1",
            "source_index": 42,
            "sense_ordinal": 1,
        },
    }
    artifact_path = root / artifact_name
    artifact_path.write_text(
        json.dumps([payload], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    record = {
        "artifact_path": artifact_name,
        "content_sha256": hashlib.sha256(artifact_path.read_bytes()).hexdigest(),
        "identity_scheme_version": "vandale-provider-article-v1",
        "source_entry_key": payload["_source"]["source_entry_key"],
        "source_group_key": payload["_source"]["source_group_key"],
    }
    manifest_path = root / "_manifest.jsonl"
    manifest_path.write_text(
        json.dumps(record, sort_keys=True, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    summary = {
        "artifact_count": 1,
        "artifact_format_version": "vandale-structured-v2",
        "identity_scheme_version": "vandale-provider-article-v1",
        "input_sha256": "a" * 64,
        "manifest_sha256": hashlib.sha256(manifest_path.read_bytes()).hexdigest(),
        "source_record_count": 1,
    }
    (root / "_manifest.summary.json").write_text(
        json.dumps(summary),
        encoding="utf-8",
    )
    return artifact_path


def _refresh_manifest_checksums(root: Path, artifact_path: Path) -> None:
    manifest_path = root / "_manifest.jsonl"
    record = json.loads(manifest_path.read_text(encoding="utf-8"))
    record["content_sha256"] = hashlib.sha256(
        artifact_path.read_bytes()
    ).hexdigest()
    manifest_path.write_text(
        json.dumps(record, sort_keys=True, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    summary_path = root / "_manifest.summary.json"
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    summary["manifest_sha256"] = hashlib.sha256(
        manifest_path.read_bytes()
    ).hexdigest()
    summary_path.write_text(json.dumps(summary), encoding="utf-8")


def test_loads_and_verifies_a_source_manifest(tmp_path: Path) -> None:
    _write_manifest(tmp_path)

    manifest = load_source_manifest(tmp_path)

    assert manifest.manifest_sha256
    assert len(manifest.artifacts) == 1
    artifact = manifest.artifacts[0]
    assert artifact.source_index == 42
    assert artifact.source_entry_key.endswith(":1")
    assert artifact.fingerprint_version == ARTIFACT_FINGERPRINT_VERSION
    assert len(artifact.content_fingerprint) == 64


def test_rejects_artifact_changed_after_manifest_was_written(
    tmp_path: Path,
) -> None:
    artifact_path = _write_manifest(tmp_path)
    artifact_path.write_text("[]", encoding="utf-8")

    with pytest.raises(ValueError, match="checksum mismatch"):
        load_source_manifest(tmp_path)


def test_rejects_manifest_path_outside_data_directory(tmp_path: Path) -> None:
    _write_manifest(tmp_path)
    manifest_path = tmp_path / "_manifest.jsonl"
    record = json.loads(manifest_path.read_text(encoding="utf-8"))
    record["artifact_path"] = "../outside.json"
    manifest_path.write_text(json.dumps(record) + "\n", encoding="utf-8")
    summary_path = tmp_path / "_manifest.summary.json"
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    summary["manifest_sha256"] = hashlib.sha256(
        manifest_path.read_bytes()
    ).hexdigest()
    summary_path.write_text(json.dumps(summary), encoding="utf-8")

    with pytest.raises(ValueError, match="unsafe artifact path"):
        load_source_manifest(tmp_path)


def test_rejects_payload_that_violates_shared_schema(tmp_path: Path) -> None:
    artifact_path = _write_manifest(tmp_path)
    payload = json.loads(artifact_path.read_text(encoding="utf-8"))
    payload[0]["meanings"] = [{"examples": ["missing definition"]}]
    artifact_path.write_text(json.dumps(payload), encoding="utf-8")
    _refresh_manifest_checksums(tmp_path, artifact_path)

    with pytest.raises(ValueError, match="violates NL dictionary schema"):
        load_source_manifest(tmp_path)


def test_builds_semantic_platform_v2_content_node_inputs() -> None:
    nodes = platform_v2_content_node_inputs(
        {
            "meanings": [
                {
                    "definition": "een illustratie",
                    "context": "ter verduidelijking",
                    "examples": ["dit is een voorbeeld"],
                    "idioms": [
                        {
                            "expression": "een lichtend voorbeeld",
                            "explanation": "iemand die navolging verdient",
                            "examples": ["zij is een lichtend voorbeeld"],
                        }
                    ],
                    "note": "vooral figuurlijk",
                }
            ]
        }
    )

    assert [node["kind"] for node in nodes] == [
        "definition",
        "usage-pattern",
        "example",
        "idiom",
        "idiom-explanation",
        "example",
        "usage-note",
    ]
    idiom = nodes[3]
    assert nodes[4]["parentInputKey"] == idiom["inputKey"]
    assert nodes[5]["parentInputKey"] == idiom["inputKey"]
    assert nodes[0]["sourcePath"] == "raw.meanings[0].definition"
    assert all(len(node["sourceTextFingerprint"]) == 64 for node in nodes)
    assert all("sourceNativeKey" not in node for node in nodes)
