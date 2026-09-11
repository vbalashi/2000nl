from __future__ import annotations

import hashlib
import json
import sys
from copy import deepcopy
from pathlib import Path

import pytest

INGESTION_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(INGESTION_ROOT / "src"))
sys.path.insert(0, str(INGESTION_ROOT / "scripts"))

from importer.source_manifest import (
    SourceArtifact,
    platform_v2_content_node_inputs,
)
from reconcile_vandale_drop import (
    EXPECTED_AFTER_SEMANTIC_FINGERPRINT,
    EXPECTED_BEFORE_SEMANTIC_FINGERPRINT,
    EXPECTED_RECONCILED_MANIFEST_SHA256,
    EXPECTED_SOURCE_ENTRY_KEY,
    EXPECTED_SOURCE_GROUP_KEY,
    ReconciliationRefused,
    _load_snapshot,
    _write_snapshot,
    build_reconciliation_plan,
)

DROP_HTML = """
<span id="a3045" class="f1y">
  <span class="f3 f3v"><span class="f2h"><span class="f2e">drop</span></span></span>
  <span class="f3 f3u">
    <span class="f1m">
      <span class="f3i">zwart snoep</span>
      <a class="f0h f1i f0c fm"><span class="f1u">▼</span> voorbeelden</a>
      <span class="fu f0c"><span class="f1f"><span class="f3i">zoete en zoute drop</span></span></span>
      <span class="fu f0c"><span class="f1f"><span class="f3i">een dropje nemen</span></span></span>
    </span>
  </span>
</span>
"""


def _fixture() -> tuple[SourceArtifact, dict, dict, list[dict]]:
    payload = {
        "headword": "drop",
        "pronunciation": "drop",
        "pronunciation_with_stress": "drop",
        "gender": "de",
        "part_of_speech": "zn",
        "plural": "",
        "diminutive": "",
        "verb_forms": "",
        "conjugation_table": None,
        "inflected_form": "",
        "comparative": "",
        "superlative": "",
        "derivations": "",
        "alternate_headwords": [],
        "cross_reference": None,
        "is_nt2_2000": False,
        "meanings": [
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
        "audio_links": {
            "nl": "http://spraak/nl/d/naN-EdiUJZFu43JjXjUXFg",
            "be": "http://spraak/be/d/Gf6CFegK673RWnPk1MPd5Q",
        },
        "images": [],
        "reference_tables": [],
        "source_identity": {"provider_article_id": "a3045"},
        "part_of_speech_evidence": {
            "normalized_pos_status": "unresolved",
            "source": "gender_heuristic",
            "raw_value": "de",
        },
        "_metadata": {
            "search_term": "drop",
            "headword_raw": "drop",
            "index": 3081,
            "dictionaryId": "fnt",
        },
        "meaning_id": 1,
        "_raw_html": DROP_HTML,
        "_source": {
            "identity_scheme_version": "vandale-provider-article-v1",
            "identity_evidence": {
                "dictionary_id": "fnt",
                "headword_raw": "drop",
                "provider_article_id": "a3045",
            },
            "source_entry_key": EXPECTED_SOURCE_ENTRY_KEY,
            "source_group_key": EXPECTED_SOURCE_GROUP_KEY,
            "provider_article_id": "a3045",
            "source_index": 3081,
            "sense_ordinal": 1,
            "normalized_pos_status": "unresolved",
            "pos_evidence": {
                "normalized_pos_status": "unresolved",
                "source": "gender_heuristic",
                "raw_value": "de",
            },
        },
    }
    artifact = SourceArtifact(
        path=Path("003081_a3045_drop_zn_1.json"),
        artifact_path="003081_a3045_drop_zn_1.json",
        content_sha256="fixture",
        identity_scheme_version="vandale-provider-article-v1",
        source_entry_key=EXPECTED_SOURCE_ENTRY_KEY,
        source_group_key=EXPECTED_SOURCE_GROUP_KEY,
        source_index=3081,
        sense_ordinal=1,
        normalized_pos_status="unresolved",
        content_fingerprint=EXPECTED_BEFORE_SEMANTIC_FINGERPRINT,
        fingerprint_version="vandale-semantic-v1",
        payload=payload,
    )
    raw = deepcopy(payload)
    raw.pop("_raw_html")
    entry = {
        "id": "0b433734-4b7b-48c4-8287-8085205a3a4e",
        "raw": raw,
        "headword": "drop",
        "management_kind": "source",
        "source_lifecycle": "active",
    }
    binding = {
        "source_entry_key": EXPECTED_SOURCE_ENTRY_KEY,
        "source_group_key": EXPECTED_SOURCE_GROUP_KEY,
        "sense_ordinal": 1,
        "word_entry_id": entry["id"],
        "content_fingerprint": EXPECTED_BEFORE_SEMANTIC_FINGERPRINT,
        "binding_state": "active",
        "identity_scheme_version": "vandale-provider-article-v1",
        "dictionary_slug": "nl-vandale",
    }
    nodes = []
    for index, node in enumerate(platform_v2_content_node_inputs(payload), 1):
        nodes.append(
            {
                "id": f"node-{index}",
                "kind": node["kind"],
                "binding_state": "active",
                "source_text_fingerprint": node["sourceTextFingerprint"],
                "diagnostic_locator": node["sourcePath"],
                "parent_content_node_id": None,
                "sourceText": node["sourceText"],
            }
        )
    return artifact, entry, binding, nodes


def test_build_plan_requires_exact_state_and_maps_only_two_nodes() -> None:
    artifact, entry, binding, nodes = _fixture()

    plan = build_reconciliation_plan(
        artifact=artifact,
        entry=entry,
        binding=binding,
        nodes=nodes,
        translations=[],
        card_status_rows=[],
        review_log_rows=[],
        references=[],
    )

    assert plan["manifestSha256"] == EXPECTED_RECONCILED_MANIFEST_SHA256
    assert plan["afterSemanticFingerprint"] == EXPECTED_AFTER_SEMANTIC_FINGERPRINT
    assert plan["translationRowCount"] == 0
    assert plan["cardStatusRowCount"] == 0
    assert plan["reviewLogRowCount"] == 0
    assert [item["sourceText"] for item in plan["transitions"]] == [
        "zoete en zoute drop",
        "een dropje nemen",
    ]
    assert all(item["newKind"] == "example" for item in plan["transitions"])


def test_build_plan_refuses_translations_in_bounded_operation() -> None:
    artifact, entry, binding, nodes = _fixture()

    plan = build_reconciliation_plan(
        artifact=artifact,
        entry=entry,
        binding=binding,
        nodes=nodes,
        translations=[{"id": "translation-1"}],
        card_status_rows=[],
        review_log_rows=[],
        references=[],
    )

    assert plan["translationGuard"] == "refused-existing-rows"


def test_snapshot_is_provenanced_atomic_and_non_overwriting(tmp_path: Path) -> None:
    artifact, entry, binding, nodes = _fixture()
    plan = build_reconciliation_plan(
        artifact=artifact,
        entry=entry,
        binding=binding,
        nodes=nodes,
        translations=[],
        card_status_rows=[],
        review_log_rows=[],
        references=[],
    )
    snapshot_path = tmp_path / "drop-pre-operation.json"

    _write_snapshot(snapshot_path, plan)

    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
    assert snapshot["manifest"]["productionBaseline"]
    assert snapshot["manifest"]["reconciledPatch"]
    assert snapshot["afterNodeEvidence"]
    assert snapshot["snapshotContentDigest"]
    assert snapshot_path.stat().st_mode & 0o777 == 0o600
    with pytest.raises(ReconciliationRefused, match="refusing to overwrite"):
        _write_snapshot(snapshot_path, plan)

    incomplete_path = tmp_path / "incomplete.json"
    incomplete = dict(snapshot)
    incomplete.pop("afterNodeEvidence")
    incomplete.pop("snapshotContentDigest")
    incomplete_body = json.dumps(
        incomplete,
        ensure_ascii=False,
        indent=2,
        default=str,
    )
    incomplete["snapshotContentDigest"] = hashlib.sha256(
        incomplete_body.encode("utf-8")
    ).hexdigest()
    incomplete_path.write_text(
        json.dumps(incomplete, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    with pytest.raises(ReconciliationRefused, match="snapshot is incomplete"):
        _load_snapshot(incomplete_path)
