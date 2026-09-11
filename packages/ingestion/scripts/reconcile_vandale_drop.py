"""Fail-closed, single-entry reconciliation for issue #341."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import tempfile
from copy import deepcopy
from pathlib import Path
from typing import Any

import psycopg2
import psycopg2.extras

INGESTION_ROOT = Path(__file__).resolve().parents[1]
PACKAGES_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(INGESTION_ROOT / "src"))
sys.path.insert(0, str(PACKAGES_ROOT / "scraper"))

from importer.pointer_meanings import (
    promote_resolvable_pointer_only_meaning,
)
from importer.source_manifest import (
    SourceArtifact,
    load_source_manifest,
    platform_v2_content_node_inputs,
    semantic_content_fingerprint,
)
from vandale_html_parser import parse_vandale_entry_fixed

ISSUE = "#341"
EXPECTED_MANIFEST_SHA256 = (
    "45fc68e1dee018f3e778d88ec22d7805fb90588b1d1dacd226e3ae6024b621ce"
)
EXPECTED_PRODUCTION_MANIFEST_SHA256 = (
    "53496b238a88473891ecedd4a1f95151a05383d39c7a51d333bdb48a6e69b08b"
)
EXPECTED_RECONCILED_MANIFEST_SHA256 = (
    "3ebc14837ccb2d876753735a30237d38454cdf7a465a7ee631f9e18c04191aca"
)
EXPECTED_SOURCE_ENTRY_KEY = (
    "fnt:vandale-provider-article-v1:"
    "6ede8138ab47c0bc35156dea4753f6b0:1"
)
EXPECTED_ARTIFACT_PATH = "003081_a3045_drop_zn_1.json"
EXPECTED_SOURCE_GROUP_KEY = (
    "fnt:vandale-provider-article-v1:6ede8138ab47c0bc35156dea4753f6b0"
)
EXPECTED_PROVIDER_ARTICLE_ID = "a3045"
EXPECTED_SOURCE_INDEX = 3081
EXPECTED_SENSE_ORDINAL = 1
EXPECTED_HEADWORD = "drop"
EXPECTED_DICTIONARY_SLUG = "nl-vandale"
EXPECTED_BEFORE_SEMANTIC_FINGERPRINT = (
    "87fb3af13b29792a0ea5d58c7a2c5325a2c8bf386a4910e8007a74896d4621de"
)
EXPECTED_AFTER_SEMANTIC_FINGERPRINT = (
    "9f4726101b026171bb71dff91dd6532949a906980538f38c92475314f88bebe8"
)


class ReconciliationRefused(RuntimeError):
    """The live state is not the exact state this operation is allowed to change."""


def _sanitized_payload(payload: dict[str, Any]) -> dict[str, Any]:
    result = deepcopy(payload)
    result.pop("_raw_html", None)
    return result


def _corrected_payload(artifact: SourceArtifact) -> dict[str, Any]:
    parsed = parse_vandale_entry_fixed(
        artifact.payload.get("_raw_html") or "",
        artifact.payload.get("headword"),
    )
    meanings = parsed.get("meanings") or []
    if artifact.sense_ordinal > len(meanings):
        raise ReconciliationRefused(
            "corrected parser output has too few meanings"
        )

    corrected = deepcopy(artifact.payload)
    corrected["meanings"] = [
        deepcopy(meanings[artifact.sense_ordinal - 1])
    ]
    return corrected


def _serialized_artifact(payload: dict[str, Any]) -> bytes:
    return json.dumps(
        [payload],
        ensure_ascii=False,
        indent=2,
    ).encode("utf-8")


def _manifest_checksum(records: list[dict[str, str]]) -> str:
    manifest = "".join(
        json.dumps(
            record,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        + "\n"
        for record in sorted(records, key=lambda record: record["artifact_path"])
    ).encode("utf-8")
    return hashlib.sha256(manifest).hexdigest()


def _derive_production_scope(
    manifest: Any,
    corrected_payload: dict[str, Any],
) -> tuple[dict[str, str], dict[str, str]]:
    """Replay the released pointer normalization before checking #341 scope."""
    available_headwords = {
        str(artifact.payload.get("headword")).strip()
        for artifact in manifest.artifacts
        if isinstance(artifact.payload.get("headword"), str)
    }
    baseline_fingerprints: dict[str, str] = {}
    reconciled_fingerprints: dict[str, str] = {}
    baseline_records: list[dict[str, str]] = []
    reconciled_records: list[dict[str, str]] = []
    for artifact in manifest.artifacts:
        production_payload = deepcopy(artifact.payload)
        promote_resolvable_pointer_only_meaning(
            production_payload,
            available_headwords,
        )
        reconciled_payload = (
            corrected_payload
            if artifact.source_entry_key == EXPECTED_SOURCE_ENTRY_KEY
            else production_payload
        )
        baseline_fingerprints[artifact.source_entry_key] = (
            semantic_content_fingerprint(production_payload)
        )
        reconciled_fingerprints[artifact.source_entry_key] = (
            semantic_content_fingerprint(reconciled_payload)
        )
        baseline_records.append(
            {
                "artifact_path": artifact.artifact_path,
                "content_sha256": hashlib.sha256(
                    _serialized_artifact(production_payload)
                ).hexdigest(),
                "identity_scheme_version": artifact.identity_scheme_version,
                "source_entry_key": artifact.source_entry_key,
                "source_group_key": artifact.source_group_key,
            }
        )
        reconciled_records.append(
            {
                "artifact_path": artifact.artifact_path,
                "content_sha256": hashlib.sha256(
                    _serialized_artifact(reconciled_payload)
                ).hexdigest(),
                "identity_scheme_version": artifact.identity_scheme_version,
                "source_entry_key": artifact.source_entry_key,
                "source_group_key": artifact.source_group_key,
            }
        )

    if _manifest_checksum(baseline_records) != EXPECTED_PRODUCTION_MANIFEST_SHA256:
        raise ReconciliationRefused(
            "source corpus does not reproduce the production #151 manifest"
        )
    if _manifest_checksum(reconciled_records) != EXPECTED_RECONCILED_MANIFEST_SHA256:
        raise ReconciliationRefused(
            "source corpus does not reproduce the approved #341 patch manifest"
        )
    if baseline_fingerprints[EXPECTED_SOURCE_ENTRY_KEY] != (
        EXPECTED_BEFORE_SEMANTIC_FINGERPRINT
    ):
        raise ReconciliationRefused(
            "production baseline fingerprint for drop is not approved"
        )
    if reconciled_fingerprints[EXPECTED_SOURCE_ENTRY_KEY] != (
        EXPECTED_AFTER_SEMANTIC_FINGERPRINT
    ):
        raise ReconciliationRefused(
            "reconciled fingerprint for drop is not approved"
        )
    return baseline_fingerprints, reconciled_fingerprints


def _node_signature(node: dict[str, Any]) -> tuple[str, str, str, str]:
    return (
        node.get("kind", ""),
        node.get("sourcePath", ""),
        node.get("sourceText", ""),
        node.get("sourceTextFingerprint", ""),
    )


def _artifact_by_key(data_dir: Path) -> tuple[Any, SourceArtifact]:
    manifest = load_source_manifest(data_dir)
    if manifest.manifest_sha256 != EXPECTED_MANIFEST_SHA256:
        raise ReconciliationRefused(
            "manifest checksum differs from the approved #339 audit"
        )
    if len(manifest.artifacts) != 18163:
        raise ReconciliationRefused(
            "manifest artifact count differs from the approved #339 audit"
        )
    matches = [
        artifact
        for artifact in manifest.artifacts
        if artifact.source_entry_key == EXPECTED_SOURCE_ENTRY_KEY
    ]
    if len(matches) != 1:
        raise ReconciliationRefused(
            "approved source entry key is not unique in the manifest"
        )
    artifact = matches[0]
    if artifact.artifact_path != EXPECTED_ARTIFACT_PATH:
        raise ReconciliationRefused("approved artifact path changed")
    return manifest, artifact


def _assert_manifest_scope(
    cursor,
    manifest: Any,
    corrected_payload: dict[str, Any],
) -> None:
    baseline_fingerprints, reconciled_fingerprints = _derive_production_scope(
        manifest,
        corrected_payload,
    )
    expected_binding_identity = {
        artifact.source_entry_key: (
            artifact.source_group_key,
            artifact.sense_ordinal,
            artifact.fingerprint_version,
        )
        for artifact in manifest.artifacts
    }
    cursor.execute(
        """
        select b.source_entry_key, b.content_fingerprint,
               b.source_group_key, b.sense_ordinal,
               b.content_fingerprint_version,
               b.binding_state, b.identity_scheme_version,
               d.slug, b.manifest_checksum, b.word_entry_id
        from private.source_entry_bindings b
        join public.dictionaries d on d.id = b.dictionary_id
        where b.identity_scheme_version = %s
          and b.binding_state = 'active'
        """,
        (manifest.identity_scheme_version,),
    )
    rows = cursor.fetchall()
    actual_keys = {row[0] for row in rows}
    if actual_keys != set(baseline_fingerprints):
        raise ReconciliationRefused(
            "active source binding coverage differs from the approved manifest"
        )
    if any(
        row[5] != "active"
        or row[6] != manifest.identity_scheme_version
        or row[7] != EXPECTED_DICTIONARY_SLUG
        or row[9] is None
        for row in rows
    ):
        raise ReconciliationRefused(
            "source binding lifecycle or dictionary scope changed"
        )
    if any(
        (
            source_group_key,
            sense_ordinal,
            fingerprint_version,
        )
        != expected_binding_identity[source_entry_key]
        for source_entry_key, _fingerprint, source_group_key, sense_ordinal,
        fingerprint_version,
        _state, _scheme, _slug, _checksum, _entry_id in rows
    ):
        raise ReconciliationRefused(
            "source binding identity tuple differs from the approved manifest"
        )
    if {row[8] for row in rows} != {EXPECTED_PRODUCTION_MANIFEST_SHA256}:
        raise ReconciliationRefused(
            "production source bindings are not on the approved #151 manifest"
        )
    if any(
        fingerprint != baseline_fingerprints[source_entry_key]
        for source_entry_key, fingerprint, _group, _ordinal, _version,
        _state, _scheme, _slug, _checksum, _entry_id in rows
    ):
        raise ReconciliationRefused(
            "production content fingerprints differ from the approved #151 baseline"
        )
    changed = {
        source_entry_key
        for source_entry_key, fingerprint, _group, _ordinal, _version,
        _state, _scheme, _slug, _checksum, _entry_id in rows
        if fingerprint != reconciled_fingerprints[source_entry_key]
    }
    if changed != {EXPECTED_SOURCE_ENTRY_KEY}:
        raise ReconciliationRefused(
            "affected-entry count differs from the approved #339 audit"
        )


def build_reconciliation_plan(
    *,
    artifact: SourceArtifact,
    entry: dict[str, Any],
    binding: dict[str, Any],
    nodes: list[dict[str, Any]],
    translations: list[dict[str, Any]],
    card_status_rows: list[dict[str, Any]],
    review_log_rows: list[dict[str, Any]],
    references: list[dict[str, Any]],
    affected_entry_count: int = 1,
) -> dict[str, Any]:
    """Validate live state and return the exact single-entry mutation plan."""
    source = artifact.payload.get("_source") or {}
    if (
        artifact.source_entry_key != EXPECTED_SOURCE_ENTRY_KEY
        or artifact.source_group_key != EXPECTED_SOURCE_GROUP_KEY
        or source.get("provider_article_id") != EXPECTED_PROVIDER_ARTICLE_ID
        or artifact.source_index != EXPECTED_SOURCE_INDEX
        or artifact.sense_ordinal != EXPECTED_SENSE_ORDINAL
    ):
        raise ReconciliationRefused("artifact source identity is not approved")

    if entry.get("id") != binding.get("word_entry_id"):
        raise ReconciliationRefused("binding does not point at the locked entry")
    if (
        binding.get("source_entry_key") != EXPECTED_SOURCE_ENTRY_KEY
        or binding.get("source_group_key") != EXPECTED_SOURCE_GROUP_KEY
        or binding.get("sense_ordinal") != EXPECTED_SENSE_ORDINAL
        or binding.get("binding_state") != "active"
        or binding.get("identity_scheme_version")
        != "vandale-provider-article-v1"
        or binding.get("dictionary_slug") != EXPECTED_DICTIONARY_SLUG
        or entry.get("headword") != EXPECTED_HEADWORD
        or entry.get("management_kind") != "source"
        or entry.get("source_lifecycle") != "active"
    ):
        raise ReconciliationRefused("live entry identity or lifecycle changed")
    if binding.get("content_fingerprint") != EXPECTED_BEFORE_SEMANTIC_FINGERPRINT:
        raise ReconciliationRefused("live content fingerprint is not the approved old value")

    before_payload = _sanitized_payload(artifact.payload)
    if entry.get("raw") != before_payload:
        raise ReconciliationRefused(
            "live raw payload differs from the approved pre-operation artifact"
        )

    corrected_payload = _corrected_payload(artifact)
    after_fingerprint = semantic_content_fingerprint(corrected_payload)
    if after_fingerprint != EXPECTED_AFTER_SEMANTIC_FINGERPRINT:
        raise ReconciliationRefused(
            "corrected parser output differs from the approved #339 result"
        )
    after_raw = _sanitized_payload(corrected_payload)

    before_inputs = platform_v2_content_node_inputs(artifact.payload)
    after_inputs = platform_v2_content_node_inputs(corrected_payload)
    expected_before = {_node_signature(node) for node in before_inputs}
    live_active = [
        node for node in nodes if node.get("binding_state") == "active"
    ]
    live_signatures = {
        (
            node.get("kind", ""),
            node.get("diagnostic_locator", ""),
            node.get("sourceText", ""),
            node.get("source_text_fingerprint", ""),
        )
        for node in live_active
    }
    if live_signatures != expected_before:
        raise ReconciliationRefused(
            "live active node set differs from the approved old node set"
        )

    old_by_text = {
        node["sourceText"]: node
        for node in before_inputs
        if node["kind"] == "idiom"
    }
    if set(old_by_text) != {"zoete en zoute drop", "een dropje nemen"}:
        raise ReconciliationRefused("approved old idiom text set changed")
    live_by_signature = {
        (
            node.get("kind", ""),
            node.get("diagnostic_locator", ""),
            node.get("source_text_fingerprint", ""),
        ): node
        for node in live_active
    }
    transitions = []
    for old_node in old_by_text.values():
        live_node = live_by_signature.get(
            (
                old_node["kind"],
                old_node["sourcePath"],
                old_node["sourceTextFingerprint"],
            )
        )
        if live_node is None:
            raise ReconciliationRefused("approved old idiom node is not active")
        new_candidates = [
            node
            for node in after_inputs
            if node["kind"] == "example"
            and node["sourceText"] == old_node["sourceText"]
        ]
        if len(new_candidates) != 1:
            raise ReconciliationRefused(
                f"new mapping is ambiguous for {old_node['sourceText']}"
            )
        transitions.append(
            {
                "sourceText": old_node["sourceText"],
                "oldInputKey": old_node["inputKey"],
                "oldNodeId": live_node["id"],
                "newInputKey": new_candidates[0]["inputKey"],
                "newKind": new_candidates[0]["kind"],
                "newSourceTextFingerprint": new_candidates[0][
                    "sourceTextFingerprint"
                ],
            }
        )

    if affected_entry_count != 1:
        raise ReconciliationRefused("affected-entry count is not exactly one")

    return {
        "issue": ISSUE,
        "manifestSha256": EXPECTED_RECONCILED_MANIFEST_SHA256,
        "artifactPath": artifact.artifact_path,
        "sourceEntryKey": EXPECTED_SOURCE_ENTRY_KEY,
        "entryId": entry["id"],
        "beforeSemanticFingerprint": EXPECTED_BEFORE_SEMANTIC_FINGERPRINT,
        "afterSemanticFingerprint": after_fingerprint,
        "translationRowCount": len(translations),
        "translationBindings": [
            {
                key: translation.get(key)
                for key in (
                    "id",
                    "target_lang",
                    "provider",
                    "status",
                    "source_content_revision",
                    "translation_policy_version",
                    "provider_revision",
                )
            }
            for translation in translations
        ],
        "cardStatusRowCount": len(card_status_rows),
        "reviewLogRowCount": len(review_log_rows),
        "referenceCount": len(references),
        "beforeNodeCount": len(live_active),
        "afterNodeCount": len(after_inputs),
        "transitions": transitions,
        "beforeRaw": before_payload,
        "afterRaw": after_raw,
        "beforeNodes": nodes,
        "beforeBinding": binding,
        "beforeTranslations": translations,
        "beforeCardStatus": card_status_rows,
        "beforeReviewLog": review_log_rows,
        "beforeReferences": references,
        "translationGuard": (
            "refused-existing-rows" if translations else "no-rows"
        ),
    }


def _row_dict(cursor, row: tuple[Any, ...]) -> dict[str, Any]:
    return {
        description.name: value
        for description, value in zip(cursor.description, row)
    }


def _load_locked_state(cursor, source_entry_key: str) -> dict[str, Any]:
    cursor.execute(
        """
        select
            b.source_entry_key,
            b.source_group_key,
            b.sense_ordinal,
            b.word_entry_id::text as word_entry_id,
            b.content_fingerprint,
            b.content_fingerprint_version,
            b.manifest_checksum,
            b.identity_scheme_version,
            b.binding_state,
            d.slug as dictionary_slug,
            b.reconciliation_decision,
            e.id::text as id,
            e.raw,
            e.headword,
            e.management_kind,
            e.source_lifecycle
        from private.source_entry_bindings b
        join public.word_entries e on e.id = b.word_entry_id
        join public.dictionaries d on d.id = b.dictionary_id
        where b.source_entry_key = %s
          and b.identity_scheme_version = %s
          and b.binding_state = 'active'
          and d.slug = %s
        for update of b, e
        """,
        (
            source_entry_key,
            "vandale-provider-article-v1",
            EXPECTED_DICTIONARY_SLUG,
        ),
    )
    rows = cursor.fetchall()
    if len(rows) != 1:
        raise ReconciliationRefused(
            "approved source entry binding is not exactly one active row"
        )
    row = rows[0]
    binding = {
        key: row[index]
        for index, key in enumerate(
            (
                "source_entry_key",
                "source_group_key",
                "sense_ordinal",
                "word_entry_id",
                "content_fingerprint",
                "content_fingerprint_version",
                "manifest_checksum",
                "identity_scheme_version",
                "binding_state",
                "dictionary_slug",
                "reconciliation_decision",
            )
        )
    }
    entry = {
        key: row[index]
        for index, key in enumerate(
            ("id", "raw", "headword", "management_kind", "source_lifecycle"),
            start=11,
        )
    }

    cursor.execute(
        """
        select id::text, kind, binding_state, source_text_fingerprint,
               diagnostic_locator, parent_content_node_id::text,
               first_source_revision, last_source_revision,
               identity_evidence, reconciliation_decision, source_native_key,
               canonical_source_text, source_order
        from private.platform_v2_content_nodes
        where entry_id = %s
        order by created_at, id
        for update
        """,
        (entry["id"],),
    )
    node_rows = []
    for row in cursor.fetchall():
        node = _row_dict(cursor, row)
        node["sourceText"] = None
        node_rows.append(node)

    node_ids = [node["id"] for node in node_rows]
    cursor.execute(
        """
        select 'feedback_items' as relation, id::text as relation_id,
               target as payload
        from public.feedback_items
        where target->>'entryId' = %s
           or target->>'contentNodeId' = any(%s::text[])
        union all
        select 'diagnostic_envelopes', feedback_item_id::text,
               jsonb_build_object('canonicalPayload', canonical_payload)
        from public.diagnostic_envelopes
        where canonical_payload like any(%s::text[])
        order by relation, relation_id
        """,
        (
            entry["id"],
            node_ids,
            [f"%{node_id}%" for node_id in node_ids],
        ),
    )
    references = [_row_dict(cursor, row) for row in cursor.fetchall()]

    cursor.execute(
        """
        select id::text, word_entry_id::text, target_lang, provider, status,
               overlay, source_fingerprint, source_content_revision,
               translation_policy_version, provider_revision, error_message
        from public.word_entry_translations
        where word_entry_id = %s
        order by id
        for update
        """,
        (entry["id"],),
    )
    translations = [_row_dict(cursor, row) for row in cursor.fetchall()]

    cursor.execute(
        """
        select to_jsonb(s)
        from public.user_card_status s
        where s.entry_id = %s
        order by s.user_id, s.card_type_id
        for update
        """,
        (entry["id"],),
    )
    card_status_rows = [row[0] for row in cursor.fetchall()]

    cursor.execute(
        """
        select to_jsonb(l)
        from public.user_review_log l
        where l.word_id = %s
        order by l.reviewed_at, l.id
        for update
        """,
        (entry["id"],),
    )
    review_log_rows = [row[0] for row in cursor.fetchall()]

    return {
        "entry": entry,
        "binding": binding,
        "nodes": node_rows,
        "translations": translations,
        "cardStatus": card_status_rows,
        "reviewLog": review_log_rows,
        "references": references,
    }


def _node_rows_with_text(
    nodes: list[dict[str, Any]], before_inputs: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    by_locator = {
        node["sourcePath"]: node.get("sourceText") for node in before_inputs
    }
    return [
        {**node, "sourceText": by_locator.get(node["diagnostic_locator"])}
        for node in nodes
    ]


def _write_snapshot(path: Path, plan: dict[str, Any]) -> None:
    if path.exists():
        raise ReconciliationRefused(
            f"snapshot path already exists; refusing to overwrite {path}"
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    snapshot = {
        "issue": ISSUE,
        "snapshotType": "pre-operation",
        "sourceEntryKey": EXPECTED_SOURCE_ENTRY_KEY,
        "entryId": plan["entryId"],
        "manifest": {
            "sourceAudit": EXPECTED_MANIFEST_SHA256,
            "productionBaseline": EXPECTED_PRODUCTION_MANIFEST_SHA256,
            "reconciledPatch": EXPECTED_RECONCILED_MANIFEST_SHA256,
        },
        "binding": plan["beforeBinding"],
        "raw": plan["beforeRaw"],
        "nodes": plan["beforeNodes"],
        "afterNodeEvidence": platform_v2_content_node_inputs(
            _payload_from_plan(plan)
        ),
        "translations": plan["beforeTranslations"],
        "cardStatus": plan["beforeCardStatus"],
        "reviewLog": plan["beforeReviewLog"],
        "references": plan["beforeReferences"],
    }
    snapshot_body = json.dumps(
        snapshot,
        ensure_ascii=False,
        indent=2,
        default=str,
    )
    snapshot["snapshotContentDigest"] = hashlib.sha256(
        snapshot_body.encode("utf-8")
    ).hexdigest()
    payload = json.dumps(
        snapshot,
        ensure_ascii=False,
        indent=2,
        default=str,
    ) + "\n"
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as temporary:
            temporary_path = Path(temporary.name)
            temporary.write(payload)
            temporary.flush()
            os.fsync(temporary.fileno())
        os.chmod(temporary_path, 0o600)
        os.replace(temporary_path, path)
    finally:
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink()


def _load_snapshot(path: Path) -> dict[str, Any]:
    if not path.is_file() or path.is_symlink():
        raise ReconciliationRefused("rollback snapshot must be a regular file")
    snapshot = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(snapshot, dict):
        raise ReconciliationRefused("rollback snapshot is not an object")
    digest = snapshot.get("snapshotContentDigest")
    without_digest = deepcopy(snapshot)
    without_digest.pop("snapshotContentDigest", None)
    expected_digest = hashlib.sha256(
        json.dumps(
            without_digest,
            ensure_ascii=False,
            indent=2,
            default=str,
        ).encode("utf-8")
    ).hexdigest()
    if digest != expected_digest:
        raise ReconciliationRefused("rollback snapshot content digest mismatch")
    if (
        snapshot.get("issue") != ISSUE
        or snapshot.get("snapshotType") != "pre-operation"
        or snapshot.get("sourceEntryKey") != EXPECTED_SOURCE_ENTRY_KEY
    ):
        raise ReconciliationRefused("rollback snapshot is not an approved #341 snapshot")
    if snapshot.get("manifest") != {
        "sourceAudit": EXPECTED_MANIFEST_SHA256,
        "productionBaseline": EXPECTED_PRODUCTION_MANIFEST_SHA256,
        "reconciledPatch": EXPECTED_RECONCILED_MANIFEST_SHA256,
    }:
        raise ReconciliationRefused("rollback snapshot manifest provenance differs")
    required = (
        "entryId",
        "binding",
        "raw",
        "nodes",
        "translations",
        "cardStatus",
        "reviewLog",
        "references",
        "afterNodeEvidence",
    )
    if any(field not in snapshot for field in required):
        raise ReconciliationRefused("rollback snapshot is incomplete")
    return snapshot


def _restore_snapshot_nodes(cursor, snapshot: dict[str, Any]) -> None:
    for node in snapshot["nodes"]:
        cursor.execute(
            """
            update private.platform_v2_content_nodes
            set kind = %s,
                binding_state = %s,
                source_text_fingerprint = %s,
                diagnostic_locator = %s,
                parent_content_node_id = %s::uuid,
                first_source_revision = %s,
                last_source_revision = %s,
                identity_evidence = %s::jsonb,
                reconciliation_decision = %s::jsonb,
                updated_at = now()
            where id = %s::uuid
              and entry_id = %s::uuid
            """,
            (
                node["kind"],
                node["binding_state"],
                node["source_text_fingerprint"],
                node["diagnostic_locator"],
                node["parent_content_node_id"],
                node["first_source_revision"],
                node["last_source_revision"],
                psycopg2.extras.Json(node["identity_evidence"]),
                psycopg2.extras.Json(node["reconciliation_decision"]),
                node["id"],
                snapshot["entryId"],
            ),
        )
        if cursor.rowcount != 1:
            raise ReconciliationRefused(
                f"rollback node {node['id']} is missing or belongs to another entry"
            )


def _node_provenance_signature(node: dict[str, Any]) -> tuple[str, str, str]:
    return (
        node["kind"],
        node["diagnostic_locator"],
        node["source_text_fingerprint"],
    )


def _expected_after_signature(node: dict[str, Any]) -> tuple[str, str, str]:
    return (
        node["kind"],
        node["sourcePath"],
        node["sourceTextFingerprint"],
    )


def _node_input_projection(
    nodes: list[dict[str, Any]],
) -> dict[tuple[str, str, str], tuple[str, int]]:
    projection = {
        _expected_after_signature(node): (node["sourceText"], index)
        for index, node in enumerate(nodes, start=1)
    }
    if len(projection) != len(nodes):
        raise ReconciliationRefused("rollback snapshot has duplicate node evidence")
    return projection


def _assert_rollback_node_inventory(
    snapshot: dict[str, Any], state: dict[str, Any]
) -> None:
    """Refuse rollback unless the complete #341 post-apply node set is intact."""
    before_nodes = snapshot["nodes"]
    current_nodes = state["nodes"]
    before_payload = deepcopy(snapshot["raw"])
    before_payload.setdefault(
        "_source",
        {
            "source_entry_key": EXPECTED_SOURCE_ENTRY_KEY,
            "source_group_key": EXPECTED_SOURCE_GROUP_KEY,
        },
    )
    before_projection = _node_input_projection(
        platform_v2_content_node_inputs(before_payload)
    )
    after_projection = _node_input_projection(snapshot["afterNodeEvidence"])
    before_ids = {node["id"] for node in before_nodes}
    current_ids = {node["id"] for node in current_nodes}
    if len(before_ids) != len(before_nodes) or len(current_ids) != len(current_nodes):
        raise ReconciliationRefused("rollback node inventory contains duplicate IDs")
    if not before_ids.issubset(current_ids):
        raise ReconciliationRefused("rollback original node is missing")

    old_idiom_ids = {
        node["id"]
        for node in before_nodes
        if node["binding_state"] == "active" and node["kind"] == "idiom"
    }
    current_by_id = {node["id"]: node for node in current_nodes}
    provenance_fields = (
        "kind",
        "source_text_fingerprint",
        "diagnostic_locator",
        "parent_content_node_id",
        "first_source_revision",
        "identity_evidence",
    )
    for before_node in before_nodes:
        current_node = current_by_id[before_node["id"]]
        expected_state = (
            "retired"
            if before_node["id"] in old_idiom_ids
            else before_node["binding_state"]
        )
        if current_node["binding_state"] != expected_state:
            raise ReconciliationRefused(
                "live original node state differs from the committed #341 result"
            )
        if current_node.get("last_source_revision") != EXPECTED_RECONCILED_MANIFEST_SHA256:
            raise ReconciliationRefused(
                "live original node revision differs from the committed #341 result"
            )
        expected_decision = {
            "decision": "retire-missing"
            if before_node["id"] in old_idiom_ids
            else "preserve-unambiguous-fingerprint"
        }
        if current_node.get("reconciliation_decision") != expected_decision:
            raise ReconciliationRefused(
                "live original node decision differs from the committed #341 result"
            )
        if any(
            current_node.get(field) != before_node.get(field)
            for field in provenance_fields
        ):
            raise ReconciliationRefused(
                "live original node provenance differs from the committed #341 result"
            )
        signature = _node_provenance_signature(current_node)
        expected_projection = (
            before_projection[signature]
            if before_node["id"] in old_idiom_ids
            else after_projection[signature]
        )
        if (
            current_node.get("source_native_key") is not None
            or current_node.get("canonical_source_text") != expected_projection[0]
            or current_node.get("source_order") != expected_projection[1]
        ):
            raise ReconciliationRefused(
                "live original node projection differs from the committed #341 result"
            )

    expected_after = set(after_projection)
    before_active = {
        _node_provenance_signature(node)
        for node in before_nodes
        if node["binding_state"] == "active"
    }
    expected_new = expected_after - before_active
    if len(current_nodes) != len(before_nodes) + len(expected_new):
        raise ReconciliationRefused(
            "live node inventory differs from the committed #341 result"
        )

    new_nodes = [node for node in current_nodes if node["id"] not in before_ids]
    if len(new_nodes) != len(expected_new):
        raise ReconciliationRefused(
            "live rollback node inventory has an unexpected generated node"
        )
    if any(node["binding_state"] != "active" for node in new_nodes):
        raise ReconciliationRefused(
            "live rollback node inventory has an unexpected retired generated node"
        )
    if any(
        node.get("first_source_revision") != EXPECTED_RECONCILED_MANIFEST_SHA256
        or node.get("last_source_revision") != EXPECTED_RECONCILED_MANIFEST_SHA256
        or node.get("parent_content_node_id") is not None
        or node.get("identity_evidence")
        != {"sourceTextFingerprint": node["source_text_fingerprint"]}
        or node.get("reconciliation_decision") != {"decision": "new-unmatched"}
        for node in new_nodes
    ):
        raise ReconciliationRefused(
            "live generated node provenance differs from the committed #341 result"
        )
    if any(
        node.get("source_native_key") is not None
        or node.get("canonical_source_text")
        != after_projection[_node_provenance_signature(node)][0]
        or node.get("source_order")
        != after_projection[_node_provenance_signature(node)][1]
        for node in new_nodes
    ):
        raise ReconciliationRefused(
            "live generated node projection differs from the committed #341 result"
        )
    if {_node_provenance_signature(node) for node in new_nodes} != expected_new:
        raise ReconciliationRefused(
            "live generated node set differs from the committed #341 result"
        )


def _rollback_snapshot(database_url: str, snapshot_path: Path) -> dict[str, Any]:
    snapshot = _load_snapshot(snapshot_path)
    with psycopg2.connect(database_url) as connection:
        connection.set_session(isolation_level="SERIALIZABLE")
        with connection.cursor() as cursor:
            state = _load_locked_state(cursor, EXPECTED_SOURCE_ENTRY_KEY)
            binding = state["binding"]
            if (
                state["entry"]["id"] != snapshot["entryId"]
                or binding["content_fingerprint"]
                != EXPECTED_AFTER_SEMANTIC_FINGERPRINT
                or binding["manifest_checksum"]
                != EXPECTED_RECONCILED_MANIFEST_SHA256
                or state["entry"]["raw"] == snapshot["raw"]
            ):
                raise ReconciliationRefused(
                    "live state is not the committed #341 result; refusing rollback"
                )
            before_binding = snapshot["binding"]
            for field in (
                "source_entry_key",
                "source_group_key",
                "sense_ordinal",
                "word_entry_id",
                "content_fingerprint_version",
                "identity_scheme_version",
                "binding_state",
                "dictionary_slug",
            ):
                if binding[field] != before_binding[field]:
                    raise ReconciliationRefused(
                        f"binding identity field {field} changed; refusing rollback"
                    )
            for field in ("cardStatus", "reviewLog", "translations", "references"):
                if state[field] != snapshot[field]:
                    raise ReconciliationRefused(
                        f"{field} changed after #341; refusing rollback"
                    )
            _assert_rollback_node_inventory(snapshot, state)
            expected_after_nodes = {
                _expected_after_signature(node)
                for node in snapshot["afterNodeEvidence"]
            }
            active_nodes = [
                node for node in state["nodes"] if node["binding_state"] == "active"
            ]
            actual_after_nodes = {
                _node_provenance_signature(node) for node in active_nodes
            }
            if (
                len(active_nodes) != len(expected_after_nodes)
                or actual_after_nodes != expected_after_nodes
            ):
                raise ReconciliationRefused(
                    "live content nodes differ from the committed #341 result"
                )
            cursor.execute(
                """
                update public.word_entries
                set raw = %s::jsonb
                where id = %s::uuid
                """,
                (psycopg2.extras.Json(snapshot["raw"]), snapshot["entryId"]),
            )
            if cursor.rowcount != 1:
                raise ReconciliationRefused("rollback entry update affected unexpected rows")

            cursor.execute(
                """
                update private.source_entry_bindings
                set manifest_checksum = %s,
                    content_fingerprint = %s,
                    reconciliation_decision = %s::jsonb,
                    updated_at = now()
                where source_entry_key = %s
                  and word_entry_id = %s::uuid
                  and content_fingerprint = %s
                  and manifest_checksum = %s
                """,
                (
                    before_binding["manifest_checksum"],
                    before_binding["content_fingerprint"],
                    psycopg2.extras.Json(before_binding["reconciliation_decision"]),
                    EXPECTED_SOURCE_ENTRY_KEY,
                    snapshot["entryId"],
                    EXPECTED_AFTER_SEMANTIC_FINGERPRINT,
                    EXPECTED_RECONCILED_MANIFEST_SHA256,
                ),
            )
            if cursor.rowcount != 1:
                raise ReconciliationRefused(
                    "rollback binding update affected unexpected rows"
                )

            _restore_snapshot_nodes(cursor, snapshot)
            cursor.execute(
                """
                select private.reconcile_platform_v2_content_nodes(
                    %s::uuid, %s, %s::jsonb
                )
                """,
                (
                    snapshot["entryId"],
                    before_binding["manifest_checksum"],
                    psycopg2.extras.Json(
                        platform_v2_content_node_inputs(
                            {
                                **snapshot["raw"],
                                "_source": {
                                    "source_entry_key": EXPECTED_SOURCE_ENTRY_KEY,
                                    "source_group_key": EXPECTED_SOURCE_GROUP_KEY,
                                },
                            }
                        )
                    ),
                ),
            )
            rpc_result = cursor.fetchone()[0]

            cursor.execute(
                """
                select id::text, kind, binding_state, source_text_fingerprint,
                       diagnostic_locator, parent_content_node_id::text
                from private.platform_v2_content_nodes
                where entry_id = %s::uuid
                order by id
                """,
                (snapshot["entryId"],),
            )
            after_nodes = cursor.fetchall()
            expected_active_ids = {
                node["id"]
                for node in snapshot["nodes"]
                if node["binding_state"] == "active"
            }
            actual_active_ids = {node[0] for node in after_nodes if node[2] == "active"}
            if actual_active_ids != expected_active_ids:
                raise ReconciliationRefused(
                    "rollback did not restore the original active node IDs"
                )
            if rpc_result is None or not isinstance(rpc_result, dict):
                raise ReconciliationRefused("rollback content-node RPC returned no audit result")

            cursor.execute(
                "select raw from public.word_entries where id = %s::uuid",
                (snapshot["entryId"],),
            )
            if cursor.fetchone()[0] != snapshot["raw"]:
                raise ReconciliationRefused("rollback raw payload verification failed")
            connection.commit()
            return {
                "issue": ISSUE,
                "rolledBack": True,
                "entryId": snapshot["entryId"],
                "sourceEntryKey": EXPECTED_SOURCE_ENTRY_KEY,
                "restoredNodeIds": sorted(expected_active_ids),
                "snapshotDigest": snapshot["snapshotContentDigest"],
                "rpcResult": rpc_result,
            }


def _summary(plan: dict[str, Any], *, applied: bool) -> dict[str, Any]:
    return {
        "issue": ISSUE,
        "applied": applied,
        "manifestSha256": plan["manifestSha256"],
        "manifestProvenance": {
            "sourceAudit": EXPECTED_MANIFEST_SHA256,
            "productionBaseline": EXPECTED_PRODUCTION_MANIFEST_SHA256,
            "reconciledPatch": EXPECTED_RECONCILED_MANIFEST_SHA256,
        },
        "artifactPath": plan["artifactPath"],
        "sourceEntryKey": plan["sourceEntryKey"],
        "entryId": plan["entryId"],
        "beforeSemanticFingerprint": plan["beforeSemanticFingerprint"],
        "afterSemanticFingerprint": plan["afterSemanticFingerprint"],
        "translationRowCount": plan["translationRowCount"],
        "translationBindings": plan["translationBindings"],
        "cardStatusRowCount": plan["cardStatusRowCount"],
        "reviewLogRowCount": plan["reviewLogRowCount"],
        "referenceCount": plan["referenceCount"],
        "beforeNodeCount": plan["beforeNodeCount"],
        "afterNodeCount": plan["afterNodeCount"],
        "transitions": plan["transitions"],
    }


def run(data_dir: Path, database_url: str, *, apply: bool, snapshot_path: Path | None):
    manifest, artifact = _artifact_by_key(data_dir)
    with psycopg2.connect(database_url) as connection:
        connection.set_session(isolation_level="SERIALIZABLE")
        with connection.cursor() as cursor:
            corrected_payload = _corrected_payload(artifact)
            _assert_manifest_scope(cursor, manifest, corrected_payload)
            state = _load_locked_state(cursor, EXPECTED_SOURCE_ENTRY_KEY)
            before_inputs = platform_v2_content_node_inputs(artifact.payload)
            state["nodes"] = _node_rows_with_text(state["nodes"], before_inputs)
            plan = build_reconciliation_plan(
                artifact=artifact,
                entry=state["entry"],
                binding=state["binding"],
                nodes=state["nodes"],
                translations=state["translations"],
                card_status_rows=state["cardStatus"],
                review_log_rows=state["reviewLog"],
                references=state["references"],
            )
            if snapshot_path is not None:
                _write_snapshot(snapshot_path, plan)
            if plan["referenceCount"]:
                connection.rollback()
                return _summary(plan, applied=False) | {
                    "refused": "node references exist; explicit reference migration required"
                }
            if plan["translationRowCount"]:
                connection.rollback()
                return _summary(plan, applied=False) | {
                    "refused": "translation rows exist; explicit path migration required"
                }
            if not apply:
                connection.rollback()
                return _summary(plan, applied=False)

            if snapshot_path is None:
                raise ReconciliationRefused(
                    "--apply requires --snapshot-path for the pre-operation snapshot"
                )

            cursor.execute(
                """
                update public.word_entries
                set raw = %s::jsonb
                where id = %s::uuid
                """,
                (psycopg2.extras.Json(plan["afterRaw"]), plan["entryId"]),
            )
            if cursor.rowcount != 1:
                raise ReconciliationRefused("entry update affected unexpected row count")

            cursor.execute(
                """
                update private.source_entry_bindings
                set manifest_checksum = %s,
                    content_fingerprint = %s,
                    reconciliation_decision =
                        coalesce(reconciliation_decision, '{}'::jsonb)
                        || jsonb_build_object(
                            'issue', %s,
                            'decision', 'targeted-content-reconciliation',
                            'sourceRevision', %s
                        ),
                    updated_at = now()
                where source_entry_key = %s
                  and word_entry_id = %s::uuid
                  and content_fingerprint = %s
                """,
                (
                    EXPECTED_RECONCILED_MANIFEST_SHA256,
                    plan["afterSemanticFingerprint"],
                    ISSUE,
                    EXPECTED_RECONCILED_MANIFEST_SHA256,
                    EXPECTED_SOURCE_ENTRY_KEY,
                    plan["entryId"],
                    EXPECTED_BEFORE_SEMANTIC_FINGERPRINT,
                ),
            )
            if cursor.rowcount != 1:
                raise ReconciliationRefused(
                    "binding update affected unexpected row count"
                )

            cursor.execute(
                """
                select private.reconcile_platform_v2_content_nodes(
                    %s::uuid, %s, %s::jsonb
                )
                """,
                (
                    plan["entryId"],
                    EXPECTED_RECONCILED_MANIFEST_SHA256,
                    psycopg2.extras.Json(
                        platform_v2_content_node_inputs(
                            _payload_from_plan(plan)
                        )
                    ),
                ),
            )
            rpc_result = cursor.fetchone()[0]
            after_nodes = _verify_after_apply(cursor, plan, rpc_result)
            connection.commit()
            return _summary(plan, applied=True) | {
                "rpcResult": rpc_result,
                "afterNodes": after_nodes,
            }


def _payload_from_plan(plan: dict[str, Any]) -> dict[str, Any]:
    payload = deepcopy(plan["afterRaw"])
    payload["_source"] = {
        "source_entry_key": EXPECTED_SOURCE_ENTRY_KEY,
        "source_group_key": EXPECTED_SOURCE_GROUP_KEY,
    }
    return payload


def _verify_after_apply(cursor, plan: dict[str, Any], rpc_result: Any) -> list[dict[str, Any]]:
    cursor.execute(
        "select raw from public.word_entries where id = %s::uuid",
        (plan["entryId"],),
    )
    if cursor.fetchone()[0] != plan["afterRaw"]:
        raise ReconciliationRefused("post-write raw payload verification failed")

    cursor.execute(
        """
        select b.content_fingerprint, b.manifest_checksum,
               b.word_entry_id::text, b.source_entry_key,
               b.source_group_key, b.sense_ordinal,
               b.content_fingerprint_version, b.identity_scheme_version,
               b.binding_state, d.slug
        from private.source_entry_bindings b
        join public.dictionaries d on d.id = b.dictionary_id
        where b.source_entry_key = %s
        """,
        (EXPECTED_SOURCE_ENTRY_KEY,),
    )
    binding = cursor.fetchone()
    before_binding = plan["beforeBinding"]
    if binding is None or binding[0:6] != (
        plan["afterSemanticFingerprint"],
        EXPECTED_RECONCILED_MANIFEST_SHA256,
        plan["entryId"],
        EXPECTED_SOURCE_ENTRY_KEY,
        EXPECTED_SOURCE_GROUP_KEY,
        EXPECTED_SENSE_ORDINAL,
    ) or binding[6:] != (
        before_binding["content_fingerprint_version"],
        before_binding["identity_scheme_version"],
        before_binding["binding_state"],
        before_binding["dictionary_slug"],
    ):
        raise ReconciliationRefused("post-write source binding verification failed")

    cursor.execute(
        """
        select id::text, kind, binding_state, source_text_fingerprint,
               diagnostic_locator
        from private.platform_v2_content_nodes
        where entry_id = %s::uuid
        order by id
        """,
        (plan["entryId"],),
    )
    after_nodes = cursor.fetchall()
    active = [node for node in after_nodes if node[2] == "active"]
    if len(active) != plan["afterNodeCount"]:
        raise ReconciliationRefused("post-write active node count changed unexpectedly")
    if sum(node[1] == "idiom" and node[2] == "active" for node in after_nodes) != 0:
        raise ReconciliationRefused("old idiom node remained active")
    if sum(node[1] == "example" and node[2] == "active" for node in after_nodes) != 2:
        raise ReconciliationRefused("expected example node count was not produced")
    expected_after_nodes = {
        (
            node["kind"],
            node["sourcePath"],
            node["sourceTextFingerprint"],
        )
        for node in platform_v2_content_node_inputs(_payload_from_plan(plan))
    }
    actual_after_nodes = {
        (node[1], node[4], node[3])
        for node in active
    }
    if actual_after_nodes != expected_after_nodes:
        raise ReconciliationRefused("post-write active node set does not match corrected payload")
    node_by_id = {node[0]: node for node in after_nodes}
    for transition in plan["transitions"]:
        old_node = node_by_id.get(transition["oldNodeId"])
        if old_node is None or old_node[2] != "retired":
            raise ReconciliationRefused("old node was not retired as expected")
    if rpc_result is None or not isinstance(rpc_result, dict):
        raise ReconciliationRefused("content-node RPC returned no audit result")

    cursor.execute(
        """
        select count(*)
        from public.word_entry_translations
        where word_entry_id = %s::uuid
        """,
        (plan["entryId"],),
    )
    if cursor.fetchone()[0] != plan["translationRowCount"]:
        raise ReconciliationRefused("translation row count changed")

    cursor.execute(
        """
        select to_jsonb(s)
        from public.user_card_status s
        where s.entry_id = %s::uuid
        order by s.user_id, s.card_type_id
        """,
        (plan["entryId"],),
    )
    after_card_status = [row[0] for row in cursor.fetchall()]
    if after_card_status != plan["beforeCardStatus"]:
        raise ReconciliationRefused(
            "learner card state changed during reconciliation"
        )
    cursor.execute(
        """
        select to_jsonb(l)
        from public.user_review_log l
        where l.word_id = %s::uuid
        order by l.reviewed_at, l.id
        """,
        (plan["entryId"],),
    )
    after_review_log = [row[0] for row in cursor.fetchall()]
    if after_review_log != plan["beforeReviewLog"]:
        raise ReconciliationRefused(
            "review history changed during reconciliation"
        )
    return [
        {
            "id": node[0],
            "kind": node[1],
            "bindingState": node[2],
            "sourceTextFingerprint": node[3],
            "sourcePath": node[4],
        }
        for node in after_nodes
    ]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path)
    parser.add_argument(
        "--database-url",
        default=os.environ.get("SUPABASE_DB_URL")
        or os.environ.get("DATABASE_URL"),
    )
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--snapshot-path", type=Path)
    parser.add_argument("--rollback-snapshot", type=Path)
    args = parser.parse_args()
    if not args.database_url:
        parser.error("--database-url or SUPABASE_DB_URL/DATABASE_URL is required")
    if args.apply and args.rollback_snapshot:
        parser.error("--apply and --rollback-snapshot are mutually exclusive")
    if args.rollback_snapshot and args.snapshot_path:
        parser.error("--snapshot-path is not used with --rollback-snapshot")
    if not args.data_dir and not args.rollback_snapshot:
        parser.error("--data-dir is required unless --rollback-snapshot is used")
    if args.apply and args.snapshot_path is None:
        parser.error("--apply requires --snapshot-path")

    try:
        if args.rollback_snapshot:
            report = _rollback_snapshot(args.database_url, args.rollback_snapshot)
        else:
            report = run(
                args.data_dir,
                args.database_url,
                apply=args.apply,
                snapshot_path=args.snapshot_path,
            )
    except ReconciliationRefused as error:
        print(
            json.dumps(
                {"issue": ISSUE, "applied": False, "refused": str(error)},
                ensure_ascii=False,
                indent=2,
            )
        )
        raise SystemExit(2) from error
    print(json.dumps(report, ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()
