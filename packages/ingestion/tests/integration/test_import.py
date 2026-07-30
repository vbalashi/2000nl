from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import sys
from urllib.parse import urlparse
from uuid import uuid4

import psycopg2
import pytest


INGESTION_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(INGESTION_ROOT / "src"))

from importer.core import import_entries  # noqa: E402


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
