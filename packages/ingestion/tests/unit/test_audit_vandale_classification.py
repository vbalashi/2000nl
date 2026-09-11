from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys


INGESTION_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(INGESTION_ROOT / "scripts"))

from audit_vandale_classification import audit_data_dir  # noqa: E402


DROP_HTML = """
<span id="a3045" class="f1y">
  <span class="f3 f3v"><span class="f2h"><span class="f2e">drop</span></span></span>
  <span class="f3 f3u">
    <span class="f1m">
      <span class="f3i">zwart snoep</span>
      <a class="f0h f1i f0c fm"><span class="f1u">▼</span> voorbeelden</a>
      <span id="v130266" class="fu f0c">
        <span class="f1f"><span class="f3i">zoete en zoute drop</span></span>
      </span>
      <span id="v130267" class="fu f0c">
        <span class="f1f"><span class="f3i">een dropje nemen</span></span>
      </span>
    </span>
  </span>
</span>
"""

EXPLAINED_IDIOM_HTML = """
<span id="a6107" class="f1y">
  <span class="f3 f3v"><span class="f2h"><span class="f2e">knots</span></span></span>
  <span class="f3 f3u">
    <span class="f1m">
      <a class="f0h f1i f0c fm"><span class="f1u">▼</span> voorbeelden</a>
      <span id="v100001" class="fu f0c">
        <span class="f1f">
          <span class="f3i">een knots van een …</span>
          <span class="f3n">een heel grote …</span>
          <span class="f2s">mijn broer heeft een knots van een huis</span>
        </span>
      </span>
    </span>
  </span>
</span>
"""


def _payload(
    *,
    headword: str,
    article_id: str,
    source_index: int,
    meanings: list[dict],
    raw_html: str,
) -> dict:
    group_key = f"fnt:vandale-provider-article-v1:{article_id}"
    return {
        "headword": headword,
        "meanings": meanings,
        "meaning_id": 1,
        "_raw_html": raw_html,
        "_source": {
            "identity_scheme_version": "vandale-provider-article-v1",
            "identity_evidence": {
                "dictionary_id": "fnt",
                "headword_raw": headword,
                "provider_article_id": article_id,
            },
            "provider_article_id": article_id,
            "normalized_pos_status": "unresolved",
            "pos_evidence": {
                "normalized_pos_status": "unresolved",
                "source": "fixture",
                "raw_value": "",
            },
            "source_entry_key": f"{group_key}:1",
            "source_group_key": group_key,
            "source_index": source_index,
            "sense_ordinal": 1,
        },
    }


def _write_manifest(root: Path) -> None:
    payloads = {
        "003081_a3045_drop_zn_1.json": _payload(
            headword="drop",
            article_id="a3045",
            source_index=3081,
            meanings=[
                {
                    "definition": "zwart snoep",
                    "context": "",
                    "examples": [],
                    "idioms": [
                        {"expression": "zoete en zoute drop"},
                        {"expression": "een dropje nemen"},
                    ],
                }
            ],
            raw_html=DROP_HTML,
        ),
        "006100_a6107_knots_zn_1.json": _payload(
            headword="knots",
            article_id="a6107",
            source_index=6100,
            meanings=[
                {
                    "definition": "",
                    "context": "",
                    "examples": [],
                    "idioms": [
                        {
                            "expression": "een knots van een …",
                            "explanation": "een heel grote …",
                            "examples": [
                                "mijn broer heeft een knots van een huis"
                            ],
                        }
                    ],
                }
            ],
            raw_html=EXPLAINED_IDIOM_HTML,
        ),
    }
    records = []
    for artifact_name, payload in payloads.items():
        artifact_path = root / artifact_name
        artifact_path.write_text(
            json.dumps([payload], ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        source = payload["_source"]
        records.append(
            {
                "artifact_path": artifact_name,
                "content_sha256": hashlib.sha256(
                    artifact_path.read_bytes()
                ).hexdigest(),
                "identity_scheme_version": source[
                    "identity_scheme_version"
                ],
                "source_entry_key": source["source_entry_key"],
                "source_group_key": source["source_group_key"],
            }
        )

    manifest_path = root / "_manifest.jsonl"
    manifest_path.write_text(
        "".join(
            json.dumps(record, sort_keys=True, separators=(",", ":")) + "\n"
            for record in records
        ),
        encoding="utf-8",
    )
    summary = {
        "artifact_count": len(records),
        "artifact_format_version": "vandale-structured-v2",
        "identity_scheme_version": "vandale-provider-article-v1",
        "input_sha256": "a" * 64,
        "manifest_sha256": hashlib.sha256(
            manifest_path.read_bytes()
        ).hexdigest(),
        "source_record_count": len(records),
    }
    (root / "_manifest.summary.json").write_text(
        json.dumps(summary),
        encoding="utf-8",
    )


def test_reports_exact_artifact_and_node_mapping_without_writing(tmp_path: Path) -> None:
    _write_manifest(tmp_path)
    initial_files = sorted(path.name for path in tmp_path.iterdir())

    report = audit_data_dir(tmp_path)

    assert sorted(path.name for path in tmp_path.iterdir()) == initial_files
    assert report["scannedArtifactCount"] == 2
    assert report["changedArtifactCount"] == 1
    assert report["failureCount"] == 0
    assert report["sourceShapeCensus"] == {
        "bareNonVoorbeeldenBlocks": 0,
        "bareVoorbeeldenBlocks": 2,
        "blocksWithExplanation": 1,
        "blocksWithNestedExamples": 1,
        "blocksWithoutExpression": 0,
        "totalF0cBlocks": 3,
    }
    assert report["falsePositiveGuards"] == {
        "classifiedBareVoorbeeldenBlocks": 2,
        "retainedBareNonVoorbeeldenBlocks": 0,
        "retainedBlocksWithExplanation": 1,
        "retainedBlocksWithNestedExamples": 1,
    }

    change = report["changes"][0]
    assert change["artifactPath"] == "003081_a3045_drop_zn_1.json"
    assert change["identity"] == {
        "providerArticleId": "a3045",
        "senseOrdinal": 1,
        "sourceEntryKey": "fnt:vandale-provider-article-v1:a3045:1",
        "sourceGroupKey": "fnt:vandale-provider-article-v1:a3045",
        "sourceIndex": 3081,
    }
    assert change["entryIdentityChanged"] is False
    assert change["beforeMeanings"][0]["examples"] == []
    assert change["afterMeanings"][0]["examples"] == [
        "zoete en zoute drop",
        "een dropje nemen",
    ]
    assert len(change["nodeDiff"]["unchanged"]) == 1
    assert [mapping["sourceText"] for mapping in change["nodeDiff"]["remapped"]] == [
        "zoete en zoute drop",
        "een dropje nemen",
    ]
    assert all(
        mapping["match"] == "unique-source-text-within-entry"
        for mapping in change["nodeDiff"]["remapped"]
    )
    assert all(
        mapping["before"]["kind"] == "idiom"
        and mapping["after"]["kind"] == "example"
        and mapping["before"]["sourceTextFingerprint"]
        != mapping["after"]["sourceTextFingerprint"]
        for mapping in change["nodeDiff"]["remapped"]
    )
    assert change["nodeDiff"]["removed"] == []
    assert change["nodeDiff"]["added"] == []
