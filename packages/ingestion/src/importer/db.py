from __future__ import annotations

from typing import Dict, Iterable, Optional, Set, Tuple

import psycopg2.extras
from psycopg2.extensions import cursor as Cursor

from importer.dictionary_entry_parser import ParsedEntry


def ensure_language(cursor: Cursor, code: str, name: str) -> None:
    cursor.execute(
        """
        insert into languages (code, name)
        values (%s, %s)
        on conflict (code) do update
        set name = excluded.name
        """,
        (code, name),
    )


def ensure_word_list(
    cursor: Cursor,
    language_code: str,
    slug: str,
    name: str,
    description: Optional[str],
    is_primary: bool,
) -> str:
    cursor.execute(
        """
        insert into word_lists (language_code, primary_language_code, slug, name, description, is_primary)
        values (%s, %s, %s, %s, %s, %s)
        on conflict (language_code, slug) do update
        set name = excluded.name,
            description = coalesce(excluded.description, word_lists.description),
            is_primary = word_lists.is_primary or excluded.is_primary,
            primary_language_code = coalesce(word_lists.primary_language_code, excluded.primary_language_code)
        returning id
        """,
        (language_code, language_code, slug, name, description, is_primary),
    )
    return cursor.fetchone()[0]


def ensure_dictionary(
    cursor: Cursor,
    language_code: str,
    slug: str,
    name: str,
    description: Optional[str],
    schema_key: str,
    schema_version: int,
) -> str:
    cursor.execute(
        """
        insert into dictionaries (
            language_code, slug, name, description, kind, visibility, is_editable,
            minimum_subscription_tier, schema_key, schema_version, source_provider
        )
        values (%s, %s, %s, %s, 'curated', 'system', false, 'free', %s, %s, 'vandale')
        on conflict (language_code, slug) do update
        set name = excluded.name,
            description = coalesce(excluded.description, dictionaries.description),
            schema_key = excluded.schema_key,
            schema_version = excluded.schema_version,
            updated_at = now()
        returning id
        """,
        (language_code, slug, name, description, schema_key, schema_version),
    )
    return cursor.fetchone()[0]


def load_existing_entries(
    cursor: Cursor, language_code: str, dictionary_id: str
) -> Dict[tuple[str, int], str]:
    cursor.execute(
        """
        select id, headword, meaning_id
        from word_entries
        where language_code = %s
          and dictionary_id = %s
        """,
        (language_code, dictionary_id),
    )
    return {(row[1], int(row[2])): row[0] for row in cursor.fetchall()}


def load_list_state(
    cursor: Cursor, list_id: str
) -> Tuple[Set[str], int]:
    cursor.execute(
        "select word_id, rank from word_list_items where list_id = %s", (list_id,)
    )
    word_ids: Set[str] = set()
    max_rank = 0
    for word_id, rank in cursor.fetchall():
        word_ids.add(word_id)
        if isinstance(rank, int) and rank > max_rank:
            max_rank = rank
    return word_ids, max_rank


def upsert_word_entry(
    cursor: Cursor,
    language_code: str,
    dictionary_id: str,
    entry: ParsedEntry,
    cache: Dict[tuple[str, int], str],
) -> Tuple[str, bool]:
    """
    Inserts or updates a word entry, returning the row id and whether it was inserted.
    """
    cache_key = (entry.headword, entry.meaning_id)
    if cache_key in cache:
        word_id = cache[cache_key]
        cursor.execute(
            """
            update word_entries
            set part_of_speech = %s,
                gender = %s,
                is_nt2_2000 = %s,
                vandale_id = %s,
                raw = %s,
                meaning_id = %s,
                dictionary_id = %s
            where id = %s
            """,
            (
                entry.part_of_speech,
                entry.gender,
                entry.is_nt2_2000,
                entry.vandale_id,
                psycopg2.extras.Json(entry.raw),
                entry.meaning_id,
                dictionary_id,
                word_id,
            ),
        )
        return word_id, False

    cursor.execute(
        """
        insert into word_entries (
            dictionary_id, language_code, headword, meaning_id, part_of_speech, gender,
            is_nt2_2000, vandale_id, raw
        )
        values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        returning id
        """,
        (
            dictionary_id,
            language_code,
            entry.headword,
            entry.meaning_id,
            entry.part_of_speech,
            entry.gender,
            entry.is_nt2_2000,
            entry.vandale_id,
            psycopg2.extras.Json(entry.raw),
        ),
    )
    word_id = cursor.fetchone()[0]
    cache[cache_key] = word_id
    return word_id, True


def refresh_dictionary_search_documents(
    cursor: Cursor,
    word_ids: Iterable[str],
    extraction_version: int = 2,
    chunk_size: int = 500,
) -> int:
    """
    Refresh extracted search documents when the target database supports them.

    Older/local databases may not have the search-document migration yet, so the
    importer treats the refresh hook as optional and keeps entry import working.
    """
    ids = sorted({str(word_id) for word_id in word_ids if word_id})
    if not ids:
        return 0

    cursor.execute(
        "select to_regprocedure('public.refresh_dictionary_search_document(uuid,int)')"
    )
    if cursor.fetchone()[0] is None:
        return 0

    refreshed = 0
    chunk_size = max(1, chunk_size)
    for start in range(0, len(ids), chunk_size):
        chunk = ids[start : start + chunk_size]
        cursor.execute(
            """
            select count(*)
            from unnest(%s::uuid[]) as entry_ids(entry_id)
            cross join lateral refresh_dictionary_search_document(entry_ids.entry_id, %s)
            """,
            (chunk, extraction_version),
        )
        refreshed += int(cursor.fetchone()[0] or 0)

    return refreshed
