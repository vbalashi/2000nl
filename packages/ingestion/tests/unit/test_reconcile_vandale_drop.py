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
    _assert_rollback_node_inventory,
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


def _rollback_node_inventory_fixture() -> tuple[dict, dict]:
    before_raw = {
        "meanings": [
            {
                "definition": "definition",
                "examples": [],
                "idioms": ["idiom a", "idiom b"],
            }
        ]
    }
    after_raw = {
        "meanings": [
            {
                "definition": "definition",
                "examples": ["example a", "example b"],
                "idioms": [],
            }
        ]
    }
    before_inputs = platform_v2_content_node_inputs(before_raw)
    after_inputs = platform_v2_content_node_inputs(after_raw)

    def stored_node(
        node_id: str, node: dict, source_order: int, *, binding_state: str
    ) -> dict:
        return {
            "id": node_id,
            "kind": node["kind"],
            "binding_state": binding_state,
            "source_text_fingerprint": node["sourceTextFingerprint"],
            "diagnostic_locator": node["sourcePath"],
            "parent_content_node_id": None,
            "first_source_revision": "baseline",
            "last_source_revision": "baseline",
            "identity_evidence": {
                "sourceTextFingerprint": node["sourceTextFingerprint"]
            },
            "reconciliation_decision": {"decision": "new-unmatched"},
            "source_native_key": None,
            "canonical_source_text": node["sourceText"],
            "source_order": source_order,
        }

    before_nodes = [
        stored_node("definition", before_inputs[0], 1, binding_state="active"),
        stored_node("old-idiom-a", before_inputs[1], 2, binding_state="active"),
        stored_node("old-idiom-b", before_inputs[2], 3, binding_state="active"),
    ]
    snapshot = {
        "raw": before_raw,
        "nodes": before_nodes,
        "afterNodeEvidence": after_inputs,
    }
    state = {
        "nodes": [
            {
                **before_nodes[0],
                "last_source_revision": EXPECTED_RECONCILED_MANIFEST_SHA256,
                "reconciliation_decision": {
                    "decision": "preserve-unambiguous-fingerprint"
                },
            },
            {
                **before_nodes[1],
                "binding_state": "retired",
                "last_source_revision": EXPECTED_RECONCILED_MANIFEST_SHA256,
                "reconciliation_decision": {"decision": "retire-missing"},
            },
            {
                **before_nodes[2],
                "binding_state": "retired",
                "last_source_revision": EXPECTED_RECONCILED_MANIFEST_SHA256,
                "reconciliation_decision": {"decision": "retire-missing"},
            },
            {
                **stored_node(
                    "new-example-a", after_inputs[1], 2, binding_state="active"
                ),
                "first_source_revision": EXPECTED_RECONCILED_MANIFEST_SHA256,
                "last_source_revision": EXPECTED_RECONCILED_MANIFEST_SHA256,
            },
            {
                **stored_node(
                    "new-example-b", after_inputs[2], 3, binding_state="active"
                ),
                "first_source_revision": EXPECTED_RECONCILED_MANIFEST_SHA256,
                "last_source_revision": EXPECTED_RECONCILED_MANIFEST_SHA256,
            },
        ]
    }
    return snapshot, state


def test_rollback_inventory_accepts_exact_committed_post_apply_nodes() -> None:
    snapshot, state = _rollback_node_inventory_fixture()

    _assert_rollback_node_inventory(snapshot, state)


def test_rollback_inventory_refuses_unexpected_retired_node() -> None:
    snapshot, state = _rollback_node_inventory_fixture()
    state["nodes"].append(
        {
            "id": "later-retired-node",
            "kind": "example",
            "binding_state": "retired",
            "source_text_fingerprint": "later-fingerprint",
            "diagnostic_locator": "meanings/0/examples/2",
        }
    )

    with pytest.raises(ReconciliationRefused, match="inventory differs"):
        _assert_rollback_node_inventory(snapshot, state)


def test_rollback_inventory_refuses_changed_retired_node_provenance() -> None:
    snapshot, state = _rollback_node_inventory_fixture()
    state["nodes"][1]["diagnostic_locator"] = "meanings/0/idioms/changed"

    with pytest.raises(ReconciliationRefused, match="original node provenance"):
        _assert_rollback_node_inventory(snapshot, state)


def test_rollback_inventory_refuses_changed_retired_node_revision_or_decision() -> None:
    snapshot, state = _rollback_node_inventory_fixture()
    state["nodes"][1]["last_source_revision"] = "later-revision"

    with pytest.raises(ReconciliationRefused, match="original node revision"):
        _assert_rollback_node_inventory(snapshot, state)

    snapshot, state = _rollback_node_inventory_fixture()
    state["nodes"][1]["reconciliation_decision"] = {"decision": "later-change"}

    with pytest.raises(ReconciliationRefused, match="original node decision"):
        _assert_rollback_node_inventory(snapshot, state)


@pytest.mark.parametrize(
    ("node_index", "field", "value", "message"),
    [
        (1, "source_native_key", "later-native-key", "original node projection"),
        (1, "canonical_source_text", "later text", "original node projection"),
        (3, "source_order", 99, "generated node projection"),
    ],
)
def test_rollback_inventory_refuses_changed_persisted_node_projection(
    node_index: int, field: str, value: object, message: str
) -> None:
    snapshot, state = _rollback_node_inventory_fixture()
    state["nodes"][node_index][field] = value

    with pytest.raises(ReconciliationRefused, match=message):
        _assert_rollback_node_inventory(snapshot, state)
