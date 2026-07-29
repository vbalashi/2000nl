from __future__ import annotations

import gzip
import json
import sys
from pathlib import Path


INGESTION_ROOT = Path(__file__).resolve().parents[2]
sys.path.append(str(INGESTION_ROOT / "src"))
sys.path.append(str(INGESTION_ROOT / "scripts"))

from dictionary_identity_wave0_audit import build_audit, write_artifacts  # noqa: E402


def write_entry(
    path: Path,
    *,
    headword: str,
    meaning_id: int | None,
    part_of_speech: str | None,
    definition: str,
    raw_html: str = "",
) -> None:
    payload = {
        "headword": headword,
        "part_of_speech": part_of_speech,
        "meanings": [{"definition": definition}],
        "_metadata": {"index": 12},
        "_raw_html": raw_html,
    }
    if meaning_id is not None:
        payload["meaning_id"] = meaning_id
    path.write_text(
        json.dumps([payload], ensure_ascii=False),
        encoding="utf-8",
    )


def test_build_audit_is_deterministic_and_reports_current_key_collisions(
    tmp_path: Path,
) -> None:
    source = tmp_path / "words"
    source.mkdir()
    write_entry(
        source / "bank_zn_1.json",
        headword="bank",
        meaning_id=1,
        part_of_speech="zelfstandig naamwoord",
        definition="zitmeubel",
    )
    write_entry(
        source / "bank_bw_1.json",
        headword="bank",
        meaning_id=1,
        part_of_speech="bijwoord",
        definition="op een bank",
    )
    write_entry(
        source / "lopen_ww_2.json",
        headword="lopen",
        meaning_id=None,
        part_of_speech="werkwoord",
        definition="zich te voet verplaatsen",
    )

    first = build_audit(source)
    second = build_audit(source)

    assert first.manifest_bytes == second.manifest_bytes
    assert first.summary == second.summary
    assert first.collision_groups == second.collision_groups
    assert first.summary["artifactCount"] == 3
    assert first.summary["currentKeyCount"] == 2
    assert first.summary["multiPayloadPosCurrentKeyGroupCount"] == 1
    assert first.summary["minimumOverwrittenVariantCount"] == 1
    assert first.summary["rejectedArtifactCount"] == 0
    assert first.collision_groups == [
        {
            "artifacts": ["bank_bw_1.json", "bank_zn_1.json"],
            "headword": "bank",
            "meaningId": 1,
            "payloadPositions": ["bw", "zn"],
        }
    ]

    records = [
        json.loads(line)
        for line in first.manifest_bytes.decode("utf-8").splitlines()
    ]
    assert [record["artifactPath"] for record in records] == [
        "bank_bw_1.json",
        "bank_zn_1.json",
        "lopen_ww_2.json",
    ]
    assert records[0]["filenamePosToken"] == "bw"
    assert records[1]["filenamePosToken"] == "zn"
    assert records[2]["meaningId"] == 2


def test_content_fingerprint_excludes_raw_html_but_artifact_hash_does_not(
    tmp_path: Path,
) -> None:
    source = tmp_path / "words"
    source.mkdir()
    path = source / "goed_bn_1.json"
    write_entry(
        path,
        headword="goed",
        meaning_id=1,
        part_of_speech="bijvoeglijk naamwoord",
        definition="van hoge kwaliteit",
        raw_html="<p>first scrape</p>",
    )
    first = json.loads(build_audit(source).manifest_bytes)

    write_entry(
        path,
        headword="goed",
        meaning_id=1,
        part_of_speech="bijvoeglijk naamwoord",
        definition="van hoge kwaliteit",
        raw_html="<p>second scrape</p>",
    )
    second = json.loads(build_audit(source).manifest_bytes)

    assert first["contentFingerprint"] == second["contentFingerprint"]
    assert first["artifactSha256"] != second["artifactSha256"]


def test_write_artifacts_produces_reproducible_gzip_and_summary(
    tmp_path: Path,
) -> None:
    source = tmp_path / "words"
    source.mkdir()
    write_entry(
        source / "huis_zn_1.json",
        headword="huis",
        meaning_id=1,
        part_of_speech="zn",
        definition="gebouw om in te wonen",
    )
    audit = build_audit(source)

    first_output = tmp_path / "first"
    second_output = tmp_path / "second"
    first_paths = write_artifacts(audit, first_output)
    second_paths = write_artifacts(audit, second_output)

    assert first_paths.keys() == second_paths.keys()
    for name in first_paths:
        assert first_paths[name].read_bytes() == second_paths[name].read_bytes()

    compressed = first_paths["manifest"].read_bytes()
    assert gzip.decompress(compressed) == audit.manifest_bytes

    summary = json.loads(first_paths["summary"].read_text(encoding="utf-8"))
    assert summary["manifestSha256"] == audit.summary["manifestSha256"]
    assert summary["manifestGzipSha256"]


def test_rejected_artifact_is_independent_of_checkout_path(
    tmp_path: Path,
) -> None:
    first_source = tmp_path / "first" / "words"
    second_source = tmp_path / "second" / "words"
    first_source.mkdir(parents=True)
    second_source.mkdir(parents=True)
    for source in (first_source, second_source):
        (source / "broken_zn_1.json").write_text("[]", encoding="utf-8")

    first = build_audit(first_source)
    second = build_audit(second_source)

    assert first.manifest_bytes == second.manifest_bytes
    assert first.summary == second.summary
    record = json.loads(first.manifest_bytes)
    assert record["artifactPath"] == "broken_zn_1.json"
    assert record["errorCode"] == "parse:ValueError"
    assert str(tmp_path) not in record["error"]
