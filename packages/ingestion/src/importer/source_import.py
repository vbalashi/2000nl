from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
from typing import Optional
from uuid import uuid4

import psycopg2
import psycopg2.extras

from importer.db import (
    ensure_dictionary,
    ensure_language,
    ensure_word_list,
    refresh_dictionary_search_documents,
)
from importer.dictionary_entry_parser import parse_dictionary_file
from importer.reconciliation import load_reconciliation_plan
from importer.source_manifest import (
    SourceArtifact,
    load_source_manifest,
    platform_v2_content_node_inputs,
    semantic_content_fingerprint,
    stored_raw_fingerprint,
)


@dataclass
class SourceImportStats:
    total_files: int
    matched: int = 0
    inserted: int = 0
    changed: int = 0
    retired: int = 0
    ambiguous: int = 0
    rejected: int = 0
    nt2_linked: int = 0
    nt2_skipped: int = 0
    processed: int = 0
    no_op: bool = False
    run_id: Optional[str] = None

    @property
    def updated(self) -> int:
        return self.changed


def _uuid_set_checksum(values: set[str]) -> str:
    canonical = "\n".join(sorted(values)).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()


def _ordinal_independent_fingerprint(payload: dict) -> str:
    content = dict(payload)
    content.pop("meaning_id", None)
    return semantic_content_fingerprint(content)


def _verify_source_schema(cursor) -> None:
    cursor.execute(
        """
        select
            to_regclass('private.dictionary_import_runs'),
            to_regclass('private.source_entry_bindings'),
            to_regclass('private.platform_v2_headword_groups'),
            to_regclass('private.platform_v2_content_nodes'),
            to_regprocedure(
                'private.reconcile_platform_v2_content_nodes(uuid,text,jsonb)'
            ),
            (
                select count(*) = 2
                from information_schema.columns
                where table_schema = 'private'
                  and table_name = 'platform_v2_content_nodes'
                  and column_name in ('canonical_source_text', 'source_order')
            ),
            exists (
                select 1
                from information_schema.columns
                where table_schema = 'public'
                  and table_name = 'word_entries'
                  and column_name = 'management_kind'
            )
        """
    )
    (
        import_runs,
        bindings,
        headword_groups,
        content_nodes,
        reconcile_nodes,
        report_atom_columns,
        management_column,
    ) = cursor.fetchone()
    if (
        import_runs is None
        or bindings is None
        or headword_groups is None
        or content_nodes is None
        or reconcile_nodes is None
        or not report_atom_columns
        or not management_column
    ):
        raise RuntimeError(
            "Platform V2 identity migrations 102, 105, 106, and 120 are not applied"
        )


def _load_active_bindings(cursor, dictionary_id: str, scheme: str):
    cursor.execute(
        """
        select source_entry_key, word_entry_id::text,
               source_group_key, sense_ordinal,
               content_fingerprint_version, content_fingerprint,
               manifest_checksum
        from private.source_entry_bindings
        where dictionary_id = %s
          and identity_scheme_version = %s
          and binding_state = 'active'
        """,
        (dictionary_id, scheme),
    )
    return {
        row[0]: {
            "word_entry_id": row[1],
            "source_group_key": row[2],
            "sense_ordinal": row[3],
            "content_fingerprint_version": row[4],
            "content_fingerprint": row[5],
            "manifest_checksum": row[6],
        }
        for row in cursor.fetchall()
    }


def _load_source_rows(cursor, dictionary_id: str):
    cursor.execute(
        """
        select id::text, raw
        from public.word_entries
        where dictionary_id = %s
          and management_kind = 'source'
          and source_lifecycle = 'active'
        """,
        (dictionary_id,),
    )
    return {row[0]: row[1] for row in cursor.fetchall()}


def _completed_manifest_is_noop(
    cursor,
    *,
    dictionary_id: str,
    manifest,
) -> bool:
    cursor.execute(
        """
        select id::text
        from private.dictionary_import_runs
        where dictionary_id = %s
          and identity_scheme_version = %s
          and manifest_checksum = %s
          and status = 'completed'
        order by finished_at desc nulls last
        limit 1
        """,
        (
            dictionary_id,
            manifest.identity_scheme_version,
            manifest.manifest_sha256,
        ),
    )
    completed = cursor.fetchone()
    if completed is None:
        return False

    bindings = _load_active_bindings(
        cursor,
        dictionary_id,
        manifest.identity_scheme_version,
    )
    expected = {
        artifact.source_entry_key: artifact.content_fingerprint
        for artifact in manifest.artifacts
    }
    artifacts_by_key = {
        artifact.source_entry_key: artifact
        for artifact in manifest.artifacts
    }
    if set(bindings) != set(expected):
        raise RuntimeError(
            "Completed manifest exists but active binding coverage differs"
        )

    for source_entry_key, content_fingerprint in expected.items():
        binding = bindings[source_entry_key]
        if (
            binding["manifest_checksum"] != manifest.manifest_sha256
            or binding["content_fingerprint_version"]
            != artifacts_by_key[source_entry_key].fingerprint_version
            or binding["content_fingerprint"] != content_fingerprint
        ):
            raise RuntimeError(
                "Completed manifest exists but active bindings do not match it"
            )

    word_entry_ids = [
        binding["word_entry_id"]
        for binding in bindings.values()
    ]
    cursor.execute(
        """
        select id::text, raw
        from public.word_entries
        where dictionary_id = %s
          and management_kind = 'source'
          and source_lifecycle = 'active'
        """,
        (dictionary_id,),
    )
    active_rows = {row[0]: row[1] for row in cursor.fetchall()}
    if set(active_rows) != set(word_entry_ids):
        raise RuntimeError(
            "Completed manifest exists but active source rows and bindings "
            "do not have exact coverage"
        )

    for source_entry_key, binding in bindings.items():
        actual_fingerprint = stored_raw_fingerprint(
            active_rows[binding["word_entry_id"]]
        )
        artifact = artifacts_by_key[source_entry_key]
        if actual_fingerprint != stored_raw_fingerprint(artifact.payload):
            raise RuntimeError(
                "Completed manifest exists but stored source content drifted"
            )

    cursor.execute(
        """
        select entry_id::text, kind, source_text_fingerprint,
               canonical_source_text, source_order
        from private.platform_v2_content_nodes
        where entry_id = any(%s::uuid[])
          and binding_state = 'active'
        """,
        (word_entry_ids,),
    )
    actual_nodes: dict[
        str,
        list[tuple[str, str, str | None, int | None]],
    ] = {}
    for (
        entry_id,
        kind,
        fingerprint,
        source_text,
        source_order,
    ) in cursor.fetchall():
        actual_nodes.setdefault(entry_id, []).append(
            (kind, fingerprint, source_text, source_order)
        )
    for source_entry_key, artifact in artifacts_by_key.items():
        entry_id = bindings[source_entry_key]["word_entry_id"]
        expected_nodes = [
            (
                node["kind"],
                node["sourceTextFingerprint"],
                node["sourceText"],
                source_order,
            )
            for source_order, node in enumerate(
                platform_v2_content_node_inputs(artifact.payload),
                start=1,
            )
        ]
        actual_entry_nodes = actual_nodes.get(entry_id, [])
        if (
            len(actual_entry_nodes) != len(expected_nodes)
            or set(actual_entry_nodes) != set(expected_nodes)
        ):
            return False
    return True


def _artifact_row(
    artifact: SourceArtifact,
    *,
    word_entry_id: str,
    dictionary_id: str,
    language_code: str,
):
    entry = parse_dictionary_file(artifact.path)
    if entry.source_entry_key != artifact.source_entry_key:
        raise ValueError(
            f"{artifact.artifact_path} parsed source identity mismatch"
        )
    return {
        "id": word_entry_id,
        "dictionary_id": dictionary_id,
        "language_code": language_code,
        "headword": entry.headword,
        "meaning_id": entry.meaning_id,
        "part_of_speech": entry.part_of_speech,
        "gender": entry.gender,
        "is_nt2_2000": entry.is_nt2_2000,
        "vandale_id": entry.vandale_id,
        "raw": entry.raw,
        "normalized_pos_status": (
            entry.normalized_pos_status or "unresolved"
        ),
    }


def _bulk_update_entries(cursor, rows) -> None:
    if not rows:
        return
    psycopg2.extras.execute_values(
        cursor,
        """
        update public.word_entries as target
        set dictionary_id = source.dictionary_id::uuid,
            language_code = source.language_code,
            headword = source.headword,
            meaning_id = source.meaning_id,
            part_of_speech = source.part_of_speech,
            gender = source.gender,
            is_nt2_2000 = source.is_nt2_2000,
            vandale_id = source.vandale_id::integer,
            raw = source.raw::jsonb,
            management_kind = 'source',
            source_lifecycle = 'active',
            normalized_pos_status = source.normalized_pos_status
        from (values %s) as source (
            id, dictionary_id, language_code, headword, meaning_id,
            part_of_speech, gender, is_nt2_2000, vandale_id, raw,
            normalized_pos_status
        )
        where target.id = source.id::uuid
        """,
        [
            (
                row["id"],
                row["dictionary_id"],
                row["language_code"],
                row["headword"],
                row["meaning_id"],
                row["part_of_speech"],
                row["gender"],
                row["is_nt2_2000"],
                row["vandale_id"],
                psycopg2.extras.Json(row["raw"]),
                row["normalized_pos_status"],
            )
            for row in rows
        ],
        page_size=500,
    )


def _bulk_insert_entries(cursor, rows) -> None:
    if not rows:
        return
    psycopg2.extras.execute_values(
        cursor,
        """
        insert into public.word_entries (
            id, dictionary_id, language_code, headword, meaning_id,
            part_of_speech, gender, is_nt2_2000, vandale_id, raw,
            management_kind, source_lifecycle, normalized_pos_status
        )
        values %s
        """,
        [
            (
                row["id"],
                row["dictionary_id"],
                row["language_code"],
                row["headword"],
                row["meaning_id"],
                row["part_of_speech"],
                row["gender"],
                row["is_nt2_2000"],
                row["vandale_id"],
                psycopg2.extras.Json(row["raw"]),
                "source",
                "active",
                row["normalized_pos_status"],
            )
            for row in rows
        ],
        page_size=500,
    )


def import_source_manifest(
    *,
    data_dir: Path | str,
    database_url: str,
    reconciliation_plan: Path | str | None = None,
    language_code: str = "nl",
    language_name: str = "Dutch",
    dictionary_slug: str = "nl-vandale",
    dictionary_name: str = "VanDale Dutch",
    dictionary_description: Optional[str] = None,
    dictionary_schema_key: str = "nl-vandale-v2",
    dictionary_schema_version: int = 1,
    nt2_slug: str = "nt2-2000",
    nt2_name: str = "VanDale 2k",
    nt2_description: Optional[str] = "Core 2000 woorden voor NT2",
    actor: str = "vandale-source-importer",
    reason: str = "Approved versioned source manifest import",
    refresh_search_documents: bool = False,
) -> SourceImportStats:
    manifest = load_source_manifest(data_dir)
    stats = SourceImportStats(total_files=len(manifest.artifacts))
    connection = psycopg2.connect(database_url)

    with connection as conn:
        with conn.cursor() as cursor:
            _verify_source_schema(cursor)
            cursor.execute(
                """
                select id::text
                from public.dictionaries
                where language_code = %s
                  and slug = %s
                """,
                (language_code, dictionary_slug),
            )
            existing_dictionary = cursor.fetchone()
            if existing_dictionary is not None and _completed_manifest_is_noop(
                cursor,
                dictionary_id=existing_dictionary[0],
                manifest=manifest,
            ):
                stats.matched = len(manifest.artifacts)
                stats.processed = len(manifest.artifacts)
                stats.no_op = True
                return stats

            ensure_language(cursor, language_code, language_name)
            dictionary_id = ensure_dictionary(
                cursor,
                language_code,
                dictionary_slug,
                dictionary_name,
                dictionary_description,
                dictionary_schema_key,
                dictionary_schema_version,
            )
            list_id = ensure_word_list(
                cursor,
                language_code,
                nt2_slug,
                nt2_name,
                nt2_description,
                True,
            )

            active_bindings = _load_active_bindings(
                cursor,
                dictionary_id,
                manifest.identity_scheme_version,
            )
            source_rows = _load_source_rows(cursor, dictionary_id)
            artifacts_by_key = {
                artifact.source_entry_key: artifact
                for artifact in manifest.artifacts
            }

            plan = None
            if not active_bindings and source_rows:
                if reconciliation_plan is None:
                    raise RuntimeError(
                        "Existing source rows require an approved "
                        "reconciliation plan"
                    )
                plan = load_reconciliation_plan(
                    reconciliation_plan,
                    manifest_sha256=manifest.manifest_sha256,
                    identity_scheme_version=manifest.identity_scheme_version,
                    dictionary_slug=dictionary_slug,
                    source_entry_keys=set(artifacts_by_key),
                )
                if plan.existing_uuid_set_sha256 != _uuid_set_checksum(
                    set(source_rows)
                ):
                    raise RuntimeError(
                        "Existing UUID set changed after reconciliation"
                    )
                planned_existing_ids = {
                    decision.word_entry_id
                    for decision in plan.decisions.values()
                    if decision.action == "bind-existing"
                }
                if planned_existing_ids != set(source_rows):
                    raise RuntimeError(
                        "Reconciliation plan does not account for every "
                        "existing source UUID"
                    )
                for decision in plan.decisions.values():
                    if decision.action != "bind-existing":
                        continue
                    current_raw = source_rows[decision.word_entry_id]
                    if (
                        stored_raw_fingerprint(current_raw)
                        != decision.expected_raw_fingerprint
                    ):
                        raise RuntimeError(
                            f"Stored entry changed after reconciliation: "
                            f"{decision.word_entry_id}"
                        )
            elif active_bindings:
                bound_word_ids = {
                    binding["word_entry_id"]
                    for binding in active_bindings.values()
                }
                if set(source_rows) != bound_word_ids:
                    raise RuntimeError(
                        "Active source rows and bindings do not have exact "
                        "coverage"
                    )
                missing = set(active_bindings) - set(artifacts_by_key)
                added = set(artifacts_by_key) - set(active_bindings)
                if missing or added:
                    raise RuntimeError(
                        "Manifest changes source membership; prepare an "
                        "explicit add/retire reconciliation plan"
                    )
                if reconciliation_plan is not None:
                    raise RuntimeError(
                        "Post-binding reconciliation plans are not implemented"
                    )
                changed_identity_groups = {
                    artifact.source_group_key
                    for artifact in manifest.artifacts
                    if (
                        active_bindings[
                            artifact.source_entry_key
                        ]["source_group_key"]
                        != artifact.source_group_key
                        or active_bindings[
                            artifact.source_entry_key
                        ]["sense_ordinal"]
                        != artifact.sense_ordinal
                    )
                }
                previous_fingerprints_by_group = {}
                for source_entry_key, binding in active_bindings.items():
                    previous_fingerprints_by_group.setdefault(
                        binding["source_group_key"],
                        {},
                    ).setdefault(
                        _ordinal_independent_fingerprint(
                            source_rows[binding["word_entry_id"]]
                        ),
                        set(),
                    ).add(source_entry_key)
                moved_fingerprint_groups = {
                    artifact.source_group_key
                    for artifact in manifest.artifacts
                    if (
                        _ordinal_independent_fingerprint(artifact.payload)
                        != _ordinal_independent_fingerprint(
                            source_rows[
                                active_bindings[
                                    artifact.source_entry_key
                                ]["word_entry_id"]
                            ]
                        )
                        and previous_fingerprints_by_group.get(
                            artifact.source_group_key,
                            {},
                        ).get(
                            _ordinal_independent_fingerprint(artifact.payload),
                            set(),
                        )
                        - {artifact.source_entry_key}
                    )
                }
                if changed_identity_groups:
                    raise RuntimeError(
                        "Source group identity changed for "
                        f"{len(changed_identity_groups)} source group(s); "
                        "prepare an approved group-atomic reconciliation plan"
                    )
                if moved_fingerprint_groups:
                    raise RuntimeError(
                        "Semantic fingerprints moved between ordinal source "
                        f"keys in {len(moved_fingerprint_groups)} source "
                        "group(s); prepare an approved group-atomic "
                        "reconciliation plan"
                    )
            elif reconciliation_plan is not None:
                raise RuntimeError(
                    "Reconciliation plan supplied for an empty dictionary"
                )

            cursor.execute(
                """
                insert into private.dictionary_import_runs (
                    dictionary_id,
                    identity_scheme_version,
                    artifact_format_version,
                    manifest_checksum,
                    input_checksum,
                    source_record_count,
                    artifact_count,
                    status,
                    actor,
                    reason
                )
                values (%s,%s,%s,%s,%s,%s,%s,'running',%s,%s)
                returning id::text
                """,
                (
                    dictionary_id,
                    manifest.identity_scheme_version,
                    manifest.artifact_format_version,
                    manifest.manifest_sha256,
                    manifest.input_sha256,
                    manifest.source_record_count,
                    len(manifest.artifacts),
                    actor,
                    reason,
                ),
            )
            run_id = cursor.fetchone()[0]
            stats.run_id = run_id

            updates = []
            inserts = []
            resolved = []
            for artifact in manifest.artifacts:
                if plan is not None:
                    decision = plan.decisions[artifact.source_entry_key]
                    if decision.action == "bind-existing":
                        word_entry_id = decision.word_entry_id
                        stats.matched += 1
                        if (
                            stored_raw_fingerprint(
                                source_rows[word_entry_id]
                            )
                            != stored_raw_fingerprint(artifact.payload)
                        ):
                            stats.changed += 1
                        target = updates
                    else:
                        word_entry_id = str(uuid4())
                        stats.inserted += 1
                        target = inserts
                    decision_payload = {
                        "action": decision.action,
                        "method": decision.method,
                        "reason": decision.reason,
                    }
                elif active_bindings:
                    binding = active_bindings[artifact.source_entry_key]
                    word_entry_id = binding["word_entry_id"]
                    stats.matched += 1
                    if (
                        stored_raw_fingerprint(source_rows[word_entry_id])
                        != stored_raw_fingerprint(artifact.payload)
                    ):
                        stats.changed += 1
                    target = updates
                    decision_payload = {
                        "action": "bind-existing",
                        "method": "existing-source-binding",
                        "reason": "Resolved through active versioned binding.",
                    }
                else:
                    word_entry_id = str(uuid4())
                    stats.inserted += 1
                    target = inserts
                    decision_payload = {
                        "action": "insert-new",
                        "method": "empty-dictionary-initial-import",
                        "reason": "Target dictionary contained no source rows.",
                    }

                row = _artifact_row(
                    artifact,
                    word_entry_id=word_entry_id,
                    dictionary_id=dictionary_id,
                    language_code=language_code,
                )
                target.append(row)
                resolved.append(
                    (artifact, row, decision_payload)
                )

            _bulk_update_entries(cursor, updates)
            _bulk_insert_entries(cursor, inserts)

            psycopg2.extras.execute_values(
                cursor,
                """
                insert into private.source_entry_bindings (
                    dictionary_id,
                    identity_scheme_version,
                    source_entry_key,
                    source_group_key,
                    sense_ordinal,
                    word_entry_id,
                    binding_state,
                    first_seen_run_id,
                    last_seen_run_id,
                    manifest_checksum,
                    content_fingerprint_version,
                    content_fingerprint,
                    identity_evidence,
                    reconciliation_decision
                )
                values %s
                on conflict (
                    dictionary_id,
                    identity_scheme_version,
                    source_entry_key
                )
                do update set
                    source_group_key = excluded.source_group_key,
                    sense_ordinal = excluded.sense_ordinal,
                    word_entry_id = excluded.word_entry_id,
                    binding_state = 'active',
                    last_seen_run_id = excluded.last_seen_run_id,
                    manifest_checksum = excluded.manifest_checksum,
                    content_fingerprint_version =
                        excluded.content_fingerprint_version,
                    content_fingerprint = excluded.content_fingerprint,
                    identity_evidence = excluded.identity_evidence,
                    reconciliation_decision =
                        excluded.reconciliation_decision,
                    updated_at = now()
                """,
                [
                    (
                        dictionary_id,
                        artifact.identity_scheme_version,
                        artifact.source_entry_key,
                        artifact.source_group_key,
                        artifact.sense_ordinal,
                        row["id"],
                        "active",
                        run_id,
                        run_id,
                        manifest.manifest_sha256,
                        artifact.fingerprint_version,
                        artifact.content_fingerprint,
                        psycopg2.extras.Json(
                            artifact.payload["_source"].get(
                                "identity_evidence",
                                {},
                            )
                            | {
                                "source_index": artifact.source_index,
                                "pos_evidence": artifact.payload[
                                    "_source"
                                ].get("pos_evidence", {}),
                            }
                        ),
                        psycopg2.extras.Json(decision_payload),
                    )
                    for artifact, row, decision_payload in resolved
                ],
                page_size=500,
            )

            psycopg2.extras.execute_values(
                cursor,
                """
                select private.reconcile_platform_v2_content_nodes(
                    source.entry_id::uuid,
                    source.source_revision,
                    source.nodes::jsonb
                )
                from (values %s) as source (
                    entry_id,
                    source_revision,
                    nodes
                )
                """,
                [
                    (
                        row["id"],
                        manifest.manifest_sha256,
                        psycopg2.extras.Json(
                            platform_v2_content_node_inputs(
                                artifact.payload
                            )
                        ),
                    )
                    for artifact, row, _ in resolved
                ],
                page_size=500,
            )

            nt2_rows = [
                (list_id, row["id"], artifact.source_index)
                for artifact, row, _ in resolved
                if row["is_nt2_2000"]
            ]
            nt2_word_ids = [word_id for _, word_id, _ in nt2_rows]
            cursor.execute(
                """
                select item.word_id::text
                from public.word_list_items as item
                join public.word_entries as entry
                  on entry.id = item.word_id
                where item.list_id = %s
                  and entry.dictionary_id = %s
                  and entry.management_kind = 'source'
                """,
                (list_id, dictionary_id),
            )
            existing_nt2_ids = {row[0] for row in cursor.fetchall()}
            expected_nt2_ids = set(nt2_word_ids)
            stats.nt2_skipped = len(existing_nt2_ids & expected_nt2_ids)
            stats.nt2_linked = len(expected_nt2_ids - existing_nt2_ids)
            cursor.execute(
                """
                delete from public.word_list_items as item
                using public.word_entries as entry
                where item.list_id = %s
                  and entry.id = item.word_id
                  and entry.dictionary_id = %s
                  and entry.management_kind = 'source'
                  and not (entry.id = any(%s::uuid[]))
                """,
                (list_id, dictionary_id, nt2_word_ids),
            )
            if nt2_rows:
                psycopg2.extras.execute_values(
                    cursor,
                    """
                    insert into public.word_list_items (
                        list_id,
                        word_id,
                        rank
                    )
                    values %s
                    on conflict (list_id, word_id) do update
                    set rank = excluded.rank
                    """,
                    nt2_rows,
                    page_size=500,
                )

            if refresh_search_documents:
                refresh_dictionary_search_documents(
                    cursor,
                    [row["id"] for _, row, _ in resolved],
                )

            stats.processed = len(manifest.artifacts)
            cursor.execute(
                """
                update private.dictionary_import_runs
                set status = 'completed',
                    counts = %s,
                    finished_at = now()
                where id = %s
                """,
                (
                    psycopg2.extras.Json(
                        {
                            "matched": stats.matched,
                            "new": stats.inserted,
                            "changed": stats.changed,
                            "retired": stats.retired,
                            "ambiguous": stats.ambiguous,
                            "rejected": stats.rejected,
                        }
                    ),
                    run_id,
                ),
            )

    return stats
