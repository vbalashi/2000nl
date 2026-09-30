from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import sys
import time
from urllib.parse import urlparse
from uuid import uuid4

import psycopg2
import pytest


INGESTION_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(INGESTION_ROOT / "src"))

from importer.core import import_entries  # noqa: E402
from importer import source_import as source_import_module  # noqa: E402


TEST_DATABASE_URL = os.environ.get("INGESTION_TEST_DATABASE_URL")


def _require_local_test_database() -> str:
    if not TEST_DATABASE_URL:
        pytest.skip("INGESTION_TEST_DATABASE_URL is not configured")
    parsed = urlparse(TEST_DATABASE_URL)
    if parsed.hostname not in {"127.0.0.1", "localhost"}:
        pytest.fail(
            "INGESTION_TEST_DATABASE_URL must target a local disposable database"
        )
    return TEST_DATABASE_URL


def _write_manifest(
    root: Path,
    *,
    first_definition: str = "een zitmeubel",
    first_is_nt2: bool = True,
    second_source_index: int = 2,
    swap_group_senses: bool = False,
    rich_content: bool = False,
) -> None:
    root.mkdir(parents=True, exist_ok=True)
    artifacts = [
        {
            "filename": "000001_a1_bank_zn_1.json",
            "payload": {
                "headword": "bank",
                "part_of_speech": "zn",
                "is_nt2_2000": first_is_nt2,
                "meaning_id": 1,
                "meanings": [{"definition": first_definition}],
                "_source": {
                    "identity_scheme_version": "test-provider-v1",
                    "identity_evidence": {},
                    "provider_article_id": "a1",
                    "normalized_pos_status": "known",
                    "pos_evidence": {
                        "normalized_pos_status": "known",
                        "source": "test",
                        "raw_value": "zn",
                    },
                    "source_group_key": "test:article:a1",
                    "source_entry_key": "test:article:a1:1",
                    "source_index": 1,
                    "sense_ordinal": 1,
                },
            },
        },
        {
            "filename": "000002_a2_bank_zn_1.json",
            "payload": {
                "headword": "bank",
                "part_of_speech": "zn",
                "is_nt2_2000": True,
                "meaning_id": 1,
                "meanings": [{"definition": "een financiële instelling"}],
                "_source": {
                    "identity_scheme_version": "test-provider-v1",
                    "identity_evidence": {},
                    "provider_article_id": "a2",
                    "normalized_pos_status": "known",
                    "pos_evidence": {
                        "normalized_pos_status": "known",
                        "source": "test",
                        "raw_value": "zn",
                    },
                    "source_group_key": "test:article:a2",
                    "source_entry_key": "test:article:a2:1",
                    "source_index": second_source_index,
                    "sense_ordinal": 1,
                },
            },
        },
        {
            "filename": "000003_a3_stam_zn_1.json",
            "payload": {
                "headword": "stam",
                "part_of_speech": "zn",
                "meaning_id": 1,
                "meanings": [
                    {
                        "definition": (
                            "tweede betekenis"
                            if swap_group_senses
                            else "eerste betekenis"
                        )
                    }
                ],
                "_source": {
                    "identity_scheme_version": "test-provider-v1",
                    "identity_evidence": {},
                    "provider_article_id": "a3",
                    "normalized_pos_status": "known",
                    "pos_evidence": {
                        "normalized_pos_status": "known",
                        "source": "test",
                        "raw_value": "zn",
                    },
                    "source_group_key": "test:article:a3",
                    "source_entry_key": "test:article:a3:1",
                    "source_index": 3,
                    "sense_ordinal": 1,
                },
            },
        },
        {
            "filename": "000004_a3_stam_zn_2.json",
            "payload": {
                "headword": "stam",
                "part_of_speech": "zn",
                "meaning_id": 2,
                "meanings": [
                    {
                        "definition": (
                            "eerste betekenis"
                            if swap_group_senses
                            else "tweede betekenis"
                        )
                    }
                ],
                "_source": {
                    "identity_scheme_version": "test-provider-v1",
                    "identity_evidence": {},
                    "provider_article_id": "a3",
                    "normalized_pos_status": "known",
                    "pos_evidence": {
                        "normalized_pos_status": "known",
                        "source": "test",
                        "raw_value": "zn",
                    },
                    "source_group_key": "test:article:a3",
                    "source_entry_key": "test:article:a3:2",
                    "source_index": 3,
                    "sense_ordinal": 2,
                },
            },
        },
    ]

    if rich_content:
        artifacts[0]["payload"]["meanings"][0].update({
            "context": "op de bank",
            "examples": ["ik zit op de bank", "ik zit op de bank"],
            "idioms": [{"expression": "op de bank zitten",
                        "explanation": "niet meedoen",
                        "examples": ["hij zit op de bank"]}],
            "note": "een gebruiksnotitie",
        })
    records = []
    for artifact in artifacts:
        path = root / artifact["filename"]
        path.write_text(
            json.dumps(
                [artifact["payload"]],
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
        source = artifact["payload"]["_source"]
        records.append(
            {
                "artifact_path": artifact["filename"],
                "content_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
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
    (root / "_manifest.summary.json").write_text(
        json.dumps(
            {
                "artifact_count": len(records),
                "artifact_format_version": "vandale-structured-v2",
                "identity_scheme_version": "test-provider-v1",
                "input_sha256": "a" * 64,
                "manifest_sha256": hashlib.sha256(
                    manifest_path.read_bytes()
                ).hexdigest(),
                "source_record_count": len(records),
            }
        ),
        encoding="utf-8",
    )


def _write_scale_manifest(
    root: Path,
    *,
    group_count: int = 200,
    definition_suffix: str = "",
) -> None:
    root.mkdir(parents=True, exist_ok=True)
    records = []
    source_index = 0
    for group_number in range(group_count):
        for sense_ordinal in range(1, 4):
            source_index += 1
            source_group_key = f"scale:article:{group_number}"
            source_entry_key = f"{source_group_key}:{sense_ordinal}"
            filename = f"{source_index:06d}_scale_{group_number}_{sense_ordinal}.json"
            payload = {
                "headword": f"schaal-{group_number}",
                "part_of_speech": "zn",
                "meaning_id": sense_ordinal,
                "meanings": [
                    {
                        "definition": (
                            f"betekenis {sense_ordinal} van {group_number}"
                            f"{definition_suffix}"
                        )
                    }
                ],
                "_source": {
                    "identity_scheme_version": "scale-provider-v1",
                    "identity_evidence": {},
                    "provider_article_id": str(group_number),
                    "normalized_pos_status": "known",
                    "pos_evidence": {
                        "normalized_pos_status": "known",
                        "source": "scale-test",
                        "raw_value": "zn",
                    },
                    "source_group_key": source_group_key,
                    "source_entry_key": source_entry_key,
                    "source_index": source_index,
                    "sense_ordinal": sense_ordinal,
                },
            }
            path = root / filename
            path.write_text(
                json.dumps([payload], ensure_ascii=False, separators=(",", ":")),
                encoding="utf-8",
            )
            records.append(
                {
                    "artifact_path": filename,
                    "content_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                    "identity_scheme_version": "scale-provider-v1",
                    "source_entry_key": source_entry_key,
                    "source_group_key": source_group_key,
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
    (root / "_manifest.summary.json").write_text(
        json.dumps(
            {
                "artifact_count": len(records),
                "artifact_format_version": "vandale-structured-v2",
                "identity_scheme_version": "scale-provider-v1",
                "input_sha256": "b" * 64,
                "manifest_sha256": hashlib.sha256(
                    manifest_path.read_bytes()
                ).hexdigest(),
                "source_record_count": len(records),
            }
        ),
        encoding="utf-8",
    )


def test_source_import_batches_projection_refresh_at_scale(tmp_path: Path) -> None:
    database_url = _require_local_test_database()
    suffix = uuid4().hex
    dictionary_slug = f"pytest-scale-{suffix}"
    list_slug = f"pytest-scale-list-{suffix}"
    _write_scale_manifest(tmp_path)

    started = time.monotonic()
    imported = import_entries(
        data_dir=tmp_path,
        database_url=database_url,
        dictionary_slug=dictionary_slug,
        dictionary_name="Pytest scale dictionary",
        nt2_slug=list_slug,
        nt2_name="Pytest scale list",
        refresh_search_documents=False,
    )
    elapsed = time.monotonic() - started

    assert imported.processed == 600
    assert imported.stage_metrics["fresh_entries"] == 600
    assert imported.stage_metrics["reconciled_entries"] == 0
    assert imported.stage_metrics["refreshed_entries"] == 600
    assert elapsed < 10, f"600-entry source import took {elapsed:.2f}s"

    def snapshot() -> tuple[list[tuple], list[tuple], list[str]]:
        with psycopg2.connect(database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select binding.source_entry_key, binding.word_entry_id::text
                    from private.source_entry_bindings AS binding
                    join public.dictionaries AS dictionary
                      on dictionary.id = binding.dictionary_id
                    where dictionary.slug = %s
                    order by binding.source_entry_key
                    """,
                    (dictionary_slug,),
                )
                bindings = cursor.fetchall()
                cursor.execute(
                    """
                    select binding.source_entry_key, node.id::text
                    from private.source_entry_bindings AS binding
                    join public.dictionaries AS dictionary
                      on dictionary.id = binding.dictionary_id
                    join private.platform_v2_content_nodes AS node
                      on node.entry_id = binding.word_entry_id
                     and node.binding_state = 'active'
                    where dictionary.slug = %s
                    order by binding.source_entry_key, node.id
                    """,
                    (dictionary_slug,),
                )
                nodes = cursor.fetchall()
                cursor.execute(
                    """
                    select binding.source_entry_key
                    from private.unrenderable_ordinary_direct_entries_v1 AS projection
                    join private.source_entry_bindings AS binding
                      on binding.word_entry_id = projection.entry_id
                    join public.dictionaries AS dictionary
                      on dictionary.id = binding.dictionary_id
                    where dictionary.slug = %s
                    order by binding.source_entry_key
                    """,
                    (dictionary_slug,),
                )
                projection = [row[0] for row in cursor.fetchall()]
                return bindings, nodes, projection

    first_snapshot = snapshot()
    assert len(first_snapshot[0]) == 600
    assert len(first_snapshot[1]) == 600
    assert len(first_snapshot[2]) == 400

    replay_started = time.monotonic()
    replay = import_entries(
        data_dir=tmp_path,
        database_url=database_url,
        dictionary_slug=dictionary_slug,
        dictionary_name="Pytest scale dictionary",
        nt2_slug=list_slug,
        nt2_name="Pytest scale list",
        refresh_search_documents=False,
    )
    replay_elapsed = time.monotonic() - replay_started
    assert replay.no_op is True
    assert replay_elapsed < 2, f"600-entry no-op replay took {replay_elapsed:.2f}s"
    assert snapshot() == first_snapshot

    _write_scale_manifest(tmp_path, definition_suffix=" gewijzigd")
    changed_started = time.monotonic()
    changed = import_entries(
        data_dir=tmp_path,
        database_url=database_url,
        dictionary_slug=dictionary_slug,
        dictionary_name="Pytest scale dictionary",
        nt2_slug=list_slug,
        nt2_name="Pytest scale list",
        refresh_search_documents=False,
    )
    changed_elapsed = time.monotonic() - changed_started
    assert changed.changed == 600
    assert changed.stage_metrics["fresh_entries"] == 0
    assert changed.stage_metrics["reconciled_entries"] == 600
    assert changed_elapsed < 10, (
        f"600-entry changed replay took {changed_elapsed:.2f}s"
    )
    changed_snapshot = snapshot()
    assert changed_snapshot[0] == first_snapshot[0]
    assert len(changed_snapshot[1]) == 600
    assert changed_snapshot[1] != first_snapshot[1]
    assert changed_snapshot[2] == first_snapshot[2]

    with psycopg2.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select count(*)
                from private.unrenderable_ordinary_direct_entries_v1 AS projection
                join public.word_entries AS entry
                  on entry.id = projection.entry_id
                join public.dictionaries AS dictionary
                  on dictionary.id = entry.dictionary_id
                where dictionary.slug = %s
                """,
                (dictionary_slug,),
            )
            assert cursor.fetchone()[0] == 400


def test_staged_fresh_import_matches_ordinary_reconciliation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url = _require_local_test_database()
    _write_manifest(tmp_path, rich_content=True)
    suffix = uuid4().hex

    def run_import(slug: str):
        return import_entries(
            data_dir=tmp_path, database_url=database_url,
            dictionary_slug=slug, dictionary_name="Parity dictionary",
            nt2_slug=slug + "-list", nt2_name="Parity list",
        )

    def snapshot(slug: str) -> list[tuple]:
        with psycopg2.connect(database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT binding.source_entry_key, entry.raw,
                           node.kind, node.source_native_key,
                           node.source_text_fingerprint, node.diagnostic_locator,
                           parent.diagnostic_locator,
                           node.canonical_source_text, node.source_order,
                           node.identity_evidence, node.reconciliation_decision,
                           EXISTS (SELECT 1
                             FROM private.unrenderable_ordinary_direct_entries_v1 projection
                             WHERE projection.entry_id = entry.id),
                           (SELECT jsonb_agg(jsonb_build_array(atom.atom_order,
                                    atom.role, atom.source_text) ORDER BY atom.atom_order)
                            FROM private.platform_v2_report_atom_source(entry.id) atom)
                    FROM public.dictionaries dictionary
                    JOIN private.source_entry_bindings binding
                      ON binding.dictionary_id = dictionary.id
                    JOIN public.word_entries entry ON entry.id = binding.word_entry_id
                    JOIN private.platform_v2_content_nodes node ON node.entry_id = entry.id
                    LEFT JOIN private.platform_v2_content_nodes parent
                      ON parent.id = node.parent_content_node_id
                    WHERE dictionary.slug = %s AND node.binding_state = 'active'
                    ORDER BY binding.source_entry_key, node.source_order
                """, (slug,))
                return cursor.fetchall()

    staged_slug = "pytest-staged-parity-" + suffix
    ordinary_slug = "pytest-ordinary-parity-" + suffix
    run_import(staged_slug)

    def ordinary_content(cursor, rows: list[dict]) -> dict:
        # No import marker: each ordinary write executes established triggers.
        for row in rows:
            cursor.execute("""
                INSERT INTO private.source_entry_bindings (
                  dictionary_id, identity_scheme_version, source_entry_key,
                  source_group_key, sense_ordinal, word_entry_id, binding_state,
                  first_seen_run_id, last_seen_run_id, manifest_checksum,
                  content_fingerprint_version, content_fingerprint,
                  identity_evidence, reconciliation_decision
                ) VALUES (%(dictionary_id)s, %(identity_scheme_version)s,
                  %(source_entry_key)s, %(source_group_key)s, %(sense_ordinal)s,
                  %(word_entry_id)s, 'active', %(run_id)s, %(run_id)s,
                  %(manifest_checksum)s, %(content_fingerprint_version)s,
                  %(content_fingerprint)s, %(identity_evidence)s,
                  %(reconciliation_decision)s)
            """, {key: psycopg2.extras.Json(value) if isinstance(value, dict)
                  else value for key, value in row.items()})
            cursor.execute(
                "select private.reconcile_platform_v2_content_nodes(%s,%s,%s)",
                (row["word_entry_id"], row["manifest_checksum"],
                 psycopg2.extras.Json(row["nodes"])),
            )
        return {}

    monkeypatch.setattr(source_import_module, "apply_staged_content", ordinary_content)
    run_import(ordinary_slug)
    assert snapshot(staged_slug) == snapshot(ordinary_slug)


def test_staged_update_reconciles_only_changed_word(tmp_path: Path) -> None:
    database_url = _require_local_test_database()
    slug = "pytest-staged-diff-" + uuid4().hex
    def run_import():
        return import_entries(data_dir=tmp_path, database_url=database_url,
                              dictionary_slug=slug, dictionary_name="Diff test",
                              nt2_slug=slug + "-list", nt2_name="Diff list")
    def node_ids():
        with psycopg2.connect(database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT binding.source_entry_key, node.id::text
                    FROM private.source_entry_bindings binding
                    JOIN public.dictionaries dictionary ON dictionary.id = binding.dictionary_id
                    JOIN private.platform_v2_content_nodes node ON node.entry_id = binding.word_entry_id
                    WHERE dictionary.slug = %s AND node.binding_state = 'active'
                    ORDER BY binding.source_entry_key, node.id
                """, (slug,))
                return dict(cursor.fetchall())
    _write_manifest(tmp_path)
    run_import()
    before = node_ids()
    _write_manifest(tmp_path, first_definition="een nieuw zitmeubel")
    stats = run_import()
    after = node_ids()
    assert stats.changed == 1
    assert stats.stage_metrics["fresh_entries"] == 0
    assert stats.stage_metrics["reconciled_entries"] == 1
    assert stats.stage_metrics["word_rows_written"] == 1
    assert stats.stage_metrics["refreshed_entries"] == 1
    assert before["test:article:a1:1"] != after["test:article:a1:1"]
    assert {key: value for key, value in before.items() if key != "test:article:a1:1"} == {
        key: value for key, value in after.items() if key != "test:article:a1:1"
    }


def test_source_batch_failure_rolls_back_bindings_nodes_and_projection(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url = _require_local_test_database()
    suffix = uuid4().hex
    dictionary_slug = f"pytest-batch-rollback-{suffix}"
    list_slug = f"pytest-batch-rollback-list-{suffix}"
    _write_manifest(tmp_path)

    import_entries(
        data_dir=tmp_path,
        database_url=database_url,
        dictionary_slug=dictionary_slug,
        dictionary_name="Pytest rollback dictionary",
        nt2_slug=list_slug,
        nt2_name="Pytest rollback list",
        refresh_search_documents=False,
    )

    def database_snapshot() -> tuple[list[tuple], list[tuple], list[str]]:
        with psycopg2.connect(database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    select binding.source_entry_key,
                           binding.word_entry_id::text,
                           binding.content_fingerprint
                    from private.source_entry_bindings AS binding
                    join public.dictionaries AS dictionary
                      on dictionary.id = binding.dictionary_id
                    where dictionary.slug = %s
                    order by binding.source_entry_key
                    """,
                    (dictionary_slug,),
                )
                bindings = cursor.fetchall()
                cursor.execute(
                    """
                    select node.id::text,
                           node.source_text_fingerprint,
                           node.binding_state
                    from private.platform_v2_content_nodes AS node
                    join public.word_entries AS entry on entry.id = node.entry_id
                    join public.dictionaries AS dictionary
                      on dictionary.id = entry.dictionary_id
                    where dictionary.slug = %s
                    order by node.id
                    """,
                    (dictionary_slug,),
                )
                nodes = cursor.fetchall()
                cursor.execute(
                    """
                    select projection.entry_id::text
                    from private.unrenderable_ordinary_direct_entries_v1 AS projection
                    join public.word_entries AS entry
                      on entry.id = projection.entry_id
                    join public.dictionaries AS dictionary
                      on dictionary.id = entry.dictionary_id
                    where dictionary.slug = %s
                    order by projection.entry_id
                    """,
                    (dictionary_slug,),
                )
                projection = [row[0] for row in cursor.fetchall()]
                return bindings, nodes, projection

    before_failure = database_snapshot()
    _write_manifest(tmp_path, first_definition="changed before injected failure")

    original = source_import_module.platform_v2_content_node_inputs
    calls = 0

    def invalid_second_nodes(payload: dict) -> list[dict]:
        nonlocal calls
        calls += 1
        if calls == 2:
            return [
                {
                    "inputKey": "invalid-kind",
                    "kind": "not-a-content-kind",
                    "sourcePath": "raw.meanings[0].definition",
                    "sourceTextFingerprint": "invalid",
                }
            ]
        return original(payload)

    monkeypatch.setattr(
        source_import_module,
        "platform_v2_content_node_inputs",
        invalid_second_nodes,
    )

    with pytest.raises(psycopg2.Error, match="platform_v2_invalid_content_node"):
        import_entries(
            data_dir=tmp_path,
            database_url=database_url,
            dictionary_slug=dictionary_slug,
            dictionary_name="Pytest rollback dictionary",
            nt2_slug=list_slug,
            nt2_name="Pytest rollback list",
            refresh_search_documents=False,
        )

    with psycopg2.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "select count(*) from public.dictionaries where slug = %s",
                (dictionary_slug,),
            )
            assert cursor.fetchone()[0] == 1
    assert database_snapshot() == before_failure


def test_versioned_source_import_is_stable_and_fails_closed_on_drift(
    tmp_path: Path,
) -> None:
    database_url = _require_local_test_database()
    suffix = uuid4().hex
    dictionary_slug = f"pytest-source-{suffix}"
    list_slug = f"pytest-list-{suffix}"
    _write_manifest(tmp_path)

    first = import_entries(
        data_dir=tmp_path,
        database_url=database_url,
        dictionary_slug=dictionary_slug,
        dictionary_name="Pytest source dictionary",
        nt2_slug=list_slug,
        nt2_name="Pytest source list",
    )
    assert first.inserted == 4
    assert first.processed == 4

    replay = import_entries(
        data_dir=tmp_path,
        database_url=database_url,
        dictionary_slug=dictionary_slug,
        dictionary_name="Pytest source dictionary",
        nt2_slug=list_slug,
        nt2_name="Pytest source list",
    )
    assert replay.no_op is True
    assert replay.matched == 4

    with psycopg2.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                delete from private.platform_v2_content_nodes
                where id = (
                    select node.id
                    from private.platform_v2_content_nodes as node
                    join public.word_entries as entry
                      on entry.id = node.entry_id
                    join public.dictionaries as dictionary
                      on dictionary.id = entry.dictionary_id
                    where dictionary.slug = %s
                      and node.binding_state = 'active'
                    limit 1
                )
                """,
                (dictionary_slug,),
            )
            assert cursor.rowcount == 1

    repaired = import_entries(
        data_dir=tmp_path,
        database_url=database_url,
        dictionary_slug=dictionary_slug,
        dictionary_name="Pytest source dictionary",
        nt2_slug=list_slug,
        nt2_name="Pytest source list",
    )
    assert repaired.no_op is False
    assert repaired.matched == 4
    verified = import_entries(
        data_dir=tmp_path,
        database_url=database_url,
        dictionary_slug=dictionary_slug,
        dictionary_name="Pytest source dictionary",
        nt2_slug=list_slug,
        nt2_name="Pytest source list",
    )
    assert verified.no_op is True
    assert verified.matched == 4

    with psycopg2.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select dictionary.id::text
                from public.dictionaries as dictionary
                where dictionary.slug = %s
                """,
                (dictionary_slug,),
            )
            dictionary_id = cursor.fetchone()[0]
            cursor.execute(
                """
                select count(*), count(distinct entry.id)
                from public.word_entries as entry
                where entry.dictionary_id = %s
                  and entry.headword = 'bank'
                  and entry.meaning_id = 1
                """,
                (dictionary_id,),
            )
            assert cursor.fetchone() == (2, 2)
            cursor.execute(
                """
                select source_entry_key, word_entry_id::text
                from private.source_entry_bindings
                where dictionary_id = %s
                  and binding_state = 'active'
                order by source_entry_key
                """,
                (dictionary_id,),
            )
            original_ids = dict(cursor.fetchall())
            assert len(original_ids) == 4
            cursor.execute(
                """
                select count(*)
                from private.platform_v2_content_nodes as node
                join public.word_entries as entry
                  on entry.id = node.entry_id
                where entry.dictionary_id = %s
                  and node.binding_state = 'active'
                """,
                (dictionary_id,),
            )
            assert cursor.fetchone()[0] == 4

    _write_manifest(
        tmp_path,
        first_definition="gewijzigde betekenis",
        first_is_nt2=False,
        second_source_index=22,
    )
    changed = import_entries(
        data_dir=tmp_path,
        database_url=database_url,
        dictionary_slug=dictionary_slug,
        dictionary_name="Pytest source dictionary",
        nt2_slug=list_slug,
        nt2_name="Pytest source list",
    )
    assert changed.changed == 2
    assert changed.matched == 4
    with psycopg2.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                select binding.source_entry_key, binding.word_entry_id::text
                from private.source_entry_bindings as binding
                where binding.dictionary_id = %s
                  and binding.binding_state = 'active'
                order by binding.source_entry_key
                """,
                (dictionary_id,),
            )
            assert dict(cursor.fetchall()) == original_ids
            cursor.execute(
                """
                select item.rank, entry.raw #>> '{meanings,0,definition}'
                from public.word_list_items as item
                join public.word_entries as entry on entry.id = item.word_id
                where item.list_id = (
                    select id from public.word_lists where slug = %s
                )
                  and entry.dictionary_id = %s
                order by item.rank
                """,
                (list_slug, dictionary_id),
            )
            assert cursor.fetchall() == [(22, "een financiële instelling")]

    _write_manifest(
        tmp_path,
        first_definition="gewijzigde betekenis",
        first_is_nt2=False,
        second_source_index=22,
        swap_group_senses=True,
    )
    with pytest.raises(RuntimeError, match="fingerprints moved"):
        import_entries(
            data_dir=tmp_path,
            database_url=database_url,
            dictionary_slug=dictionary_slug,
            dictionary_name="Pytest source dictionary",
            nt2_slug=list_slug,
            nt2_name="Pytest source list",
        )

    _write_manifest(
        tmp_path,
        first_definition="gewijzigde betekenis",
        first_is_nt2=False,
        second_source_index=22,
    )
    extra_entry_id = str(uuid4())
    with psycopg2.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                insert into public.word_entries (
                    id,
                    dictionary_id,
                    language_code,
                    headword,
                    meaning_id,
                    raw,
                    management_kind
                )
                values (
                    %s,
                    %s,
                    'nl',
                    'losse rij',
                    1,
                    '{"headword":"losse rij","meanings":[{"definition":"drift"}]}'::jsonb,
                    'source'
                )
                """,
                (extra_entry_id, dictionary_id),
            )
    with pytest.raises(RuntimeError, match="exact coverage"):
        import_entries(
            data_dir=tmp_path,
            database_url=database_url,
            dictionary_slug=dictionary_slug,
            dictionary_name="Pytest source dictionary",
            nt2_slug=list_slug,
            nt2_name="Pytest source list",
        )
    with psycopg2.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "delete from public.word_entries where id = %s",
                (extra_entry_id,),
            )

    with psycopg2.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                update public.word_entries
                set raw = jsonb_set(
                    raw,
                    '{meanings,0,definition}',
                    '"tampered outside importer"'::jsonb
                )
                where dictionary_id = (
                    select id
                    from public.dictionaries
                    where slug = %s
                )
                  and raw #>> '{meanings,0,definition}' = 'gewijzigde betekenis'
                """,
                (dictionary_slug,),
            )

    with pytest.raises(RuntimeError, match="stored source content drifted"):
        import_entries(
            data_dir=tmp_path,
            database_url=database_url,
            dictionary_slug=dictionary_slug,
            dictionary_name="Pytest source dictionary",
            nt2_slug=list_slug,
            nt2_name="Pytest source list",
        )


def test_source_import_keeps_report_atoms_verifiable_across_reimport(
    tmp_path: Path,
) -> None:
    database_url = _require_local_test_database()
    suffix = uuid4().hex
    dictionary_slug = f"pytest-report-atoms-{suffix}"
    list_slug = f"pytest-report-list-{suffix}"
    user_id = str(uuid4())
    first_definition = "e\u0301e\u0301n zitmeubel"
    changed_definition = "e\u0301e\u0301n gewijzigd zitmeubel"

    def run_import():
        return import_entries(
            data_dir=tmp_path,
            database_url=database_url,
            dictionary_slug=dictionary_slug,
            dictionary_name="Pytest report atom dictionary",
            nt2_slug=list_slug,
            nt2_name="Pytest report atom list",
        )

    def read_attestation() -> dict:
        with psycopg2.connect(database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    insert into auth.users (id, email)
                    values (%s, %s)
                    on conflict (id) do nothing
                    """,
                    (user_id, f"{user_id}@test.local"),
                )
                cursor.execute(
                    """
                    insert into public.user_settings (user_id)
                    values (%s)
                    on conflict (user_id) do nothing
                    """,
                    (user_id,),
                )
                cursor.execute(
                    """
                    select binding.word_entry_id::text
                    from private.source_entry_bindings as binding
                    join public.dictionaries as dictionary
                      on dictionary.id = binding.dictionary_id
                    where dictionary.slug = %s
                      and binding.source_entry_key = 'test:article:a1:1'
                      and binding.binding_state = 'active'
                    """,
                    (dictionary_slug,),
                )
                entry_id = cursor.fetchone()[0]
                cursor.execute(
                    "select set_config('request.jwt.claim.role', 'service_role', true)"
                )
                cursor.execute(
                    """
                    select public.read_platform_v2_report_atom_attestation(
                        %s::uuid,
                        %s::uuid
                    )
                    """,
                    (user_id, entry_id),
                )
                return cursor.fetchone()[0]

    _write_manifest(tmp_path, first_definition=first_definition)
    run_import()
    first = read_attestation()
    assert first["cardContent"]["atoms"][1]["text"] == "één zitmeubel"
    assert len(first["contentRevision"]) == 64

    with psycopg2.connect(database_url) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                update private.platform_v2_content_nodes as node
                set canonical_source_text = null
                from private.source_entry_bindings as binding
                join public.dictionaries as dictionary
                  on dictionary.id = binding.dictionary_id
                where node.entry_id = binding.word_entry_id
                  and dictionary.slug = %s
                  and binding.source_entry_key = 'test:article:a1:1'
                  and node.binding_state = 'active'
                """,
                (dictionary_slug,),
            )
            assert cursor.rowcount == 1

    repaired = run_import()
    assert repaired.no_op is False
    assert read_attestation() == first

    _write_manifest(tmp_path, first_definition=changed_definition)
    run_import()
    changed = read_attestation()
    assert changed["cardContent"]["atoms"][1]["text"] == (
        "één gewijzigd zitmeubel"
    )
    assert changed["contentRevision"] != first["contentRevision"]

    run_import()
    replayed = read_attestation()
    assert replayed == changed
