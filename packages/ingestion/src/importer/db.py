from __future__ import annotations

from typing import Iterable, Optional

from psycopg2.extensions import cursor as Cursor


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
